import { S, D, $, esc, icon, iconInline, fmtNum, money, fmtDate, uid, canEdit, isAdmin, COLLAB_ST, DEALS, PLATFORMS, NICHES, nicheOf, TIERS, byKey, camp, proj, safeUrl, debounce, todayISO, memberName, widOf } from "../core.js";
import { brand, brandBadge, brandIcon, brandName } from "../brands.js";
import { t } from "../i18n.js";
import { api } from "../api.js";
import { pageHead, empty, chipBtn, selectChip, seg, F, group, memberOpts, projectOpts, openSheet, island, askConfirm, askInput, collabPill, tierPill, memberAvatar, copyText, downloadBlob, closeSheet, readList, commentsBox, openPopover } from "../ui.js";
import { create, update, destroy, fail, hooks, reload } from "../store.js";
import { checkNewDupes, showDupeWarning, toolActions } from "./creator-tools.js";

const I = () => S.inf;
const PAGE = 60;
let newInf = { dupesShown: false, mergeInto: null }; // the "add creator" form's duplicate check

/* ---------- data ---------- */
let reqSeq = 0;
export async function loadInfluencers(reset = true) {
  const f = I();
  if (reset) { f.page = 0; f.done = false; }
  f.loading = true;
  const seq = ++reqSeq;
  const qs = new URLSearchParams({ page: f.page, size: PAGE, sort: f.sort, blacklist: f.blacklist });
  for (const k of ["q", "type", "tier", "platform", "category"]) if (f[k]) qs.set(k, f[k]);
  if (f.contact) qs.set("contact", "1");
  if (f.address) qs.set("address", "1");
  if (reset) hooks.render();
  try {
    const r = await api("GET", `/w/${S.wid}/influencers?${qs}`);
    if (seq !== reqSeq) return;
    f.items = reset ? r.items : f.items.concat(r.items);
    if (r.total != null) f.total = r.total;
    f.done = r.items.length < PAGE;
    f.loadedFor = S.wid;
  } catch (e) { fail(e); }
  finally { if (seq === reqSeq) { f.loading = false; hooks.render(); } }
}
const reloadSoon = debounce(() => loadInfluencers(true), 280);

/* ---------- view ---------- */
// real platform logos; a linked one opens the profile
const platBadge = (k, followers, url) => {
  const label = `${brandName(k)}${followers ? " · " + fmtNum(followers) : ""}`;
  return url ? `<a class="plat-logo" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(label)}" aria-label="${esc(label)}">${brandBadge(k, 24)}</a>`
    : `<span class="plat-logo" title="${esc(label)}" aria-label="${esc(label)}">${brandBadge(k, 24)}</span>`;
};
const platformLinks = r => [["tiktok", "link_tiktok", "followers_tiktok"], ["instagram", "link_ig", "followers_ig"], ["facebook", "link_fb", "followers_fb"],
  ["youtube", "link_youtube", "followers_youtube"], ["x", "link_x", "followers_x"], ["lemon8", "link_lemon8", "followers_lemon8"]]
  .map(([k, l, n]) => (safeUrl(r[l]) ? platBadge(k, r[n], safeUrl(r[l])) : r[n] != null ? platBadge(k, r[n]) : "")).join("");
const tierColor = k => byKey(TIERS, k)?.color || "gray";
// the main niche's emoji when the creator has one, otherwise the first letter of the account name
const avatarText = (petType, name) => nicheOf(petType)?.emoji || (String(name || "?").replace(/^[@._\-\d]+/, "")[0] || "?").toUpperCase();
const avatarHtml = (petType, name) => nicheOf(petType)?.emoji ? `<i class="emo">${esc(avatarText(petType, name))}</i>` : esc(avatarText(petType, name));

