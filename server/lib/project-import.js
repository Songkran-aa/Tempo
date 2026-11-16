// Imports a "project bundle" JSON (projects + their tasks, milestones, readiness checklist and brief).
// IDs are derived from workspace + key, so running it again never duplicates and never overwrites edits.
import crypto from "node:crypto";
import { ENUMS, touch } from "./core.js";

export const stableId = (...parts) => {
  const h = crypto.createHash("sha256").update(parts.join(":")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const s = v => (v == null || v === "" ? null : String(v));
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : null);

export function validateBundle(b) {
  if (!b || !Array.isArray(b.projects) || !b.projects.length) throw new Error("bundle.projects is empty");
  for (const p of b.projects) {
    if (!p.key || !p.name) throw new Error("every project needs key and name");
    for (const t of p.tasks || []) if (!t.title) throw new Error(`task without title in ${p.key}`);
  }
}

export async function importProjectBundle(q, wid, userId, bundle) {
  validateBundle(bundle);
  const map = bundle.statusMap || {};
  const out = { projects: 0, tasks: 0, skipped: 0 };
  const pos = (await q.query("select coalesce(max(position), -1) + 1 as n from projects where workspace_id=$1", [wid])).rows[0].n;
  for (const [i, p] of bundle.projects.entries()) {
    const pid = stableId(wid, "project", p.key);
    const item = x => typeof x === "string" ? { label: x } : x;
    const milestones = (p.milestones || []).map((x, j) => { const m = item(x); return { id: stableId(pid, "m", j), label: m.label, date: date(m.date) || "", done: !!m.done, ...(m.key ? { key: m.key } : {}) }; });
    const checklist = (p.checklist || []).map((x, j) => { const c = item(x); return { id: stableId(pid, "c", j), label: c.label, state: c.state || "todo", note: c.note || "" }; });
    const brief = (p.brief || []).map(([label, value], j) => ({ id: stableId(pid, "b", j), label, value: value || "" }));
    const launch = milestones.find(m => m.key === "launch")?.date || null;
    const color = ENUMS.color.includes(p.color) ? p.color : "blue";
    const r = await q.query(`insert into projects (id, workspace_id, name, emoji, color, description, owner_id, start_date, launch_date, milestones, checklist, brief, position, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$7) on conflict (id) do nothing returning id`,
      [pid, wid, p.name, p.emoji || "📦", color, s(p.description), userId, date(p.start_date), launch, JSON.stringify(milestones), JSON.stringify(checklist), JSON.stringify(brief), pos + i]);
    if (r.rows.length) { out.projects++; await touch(q, wid, userId, "create", "project", pid, p.name); } else out.skipped++;
    for (const t of p.tasks || []) {
      const status = ENUMS.taskStatus.includes(t.status) ? t.status : map[t.status] || "todo";
      const notes = [t.note, t.status && !ENUMS.taskStatus.includes(t.status) ? `สถานะเดิม: ${t.status}` : ""].filter(Boolean).join("\n");
      const tr = await q.query(`insert into tasks (id, workspace_id, project_id, title, status, priority, due_date, category, notes, link, team, next_step, ref_link, created_by, external_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing returning id`,
        [stableId(pid, "task", t.ref || t.title), wid, pid, t.title, status, ENUMS.priority.includes(t.priority) ? t.priority : "med", date(t.due), s(t.stage), s(notes),
         s(t.file), s(t.team), s(t.next), s(t.refLink), userId, s(t.ref)]);
      if (tr.rows.length) out.tasks++; else out.skipped++;
    }
  }
  if (out.tasks) await touch(q, wid, userId, "import", "tasks", null, `${out.tasks} tasks`);
  return out;
}
