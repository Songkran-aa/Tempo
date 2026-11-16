// Tools that keep the creator database clean:
//   contactSuggestions() — what in the old free-text contact box can move into its own field (IG/TikTok/… handle, LINE, phone, email)
//   dupeKeys() / findDupes() / dupeGroups() — creators that are probably the same person (same handle, phone, LINE, email or name)
//   mergeCreators() — fold one creator into another without losing anything
import { splitContact } from "./contact-split.js";
import { cleanKeys } from "./niches.js";

/* ---------- platforms ---------- */
export const PLATFORMS = [
  { field: "link_tiktok", label: "TikTok", base: "https://www.tiktok.com/@", re: /tiktok\.com\/@?([\w.]+)/i, words: /^(?:tt|tiktok|tik\s*tok|ติ๊กต็อก)$/i },
  { field: "link_ig", label: "Instagram", base: "https://www.instagram.com/", re: /(?:instagram\.com|instagr\.am)\/([\w.]+)/i, words: /^(?:ig|insta|instagram|ไอจี)$/i },
  { field: "link_fb", label: "Facebook", base: "https://www.facebook.com/", re: /(?:facebook\.com|fb\.com|fb\.me)\/([\w.]+)/i, words: /^(?:fb|facebook|เฟส|เฟซบุ๊ก|เฟสบุ๊ค)$/i },
  { field: "link_youtube", label: "YouTube", base: "https://www.youtube.com/@", re: /(?:youtube\.com\/(?:@|c\/|channel\/|user\/)?|youtu\.be\/)([\w.\-]+)/i, words: /^(?:yt|youtube|ยูทูป|ยูทูบ)$/i },
  { field: "link_x", label: "X", base: "https://x.com/", re: /(?:^|\/\/|\.)(?:x|twitter)\.com\/([\w]+)/i, words: /^(?:x|twitter)$/i },
  { field: "link_lemon8", label: "Lemon8", base: "https://www.lemon8-app.com/@", re: /lemon8-app\.com\/@?([\w.]+)/i, words: /^(?:lemon8|lemon 8)$/i }
];
const SOCIAL_URL = /^https?:\/\/\S+$/i;
const HANDLE = /^@?[A-Za-z0-9_][\w.]{1,29}$/;
const NOT_PATHS = new Set(["p", "reel", "reels", "video", "watch", "share", "stories", "explore", "profile.php", "groups", "pages", "people", "channel", "c", "user", "shorts", "tv", "permalink.php"]);
const lower = s => String(s || "").toLowerCase();

/** The account name in a profile link ("https://www.tiktok.com/@abc?lang=th" → "abc"), or null. */
export function handleOf(field, url) {
  const pl = PLATFORMS.find(p => p.field === field);
  const s = String(url || "");
  const m = pl && s.match(pl.re);
  // the name must end the path ("…/@abc", "…/@abc/", "…/@abc?x"): broken links like "tiktok.com/@http://site" have no handle
  const next = m ? s[m.index + m[0].length] : "";
  if (!m || (next && !"/?#".includes(next))) return null;
  const h = m[1].replace(/\.+$/, "").toLowerCase();
  return h && !NOT_PATHS.has(h) && !NOT_HANDLES.has(h) ? h : null;
}
const NOT_HANDLES = new Set(["http", "https", "www", "home", "login", "search", "watch", "tiktok", "instagram", "facebook"]);

// "IG: abc", "ig : @abc", "TT:abc", "TikTok @abc", "Facebook: abc"
const LABELLED = /^\s*([A-Za-zก-๙ ]{1,14}?)\s*(?:[:：•\-]\s*|\s+(?=@))(.+?)\s*$/;
// "ID : xxx", "ID:xxx", "ID @123abcde" — in Thai creator lists a bare "ID" is the LINE ID
const LINE_ID = /^\s*id\s*[:：]?\s*(@?[\w.\-]{3,40})\s*$/i;
// a LINE official account id on its own: "@456wxyzq"
const LINE_OA = /^@\d{3}[a-z]{4,5}$/i;
const LINE_SHORT = /^https?:\/\/(?:lin\.ee|line\.me)\/\S+$/i;

