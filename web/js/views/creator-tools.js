// Creator database tools: report by niche, old-contact review, duplicate finder + the "this may be a duplicate" warning
import { S, $, esc, icon, iconInline, fmtNum, money, canEdit, nicheOf, byKey, TIERS } from "../core.js";
import { brandBadge, brandName } from "../brands.js";
import { t } from "../i18n.js";
import { api } from "../api.js";
import { openSheet, closeSheet, island, askConfirm, empty } from "../ui.js";
import { fail, hooks, reload } from "../store.js";
import { loadInfluencers, openInfluencer } from "./influencers.js";

const FIELD_BRAND = { link_tiktok: "tiktok", link_ig: "instagram", link_fb: "facebook", link_youtube: "youtube", link_x: "x", link_lemon8: "lemon8", contact_line: "line" };
const fieldIcon = f => (FIELD_BRAND[f] ? brandBadge(FIELD_BRAND[f], 20) : `<span class="ct-ic c-${f === "contact_phone" ? "green" : "blue"}">${icon(f === "contact_phone" ? "phone" : "mail", 12, 2.4)}</span>`);
const fieldName = f => (f === "name" ? t("dup.r.name") : f === "contact_phone" ? t("inf.phone") : f === "contact_email" ? t("inf.email") : f === "contact_line" ? "LINE" : brandName(FIELD_BRAND[f] || f));
const shortLink = v => String(v || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\?.*$/, "");
const tierColor = k => byKey(TIERS, k)?.color || "gray";
const avatar = (keys, name, cls = "xs") => {
  const n = nicheOf((keys || [])[0]);
  return `<span class="inf-av ${cls}">${n ? `<i class="emo">${esc(n.emoji)}</i>` : esc((String(name || "?").replace(/^[@._\-\d]+/, "")[0] || "?").toUpperCase())}</span>`;
};
const nicheText = keys => (keys || []).map(k => { const n = nicheOf(k); return `${n.emoji} ${n.label}`; }).join(" · ");
const refresh = () => { reload().catch(() => {}); loadInfluencers(true); };

/* ---------- report by niche ---------- */
const PERIODS = [[0, "niche.repAll"], [365, "niche.rep365"], [90, "niche.rep90"], [30, "niche.rep30"]];
let repDays = 0;
export async function nicheReport(days = repDays) {
  repDays = days;
  let r;
  try { r = await api("GET", `/w/${S.wid}/influencers/niche-report?days=${days}`); } catch (e) { fail(e); return; }
  const rows = r.rows.filter(x => x.creators || x.collabs).sort((a, b) => b.spend - a.spend || b.collabs - a.collabs || b.creators - a.creators);
  const max = Math.max(1, ...rows.map(x => x.spend));
  const chips = `<div class="chips nrep-period">${PERIODS.map(([d, k]) => `<button type="button" class="chip ${d === days ? "on" : ""}" data-act="nrepDays" data-v="${d}">${t(k)}</button>`).join("")}</div>`;
  const head = `<div class="nrep-row nrep-head"><span>${t("niche.title")}</span><span>${t("niche.repCollabs")}</span><span>${t("niche.repSpend")}</span><span>${t("niche.repViews")}</span><span>${t("niche.repCpv")}</span></div>`;
  const row = x => {
    const n = x.k ? nicheOf(x.k) : { emoji: "—", label: t("niche.none") };
    return `<button type="button" class="nrep-row" data-act="nrepOpen" data-v="${esc(x.k || "none")}">
      <span class="nrep-name"><i class="emo">${esc(n.emoji)}</i><span class="min0"><b>${esc(n.label)}</b><small>${t("niche.repCreators")} ${fmtNum(x.creators)}${x.avg_followers ? ` · ${t("niche.repAvgFol")} ${fmtNum(x.avg_followers)}` : ""}</small></span></span>
      <span class="nrep-num" data-l="${esc(t("niche.repCollabs"))}"><b>${fmtNum(x.collabs)}</b><small>${t("niche.repPosted", { n: fmtNum(x.posted) })}</small></span>
      <span class="nrep-num" data-l="${esc(t("niche.repSpend"))}"><b>${x.spend ? money(x.spend) : "—"}</b><span class="nrep-bar"><i style="width:${Math.round((x.spend / max) * 100)}%"></i></span></span>
      <span class="nrep-num" data-l="${esc(t("niche.repViews"))}"><b>${x.views ? fmtNum(x.views) : "—"}</b></span>
      <span class="nrep-num" data-l="${esc(t("niche.repCpv"))}"><b>${x.views && x.spend ? "฿" + (x.spend / x.views).toFixed(2) : "—"}</b></span>
    </button>`;
  };
  const body = chips + (rows.length ? `<div class="nrep glass-in">${head}${rows.map(row).join("")}</div>` : `<div class="card">${empty("activity", t("niche.repEmpty"), "")}</div>`) +
    `<p class="fgroup-note">${t("niche.repNote")}</p>`;
  if ($("sheet").open && $("sheetBody").querySelector(".nrep-period")) { $("sheetBody").innerHTML = body; return; }
  openSheet({ title: t("niche.report"), wide: true, readOnly: true, body });
}

