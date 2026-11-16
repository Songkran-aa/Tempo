// Product-tracker CSV (Thai or English headers) -> projects + tasks.
import crypto from "node:crypto";
import { ENUMS, touch, uuid } from "./core.js";

/** RFC 4180 CSV parser: quotes, "" escapes, newlines inside quotes, BOM, CRLF. */
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

const norm = h => String(h || "").toLowerCase().replace(/[\s_\-./()]+/g, "");
const HEAD = {
  id: ["id", "รหัส"], project: ["โปรเจกต์", "project"], brand: ["แบรนด์", "brand"], product: ["สินค้า", "product"],
  formula: ["รุ่น / สูตร", "รุ่น", "สูตร", "สูตร/ประเภทอาหาร", "variant", "formula"], stage: ["ขั้นตอน", "stage", "หมวด / ขั้นตอน", "category"],
  title: ["งานที่ต้องทำ", "งาน", "task", "title"], team: ["ผู้ประสานงาน", "ทีม / ผู้ประสานงาน", "team", "team / coordinator"],
  owner: ["เจ้าของงาน", "ผู้รับผิดชอบ", "owner", "assignee"], status: ["สถานะ", "status"],
  due: ["เดดไลน์", "กำหนดส่ง", "due", "due date", "deadline"], next: ["งานถัดไป", "next", "next step"],
  note: ["หมายเหตุ", "รายละเอียด", "note", "notes", "details"],
  file: ["ลิงก์ไฟล์", "ไฟล์ / อ้างอิง", "file", "file link", "file / reference"], ref: ["ลิงก์อ้างอิง", "reference", "reference link", "ref"],
  priority: ["ความสำคัญ", "priority"]
};
const COLMAP = new Map(Object.entries(HEAD).flatMap(([k, list]) => list.map(h => [norm(h), k])));

// original tracker statuses + Tempo labels (th / en) so our own export round-trips
const STATUS_MAP = new Map(Object.entries({
  "รอตรวจสอบ": "waiting", "backlog": "todo", "in progress": "doing", "waiting for input": "waiting", "review": "review", "approved": "approved",
  "ready to launch": "approved", "launched": "done", "report": "done", "completed": "done",
  "ยังไม่เริ่ม": "todo", "กำลังทำ": "doing", "รอข้อมูล": "waiting", "รอตรวจ": "review", "อนุมัติแล้ว": "approved", "เสร็จแล้ว": "done",
  "in review": "review", "to do": "todo", "to-do": "todo", "not started": "todo", "doing": "doing", "waiting": "waiting", "done": "done"
}).map(([k, v]) => [norm(k), v]));
const PRIO = new Map(Object.entries({ "สูง": "high", "กลาง": "med", "ปานกลาง": "med", "ต่ำ": "low", high: "high", medium: "med", med: "med", low: "low" }).map(([k, v]) => [norm(k), v]));
export const mapStatus = v => (ENUMS.taskStatus.includes(norm(v)) ? norm(v) : STATUS_MAP.get(norm(v)) ?? null);

/** yyyy-mm-dd, dd/mm/yyyy, dd/mm/yy; Buddhist-era years are converted. */
export function parseDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/), y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) { [d, mo, y] = [+m[1], +m[2], +m[3]]; if (y < 100) y += y > 50 ? 2500 : 2000; }
  else return null;
  if (y > 2400) y -= 543;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
const safeUrl = v => { try { const u = new URL(String(v).trim()); return ["http:", "https:"].includes(u.protocol) ? u.href : null; } catch { return null; } };

/** -> { rows, columns } ; throws code csv_no_title if there is no task column */
export function parseTrackerCsv(text) {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], columns: [] };
  const header = all[0].map(h => COLMAP.get(norm(h)) || null);
  if (!header.includes("title")) { const e = new Error("no title column"); e.code = "csv_no_title"; throw e; }
  const rows = all.slice(1).map((r, i) => {
    const o = { line: i + 2 };
    header.forEach((k, j) => { if (k && !(k in o)) o[k] = (r[j] ?? "").trim(); });
    return o;
  }).filter(o => o.title);
  return { rows, columns: header.filter(Boolean) };
}

// product-launch template for projects that a tracker file creates
const TEMPLATE = {
  milestones: ["ส่ง Artwork", "รอบผลิต", "สต๊อกพร้อม", "วันพร้อมขาย", "เริ่มเปลี่ยนผ่านแพ็ก", "วันเปิดตัว", "ติดตามผล"],
  checklist: ["สเปก / เคลม / รายละเอียดสินค้า", "ต้นทุนและราคา", "ช่องทางและคู่เทียบ", "Positioning และ Key Message", "แพ็กและ Artwork", "รอบผลิต", "สต๊อกพร้อมขาย", "แผนเปลี่ยนผ่านแพ็ก", "อนุมัติเปิดตัว", "แผนติดตามผล"],
  brief: ["Brand Territory", "Target", "Consumer Need", "Product Benefit", "Reason to Believe", "Key Message", "Proof Point", "Competitor Comparison", "Sales Support Message", "สิ่งที่ต้องตัดสินใจ", "ข้อสรุปหลังประชุม"]
};
const COLORS = ["yellow", "green", "blue", "pink", "orange", "teal", "purple", "indigo"];