/** Suggestions for one creator: [{ field, value, label, from }] — only fields that are still empty. `rest` = what would stay in the notes. */
export function contactSuggestions(row) {
  const text = String(row.contact || "");
  const moves = [], used = new Set(), taken = new Set();
  const empty = f => !String(row[f] || "").trim() && !taken.has(f);
  const add = (field, value, label, from) => { moves.push({ field, value, label, from }); used.add(from); taken.add(field); };
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    // a full profile link
    if (SOCIAL_URL.test(s)) {
      const pl = PLATFORMS.find(p => p.re.test(s) && handleOf(p.field, s));
      if (pl && empty(pl.field)) { add(pl.field, s, pl.label, s); continue; }
      if (LINE_SHORT.test(s) && empty("contact_line")) { add("contact_line", s, "LINE", s); continue; }
      continue;
    }
    // "IG: handle"
    const m = s.match(LABELLED);
    if (m) {
      const pl = PLATFORMS.find(p => p.words.test(m[1].trim()));
      const h = m[2].replace(/^@/, "");
      if (pl && HANDLE.test(m[2]) && empty(pl.field)) { add(pl.field, pl.base + h, pl.label, s); continue; }
    }
    const id = s.match(LINE_ID);
    if (id && empty("contact_line")) { add("contact_line", id[1], "LINE", s); continue; }
    if (LINE_OA.test(s) && empty("contact_line")) { add("contact_line", s, "LINE", s); continue; }
  }
  // LINE / phone / email lines the first automatic split left behind because another field was filled then
  const sp = splitContact(text.split(/\r?\n/).filter(l => !used.has(l.trim())).join("\n"));
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !used.has(l));
  const fromOf = v => lines.find(l => l.includes(v)) || v;
  if (sp.line && empty("contact_line")) add("contact_line", sp.line, "LINE", fromOf(sp.line));
  if (sp.phone && empty("contact_phone")) add("contact_phone", sp.phone, "phone", fromOf(sp.phone));
  if (sp.email && empty("contact_email")) add("contact_email", sp.email, "email", fromOf(sp.email));
  return moves;
}

/** The contact text with the moved lines taken out. */
export function contactRest(text, moves) {
  const gone = new Set(moves.map(m => m.from));
  return String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l && !gone.has(l)).join("\n");
}

/* ---------- duplicates ---------- */
const normName = s => lower(s).normalize("NFKC").replace(/^@+/, "").replace(/[\s._\-·•|]+/g, "");
const digits = s => String(s || "").replace(/\D/g, "").replace(/^66(?=\d{9}$)/, "0");

/** Identity keys of one creator; two creators sharing a key are probably the same person. */
export function dupeKeys(r) {
  const keys = [];
  const n = normName(r.name);
  if (n.length >= 3) keys.push(["name", n]);
  for (const pl of PLATFORMS) {
    const h = handleOf(pl.field, r[pl.field]);
    if (h && h.length >= 3) { keys.push([pl.field, h]); if (normName(h) !== n && normName(h).length >= 4) keys.push(["name", normName(h)]); }
  }
  const ph = digits(r.contact_phone);
  if (ph.length >= 9) keys.push(["contact_phone", ph]);
  const line = lower(r.contact_line).replace(/^@/, "").trim();
  if (line.length >= 3 && !/^https?:/.test(line)) keys.push(["contact_line", line]);
  const em = lower(r.contact_email).trim();
  if (em.includes("@")) keys.push(["contact_email", em]);
  return keys;
}

const DUPE_COLS = `id, code, name, niches, pet_type, tier, followers_max, blacklisted, contact_line, contact_phone, contact_email,
  link_tiktok, link_ig, link_fb, link_x, link_lemon8, link_youtube, updated_at`;

