// Tempo workspace file (.xlsx): the system's own import / export format.
// One workbook = one workspace: projects (+ milestones, readiness, brief), tasks, campaigns, influencers, collaborations.
// Every row carries a key, so importing the same file again updates rows instead of duplicating them.
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import { DICT } from "../../web/js/i18n.js";
import { ENUMS, isUuid, touch, uuid } from "./core.js";
import { COLUMNS as INF_BASE, cellValue, parseInfluencerWorkbook, extraColumns, exportValue } from "./influencer-xlsx.js";
import { stableId } from "./project-import.js";
import { importInfluencers } from "../routes/influencers.js";

export const FORMAT = { name: "Tempo Workspace", version: 1 };

const L = (key) => [DICT.th[key] || key, DICT.en[key] || key];
const ENUM_LISTS = {
  taskStatus: { keys: ENUMS.taskStatus, i18n: "taskStatus" },
  priority: { keys: ENUMS.priority, i18n: "priority" },
  checkState: { keys: ["todo", "waiting", "review", "ready", "na"], i18n: "checkState" },
  campaignStatus: { keys: ENUMS.campaignStatus, i18n: "campStatus" },
  objective: { keys: ENUMS.objective, i18n: "objective" },
  channel: { keys: ["social", "kol", "ecommerce", "ads", "crm"], i18n: "channel", open: true },
  collabStatus: { keys: ENUMS.collabStatus, i18n: "collabStatus" },
  dealType: { keys: ENUMS.dealType, i18n: "deal" },
  platform: { keys: ENUMS.platform, i18n: "platform" },
  color: { keys: ENUMS.color, i18n: "color" }
};
const norm = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
// key, Thai label or English label -> key
function enumValue(list, v) {
  if (v == null || v === "") return null;
  const e = ENUM_LISTS[list], n = norm(v);
  for (const k of e.keys) if (n === k || L(`${e.i18n}.${k}`).some(x => norm(x) === n)) return k;
  return e.open ? String(v).trim() : undefined; // undefined = invalid
}

