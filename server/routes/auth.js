import { db } from "../db.js";
import { config } from "../config.js";
import { EMAIL_RE, ENUMS, HttpError, bad, hashPassword, newToken, normEmail, sha256, uuid, verifyPassword } from "../lib/core.js";

export const COOKIE = "pf_session";
const LANGS = ["th", "en"];
const THEMES = ["auto", "light", "dark"];
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export const publicUser = u => ({ id: u.id, email: u.email, name: u.name, first_name: u.first_name, last_name: u.last_name, lang: u.lang, theme: u.theme, accent: u.accent, notify_email: u.notify_email !== false, cal_token: u.cal_token || null, created_at: u.created_at });

export async function createSession(reply, req, userId, remember) {
  const token = newToken();
  const days = remember ? config.sessionDays : 1;
  await db.query("insert into sessions (id, user_id, expires_at, user_agent) values ($1,$2, now() + ($3 || ' days')::interval, $4)",
    [sha256(token), userId, String(days), String(req.headers["user-agent"] || "").slice(0, 300)]);
  reply.setCookie(COOKIE, token, {
    path: "/", httpOnly: true, sameSite: "lax", secure: config.cookieSecure,
    ...(remember ? { maxAge: days * 86400 } : {})
  });
}

export async function loadSessionUser(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  const { rows } = await db.query(
    `select u.* from sessions s join users u on u.id = s.user_id where s.id = $1 and s.expires_at > now()`, [sha256(token)]);
  return rows[0] || null;
}

// The user's spaces: their own first, then each one where someone shared projects with them (labelled by the owner's name).
export async function listWorkspaces(userId) {
  const { rows } = await db.query(
    `select w.id, w.name, w.personal, m.role,
            (select u.name from memberships o join users u on u.id = o.user_id
              where o.workspace_id = w.id and o.role = 'owner' order by o.created_at limit 1) as owner_name
     from memberships m join workspaces w on w.id = m.workspace_id
     where m.user_id = $1 order by (m.role = 'owner' and w.personal) desc, m.created_at`, [userId]);
  return rows;
}

/** Everyone has a space of their own, even people who first joined through a shared project. */
export async function ensurePersonal(q, user) {
  const own = await q.query("select 1 from memberships where user_id=$1 and role='owner' limit 1", [user.id]);
  if (!own.rows.length) await createWorkspace(q, user.id, user.name, true);
}

export async function createWorkspace(q, userId, name, personal = false) {
  const id = uuid();
  await q.query("insert into workspaces (id, name, created_by, personal) values ($1,$2,$3,$4)", [id, name, userId, personal]);
  await q.query("insert into memberships (workspace_id, user_id, role, color) values ($1,$2,'owner','violet')", [id, userId]);
  return id;
}

// first/last name; accepts a single "name" too (CLI / older clients) and splits it at the first space
export function nameParts(b) {
  let first = String(b.first_name ?? "").trim(), last = String(b.last_name ?? "").trim();
  if (!("first_name" in b) && !("last_name" in b) && b.name != null) {
    const full = String(b.name).trim(); const i = full.indexOf(" ");
    first = i < 0 ? full : full.slice(0, i); last = i < 0 ? "" : full.slice(i + 1).trim();
  }
  if (!first || first.length > 60) throw bad("first_name_required", "Please enter your first name");
  if (last.length > 60) throw bad("validation", "last_name");
  return { first, last, name: last ? `${first} ${last}` : first };
}

