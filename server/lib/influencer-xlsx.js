import ExcelJS from "exceljs";
import JSZip from "jszip";
import { splitNicheCell } from "./niches.js";
import { sortPlatformLinks } from "./platform-links.js";

/* ExcelJS turns number cells that carry a date format into Date objects. Very large numbers (e.g. 150M likes)
   overflow into an Invalid Date and the value is lost, so for those cells we read the raw <v> from the sheet XML. */
async function rawCellReader(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const wbXml = await zip.file("xl/workbook.xml")?.async("string") || "";
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") || "";
  const target = {};
  for (const m of rels.matchAll(/<Relationship[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1], t = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && t) target[id] = t.replace(/^\/?(xl\/)?/, "xl/");
  }
  const files = {};
  for (const m of wbXml.matchAll(/<sheet[^>]*>/g)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1], rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    if (name && rid) files[name.replace(/&amp;/g, "&")] = target[rid];
  }
  const cache = {};
  return async (sheetName, address) => {
    const f = files[sheetName];
    if (!f || !zip.file(f)) return null;
    cache[f] ??= zip.file(f).async("string");
    const xml = await cache[f];
    const m = xml.match(new RegExp(`<c r="${address}"[^>]*>(?:<f[^>]*/>|<f[^>]*>[\\s\\S]*?</f>)?<v>([^<]*)</v>`));
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) ? n : null;
  };
}

/* Column layout of Influencer_Database_Master.xlsx (and our export). */
export const COLUMNS = [
  ["code", "ID"], ["name", "Account Name"], ["aliases", "ชื่ออื่นที่พบ (ชื่อซ้ำที่รวมแล้ว)"], ["pet_name", "ชื่อเล่น / คาแรกเตอร์"],
  ["breed", "รายละเอียดสาย"], ["niches", "สาย / ประเภท"], ["type_source", "ประเภทมาจาก"], ["tier", "Tier"],
  ["followers_max", "Follower สูงสุด"], ["followers_ig", "Follower IG"], ["followers_tiktok", "Follower TikTok"],
  ["followers_fb", "Follower FB"], ["followers_lemon8", "Follower Lemon8"], ["followers_x", "Follower X"], ["followers_youtube", "Follower YouTube"], ["likes_total", "Like รวม"],
  ["link_tiktok", "Link TikTok"], ["link_ig", "Link IG"], ["link_fb", "Link Facebook"], ["link_x", "Link X"], ["link_lemon8", "Link Lemon8"], ["link_youtube", "Link YouTube"],
  ["link_other", "Link อื่น"], ["contact_line", "LINE ID"], ["contact_phone", "เบอร์โทร"], ["contact_email", "Email"], ["contact", "Contact"],
  ["address", "ที่อยู่จัดส่ง"], ["brands", "แบรนด์ที่เคยร่วมงาน"], ["history", "ประวัติการร่วมงาน (ล่าสุดก่อน)"],
  ["notes", "หมายเหตุ / เงื่อนไข / เรท"], ["blacklist_reason", "⚠ Blacklist"], ["legacy_code", "รหัสเดิม"],
  ["sources", "พบในแหล่งข้อมูล"], ["merged_count", "จำนวนรายการที่รวม"], ["category", "ประเภทอินฟลู (Influencer Type)"]
];
const NUMERIC = new Set(["followers_max", "followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube", "likes_total", "merged_count"]);
const isBadDate = v => (v instanceof Date && Number.isNaN(v.getTime())) || (v && typeof v === "object" && v.result instanceof Date && Number.isNaN(v.result.getTime()));
const LINKS = new Set(["link_tiktok", "link_ig", "link_fb", "link_x", "link_lemon8", "link_youtube"]);