/* ---- sheet layouts: [field, Thai header, type] ---- */
const SHEETS = {
  projects: { name: "Projects", th: "โปรเจกต์", cols: [
    ["key", "รหัส", "key"], ["name", "ชื่อโปรเจกต์", "text"], ["emoji", "อีโมจิ", "text"], ["color", "สี", "enum:color"],
    ["description", "คำอธิบาย", "text"], ["start_date", "วันเริ่ม", "date"], ["launch_date", "วันเปิดตัว", "date"], ["owner", "เจ้าของ (อีเมล)", "person"]] },
  milestones: { name: "Milestones", th: "หมุดหมาย", cols: [
    ["project", "รหัสโปรเจกต์", "ref"], ["label", "หมุดหมาย", "text"], ["date", "วันที่", "date"], ["done", "เสร็จแล้ว (✓)", "bool"], ["launch", "เป็นวันเปิดตัว (✓)", "bool"]] },
  readiness: { name: "Readiness", th: "ความพร้อม", cols: [
    ["project", "รหัสโปรเจกต์", "ref"], ["label", "รายการตรวจสอบ", "text"], ["state", "สถานะ", "enum:checkState"], ["note", "หลักฐาน / หมายเหตุ", "text"]] },
  brief: { name: "Brief", th: "Brief / Positioning", cols: [
    ["project", "รหัสโปรเจกต์", "ref"], ["label", "หัวข้อ", "text"], ["value", "รายละเอียด", "text"]] },
  tasks: { name: "Tasks", th: "งาน", cols: [
    ["key", "รหัส", "key"], ["project", "รหัสโปรเจกต์", "ref"], ["title", "งานที่ต้องทำ", "text"], ["status", "สถานะ", "enum:taskStatus"],
    ["priority", "ความสำคัญ", "enum:priority"], ["assignee", "ผู้รับผิดชอบ (อีเมล)", "person"], ["due_date", "กำหนดส่ง", "date"],
    ["category", "หมวด / ขั้นตอน", "text"], ["team", "ทีม / ผู้ประสานงาน", "text"], ["next_step", "งานถัดไป", "text"], ["notes", "รายละเอียด", "text"],
    ["link", "ลิงก์ไฟล์", "url"], ["ref_link", "ลิงก์อ้างอิง", "url"]] },
  campaigns: { name: "Campaigns", th: "แคมเปญ", cols: [
    ["key", "รหัส", "key"], ["project", "รหัสโปรเจกต์", "ref"], ["name", "ชื่อแคมเปญ", "text"], ["channel", "ช่องทาง", "enum:channel"],
    ["objective", "เป้าหมาย", "enum:objective"], ["status", "สถานะ", "enum:campaignStatus"], ["start_date", "วันเริ่ม", "date"], ["end_date", "วันจบ", "date"],
    ["budget", "งบ", "num"], ["spent", "ใช้ไป", "num"], ["kpi", "KPI", "text"], ["target", "เป้า", "text"], ["owner", "เจ้าของ (อีเมล)", "person"], ["notes", "หมายเหตุ", "text"]] },
  collaborations: { name: "Collaborations", th: "งานครีเอเตอร์", cols: [
    ["key", "รหัส", "key"], ["influencer", "ID อินฟลูฯ", "ref"], ["influencer_name", "ชื่อ (อ้างอิง ไม่ต้องแก้)", "info"], ["campaign", "รหัสแคมเปญ", "ref"],
    ["project", "รหัสโปรเจกต์", "ref"], ["title", "หัวข้องาน", "text"], ["status", "สถานะ", "enum:collabStatus"], ["deal_type", "ประเภทดีล", "enum:dealType"],
    ["platform", "แพลตฟอร์ม", "enum:platform"], ["fee", "ค่าจ้าง", "num"], ["product_value", "มูลค่าสินค้า", "num"], ["deliverables", "ชิ้นงาน", "text"],
    ["post_date", "วันโพสต์", "date"], ["post_url", "ลิงก์โพสต์", "url"], ["views", "ยอดวิว", "num"], ["likes", "ไลก์", "num"], ["comments", "คอมเมนต์", "num"],
    ["shares", "แชร์", "num"], ["owner", "ผู้ดูแล (อีเมล)", "person"], ["notes", "หมายเหตุ", "text"],
    ["pic", "Hunter / ผู้ติดต่อ", "text"], ["source", "ช่องทางที่เจอ", "text"], ["lead_status", "สถานะการติดต่อ (ละเอียด)", "text"],
    ["contract", "ทำสัญญา (✓/✗)", "bool"], ["affiliate_link_sent", "ส่งลิงก์ Affiliate (✓/✗)", "bool"], ["brief_sent", "ส่ง Brief (✓/✗)", "bool"],
    ["tracking_number", "เลขพัสดุ", "text"], ["shipping_status", "สถานะจัดส่ง", "text"],
    ["drafts", "Draft / QC — บรรทัดละรายการ: [✓] Draft 1 | ลิงก์", "list:drafts"],
    ["posts", "โพสต์ — บรรทัดละโพสต์: [✓] 2027-01-20 | ลิงก์", "list:posts"],
    ["followups", "ติดตาม — บรรทัดละครั้ง: [✓] 12 ชม. | 2027-01-20 10:00", "list:followups"]] }
};
const INF_SHEET = "Influencers";
const header = ([f, th]) => `${th} (${f})`;

