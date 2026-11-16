import { db } from "../db.js";
import { ENUMS, MOVE_SIGN, ROLE_RANK, access, bad, clean, isUuid, notFound, touch, uuid, HttpError, guestProjects, guestCanWrite, pruneGuests } from "../lib/core.js";
import { notify, membersWithRole } from "../lib/notify.js";
import { ensureNiches, cleanKeys, cleanExtra } from "../lib/niches.js";

const txt = (max = 5000, req = false) => ({ t: "text", max, req });
const int = { t: "int" };
const num = { t: "num" };
const dateOrder = (a, b) => d => { if (d[a] && d[b] && d[b] < d[a]) throw bad("date_order", "End date is before start date"); };

/*
  Schema options:
    table, label (column used in the activity feed) or labelOf(row)
    fields            validated by clean()
    guest             project guests: { key, write, create, del }
    noList            no GET list route (loaded elsewhere)
    notify            member column; the member gets an "assigned" notification when it is set to them
    prepare(data)     normalise before validation of references
    check(merged)     sync validation on the merged row
    validate(q, merged, ctx)  async validation inside the transaction
    lock(cur, ctx)    throw to refuse edit/delete of an existing row
    after(q, row, prev, ctx)  side effects inside the transaction (notifications …)
*/
export const SCHEMAS = {
  projects: {
    table: "projects", label: "name", guest: { key: "id", write: true, create: false, del: false },
    fields: {
      name: txt(200, true), emoji: txt(16), color: { t: "enum", v: ENUMS.color }, description: txt(5000),
      owner_id: { t: "member" }, start_date: { t: "date" }, launch_date: { t: "date" },
      milestones: { t: "json" }, checklist: { t: "json" }, brief: { t: "json" }, position: int
    }
  },
  tasks: {
    table: "tasks", label: "title", guest: { key: "project_id", write: true, create: true, del: true }, notify: "assignee_id",
    fields: {
      project_id: { t: "ref", table: "projects" }, title: txt(500, true),
      status: { t: "enum", v: ENUMS.taskStatus }, priority: { t: "enum", v: ENUMS.priority },
      assignee_id: { t: "member" }, due_date: { t: "date" }, category: txt(100), notes: txt(20000), link: { t: "url" },
      team: txt(200), next_step: txt(2000), ref_link: { t: "url" }
    }
  },
  campaigns: {
    table: "campaigns", label: "name", guest: { key: "project_id", write: true, create: true, del: true }, notify: "owner_id",
    fields: {
      project_id: { t: "ref", table: "projects" }, name: txt(300, true), channel: txt(100),
      objective: { t: "enum", v: ENUMS.objective }, status: { t: "enum", v: ENUMS.campaignStatus },
      start_date: { t: "date" }, end_date: { t: "date" }, budget: num, spent: num,
      kpi: txt(200), target: txt(200), owner_id: { t: "member" }, notes: txt(20000)
    },
    check: dateOrder("start_date", "end_date"),
    // a campaign's creator collaborations and expenses always sit in the campaign's project
    after: async (q, row, prev) => {
      if (!prev || prev.project_id === row.project_id) return;
      for (const table of ["collaborations", "expenses"]) {
        await q.query(`update ${table} set project_id=$1, updated_at=now() where campaign_id=$2 and workspace_id=$3`, [row.project_id, row.id, row.workspace_id]);
      }
    }
  },
  influencers: {
    table: "influencers", label: "name", noList: true,
    // a niche typed in the creator form joins the workspace's niche list
    validate: async (q, d, ctx) => {
      const keys = typeof d.niches === "string" ? JSON.parse(d.niches) : d.niches || [];
      if (keys.length) await ensureNiches(q, ctx.wid, keys);
    },
    fields: {
      code: txt(60), name: txt(200, true), aliases: txt(1000), pet_name: txt(300), breed: txt(300),
      pet_type: txt(60), niches: { t: "json" }, extra: { t: "json" }, tier: { t: "enum", v: ENUMS.tier },
      followers_max: int, followers_ig: int, followers_tiktok: int, followers_fb: int, followers_lemon8: int, followers_x: int, followers_youtube: int, likes_total: int,
      link_tiktok: { t: "url" }, link_ig: { t: "url" }, link_fb: { t: "url" }, link_x: { t: "url" }, link_lemon8: { t: "url" }, link_youtube: { t: "url" },
      link_other: txt(2000), contact: txt(3000), contact_line: txt(120), contact_phone: txt(60), contact_email: txt(200), address: txt(3000),
      brands: txt(1000), history: txt(50000), notes: txt(20000), blacklisted: { t: "bool" }, blacklist_reason: txt(1000),
      legacy_code: txt(200), sources: txt(3000), type_source: txt(60), category: txt(200)
    },
    prepare: d => {
      const f = ["followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube"].map(k => d[k]).filter(v => v != null);
      if (f.length && d.followers_max == null) d.followers_max = Math.max(...f);
      if ("blacklist_reason" in d && d.blacklist_reason && !("blacklisted" in d)) d.blacklisted = true;
      // niches is the list; pet_type mirrors its first key (older clients that only send pet_type still work)
      if ("niches" in d) {
        const keys = cleanKeys(JSON.parse(d.niches));
        d.niches = JSON.stringify(keys);
        d.pet_type = keys[0] || null;
      } else if ("pet_type" in d) d.niches = JSON.stringify(d.pet_type ? [d.pet_type] : []);
      if ("extra" in d) d.extra = JSON.stringify(cleanExtra(JSON.parse(d.extra)));
    }
  },
  collaborations: {
    table: "collaborations", label: "title", guest: { key: "project_id", write: false }, notify: "owner_id",
    fields: {
      influencer_id: { t: "ref", table: "influencers", req: true }, campaign_id: { t: "ref", table: "campaigns" },
      project_id: { t: "ref", table: "projects" }, title: txt(300), status: { t: "enum", v: ENUMS.collabStatus },
      deal_type: { t: "enum", v: ENUMS.dealType }, platform: { t: "enum", v: ENUMS.platform },
      fee: num, product_value: num, deliverables: txt(2000), post_date: { t: "date" }, post_url: { t: "url" },
      views: int, likes: int, comments: int, shares: int, owner_id: { t: "member" }, notes: txt(20000),
      pic: txt(120), source: txt(120), lead_status: txt(300), contract: { t: "bool" }, affiliate_link_sent: { t: "bool" }, brief_sent: { t: "bool" },
      tracking_number: txt(120), shipping_status: txt(120), drafts: { t: "json" }, posts: { t: "json" }, followups: { t: "json" }
    },
    resolve: projectFromCampaign
  },

  /* ---------------- ERP ---------------- */
  partners: {
    table: "partners", label: "name", notify: "owner_id",
    fields: {
      kind: { t: "enum", v: ENUMS.partnerKind }, name: txt(200, true), contact_name: txt(200), email: { t: "email" }, phone: txt(100),
      address: txt(2000), tax_id: txt(40), website: { t: "url" }, tags: txt(500), notes: txt(20000), log: { t: "json" }, owner_id: { t: "member" }
    }
  },
  contracts: {
    table: "contracts", label: "title", notify: "owner_id",
    fields: {
      partner_id: { t: "ref", table: "partners" }, project_id: { t: "ref", table: "projects" }, title: txt(300, true),
      status: { t: "enum", v: ENUMS.contractStatus }, value: num, start_date: { t: "date" }, end_date: { t: "date" },
      link: { t: "url" }, remind_days: int, owner_id: { t: "member" }, notes: txt(20000)
    },
    check: d => { dateOrder("start_date", "end_date")(d); if (d.remind_days != null && d.remind_days > 365) throw bad("validation", "remind_days is too large"); }
  },
  products: {
    table: "products", label: "name",
    fields: {
      sku: txt(60), name: txt(300, true), category: txt(120), unit: txt(30), cost: num, price: num, reorder_level: int,
      barcode: txt(60), partner_id: { t: "ref", table: "partners" }, project_id: { t: "ref", table: "projects" },
      active: { t: "bool", def: true }, notes: txt(20000)
    }
  },
  stock_moves: {
    table: "stock_moves", labelOf: r => `${r.kind} ${r.qty}`,
    fields: {
      product_id: { t: "ref", table: "products", req: true }, kind: { t: "enum", v: ENUMS.moveKind, req: true }, qty: { t: "int", req: true },
      move_date: { t: "date" }, partner_id: { t: "ref", table: "partners" }, collaboration_id: { t: "ref", table: "collaborations" },
      unit_cost: num, note: txt(2000)
    },
    prepare: d => { if ("move_date" in d && !d.move_date) delete d.move_date; },
    check: d => { if (!(d.qty > 0)) throw bad("validation", "qty must be more than 0"); },
    // never let stock go below zero; tell owners/admins when a product reaches its reorder level
    validate: async (q, row, { id }) => {
      const { rows } = await q.query(`select coalesce(sum(case when kind in ('in','return') then qty else -qty end), 0)::int as n
                                      from stock_moves where product_id=$1 and ($2::uuid is null or id <> $2)`, [row.product_id, id || null]);
      if (rows[0].n + MOVE_SIGN[row.kind] * row.qty < 0) throw bad("stock_negative", "Not enough stock for this move");
    },
    after: async (q, row, prev, { wid, req }) => {
      const p = (await q.query(`select p.name, p.reorder_level, coalesce(sum(case when m.kind in ('in','return') then m.qty else -m.qty end), 0)::int as on_hand
                               from products p left join stock_moves m on m.product_id = p.id where p.id=$1 group by p.id`, [row.product_id])).rows[0];
      if (p && p.reorder_level != null && p.on_hand <= p.reorder_level && MOVE_SIGN[row.kind] < 0) {
        await notify(q, { wid, users: await membersWithRole(q, wid, ["owner", "admin"]), actor: req.user.id, kind: "low_stock", entity: "products", entityId: row.product_id, label: p.name, body: `${p.on_hand}` });
      }
    }
  },
  expenses: {
    table: "expenses", label: "title",
    // status / approver / decision fields are only changed by the approval endpoints below
    fields: {
      title: txt(300, true), kind: { t: "enum", v: ENUMS.expenseKind }, amount: { t: "num", req: true },
      expense_date: { t: "date" }, due_date: { t: "date" }, partner_id: { t: "ref", table: "partners" }, project_id: { t: "ref", table: "projects" },
      campaign_id: { t: "ref", table: "campaigns" }, contract_id: { t: "ref", table: "contracts" }, receipt_link: { t: "url" }, notes: txt(20000)
    },
    resolve: projectFromCampaign,
    lock: (cur, { role, req }) => {
      if (["draft", "rejected"].includes(cur.status)) return;
      if (ROLE_RANK[role] >= ROLE_RANK.admin) return;
      throw new HttpError(409, "expense_locked", "This request is waiting for approval or already approved — ask an admin to change it");
    }
  },
  events: {
    table: "events", label: "title",
    fields: {
      title: txt(300, true), event_date: { t: "date", req: true }, start_time: { t: "time" }, end_time: { t: "time" },
      location: txt(300), link: { t: "url" }, attendees: { t: "members" }, project_id: { t: "ref", table: "projects" }, notes: txt(20000)
    },
    check: d => { if (d.start_time && d.end_time && d.end_time < d.start_time) throw bad("date_order", "End time is before start time"); },
    after: async (q, row, prev, { wid, req }) => {
      const before = new Set(prev?.attendees || []);
      const added = (row.attendees || []).filter(u => !before.has(u));
      if (added.length) await notify(q, { wid, users: added, actor: req.user.id, kind: "invited_event", entity: "events", entityId: row.id, label: row.title, body: `${row.event_date}${row.start_time ? " " + row.start_time : ""}` });
    }
  }
};

