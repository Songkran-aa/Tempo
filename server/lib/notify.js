// In-app notifications (+ optional email digest of them).
// notify() is called inside the write transaction, so a rolled-back change never notifies anyone.
// Emails are sent afterwards by a small dispatcher that picks up rows with emailed_at = null.
import { db } from "../db.js";
import { config } from "../config.js";

/** users: array of user ids (duplicates and the actor are skipped). */
export async function notify(q, { wid, users, actor, kind, entity = null, entityId = null, label = null, body = null }) {
  const to = [...new Set((users || []).filter(u => u && u !== actor))];
  for (const u of to) {
    await q.query(`insert into notifications (user_id, workspace_id, actor_id, kind, entity, entity_id, label, body)
                   values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [u, wid || null, actor || null, kind, entity, entityId, label ? String(label).slice(0, 200) : null, body ? String(body).slice(0, 1000) : null]);
  }
  return to.length;
}

/** Workspace members with one of the given roles (e.g. owners/admins for stock alerts). */
export async function membersWithRole(q, wid, roles) {
  const { rows } = await q.query("select user_id from memberships where workspace_id=$1 and role = any($2)", [wid, roles]);
  return rows.map(r => r.user_id);
}

/* ---------------- email ---------------- */
const SUBJECT = {
  th: {
    assigned: "{who} มอบหมาย “{label}” ให้คุณ", mention: "{who} กล่าวถึงคุณใน “{label}”", comment: "{who} แสดงความคิดเห็นใน “{label}”",
    approval_request: "{who} ขออนุมัติ “{label}”", approved: "{who} อนุมัติ “{label}” แล้ว", rejected: "{who} ไม่อนุมัติ “{label}”", paid: "“{label}” จ่ายเงินแล้ว",
    invited_event: "{who} เชิญคุณเข้าร่วม “{label}”", low_stock: "สินค้าใกล้หมด: {label}", contract_expiring: "สัญญาใกล้หมดอายุ: {label}",
    shared: "{who} แชร์ “{label}” กับคุณ", invite: "{who} เชิญคุณเข้าพื้นที่ทำงาน “{label}”"
  },
  en: {
    assigned: "{who} assigned “{label}” to you", mention: "{who} mentioned you in “{label}”", comment: "{who} commented on “{label}”",
    approval_request: "{who} asks you to approve “{label}”", approved: "{who} approved “{label}”", rejected: "{who} rejected “{label}”", paid: "“{label}” has been paid",
    invited_event: "{who} invited you to “{label}”", low_stock: "Low stock: {label}", contract_expiring: "Contract expiring: {label}",
    shared: "{who} shared “{label}” with you", invite: "{who} invited you to the workspace “{label}”"
  }
};
export function subjectFor(lang, kind, who, label) {
  const d = SUBJECT[lang] || SUBJECT.th;
  return (d[kind] || kind).replace("{who}", who || "Tempo").replace("{label}", label || "");
}

let transport = null;
export const mailEnabled = () => !!config.smtpUrl;
async function getTransport() {
  if (!transport) {
    const nodemailer = (await import("nodemailer")).default;
    transport = nodemailer.createTransport(config.smtpUrl);
  }
  return transport;
}

export async function sendMail({ to, subject, text }) {
  if (!mailEnabled()) return false;
  const tr = await getTransport();
  await tr.sendMail({ from: config.mailFrom, to, subject, text });
  return true;
}

/** Sends pending notification emails. Safe to run on several instances (row locks). */
export async function dispatchEmails(limit = 50) {
  if (!mailEnabled()) return 0;
  const rows = await db.tx(async q => {
    const { rows } = await q.query(`select n.id, n.kind, n.label, n.body, n.entity, n.entity_id, n.workspace_id, u.email, u.lang, u.notify_email, a.name as actor_name, w.name as ws_name
      from notifications n join users u on u.id = n.user_id left join users a on a.id = n.actor_id left join workspaces w on w.id = n.workspace_id
      where n.emailed_at is null and n.created_at > now() - interval '1 day'
      order by n.created_at limit $1 for update of n skip locked`, [limit]);
    if (rows.length) await q.query("update notifications set emailed_at = now() where id = any($1)", [rows.map(r => r.id)]);
    return rows;
  });
  let sent = 0;
  for (const r of rows) {
    if (!r.notify_email) continue;
    const subject = subjectFor(r.lang, r.kind, r.actor_name, r.label);
    const link = config.appUrl ? `${config.appUrl}/#open/${r.entity || ""}/${r.entity_id || ""}` : "";
    const text = [subject, r.body ? `\n${r.body}` : "", r.ws_name ? `\n— ${r.ws_name}` : "", link ? `\n\n${link}` : "",
      `\n\n${r.lang === "en" ? "Turn these emails off in Tempo → Settings → Notifications." : "ปิดอีเมลแจ้งเตือนได้ที่ Tempo → ตั้งค่า → การแจ้งเตือน"}`].join("");
    try { await sendMail({ to: r.email, subject: `[Tempo] ${subject}`, text }); sent++; } catch (e) { console.error("mail failed:", e.message); }
  }
  return sent;
}

/** Daily-ish reminders computed from data: contracts that are about to end. Idempotent per day. */
export async function remindContracts() {
  const { rows } = await db.query(`select c.id, c.title, c.workspace_id, c.owner_id, c.created_by from contracts c
    where c.status = 'active' and c.end_date is not null and c.end_date between current_date and current_date + c.remind_days
      and not exists (select 1 from notifications n where n.entity='contracts' and n.entity_id=c.id and n.kind='contract_expiring' and n.created_at > now() - interval '7 days')`);
  for (const c of rows) {
    await db.tx(q => notify(q, { wid: c.workspace_id, users: [c.owner_id || c.created_by], actor: null, kind: "contract_expiring", entity: "contracts", entityId: c.id, label: c.title }));
  }
  return rows.length;
}

let timer = null;
export function startBackgroundJobs() {
  if (timer) return;
  let ticks = 0;
  const run = async () => {
    try {
      if (ticks++ % 120 === 0) await remindContracts(); // every hour
      await dispatchEmails();
    } catch (e) { console.error("background job:", e.message); }
  };
  timer = setInterval(run, 30000);
  timer.unref?.();
  setTimeout(run, 5000).unref?.();
}
export function stopBackgroundJobs() { clearInterval(timer); timer = null; }