const norm = s => String(s ?? "").toLowerCase().replace(/[\s_\-.()/⚠]+/g, "");
const HEADER = new Map(COLUMNS.map(([k, h]) => [norm(h), k]));
// Friendly aliases so other spreadsheets can be imported too
for (const [alias, key] of Object.entries({
  id: "code", code: "code", name: "name", accountname: "name", account: "name", handle: "name", ชื่อ: "name", ชื่อบัญชี: "name",
  petname: "pet_name", nickname: "pet_name", character: "pet_name", ชื่อเล่น: "pet_name", ชื่อสัตว์เลี้ยง: "pet_name", breed: "breed", สายพันธุ์: "breed", รายละเอียด: "breed", legacycode: "legacy_code", oldcode: "legacy_code", codeเดิม: "legacy_code", codeเดิมkollists26: "legacy_code", type: "niches", pettype: "niches", ประเภท: "niches", สาย: "niches", niche: "niches", niches: "niches", tier: "tier",
  followers: "followers_max", follower: "followers_max", ผู้ติดตาม: "followers_max", instagram: "link_ig", tiktok: "link_tiktok",
  contact: "contact", ติดต่อ: "contact", line: "contact", address: "address", ที่อยู่: "address", notes: "notes", หมายเหตุ: "notes",
  blacklist: "blacklist_reason", brands: "brands", history: "history", "linkอื่นfbxlemon8": "link_other", lineid: "contact_line", email: "contact_email", เบอร์โทร: "contact_phone", phone: "contact_phone",
  facebook: "link_fb", youtube: "link_youtube", lemon8: "link_lemon8",
  influencertype: "category", ประเภทอินฟลู: "category", category: "category", หมวด: "category"
})) if (!HEADER.has(alias)) HEADER.set(alias, key);

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function cellValue(v, numeric = false, preferLink = false) {
  if (v == null) return null;
  if (v instanceof Date) {
    // Number cells formatted as dates (common in this file) -> convert back to the serial number
    if (Number.isNaN(v.getTime())) return null;
    return numeric ? Math.max(0, Math.round((v.getTime() - EXCEL_EPOCH) / 864e5)) : v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if (v.error) return null;
    if ("result" in v) return cellValue(v.result, numeric, preferLink);
    if (v.hyperlink && (preferLink || !v.text)) return String(v.hyperlink).replace(/^mailto:/, "");
    if (v.richText) return cellValue(v.richText.map(r => r.text).join(""), numeric);
    if ("text" in v) return cellValue(v.text, numeric, preferLink);
    return null;
  }
  if (numeric) {
    if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
    const m = String(v).replace(/[,\s฿]/g, "").toLowerCase().match(/^(\d+(?:\.\d+)?)([km])?$/);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
  }
  const s = String(v).trim();
  return s ? s : null;
}

export const tierFrom = n => (n == null ? null : n >= 1e6 ? "Mega" : n >= 1e5 ? "Macro" : n >= 1e4 ? "Micro" : "Nano");

/** Parse a workbook buffer into normalized influencer rows. */
export async function parseInfluencerWorkbook(buffer, { sheets: onlySheets } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const people = new Map();
  const blacklist = new Map();
  const sheets = [];
  let raw = null;
  let autoId = 0;

  for (const ws of wb.worksheets) {
    if (onlySheets && !onlySheets.includes(ws.name)) continue;
    // find a header row within the first 5 rows
    let headerRow = 0, map = null;
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const vals = ws.getRow(r).values;
      const m = {};
      vals.forEach((v, c) => {
        const h = cellValue(v), k = HEADER.get(norm(h));
        if (k && !(k in m)) m[k] = c;
        else if (!k && typeof h === "string" && NICHE_FIELD.test(h)) (m._extra ||= {})[c] = h.trim(); // "บิวตี้: สภาพผิว"
      });
      const normalized = vals.map(v => norm(cellValue(v)));
      if (normalized.includes(norm("เหตุผล")) && "code" in m) { headerRow = r; map = { ...m, reason: normalized.indexOf(norm("เหตุผล")) }; break; }
      if ("name" in m) { headerRow = r; map = m; break; }
    }
    if (!map) continue;
    const isBlacklistSheet = "reason" in map;
    let count = 0;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (isBlacklistSheet) {
        const code = cellValue(row.getCell(map.code).value);
        const reason = cellValue(row.getCell(map.reason).value);
        if (code) blacklist.set(code, reason || "Blacklist");
        continue;
      }
      const rec = {};
      for (const [key, col] of Object.entries(map)) {
        if (key === "_extra") continue;
        const cell = row.getCell(col);
        rec[key] = cellValue(cell.value, NUMERIC.has(key), LINKS.has(key));
        if (rec[key] == null && NUMERIC.has(key) && isBadDate(cell.value)) {
          raw ??= await rawCellReader(buffer);
          const n = await raw(ws.name, cell.address);
          rec[key] = n == null ? null : Math.max(0, Math.round(n));
        }
      }
      if (!rec.name) continue;
      if (map._extra) for (const [col, h] of Object.entries(map._extra)) { const v = cellValue(row.getCell(+col).value); if (v != null) (rec._extra ||= {})[h] = String(v); }
      rec.name = String(rec.name).slice(0, 200);
      // @handles in a platform column become profile links; profile links in "other links" move to their platform
      sortPlatformLinks(rec);
      // "บิวตี้, อาหาร" → several niches; a word the workspace doesn't know yet becomes its own niche
      // (labels are matched to the workspace's keys when the rows are saved)
      rec.niches = splitNicheCell(rec.niches).map(w => w.slice(0, 60));
      rec.pet_type = rec.niches[0] || null;
      const tier = rec.tier ? String(rec.tier).trim().replace(/^./, c => c.toUpperCase()) : null;
      const platforms = ["followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube"].map(k => rec[k]).filter(n => n != null);
      if (rec.followers_max == null && platforms.length) rec.followers_max = Math.max(...platforms);
      rec.tier = ["Mega", "Macro", "Micro", "Nano"].includes(tier) ? tier : tierFrom(rec.followers_max);
      rec.code = rec.code ? String(rec.code).slice(0, 60) : `IMP-${norm(rec.name).slice(0, 40) || ++autoId}`;
      if (rec.type_source) rec.type_source = String(rec.type_source).slice(0, 60);
      delete rec.reason;
      people.set(rec.code, { ...(people.get(rec.code) || {}), ...rec });
      count++;
    }
    sheets.push({ name: ws.name, rows: count, blacklist: isBlacklistSheet });
  }
  for (const [code, reason] of blacklist) {
    const p = people.get(code);
    if (p) p.blacklist_reason = p.blacklist_reason || reason;
  }
  const rows = [...people.values()].map(p => ({ ...p, blacklisted: Boolean(p.blacklist_reason) }));
  return { rows, sheets, blacklistCount: rows.filter(r => r.blacklisted).length };
}

