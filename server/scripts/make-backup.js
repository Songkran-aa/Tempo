// Packs the real data into one dated backup folder (+ .zip) with checksums and restore notes.
//   node server/scripts/make-backup.js <out-dir> <workspace.xlsx …> [--source <original file> …]
// Every workspace file is verified (import → export → compare) before it is copied.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const outDir = args.shift();
const ws = [], src = [];
for (let i = 0; i < args.length; i++) (args[i] === "--source" ? src.push(args[++i]) : ws.push(args[i]));
if (!outDir || !ws.length) { console.error("Usage: node server/scripts/make-backup.js <out-dir> <workspace.xlsx …> [--source <file> …]"); process.exit(1); }

const here = path.dirname(fileURLToPath(import.meta.url));
execFileSync(process.execPath, [path.join(here, "verify-workspace-file.js"), ...ws], { stdio: "inherit" });

fs.mkdirSync(path.join(outDir, "sources"), { recursive: true });
const sums = [];
const put = (file, rel) => {
  const dest = path.join(outDir, rel);
  fs.copyFileSync(file, dest);
  sums.push(`${crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex")}  ${rel.replace(/\\/g, "/")}`);
};
for (const f of ws) put(f, path.basename(f));
for (const f of src) put(f, path.join("sources", path.basename(f)));
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), sums.join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "README.txt"), `Tempo — สำรองข้อมูลจริง (${new Date().toISOString().slice(0, 10)})
=========================================================

ไฟล์หลัก (นำเข้าระบบได้ทันที — รูปแบบไฟล์ Tempo):
${ws.map(f => "  - " + path.basename(f)).join("\n")}

ไฟล์ต้นฉบับ (เก็บไว้อ้างอิง):
${src.map(f => "  - sources/" + path.basename(f)).join("\n") || "  -"}

วิธีนำกลับเข้าระบบ (บนเซิร์ฟเวอร์):
  1) คัดลอกไฟล์ .xlsx ไปไว้ในโฟลเดอร์ restore/ ของโปรเจกต์บนเซิร์ฟเวอร์
  2) สร้างบัญชี (ถ้ายังไม่มี):
       docker compose exec app node server/scripts/create-user.js <อีเมล> "<ชื่อ>" "<นามสกุล>"
  3) นำเข้าทีละไฟล์:
       docker compose exec app node server/scripts/import-workspace.js restore/<ไฟล์>.xlsx <อีเมล>
  หรือในเว็บ: ตั้งค่า → ข้อมูล → นำเข้าไฟล์ Tempo (.xlsx)

ตรวจไฟล์ไม่เสีย:  sha256sum -c SHA256SUMS.txt   (Linux)

⚠ มีข้อมูลส่วนบุคคล (เบอร์โทร ที่อยู่ ของอินฟลูเอนเซอร์) — เก็บในที่ปลอดภัย ห้ามแชร์สาธารณะ
`);
const zip = path.resolve(outDir) + ".zip";
if (fs.existsSync(zip)) fs.unlinkSync(zip);
if (process.platform === "win32") execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${path.resolve(outDir)}\\*' -DestinationPath '${zip}'`], { stdio: "inherit" });
else execFileSync("zip", ["-qr", zip, "."], { cwd: outDir, stdio: "inherit" });
console.log(`\n✓ ${path.resolve(outDir)}\n✓ ${zip}\n${sums.join("\n")}`);
