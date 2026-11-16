// Old creator records keep every contact in one free-text box ("Line : abc", "Tel : 08…", "x@y.com").
// splitContact() pulls the LINE ID, phone and email out into their own fields; anything it can't read
// with confidence (IG/TikTok handles, "Inbox Tiktok", a second LINE …) stays in the notes text.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const LINE_URL = /https?:\/\/line\.me\/\S+/i;
// "Line : x", "ID Line: x", "Line ID : x", "Line(For work): x", "for work line : x", "@line: x", "line • x", "ʟɪɴᴇ ɪᴅ x", "ไลน์ x"
const LINE_LABEL = /^\s*(?:@?\s*)?(?:for\s*work\s*)?(?:id\s*)?(?:line|ʟɪɴᴇ|ไลน์)(?:\s*(?:id|ɪᴅ|oa|official))?(?:\s*\([^)]*\))?\s*[:：•\-]?\s*(.+?)\s*$/i;
const PHONE_LABEL = /^\s*(?:tel|phone|mobile|mob|โทร(?:ศัพท์)?|เบอร์(?:โทร)?)\.?\s*[:：]?\s*(.+?)\s*$/i;
const PHONE = /^\+?[\d\s\-().]{9,16}$/;
const digits = s => s.replace(/\D/g, "");
const isThaiPhone = s => PHONE.test(s) && /^(?:0\d{8,9}|66\d{8,9})$/.test(digits(s));

export function splitContact(text) {
  const out = { line: "", phone: "", email: "", rest: "" };
  if (!text || !String(text).trim()) return out;
  const keep = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    let m;
    if ((m = s.match(EMAIL)) && s.replace(m[0], "").replace(/^(?:e-?mail|mail|อีเมล)\s*[:：]?\s*$/i, "").trim() === "") {
      if (!out.email) { out.email = m[0]; continue; }
      if (out.email === m[0]) continue;
    } else if ((m = s.match(LINE_URL)) && s.replace(m[0], "").replace(/^(?:line|ไลน์)\s*[:：]?\s*$/i, "").trim() === "") {
      if (!out.line) { out.line = m[0]; continue; }
      if (out.line === m[0]) continue;
    } else if ((m = s.match(PHONE_LABEL)) && isThaiPhone(m[1])) {
      if (!out.phone) { out.phone = m[1]; continue; }
      if (digits(out.phone) === digits(m[1])) continue;
    } else if ((m = s.match(LINE_LABEL)) && m[1] && !/\s{2,}/.test(m[1]) && m[1].length <= 60) {
      m[1] = m[1].replace(/^(\S+)\s+\([^)]*\)$/, "$1"); // "pierschitra (pieas)" → the id; the nickname is noise
      if (!out.line) { out.line = m[1]; continue; }
      if (out.line.toLowerCase() === m[1].toLowerCase()) continue;
    } else if (isThaiPhone(s)) {
      if (!out.phone) { out.phone = s; continue; }
      if (digits(out.phone) === digits(s)) continue;
    }
    keep.push(s);
  }
  // a lone word left behind next to an email ("mail") is just its label
  out.rest = keep.filter(s => !(out.email && /^(?:e-?mail|mail|อีเมล)$/i.test(s))).join("\n");
  return out;
}

/** Split rows whose LINE/phone/email are all empty but whose old contact text has them. Returns the number of rows changed. */
export async function splitLegacyContacts(q) {
  const { rows } = await q.query(`select id, contact from influencers
    where coalesce(contact,'') <> '' and coalesce(contact_line,'') = '' and coalesce(contact_phone,'') = '' and coalesce(contact_email,'') = ''`);
  let n = 0;
  for (const r of rows) {
    const s = splitContact(r.contact);
    if (!s.line && !s.phone && !s.email) continue;
    await q.query(`update influencers set contact_line = $2, contact_phone = $3, contact_email = $4, contact = $5 where id = $1`,
      [r.id, s.line || null, s.phone || null, s.email || null, s.rest || null]);
    n++;
  }
  return n;
}
