// ERP glue: expense approvals, comments with @mentions, notifications, and the calendar feed (.ics).
import { db } from "../db.js";
import { config } from "../config.js";
import { ROLE_RANK, HttpError, access, bad, forbidden, guestProjects, isUuid, newToken, notFound, touch, uuid } from "../lib/core.js";
import { notify } from "../lib/notify.js";
import { SCHEMAS, labelOf } from "./resources.js";

const COMMENTABLE = ["projects", "tasks", "campaigns", "collaborations", "partners", "contracts", "products", "expenses", "events"];
const thb = n => "฿" + Number(n || 0).toLocaleString("en-US");

async function loadExpense(q, wid, id) {
  if (!isUuid(id)) throw notFound();
  const { rows } = await q.query("select * from expenses where id=$1 and workspace_id=$2", [id, wid]);
  if (!rows.length) throw notFound();
  return rows[0];
}

export default async function erpRoutes(app) {
  /* ---------------- expense approvals ---------------- */
  app.post("/api/w/:wid/expenses/:id/submit", async req => {
    const { wid, id } = req.params;
    const role = await access(req, wid, "editor");
    const approver = req.body?.approver_id;
    if (!isUuid(approver)) throw bad("validation", "Choose who approves this request");
    return db.tx(async q => {
      const e = await loadExpense(q, wid, id);
      if (!["draft", "rejected"].includes(e.status)) throw new HttpError(409, "expense_locked", "This request was already submitted");
      const m = (await q.query("select role from memberships where workspace_id=$1 and user_id=$2", [wid, approver])).rows[0];
      if (!m || ROLE_RANK[m.role] < ROLE_RANK.editor) throw bad("approver_invalid", "The approver must be an editor, admin or owner of this workspace");
      const self = approver === req.user.id;
      if (self && ROLE_RANK[role] < ROLE_RANK.admin) throw bad("self_approval", "Choose someone else to approve your request");
      const { rows } = self
        ? await q.query(`update expenses set status='approved', approver_id=$3, submitted_at=now(), decided_by=$3, decided_at=now(), decision_note=null, updated_at=now()
                         where id=$1 and workspace_id=$2 returning *`, [id, wid, approver])
        : await q.query(`update expenses set status='pending', approver_id=$3, submitted_at=now(), decided_by=null, decided_at=null, decision_note=null, updated_at=now()
                         where id=$1 and workspace_id=$2 returning *`, [id, wid, approver]);
      if (!self) await notify(q, { wid, users: [approver], actor: req.user.id, kind: "approval_request", entity: "expenses", entityId: id, label: e.title, body: thb(e.amount) });
      return { item: rows[0], rev: await touch(q, wid, req.user.id, self ? "approve" : "submit", "expenses", id, e.title) };
    });
  });

  app.post("/api/w/:wid/expenses/:id/decide", async req => {
    const { wid, id } = req.params;
    const role = await access(req, wid, "viewer");
    const decision = req.body?.decision;
    if (!["approve", "reject"].includes(decision)) throw bad("validation", "decision");
    const note = String(req.body?.note || "").slice(0, 2000) || null;
    if (decision === "reject" && !note) throw bad("reason_required", "Please give a reason");
    return db.tx(async q => {
      const e = await loadExpense(q, wid, id);
      if (e.status !== "pending") throw new HttpError(409, "not_pending", "This request is not waiting for approval");
      if (e.approver_id !== req.user.id && ROLE_RANK[role] < ROLE_RANK.admin) throw forbidden();
      const status = decision === "approve" ? "approved" : "rejected";
      const { rows } = await q.query(`update expenses set status=$3, decided_by=$4, decided_at=now(), decision_note=$5, updated_at=now()
                                      where id=$1 and workspace_id=$2 returning *`, [id, wid, status, req.user.id, note]);
      await notify(q, { wid, users: [e.created_by], actor: req.user.id, kind: status, entity: "expenses", entityId: id, label: e.title, body: note || thb(e.amount) });
      return { item: rows[0], rev: await touch(q, wid, req.user.id, decision, "expenses", id, e.title) };
    });
  });

  app.post("/api/w/:wid/expenses/:id/pay", async req => {
    const { wid, id } = req.params;
    const role = await access(req, wid, "editor");
    return db.tx(async q => {
      const e = await loadExpense(q, wid, id);
      if (e.status !== "approved") throw new HttpError(409, "not_approved", "Only approved requests can be marked as paid");
      if (e.approver_id !== req.user.id && ROLE_RANK[role] < ROLE_RANK.admin) throw forbidden();
      const { rows } = await q.query("update expenses set status='paid', paid_at=now(), updated_at=now() where id=$1 and workspace_id=$2 returning *", [id, wid]);
      await notify(q, { wid, users: [e.created_by], actor: req.user.id, kind: "paid", entity: "expenses", entityId: id, label: e.title, body: thb(e.amount) });
      return { item: rows[0], rev: await touch(q, wid, req.user.id, "pay", "expenses", id, e.title) };
    });
  });

  /* ---------------- comments ---------------- */
  async function target(q, wid, entity, id) {
    if (!COMMENTABLE.includes(entity) || !isUuid(id)) throw notFound();
    const sc = SCHEMAS[entity];
    const { rows } = await q.query(`select * from ${sc.table} where id=$1 and workspace_id=$2`, [id, wid]);
    if (!rows.length) throw notFound();
    const row = rows[0];
    let label = labelOf(sc, row);
    if (!label && entity === "collaborations") label = (await q.query("select name from influencers where id=$1", [row.influencer_id])).rows[0]?.name;
    return { sc, row, label: label || entity };
  }
  // People a project is shared with (guests) may read and write comments on that project and on its tasks,
  // campaigns, creator deals and events — viewers too: commenting is how they take part. Nothing else.
  const GUEST_COMMENTABLE = ["projects", "tasks", "campaigns", "collaborations", "events"];
  async function guestMayComment(q, wid, userId, entity, row) {
    if (!GUEST_COMMENTABLE.includes(entity)) throw forbidden();
    let pid = entity === "projects" ? row.id : row.project_id;
    if (!pid && entity === "collaborations" && row.campaign_id) pid = (await q.query("select project_id from campaigns where id=$1", [row.campaign_id])).rows[0]?.project_id;
    if (!pid || !(await guestProjects(wid, userId, q)).has(pid)) throw notFound();
  }

  app.get("/api/w/:wid/comments", async req => {
    const { wid } = req.params;
    const role = await access(req, wid, "viewer", { guest: true });
    const tg = await target(db, wid, String(req.query.entity || ""), String(req.query.id || ""));
    if (role === "guest") await guestMayComment(db, wid, req.user.id, String(req.query.entity), tg.row);
    const { rows } = await db.query(`select c.id, c.body, c.created_at, c.user_id, u.name as user_name, m.color as user_color
      from comments c left join users u on u.id = c.user_id left join memberships m on m.user_id = c.user_id and m.workspace_id = c.workspace_id
      where c.workspace_id=$1 and c.entity=$2 and c.entity_id=$3 order by c.created_at`, [wid, req.query.entity, req.query.id]);
    return { items: rows };
  });

  app.post("/api/w/:wid/comments", async req => {
    const { wid } = req.params;
    const role = await access(req, wid, "viewer", { guest: true });
    const { entity, entity_id } = req.body || {};
    const body = String(req.body?.body || "").trim();
    if (!body) throw bad("validation", "Write something first");
    if (body.length > 5000) throw bad("validation", "Comment is too long");
    return db.tx(async q => {
      const { sc, row, label } = await target(q, wid, String(entity || ""), String(entity_id || ""));
      if (role === "guest") await guestMayComment(q, wid, req.user.id, entity, row);
      const id = uuid();
      await q.query("insert into comments (id, workspace_id, entity, entity_id, user_id, body) values ($1,$2,$3,$4,$5,$6)", [id, wid, entity, entity_id, req.user.id, body]);
      // @mentions: "@Full Name" or "@email" of any member
      const members = (await q.query(`select u.id, u.name, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id=$1`, [wid])).rows;
      const low = body.toLowerCase();
      const mentioned = members.filter(m => low.includes("@" + m.name.toLowerCase()) || low.includes("@" + m.email)).map(m => m.id);
      const memberIds = new Set(members.map(m => m.id));
      const prior = (await q.query("select distinct user_id from comments where workspace_id=$1 and entity=$2 and entity_id=$3", [wid, entity, entity_id])).rows.map(r => r.user_id);
      const followers = [row[sc.notify], row.created_by, row.approver_id, ...prior].filter(u => u && memberIds.has(u) && !mentioned.includes(u));
      const snippet = body.slice(0, 300);
      await notify(q, { wid, users: mentioned, actor: req.user.id, kind: "mention", entity, entityId: entity_id, label, body: snippet });
      await notify(q, { wid, users: followers, actor: req.user.id, kind: "comment", entity, entityId: entity_id, label, body: snippet });
      const rev = await touch(q, wid, req.user.id, "comment", entity, entity_id, label);
      return { item: { id, body, created_at: new Date().toISOString(), user_id: req.user.id, user_name: req.user.name }, mentioned: mentioned.length, rev };
    });
  });

  app.delete("/api/w/:wid/comments/:id", async req => {
    const { wid, id } = req.params;
    const role = await access(req, wid, "viewer", { guest: true });
    if (!isUuid(id)) throw notFound();
    const c = (await db.query("select user_id from comments where id=$1 and workspace_id=$2", [id, wid])).rows[0];
    if (!c) throw notFound();
    if (c.user_id !== req.user.id && ROLE_RANK[role] < ROLE_RANK.admin) throw forbidden();
    await db.query("delete from comments where id=$1", [id]);
    return { ok: true };
  });

  /* ---------------- notifications ---------------- */
  app.get("/api/notifications", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const { rows } = await db.query(`select n.id, n.kind, n.entity, n.entity_id, n.label, n.body, n.read_at, n.created_at, n.workspace_id,
        a.name as actor_name, w.name as workspace_name
      from notifications n left join users a on a.id = n.actor_id left join workspaces w on w.id = n.workspace_id
      where n.user_id=$1 order by n.created_at desc limit 60`, [req.user.id]);
    return { items: rows, unread: rows.filter(r => !r.read_at).length };
  });

  app.post("/api/notifications/read", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(x => Number.isInteger(+x)).map(Number).slice(0, 200) : [];
    if (req.body?.all) await db.query("update notifications set read_at=now() where user_id=$1 and read_at is null", [req.user.id]);
    else if (ids.length) await db.query("update notifications set read_at=now() where user_id=$1 and id = any($2) and read_at is null", [req.user.id, ids]);
    const { rows } = await db.query("select count(*)::int n from notifications where user_id=$1 and read_at is null", [req.user.id]);
    return { unread: rows[0].n };
  });

  /* ---------------- calendar subscription (.ics) ---------------- */
  app.post("/api/me/calendar", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const token = newToken();
    await db.query("update users set cal_token=$2 where id=$1", [req.user.id, token]);
    return { token };
  });
  app.delete("/api/me/calendar", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    await db.query("update users set cal_token=null where id=$1", [req.user.id]);
    return { ok: true };
  });

  app.get("/api/cal/:file", async (req, reply) => {
    const token = String(req.params.file || "").replace(/\.ics$/, "");
    if (token.length < 20) throw notFound();
    const u = (await db.query("select id, name from users where cal_token=$1", [token])).rows[0];
    if (!u) throw notFound();
    const items = await calendarItems(u.id);
    reply.header("content-type", "text/calendar; charset=utf-8").header("cache-control", "no-cache");
    return toIcs(items, `Tempo — ${u.name}`);
  });
}

