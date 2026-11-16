// Usage: node server/scripts/import-projects.js <bundle.json> <user-email> [workspace-name]
// Imports projects + tasks + milestones + readiness + brief from a JSON bundle (see server/test/fixtures/sample-bundle.json).
// Safe to run again: existing items are skipped, nothing is duplicated or overwritten.
import fs from "node:fs";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { importProjectBundle } from "../lib/project-import.js";

const [file, email, wsName] = process.argv.slice(2);
if (!file || !email) {
  console.error("Usage: node server/scripts/import-projects.js <bundle.json> <user-email> [workspace-name]");
  process.exit(1);
}
const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
await initDb();
await migrate(() => {});
const user = (await db.query("select id from users where email=$1", [email.toLowerCase()])).rows[0];
if (!user) { console.error(`No user with email ${email}`); process.exit(1); }
const ws = (await db.query(
  `select w.id, w.name from memberships m join workspaces w on w.id=m.workspace_id
   where m.user_id=$1 and m.role in ('owner','admin','editor') and ($2::text is null or w.name=$2) order by m.created_at limit 1`, [user.id, wsName || null])).rows[0];
if (!ws) { console.error("Workspace not found (or no edit rights)"); process.exit(1); }
const r = await db.tx(q => importProjectBundle(q, ws.id, user.id, bundle));
console.log(`Imported into "${ws.name}": ${r.projects} projects, ${r.tasks} tasks (${r.skipped} already there)`);
await db.close();