const NICHE_FIELD = /^[^:]{1,60}:\s*[^:]{1,40}$/;
const keysOf = r => (Array.isArray(r.niches) && r.niches.length ? r.niches : r.pet_type ? [r.pet_type] : []);
/** The "สาย / ประเภท" cell: the creator's niche labels, main one first. */
export const nicheCell = (r, niches = []) => keysOf(r).map(k => niches.find(n => n.key === k)?.label || k).join(", ") || null;
/** One column per niche field: [colKey, header, nicheKey, fieldKey]. */
export const extraColumns = (niches = []) => niches.flatMap(n => (n.fields || []).map(f => [`x:${n.key}:${f.key}`, `${n.label}: ${f.label}`, n.key, f.key]));
/** A cell value for export: niche labels, a niche field, or the plain column. */
export const exportValue = (r, k, niches = [], xcols = extraColumns(niches)) => {
  if (k === "niches") return nicheCell(r, niches);
  if (k.startsWith("x:")) { const c = xcols.find(x => x[0] === k); return (c && r.extra?.[c[2]]?.[c[3]]) ?? null; }
  return r[k] ?? null;
};
const NO_NICHE = "ยังไม่ระบุสาย";
// Excel sheet names: max 31 chars, none of :  / ? * [ ]
const sheetName = s => String(s).replace(/[:\x5c/?*[\]]/g, " ").trim().slice(0, 31) || NO_NICHE;

/** Build an .xlsx in the same layout as the master file: one sheet per creator niche (the workspace's labels). */
export async function buildInfluencerWorkbook(rows, niches = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tempo";
  wb.created = new Date();
  const xcols = extraColumns(niches);
  const cols = [...COLUMNS, ...xcols.map(([k, h]) => [k, h])];
  const labelOf = k => niches.find(n => n.key === k)?.label || k;
  const groups = {};
  for (const n of niches) groups[sheetName(n.label)] = [];
  const sheetOf = r => (r.pet_type ? sheetName(labelOf(r.pet_type)) : NO_NICHE);
  for (const r of rows) (groups[sheetOf(r)] ||= []).push(r);
  if (!Object.keys(groups).length) groups[NO_NICHE] = [];
  for (const [name, list] of Object.entries(groups)) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
    ws.columns = cols.map(([k, h]) => ({ header: h, key: k, width: k === "history" || k === "notes" ? 50 : k.startsWith("followers") || k === "likes_total" ? 14 : 22 }));
    list.sort((a, b) => (b.followers_max || 0) - (a.followers_max || 0));
    for (const r of list) ws.addRow(Object.fromEntries(cols.map(([k]) => [k, exportValue(r, k, niches, xcols)])));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D4AFF" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    for (const k of ["followers_max", "followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube", "likes_total"]) ws.getColumn(k).numFmt = "#,##0";
    ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: "top", wrapText: true }; });
  }
  const bl = wb.addWorksheet("Blacklist");
  bl.columns = [{ header: "ID", key: "code", width: 14 }, { header: "อยู่ในชีต", key: "sheet", width: 18 }, { header: "Account Name", key: "name", width: 26 },
    { header: "เหตุผล", key: "reason", width: 60 }, { header: "Link", key: "link", width: 40 }];
  bl.getRow(1).font = { bold: true };
  for (const r of rows.filter(x => x.blacklisted)) bl.addRow({ code: r.code, sheet: sheetOf(r), name: r.name, reason: r.blacklist_reason, link: r.link_tiktok || r.link_ig || r.link_other });
  return wb.xlsx.writeBuffer();
}
