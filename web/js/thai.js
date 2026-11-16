// Thai line breaking: the browser's dictionary doesn't know loanwords (โปรเจกต์, ครีเอเตอร์ …) and sometimes
// splits compounds (ข้อ|มูล), so words get torn across lines. We glue the words people actually see in
// this app with an invisible WORD JOINER between their letters, and keep a number with its Thai unit
// ("70 กรัม") on one line. Only text nodes are touched — never input/textarea values.
const WORDS = `โปรเจกต์ ครีเอเตอร์ อินฟลูเอนเซอร์ อินฟลู แคมเปญ ข้อมูล ฐานข้อมูล รายละเอียด ร่วมงาน ผู้ติดตาม การตั้งค่า
ตั้งค่า แพลตฟอร์ม เทรดดิ้ง คอนเทนต์ ไทม์ไลน์ ซัพพลายเออร์ รีวิว บิวตี้ ตัวอย่าง สินค้า งบประมาณ หมุดหมาย นัดหมาย
รายงาน ประเทศ ทั้งหมด เรียบร้อย อนุมัติ เบิกจ่าย ค่าจ้าง ใบเสร็จ กำหนดส่ง ความคืบหน้า ผู้รับผิดชอบ เงื่อนไข
หมายเหตุ แบรนด์ ยอดวิว ติดต่อ ช่องทาง ความพร้อม ประเมิน ส่งผลิต ข้อความ ภาษี บาร์โค้ด ต้นทุน ราคาขาย
ตัวแทน จำหน่าย สำนักงาน ไตรมาส ภายใน สัปดาห์ เปลี่ยนผ่าน ผ่าน น่ากิน กลุ่ม สูตร เท่านั้น สมาชิก เชิญ แชร์
เจ้าของ เข้าถึง แซลมอน ทูน่า กรัม ชิ้น ซอง แพ็ก ผู้อนุมัติ ค่าใช้จ่าย คู่ค้า สัญญา คลังสินค้า
ทีมงาน การตลาด ฝ่ายขาย ประชุม สรุป ติดตาม ทดสอบ เปิดตัว ทั่วประเทศ ความเคลื่อนไหว ล่าสุด แจ้งเตือน
คาแรกเตอร์ สกินแคร์ เครื่องสำอาง ท่องเที่ยว เครื่องดื่ม สายพันธุ์ คอนเทนต์ ส่งออก นำเข้า ไฟล์ เวอร์ชัน อีเมล รหัสผ่าน ออกจากระบบ ภาษาไทย โหมด บัญชี ลิงก์ ไลน์ โทรศัพท์ เบอร์โทร`
  .split(/\s+/).filter(Boolean);
const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;
const WJ = "⁠", ZW = "​"; // WJ glues letters; ZW marks a clean word edge so the rest re-segments correctly
const glue = w => seg ? [...seg.segment(w)].map(s => s.segment).join(WJ) : w;
const MAP = new Map(WORDS.map(w => [w, glue(w)]));
const RE = new RegExp([...MAP.keys()].sort((a, b) => b.length - a.length).join("|"), "g");
const THAI = /[฀-๿]/;
const NUM_UNIT = /(\d) (?=[฀-๿])/g;
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "CODE", "PRE"]);

export function fixThai(text) {
  if (!text || text.includes(WJ)) return text;
  if (text.includes(" · ")) text = text.replace(/ · /g, " · "); // a separator never starts a line
  if (!THAI.test(text)) return text;
  return text.replace(RE, (m, at, all) => (at > 0 && THAI.test(all[at - 1]) ? ZW : "") + MAP.get(m) + (THAI.test(all[at + m.length] || "") ? ZW : "")).replace(NUM_UNIT, "$1 ");
}
function walk(root) {
  if (root.nodeType === 3) { fixNode(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.isContentEditable) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => SKIP.has(n.parentNode?.tagName) ? 2 : 1 });
  const nodes = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
  nodes.forEach(fixNode);
}
function fixNode(n) {
  const v = n.data, f = fixThai(v);
  if (f !== v) n.data = f;
  if (DARK_EMOJI.test(n.data) && !n.parentNode?.classList?.contains("emo")) rimEmoji(n);
}
// near-black emoji (🐾 on Windows) vanish on the dark theme: wrap them so CSS can give them a light rim
const DARK_EMOJI = /🐾|🐈‍⬛|🖤/u;
function rimEmoji(n) {
  const frag = document.createDocumentFragment();
  for (const part of n.data.split(/(🐾|🐈‍⬛|🖤)/u)) {
    if (!part) continue;
    if (DARK_EMOJI.test(part)) { const i = document.createElement("i"); i.className = "emo"; i.textContent = part; frag.appendChild(i); }
    else frag.appendChild(document.createTextNode(part));
  }
  n.replaceWith(frag);
}
export function initThai() {
  walk(document.body);
  new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) walk(n); })
    .observe(document.body, { childList: true, subtree: true });
}
