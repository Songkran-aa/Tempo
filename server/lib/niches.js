// Creator niches ("สาย"): a per-workspace list of { key, label, emoji, fields }. influencers.niches stores the keys
// (influencers.pet_type mirrors the first one). The key never changes once used (renaming edits the label), so no
// creator rows need rewriting. fields = the niche's own extra fields ({ key, label }), values live in influencers.extra.
export const MAX_NICHES = 60;
export const MAX_CREATOR_NICHES = 10;
export const MAX_FIELDS = 12;
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const firstSymbol = v => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)][0]?.segment : [...s][0];
  return (seg || "").slice(0, 16);
};
export const DEFAULT_EMOJI = "🏷️";

function cleanFields(list) {
  const out = [], seen = new Set();
  for (const f of Array.isArray(list) ? list : []) {
    const label = str(f?.label ?? f?.key, 40);
    const key = str(f?.key, 40) || label;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push({ key, label: label || key });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/** Validate a list coming from a client: unique keys, a label and one symbol each, and the niche's own fields. */
export function cleanNiches(list) {
  const out = [], seen = new Set();
  for (const n of Array.isArray(list) ? list : []) {
    const label = str(n?.label ?? n?.key, 60);
    const key = str(n?.key, 60) || label;
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    const fields = cleanFields(n?.fields);
    out.push({ key, label: label || key, emoji: firstSymbol(n?.emoji) || DEFAULT_EMOJI, ...(fields.length ? { fields } : {}) });
    if (out.length >= MAX_NICHES) break;
  }
  return out;
}

/** A creator's niche keys: strings, trimmed, unique (case-insensitive), at most MAX_CREATOR_NICHES. */
export function cleanKeys(list) {
  const out = [], seen = new Set();
  for (const k of Array.isArray(list) ? list : []) {
    const s = str(k, 60);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= MAX_CREATOR_NICHES) break;
  }
  return out;
}

/** extra = { nicheKey: { fieldKey: text } } — drop anything else, cap sizes. */
export function cleanExtra(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [nk, fields] of Object.entries(v).slice(0, MAX_NICHES)) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
    const o = {};
    for (const [fk, val] of Object.entries(fields).slice(0, MAX_FIELDS * 2)) {
      const s = String(val ?? "").trim().slice(0, 1000);
      const k = str(fk, 40);
      if (s && k) o[k] = s;
    }
    if (Object.keys(o).length) out[str(nk, 60)] = o;
  }
  return out;
}

/** Text in a sheet/import cell → niche words: "บิวตี้, อาหาร" → ["บิวตี้", "อาหาร"]. */
export const splitNicheCell = v => String(v ?? "").split(/\s*[,\n;、]\s*/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);

/** Map words (a key or a label, any case) to the workspace's keys; unknown words stay as they are (they become new niches). */
export function resolveKeys(words, niches) {
  const by = new Map();
  for (const n of niches || []) { by.set(String(n.key).toLowerCase(), n.key); by.set(String(n.label).toLowerCase(), n.key); }
  return cleanKeys(words.map(w => by.get(String(w).toLowerCase()) || w));
}

export const loadNiches = async (q, wid) => (await q.query("select creator_niches from workspaces where id=$1", [wid])).rows[0]?.creator_niches || [];

/** Add any niche keys a creator uses that the workspace list doesn't have yet (typed in the form or imported),
 *  and any niche fields that imported values need. */
export async function ensureNiches(q, wid, keys, fieldsByNiche = {}) {
  const want = [...new Set(keys.map(k => str(k, 60)).filter(Boolean))];
  const fieldNiches = Object.keys(fieldsByNiche);
  if (!want.length && !fieldNiches.length) return;
  const cur = await loadNiches(q, wid);
  const have = new Set(cur.map(n => String(n.key).toLowerCase()));
  const add = want.filter(k => !have.has(k.toLowerCase())).map(k => ({ key: k, label: k, emoji: DEFAULT_EMOJI }));
  let next = [...cur, ...add].slice(0, MAX_NICHES), changed = add.length > 0 && cur.length < MAX_NICHES;
  for (const nk of fieldNiches) {
    const n = next.find(x => x.key === nk);
    if (!n) continue;
    const fields = n.fields || [];
    const more = [...fieldsByNiche[nk]].filter(fk => !fields.some(f => f.key === fk || f.label === fk)).map(fk => ({ key: fk, label: fk }));
    if (more.length && fields.length < MAX_FIELDS) { next = next.map(x => (x === n ? { ...n, fields: [...fields, ...more].slice(0, MAX_FIELDS) } : x)); changed = true; }
  }
  if (changed) await q.query("update workspaces set creator_niches = $2::jsonb where id=$1", [wid, JSON.stringify(next)]);
}
