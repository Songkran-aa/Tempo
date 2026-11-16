// Creates an account from the server (useful when public sign-up is closed).
//   node server/scripts/create-user.js <email> "<first name>" "<last name>" [--password <pw>] [--lang th|en]
// Without --password a strong random password is generated and printed once.
import crypto from "node:crypto";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { registerUser } from "../routes/auth.js";

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
const password = opt("password"), lang = opt("lang") || "th";
const [email, first, last] = args;
if (!email || !first || !last) {
  console.error('Usage: node server/scripts/create-user.js <email> "<first name>" "<last name>" [--password <pw>] [--lang th|en]');
  process.exit(1);
}
await initDb();
await migrate(() => {});
const pw = password || crypto.randomBytes(12).toString("base64url");
try {
  const user = await registerUser({ first_name: first, last_name: last, email, password: pw, lang });
  console.log(`✓ created ${user.email} (${user.name})`);
  if (!password) console.log(`  temporary password: ${pw}\n  → sign in and change it in Settings → Change password`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
}
await db.close();