// the one contact shown in the list: LINE first (what the team actually uses), then phone, email, old notes
function contactLine(r) {
  const [ic, v] = r.contact_line ? [brandBadge("line", 14), /^https?:\/\//i.test(r.contact_line) ? "LINE" : r.contact_line]
    : r.contact_phone ? [iconInline("phone", 13), r.contact_phone]
    : r.contact_email ? [iconInline("mail", 13), r.contact_email]
    : r.contact ? [iconInline("message", 13), r.contact.split("\n")[0]] : [];
  return v ? `${ic} ${esc(v.slice(0, 60))}` : "";
}
const contactText = x => [x.contact_line && "LINE: " + x.contact_line, x.contact_phone && t("inf.phone") + ": " + x.contact_phone,
  x.contact_email && t("inf.email") + ": " + x.contact_email, x.contact].filter(Boolean).join("\n");

function infRow(r) {
  return `<button class="inf-row ${r.blacklisted ? "black" : ""}" data-act="openInf" data-id="${r.id}">
    <span class="inf-av c-${tierColor(r.tier)}">${avatarHtml(r.pet_type, r.name)}</span>
    <span class="inf-name"><b>${esc(r.name)}</b><small>${esc([nichesOf(r).length > 1 ? nichesOf(r).map(k => nicheOf(k).label).join(" + ") : "", r.pet_name, r.breed, r.category].filter(Boolean).join(" · ") || r.code || "")}</small></span>
    <span class="inf-tier">${tierPill(r.tier)}${r.blacklisted ? `<span class="pill c-red">${iconInline("ban", 12)} Blacklist</span>` : ""}</span>
    <span class="inf-fol"><b>${fmtNum(r.followers_max)}</b><small>${t("inf.followers")}</small></span>
    <span class="inf-plat">${platformLinks(r)}</span>
    <span class="inf-contact">${contactLine(r) || `<span class="faint">${t("inf.noContact")}</span>`}${r.has_address ? `<span class="addr-dot" title="${t("inf.hasAddress")}">${iconInline("pin", 12)}</span>` : ""}</span>
    <span class="inf-status">${r.last_status ? collabPill(r.last_status) : r.collab_count ? "" : `<span class="faint">—</span>`}${r.collab_count ? `<small>${t("inf.collabCount", { n: r.collab_count })}</small>` : ""}</span>
    <span class="chev">${icon("chevR", 16)}</span>
  </button>`;
}

export function viewInfluencers() {
  const d = D(), f = I(), st = d.influencerStats;
  if (f.loadedFor !== S.wid && !f.loading) setTimeout(() => loadInfluencers(true));
  const head = pageHead(t("inf.eyebrow", { n: fmtNum(st.total) }), t("nav.influencers"),
    seg("infView", [["directory", t("inf.directory"), "database"], ["pipeline", t("inf.pipeline"), "kanban"]], S.ui.infView) +
    `<button class="circle-btn" data-act="infMore" aria-label="${t("common.more")}">${icon("more", 20)}</button>` +
    (canEdit() ? `<button class="btn filled" data-act="${S.ui.infView === "pipeline" ? "newCollab" : "newInf"}">${icon("plus", 18, 2.4)}${S.ui.infView === "pipeline" ? t("inf.addToCampaign") : t("inf.new")}</button>` : ""));
  if (S.ui.infView === "pipeline") return head + viewPipeline();

  if (!st.total) return head + `<div class="card glass">${empty("star", t("inf.emptyTitle"), t("inf.emptyText"), canEdit() ? `<div class="head-actions center"><button class="btn filled" data-act="importXlsx">${icon("upload", 18)}${t("inf.import")}</button><button class="btn gray" data-act="newInf">${icon("plus", 18, 2.4)}${t("inf.new")}</button></div>` : "")}</div>`;

  const stats = [[t("inf.inDatabase"), fmtNum(st.total), "database", "accent"], [t("inf.withContact"), fmtNum(st.with_contact), "message", "green"], [t("inf.withAddress"), fmtNum(st.with_address), "pin", "orange"], ["Blacklist", st.blacklisted, "ban", "red"]]
    .map(([l, v, ic, c]) => `<div class="stat glass c-${c}"><span class="stat-l">${icon(ic, 15)}<span>${l}</span></span><b>${v}</b></div>`).join("");
  // content-category chips when categories exist
  const cats = Object.entries(st.byCategory || {}).filter(([k]) => k);
  // Filters live behind one "Filters" button; only the ones in use show, each removable with ×.
  const num = n => (n ? ` (${fmtNum(n)})` : "");
  // niches: the workspace list plus any key creators carry that the list doesn't have
  const nicheKeys = [...new Set([...NICHES().map(n => n.key), ...Object.keys(st.byType || {}).filter(Boolean)])];
  const typeOpts = nicheKeys.length ? [...nicheKeys.map(k => { const n = nicheOf(k); return [k, `${n.emoji} ${n.label}${num(st.byType?.[k])}`]; }), ["none", `${t("niche.none")}${num(st.byType?.[""])}`]] : null;
  const catOpts = cats.length ? [...cats.map(([k, n]) => [k, `${k}${num(n)}`]), ...(st.byCategory?.[""] ? [["none", `${t("inf.noCategory")}${num(st.byCategory[""])}`]] : [])] : null;
  const tierOpts = TIERS.map(x => [x.key, `${x.label}${num(st.byTier?.[x.key])}`]);
  const platOpts = PLATFORMS.filter(p => p.key !== "other").map(p => [p.key, p.label]);
  const blOpts = [["exclude", t("inf.hideBlacklist")], ["include", t("inf.showBlacklist")], ["only", t("inf.onlyBlacklist")]];
  S.ui.infFilterPanel = () => {
    const sel = (key, label, opts, val, all) => `<label class="fp-row"><span>${label}</span><select data-filter="inf.${key}">${all ? `<option value="">${esc(all)}</option>` : ""}${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    const sw = (key, label, ic, on) => `<label class="fp-row"><span>${icon(ic, 15)} ${label}</span><span class="switch"><input type="checkbox" data-filter="inf.${key}" ${on ? "checked" : ""}><span></span></span></label>`;
    const g = I();
    return `<div class="fpanel"><div class="fp-head"><b>${t("inf.filters")}</b><button type="button" class="text-btn" data-act="infClear">${t("filter.clear")}</button></div>
      ${typeOpts ? sel("type", t("inf.fType"), typeOpts, g.type, t("common.all")) : ""}
      ${catOpts ? sel("category", t("inf.fCategory"), catOpts, g.category, t("common.all")) : ""}
      ${sel("tier", "Tier", tierOpts, g.tier, t("common.all"))}
      ${sel("platform", t("inf.platforms"), platOpts, g.platform, t("common.all"))}
      ${sel("blacklist", "Blacklist", blOpts, g.blacklist)}
      ${sw("contact", t("inf.hasContact"), "message", g.contact)}
      ${sw("address", t("inf.hasAddress"), "pin", g.address)}
      <button type="button" class="fp-link" data-act="manageNiches">${icon("edit", 14)} ${t("niche.manage")}</button></div>`;
  };
  const lbl = (opts, v) => (opts || []).find(o => o[0] === v)?.[1]?.replace(/ \([\d.,KM]+\)$/, "") || v;
  const active = [
    f.type && [ "type", lbl(typeOpts, f.type) ], f.category && [ "category", lbl(catOpts, f.category) ], f.tier && [ "tier", lbl(tierOpts, f.tier) ],
    f.platform && [ "platform", lbl(platOpts, f.platform) ], f.blacklist !== "exclude" && [ "blacklist", lbl(blOpts, f.blacklist) ],
    f.contact && [ "contact", t("inf.hasContact") ], f.address && [ "address", t("inf.hasAddress") ]
  ].filter(Boolean);
  const chips = active.length ? `<div class="chips active-filters">${active.map(([k, l]) => `<button class="chip on" data-act="infUnset" data-v="${k}">${esc(l)} ${icon("x", 13, 2.6)}</button>`).join("")}<button class="text-btn" data-act="infClear">${t("filter.clear")}</button></div>` : "";
  const filterBtn = `<button type="button" class="chip ${active.length ? "on" : ""}" data-act="infFilter">${icon("filter", 15)} ${t("inf.filters")}${active.length ? ` <span class="n-badge">${active.length}</span>` : ""}</button>`;
  const toolbar = `<div class="toolbar"><label class="search-field glass">${icon("search", 16)}<input id="infSearch" data-infq value="${esc(f.q)}" placeholder="${t("inf.search")}" autocomplete="off" type="search"></label>
    <div class="right">${filterBtn}<span class="faint small">${f.loading ? t("common.loading") : t("inf.results", { n: fmtNum(f.total) })}</span>
    <label class="chip"><select data-filter="inf.sort" aria-label="${t("common.sort")}">${[["followers", t("inf.sortFollowers")], ["name", t("inf.sortName")], ["recent", t("inf.sortRecent")], ["collabs", t("inf.sortCollabs")]].map(([k, l]) => `<option value="${k}" ${f.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div></div>`;
  const rows = f.items.length ? `<div class="inf-list glass"><div class="inf-head"><span></span><span>${t("inf.creator")}</span><span>Tier</span><span>${t("inf.followers")}</span><span>${t("inf.platforms")}</span><span>${t("inf.contact")}</span><span>${t("inf.status")}</span><span></span></div>${f.items.map(infRow).join("")}</div>
      ${!f.done ? `<div class="center mt"><button class="btn gray" data-act="infMoreRows" ${f.loading ? "disabled" : ""}>${f.loading ? t("common.loading") : t("inf.loadMore")}</button></div>` : ""}`
    : f.loading ? `<div class="inf-list glass">${Array.from({ length: 6 }, () => `<div class="inf-row skeleton"><span class="inf-av"></span><span class="sk"></span></div>`).join("")}</div>`
    : `<div class="card glass">${empty("search", t("inf.noneFound"), t("tasks.noneFoundText"), `<button class="btn gray" data-act="infReset">${t("filter.clear")}</button>`)}</div>`;
  return head + `<div class="stat-tiles">${stats}</div>` + toolbar + chips + rows;
}

function viewPipeline() {
  const d = D(), cid = S.ui.pipeCampaign, pic = S.ui.pipePic || "";
  const pics = [...new Set(d.collaborations.flatMap(c => String(c.pic || "").split(",").map(x => x.trim()).filter(Boolean)))].sort();
  const all = d.collaborations.filter(c => (!cid || (cid === "none" ? !c.campaign_id : c.campaign_id === cid))
    && (!pic || String(c.pic || "").split(",").map(x => x.trim()).includes(pic)));
  const campsWith = d.campaigns.filter(c => d.collaborations.some(x => x.campaign_id === c.id));
  const fees = all.reduce((s, c) => s + (+c.fee || 0), 0), prod = all.reduce((s, c) => s + (+c.product_value || 0), 0), views = all.reduce((s, c) => s + (+c.views || 0), 0);
  const posted = all.filter(c => ["posted", "completed"].includes(c.status)).length;
  const stats = [[t("inf.inPipeline"), all.filter(c => c.status !== "declined").length, "users", "accent"], [t("collabStatus.posted"), posted, "play", "pink"], [t("inf.totalFees"), moneyShort(fees + prod), "wallet", "green"], [t("camp.totalViews"), fmtNum(views), "eye", "violet"], ["CPV", views ? "฿" + ((fees + prod) / views).toFixed(2) : "—", "target", "orange"]]
    .map(([l, v, ic, c]) => `<div class="stat glass c-${c}"><span class="stat-l">${icon(ic, 15)}<span>${l}</span></span><b>${v}</b></div>`).join("");
  const chips = `<div class="chips">${chipBtn("pipeCamp", "", t("inf.allCampaigns"), !cid)}${campsWith.map(c => chipBtn("pipeCamp", c.id, c.name, cid === c.id, icon("megaphone", 14))).join("")}${chipBtn("pipeCamp", "none", t("inf.noCampaign"), cid === "none")}${pics.length ? `<span class="chip-sep"></span>${selectChip("pipe.pic", t("pipe.allPics"), pics.map(p => [p, p]), pic)}` : ""}</div>`;
  if (!d.collaborations.length) return `<div class="card glass">${empty("kanban", t("pipe.emptyTitle"), t("pipe.emptyText"), canEdit() ? `<button class="btn filled" data-act="newCollab">${icon("plus", 18, 2.4)}${t("inf.addToCampaign")}</button>` : "")}</div>`;
  const cols = COLLAB_ST.map(s => {
    const items = all.filter(c => c.status === s.key).sort((a, b) => (a.post_date || "9999").localeCompare(b.post_date || "9999") || String(b.updated_at).localeCompare(String(a.updated_at)));
    // long columns (thousands of leads) render in pages to keep the board fast
    const limit = S.ui.pipeShow?.[s.key] || PIPE_PAGE, shown = items.slice(0, limit);
    return `<div class="col glass" data-drop-kind="collab" data-drop="${s.key}"><div class="col-head"><span class="dot c-${s.color}"></span>${s.label}<span class="n">${fmtNum(items.length)}</span></div>
      ${shown.map(c => `<button class="kcard" ${canEdit() && widOf(c) === S.wid ? `data-drag-id="${c.id}" data-drag-kind="collab"` : ""} data-act="editCollab" data-id="${c.id}">
        <span class="k-top"><span class="inf-av xs c-${tierColor(c.influencer_tier)}">${avatarHtml(c.influencer_type, c.influencer_name)}</span>${esc(c.influencer_name)}${c.influencer_blacklisted ? `<span class="flag c-red">${icon("ban", 13)}</span>` : ""}</span>
        <span class="k-sub">${c.campaign_id ? `${iconInline("megaphone", 12)} ${esc(camp(c.campaign_id)?.name || "")}` : `<span class="faint">${t("inf.noCampaign")}</span>`}${c.pic ? ` · ${iconInline("user", 12)} ${esc(c.pic)}` : ""}</span>
        ${c.lead_status && !["posted", "completed"].includes(c.status) ? `<span class="k-sub faint ellipsis">${esc(c.lead_status)}</span>` : ""}
        ${(c.posts || []).length ? `<span class="k-sub">${iconInline("play", 12)} ${t("pipe.postsDone", { n: c.posts.filter(p => p.posted).length, total: c.posts.length })}</span>` : ""}
        <span class="k-meta"><span>${c.fee ? money(c.fee) : c.deal_type ? esc(byKey(DEALS, c.deal_type)?.label) : ""}${c.platform ? " · " + (brand(c.platform) ? brandIcon(c.platform, 12) + " " : "") + esc(byKey(PLATFORMS, c.platform)?.label) : ""}</span><span>${c.post_date ? iconInline("calendar", 12) + " " + fmtDate(c.post_date) : ""}</span></span>
        ${c.views ? `<span class="k-meta"><span>${iconInline("eye", 12)} ${fmtNum(c.views)}</span><span>${c.likes ? "♥ " + fmtNum(c.likes) : ""}</span></span>` : ""}
      </button>`).join("") || `<div class="col-empty">${t("board.empty")}</div>`}
      ${items.length > limit ? `<button type="button" class="btn gray sm col-more" data-act="pipeMore" data-v="${s.key}">${t("pipe.showMore", { n: fmtNum(items.length - limit) })}</button>` : ""}
    </div>`;
  }).join("");
  return `<div class="stat-tiles five">${stats}</div>${chips}<p class="faint small hint">${icon("kanban", 14)} ${t(matchMedia("(hover:none)").matches ? "board.hintTouch" : "board.hintMouse")}</p><div class="board">${cols}</div>`;
}
const moneyShort = n => (n ? "฿" + fmtNum(n) : "—");
const PIPE_PAGE = 60;

/* ---------- influencer sheet ---------- */
/* ---------- creator form: tick the platforms and contact channels a creator actually has ---------- */
// A typed @handle becomes the profile link; a pasted link is kept as is.
const PLATS = [
  { k: "tiktok", link: "link_tiktok", fol: "followers_tiktok", base: "https://www.tiktok.com/@", at: true, re: /tiktok\.com/i },
  { k: "instagram", link: "link_ig", fol: "followers_ig", base: "https://www.instagram.com/", at: false, re: /instagram\.com|instagr\.am/i },
  { k: "facebook", link: "link_fb", fol: "followers_fb", base: "https://www.facebook.com/", at: false, re: /facebook\.com|fb\.com|fb\.me/i },
  { k: "youtube", link: "link_youtube", fol: "followers_youtube", base: "https://www.youtube.com/@", at: true, re: /youtube\.com|youtu\.be/i },
  { k: "x", link: "link_x", fol: "followers_x", base: "https://x.com/", at: false, re: /(^|\/\/|\.)(x|twitter)\.com/i },
  { k: "lemon8", link: "link_lemon8", fol: "followers_lemon8", base: "https://www.lemon8-app.com/@", at: true, re: /lemon8/i }
];
const toLink = (pl, v) => {
  v = String(v || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?[\w-]+(\.[\w-]+)+\//i.test(v)) return "https://" + v;
  return pl.base + v.replace(/^@/, "").replace(/\s+/g, "");
};
// show a link we built as @handle again, anything else as the full link
const toHandle = (pl, url) => {
  if (!url) return "";
  const b = pl.base.replace(/^https:\/\/(www\.)?/, "");
  const m = String(url).replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  if (m.toLowerCase().startsWith(b.toLowerCase())) { const h = m.slice(b.length).replace(/^@/, ""); if (/^[\w.\-]+$/.test(h)) return "@" + h; }
  return url;
};
// older records keep Facebook / X / Lemon8 / YouTube links in "other links": pull them into their own platform
function splitOtherLinks(x) {
  const out = {}, rest = [];
  for (const line of String(x.link_other || "").split(/\n+/).map(l => l.trim()).filter(Boolean)) {
    const pl = PLATS.find(q => q.re.test(line) && !x[q.link] && !out[q.link]);
    if (pl && /^https?:\/\//i.test(line)) out[pl.link] = line; else rest.push(line);
  }
  return { links: out, other: rest.join("\n") };
}
const CONTACTS = [
  { k: "line", name: "contact_line", logo: () => brandBadge("line", 22), ph: "@lineid", label: () => "LINE" },
  { k: "phone", name: "contact_phone", logo: () => `<span class="ct-ic c-green">${icon("phone", 13, 2.4)}</span>`, ph: "08x-xxx-xxxx", type: "tel", label: () => t("inf.phone") },
  { k: "email", name: "contact_email", logo: () => `<span class="ct-ic c-blue">${icon("mail", 13, 2.4)}</span>`, ph: "name@email.com", type: "email", label: () => t("inf.email") },
  { k: "other", name: "contact", logo: () => `<span class="ct-ic c-gray">${icon("message", 13, 2.4)}</span>`, ph: t("inf.contactOtherPh"), area: true, label: () => t("inf.contactOther") }
];
const pickBtn = (grp, k, on, logo, label) => `<button type="button" class="pick ${on ? "on" : ""}" data-act="pickTog" data-grp="${grp}" data-v="${k}" aria-pressed="${on}">${logo}<span>${esc(label)}</span>${icon("checkSmall", 13, 3)}</button>`;

function platformSection(x) {
  const sp = splitOtherLinks(x);
  const val = pl => x[pl.link] || sp.links[pl.link] || "";
  const on = pl => !!(val(pl) || x[pl.fol] != null);
  const picks = PLATS.map(pl => pickBtn("plat", pl.k, on(pl), brandBadge(pl.k, 22), brandName(pl.k))).join("");
  const rows = PLATS.map(pl => `<div class="pick-row" data-grp="plat" data-v="${pl.k}" ${on(pl) ? "" : "hidden"}>
      <input type="hidden" name="has_${pl.k}" value="${on(pl) ? "1" : ""}">
      <span class="pr-logo">${brandBadge(pl.k, 30)}</span>
      <label class="pr-in grow"><span>${brandName(pl.k)} — ${t("inf.handleOrLink")}</span><input name="${pl.link}" value="${esc(toHandle(pl, val(pl)))}" placeholder="${pl.at ? "@username" : "username"}" autocomplete="off" spellcheck="false"></label>
      <label class="pr-in pr-num"><span>${t("inf.followers")}</span><input name="${pl.fol}" type="number" min="0" inputmode="numeric" value="${x[pl.fol] ?? ""}" placeholder="0"></label>
    </div>`).join("");
  return { html: `<div class="pick-grid">${picks}</div>${rows}`, other: sp.other };
}
function contactSection(x) {
  const on = c => !!x[c.name];
  const picks = CONTACTS.map(c => pickBtn("ct", c.k, on(c), c.logo(), c.label())).join("");
  const rows = CONTACTS.map(c => `<div class="pick-row" data-grp="ct" data-v="${c.k}" ${on(c) ? "" : "hidden"}>
      <input type="hidden" name="has_ct_${c.k}" value="${on(c) ? "1" : ""}">
      <span class="pr-logo">${c.logo()}</span>
      <label class="pr-in grow"><span>${c.label()}</span>${c.area ? `<textarea name="${c.name}" rows="2" placeholder="${esc(c.ph)}">${esc(x[c.name] || "")}</textarea>` : `<input name="${c.name}" type="${c.type || "text"}" value="${esc(x[c.name] || "")}" placeholder="${esc(c.ph)}" autocomplete="off">`}</label>
    </div>`).join("");
  return `<div class="pick-grid">${picks}</div>${rows}`;
}

/* ---------- creator niches ("สาย"): pick several from the workspace list, + add a new one on the spot ---------- */
// the creator's niche keys, main one first (older rows only have pet_type)
export const nichesOf = r => (Array.isArray(r?.niches) && r.niches.length ? r.niches : r?.pet_type ? [r.pet_type] : []);
function nicheChip(n, on) {
  return `<label class="c-violet"><input type="checkbox" data-niche="${esc(n.key)}" ${on ? "checked" : ""}><span>${esc(n.emoji)} ${esc(n.label)}</span></label>`;
}
// each niche's own fields ("สภาพผิว", "อายุลูก" …), shown while that niche is ticked
function nicheFields(n, extra, on) {
  if (!n.fields?.length) return "";
  return `<div class="niche-fields" data-for="${esc(n.key)}" ${on ? "" : "hidden"}><div class="nf-title">${esc(n.emoji)} ${esc(t("niche.fieldsOf", { name: n.label }))}</div>
    ${n.fields.map(f => F.text("", esc(f.label), extra?.[n.key]?.[f.key] ?? "", { attrs: `data-xn="${esc(n.key)}" data-xf="${esc(f.key)}" autocomplete="off"` })).join("")}</div>`;
}
const mainNicheText = keys => (keys.length > 1 ? `${t("niche.main")}: ${esc(nicheOf(keys[0]).emoji)} ${esc(nicheOf(keys[0]).label)}` : "");
function nichePicker(keys, extra) {
  const list = [...NICHES()];
  for (const k of keys) if (!list.some(n => n.key === k)) list.push(nicheOf(k));
  return `<input type="hidden" name="niches" value="${esc(JSON.stringify(keys))}">
    <div class="radio-chips niche-chips" role="group" aria-label="${t("niche.title")}">${list.map(n => nicheChip(n, keys.includes(n.key))).join("")}
    ${canEdit() ? `<button type="button" class="chip-add" data-act="addNiche">${icon("plus", 14, 2.6)} ${t("niche.add")}</button>` : ""}</div>
    <div class="niche-main">${mainNicheText(keys)}</div>
    <div class="niche-field-box">${list.map(n => nicheFields(n, extra, keys.includes(n.key))).join("")}</div>`;
}
// ticking keeps the order people pick in: the first ticked niche is the main one
function onNicheToggle(cb) {
  const box = cb.closest("#sheetBody") || document, hid = box.querySelector('input[name="niches"]');
  if (!hid) return;
  const k = cb.dataset.niche;
  let keys = JSON.parse(hid.value || "[]").filter(x => x !== k);
  if (cb.checked) keys.push(k);
  hid.value = JSON.stringify(keys);
  box.querySelector(`.niche-fields[data-for="${CSS.escape(k)}"]`)?.toggleAttribute("hidden", !cb.checked);
  const main = box.querySelector(".niche-main");
  if (main) main.innerHTML = mainNicheText(keys);
}
// a sensible icon for common niches; anything else gets a tag (changeable in "manage niches")
const NICHE_ICONS = [[/แมว|cat/i, "🐱"], [/หมา|สุนัข|dog/i, "🐶"], [/สัตว์|pet/i, "🐾"], [/บิวตี้|ความงาม|สกินแคร์|เครื่องสำอาง|beauty|skin|makeup/i, "💄"],
  [/อาหาร|ร้านอาหาร|ขนม|กิน|food|cook/i, "🍜"], [/เครื่องดื่ม|กาแฟ|drink|coffee/i, "☕"], [/ท่องเที่ยว|เที่ยว|travel|โรงแรม/i, "✈️"], [/แม่|เด็ก|ครอบครัว|mom|baby|kid|family/i, "👶"],
  [/เกม|game/i, "🎮"], [/ไอที|เทค|tech|gadget|มือถือ/i, "💻"], [/แฟชั่น|เสื้อผ้า|fashion/i, "👗"], [/สุขภาพ|ฟิต|ออกกำลัง|health|fit|gym/i, "💪"],
  [/การเงิน|ลงทุน|หุ้น|finance|money/i, "💰"], [/รถ|ยานยนต์|car|auto/i, "🚗"], [/ตลก|บันเทิง|comedy|fun/i, "😂"], [/เพลง|ดนตรี|music/i, "🎵"],
  [/กีฬา|ฟุตบอล|sport/i, "⚽"], [/บ้าน|แต่งบ้าน|home|decor/i, "🏠"], [/การศึกษา|สอน|ความรู้|edu|learn/i, "📚"], [/ธุรกิจ|business|b2b/i, "💼"]];
const guessIcon = name => NICHE_ICONS.find(([re]) => re.test(name))?.[1] || "🏷️";
async function saveNiches(list) {
  const r = await api("PUT", `/w/${S.wid}/creator-niches`, { niches: list });
  S.data.workspace.creator_niches = r.niches;
  if (r.rev) S.data.workspace.rev = r.rev;
  return r;
}
async function addNiche(btn) {
  const name = (await askInput(t("niche.addTitle"), t("niche.addMsg"), { placeholder: t("niche.addPh"), ok: t("common.add") }) || "").trim();
  if (!name) return;
  let n = NICHES().find(x => x.label.toLowerCase() === name.toLowerCase() || x.key.toLowerCase() === name.toLowerCase());
  if (!n) {
    try { const r = await saveNiches([...NICHES(), { key: name, label: name, emoji: guessIcon(name) }]); n = r.niches.find(x => x.key === name); }
    catch (e) { fail(e); return; }
  }
  const box = btn.closest(".niche-chips");
  const find = () => [...box.querySelectorAll("input[data-niche]")].find(i => i.dataset.niche === n.key);
  if (!find()) btn.insertAdjacentHTML("beforebegin", nicheChip(n, false));
  if (!find().checked) { find().checked = true; onNicheToggle(find()); }
  island(t("niche.added", { name: n.label }), "check", "green");
}
function nicheRow(n, counts) {
  return `<div class="niche-row" data-key="${esc(n?.key || "")}">
      <div class="nr-top">
        <input class="niche-emoji" value="${esc(n?.emoji || "🏷️")}" aria-label="${t("niche.icon")}" maxlength="8" autocomplete="off">
        <input class="niche-label" value="${esc(n?.label || "")}" placeholder="${t("niche.addPh")}" aria-label="${t("niche.name")}" maxlength="60" autocomplete="off">
        <span class="faint small nw">${n?.key && counts[n.key] ? t("inf.results", { n: counts[n.key] }) : ""}</span>
        <button type="button" class="mini-x" data-act="rmNicheRow" aria-label="${t("common.remove")}">${icon("x", 12, 2.4)}</button>
      </div>
      <input class="niche-fields-in" value="${esc((n?.fields || []).map(f => f.label).join(", "))}" placeholder="${t("niche.fieldsPh")}" aria-label="${t("niche.fields")}" autocomplete="off">
    </div>`;
}
// "สภาพผิว, โทนผิว" → fields; a renamed field keeps its key (by position) so saved values stay with it
function readFields(text, old = []) {
  const labels = [...new Set(String(text || "").split(/[,،、]/).map(s => s.trim()).filter(Boolean))];
  const left = old.filter(f => !labels.includes(f.label));
  return labels.map((label, i) => old.find(f => f.label === label) || (old[i] && left.includes(old[i]) ? { key: old[i].key, label } : { key: label, label }));
}
function manageNiches() {
  const counts = D().influencerStats?.byType || {};
  openSheet({
    title: t("niche.manage"), readOnly: !canEdit(),
    body: group(t("niche.listTitle"), `<div id="nicheRows">${NICHES().map(n => nicheRow(n, counts)).join("") || `<div class="empty-row">${t("niche.empty")}</div>`}</div>` +
      (canEdit() ? `<button type="button" class="add-row" data-act="addNicheRow">${icon("plus", 18, 2.4)}${t("niche.add")}</button>` : ""), t("niche.manageNote")),
    save: t("common.save"),
    onSave: async () => {
      const list = [...document.querySelectorAll("#nicheRows .niche-row")].map(r => {
        const key = r.dataset.key || r.querySelector(".niche-label").value.trim();
        return { key, label: r.querySelector(".niche-label").value.trim(), emoji: r.querySelector(".niche-emoji").value.trim(), fields: readFields(r.querySelector(".niche-fields-in").value, nicheOf(key)?.fields) };
      }).filter(n => n.label)
        .map(n => (!NICHES().some(x => x.key === n.key) && (!n.emoji || n.emoji === "🏷️") ? { ...n, emoji: guessIcon(n.label) } : n));
      const kept = new Set(list.map(n => n.key));
      const lost = NICHES().filter(n => !kept.has(n.key)).reduce((s, n) => s + (counts[n.key] || 0), 0);
      if (lost && !await askConfirm(t("niche.removeTitle"), t("niche.removeMsg", { n: lost }), t("common.remove"))) throw new Error(t("niche.notSaved"));
      await saveNiches(list);
      await reload(); loadInfluencers(true);
      return t("toast.saved");
    }
  });
}

export async function openInfluencer(id) {
  let item = null, collabs = [];
  if (id) {
    try { const r = await api("GET", `/w/${S.wid}/influencers/${id}`); item = r.item; collabs = r.collaborations; }
    catch (e) { fail(e); return; }
  }
  const x = item || { name: "", pet_type: "", niches: [], extra: {}, tier: "", blacklisted: false };
  const keys0 = nichesOf(x);
  newInf = { dupesShown: false, mergeInto: null };
  const num = (k, label) => F.text(k, label, x[k], { type: "number", attrs: 'min="0" inputmode="numeric"' });
  const plat = platformSection(x);
  const quick = item ? `<div class="quick-bar">
      ${PLATS.map(pl => { const u = safeUrl(x[pl.link] || splitOtherLinks(x).links[pl.link]); return u ? `<a class="btn gray sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${brandIcon(pl.k, 15)} ${brandName(pl.k)}</a>` : ""; }).join("")}
      ${contactText(x) ? `<button type="button" class="btn gray sm" data-act="copy" data-text="${esc(contactText(x))}">${iconInline("copy")} ${t("inf.copyContact")}</button>` : ""}
      ${x.address ? `<button type="button" class="btn gray sm" data-act="copy" data-text="${esc(x.address)}">${iconInline("pin")} ${t("inf.copyAddress")}</button>` : ""}
    </div>` : "";
  const profile = item ? `<div class="inf-hero c-${tierColor(x.tier)}"><span class="inf-av lg">${avatarHtml(x.pet_type, x.name)}</span><div class="grow"><b>${esc(x.name)}</b><div class="faint small">${esc(x.code || "")}${x.legacy_code ? " · " + esc(x.legacy_code) : ""}</div><div class="hero-pills">${tierPill(x.tier)}${keys0.map(k => `<span class="pill c-violet">${esc(nicheOf(k).emoji)} ${esc(nicheOf(k).label)}</span>`).join("")}${x.category ? `<span class="pill c-teal">${esc(x.category)}</span>` : ""}${x.blacklisted ? `<span class="pill c-red">${iconInline("ban", 12)} Blacklist</span>` : ""}</div></div><div class="hero-num"><b>${fmtNum(x.followers_max)}</b><small>${t("inf.followers")}</small></div></div>` : "";
  const collabList = item ? group(t("inf.collabHistory", { n: collabs.length }),
    (collabs.map(c => `<button type="button" class="set-row" data-act="editCollab" data-id="${c.id}"><span class="r-icon c-${byKey(COLLAB_ST, c.status)?.color || "gray"}">${icon("star", 14, 2.2)}</span><div class="grow"><b class="w550">${esc(c.campaign_name || c.title || t("inf.noCampaign"))}</b><div class="faint small">${[c.fee ? money(c.fee) : "", c.post_date ? fmtDate(c.post_date) : "", c.views ? fmtNum(c.views) + " views" : ""].filter(Boolean).join(" · ")}</div></div><span class="end">${collabPill(c.status)}</span></button>`).join("") || `<div class="empty-row">${t("inf.noCollabs")}</div>`) +
    (canEdit() ? `<button type="button" class="add-row" data-act="newCollab" data-inf="${item.id}" data-inf-name="${esc(x.name)}">${icon("plus", 18, 2.4)}${t("inf.addToCampaign")}</button>` : "")) : "";
  openSheet({
    title: item ? t("inf.profile") : t("inf.new"), wide: true, readOnly: !canEdit(),
    body: profile + quick + collabList +
      group(t("inf.account"), F.title("name", x.name, t("inf.namePh")) +
        F.text("category", t("inf.category"), x.category, { ph: t("inf.categoryPh"), attrs: 'list="infCatList" autocomplete="off"' }) +
        `<datalist id="infCatList">${Object.keys(D().influencerStats?.byCategory || {}).filter(Boolean).map(k => `<option value="${esc(k)}">`).join("")}</datalist>`) +
      group(t("niche.title"), nichePicker(keys0, x.extra) + F.text("pet_name", t("inf.petName"), x.pet_name, { ph: t("inf.petNamePh") }) + F.text("breed", t("inf.breed"), x.breed, { ph: t("inf.breedPh") }) + F.select("tier", "Tier", x.tier || "", [["", t("inf.tierAuto")], ...TIERS.map(x2 => [x2.key, x2.label])]), [t("niche.multiNote"), typeSourceNote(x.type_source)].filter(Boolean).join(" · ")) +
      group(t("inf.platformsPick"), plat.html, t("inf.platformsNote")) +
      group(t("inf.contactPick"), contactSection(x) + F.area("address", t("inf.address"), x.address, t("inf.addressPh"), 2), t("inf.contactNote")) +
      group(t("inf.workNotes"), F.text("brands", t("inf.brands"), x.brands) + F.area("notes", t("inf.notesRate"), x.notes, t("inf.notesPh"), 3)) +
      `<details class="more-box"><summary>${t("inf.moreDetails")}</summary>` +
        group("", F.text("aliases", t("inf.aliases"), x.aliases) + F.text("code", t("inf.code"), x.code, { ph: "CR-0001" }) + num("likes_total", t("inf.likesTotal")) + F.area("link_other", t("inf.otherLinks"), plat.other, "https://", 2) + F.area("history", t("inf.history"), x.history, "", 4)) +
      `</details>` +
      group("Blacklist", F.toggle("blacklisted", t("inf.isBlacklisted"), x.blacklisted) + F.text("blacklist_reason", t("inf.blacklistReason"), x.blacklist_reason)) +
      (item?.sources ? `<p class="fgroup-note">${t("inf.sources")}: ${esc(item.sources).replace(/\n/g, " · ")}${item.merged_count > 1 ? " — " + t("inf.mergedFrom", { n: item.merged_count }) : ""}</p>` : ""),
    save: item ? t("common.done") : t("common.add"),
    onSave: async fd => {
      const keys = JSON.parse(fd.niches || "[]");
      const data = { ...fd, name: fd.name.trim(), niches: keys, blacklisted: !!fd.blacklisted };
      delete data.pet_type;
      // niche field values: the ticked niches' inputs, plus values of fields no longer on the list (kept, not lost)
      const extra = {};
      for (const k of keys) for (const [fk, v] of Object.entries(x.extra?.[k] || {})) (extra[k] ||= {})[fk] = v;
      document.querySelectorAll("#sheetBody [data-xn]").forEach(inp => {
        const k = inp.dataset.xn, v = inp.value.trim();
        if (!keys.includes(k)) return;
        if (v) (extra[k] ||= {})[inp.dataset.xf] = v; else if (extra[k]) delete extra[k][inp.dataset.xf];
      });
      data.extra = extra;
      const fol = [];
      for (const pl of PLATS) {
        const on = !!fd["has_" + pl.k]; delete data["has_" + pl.k];
        data[pl.link] = on ? toLink(pl, fd[pl.link]) : null;
        data[pl.fol] = on && fd[pl.fol] !== "" && fd[pl.fol] != null ? Math.max(0, Math.round(+fd[pl.fol])) : null;
        if (data[pl.link] && !safeUrl(data[pl.link])) throw new Error(t("err.badLinkFor", { name: brandName(pl.k) }));
        if (data[pl.fol] != null) fol.push(data[pl.fol]);
      }
      for (const c of CONTACTS) { const on = !!fd["has_ct_" + c.k]; delete data["has_ct_" + c.k]; data[c.name] = on ? String(fd[c.name] || "").trim() || null : null; }
      if (fol.length) data.followers_max = Math.max(...fol);
      data.likes_total = fd.likes_total === "" || fd.likes_total == null ? null : +fd.likes_total;
      data.tier = fd.tier || autoTier({ ...data, followers_max: data.followers_max ?? x.followers_max });
      // a person picked the niche by hand -> it no longer counts as a guess
      if (keys.length && JSON.stringify(keys) !== JSON.stringify(keys0)) data.type_source = TYPE_CHECKED;
      // a new creator that looks like someone already in the database: warn once, offer to merge into them
      if (!item && !newInf.dupesShown && !newInf.mergeInto) {
        const dupes = await checkNewDupes(data).catch(() => []);
        if (dupes.length) { newInf.dupesShown = true; showDupeWarning(dupes); $("sheetSave").textContent = t("dup.saveNew"); return false; }
      }
      if (item) await api("PATCH", `/w/${S.wid}/influencers/${item.id}`, data);
      else {
        const id = uid();
        await api("POST", `/w/${S.wid}/influencers`, { id, ...data });
        if (newInf.mergeInto) {
          const target = newInf.mergeInto;
          await api("POST", `/w/${S.wid}/influencers/${target.id}/merge`, { from: [id] });
          await reload(); loadInfluencers(true);
          return t("dup.mergedInto", { name: target.name });
        }
      }
      await reload(); loadInfluencers(true);
      return item ? t("toast.saved") : t("toast.infAdded");
    },
    onDelete: item && isAdmin() ? async () => { await api("DELETE", `/w/${S.wid}/influencers/${item.id}`); await reload(); loadInfluencers(true); return t("toast.deleted"); } : null,
    deleteLabel: t("inf.delete")
  });
}
// values of the master file's "ประเภทมาจาก" column, stored as-is so Excel export round-trips
const TYPE_CHECKED = "ตรวจแล้ว";
const TYPE_SRC = { "ต้นฉบับ": "original", "คาดจากชื่อ/สินค้า": "guessed", [TYPE_CHECKED]: "checked" };
function typeSourceNote(src) {
  if (!src) return "";
  const k = TYPE_SRC[src];
  return `${k === "guessed" ? iconInline("alert", 13) + " " : ""}${t("inf.typeSrc")}: ${k ? t("inf.typeSrc." + k) : esc(src)}`;
}
function autoTier(fd) {
  const n = Math.max(0, ...["followers_max", "followers_tiktok", "followers_ig", "followers_fb", "followers_lemon8", "followers_x", "followers_youtube"].map(k => Number(fd[k]) || 0));
  if (!n) return null;
  return n >= 1e6 ? "Mega" : n >= 1e5 ? "Macro" : n >= 1e4 ? "Micro" : "Nano";
}

/* ---------- collaboration sheet ---------- */
export function editCollab(id, preset = {}) {
  const ex = D().collaborations.find(c => c.id === id);
  const c = ex || { id: uid(), influencer_id: preset.influencer_id || "", influencer_name: preset.influencer_name || "", campaign_id: preset.campaign_id || (S.ui.pipeCampaign && S.ui.pipeCampaign !== "none" ? S.ui.pipeCampaign : ""), status: "shortlist", deal_type: "paid", platform: "tiktok", owner_id: S.user.id };
  const picker = ex || c.influencer_id
    ? `<div class="field"><span>${t("inf.creator")}</span><b class="grow min0 ellipsis">${esc(c.influencer_name)}</b>${ex ? `<button type="button" class="text-btn" data-act="openInf" data-id="${c.influencer_id}">${t("inf.profile")}</button>` : ""}<input type="hidden" name="influencer_id" value="${esc(c.influencer_id)}"></div>`
    : `<div class="field picker"><span>${t("inf.creator")}</span><input id="infPick" placeholder="${t("inf.pickPh")}" autocomplete="off" required><input type="hidden" name="influencer_id" id="infPickId"></div><div id="infPickList" class="pick-list"></div>`;
  openSheet({
    title: ex ? t("pipe.detail") : t("inf.addToCampaign"), readOnly: !canEdit() || (ex && widOf(ex) !== S.wid),
    body: group("", picker + F.select("campaign_id", t("pipe.campaign"), c.campaign_id || "", [["", t("inf.noCampaign")], ...D().campaigns.filter(x => widOf(x) === S.wid).map(x => [x.id, x.name])])) +
      group(t("common.status"), F.radios("status", c.status, COLLAB_ST)) +
      group(t("pipe.deal"), F.radios("deal_type", c.deal_type || "", DEALS) + F.select("platform", t("pipe.platform"), c.platform || "", [["", "—"], ...PLATFORMS.map(p => [p.key, p.label])]) + F.text("fee", t("pipe.fee"), c.fee, { type: "number", attrs: 'min="0" step="100" inputmode="numeric"' }) + F.text("product_value", t("pipe.productValue"), c.product_value, { type: "number", attrs: 'min="0" step="100" inputmode="numeric"' }) + F.text("deliverables", t("pipe.deliverables"), c.deliverables, { ph: t("pipe.deliverablesPh") })) +
      group(t("pipe.outreach"), F.text("pic", t("pipe.pic"), c.pic, { ph: t("pipe.picPh"), attrs: 'list="picList" autocomplete="off"' }) +
        `<datalist id="picList">${[...new Set(D().collaborations.map(x => x.pic).filter(Boolean))].slice(0, 50).map(p => `<option value="${esc(p)}">`).join("")}</datalist>` +
        F.text("source", t("pipe.source"), c.source, { ph: "Kalodata, Affi Hunter, Facebook Group…" }) +
        F.text("lead_status", t("pipe.leadStatus"), c.lead_status, { ph: t("pipe.leadStatusPh") }), t("pipe.outreachNote")) +
      group(t("list.followups.title"), F.list("followups", c.followups)) +
      group(t("pipe.production"), F.toggle("contract", t("pipe.contract"), c.contract) + F.toggle("affiliate_link_sent", t("pipe.affiliateSent"), c.affiliate_link_sent) + F.toggle("brief_sent", t("pipe.briefSent"), c.brief_sent) +
        F.text("tracking_number", t("pipe.tracking"), c.tracking_number) + F.text("shipping_status", t("pipe.shipping"), c.shipping_status, { ph: t("pipe.shippingPh") })) +
      group(t("list.drafts.title"), F.list("drafts", c.drafts)) +
      group(t("list.posts.title"), F.list("posts", c.posts)) +
      group(t("pipe.posting"), F.text("post_date", t("pipe.postDate"), c.post_date, { type: "date" }) + F.text("post_url", t("pipe.postUrl"), c.post_url, { type: "url", ph: "https://" }) + F.select("owner_id", t("common.owner"), c.owner_id || "", memberOpts())) +
      group(t("pipe.results"), F.text("views", "Views", c.views, { type: "number", attrs: 'min="0" inputmode="numeric"' }) + F.text("likes", "Likes", c.likes, { type: "number", attrs: 'min="0" inputmode="numeric"' }) + F.text("comments", "Comments", c.comments, { type: "number", attrs: 'min="0" inputmode="numeric"' }) + F.text("shares", "Shares", c.shares, { type: "number", attrs: 'min="0" inputmode="numeric"' })) +
      group(t("common.notes"), F.area("notes", t("common.notes"), c.notes, t("pipe.notesPh"))) +
      (ex && safeUrl(c.post_url) ? `<p class="fgroup-note"><a href="${esc(safeUrl(c.post_url))}" target="_blank" rel="noopener noreferrer">${iconInline("external")} ${t("pipe.openPost")}</a></p>` : "") + commentsBox("collaborations", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      if (!fd.influencer_id) throw new Error(t("err.pickCreator"));
      if (fd.post_url && !safeUrl(fd.post_url)) throw new Error(t("err.badLink"));
      const cp = camp(fd.campaign_id);
      const data = { influencer_id: fd.influencer_id, campaign_id: fd.campaign_id || null, project_id: cp?.project_id || ex?.project_id || null, title: cp?.name || ex?.title || null, status: fd.status, deal_type: fd.deal_type || null, platform: fd.platform || null, fee: fd.fee || null, product_value: fd.product_value || null, deliverables: fd.deliverables, post_date: fd.post_date || null, post_url: fd.post_url || null, views: fd.views || null, likes: fd.likes || null, comments: fd.comments || null, shares: fd.shares || null, owner_id: fd.owner_id || null, notes: fd.notes,
        pic: fd.pic || null, source: fd.source || null, lead_status: fd.lead_status || null, contract: !!fd.contract, affiliate_link_sent: !!fd.affiliate_link_sent, brief_sent: !!fd.brief_sent,
        tracking_number: fd.tracking_number || null, shipping_status: fd.shipping_status || null, drafts: readList("drafts"), posts: readList("posts"), followups: readList("followups") };
      for (const p of data.posts) if (p.url && !safeUrl(p.url)) throw new Error(t("err.badLink"));
      // first posted post fills the main post date / link when those are empty
      const first = data.posts.find(p => p.posted && (p.date || p.url));
      if (first) { data.post_date ||= first.date || null; data.post_url ||= first.url || null; }
      if (ex) { await update("collaborations", ex.id, data); return t("toast.saved"); }
      const picked = pickCache.get(fd.influencer_id) || { name: c.influencer_name };
      await create("collaborations", { id: c.id, ...data, influencer_name: picked.name, influencer_tier: picked.tier, influencer_followers: picked.followers_max, influencer_type: picked.pet_type, influencer_blacklisted: picked.blacklisted });
      if (picked.blacklisted) island(t("pipe.blacklistWarn"), "alert", "orange");
      return t("toast.collabAdded");
    },
    onDelete: ex ? async () => { await destroy("collaborations", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("pipe.delete")
  });
}
const pickCache = new Map();
const searchPick = debounce(async q => {
  const box = $("infPickList"); if (!box) return;
  if (!q.trim()) { box.innerHTML = ""; return; }
  try {
    const r = await api("GET", `/w/${S.wid}/influencers?q=${encodeURIComponent(q)}&size=8&blacklist=include`);
    r.items.forEach(x => pickCache.set(x.id, x));
    box.innerHTML = r.items.map(x => `<button type="button" class="row" data-act="pickInf" data-id="${x.id}" style="--inset:58px"><span class="inf-av xs c-${tierColor(x.tier)}">${avatarHtml(x.pet_type, x.name)}</span><div class="r-main"><span class="r-title">${esc(x.name)}${x.blacklisted ? ` <span class="pill c-red">Blacklist</span>` : ""}</span><span class="r-sub">${esc(x.tier || "")} · ${fmtNum(x.followers_max)} ${t("inf.followers")}${x.pet_name ? " · " + esc(x.pet_name) : ""}</span></div></button>`).join("") || `<div class="empty-row">${t("inf.noneFound")}</div>`;
  } catch (e) { fail(e); }
}, 250);

/* ---------- import / export ---------- */
async function importFile(file) {
  const fd = () => { const f = new FormData(); f.append("file", file); return f; };
  try {
    island(t("inf.reading"), "upload", "blue");
    const pre = await api("POST", `/w/${S.wid}/influencers/import?preview=1`, fd());
    const sheets = pre.sheets.filter(s => !s.blacklist).map(s => `${s.name} ${s.rows}`).join(" · ");
    if (!await askConfirm(t("inf.importConfirm", { n: pre.total }), `${sheets}\nBlacklist ${pre.blacklisted}\n\n${t("inf.importMerge")}${pre.maybeDupes ? "\n\n" + t("dup.import", { n: pre.maybeDupes }) : ""}`, t("inf.importBtn"), false)) return;
    const r = await api("POST", `/w/${S.wid}/influencers/import`, fd());
    await reload(); await loadInfluencers(true);
    island(t("inf.imported", { c: r.created, u: r.updated }), "upload", "green");
  } catch (e) { fail(e); }
}
async function exportXlsx() {
  try {
    const res = await api("GET", `/w/${S.wid}/influencers/export.xlsx`, null, { raw: true });
    downloadBlob(`Influencer_Database_${todayISO()}.xlsx`, await res.blob());
    island(t("toast.exported"), "download", "blue");
  } catch (e) { fail(e); }
}
export function pickXlsx() { $("fileXlsx").click(); }
export function initInfluencerInputs() {
  $("fileXlsx").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); });
  document.addEventListener("input", e => {
    if (e.target.matches("[data-infq]")) { I().q = e.target.value; reloadSoon(); }
    if (e.target.id === "infPick") { $("infPickId").value = ""; searchPick(e.target.value); }
  });
  document.addEventListener("change", e => { if (e.target.matches?.("input[data-niche]")) onNicheToggle(e.target); });
}

export const infActions = {
  infView: el => { S.ui.infView = el.dataset.v; hooks.render(); },
  infType: el => { I().type = el.dataset.v; loadInfluencers(true); },
  infFilter: el => openPopover(el, S.ui.infFilterPanel?.() || ""),
  infUnset: el => { const k = el.dataset.v; I()[k] = k === "blacklist" ? "exclude" : k === "contact" || k === "address" ? false : ""; loadInfluencers(true); },
  pickTog: el => {
    const on = !el.classList.contains("on"), box = el.closest("form, .sheet-body, #sheetBody") || document;
    el.classList.toggle("on", on); el.setAttribute("aria-pressed", on);
    const row = box.querySelector(`.pick-row[data-grp="${el.dataset.grp}"][data-v="${el.dataset.v}"]`);
    if (!row) return;
    row.hidden = !on;
    row.querySelector('input[type="hidden"]').value = on ? "1" : "";
    if (on) row.querySelector("input:not([type=hidden]), textarea")?.focus();
  },
  infClear: () => { Object.assign(I(), { type: "", category: "", tier: "", platform: "", contact: false, address: false, blacklist: "exclude" }); loadInfluencers(true); },
  infCat: el => { I().category = el.dataset.v; loadInfluencers(true); },
  infTier: el => { I().tier = I().tier === el.dataset.v ? "" : el.dataset.v; loadInfluencers(true); },
  infContact: () => { I().contact = !I().contact; loadInfluencers(true); },
  infAddress: () => { I().address = !I().address; loadInfluencers(true); },
  infReset: () => { Object.assign(I(), { q: "", type: "", category: "", tier: "", platform: "", contact: false, address: false, blacklist: "exclude" }); loadInfluencers(true); },
  infMoreRows: () => { I().page++; loadInfluencers(false); },
  openInf: el => openInfluencer(el.dataset.id),
  newInf: () => openInfluencer(null),
  newCollab: el => editCollab(null, { influencer_id: el.dataset.inf, influencer_name: el.dataset.infName, campaign_id: el.dataset.campaign }),
  editCollab: el => editCollab(el.dataset.id),
  pickInf: el => { const x = pickCache.get(el.dataset.id); $("infPick").value = x.name; $("infPickId").value = x.id; $("infPickList").innerHTML = ""; },
  pipeCamp: el => { S.ui.pipeCampaign = el.dataset.v; S.ui.pipeShow = {}; hooks.render(); },
  pipeMore: el => { S.ui.pipeShow = { ...(S.ui.pipeShow || {}), [el.dataset.v]: (S.ui.pipeShow?.[el.dataset.v] || PIPE_PAGE) + 200 }; hooks.render(); },
  pipeStatus: () => { S.ui.infView = "pipeline"; location.hash = "influencers"; hooks.render(); },
  importXlsx: () => pickXlsx(),
  exportXlsx: () => exportXlsx(),
  copy: el => copyText(el.dataset.text),
  addNiche: el => addNiche(el),
  manageNiches: () => manageNiches(),
  addNicheRow: () => { const box = $("nicheRows"); box.querySelector(".empty-row")?.remove(); box.insertAdjacentHTML("beforeend", nicheRow(null, {})); box.lastElementChild?.querySelector(".niche-label")?.focus(); },
  rmNicheRow: el => el.closest(".niche-row").remove(),
  mergeNewInto: el => { newInf.mergeInto = { id: el.dataset.id, name: el.dataset.name }; $("sheetForm").requestSubmit(); },
  ...toolActions,
  infMore: el => {
    import("../ui.js").then(({ openPopover }) => openPopover(el, `${canEdit() ? `<button class="mi" data-act="importXlsx">${icon("upload", 18)}${t("inf.import")}</button>` : ""}<button class="mi" data-act="exportXlsx">${icon("download", 18)}${t("inf.export")}</button><hr><button class="mi" data-act="manageNiches">${icon("star", 18)}${t("niche.manage")}</button><button class="mi" data-act="nicheReport">${icon("activity", 18)}${t("niche.report")}</button><hr><button class="mi" data-act="findDupes">${icon("users", 18)}${t("dup.title")}</button>${canEdit() ? `<button class="mi" data-act="contactReview">${icon("message", 18)}${t("cr.title")}</button>` : ""}`));
  }
};
export function onInfFilter(key, value) { I()[key] = value; loadInfluencers(true); }
export function dropCollab(id, status) {
  const c = D().collaborations.find(x => x.id === id);
  if (!c || c.status === status) return;
  update("collaborations", id, { status }).then(() => island(t("toast.movedTo", { name: byKey(COLLAB_ST, status).label }), "kanban", byKey(COLLAB_ST, status).color)).catch(fail);
}
export { closeSheet, memberAvatar, proj, memberName, projectOpts };
