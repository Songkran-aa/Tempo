// Verifies every translation key used in web/js exists in both Thai and English.
import fs from "node:fs";
import path from "node:path";
import { DICT } from "../web/js/i18n.js";
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") && files.push(path.join(d, e.name)));
walk("web/js");
const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/["'`]((?:[a-z]+[A-Za-z]*)\.[A-Za-z_]+)["'`]/g)) if (/^(app|nav|common|confirm|date|time|auth|home|act|entity|bucket|view|board|filter|tasks|taskStatus|priority|camp|campStatus|objective|channel|inf|pipe|collabStatus|deal|platform|pet|tier|checkState|tl|projects|project|settings|role|theme|spot|toast|err|erp|notif|pkind|cst|mv|xk|xst|list)\./.test(m[1])) used.add(m[1]);
}
const dyn = {
  bucket: ["late", "today", "week", "doing", "later", "none"], nav: ["home", "tasks", "influencers", "campaigns", "projects", "timeline", "calendar", "finance", "inventory", "partners", "more"],
  role: ["owner", "admin", "editor", "viewer", "guest"], theme: ["auto", "light", "dark"],
  taskStatus: ["todo", "doing", "waiting", "review", "approved", "done"], priority: ["high", "med", "low"], campStatus: ["draft", "planned", "live", "paused", "done"],
  objective: ["awareness", "consideration", "conversion", "retention", "sellin"], checkState: ["todo", "waiting", "review", "ready", "na"],
  collabStatus: ["shortlist", "contacted", "negotiating", "confirmed", "shipped", "content", "posted", "completed", "declined"], deal: ["paid", "barter", "affiliate", "free"],
  platform: ["tiktok", "instagram", "facebook", "youtube", "x", "lemon8", "other"], tier: ["Mega", "Macro", "Micro", "Nano"], channel: ["social", "kol", "ecommerce", "ads", "crm", "retail", "event", "pr"],
  act: ["create", "update", "delete", "import", "share", "unshare", "comment", "submit", "approve", "reject", "pay"],
  notif: ["assigned", "mention", "comment", "approval_request", "approved", "rejected", "paid", "invited_event", "low_stock", "contract_expiring", "shared", "invite"],
  pkind: ["supplier", "agency", "customer", "retailer", "media", "other"], cst: ["draft", "active", "expired", "terminated"], mv: ["in", "return", "out", "sample", "damaged"],
  xk: ["purchase", "expense", "creator_fee", "ads", "travel", "other"], xst: ["draft", "pending", "approved", "rejected", "paid"],
  "erp.layer": ["events", "tasks", "marketing", "finance", "partners"],
  entity: ["projects", "tasks", "campaigns", "influencers", "collaborations", "member", "invite", "workspace", "sample", "data", "partners", "contracts", "products", "stock_moves", "expenses", "events"],
  err: ["invalid_credentials", "email_taken", "weak_password", "name_required", "email_invalid", "signup_disabled", "forbidden", "not_found", "validation", "duplicate", "csrf", "rate_limited", "unauthorized", "wrong_password", "last_owner", "already_member", "file_required", "xlsx_only", "xlsx_invalid", "xlsx_empty", "date_order", "server_error", "bad_request", "user_not_found", "stock_negative", "expense_locked", "self_approval", "approver_invalid", "not_pending", "not_approved", "reason_required"]
};
for (const [p, ks] of Object.entries(dyn)) ks.forEach(k => used.add(`${p}.${k}`));
["inf.blacklist", "inf.platform", "inf.sort", "inf.type", "inf.tier", "inf.category", "inf.contact", "inf.address"].forEach(k => used.delete(k)); // data-filter attributes, not keys
let bad = 0;
for (const k of [...used].sort()) for (const l of ["th", "en"]) if (!(k in DICT[l])) { console.log(`missing ${l}: ${k}`); bad++; }
const extra = Object.keys(DICT.th).filter(k => !(k in DICT.en)).concat(Object.keys(DICT.en).filter(k => !(k in DICT.th)));
extra.forEach(k => { console.log("only in one language:", k); bad++; });
console.log(bad ? `${bad} problems` : `i18n OK — ${used.size} keys used, ${Object.keys(DICT.th).length} defined`);
process.exit(bad ? 1 : 0);
