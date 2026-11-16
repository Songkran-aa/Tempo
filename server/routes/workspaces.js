import { db } from "../db.js";
import { EMAIL_RE, ENUMS, HttpError, ROLE_RANK, SHARE_ROLES, access, bad, forbidden, isUuid, normEmail, notFound, pruneGuests, touch, uuid } from "../lib/core.js";
import { createWorkspace, listWorkspaces } from "./auth.js";
import { config } from "../config.js";
import { notify, sendMail, mailEnabled } from "../lib/notify.js";
import { cleanNiches } from "../lib/niches.js";

// ERP data for a workspace (members only — project guests never see it)
async function erpData(wid) {
  const [partners, contracts, products, moves, expenses, events] = await Promise.all([
    db.query("select * from partners where workspace_id=$1 order by name", [wid]),
    db.query("select * from contracts where workspace_id=$1 order by end_date nulls last, created_at", [wid]),
    db.query(`select p.*, coalesce(s.on_hand, 0)::int as on_hand from products p
              left join (select product_id, sum(case when kind in ('in','return') then qty else -qty end) as on_hand from stock_moves where workspace_id=$1 group by product_id) s on s.product_id = p.id
              where p.workspace_id=$1 order by p.name`, [wid]),
    db.query("select * from stock_moves where workspace_id=$1 order by move_date desc, created_at desc limit 500", [wid]),
    db.query("select * from expenses where workspace_id=$1 order by created_at desc", [wid]),
    db.query("select * from events where workspace_id=$1 and event_date >= current_date - 400 order by event_date, start_time nulls first", [wid])
  ]);
  return { partners: partners.rows, contracts: contracts.rows, products: products.rows, stock_moves: moves.rows, expenses: expenses.rows, events: events.rows };
}
const EMPTY_ERP = { partners: [], contracts: [], products: [], stock_moves: [], expenses: [], events: [] };

// fire-and-forget email for people who do not have an account yet
function mailInvite(to, who, wsName, lang = "th") {
  if (!mailEnabled()) return;
  const link = config.appUrl || "";
  const subject = lang === "en" ? `[Tempo] ${who} invited you to “${wsName}”` : `[Tempo] ${who} ชวนคุณร่วมงาน “${wsName}”`;
  const text = lang === "en" ? `${who} invited you to work together in Tempo (${wsName}).

Create your account with this email address: ${link}` : `${who} เชิญคุณร่วมทำงานใน Tempo (${wsName})

สร้างบัญชีด้วยอีเมลนี้ได้ที่ ${link}`;
  sendMail({ to, subject, text }).catch(e => console.error("invite mail failed:", e.message));
}

