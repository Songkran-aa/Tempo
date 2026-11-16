// Builds a made-up influencer workbook in the Influencer_Database_Master.xlsx layout for the tests.
// Every name, contact and address here is fictional — real creator data must never live in the repo.
import ExcelJS from "exceljs";

export const SAMPLE = {
  total: 800, main: 364, other: 436, blacklisted: 6, mainBlacklisted: 2, mainNiche: "บิวตี้",
  star: { code: "BTY-0001", name: "sample.creator", followers: 1250000, likes: 194600000 }
};

const HEAD = ["ID", "Account Name", "สาย / ประเภท", "ประเภทมาจาก", "Tier", "Follower สูงสุด", "Follower TikTok", "Like รวม",
  "Link TikTok", "Contact", "ที่อยู่จัดส่ง", "⚠ Blacklist", "รหัสเดิม", "จำนวนรายการที่รวม"];

function addSheet(wb, sheet, prefix, niche, count, blacklisted) {
  const ws = wb.addWorksheet(sheet);
  ws.addRow(HEAD);
  for (let i = 1; i <= count; i++) {
    const code = `${prefix}-${String(i).padStart(4, "0")}`;
    const star = code === SAMPLE.star.code;
    const name = star ? SAMPLE.star.name : `sample_${prefix.toLowerCase()}_${i}`;
    const followers = star ? SAMPLE.star.followers : Math.max(500, 900000 - i * 997);
    const row = ws.addRow([
      code, name, niche, "Sheet", null, followers, followers,
      star ? SAMPLE.star.likes : followers * 12,
      `https://www.tiktok.com/@${name}`,
      i % 3 === 0 ? `LINE: ${name}\n${name}@example.com` : null,
      i % 5 === 0 ? `${i} ถนนตัวอย่าง แขวงทดสอบ เขตสมมติ กรุงเทพฯ 10000` : null,
      i > count - blacklisted ? "ข้อมูลทดสอบ: ส่งงานไม่ตรงเวลา" : null,
      i % 7 === 0 ? `OLD-${i}` : null,
      1
    ]);
    // big like counts in a date-formatted cell: ExcelJS reads them as an Invalid Date, the importer must recover the number
    if (star) row.getCell(8).numFmt = "d/m/yyyy";
  }
}

export async function sampleInfluencerXlsx() {
  const wb = new ExcelJS.Workbook();
  addSheet(wb, "Beauty", "BTY", SAMPLE.mainNiche, SAMPLE.main, SAMPLE.mainBlacklisted);
  addSheet(wb, "Tech", "TEC", "ไอที", SAMPLE.other, SAMPLE.blacklisted - SAMPLE.mainBlacklisted);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