/* list cells: one item per line, "[✓] a | b" — ✓ = QC passed / posted / done */
const LIST = { drafts: ["qc", "label", "link"], posts: ["posted", "date", "url"], followups: ["done", "label", "at"] };
function encodeList(kind, arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const [flag, a, b] = LIST[kind];
  return arr.map(x => `[${x[flag] ? "✓" : " "}] ${[x[a] || "", x[b] ? `| ${x[b]}` : ""].filter(Boolean).join(" ")}`.trimEnd()).join("\n");
}
function decodeList(kind, text) {
  const [flag, a, b] = LIST[kind];
  return String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^\[(.?)\]\s*(.*)$/);
    // "a | b", "| b" (no a) or "a" — the first "|" separates the two parts
    const body = m ? m[2] : l, cut = body.indexOf("|");
    const x = cut < 0 ? body : body.slice(0, cut), y = cut < 0 ? "" : body.slice(cut + 1);
    return { id: crypto.randomUUID(), [flag]: m ? /[✓✔xX]/.test(m[1]) : false, [a]: x.trim(), [b]: y.trim() };
  });
}

/* =============================== export =============================== */
export async function buildWorkspaceWorkbook(data) {
  const { workspace, members, projects, tasks, campaigns, influencers, collaborations } = data;
  const email = id => members.find(m => m.user_id === id || m.id === id)?.email || "";
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tempo"; wb.created = new Date();
  const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };

  const readme = wb.addWorksheet("อ่านก่อน");
  readme.columns = [{ width: 30 }, { width: 100 }];
  [["รูปแบบไฟล์", `${FORMAT.name} v${FORMAT.version}`], ["พื้นที่ทำงาน", workspace.name], ["ส่งออกเมื่อ", new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"], [],
   ["วิธีใช้", "แก้ไขใน Excel แล้วนำเข้ากลับได้ที่ ตั้งค่า → ข้อมูล → นำเข้าไฟล์ Tempo (.xlsx)"],
   ["รหัส (key)", "ใช้จับคู่แถวเดิม — นำเข้าซ้ำจะอัปเดต ไม่สร้างซ้ำ | แถวใหม่: ใส่รหัสอะไรก็ได้ที่ไม่ซ้ำ (เช่น task-001) หรือเว้นว่างให้ระบบสร้าง"],
   ["รหัสโปรเจกต์ / แคมเปญ", "ต้องตรงกับคอลัมน์ รหัส ในชีต Projects / Campaigns (หรือใส่ชื่อโปรเจกต์ก็ได้)"],
   ["ช่องว่าง", "ช่องที่เว้นว่างจะไม่ลบข้อมูลเดิมในระบบ"],
   ["สถานะ / ตัวเลือก", "ใช้รหัสหรือชื่อไทย/อังกฤษก็ได้ — ดูค่าที่ใช้ได้ในชีต Lists (มี dropdown ให้เลือก)"],
   ["วันที่", "yyyy-mm-dd หรือวันที่ของ Excel"], ["คน", "ใช้อีเมลของสมาชิกในทีม"],
   ["หมุดหมาย / ความพร้อม / Brief", "ถ้าโปรเจกต์มีแถวในชีตเหล่านี้ รายการของโปรเจกต์นั้นจะถูกแทนด้วยรายการในไฟล์ (เรียงตามลำดับแถว)"],
   ["Influencers", "คอลัมน์เดียวกับ Influencer_Database_Master.xlsx — จับคู่ด้วย ID"]
  ].forEach(r => readme.addRow(r));
  readme.getColumn(1).font = { bold: true };

  const listRange = {};
  const colLetter = n => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  Object.entries(ENUM_LISTS).forEach(([name, e], i) => { const col = colLetter(1 + i * 4); listRange[name] = `Lists!${col}$2:${col}${e.keys.length + 1}`; });
  const writeLists = () => {
  const lists = wb.addWorksheet("Lists");
  let c = 1;
  for (const [name, e] of Object.entries(ENUM_LISTS)) {
    lists.getCell(1, c).value = name; lists.getCell(1, c + 1).value = "ไทย"; lists.getCell(1, c + 2).value = "English";
    e.keys.forEach((k, i) => { const [th, en] = L(`${e.i18n}.${k}`); lists.getCell(i + 2, c).value = k; lists.getCell(i + 2, c + 1).value = th; lists.getCell(i + 2, c + 2).value = en; });
    [0, 1, 2].forEach(j => { lists.getColumn(c + j).width = j ? 18 : 14; });
    c += 4;
  }
  lists.getRow(1).font = { bold: true };
  };

  const rowsFor = {
    projects: projects.map(p => ({ key: p.id, name: p.name, emoji: p.emoji, color: p.color, description: p.description, start_date: p.start_date, launch_date: p.launch_date, owner: email(p.owner_id) })),
    milestones: projects.flatMap(p => (p.milestones || []).map(m => ({ project: p.id, label: m.label, date: m.date || null, done: !!m.done, launch: m.key === "launch" }))),
    readiness: projects.flatMap(p => (p.checklist || []).map(x => ({ project: p.id, label: x.label, state: x.state, note: x.note }))),
    brief: projects.flatMap(p => (p.brief || []).map(b => ({ project: p.id, label: b.label, value: b.value }))),
    tasks: tasks.map(x => ({ ...x, key: x.external_id || x.id, project: x.project_id, assignee: email(x.assignee_id) })),
    campaigns: campaigns.map(x => ({ ...x, key: x.id, project: x.project_id, owner: email(x.owner_id) })),
    collaborations: collaborations.map(x => ({ ...x, key: x.id, influencer: x.influencer_code, influencer_name: x.influencer_name, campaign: x.campaign_id, project: x.project_id, owner: email(x.owner_id) }))
  };
  const extra = 300; // dropdowns also cover empty rows for new entries
  for (const [k, def] of Object.entries(SHEETS)) {
    const ws = wb.addWorksheet(def.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = def.cols.map(col => ({ header: header(col), key: col[0], width: col[2] === "text" && ["description", "notes", "next_step", "value"].includes(col[0]) ? 48 : col[2] === "key" || col[2] === "ref" ? 38 : 18 }));
    for (const r of rowsFor[k]) {
      ws.addRow(Object.fromEntries(def.cols.map(([f, , type]) => {
        let v = r[f];
        if (type === "bool") v = v === true ? "✓" : v === false && k !== "milestones" ? "✗" : v ? "✓" : "";
        else if (type.startsWith("list:")) v = encodeList(type.slice(5), v);
        else if (type === "date") v = v ? new Date(`${String(v).slice(0, 10)}T00:00:00Z`) : null;
        return [f, v ?? null];
      })));
    }
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getRow(1).fill = HEAD_FILL;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.cols.length } };
    def.cols.forEach(([f, , type], i) => {
      const col = ws.getColumn(i + 1);
      if (type === "date") col.numFmt = "yyyy-mm-dd";
      if (type === "num") col.numFmt = "#,##0";
      if (type === "info") col.font = { color: { argb: "FF8E8E93" } };
      const en = type.startsWith("enum:") && type.slice(5);
      if (en && !ENUM_LISTS[en].open) for (let r = 2; r <= rowsFor[k].length + extra; r++) ws.getCell(r, i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [listRange[en]], showErrorMessage: false };
    });
  }

  const inf = wb.addWorksheet(INF_SHEET, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const niches = workspace?.creator_niches || [], xcols = extraColumns(niches);
  const INF_COLUMNS = [...INF_BASE, ...xcols.map(([k, h]) => [k, h])];
  inf.columns = INF_COLUMNS.map(([k, h]) => ({ header: h, key: k, width: ["history", "notes"].includes(k) ? 50 : k.startsWith("followers") || k === "likes_total" ? 14 : 22 }));
  for (const r of influencers) inf.addRow(Object.fromEntries(INF_COLUMNS.map(([k]) => [k, k === "blacklist_reason" ? (r.blacklisted ? r.blacklist_reason || "Blacklist" : null) : exportValue(r, k, niches, xcols)])));
  inf.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; inf.getRow(1).fill = HEAD_FILL;
  inf.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: INF_COLUMNS.length } };
  for (const k of ["followers_max", "followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube", "likes_total"]) inf.getColumn(k).numFmt = "#,##0";

  writeLists();
  return wb.xlsx.writeBuffer();
}

