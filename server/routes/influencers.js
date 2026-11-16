import { db } from "../db.js";
import { config } from "../config.js";
import { access, bad, isUuid, notFound, touch, uuid } from "../lib/core.js";
import { buildInfluencerWorkbook, parseInfluencerWorkbook, tierFrom } from "../lib/influencer-xlsx.js";
import { PLATFORM_LINKS, handleOf } from "../lib/platform-links.js";
import { splitContact } from "../lib/contact-split.js";
import { ensureNiches, loadNiches, resolveKeys } from "../lib/niches.js";
import { contactSuggestions, contactRest, countLikelyDupes, dupeGroups, findDupes, mergeCreators } from "../lib/creator-tools.js";

const LIGHT = `i.id, i.code, i.name, i.aliases, i.pet_name, i.breed, i.pet_type, i.niches, i.tier, i.followers_max, i.followers_ig, i.followers_tiktok,
  i.followers_fb, i.followers_lemon8, i.followers_x, i.followers_youtube, i.link_tiktok, i.link_ig, i.link_fb, i.link_x, i.link_lemon8, i.link_youtube,
  i.link_other, left(i.contact, 160) as contact, i.contact_line, i.contact_phone, i.contact_email,
  (coalesce(i.address,'') <> '') as has_address, i.category, i.brands, i.blacklisted, i.blacklist_reason, i.updated_at`;

const SORTS = {
  followers: "i.followers_max desc nulls last, i.name",
  name: "lower(i.name)",
  recent: "i.updated_at desc",
  collabs: "collab_count desc, i.followers_max desc nulls last"
};

const IMPORT_COLS = ["code", "name", "aliases", "pet_name", "breed", "pet_type", "type_source", "tier", "followers_max", "followers_ig", "followers_tiktok",
  "followers_fb", "followers_lemon8", "followers_x", "followers_youtube", "likes_total", "link_tiktok", "link_ig", "link_fb", "link_x", "link_lemon8", "link_youtube",
  "link_other", "contact", "contact_line", "contact_phone", "contact_email", "address",
  "brands", "history", "notes", "blacklisted", "blacklist_reason", "legacy_code", "sources", "merged_count", "category", "niches", "extra"];
const JSONB = new Set(["niches", "extra"]);

/** Spreadsheet niche words and "<niche>: <field>" columns → the workspace keys (new niches / fields are added). */
async function resolveImportNiches(q, wid, rows) {
  const niches = await loadNiches(q, wid);
  const fieldsByNiche = {};
  const out = rows.map(r => {
    const keys = resolveKeys(r.niches || (r.pet_type ? [r.pet_type] : []), niches);
    const extra = {};
    for (const [h, v] of Object.entries(r._extra || {})) {
      const i = h.indexOf(":"), nl = h.slice(0, i).trim(), fl = h.slice(i + 1).trim();
      const n = niches.find(x => [x.key, x.label].some(z => String(z).toLowerCase() === nl.toLowerCase()));
      const nk = n?.key || nl;
      const fk = n?.fields?.find(f => [f.key, f.label].some(z => String(z).toLowerCase() === fl.toLowerCase()))?.key || fl;
      (extra[nk] ||= {})[fk] = v;
      if (!n?.fields?.some(f => f.key === fk)) (fieldsByNiche[nk] ||= new Set()).add(fk);
    }
    const { _extra, ...rest } = r;
    return { ...rest, niches: keys, pet_type: keys[0] || null, extra };
  });
  // a field column for a niche nobody has yet still creates that niche
  await ensureNiches(q, wid, [...out.flatMap(r => r.niches), ...Object.keys(fieldsByNiche)], fieldsByNiche);
  return out;
}

