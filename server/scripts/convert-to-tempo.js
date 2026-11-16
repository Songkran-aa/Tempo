// Converts existing source files into ONE Tempo workspace file (.xlsx) that can be imported in the app
// (Settings → Data → Import Tempo file) and exported back in the same format.
//
// Usage:
//   node server/scripts/convert-to-tempo.js --out <file.xlsx>
//        [--bundle projects.json]           projects + Brief/Positioning + milestones + readiness (+ tasks)
//        [--tracker Product_Tracker.csv]    tasks (product-tracker CSV layout)
//        [--influencers Influencer_Database_Master.xlsx]
//        [--name "Workspace name"]
//
// Works on an in-memory database, so nothing is written to your real data.
import fs from "node:fs";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { uuid } from "../lib/core.js";
import { importProjectBundle } from "../lib/project-import.js";
import { importTrackerRows, parseTrackerCsv } from "../lib/tracker-csv.js";
import { parseInfluencerWorkbook } from "../lib/influencer-xlsx.js";
import { importInfluencers } from "../routes/influencers.js";
import { buildWorkspaceWorkbook, exportWorkspace } from "../lib/workspace-xlsx.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
if (!args.out || !(args.bundle || args.tracker || args.influencers)) {
  console.error("Usage: node server/scripts/convert-to-tempo.js --out <file.xlsx> [--bundle x.json] [--tracker x.csv] [--influencers x.xlsx] [--name ws]");
  process.exit(1);
}
await initDb({ memory: true });
await migrate(() => {});
const uid = uuid(), wid = uuid();
await db.query("insert into users (id, email, name, pass_hash) values ($1, 'converter@local', 'Converter', 'x')", [uid]);
await db.query("insert into workspaces (id, name, created_by) values ($1, $2, $3)", [wid, args.name || "Tempo", uid]);
await db.query("insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')", [wid, uid]);

const log = [];
await db.tx(async q => {
  if (args.bundle) {
    const r = await importProjectBundle(q, wid, uid, JSON.parse(fs.readFileSync(args.bundle, "utf8")));
    log.push(`bundle: ${r.projects} projects, ${r.tasks} tasks`);
  }
  if (args.tracker) {
    const { rows } = parseTrackerCsv(fs.readFileSync(args.tracker, "utf8"));
    const r = await importTrackerRows(q, wid, uid, rows);
    log.push(`tracker: ${rows.length} rows (${r.created} new, ${r.updated} merged, ${r.projectsCreated} new projects)`);
    for (const w of r.warnings) log.push(`  ! line ${w.line}: ${w.code} ${w.value}`);
  }
  if (args.influencers) {
    const p = await parseInfluencerWorkbook(fs.readFileSync(args.influencers));
    const r = await importInfluencers(q, wid, uid, p.rows);
    log.push(`influencers: ${p.rows.length} (${p.blacklistCount} blacklisted) — ${r.created} new`);
  }
});
const data = await exportWorkspace(db, wid);
data.members = []; // the converter account must not end up in the file
fs.writeFileSync(args.out, Buffer.from(await buildWorkspaceWorkbook(data)));
console.log(log.join("\n"));
console.log(`\n→ ${args.out}: ${data.projects.length} projects, ${data.tasks.length} tasks, ${data.campaigns.length} campaigns, ${data.influencers.length} influencers, ${data.collaborations.length} collaborations`);
await db.close();