export async function registerUser({ first_name, last_name, name, email, password, lang }) {
  const viaName = first_name === undefined && last_name === undefined;
  const p = nameParts(viaName ? { name } : { first_name, last_name });
  if (!viaName && !p.last) throw bad("last_name_required", "Please enter your last name");
  name = p.name;
  email = normEmail(email);
  lang = LANGS.includes(lang) ? lang : "th";
  if (!EMAIL_RE.test(email)) throw bad("email_invalid", "Please enter a valid email");
  if (String(password || "").length < 8) throw bad("weak_password", "Password must be at least 8 characters");
  if ((await db.query("select 1 from users where email=$1", [email])).rows.length) throw new HttpError(409, "email_taken", "This email already has an account");
  const id = uuid();
  const hash = await hashPassword(password);
  await db.tx(async q => {
    await q.query("insert into users (id, email, name, first_name, last_name, pass_hash, lang) values ($1,$2,$3,$4,$5,$6,$7)", [id, email, name, p.first, p.last, hash, lang]);
    await createWorkspace(q, id, name, true);
    const inv = await q.query("delete from invites where email=$1 returning workspace_id, role", [email]);
    for (const r of inv.rows) {
      await q.query("insert into memberships (workspace_id, user_id, role, color) values ($1,$2,$3,'blue') on conflict do nothing", [r.workspace_id, id, r.role]);
    }
    // projects shared with this email before they had an account
    const pinv = await q.query("delete from project_invites where email=$1 returning project_id, workspace_id, role, invited_by", [email]);
    for (const r of pinv.rows) {
      await q.query("insert into memberships (workspace_id, user_id, role, color) values ($1,$2,'guest','blue') on conflict do nothing", [r.workspace_id, id]);
      await q.query(`insert into project_members (project_id, user_id, workspace_id, role, added_by) values ($1,$2,$3,$4,$5)
                     on conflict (project_id, user_id) do nothing`, [r.project_id, id, r.workspace_id, r.role, r.invited_by]);
    }
  });
  return (await db.query("select * from users where id=$1", [id])).rows[0];
}