/* ---------- old contact notes → their own fields ---------- */
export async function contactReview() {
  let r;
  try { r = await api("GET", `/w/${S.wid}/influencers/contact-review`); } catch (e) { fail(e); return; }
  const item = x => `<div class="cr-item">
      <div class="cr-head"><b>${esc(x.name)}</b>${x.code ? `<span class="faint small">${esc(x.code)}</span>` : ""}<button type="button" class="text-btn sm" data-act="openInf" data-id="${x.id}">${t("dup.open")}</button></div>
      <div class="cr-note">${esc(x.contact)}</div>
      ${x.moves.map(m => `<label class="cr-move"><input type="checkbox" data-cr="${x.id}" data-f="${m.field}" checked>${fieldIcon(m.field)}<span class="grow min0"><b>${esc(fieldName(m.field))}</b> ${esc(m.field.startsWith("link_") ? shortLink(m.value) : m.value)}</span></label>`).join("")}
    </div>`;
  openSheet({
    title: t("cr.title"), wide: true, readOnly: !canEdit(),
    body: r.items.length
      ? `<p class="fgroup-note top">${t("cr.intro", { n: fmtNum(r.items.length) })}</p>
        ${canEdit() ? `<div class="chips"><button type="button" class="chip" data-act="crAll" data-v="1">${t("cr.all")}</button><button type="button" class="chip" data-act="crAll" data-v="">${t("cr.clear")}</button></div>` : ""}
        <div class="cr-list">${r.items.map(item).join("")}</div>`
      : `<div class="card">${empty("check", t("cr.none", { n: fmtNum(r.withNotes) }), "")}</div>`,
    save: r.items.length ? t("cr.save") : t("common.done"),
    onSave: async () => {
      if (!r.items.length) return null;
      const by = new Map();
      document.querySelectorAll("#sheetBody input[data-cr]:checked").forEach(cb => { if (!by.has(cb.dataset.cr)) by.set(cb.dataset.cr, []); by.get(cb.dataset.cr).push(cb.dataset.f); });
      if (!by.size) throw new Error(t("cr.nothing"));
      const res = await api("POST", `/w/${S.wid}/influencers/contact-review`, { items: [...by].map(([id, fields]) => ({ id, fields })) });
      refresh();
      return t("cr.done", { n: fmtNum(res.moved) });
    }
  });
}