export async function bootstrap(wid, userId) {
  const [w, role, members, invites, projects, tasks, campaigns, collabs, stats, types, tiers, cats, activity] = await Promise.all([
    db.query("select id, name, personal, modules, creator_niches, rev, created_at from workspaces where id=$1", [wid]),
    db.query("select role from memberships where workspace_id=$1 and user_id=$2", [wid, userId]),
    db.query(`select m.user_id, m.role, m.title, m.color, m.created_at, u.name, u.email
              from memberships m join users u on u.id = m.user_id where m.workspace_id=$1 order by m.created_at`, [wid]),
    db.query("select id, email, role, created_at from invites where workspace_id=$1 order by created_at", [wid]),
    db.query("select * from projects where workspace_id=$1 order by position, created_at", [wid]),
    db.query("select * from tasks where workspace_id=$1 order by created_at", [wid]),
    db.query("select * from campaigns where workspace_id=$1 order by created_at", [wid]),
    db.query(`select c.*, i.name as influencer_name, i.tier as influencer_tier, i.followers_max as influencer_followers,
                     i.pet_type as influencer_type, i.category as influencer_category, i.blacklisted as influencer_blacklisted
              from collaborations c join influencers i on i.id = c.influencer_id
              where c.workspace_id=$1 order by c.created_at`, [wid]),
    db.query(`select count(*)::int as total, count(*) filter (where blacklisted)::int as blacklisted,
                     count(*) filter (where coalesce(contact,'') <> '' or coalesce(contact_line,'') <> '' or coalesce(contact_phone,'') <> '' or coalesce(contact_email,'') <> '')::int as with_contact,
                     count(*) filter (where coalesce(address,'') <> '')::int as with_address
              from influencers where workspace_id=$1`, [wid]),
    // a creator in two niches counts in both
    db.query("select coalesce(e.k,'') as k, count(*)::int as n from influencers i left join lateral jsonb_array_elements_text(i.niches) e(k) on true where i.workspace_id=$1 group by 1", [wid]),
    db.query("select coalesce(tier,'') as k, count(*)::int as n from influencers where workspace_id=$1 group by 1", [wid]),
    db.query("select coalesce(category,'') as k, count(*)::int as n from influencers where workspace_id=$1 group by 1 order by 2 desc limit 50", [wid]),
    db.query(`select a.id, a.action, a.entity, a.entity_id, a.label, a.at, u.name as user_name
              from activity a left join users u on u.id = a.user_id where a.workspace_id=$1 order by a.at desc limit 25`, [wid])
  ]);
  if (!w.rows.length) throw notFound();
  const myRole = role.rows[0]?.role;
  const shares = (await db.query(`select pm.project_id, pm.user_id, pm.role, pm.created_at, u.name, u.email
                                   from project_members pm join users u on u.id = pm.user_id
                                   where pm.workspace_id=$1 order by pm.created_at`, [wid])).rows;
  const facet = rows => Object.fromEntries(rows.map(r => [r.k, r.n]));
  const shareInvites = myRole === "guest" ? [] : (await db.query("select id, project_id, email, role, created_at from project_invites where workspace_id=$1 order by created_at", [wid])).rows;
  if (myRole === "guest") {
    // a guest only sees the projects shared with them, and nothing workspace-wide (creator database, team, activity)
    const mine = new Map(shares.filter(r => r.user_id === userId).map(r => [r.project_id, r.role]));
    const inMine = r => mine.has(r.project_id);
    const visibleShares = shares.filter(inMine);
    const people = new Set(visibleShares.map(r => r.user_id));
    return {
      workspace: w.rows[0], role: myRole, myShares: Object.fromEntries(mine),
      members: members.rows.filter(m => m.role !== "guest" || people.has(m.user_id)), invites: [],
      projects: projects.rows.filter(p => mine.has(p.id)), tasks: tasks.rows.filter(inMine), campaigns: campaigns.rows.filter(inMine),
      collaborations: collabs.rows.filter(inMine), projectShares: visibleShares, shareInvites: [],
      influencerStats: { total: 0, blacklisted: 0, with_contact: 0, with_address: 0, byType: {}, byTier: {}, byCategory: {} },
      activity: [], ...EMPTY_ERP
    };
  }
  const erp = await erpData(wid);
  return {
    workspace: w.rows[0], role: myRole, members: members.rows, invites: invites.rows,
    projects: projects.rows, tasks: tasks.rows, campaigns: campaigns.rows, collaborations: collabs.rows, projectShares: shares, shareInvites,
    influencerStats: { ...stats.rows[0], byType: facet(types.rows), byTier: facet(tiers.rows), byCategory: facet(cats.rows) },
    activity: activity.rows, ...erp
  };
}