export default async function authRoutes(app) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.get("/api/config", async () => ({ signup: config.allowSignup, version: config.version, mail: !!config.smtpUrl, appUrl: config.appUrl }));

  app.post("/api/auth/register", strict, async (req, reply) => {
    // closed sign-up: only emails that someone shared a project with (or invited) may register
    if (!config.allowSignup) {
      const invited = (await db.query("select 1 from invites where email=$1 union all select 1 from project_invites where email=$1 limit 1", [normEmail(req.body?.email)])).rows.length;
      if (!invited) throw new HttpError(403, "signup_disabled", "Sign-up is by invitation only");
    }
    const user = await registerUser(req.body || {});
    await createSession(reply, req, user.id, req.body?.remember !== false);
    return { user: publicUser(user), workspaces: await listWorkspaces(user.id) };
  });

  app.post("/api/auth/login", strict, async (req, reply) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const { rows } = await db.query("select * from users where email=$1", [email]);
    const user = rows[0];
    const ok = await verifyPassword(password, user ? user.pass_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "invalid_credentials", "Email or password is incorrect");
    await db.query("update users set last_login_at = now() where id=$1", [user.id]);
    await db.query("delete from sessions where expires_at < now()");
    await createSession(reply, req, user.id, req.body?.remember !== false);
    await ensurePersonal(db, user);
    return { user: publicUser(user), workspaces: await listWorkspaces(user.id) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) await db.query("delete from sessions where id=$1", [sha256(token)]);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    await ensurePersonal(db, req.user);
    return { user: publicUser(req.user), workspaces: await listWorkspaces(req.user.id) };
  });

  // Suggestions for the "share project" picker: only people you already work with (a workspace or a shared
  // project in common). Anyone can sign up, so this must never list every account on the server; sharing with
  // anyone else still works by typing their email.
  app.get("/api/users", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const q = String(req.query?.q || "").trim().toLowerCase().slice(0, 100);
    const like = `%${q.replace(/[\\%_]/g, c => "\\" + c)}%`;
    const { rows } = await db.query(
      `select u.id, u.name, u.email from users u
       where u.id <> $1 and ($2 = '' or lower(u.email) like $3 or lower(u.name) like $3)
         and (u.id in (select m2.user_id from memberships m1 join memberships m2 on m2.workspace_id = m1.workspace_id where m1.user_id = $1 and m1.role <> 'guest')
           or u.id in (select p2.user_id from project_members p1 join project_members p2 on p2.project_id = p1.project_id where p1.user_id = $1))
       order by lower(u.name) limit 50`, [req.user.id, q, like]);
    return { users: rows };
  });

  app.patch("/api/me", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const b = req.body || {};
    const set = {};
    if ("first_name" in b || "last_name" in b || "name" in b) {
      const p = "first_name" in b || "last_name" in b
        ? nameParts({ first_name: b.first_name ?? req.user.first_name, last_name: b.last_name ?? req.user.last_name })
        : nameParts({ name: b.name });
      Object.assign(set, { first_name: p.first, last_name: p.last, name: p.name });
    }
    if ("lang" in b) { if (!LANGS.includes(b.lang)) throw bad("validation", "lang"); set.lang = b.lang; }
    if ("theme" in b) { if (!THEMES.includes(b.theme)) throw bad("validation", "theme"); set.theme = b.theme; }
    if ("notify_email" in b) set.notify_email = b.notify_email === true;
    if ("accent" in b) { if (!ENUMS.color.includes(b.accent)) throw bad("validation", "accent"); set.accent = b.accent; }
    const cols = Object.keys(set);
    if (!cols.length) return { user: publicUser(req.user) };
    const rows = await db.tx(async q => {
      const r = (await q.query(`update users set ${cols.map((c, i) => `${c}=$${i + 2}`).join(", ")} where id=$1 returning *`, [req.user.id, ...cols.map(c => set[c])])).rows;
      // the person's own space is named after them — keep it in step with their name
      if (set.name && set.name !== req.user.name) {
        await q.query("update workspaces set name=$2 where created_by=$1 and personal and name <> $2", [req.user.id, set.name]);
        // names are read live everywhere (members, assignees, comments, shares); bump revisions so open screens refresh
        await q.query("update workspaces set rev = rev + 1 where id in (select workspace_id from memberships where user_id=$1)", [req.user.id]);
      }
      return r;
    });
    return { user: publicUser(rows[0]), workspaces: set.name ? await listWorkspaces(req.user.id) : undefined };
  });

  app.post("/api/me/password", strict, async (req, reply) => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const { current, next } = req.body || {};
    if (!(await verifyPassword(String(current || ""), req.user.pass_hash))) throw bad("wrong_password", "Current password is incorrect");
    if (String(next || "").length < 8) throw bad("weak_password", "Password must be at least 8 characters");
    await db.query("update users set pass_hash=$2 where id=$1", [req.user.id, await hashPassword(next)]);
    await db.query("delete from sessions where user_id=$1", [req.user.id]);
    await createSession(reply, req, req.user.id, true);
    return { ok: true };
  });

  app.delete("/api/me", strict, async (req, reply) => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    if (!(await verifyPassword(String(req.body?.password || ""), req.user.pass_hash))) throw bad("wrong_password", "Password is incorrect");
    const uid = req.user.id;
    await db.tx(async q => {
      const owned = await q.query("select workspace_id from memberships where user_id=$1 and role='owner'", [uid]);
      for (const { workspace_id } of owned.rows) {
        // project guests never inherit a whole account: if only guests are left, the space (and its shares) goes with its owner
        const others = await q.query("select user_id, role from memberships where workspace_id=$1 and user_id<>$2 and role<>'guest' order by case role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end, created_at", [workspace_id, uid]);
        if (!others.rows.length) await q.query("delete from workspaces where id=$1", [workspace_id]);
        else if (!others.rows.some(r => r.role === "owner")) await q.query("update memberships set role='owner' where workspace_id=$1 and user_id=$2", [workspace_id, others.rows[0].user_id]);
      }
      await q.query("delete from users where id=$1", [uid]);
    });
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });
}