const ph = (f, i) => (f.t === "json" || f.t === "members" ? `$${i}::jsonb` : `$${i}`);
export const labelOf = (sc, row) => (sc.labelOf ? sc.labelOf(row) : row[sc.label]);

/** A row tied to a campaign always takes the campaign's project, so per-project views and budgets add up. */
async function projectFromCampaign(q, data, wid, cur) {
  if (!("campaign_id" in data) && !("project_id" in data)) return;
  const campaignId = "campaign_id" in data ? data.campaign_id : cur?.campaign_id;
  if (!campaignId) return;
  const c = (await q.query("select project_id from campaigns where id=$1 and workspace_id=$2", [campaignId, wid])).rows[0];
  if (c) data.project_id = c.project_id;
}

export async function checkRefs(fields, data, wid, q = db) {
  for (const [k, f] of Object.entries(fields)) {
    const v = data[k];
    if (v == null) continue;
    if (f.t === "ref") {
      const { rows } = await q.query(`select 1 from ${fields[k].table} where id=$1 and workspace_id=$2`, [v, wid]);
      if (!rows.length) throw bad("validation", `${k} not found in this workspace`);
    } else if (f.t === "member") {
      const { rows } = await q.query("select 1 from memberships where user_id=$1 and workspace_id=$2", [v, wid]);
      if (!rows.length) throw bad("validation", `${k} is not a member of this workspace`);
    } else if (f.t === "members") {
      const ids = JSON.parse(v);
      if (!ids.length) continue;
      const { rows } = await q.query("select count(*)::int n from memberships where workspace_id=$1 and user_id = any($2) and role <> 'guest'", [wid, ids]);
      if (rows[0].n !== ids.length) throw bad("validation", `${k} must be members of this workspace`);
    }
  }
}