export async function exportWorkspace(q, wid) {
  const one = async (sql, p = [wid]) => (await q.query(sql, p)).rows;
  return {
    workspace: (await one("select id, name, creator_niches from workspaces where id=$1"))[0],
    members: await one("select m.user_id, u.email, u.name from memberships m join users u on u.id=m.user_id where m.workspace_id=$1"),
    projects: await one("select * from projects where workspace_id=$1 order by position, created_at"),
    tasks: await one("select * from tasks where workspace_id=$1 order by created_at"),
    campaigns: await one("select * from campaigns where workspace_id=$1 order by created_at"),
    influencers: await one("select * from influencers where workspace_id=$1 order by followers_max desc nulls last, name"),
    collaborations: await one(`select c.*, i.code as influencer_code, i.name as influencer_name from collaborations c
      join influencers i on i.id=c.influencer_id where c.workspace_id=$1 order by c.created_at`)
  };
}

/* =============================== import =============================== */
const TRUE = new Set(["✓", "✔", "true", "yes", "y", "1", "x", "ใช่", "เสร็จ"]);
function readSheet(ws, def) {
  const head = ws.getRow(1).values;
  const idx = {};
  head.forEach((h, i) => {
    const s = String(cellValue(h) ?? "").trim();
    const m = s.match(/\(([a-z_]+)\)\s*$/);
    const f = m ? m[1] : def.cols.find(([f2, th]) => norm(th) === norm(s) || f2 === norm(s))?.[0];
    if (f && def.cols.some(c => c[0] === f) && !(f in idx)) idx[f] = i;
  });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), o = { _row: r };
    let any = false;
    for (const [f, , type] of def.cols) {
      if (!(f in idx)) continue;
      let v = row.getCell(idx[f]).value;
      v = cellValue(v); // numbers stay exact (no rounding); parsed per type later
      if (v != null && v !== "") any = true;
      o[f] = v === "" ? null : v;
    }
    if (any) rows.push(o);
  }
  return { rows, columns: Object.keys(idx) };
}
const isoDate = v => {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) { let y = +m[3]; if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return undefined;
};
const url = v => { if (!v) return null; try { const u = new URL(String(v).trim()); return ["http:", "https:"].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } };

/** Parse a workspace file. Returns { format, sheets: {projects:[...], ...}, influencers: [...], counts } */
export async function parseWorkspaceWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = { sheets: {}, counts: {} };
  for (const [k, def] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(def.name);
    out.sheets[k] = ws ? readSheet(ws, def).rows : [];
    out.counts[k] = out.sheets[k].length;
  }
  out.format = Boolean(wb.getWorksheet("Projects") || wb.getWorksheet("Tasks"));
  out.influencers = wb.getWorksheet(INF_SHEET) ? (await parseInfluencerWorkbook(buffer, { sheets: [INF_SHEET] })).rows : [];
  out.counts.influencers = out.influencers.length;
  return out;
}

/** Upsert everything from a parsed file into a workspace (inside a transaction). Empty cells never erase data. */
export async function importWorkspace(q, wid, userId, parsed) {
  const S = parsed.sheets;
  const res = { created: {}, updated: {}, warnings: [] };
  const bump = (kind, created) => { const o = created ? res.created : res.updated; o[kind] = (o[kind] || 0) + 1; };
  const warn = (sheet, row, code, value) => res.warnings.push({ sheet, row, code, value: value == null ? "" : String(value).slice(0, 120) });
  const members = (await q.query("select u.id, lower(u.email) as email, lower(u.name) as name from memberships m join users u on u.id=m.user_id where m.workspace_id=$1", [wid])).rows;
  const person = (sheet, row, v) => { if (!v) return null; const n = norm(v); const m = members.find(x => x.email === n || x.name === n); if (!m) warn(sheet, row, "not_member", v); return m?.id || null; };
  const exists = async (table, id) => isUuid(id) && (await q.query(`select 1 from ${table} where id=$1 and workspace_id=$2`, [id, wid])).rows.length > 0;
  const clean = (sheet, row, f, type, v) => {
    if (v == null) return null;
    if (type === "date") { const d = isoDate(v); if (d === undefined) { warn(sheet, row, "bad_date", v); return null; } return d; }
    if (type === "url") { const u = url(v); if (u === undefined) { warn(sheet, row, "bad_link", v); return null; } return u; }
    if (type === "num") { const n = typeof v === "number" ? v : Number(String(v).replace(/[,฿\s]/g, "")); if (!Number.isFinite(n)) { warn(sheet, row, "bad_number", v); return null; } return n; }
    if (type === "bool") { const n = norm(v); if (TRUE.has(n)) return true; if (["✗", "✘", "false", "no", "n", "0", "ไม่", "-"].includes(n)) return false; warn(sheet, row, "bad_value", v); return null; }
    if (type?.startsWith("list:")) return JSON.stringify(decodeList(type.slice(5), v));
    if (type?.startsWith("enum:")) { const e = enumValue(type.slice(5), v); if (e === undefined) { warn(sheet, row, "bad_value", v); return null; } return e; }
    return String(v).trim().slice(0, 50000);
  };
  const values = (sheetKey, r, skip = []) => {
    const o = {};
    for (const [f, , type] of SHEETS[sheetKey].cols) if (!["key", "ref", "person", "info"].includes(type) && !skip.includes(f)) o[f] = clean(SHEETS[sheetKey].name, r._row, f, type, r[f]);
    return o;
  };
  async function upsert(table, id, isNew, vals) {
    const cols = Object.keys(vals).filter(k => vals[k] !== null && vals[k] !== undefined);
    if (isNew) {
      const all = ["id", "workspace_id", "created_by", ...cols];
      await q.query(`insert into ${table} (${all.join(", ")}) values (${all.map((_, i) => `$${i + 1}`).join(", ")})`, [id, wid, userId, ...cols.map(c => vals[c])]);
    } else if (cols.length) {
      await q.query(`update ${table} set ${cols.map((c, i) => `${c}=$${i + 3}`).join(", ")}, updated_at=now() where id=$1 and workspace_id=$2`, [id, wid, ...cols.map(c => vals[c])]);
    }
  }

  // 1) influencers (upsert by ID/code)
  const infRes = parsed.influencers.length ? await importInfluencers(q, wid, userId, parsed.influencers) : { created: 0, updated: 0 };
  if (infRes.created) res.created.influencers = infRes.created;
  if (infRes.updated) res.updated.influencers = infRes.updated;

  // 2) projects
  const projMap = new Map(); // file key / name (lowercase) -> id
  const byName = new Map((await q.query("select id, lower(name) as n from projects where workspace_id=$1", [wid])).rows.map(r => [r.n, r.id]));
  let pos = (await q.query("select coalesce(max(position), -1) + 1 as n from projects where workspace_id=$1", [wid])).rows[0].n;
  for (const r of S.projects) {
    const key = r.key ? String(r.key).trim() : null;
    if (!r.name && !key) continue;
    let id = key && (await exists("projects", key)) ? key : null;
    if (!id && key && (await exists("projects", stableId(wid, "project", key)))) id = stableId(wid, "project", key);
    if (!id && r.name) id = byName.get(norm(r.name)) || null;
    const isNew = !id;
    if (isNew && !r.name) { warn("Projects", r._row, "name_required", key); continue; }
    if (isNew) id = key ? stableId(wid, "project", key) : uuid();
    const vals = values("projects", r);
    vals.owner_id = person("Projects", r._row, r.owner);
    if (isNew) Object.assign(vals, { color: vals.color || "blue", position: pos++, milestones: "[]", checklist: "[]", brief: "[]" });
    await upsert("projects", id, isNew, vals);
    bump("projects", isNew);
    if (key) projMap.set(norm(key), id);
    projMap.set(norm(r.name || ""), id);
    if (r.name) byName.set(norm(r.name), id);
  }
  const projectId = async (sheet, row, v) => {
    if (!v) return null;
    const n = norm(v);
    if (projMap.has(n)) return projMap.get(n);
    if (await exists("projects", String(v).trim())) return String(v).trim();
    const sid = stableId(wid, "project", String(v).trim());
    if (await exists("projects", sid)) return sid;
    if (byName.has(n)) return byName.get(n);
    warn(sheet, row, "unknown_project", v); return null;
  };

  // 3) milestones / readiness / brief: replace the list of every project that appears in the sheet
  for (const [sheetKey, field] of [["milestones", "milestones"], ["readiness", "checklist"], ["brief", "brief"]]) {
    const groups = new Map();
    for (const r of S[sheetKey]) {
      const pid = await projectId(SHEETS[sheetKey].name, r._row, r.project);
      if (!pid || !r.label) continue;
      if (!groups.has(pid)) groups.set(pid, []);
      groups.get(pid).push(r);
    }
    for (const [pid, rows] of groups) {
      const cur = (await q.query(`select ${field} as v from projects where id=$1`, [pid])).rows[0]?.v || [];
      const used = new Set();
      const keep = label => { const m = cur.find(x => x.label === label && !used.has(x.id)); if (m) used.add(m.id); return m; };
      const list = rows.map(r => {
        const old = keep(String(r.label).trim()) || {};
        const id = old.id || crypto.randomUUID(), label = String(r.label).trim().slice(0, 300);
        if (field === "milestones") {
          const d = r.date == null ? (old.date || "") : clean("Milestones", r._row, "date", "date", r.date) || "";
          return { id, label, date: d, done: r.done == null ? !!old.done : TRUE.has(norm(r.done)), ...((r.launch != null ? TRUE.has(norm(r.launch)) : old.key === "launch") ? { key: "launch" } : {}) };
        }
        if (field === "checklist") return { id, label, state: r.state == null ? (old.state || "todo") : clean("Readiness", r._row, "state", "enum:checkState", r.state) || "todo", note: r.note == null ? (old.note || "") : String(r.note) };
        return { id, label, value: r.value == null ? (old.value || "") : String(r.value) };
      });
      const launch = field === "milestones" ? list.find(m => m.key === "launch")?.date || null : null;
      await q.query(`update projects set ${field}=$2::jsonb${field === "milestones" ? ", launch_date=coalesce($3::date, launch_date)" : ""}, updated_at=now() where id=$1`,
        field === "milestones" ? [pid, JSON.stringify(list), launch] : [pid, JSON.stringify(list)]);
      bump(sheetKey, false);
    }
  }

  // 4) campaigns
  const campMap = new Map();
  for (const r of S.campaigns) {
    const key = r.key ? String(r.key).trim() : null;
    let id = key && (await exists("campaigns", key)) ? key : null;
    if (!id && key && (await exists("campaigns", stableId(wid, "campaign", key)))) id = stableId(wid, "campaign", key);
    const pid = await projectId("Campaigns", r._row, r.project);
    if (!id && r.name) id = (await q.query("select id from campaigns where workspace_id=$1 and lower(name)=lower($2) and project_id is not distinct from $3 limit 1", [wid, String(r.name), pid])).rows[0]?.id || null;
    const isNew = !id;
    if (isNew && !r.name) { warn("Campaigns", r._row, "name_required", key); continue; }
    if (isNew) id = key ? stableId(wid, "campaign", key) : uuid();
    const vals = { ...values("campaigns", r), project_id: pid, owner_id: person("Campaigns", r._row, r.owner) };
    if (vals.start_date && vals.end_date && vals.end_date < vals.start_date) { warn("Campaigns", r._row, "date_order", `${vals.start_date} > ${vals.end_date}`); vals.end_date = null; }
    if (isNew) Object.assign(vals, { status: vals.status || "draft" });
    await upsert("campaigns", id, isNew, vals);
    bump("campaigns", isNew);
    if (key) campMap.set(norm(key), id);
    if (r.name) campMap.set(norm(r.name), id);
  }
  const campaignId = async (row, v) => {
    if (!v) return null;
    const n = norm(v);
    if (campMap.has(n)) return campMap.get(n);
    if (await exists("campaigns", String(v).trim())) return String(v).trim();
    const sid = stableId(wid, "campaign", String(v).trim());
    if (await exists("campaigns", sid)) return sid;
    const byN = (await q.query("select id from campaigns where workspace_id=$1 and lower(name)=$2 limit 1", [wid, n])).rows[0];
    if (byN) return byN.id;
    warn("Collaborations", row, "unknown_campaign", v); return null;
  };

  // 5) tasks
  for (const r of S.tasks) {
    const key = r.key ? String(r.key).trim().slice(0, 120) : null;
    const pid = await projectId("Tasks", r._row, r.project);
    let id = key && (await exists("tasks", key)) ? key : null;
    if (!id && key) id = (await q.query("select id from tasks where workspace_id=$1 and external_id=$2", [wid, key])).rows[0]?.id || null;
    if (!id && r.title) id = (await q.query("select id from tasks where workspace_id=$1 and project_id is not distinct from $2 and lower(title)=lower($3) order by created_at limit 1", [wid, pid, String(r.title)])).rows[0]?.id || null;
    const isNew = !id;
    if (isNew && !r.title) { warn("Tasks", r._row, "title_required", key); continue; }
    const vals = { ...values("tasks", r), project_id: pid, assignee_id: person("Tasks", r._row, r.assignee) };
    if (isNew) Object.assign(vals, { status: vals.status || "todo", priority: vals.priority || "med", external_id: key });
    await upsert("tasks", isNew ? uuid() : id, isNew, vals);
    bump("tasks", isNew);
  }

  // 6) collaborations (need the influencer by ID/code)
  const infByCode = new Map((await q.query("select id, code from influencers where workspace_id=$1", [wid])).rows.map(r => [norm(r.code), r.id]));
  for (const r of S.collaborations) {
    const infId = r.influencer ? infByCode.get(norm(r.influencer)) : null;
    if (!infId) { warn("Collaborations", r._row, "unknown_influencer", r.influencer || r.influencer_name); continue; }
    const key = r.key ? String(r.key).trim() : null;
    let id = key && (await exists("collaborations", key)) ? key : null;
    if (!id && key && (await exists("collaborations", stableId(wid, "collab", key)))) id = stableId(wid, "collab", key);
    const isNew = !id;
    if (isNew) id = key ? stableId(wid, "collab", key) : uuid();
    const vals = { ...values("collaborations", r, ["influencer_name"]), influencer_id: infId, campaign_id: await campaignId(r._row, r.campaign),
      project_id: await projectId("Collaborations", r._row, r.project), owner_id: person("Collaborations", r._row, r.owner) };
    if (isNew) Object.assign(vals, { status: vals.status || "shortlist" });
    await upsert("collaborations", id, isNew, vals);
    bump("collaborations", isNew);
  }

  const total = Object.values(res.created).reduce((a, b) => a + b, 0) + Object.values(res.updated).reduce((a, b) => a + b, 0);
  if (total) await touch(q, wid, userId, "import", "workspace", null, `${total} rows`);
  return res;
}