/** Creators in the workspace that look like `cand` (excluding `exceptId`). Returns [{ ...row, reasons: [field…] }]. */
export async function findDupes(q, wid, cand, exceptId = null) {
  const want = new Map();
  for (const [k, v] of dupeKeys(cand)) want.set(k + "|" + v, k);
  if (!want.size) return [];
  const { rows } = await q.query(`select ${DUPE_COLS} from influencers where workspace_id=$1`, [wid]);
  const out = [];
  for (const r of rows) {
    if (r.id === exceptId) continue;
    const reasons = [...new Set(dupeKeys(r).map(([k, v]) => want.get(k + "|" + v)).filter(Boolean))].sort((x, y) => (x === "name") - (y === "name"));
    if (reasons.length) out.push({ ...r, reasons });
  }
  // a shared handle/phone is stronger than a similar name
  return out.sort((a, b) => (b.reasons.some(x => x !== "name") - a.reasons.some(x => x !== "name")) || b.reasons.length - a.reasons.length).slice(0, 10);
}

/** How many incoming spreadsheet rows (with an ID not in the database) share a handle / phone / LINE / email with an existing creator. */
export async function countLikelyDupes(q, wid, incoming) {
  const { rows } = await q.query(`select ${DUPE_COLS} from influencers where workspace_id=$1`, [wid]);
  const codes = new Set(rows.map(r => lower(r.code)));
  const keys = new Set(rows.flatMap(r => dupeKeys(r).filter(([k]) => k !== "name").map(([k, v]) => k + "|" + v)));
  return incoming.filter(r => !codes.has(lower(r.code)) && dupeKeys(r).some(([k, v]) => k !== "name" && keys.has(k + "|" + v))).length;
}

/** All groups of probable duplicates in a workspace: [{ members: [row…], reasons: [field…] }]. */
export async function dupeGroups(q, wid) {
  const { rows } = await q.query(`select ${DUPE_COLS} from influencers where workspace_id=$1 order by followers_max desc nulls last`, [wid]);
  const parent = rows.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map(), why = new Map();
  rows.forEach((r, i) => {
    for (const [k, v] of dupeKeys(r)) {
      const key = k + "|" + v;
      if (!seen.has(key)) { seen.set(key, i); continue; }
      const a = find(seen.get(key)), b = find(i);
      if (a !== b) parent[b] = a;
      const root = find(i);
      why.set(root, new Set([...(why.get(root) || []), ...(why.get(a) || []), ...(why.get(b) || []), k]));
    }
  });
  const groups = new Map();
  rows.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
  return [...groups.entries()].filter(([, m]) => m.length > 1).map(([g, members]) => ({ members, reasons: [...(why.get(g) || [])] }))
    .sort((a, b) => (b.reasons.some(x => x !== "name") - a.reasons.some(x => x !== "name")) || b.members.length - a.members.length);
}

/* ---------- merge ---------- */
const TEXT_JOIN = ["notes", "history", "brands", "sources", "contact", "link_other"]; // both kept, one after the other
const KEEP_FIRST = ["pet_name", "breed", "category", "address", "tier", "type_source", "legacy_code", "blacklist_reason",
  "followers_max", "likes_total", "link_tiktok", "link_ig", "link_fb", "link_x", "link_lemon8", "link_youtube",
  "followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube", "contact_line", "contact_phone", "contact_email"];
const NUMS = new Set(["followers_max", "likes_total", "followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube"]);
const LABEL = { pet_name: "ชื่อเล่น/คาแรกเตอร์", breed: "รายละเอียดสาย", category: "รูปแบบคอนเทนต์", address: "ที่อยู่", tier: "Tier", type_source: "ที่มาของสาย", legacy_code: "CODE เดิม", blacklist_reason: "Blacklist" };
const joinText = (a, b) => { const A = String(a || "").trim(), B = String(b || "").trim(); return !B || A.includes(B) ? A || null : !A ? B : `${A}\n${B}`; };

