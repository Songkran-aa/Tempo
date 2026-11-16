// Checks a Tempo workspace file: imports it into a temporary in-memory database, exports it again,
// and compares every sheet. Exit code 1 if anything differs.
//   node server/scripts/verify-workspace-file.js <file.xlsx> [more.xlsx …]
import fs from "node:fs";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { uuid } from "../lib/core.js";
import { buildWorkspaceWorkbook, exportWorkspace, importWorkspace, parseWorkspaceWorkbook } from "../lib/workspace-xlsx.js";

const files = process.argv.slice(2);
if (!files.length) { console.error("Usage: node server/scripts/verify-workspace-file.js <file.xlsx> …"); process.exit(1); }
await initDb({ memory: true });
await migrate(() => {});
const uid = uuid();
await db.query("insert into users (id, email, name, pass_hash) values ($1, 'verify@local', 'Verify', 'x')", [uid]);
let failed = false;
for (const file of files) {
  const wid = uuid();
  await db.query("insert into workspaces (id, name, created_by) values ($1, 'verify', $2)", [wid, uid]);
  await db.query("insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')", [wid, uid]);
  const p1 = await parseWorkspaceWorkbook(fs.readFileSync(file));
  const r = await db.tx(q => importWorkspace(q, wid, uid, p1));
  const again = await db.tx(q => importWorkspace(q, wid, uid, p1));
  const p2 = await parseWorkspaceWorkbook(Buffer.from(await buildWorkspaceWorkbook(await exportWorkspace(db, wid))));
  const norm = rows => rows.map(({ _row, key, project, campaign, ...rest }) => JSON.stringify(rest, (k, v) => (k === "id" ? undefined : v))).sort();
  const issues = [];
  for (const k of Object.keys(p1.sheets)) if (JSON.stringify(norm(p1.sheets[k])) !== JSON.stringify(norm(p2.sheets[k]))) issues.push(k);
  if (p1.influencers.length !== p2.influencers.length) issues.push("influencers(count)");
  for (const f of ["category", "contact", "address", "followers_max", "likes_total", "blacklist_reason", "pet_type", "tier", "type_source"])
    if (p1.influencers.filter(x => x[f] != null).length !== p2.influencers.filter(x => x[f] != null).length) issues.push(`influencers.${f}`);
  const created = Object.values(again.created).reduce((a, b) => a + b, 0);
  if (created) issues.push(`re-import created ${created}`);
  if (r.warnings.length) issues.push(`${r.warnings.length} warnings: ${JSON.stringify(r.warnings.slice(0, 3))}`);
  console.log(`${issues.length ? "✗" : "✓"} ${file}\n   ${Object.entries(p1.counts).map(([k, n]) => `${k} ${n}`).join(" · ")}${issues.length ? "\n   problems: " + issues.join(", ") : ""}`);
  if (issues.length) failed = true;
}
await db.close();
process.exit(failed ? 1 : 0);