/* ---------- duplicates ---------- */
const memberLine = m => `${avatar(m.niches, m.name)}<span class="grow min0"><b class="ellipsis">${esc(m.name)}</b><small class="faint">${[m.code, m.followers_max ? fmtNum(m.followers_max) + " " + t("inf.followers") : "", nicheText(m.niches)].filter(Boolean).map(esc).join(" · ")}${m.blacklisted ? ` · <span class="pill c-red">Blacklist</span>` : ""}</small></span>`;
const whyText = reasons => (reasons.some(r => r !== "name") ? t("dup.same", { what: reasons.filter(r => r !== "name").map(fieldName).join(", ") }) : t("dup.nameOnly"));
let groups = [];
export async function findDuplicates() {
  let r;
  try { r = await api("GET", `/w/${S.wid}/influencers/duplicates`); } catch (e) { fail(e); return; }
  groups = r.groups;
  const group = (g, i) => {
    const strong = g.reasons.some(x => x !== "name");
    return `<div class="dup-group" data-g="${i}">
      <div class="dup-why ${strong ? "" : "weak"}">${iconInline(strong ? "users" : "alert", 13)} ${esc(whyText(g.reasons))}</div>
      ${g.members.map((m, j) => `<div class="dup-mem">
        <label class="dup-keep" title="${t("dup.keep")}"><input type="radio" name="dk${i}" value="${m.id}" ${j === 0 ? "checked" : ""}><span>${t("dup.keep")}</span></label>
        ${memberLine(m)}
        <button type="button" class="text-btn sm" data-act="openInf" data-id="${m.id}">${t("dup.open")}</button>
        <label class="dup-pick"><input type="checkbox" data-dm="${m.id}" ${j > 0 && strong && g.members.length <= 3 ? "checked" : ""}><span>${t("dup.pick")}</span></label>
      </div>`).join("")}
      ${canEdit() ? `<div class="dup-foot"><button type="button" class="btn filled sm" data-act="dupMerge" data-g="${i}">${icon("users", 15)} ${t("dup.merge")}</button></div>` : ""}
    </div>`;
  };
  openSheet({
    title: t("dup.title"), wide: true, readOnly: !canEdit(), save: t("common.done"), onSave: async () => null,
    body: groups.length ? `<p class="fgroup-note top">${t("dup.intro")} <b>${t("dup.groups", { n: fmtNum(groups.length) })}</b></p>${groups.map(group).join("")}`
      : `<div class="card">${empty("check", t("dup.none"), "")}</div>`
  });
}
async function mergeGroup(el) {
  const box = el.closest(".dup-group"), g = groups[+box.dataset.g];
  const keep = box.querySelector("input[type=radio]:checked")?.value;
  const from = [...box.querySelectorAll("input[data-dm]:checked")].map(cb => cb.dataset.dm).filter(id => id !== keep);
  if (!keep || !from.length) { island(t("dup.pickOne"), "alert", "orange"); return; }
  const name = g.members.find(m => m.id === keep)?.name || "";
  if (!await askConfirm(t("dup.mergeTitle", { n: from.length, name }), t("dup.mergeMsg"), t("dup.merge"))) return;
  try {
    el.disabled = true;
    const r = await api("POST", `/w/${S.wid}/influencers/${keep}/merge`, { from });
    box.remove();
    island(t("dup.merged", { n: r.collaborations }), "users", "green");
    refresh();
  } catch (e) { el.disabled = false; fail(e); }
}

/* ---------- "this may be a duplicate" while adding a creator ---------- */
export async function checkNewDupes(data) {
  const r = await api("POST", `/w/${S.wid}/influencers/dupes`, data);
  return r.items || [];
}
export function showDupeWarning(items) {
  $("sheetBody").querySelector(".dupe-warn")?.remove();
  $("sheetBody").insertAdjacentHTML("afterbegin", `<div class="dupe-warn">
    <div class="dw-head">${icon("alert", 18)}<div><b>${t("dup.warnTitle")}</b><small>${t("dup.warnText")}</small></div></div>
    ${items.map(m => `<div class="dup-mem">${memberLine(m)}<span class="dup-why-sm">${esc(whyText(m.reasons))}</span>
      <button type="button" class="btn gray sm" data-act="mergeNewInto" data-id="${m.id}" data-name="${esc(m.name)}">${t("dup.mergeInto")}</button></div>`).join("")}
  </div>`);
  $("sheetBody").scrollTop = 0;
}

export const toolActions = {
  nicheReport: () => nicheReport(0),
  nrepDays: el => nicheReport(+el.dataset.v || 0),
  nrepOpen: el => { closeSheet(); Object.assign(S.inf, { type: el.dataset.v }); S.ui.infView = "directory"; if (location.hash !== "#influencers") location.hash = "influencers"; loadInfluencers(true); hooks.render(); },
  contactReview: () => contactReview(),
  crAll: el => document.querySelectorAll("#sheetBody input[data-cr]").forEach(cb => { cb.checked = !!el.dataset.v; }),
  findDupes: () => findDuplicates(),
  dupMerge: el => mergeGroup(el)
};