async function sharedCalendarItems(pids, range) {
  if (!pids.length) return [];
  const q = (sql) => db.query(sql, [pids]).then(r => r.rows);
  const [tasks, events, camps, posts, projects] = await Promise.all([
    q(`select t.id, t.title, t.due_date as d, p.name as pname from tasks t join projects p on p.id=t.project_id where t.project_id = any($1) and t.due_date ${range} and t.status <> 'done'`),
    q(`select e.id, e.title, e.event_date as d, e.start_time, e.end_time, e.location, e.link, p.name as pname from events e join projects p on p.id=e.project_id where e.project_id = any($1) and e.event_date ${range}`),
    q(`select c.id, c.name as title, c.start_date as d, c.end_date as d2, p.name as pname from campaigns c join projects p on p.id=c.project_id where c.project_id = any($1) and c.start_date ${range}`),
    q(`select c.id, i.name as title, c.post_date as d, p.name as pname from collaborations c join influencers i on i.id=c.influencer_id join campaigns k on k.id=c.campaign_id join projects p on p.id=k.project_id
       where k.project_id = any($1) and c.post_date ${range} and c.status not in ('posted','completed','declined')`),
    q(`select id, name, milestones from projects where id = any($1)`)
  ]);
  // the project name tells shared work apart from the user's own
  const out = [];
  tasks.forEach(x => out.push({ uid: `task-${x.id}`, d: x.d, title: `☑ ${x.title} · ${x.pname}` }));
  events.forEach(x => out.push({ uid: `event-${x.id}`, d: x.d, t1: x.start_time, t2: x.end_time, title: `${x.title} · ${x.pname}`, location: x.location, url: x.link }));
  camps.forEach(x => out.push({ uid: `camp-${x.id}`, d: x.d, d2: x.d2, title: `📣 ${x.title} · ${x.pname}` }));
  posts.forEach(x => out.push({ uid: `post-${x.id}`, d: x.d, title: `★ ${x.title} · ${x.pname}` }));
  projects.forEach(p => (p.milestones || []).forEach(m => { if (m.date && !m.done) out.push({ uid: `ms-${p.id}-${m.id}`, d: m.date, title: `◆ ${m.label} · ${p.name}` }); }));
  return out;
}