/* ---------- files from outside Tempo (Kalodata, agency lists …): match creators by their platform handle ---------- */
const PLAT_FOLLOWERS = ["followers_ig", "followers_tiktok", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube"];
// what an outside file may refresh on a creator it matched by handle; everything else only fills fields that are empty
const REFRESH = new Set([...PLAT_FOLLOWERS, "followers_max", "likes_total"]);
const HANDLE_FIELDS = PLATFORM_LINKS.map(p => p.field);
const empty = v => v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

/**
 * Rows without a Tempo ID that this workspace doesn't know (a file exported from another tool) are matched to an
 * existing creator through the same TikTok / IG / X / YouTube / Lemon8 / Facebook handle, so a re-import refreshes
 * follower counts instead of creating a duplicate. A handle shared by two creators is ambiguous and never matched.
 */
export async function matchByHandle(q, wid, rows, { unknownCodes = false } = {}) {
  const { rows: existing } = await q.query(`select ${IMPORT_COLS.join(", ")} from influencers where workspace_id=$1`, [wid]);
  const codes = new Set(existing.map(e => e.code));
  const byHandle = new Map();
  for (const e of existing) for (const f of HANDLE_FIELDS) {
    const h = handleOf(e[f]); if (!h) continue;
    const k = f + ":" + h;
    byHandle.set(k, byHandle.has(k) && byHandle.get(k) !== e ? null : e);
  }
  let matched = 0;
  const out = rows.map(r => {
    // rows with an ID of their own are matched by that ID (a Tempo file links collaborations by it); only rows without one
    // (the parser gives them IMP-…), or any unknown ID when the caller asks (creator file upload), are matched by handle
    if (codes.has(r.code) || !(unknownCodes || String(r.code).startsWith("IMP-"))) return r;
    const hit = HANDLE_FIELDS.map(f => { const h = handleOf(r[f]); return h ? byHandle.get(f + ":" + h) : undefined; }).find(Boolean);
    if (!hit) return r;
    matched++;
    const m = { ...r, code: hit.code, name: hit.name };
    for (const c of IMPORT_COLS) {
      if (c === "code" || c === "name" || REFRESH.has(c) || c === "blacklisted") continue;
      if (!empty(hit[c])) m[c] = c === "niches" ? [] : c === "extra" ? {} : null; // keep what the team already has
    }
    // biggest audience across the platforms we now know; the tier follows it when it was the automatic one
    const fol = PLAT_FOLLOWERS.map(c => m[c] ?? hit[c]).filter(n => n != null).map(Number);
    if (fol.length) m.followers_max = Math.max(...fol, ...(m.followers_max != null ? [Number(m.followers_max)] : []));
    if (empty(hit.tier) || hit.tier === tierFrom(hit.followers_max)) m.tier = tierFrom(m.followers_max ?? hit.followers_max);
    return m;
  });
  return { rows: out, matched };
}

export async function importInfluencers(q, wid, userId, rows, opts = {}) {
  let created = 0, updated = 0;
  const m = await matchByHandle(q, wid, rows, opts);
  rows = m.rows;
  const cols = IMPORT_COLS;
  const sql = `insert into influencers (id, workspace_id, created_by, ${cols.join(", ")})
    values ($1, $2, $3, ${cols.map((c, i) => `$${i + 4}${JSONB.has(c) ? "::jsonb" : ""}`).join(", ")})
    on conflict (workspace_id, code) do update set
      ${cols.filter(c => c !== "code").map(c => c === "blacklisted" ? "blacklisted = influencers.blacklisted or excluded.blacklisted"
        : c === "niches" ? "niches = case when jsonb_array_length(excluded.niches) = 0 then influencers.niches else excluded.niches end"
        : c === "extra" ? "extra = influencers.extra || excluded.extra"
        : `${c} = coalesce(excluded.${c}, influencers.${c})`).join(",\n      ")},
      updated_at = now()
    returning (xmax = 0) as inserted`;
  rows = await resolveImportNiches(q, wid, rows);
  for (let r of rows) {
    if (r.contact && !r.contact_line && !r.contact_phone && !r.contact_email) { // an old sheet with everything in one "Contact" column
      const c = splitContact(r.contact);
      if (c.line || c.phone || c.email) r = { ...r, contact_line: c.line || null, contact_phone: c.phone || null, contact_email: c.email || null, contact: c.rest || null };
    }
    const { rows: out } = await q.query(sql, [uuid(), wid, userId, ...cols.map(c => (c === "blacklisted" ? Boolean(r[c]) : JSONB.has(c) ? JSON.stringify(r[c] || (c === "extra" ? {} : [])) : r[c] ?? null))]);
    if (out[0]?.inserted) created++; else updated++;
  }
  return { created, updated, matched: m.matched };
}

export default async function influencerRoutes(app) {
  app.get("/api/w/:wid/influencers", async req => {
    const { wid } = req.params;
    await access(req, wid);
    const qs = req.query || {};
    const where = ["i.workspace_id = $1"];
    const params = [wid];
    const p = v => { params.push(v); return `$${params.length}`; };
    if (qs.q) {
      const like = p(`%${String(qs.q).trim().slice(0, 100)}%`);
      // a niche name ("บิวตี้") finds the creators in that niche
      const nq = String(qs.q).trim().toLowerCase();
      const niches = (await db.query("select creator_niches from workspaces where id=$1", [wid])).rows[0]?.creator_niches || [];
      const nk = p(niches.filter(n => String(n.label).toLowerCase().includes(nq) || String(n.key).toLowerCase().includes(nq)).map(n => n.key));
      where.push(`(i.niches ?| ${nk}::text[] or i.extra::text ilike ${like} or i.name ilike ${like} or i.aliases ilike ${like} or i.pet_name ilike ${like} or i.code ilike ${like} or i.contact ilike ${like} or i.contact_line ilike ${like} or i.contact_phone ilike ${like} or i.contact_email ilike ${like}
                 or i.link_tiktok ilike ${like} or i.link_ig ilike ${like} or i.link_fb ilike ${like} or i.link_x ilike ${like} or i.link_lemon8 ilike ${like} or i.link_youtube ilike ${like} or i.link_other ilike ${like} or i.breed ilike ${like} or i.brands ilike ${like} or i.category ilike ${like})`);
    }
    if (qs.type === "none") where.push("jsonb_array_length(i.niches) = 0");
    else if (qs.type) where.push(`i.niches ? ${p(String(qs.type))}`);
    if (qs.tier) where.push(`i.tier = ${p(String(qs.tier))}`);
    if (qs.category === "none") where.push("coalesce(i.category,'') = ''");
    else if (qs.category) where.push(`i.category = ${p(String(qs.category))}`);
    if (qs.platform === "tiktok") where.push("(coalesce(i.link_tiktok,'') <> '' or i.followers_tiktok is not null)");
    if (qs.platform === "instagram") where.push("(coalesce(i.link_ig,'') <> '' or i.followers_ig is not null)");
    if (qs.platform === "facebook") where.push("(i.followers_fb is not null or coalesce(i.link_fb,'') <> '' or i.link_other ilike '%facebook%')");
    if (qs.platform === "youtube") where.push("(i.followers_youtube is not null or coalesce(i.link_youtube,'') <> '' or i.link_other ilike '%youtu%')");
    if (qs.platform === "x") where.push("(i.followers_x is not null or coalesce(i.link_x,'') <> '' or i.link_other ilike '%x.com%' or i.link_other ilike '%twitter%')");
    if (qs.platform === "lemon8") where.push("(i.followers_lemon8 is not null or coalesce(i.link_lemon8,'') <> '' or i.link_other ilike '%lemon8%')");
    if (qs.contact === "1") where.push("(coalesce(i.contact,'') <> '' or coalesce(i.contact_line,'') <> '' or coalesce(i.contact_phone,'') <> '' or coalesce(i.contact_email,'') <> '')");
    if (qs.address === "1") where.push("coalesce(i.address,'') <> ''");
    if (qs.blacklist === "only") where.push("i.blacklisted");
    else if (qs.blacklist !== "include") where.push("not i.blacklisted");
    if (qs.min) where.push(`i.followers_max >= ${p(Number(qs.min) || 0)}`);
    const size = Math.min(200, Math.max(1, Number(qs.size) || 50));
    const page = Math.max(0, Number(qs.page) || 0);
    const order = SORTS[qs.sort] || SORTS.followers;
    const sql = `select ${LIGHT}, count(*) over() as total,
        (select count(*)::int from collaborations c where c.influencer_id = i.id) as collab_count,
        (select c.status from collaborations c where c.influencer_id = i.id order by c.updated_at desc limit 1) as last_status
      from influencers i where ${where.join(" and ")} order by ${order} limit ${size} offset ${page * size}`;
    const { rows } = await db.query(sql, params);
    return { items: rows.map(({ total, ...r }) => r), total: rows[0]?.total ?? (page ? null : 0), page, size };
  });

  app.get("/api/w/:wid/influencers/export.xlsx", async (req, reply) => {
    const { wid } = req.params;
    await access(req, wid);
    const { rows } = await db.query("select * from influencers where workspace_id=$1 order by followers_max desc nulls last", [wid]);
    const niches = (await db.query("select creator_niches from workspaces where id=$1", [wid])).rows[0]?.creator_niches || [];
    const buf = await buildInfluencerWorkbook(rows, niches);
    const date = new Date().toISOString().slice(0, 10);
    reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("content-disposition", `attachment; filename="Influencer_Database_${date}.xlsx"`);
    return reply.send(Buffer.from(buf));
  });

  /* ---------- report by niche: creators, spend, results ---------- */
  app.get("/api/w/:wid/influencers/niche-report", async req => {
    const { wid } = req.params;
    await access(req, wid);
    const days = Math.max(0, Math.min(3650, Number(req.query?.days) || 0));
    const since = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : null;
    const nicheOf = "left join lateral jsonb_array_elements_text(i.niches) e(k) on true";
    const creators = (await db.query(`select coalesce(e.k, '') as k, count(*)::int as creators, round(avg(i.followers_max))::bigint as avg_followers,
        count(*) filter (where coalesce(i.contact_line,'') <> '' or coalesce(i.contact_phone,'') <> '' or coalesce(i.contact_email,'') <> '' or coalesce(i.contact,'') <> '')::int as with_contact
      from influencers i ${nicheOf} where i.workspace_id=$1 and not i.blacklisted group by 1`, [wid])).rows;
    const work = (await db.query(`select coalesce(e.k, '') as k, count(c.id)::int as collabs, count(distinct c.influencer_id)::int as worked,
        count(c.id) filter (where c.status in ('posted','completed'))::int as posted,
        coalesce(sum(c.fee), 0)::float as fees, coalesce(sum(c.product_value), 0)::float as products, coalesce(sum(c.views), 0)::bigint as views,
        coalesce(sum(coalesce(c.likes,0) + coalesce(c.comments,0) + coalesce(c.shares,0)), 0)::bigint as engagement
      from collaborations c join influencers i on i.id = c.influencer_id ${nicheOf}
      where c.workspace_id=$1 and c.status <> 'declined' and ($2::date is null or coalesce(c.post_date, c.created_at::date) >= $2::date) group by 1`, [wid, since])).rows;
    const by = new Map();
    for (const r of creators) by.set(r.k, { k: r.k, creators: r.creators, avg_followers: Number(r.avg_followers) || 0, with_contact: r.with_contact });
    for (const r of work) by.set(r.k, { k: r.k, creators: 0, avg_followers: 0, with_contact: 0, ...by.get(r.k), collabs: r.collabs, worked: r.worked, posted: r.posted,
      spend: r.fees + r.products, fees: r.fees, products: r.products, views: Number(r.views), engagement: Number(r.engagement) });
    return { days, rows: [...by.values()].map(r => ({ collabs: 0, worked: 0, posted: 0, spend: 0, fees: 0, products: 0, views: 0, engagement: 0, ...r })) };
  });

  /* ---------- old contact notes: suggest moving handles / LINE / phone into their own fields ---------- */
  const REVIEW_COLS = "id, name, code, contact, contact_line, contact_phone, contact_email, link_tiktok, link_ig, link_fb, link_x, link_lemon8, link_youtube";
  app.get("/api/w/:wid/influencers/contact-review", async req => {
    const { wid } = req.params;
    await access(req, wid);
    const { rows } = await db.query(`select ${REVIEW_COLS} from influencers where workspace_id=$1 and coalesce(contact,'') <> '' order by lower(name)`, [wid]);
    const items = rows.map(r => ({ id: r.id, name: r.name, code: r.code, contact: r.contact, moves: contactSuggestions(r) })).filter(r => r.moves.length);
    return { items, withNotes: rows.length };
  });
  app.post("/api/w/:wid/influencers/contact-review", async req => {
    const { wid } = req.params;
    await access(req, wid, "editor");
    const want = new Map((Array.isArray(req.body?.items) ? req.body.items : []).filter(x => isUuid(x?.id) && Array.isArray(x.fields)).slice(0, 2000).map(x => [x.id, new Set(x.fields)]));
    if (!want.size) throw bad("validation", "Nothing selected");
    return db.tx(async q => {
      const { rows } = await q.query(`select ${REVIEW_COLS} from influencers where workspace_id=$1 and id = any($2::uuid[]) for update`, [wid, [...want.keys()]]);
      let changed = 0, moved = 0;
      for (const r of rows) {
        // suggestions are worked out again here, so only what the server itself suggests can be written
        const moves = contactSuggestions(r).filter(m => want.get(r.id).has(m.field));
        if (!moves.length) continue;
        const set = Object.fromEntries(moves.map(m => [m.field, m.value]));
        set.contact = contactRest(r.contact, moves) || null;
        const cols = Object.keys(set);
        await q.query(`update influencers set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}, updated_at = now() where id=$1 and workspace_id=$2`, [r.id, wid, ...cols.map(c => set[c])]);
        changed++; moved += moves.length;
      }
      const rev = changed ? await touch(q, wid, req.user.id, "update", "influencers", null, `${changed} creators (contacts)`) : null;
      return { changed, moved, rev };
    });
  });

  /* ---------- duplicates ---------- */
  // creators that look like the one being added / edited
  app.post("/api/w/:wid/influencers/dupes", async req => {
    const { wid } = req.params;
    await access(req, wid);
    const b = req.body || {};
    const cand = Object.fromEntries(["name", "link_tiktok", "link_ig", "link_fb", "link_x", "link_lemon8", "link_youtube", "contact_line", "contact_phone", "contact_email"]
      .map(k => [k, typeof b[k] === "string" ? b[k].slice(0, 500) : null]));
    return { items: await findDupes(db, wid, cand, isUuid(b.id) ? b.id : null) };
  });
  app.get("/api/w/:wid/influencers/duplicates", async req => {
    const { wid } = req.params;
    await access(req, wid);
    return { groups: (await dupeGroups(db, wid)).slice(0, 300) };
  });
  // fold creators into one: everything is kept on `id` (fields, collaborations, comments), the others are removed
  app.post("/api/w/:wid/influencers/:id/merge", async req => {
    const { wid, id } = req.params;
    await access(req, wid, "editor");
    const from = [...new Set((Array.isArray(req.body?.from) ? req.body.from : []).filter(x => isUuid(x) && x !== id))].slice(0, 20);
    if (!isUuid(id) || !from.length) throw bad("validation", "Choose creators to merge");
    return db.tx(async q => {
      const done = [];
      for (const f of from) { const r = await mergeCreators(q, wid, id, f); if (r) done.push(r); }
      if (!done.length) throw notFound();
      const rev = await touch(q, wid, req.user.id, "update", "influencers", id, `${done[0].keep} ← ${done.map(d => d.from).join(", ")}`);
      return { merged: done.length, collaborations: done.reduce((s, d) => s + d.collaborations, 0), rev };
    });
  });

  app.get("/api/w/:wid/influencers/:id", async req => {
    const { wid, id } = req.params;
    await access(req, wid);
    if (!isUuid(id)) throw notFound();
    const { rows } = await db.query("select * from influencers where id=$1 and workspace_id=$2", [id, wid]);
    if (!rows.length) throw notFound();
    const collabs = await db.query(`select c.*, ca.name as campaign_name from collaborations c left join campaigns ca on ca.id = c.campaign_id
                                    where c.influencer_id=$1 order by coalesce(c.post_date, c.created_at::date) desc`, [id]);
    return { item: rows[0], collaborations: collabs.rows };
  });

  app.post("/api/w/:wid/influencers/import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async req => {
    const { wid } = req.params;
    await access(req, wid, "editor");
    const file = await req.file({ limits: { fileSize: config.uploadMaxMb * 1024 * 1024 } });
    if (!file) throw bad("file_required", "Please choose an .xlsx file");
    if (!/\.xlsx$/i.test(file.filename || "")) throw bad("xlsx_only", "Only .xlsx files are supported");
    const buffer = await file.toBuffer();
    let parsed;
    try { parsed = await parseInfluencerWorkbook(buffer); } catch { throw bad("xlsx_invalid", "Could not read this spreadsheet"); }
    if (!parsed.rows.length) throw bad("xlsx_empty", "No influencer rows were found (need an 'Account Name' column)");
    const preview = req.query?.preview === "1";
    if (preview) {
      const m = await matchByHandle(db, wid, parsed.rows, { unknownCodes: true }); // rows that will update a creator found by handle are not duplicates
      const maybeDupes = await countLikelyDupes(db, wid, m.rows);
      return { preview: true, total: parsed.rows.length, sheets: parsed.sheets, blacklisted: parsed.blacklistCount, maybeDupes, matched: m.matched };
    }
    return db.tx(async q => {
      const res = await importInfluencers(q, wid, req.user.id, parsed.rows, { unknownCodes: true });
      const rev = await touch(q, wid, req.user.id, "import", "influencers", null, `${parsed.rows.length} influencers`);
      return { ...res, total: parsed.rows.length, sheets: parsed.sheets, blacklisted: parsed.blacklistCount, rev };
    });
  });

  app.post("/api/w/:wid/influencers/bulk-delete", async req => {
    const { wid } = req.params;
    await access(req, wid, "admin");
    const ids = (req.body?.ids || []).filter(isUuid).slice(0, 1000);
    if (!ids.length) throw bad("validation", "No items selected");
    return db.tx(async q => {
      const { rowCount } = await q.query("delete from influencers where workspace_id=$1 and id = any($2::uuid[])", [wid, ids]);
      return { deleted: rowCount, rev: await touch(q, wid, req.user.id, "delete", "influencers", null, `${rowCount} influencers`) };
    });
  });
}
