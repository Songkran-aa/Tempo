// Usage: node server/scripts/import-influencers.js <file.xlsx> <user-email> [workspace-name]
// Imports (or merges) an influencer spreadsheet into a workspace the user belongs to.
import fs from "node:fs";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { parseInfluencerWorkbook } from "../lib/influencer-xlsx.js";
import { importInfluencers } from "../routes/influencers.js";
import { touch } from "../lib/core.js";

const [file, email, wsName] = process.argv.slice(2);
if (!file || !email) {
  console.error("Usage: node server/scripts/import-influencers.js <file.xlsx> <user-email> [workspace-name]");
  process.exit(1);
}
await initDb();
await migrate(() => {});
const user = (await db.query("select id from users where email=$1", [email.toLowerCase()])).rows[0];
if (!user) { console.error(`No user with email ${email}`); process.exit(1); }
const ws = (await db.query(
  `select w.id, w.name from memberships m join workspaces w on w.id=m.workspace_id
   where m.user_id=$1 and ($2::text is null or w.name=$2) order by m.created_at limit 1`, [user.id, wsName || null])).rows[0];
if (!ws) { console.error("Workspace not found"); process.exit(1); }
const parsed = await parseInfluencerWorkbook(fs.readFileSync(file));
const res = await db.tx(async q => {
  const r = await importInfluencers(q, ws.id, user.id, parsed.rows);
  await touch(q, ws.id, user.id, "import", "influencers", null, `${parsed.rows.length} influencers`);
  return r;
});
console.log(`Imported into "${ws.name}": ${res.created} new, ${res.updated} updated, ${parsed.blacklistCount} blacklisted`);
console.table(parsed.sheets);
await db.close();
