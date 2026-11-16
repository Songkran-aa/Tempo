// Sets a new password for an account and signs it out everywhere (there is no e-mail reset yet).
//   node server/scripts/reset-password.js <email> [--password <new password>]
// Without --password a strong random password is generated and printed once.
import crypto from "node:crypto";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { hashPassword, normEmail } from "../lib/core.js";

const args = process.argv.slice(2);
const i = args.indexOf("--password");
const given = i >= 0 ? args.splice(i, 2)[1] : null;
const [email] = args;
if (!email) { console.error("Usage: node server/scripts/reset-password.js <email> [--password <new password>]"); process.exit(1); }
if (given && given.length < 8) { console.error("✗ password must be at least 8 characters"); process.exit(1); }
await initDb();
await migrate(() => {});
const pw = given || crypto.randomBytes(12).toString("base64url");
const { rows } = await db.query("update users set pass_hash=$2 where email=$1 returning id, email", [normEmail(email), await hashPassword(pw)]);
if (!rows.length) { console.error(`✗ no account with email ${email}`); process.exitCode = 1; }
else {
  await db.query("delete from sessions where user_id=$1", [rows[0].id]);
  console.log(`✓ new password for ${rows[0].email}${given ? "" : `: ${pw}`}\n  (all sessions signed out — change it after signing in: Settings → Change password)`);
}
await db.close();
