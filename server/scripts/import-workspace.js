// Imports a Tempo workspace file (.xlsx) into an account.
//   node server/scripts/import-workspace.js <file.xlsx> <owner-email> [--name "Workspace name"] [--preview]
// The workspace is found by name among the owner's workspaces, or created (owner = that account).
// Without --name the file's workspace name (sheet "อ่านก่อน") is used. Safe to run again: rows are matched by key.
import fs from "node:fs";
import ExcelJS from "exceljs";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { importWorkspace, parseWorkspaceWorkbook } from "../lib/workspace-xlsx.js";
import { createWorkspace } from "../routes/auth.js";

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(`--${n}`); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
const preview = flag("preview");
let name = opt("name");
const [file, email] = args;
if (!file || !email) {
  console.error('Usage: node server/scripts/import-workspace.js <file.xlsx> <owner-email> [--name "Workspace name"] [--preview]');
  process.exit(1);
}
const buf = fs.readFileSync(file);
const parsed = await parseWorkspaceWorkbook(buf);
if (!parsed.format) { console.error("✗ not a Tempo workspace file"); process.exit(1); }
if (!name) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  wb.getWorksheet("อ่านก่อน")?.eachRow(r => { if (String(r.getCell(1).value).trim() === "พื้นที่ทำงาน") name = String(r.getCell(2).value || "").trim(); });
}
name ||= "Imported workspace";
console.log(`file: ${Object.entries(parsed.counts).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
if (preview) process.exit(0);

await initDb();
await migrate(() => {});
const user = (await db.query("select id, email from users where email=$1", [email.trim().toLowerCase()])).rows[0];
if (!user) { console.error(`✗ no account with email ${email} — create it first (create-user.js or sign up on the website)`); process.exit(1); }
const res = await db.tx(async q => {
  let ws = (await q.query(`select w.id from workspaces w join memberships m on m.workspace_id=w.id
    where m.user_id=$1 and m.role in ('owner','admin','editor') and lower(w.name)=lower($2) limit 1`, [user.id, name])).rows[0];
  const isNewWs = !ws;
  if (!ws) {
    // reuse the empty workspace every new account starts with, instead of leaving it behind
    const empty = (await q.query(`select w.id from workspaces w join memberships m on m.workspace_id=w.id and m.user_id=$1 and m.role='owner'
      where not exists (select 1 from projects where workspace_id=w.id) and not exists (select 1 from tasks where workspace_id=w.id)
        and not exists (select 1 from influencers where workspace_id=w.id) and not exists (select 1 from campaigns where workspace_id=w.id)
      order by w.created_at limit 1`, [user.id])).rows[0];
    if (empty) { await q.query("update workspaces set name=$2 where id=$1", [empty.id, name]); ws = empty; }
    else ws = { id: await createWorkspace(q, user.id, name) };
  }
  return { isNewWs, wid: ws.id, ...(await importWorkspace(q, ws.id, user.id, parsed)) };
});
const sum = o => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(", ") || "—";
console.log(`✓ ${res.isNewWs ? "created" : "updated"} workspace "${name}" for ${user.email}`);
console.log(`  new rows: ${sum(res.created)}\n  updated: ${sum(res.updated)}`);
if (res.warnings.length) { console.log(`  ${res.warnings.length} warnings:`); for (const w of res.warnings.slice(0, 20)) console.log(`   - ${w.sheet} row ${w.row}: ${w.code} ${w.value}`); }
await db.close();