async function afterWrite(q, sc, row, prev, ctx) {
  if (sc.notify) {
    const u = row[sc.notify];
    if (u && u !== prev?.[sc.notify]) await notify(q, { wid: ctx.wid, users: [u], actor: ctx.req.user.id, kind: "assigned", entity: ctx.name, entityId: row.id, label: labelOf(sc, row) });
  }
  await sc.after?.(q, row, prev, ctx);
}

const dup = e => { if (e.code === "23505") throw new HttpError(409, "duplicate", "This item already exists"); throw e; };

export default async function resourceRoutes(app) {
  for (const [name, sc] of Object.entries(SCHEMAS)) {
    if (!sc.noList) {
      app.get(`/api/w/:wid/${name}`, async req => {
        const role = await access(req, req.params.wid, "viewer", { guest: !!sc.guest });
        const { rows } = await db.query(`select * from ${sc.table} where workspace_id=$1 order by created_at`, [req.params.wid]);
        if (role !== "guest") return { items: rows };
        const shares = await guestProjects(req.params.wid, req.user.id);
        return { items: rows.filter(r => shares.has(r[sc.guest.key])) };
      });
    }

    app.post(`/api/w/:wid/${name}`, async req => {
      const { wid } = req.params;
      const role = await access(req, wid, "editor", { guest: !!sc.guest?.create });
      const data = clean(sc.fields, req.body);
      sc.prepare?.(data);
      sc.check?.(data);
      if (role === "guest") guestCanWrite(await guestProjects(wid, req.user.id), data.project_id);
      await checkRefs(sc.fields, data, wid);
      await sc.resolve?.(db, data, wid, null);
      const id = isUuid(req.body?.id) ? req.body.id : uuid();
      const cols = Object.keys(data);
      const params = [id, wid, req.user.id, ...cols.map(c => data[c])];
      const sql = `insert into ${sc.table} (id, workspace_id, created_by${cols.map(c => ", " + c).join("")})
                   values ($1, $2, $3${cols.map((c, i) => ", " + ph(sc.fields[c], i + 4)).join("")}) returning *`;
      const ctx = { req, wid, role, name, id: null };
      return db.tx(async q => {
        if (sc.validate) await sc.validate(q, data, ctx);
        const { rows } = await q.query(sql, params);
        await afterWrite(q, sc, rows[0], null, ctx);
        const rev = await touch(q, wid, req.user.id, "create", name, id, labelOf(sc, rows[0]));
        return { item: rows[0], rev };
      }).catch(dup);
    });

    app.patch(`/api/w/:wid/${name}/:id`, async req => {
      const { wid, id } = req.params;
      const role = await access(req, wid, "editor", { guest: !!sc.guest?.write });
      if (!isUuid(id)) throw notFound();
      const data = clean(sc.fields, req.body, { partial: true });
      sc.prepare?.(data);
      const cur = (await db.query(`select * from ${sc.table} where id=$1 and workspace_id=$2`, [id, wid])).rows[0];
      if (!cur) throw notFound();
      const ctx = { req, wid, role, name, id };
      if (role === "guest") {
        const shares = await guestProjects(wid, req.user.id);
        if (!shares.has(cur[sc.guest.key])) throw notFound();
        guestCanWrite(shares, cur[sc.guest.key]);
        if ("project_id" in data) guestCanWrite(shares, data.project_id);
      }
      sc.lock?.(cur, ctx);
      sc.check?.({ ...cur, ...data });
      await checkRefs(sc.fields, data, wid);
      await sc.resolve?.(db, data, wid, cur);
      const cols = Object.keys(data);
      if (!cols.length) throw bad("validation", "Nothing to update");
      const sql = `update ${sc.table} set ${cols.map((c, i) => `${c} = ${ph(sc.fields[c], i + 3)}`).join(", ")}, updated_at = now()
                   where id = $1 and workspace_id = $2 returning *`;
      return db.tx(async q => {
        if (sc.validate) await sc.validate(q, { ...cur, ...data, ...Object.fromEntries(cols.filter(c => sc.fields[c].t === "members").map(c => [c, JSON.parse(data[c])])) }, ctx);
        const { rows } = await q.query(sql, [id, wid, ...cols.map(c => data[c])]);
        if (!rows.length) throw notFound();
        await afterWrite(q, sc, rows[0], cur, ctx);
        const rev = await touch(q, wid, req.user.id, "update", name, id, labelOf(sc, rows[0]));
        return { item: rows[0], rev };
      }).catch(dup);
    });

    app.delete(`/api/w/:wid/${name}/:id`, async req => {
      const { wid, id } = req.params;
      const role = await access(req, wid, "editor", { guest: !!sc.guest?.del });
      if (!isUuid(id)) throw notFound();
      const cur = (await db.query(`select * from ${sc.table} where id=$1 and workspace_id=$2`, [id, wid])).rows[0];
      if (!cur) throw notFound();
      if (role === "guest") guestCanWrite(await guestProjects(wid, req.user.id), cur[sc.guest.key]);
      sc.lock?.(cur, { req, wid, role, name, id });
      if (name === "stock_moves" && MOVE_SIGN[cur.kind] > 0) {
        // removing a receipt must not leave negative stock
        const left = (await db.query(`select coalesce(sum(case when kind in ('in','return') then qty else -qty end), 0)::int n from stock_moves where product_id=$1 and id <> $2`, [cur.product_id, id])).rows[0].n;
        if (left < 0) throw bad("stock_negative", "Not enough stock for this move");
      }
      return db.tx(async q => {
        const { rows } = await q.query(`delete from ${sc.table} where id=$1 and workspace_id=$2 returning *`, [id, wid]);
        if (!rows.length) throw notFound();
        if (name === "projects") await pruneGuests(q, wid); // shares cascade with the project
        await q.query("delete from comments where workspace_id=$1 and entity=$2 and entity_id=$3", [wid, name, id]);
        const rev = await touch(q, wid, req.user.id, "delete", name, id, labelOf(sc, rows[0]));
        return { ok: true, rev };
      });
    });
  }
}