export default async function workspaceRoutes(app) {
  app.post("/api/workspaces", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const name = String(req.body?.name || "").trim();
    if (!name || name.length > 120) throw bad("validation", "Workspace name is required");
    const id = await db.tx(q => createWorkspace(q, req.user.id, name));
    return { id, workspaces: await listWorkspaces(req.user.id) };
  });

  app.get("/api/w/:wid/bootstrap", async req => {
    await access(req, req.params.wid, "viewer", { guest: true });
    return bootstrap(req.params.wid, req.user.id);
  });

  // Projects other people shared with me, from every owner, so the app can show them next to my own.
  // Each row keeps its workspace_id, which is where edits to it are sent.
  app.get("/api/shared", async req => {
    if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
    const { rows } = await db.query(`select m.workspace_id,
        (select u.name from memberships o join users u on u.id = o.user_id where o.workspace_id = m.workspace_id and o.role = 'owner' order by o.created_at limit 1) as owner_name
      from memberships m where m.user_id=$1 and m.role='guest' order by m.created_at`, [req.user.id]);
    const out = [];
    for (const r of rows) {
      const b = await bootstrap(r.workspace_id, req.user.id);
      out.push({ wid: r.workspace_id, owner_name: r.owner_name, rev: Number(b.workspace.rev), myShares: b.myShares, members: b.members,
        projects: b.projects, tasks: b.tasks, campaigns: b.campaigns, collaborations: b.collaborations, projectShares: b.projectShares });
    }
    return { items: out };
  });

  app.get("/api/w/:wid/rev", async req => {
    await access(req, req.params.wid, "viewer", { guest: true });
    const [{ rows }, unread, shared] = await Promise.all([
      db.query("select rev from workspaces where id=$1", [req.params.wid]),
      db.query("select count(*)::int n from notifications where user_id=$1 and read_at is null", [req.user.id]),
      // projects shared with me change too: one number that moves whenever any of them does
      db.query(`select coalesce(sum(w.rev), 0)::bigint as n, count(*)::int as c from memberships m join workspaces w on w.id = m.workspace_id
                where m.user_id=$1 and m.role='guest'`, [req.user.id])
    ]);
    return { rev: rows[0].rev, sharedRev: `${shared.rows[0].c}:${shared.rows[0].n}`, unread: unread.rows[0].n };
  });

  app.patch("/api/w/:wid", async req => {
    const { wid } = req.params;
    await access(req, wid, "admin");
    const body = req.body || {};
    const sets = [], vals = [wid];
    let label = "";
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name || name.length > 120) throw bad("validation", "Workspace name is required");
      vals.push(name); sets.push(`name=$${vals.length}`); label = name;
    }
    if (body.modules !== undefined) {
      // only known optional modules, booleans only; merged into what is stored
      const m = body.modules && typeof body.modules === "object" ? body.modules : {};
      const clean = Object.fromEntries(["inventory", "partners"].filter(k => k in m).map(k => [k, !!m[k]]));
      vals.push(JSON.stringify(clean)); sets.push(`modules = modules || $${vals.length}::jsonb`);
    }
    if (!sets.length) throw bad("validation", "Nothing to update");
    return db.tx(async q => {
      const r = await q.query(`update workspaces set ${sets.join(", ")} where id=$1 returning name, modules`, vals);
      return { rev: await touch(q, wid, req.user.id, "update", "workspace", wid, label || r.rows[0].name), modules: r.rows[0].modules };
    });
  });

  // creator niches ("สาย"): anyone who can edit creators manages the list. A niche taken off the list
  // leaves its creators unassigned; a rename only changes the label (the stored key stays).
  app.put("/api/w/:wid/creator-niches", async req => {
    const { wid } = req.params;
    await access(req, wid, "editor");
    const niches = cleanNiches(req.body?.niches);
    return db.tx(async q => {
      const cur = (await q.query("select creator_niches from workspaces where id=$1", [wid])).rows[0]?.creator_niches || [];
      const keep = new Set(niches.map(n => n.key));
      const gone = cur.map(n => n.key).filter(k => !keep.has(k));
      let cleared = 0;
      if (gone.length) {
        // take the removed niches off each creator (and their field values); the next niche becomes the main one
        cleared = (await q.query(`update influencers set
            niches = coalesce((select jsonb_agg(x.k order by x.n) from jsonb_array_elements_text(niches) with ordinality x(k, n) where x.k <> all($2::text[])), '[]'::jsonb),
            extra = extra - $2::text[], updated_at = now()
          where workspace_id=$1 and niches ?| $2::text[]`, [wid, gone])).rowCount;
        await q.query("update influencers set pet_type = niches->>0 where workspace_id=$1 and pet_type is distinct from niches->>0", [wid]);
      }
      await q.query("update workspaces set creator_niches = $2::jsonb where id=$1", [wid, JSON.stringify(niches)]);
      const rev = await touch(q, wid, req.user.id, "update", "workspace", wid, "creator niches");
      return { niches, cleared, rev };
    });
  });

  app.delete("/api/w/:wid", async req => {
    await access(req, req.params.wid, "owner");
    await db.query("delete from workspaces where id=$1", [req.params.wid]);
    return { ok: true, workspaces: await listWorkspaces(req.user.id) };
  });

  app.post("/api/w/:wid/invites", async req => {
    const { wid } = req.params;
    const myRole = await access(req, wid, "admin");
    const email = normEmail(req.body?.email);
    const role = req.body?.role || "editor";
    if (!EMAIL_RE.test(email)) throw bad("email_invalid", "Please enter a valid email");
    if (!["admin", "editor", "viewer"].includes(role) || ROLE_RANK[role] > ROLE_RANK[myRole]) throw bad("validation", "Invalid role");
    return db.tx(async q => {
      const u = await q.query("select id, name from users where email=$1", [email]);
      if (u.rows.length) {
        const ins = await q.query(`insert into memberships (workspace_id, user_id, role, color) values ($1,$2,$3,$4)
                                   on conflict (workspace_id, user_id) do update set role = excluded.role where memberships.role = 'guest'
                                   returning user_id`, [wid, u.rows[0].id, role, ENUMS.color[Math.floor(Math.random() * 9)]]);
        if (ins.rows.length) await q.query("delete from project_members where workspace_id=$1 and user_id=$2", [wid, u.rows[0].id]);
        if (!ins.rows.length) throw new HttpError(409, "already_member", "This person is already in the workspace");
        const ws = (await q.query("select name from workspaces where id=$1", [wid])).rows[0];
        await notify(q, { wid, users: [u.rows[0].id], actor: req.user.id, kind: "invite", entity: "workspace", entityId: wid, label: ws?.name });
        return { added: true, rev: await touch(q, wid, req.user.id, "create", "member", u.rows[0].id, u.rows[0].name) };
      }
      await q.query(`insert into invites (id, workspace_id, email, role, invited_by) values ($1,$2,$3,$4,$5)
                     on conflict (workspace_id, email) do update set role = excluded.role`, [uuid(), wid, email, role, req.user.id]);
      const ws = (await q.query("select name from workspaces where id=$1", [wid])).rows[0];
      mailInvite(email, req.user.name, ws?.name || "", req.user.lang);
      return { invited: true, rev: await touch(q, wid, req.user.id, "create", "invite", null, email) };
    });
  });

  app.delete("/api/w/:wid/invites/:id", async req => {
    const { wid, id } = req.params;
    await access(req, wid, "admin");
    if (!isUuid(id)) throw notFound();
    return db.tx(async q => {
      await q.query("delete from invites where id=$1 and workspace_id=$2", [id, wid]);
      return { rev: await touch(q, wid, req.user.id, "delete", "invite", id, null) };
    });
  });

  app.patch("/api/w/:wid/members/:uid", async req => {
    const { wid, uid } = req.params;
    const myRole = await access(req, wid);
    if (!isUuid(uid)) throw notFound();
    const self = uid === req.user.id;
    const b = req.body || {};
    const set = {};
    if ("title" in b) { if (!self && ROLE_RANK[myRole] < ROLE_RANK.admin) throw new HttpError(403, "forbidden", "No permission"); set.title = String(b.title || "").slice(0, 80) || null; }
    if ("color" in b) { if (!ENUMS.color.includes(b.color)) throw bad("validation", "color"); set.color = b.color; }
    if ("role" in b) {
      if (ROLE_RANK[myRole] < ROLE_RANK.admin || !ENUMS.role.includes(b.role) || ROLE_RANK[b.role] > ROLE_RANK[myRole]) throw new HttpError(403, "forbidden", "No permission");
      set.role = b.role;
    }
    return db.tx(async q => {
      const cur = await q.query("select role from memberships where workspace_id=$1 and user_id=$2", [wid, uid]);
      if (!cur.rows.length) throw notFound();
      if (cur.rows[0].role === "owner" && set.role && set.role !== "owner") {
        const n = await q.query("select count(*)::int n from memberships where workspace_id=$1 and role='owner'", [wid]);
        if (n.rows[0].n < 2) throw bad("last_owner", "A workspace needs at least one owner");
        if (myRole !== "owner") throw new HttpError(403, "forbidden", "No permission");
      }
      const cols = Object.keys(set);
      if (cols.length) await q.query(`update memberships set ${cols.map((c, i) => `${c}=$${i + 3}`).join(", ")} where workspace_id=$1 and user_id=$2`, [wid, uid, ...cols.map(c => set[c])]);
      return { rev: await touch(q, wid, req.user.id, "update", "member", uid, null) };
    });
  });

  app.delete("/api/w/:wid/members/:uid", async req => {
    const { wid, uid } = req.params;
    const self = uid === req.user?.id;
    const myRole = await access(req, wid, self ? "viewer" : "admin", { guest: self });
    if (!isUuid(uid)) throw notFound();
    return db.tx(async q => {
      await q.query("delete from project_members where workspace_id=$1 and user_id=$2", [wid, uid]);
      const cur = await q.query("select m.role, u.name from memberships m join users u on u.id=m.user_id where workspace_id=$1 and user_id=$2", [wid, uid]);
      if (!cur.rows.length) throw notFound();
      if (cur.rows[0].role === "owner") {
        const n = await q.query("select count(*)::int n from memberships where workspace_id=$1 and role='owner'", [wid]);
        if (n.rows[0].n < 2) throw bad("last_owner", "A workspace needs at least one owner");
        if (!self && myRole !== "owner") throw new HttpError(403, "forbidden", "No permission");
      }
      await q.query("delete from memberships where workspace_id=$1 and user_id=$2", [wid, uid]);
      return { rev: await touch(q, wid, req.user.id, "delete", "member", uid, cur.rows[0].name) };
    });
  });

  /* ---------- project sharing (with registered accounts) ---------- */
  // Managing shares needs workspace editor or higher. Guests only see the list (and can leave, below).
  async function shareTarget(req) {
    const { wid, pid } = req.params;
    await access(req, wid, "editor");
    if (!isUuid(pid)) throw notFound();
    const p = await db.query("select id, name from projects where id=$1 and workspace_id=$2", [pid, wid]);
    if (!p.rows.length) throw notFound();
    return { wid, pid, project: p.rows[0] };
  }

  app.post("/api/w/:wid/projects/:pid/shares", async req => {
    const { wid, pid, project } = await shareTarget(req);
    const email = normEmail(req.body?.email);
    const role = req.body?.role || "editor";
    if (!EMAIL_RE.test(email)) throw bad("email_invalid", "Please enter a valid email");
    if (!SHARE_ROLES.includes(role)) throw bad("validation", "Invalid role");
    const u = (await db.query("select id, name from users where email=$1", [email])).rows[0];
    if (!u) {
      // no account yet: keep the share waiting — they get the project as soon as they sign up with this email
      return db.tx(async q => {
        await q.query(`insert into project_invites (id, project_id, workspace_id, email, role, invited_by) values ($1,$2,$3,$4,$5,$6)
                       on conflict (project_id, email) do update set role = excluded.role`, [uuid(), pid, wid, email, role, req.user.id]);
        mailInvite(email, req.user.name, project.name, req.user.lang);
        return { ok: true, invited: true, rev: await touch(q, wid, req.user.id, "share", "projects", pid, `${project.name} → ${email}`) };
      });
    }
    if (u.id === req.user.id) throw bad("validation", "You already own this project");
    return db.tx(async q => {
      const m = (await q.query("select role from memberships where workspace_id=$1 and user_id=$2", [wid, u.id])).rows[0];
      if (m && m.role !== "guest") throw new HttpError(409, "already_member", "This person is already in the workspace and can see every project");
      if (!m) await q.query("insert into memberships (workspace_id, user_id, role, color) values ($1,$2,'guest',$3)", [wid, u.id, ENUMS.color[Math.floor(Math.random() * 9)]]);
      await q.query(`insert into project_members (project_id, user_id, workspace_id, role, added_by) values ($1,$2,$3,$4,$5)
                     on conflict (project_id, user_id) do update set role = excluded.role`, [pid, u.id, wid, role, req.user.id]);
      await notify(q, { wid, users: [u.id], actor: req.user.id, kind: "shared", entity: "projects", entityId: pid, label: project.name });
      return { ok: true, rev: await touch(q, wid, req.user.id, "share", "projects", pid, `${project.name} → ${u.name}`) };
    });
  });

  app.delete("/api/w/:wid/projects/:pid/invites/:id", async req => {
    const { wid, pid } = await shareTarget(req);
    if (!isUuid(req.params.id)) throw notFound();
    return db.tx(async q => {
      const r = await q.query("delete from project_invites where id=$1 and project_id=$2 and workspace_id=$3 returning email", [req.params.id, pid, wid]);
      if (!r.rows.length) throw notFound();
      return { ok: true, rev: await touch(q, wid, req.user.id, "unshare", "projects", pid, r.rows[0].email) };
    });
  });

  app.patch("/api/w/:wid/projects/:pid/shares/:uid", async req => {
    const { wid, pid } = await shareTarget(req);
    const role = req.body?.role;
    if (!SHARE_ROLES.includes(role) || !isUuid(req.params.uid)) throw bad("validation", "Invalid role");
    return db.tx(async q => {
      const r = await q.query("update project_members set role=$3 where project_id=$1 and user_id=$2 returning user_id", [pid, req.params.uid, role]);
      if (!r.rows.length) throw notFound();
      return { ok: true, rev: await touch(q, wid, req.user.id, "update", "projects", pid, null) };
    });
  });

  // remove a share: by a workspace editor, or by the guest themselves ("leave this project")
  app.delete("/api/w/:wid/projects/:pid/shares/:uid", async req => {
    const { wid, pid, uid } = req.params;
    if (!isUuid(pid) || !isUuid(uid)) throw notFound();
    const self = uid === req.user?.id;
    const myRole = await access(req, wid, "viewer", { guest: self });
    if (!self && ROLE_RANK[myRole] < ROLE_RANK.editor) throw forbidden();
    return db.tx(async q => {
      const r = await q.query("delete from project_members where project_id=$1 and user_id=$2 and workspace_id=$3 returning user_id", [pid, uid, wid]);
      if (!r.rows.length) throw notFound();
      await pruneGuests(q, wid);
      return { ok: true, rev: await touch(q, wid, req.user.id, "unshare", "projects", pid, null) };
    });
  });

  app.delete("/api/w/:wid/data", async req => {
    const { wid } = req.params;
    await access(req, wid, "owner");
    const scope = req.body?.scope === "all" ? "all" : "plans";
    return db.tx(async q => {
      await q.query("delete from collaborations where workspace_id=$1", [wid]);
      await q.query("delete from tasks where workspace_id=$1", [wid]);
      await q.query("delete from campaigns where workspace_id=$1", [wid]);
      await q.query("delete from projects where workspace_id=$1", [wid]);
      if (scope === "all") {
        for (const t of ["expenses", "events", "stock_moves", "products", "contracts", "partners", "comments", "influencers"]) await q.query(`delete from ${t} where workspace_id=$1`, [wid]);
      }
      await pruneGuests(q, wid); // their shared projects are gone
      return { rev: await touch(q, wid, req.user.id, "delete", "data", null, scope) };
    });
  });
}