/** The row `keep` becomes after taking in `from`: empty fields filled, notes joined, differing values kept in notes / other links. */
export function mergedRow(keep, from) {
  const out = {}, notes = [];
  for (const k of KEEP_FIRST) {
    const a = keep[k], b = from[k];
    if (b == null || b === "") continue;
    if (a == null || a === "") { out[k] = b; continue; }
    if (NUMS.has(k)) { if (Number(b) > Number(a)) out[k] = b; continue; }
    if (String(a).trim().toLowerCase() === String(b).trim().toLowerCase()) continue;
    if (k.startsWith("link_")) out.link_other = joinText(out.link_other ?? keep.link_other, b);
    else if (k.startsWith("contact_")) out.contact = joinText(out.contact ?? keep.contact, `${k === "contact_line" ? "LINE" : k === "contact_phone" ? "โทร" : "Email"}: ${b}`);
    else if (k !== "tier" && k !== "type_source") notes.push(`${LABEL[k] || k}: ${b}`);
  }
  for (const k of TEXT_JOIN) { const v = joinText(out[k] ?? keep[k], from[k]); if (v !== (keep[k] ?? null)) out[k] = v; }
  if (notes.length) out.notes = joinText(out.notes ?? keep.notes, `[รวมจาก ${from.name}] ${notes.join(" · ")}`);
  const aliases = [...new Set([...String(keep.aliases || "").split(/\s*,\s*/), from.name, ...String(from.aliases || "").split(/\s*,\s*/)]
    .map(s => String(s || "").trim()).filter(s => s && s.toLowerCase() !== String(keep.name).toLowerCase()))].join(", ").slice(0, 1000);
  if (aliases !== (keep.aliases || "")) out.aliases = aliases || null;
  const niches = cleanKeys([...(keep.niches || []), ...(from.niches || [])]);
  if (niches.length !== (keep.niches || []).length) { out.niches = niches; out.pet_type = niches[0] || null; }
  const extra = { ...(from.extra || {}) };
  for (const [nk, f] of Object.entries(keep.extra || {})) extra[nk] = { ...(extra[nk] || {}), ...f };
  if (JSON.stringify(extra) !== JSON.stringify(keep.extra || {})) out.extra = extra;
  if (from.blacklisted && !keep.blacklisted) out.blacklisted = true;
  out.merged_count = (Number(keep.merged_count) || 1) + (Number(from.merged_count) || 1);
  return out;
}

/** Fold creator `fromId` into `keepId` (same workspace): fields, collaborations and comments move over, then `fromId` is deleted. */
export async function mergeCreators(q, wid, keepId, fromId) {
  const { rows } = await q.query("select * from influencers where workspace_id=$1 and id = any($2::uuid[]) for update", [wid, [keepId, fromId]]);
  const keep = rows.find(r => r.id === keepId), from = rows.find(r => r.id === fromId);
  if (!keep || !from) return null;
  const set = mergedRow(keep, from);
  const cols = Object.keys(set);
  const JSONB = new Set(["niches", "extra"]);
  if (cols.length) {
    await q.query(`update influencers set ${cols.map((c, i) => `${c} = $${i + 3}${JSONB.has(c) ? "::jsonb" : ""}`).join(", ")}, updated_at = now() where id=$1 and workspace_id=$2`,
      [keepId, wid, ...cols.map(c => (JSONB.has(c) ? JSON.stringify(set[c]) : set[c]))]);
  }
  const moved = (await q.query("update collaborations set influencer_id=$1, updated_at=now() where influencer_id=$2 and workspace_id=$3", [keepId, fromId, wid])).rowCount;
  await q.query("update comments set entity_id=$1 where workspace_id=$2 and entity='influencers' and entity_id=$3", [keepId, wid, fromId]);
  await q.query("delete from influencers where id=$1 and workspace_id=$2", [fromId, wid]);
  return { keep: keep.name, from: from.name, collaborations: moved };
}