/** Upserts tracker rows. Matching: tracker ID, then same project + same title. Empty cells never erase data. */
export async function importTrackerRows(q, wid, userId, rows) {
  const out = { created: 0, updated: 0, projectsCreated: 0, warnings: [] };
  const members = (await q.query("select u.id, u.name, u.first_name, u.email from memberships m join users u on u.id=m.user_id where m.workspace_id=$1", [wid])).rows;
  const findMember = v => { const k = String(v || "").trim().toLowerCase(); return k ? members.find(m => [m.name, m.first_name, m.email].some(x => String(x || "").toLowerCase() === k)) : null; };
  const projects = new Map((await q.query("select id, name from projects where workspace_id=$1", [wid])).rows.map(p => [p.name.trim().toLowerCase(), p.id]));
  let pos = (await q.query("select coalesce(max(position), -1) + 1 as n from projects where workspace_id=$1", [wid])).rows[0].n;

  for (const r of rows) {
    let pid = null;
    if (r.project) {
      const key = r.project.toLowerCase();
      pid = projects.get(key);
      if (!pid) {
        pid = uuid();
        const id = () => crypto.randomUUID();
        await q.query(`insert into projects (id, workspace_id, name, emoji, color, description, owner_id, milestones, checklist, brief, position, created_by)
          values ($1,$2,$3,'📦',$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$6)`,
          [pid, wid, r.project.slice(0, 300), COLORS[pos % COLORS.length],
           [r.brand && `แบรนด์: ${r.brand}`, r.product && `สินค้า: ${r.product}`].filter(Boolean).join(" · ") || null, userId,
           JSON.stringify(TEMPLATE.milestones.map(label => ({ id: id(), label, date: "", done: false, ...(label === "วันเปิดตัว" ? { key: "launch" } : {}) }))),
           JSON.stringify(TEMPLATE.checklist.map(label => ({ id: id(), label, state: "todo", note: "" }))),
           JSON.stringify(TEMPLATE.brief.map(label => ({ id: id(), label, value: "" }))), pos++]);
        projects.set(key, pid);
        out.projectsCreated++;
        await touch(q, wid, userId, "create", "project", pid, r.project);
      }
    }
    const owner = findMember(r.owner);
    if (r.owner && !owner) out.warnings.push({ line: r.line, code: "owner_not_member", value: r.owner });
    const status = r.status ? mapStatus(r.status) : null;
    if (r.status && !status) out.warnings.push({ line: r.line, code: "unknown_status", value: r.status });
    const due = r.due ? parseDate(r.due) : null;
    if (r.due && !due) out.warnings.push({ line: r.line, code: "bad_date", value: r.due });
    for (const k of ["file", "ref"]) if (r[k] && !safeUrl(r[k])) out.warnings.push({ line: r.line, code: "bad_link", value: r[k] });
    const notes = [r.note, r.formula && `รุ่น / สูตร: ${r.formula}`, r.owner && !owner && `เจ้าของงาน: ${r.owner}`].filter(Boolean).join("\n") || null;
    const vals = {
      title: r.title.slice(0, 500), project_id: pid, status, priority: PRIO.get(norm(r.priority)) || null, assignee_id: owner?.id || null,
      due_date: due, category: r.stage ? r.stage.slice(0, 100) : null, team: r.team ? r.team.slice(0, 200) : null,
      next_step: r.next ? r.next.slice(0, 2000) : null, notes, link: r.file ? safeUrl(r.file) : null, ref_link: r.ref ? safeUrl(r.ref) : null,
      external_id: r.id ? r.id.slice(0, 120) : null
    };
    const ex = (vals.external_id && (await q.query("select id from tasks where workspace_id=$1 and external_id=$2", [wid, vals.external_id])).rows[0])
      || (await q.query("select id from tasks where workspace_id=$1 and project_id is not distinct from $2 and lower(title)=lower($3) order by created_at limit 1", [wid, pid, vals.title])).rows[0];
    if (ex) {
      const cols = Object.keys(vals).filter(k => vals[k] != null);
      await q.query(`update tasks set ${cols.map((c, i) => `${c}=$${i + 3}`).join(", ")}, updated_at=now() where id=$1 and workspace_id=$2`, [ex.id, wid, ...cols.map(c => vals[c])]);
      out.updated++;
    } else {
      const v = { ...vals, status: vals.status || "todo", priority: vals.priority || "med" };
      const cols = Object.keys(v);
      await q.query(`insert into tasks (id, workspace_id, created_by, ${cols.join(", ")}) values ($1,$2,$3,${cols.map((_, i) => `$${i + 4}`).join(",")})`,
        [uuid(), wid, userId, ...cols.map(c => v[c])]);
      out.created++;
    }
  }
  if (rows.length) await touch(q, wid, userId, "import", "tasks", null, `${rows.length} tasks`);
  return out;
}
