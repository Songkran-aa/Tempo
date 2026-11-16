import { t, getLang } from "./i18n.js";

/* ---------------- icons ---------------- */
export const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  checklist: '<path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  gantt: '<path d="M3 3v18h18"/><path d="M7 7h7M10 12h8M8 17h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  checkSmall: '<path d="M20 6 9 17l-5-5"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  chevU: '<path d="m18 15-6-6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  swap: '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m22 7-10 6L2 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h3l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  store: '<path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2V7z"/>',
  mouse: '<path d="m3 3 7 19 2.5-7.5L20 12z"/>',
  tent: '<path d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  diamond: '<path d="M12 2 22 12 12 22 2 12z"/>',
  table: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.46L22 3z"/>',
  paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  arrowIn: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  arrowOut: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  wifiOff: '<path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M2 2l20 20"/>'
};
export const icon = (n, s = 20, w = 2) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
export const iconInline = (n, s = 14) => icon(n, s).replace('class="ic"', 'class="ic inline"');
export const logoImg = (s = 40, cls = "") => `<img class="logo-img ${cls}" src="/assets/logo-mark.svg" width="${s}" height="${s}" alt="">`;
export const APP_NAME = "Tempo";

/* ---------------- helpers ---------------- */
export const $ = id => document.getElementById(id);
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const uid = () => crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ (Math.random() * 16) >> c / 4).toString(16));
export const todayISO = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diffDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
export const firstOfMonth = (iso, add = 0) => { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + add, 1)).toISOString().slice(0, 10); };
export const monthShort = m => t("date.months").split(",")[m];
export function fmtDate(iso, withYear) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  const showYear = withYear || y !== todayISO().slice(0, 4);
  return getLang() === "th" ? `${+d} ${monthShort(+m - 1)}${showYear ? " " + y.slice(2) : ""}` : `${monthShort(+m - 1)} ${+d}${showYear ? ", " + y : ""}`;
}
export function fmtLong(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const day = t("date.days").split(",")[d.getUTCDay()];
  return getLang() === "th" ? `วัน${day}ที่ ${d.getUTCDate()} ${monthShort(d.getUTCMonth())} ${d.getUTCFullYear()}` : `${day}, ${monthShort(d.getUTCMonth())} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function relDay(iso) {
  const n = diffDays(todayISO(), iso);
  if (n === 0) return t("date.today");
  if (n === 1) return t("date.tomorrow");
  if (n === -1) return t("date.yesterday");
  return n > 0 ? t("date.inDays", { n }) : t("date.daysAgo", { n: -n });
}
export const fmtNum = n => {
  if (n == null || n === "") return "—";
  n = Number(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
};
export const money = n => (n == null || n === "" || Number(n) === 0 ? "—" : "฿" + Number(n).toLocaleString(getLang() === "th" ? "th-TH" : "en-US"));
export const moneyShort = n => { n = Number(n) || 0; return n ? "฿" + fmtNum(n) : "—"; };
const hashStr = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };
export const colorFor = s => ["blue", "indigo", "violet", "pink", "orange", "green", "teal"][hashStr(s) % 7];
export function initials(name) {
  const s = String(name || "?").replace(/^[^\p{L}\p{N}]+/u, "").trim() || "?";
  if (/^[A-Za-z]/.test(s)) { const p = s.split(/\s+/); return (p.length > 1 ? p[0][0] + p[1][0] : s.slice(0, 2)).toUpperCase(); }
  const chars = Array.from(s).filter(c => !/[ัิ-ฺ็-๎]/.test(c));
  return (/[เแโใไ]/.test(chars[0]) ? chars[1] || chars[0] : chars[0]) || "?";
}
export const safeUrl = raw => { try { const u = new URL(raw); return ["https:", "http:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
export const debounce = (fn, ms = 300) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };

/* ---------------- domain constants ---------------- */
export const PALETTE = ["blue", "indigo", "violet", "purple", "pink", "red", "orange", "yellow", "green", "teal", "gray"];
// Brand indigo first = default. Optional 3rd/4th entries: lighter variant for dark mode.
export const ACCENTS = { indigo: ["#4F46E5", "79,70,229", "#7A73FF", "122,115,255"], violet: ["#7C5CFF", "124,92,255"], blue: ["#0A84FF", "10,132,255"], pink: ["#FF375F", "255,55,95"], orange: ["#FF8A1F", "255,138,31"], green: ["#30C25B", "48,194,91"], teal: ["#20A8C4", "32,168,196"] };
const mk = (keys, colors, prefix) => keys.map((key, i) => ({ key, color: colors[i], get label() { return t(`${prefix}.${key}`); } }));
export const TASK_ST = mk(["todo", "doing", "waiting", "review", "approved", "done"], ["gray", "blue", "orange", "purple", "teal", "green"], "taskStatus");
export const PRIORITIES = mk(["high", "med", "low"], ["red", "orange", "gray"], "priority");
export const CAMP_ST = mk(["draft", "planned", "live", "paused", "done"], ["gray", "blue", "green", "orange", "indigo"], "campStatus");
export const OBJECTIVES = mk(["awareness", "consideration", "conversion", "retention", "sellin"], ["violet", "blue", "orange", "green", "teal"], "objective");
export const CHECK_ST = mk(["todo", "waiting", "review", "ready", "na"], ["gray", "orange", "purple", "green", "gray"], "checkState");
export const COLLAB_ST = mk(["shortlist", "contacted", "negotiating", "confirmed", "shipped", "content", "posted", "completed", "declined"], ["gray", "blue", "orange", "indigo", "teal", "purple", "pink", "green", "red"], "collabStatus");
export const DEALS = mk(["paid", "barter", "affiliate", "free"], ["green", "orange", "blue", "gray"], "deal");
export const PLATFORMS = mk(["tiktok", "instagram", "facebook", "youtube", "x", "lemon8", "other"], ["gray", "pink", "blue", "red", "gray", "yellow", "gray"], "platform");
export const CHANNELS = [
  ["social", "heart", "pink"], ["kol", "star", "violet"], ["ecommerce", "cart", "orange"], ["ads", "mouse", "blue"],
  ["crm", "message", "green"], ["retail", "store", "yellow"], ["event", "tent", "teal"], ["pr", "news", "indigo"]
].map(([key, ic, color]) => ({ key, icon: ic, color, get label() { return t(`channel.${key}`); } }));
const LEGACY_CH = { "Social Media": "social", "KOL / Influencer": "kol", "E-commerce": "ecommerce", "Paid Ads": "ads", "CRM / LINE OA": "crm", "หน้าร้าน / Retail": "retail", "Event / Activation": "event", "PR / สื่อ": "pr" };
export const chOf = v => CHANNELS.find(c => c.key === v || c.key === LEGACY_CH[v]) || { key: v, icon: "megaphone", color: "gray", label: v || t("common.none") };
// Creator niches ("สาย") belong to the workspace: [{ key, label, emoji }] — beauty, food, tech… whatever the team works with.
// influencers.pet_type holds the key; a key the list doesn't know yet still shows (as its own text).
export const NICHES = () => S.data?.workspace?.creator_niches || [];
export const nicheOf = k => (k ? NICHES().find(n => n.key === k) || { key: k, label: k, emoji: "🏷️" } : null);
export const PARTNER_KINDS = mk(["supplier", "agency", "customer", "retailer", "media", "other"], ["orange", "violet", "green", "yellow", "pink", "gray"], "pkind");
export const CONTRACT_ST = mk(["draft", "active", "expired", "terminated"], ["gray", "green", "orange", "red"], "cst");
export const MOVE_KINDS = mk(["in", "return", "out", "sample", "damaged"], ["green", "teal", "blue", "violet", "red"], "mv");
export const MOVE_SIGN = { in: 1, return: 1, out: -1, sample: -1, damaged: -1 };
export const EXP_KINDS = mk(["purchase", "expense", "creator_fee", "ads", "travel", "other"], ["orange", "blue", "violet", "pink", "teal", "gray"], "xk");
export const EXP_ST = mk(["draft", "pending", "approved", "rejected", "paid"], ["gray", "orange", "teal", "red", "green"], "xst");
export const TIERS = mk(["Mega", "Macro", "Micro", "Nano"], ["pink", "violet", "blue", "teal"], "tier");
export const byKey = (list, k) => list.find(x => x.key === k);
export const BUCKETS = {
  late: { color: "red", icon: "alert" }, today: { color: "orange", icon: "clock" }, week: { color: "blue", icon: "calendar" },
  doing: { color: "indigo", icon: "zap" }, later: { color: "gray" }, none: { color: "gray" }
};

/* ---------------- state ---------------- */
export const S = {
  config: {}, user: null, workspaces: [], wid: null, data: null, online: true,
  ui: {
    authMode: "signin", authError: "",
    taskView: (() => { try { return localStorage.getItem("pf.taskView") || "table"; } catch { return "table"; } })(), groupBy: "project", showDone: false, q: "",
    f: { project: "", status: "", assignee: "", priority: "", mine: false, bucket: "" },
    cf: { project: "", status: "", channel: "", owner: "" }, cq: "", campView: (() => { try { return localStorage.getItem("pf.campView") || "table"; } catch { return "table"; } })(),
    tlStart: firstOfMonth(todayISO(), -1), tlProject: "",
    projTab: "overview", nextTab: "", lastRoute: "", setTab: "me",
    infView: "directory", pipeCampaign: "",
    invq: "", inv: { tab: "products", low: false, cat: "" },
    pq: "", pf: { tab: "partners", kind: "", cst: "" },
    xf: { tab: "all", status: "", project: "" },
    calMonth: firstOfMonth(todayISO()), calDay: todayISO(), calOff: {}
  },
  unread: 0,
  inf: { items: [], total: 0, page: 0, loading: false, done: false, q: "", type: "", category: "", tier: "", platform: "", contact: false, address: false, blacklist: "exclude", sort: "followers", stamp: 0 }
};

export const D = () => S.data;
export const role = () => S.data?.role || "viewer";
export const canEdit = () => ["owner", "admin", "editor"].includes(role());
export const isAdmin = () => ["owner", "admin"].includes(role());
// guest = this workspace was shared with me project by project; I only see those projects
export const isGuest = () => role() === "guest";
// One account, one place. Projects other people shared with me are merged in; each keeps its owner's workspace_id.
export const isSharedProject = pid => { const p = S.data?.projects.find(x => x.id === pid); return !!p && !!p.workspace_id && p.workspace_id !== S.wid; };
export const sharedOwner = pid => { const p = S.data?.projects.find(x => x.id === pid); return p && p.workspace_id !== S.wid ? S.data?.sharedFrom?.[p.workspace_id] || "" : ""; };
// where a record is saved: its own workspace_id, else its project's, else my account
export const widOf = x => x?.workspace_id || S.data?.projects.find(p => p.id === x?.project_id)?.workspace_id
  || S.data?.projects.find(p => p.id === S.data?.campaigns.find(c => c.id === x?.campaign_id)?.project_id)?.workspace_id || S.wid;
// optional modules (inventory, partners) are switched on per workspace in Settings
export const modOn = k => !isGuest() && S.data?.workspace?.modules?.[k] === true;
// a project shared with me: only if I was given edit rights; everything else in my own account: my role
export const canEditProject = pid => isSharedProject(pid) ? S.data?.myShares?.[pid] === "editor" : canEdit() || (isGuest() && !!pid && S.data?.myShares?.[pid] === "editor");
export const projectShares = pid => (S.data?.projectShares || []).filter(s => s.project_id === pid);
export const proj = id => S.data?.projects.find(p => p.id === id);
export const camp = id => S.data?.campaigns.find(c => c.id === id);
export const member = id => S.data?.members.find(m => m.user_id === id);
export const memberName = id => member(id)?.name || "";
export const isDone = t => t.status === "done";
export const partner = id => S.data?.partners?.find(p => p.id === id);
export const product = id => S.data?.products?.find(p => p.id === id);
export const contract = id => S.data?.contracts?.find(c => c.id === id);
export const isAdmin2 = () => ["owner", "admin"].includes(role());
// an expense can be edited while it is a draft / was rejected (admins: always)
export const expenseEditable = e => canEdit() && (!e || ["draft", "rejected"].includes(e.status) || isAdmin2());
export const canDecide = e => e?.status === "pending" && (e.approver_id === S.user?.id || isAdmin2());
export const canPay = e => e?.status === "approved" && canEdit() && (e.approver_id === S.user?.id || isAdmin2());
export const isLow = p => p.active !== false && p.reorder_level != null && (p.on_hand ?? 0) <= p.reorder_level;
export const daysTo = iso => diffDays(todayISO(), String(iso).slice(0, 10));
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("time.justNow");
  if (s < 3600) return t("time.minutes", { n: Math.floor(s / 60) });
  if (s < 86400) return t("time.hours", { n: Math.floor(s / 3600) });
  return t("time.days", { n: Math.floor(s / 86400) });
}
export function bucketOf(task) {
  if (!task.due_date) return "none";
  const n = diffDays(todayISO(), task.due_date);
  return n < 0 ? "late" : n === 0 ? "today" : n <= 7 ? "week" : "later";
}
export const isLaunchMs = m => m.key === "launch";
export function projStats(p) {
  const ts = S.data.tasks.filter(x => x.project_id === p.id);
  const done = ts.filter(isDone).length;
  const ck = (p.checklist || []).filter(c => c.state !== "na");
  const ready = ck.filter(c => c.state === "ready").length;
  return {
    total: ts.length, open: ts.length - done, done, pct: ts.length ? Math.round(done / ts.length * 100) : 0,
    ready, ckTotal: ck.length, readyPct: ck.length ? Math.round(ready / ck.length * 100) : 0,
    camps: S.data.campaigns.filter(c => c.project_id === p.id).length,
    creators: S.data.collaborations.filter(c => c.project_id === p.id).length
  };
}
export const sortTasks = list => list.slice().sort((a, b) => (isDone(a) - isDone(b)) || (a.due_date || "9999").localeCompare(b.due_date || "9999") || (["high", "med", "low"].indexOf(a.priority) - ["high", "med", "low"].indexOf(b.priority)));
export function filteredTasks() {
  const f = S.ui.f, q = S.ui.q.trim().toLowerCase();
  return S.data.tasks.filter(x =>
    (!f.project || x.project_id === f.project) &&
    (!f.status || x.status === f.status) &&
    (!f.assignee || x.assignee_id === f.assignee) &&
    (!f.priority || (x.priority || "med") === f.priority) &&
    (!f.mine || x.assignee_id === S.user.id) &&
    (!f.bucket || (f.bucket === "doing" ? x.status === "doing" : (!isDone(x) && bucketOf(x) === f.bucket))) &&
    (!q || [x.title, x.notes, x.category, memberName(x.assignee_id), proj(x.project_id)?.name].join(" ").toLowerCase().includes(q)));
}
export function newProjectData(lang, extra = {}) {
  const T = TEMPLATES[lang] || TEMPLATES.th;
  return {
    id: uid(), name: "", emoji: "🚀", color: "blue", description: "", owner_id: S.user?.id || null, start_date: null, launch_date: null,
    milestones: T.milestones.map((label, i) => ({ id: uid(), label, date: "", done: false, ...(i === 4 ? { key: "launch" } : {}) })),
    checklist: T.checklist.map(label => ({ id: uid(), label, state: "todo", note: "" })),
    brief: T.brief.map(label => ({ id: uid(), label, value: "" })),
    ...extra
  };
}
export const TEMPLATES = {
  th: {
    milestones: ["Kick-off", "สรุป Brief", "อนุมัติครีเอทีฟ", "ผลิต / เตรียมความพร้อม", "วันเปิดตัว", "สรุปผล"],
    checklist: ["ข้อมูลสินค้า / บริการครบถ้วน", "ต้นทุนและราคาขาย", "ช่องทางขายและคู่เทียบ", "Key Message และ Positioning", "สื่อและ Artwork", "สต๊อก / ความพร้อมส่งมอบ", "อนุมัติเปิดตัว", "แผนวัดผลหลังเปิดตัว"],
    brief: ["กลุ่มเป้าหมาย", "ปัญหา / ความต้องการ", "จุดเด่น (Benefit)", "เหตุผลที่น่าเชื่อ (RTB)", "Key Message", "คู่แข่ง / คู่เทียบ", "ช่องทางหลัก", "สิ่งที่ต้องตัดสินใจ"]
  },
  en: {
    milestones: ["Kick-off", "Brief signed off", "Creative approved", "Production ready", "Launch day", "Wrap-up report"],
    checklist: ["Product / service details complete", "Cost and pricing", "Channels and competitors", "Key message and positioning", "Assets and artwork", "Stock / delivery ready", "Launch approval", "Post-launch measurement plan"],
    brief: ["Target audience", "Problem / need", "Key benefit", "Reason to believe", "Key message", "Competitors", "Main channels", "Open decisions"]
  }
};
export const EMOJIS = ["🚀", "✨", "🎯", "📦", "🛍️", "📣", "💡", "📈", "🎉", "💄", "🍜", "🏠", "🧴", "🌿", "🎨", "🏷️", "🧪", "🏆"];