/* Everything with a date across the user's workspaces, from 90 days ago to a year ahead — plus the projects
   other workspaces have shared with the user (their tasks, campaigns, events, creator posts and milestones). */
export async function calendarItems(userId) {
  const ws = (await db.query("select workspace_id from memberships where user_id=$1 and role <> 'guest'", [userId])).rows.map(r => r.workspace_id);
  const shared = (await db.query("select project_id from project_members where user_id=$1 and not (workspace_id = any($2))", [userId, ws])).rows.map(r => r.project_id);
  if (!ws.length && !shared.length) return [];
  const range = "between current_date - 90 and current_date + 366";
  const q = (sql) => db.query(sql, [ws]).then(r => r.rows);
  const out = await sharedCalendarItems(shared, range);
  const [tasks, events, camps, contracts, expenses, posts, projects] = await Promise.all([
    q(`select id, title, due_date as d, status from tasks where workspace_id = any($1) and due_date ${range} and status <> 'done'`),
    q(`select id, title, event_date as d, start_time, end_time, location, link from events where workspace_id = any($1) and event_date ${range}`),
    q(`select id, name as title, start_date as d, end_date as d2 from campaigns where workspace_id = any($1) and start_date ${range}`),
    q(`select id, title, end_date as d from contracts where workspace_id = any($1) and status='active' and end_date ${range}`),
    q(`select id, title, due_date as d from expenses where workspace_id = any($1) and status in ('pending','approved') and due_date ${range}`),
    q(`select c.id, i.name as title, c.post_date as d from collaborations c join influencers i on i.id=c.influencer_id where c.workspace_id = any($1) and c.post_date ${range} and c.status not in ('posted','completed','declined')`),
    q(`select id, name, milestones from projects where workspace_id = any($1)`)
  ]);
  tasks.forEach(x => out.push({ uid: `task-${x.id}`, d: x.d, title: `☑ ${x.title}` }));
  events.forEach(x => out.push({ uid: `event-${x.id}`, d: x.d, t1: x.start_time, t2: x.end_time, title: x.title, location: x.location, url: x.link }));
  camps.forEach(x => out.push({ uid: `camp-${x.id}`, d: x.d, d2: x.d2, title: `📣 ${x.title}` }));
  contracts.forEach(x => out.push({ uid: `contract-${x.id}`, d: x.d, title: `📄 ${x.title}` }));
  expenses.forEach(x => out.push({ uid: `exp-${x.id}`, d: x.d, title: `💸 ${x.title}` }));
  posts.forEach(x => out.push({ uid: `post-${x.id}`, d: x.d, title: `★ ${x.title}` }));
  projects.forEach(p => (p.milestones || []).forEach(m => { if (m.date && !m.done) out.push({ uid: `ms-${p.id}-${m.id}`, d: m.date, title: `◆ ${m.label} · ${p.name}` }); }));
  return out;
}

const icsEsc = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = d => String(d).slice(0, 10).replace(/-/g, "");
const nextDay = d => { const x = new Date(String(d).slice(0, 10) + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
function fold(line) {
  const out = []; let s = line;
  while (Buffer.byteLength(s) > 74) { let i = 74; while (Buffer.byteLength(s.slice(0, i)) > 74) i--; out.push(s.slice(0, i)); s = " " + s.slice(i); }
  out.push(s); return out.join("\r\n");
}
export function toIcs(items, name) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const host = (config.appUrl || "tempo").replace(/^https?:\/\//, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tempo//Team Calendar//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(name)}`, "X-WR-TIMEZONE:Asia/Bangkok", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const it of items) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@${host}`, `DTSTAMP:${stamp}`);
    if (it.t1) {
      const day = icsDate(it.d);
      lines.push(`DTSTART;TZID=Asia/Bangkok:${day}T${it.t1.replace(":", "")}00`, `DTEND;TZID=Asia/Bangkok:${day}T${(it.t2 || it.t1).replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(it.d)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(it.d2 && it.d2 >= it.d ? it.d2 : it.d))}`);
    }
    lines.push(`SUMMARY:${icsEsc(it.title)}`);
    if (it.location) lines.push(`LOCATION:${icsEsc(it.location)}`);
    if (it.url) lines.push(`URL:${icsEsc(it.url)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
