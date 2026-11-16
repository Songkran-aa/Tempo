import { S, D, esc, icon, iconInline, proj, CHANNELS, chOf, CAMP_ST, OBJECTIVES, byKey, money, moneyShort, fmtDate, fmtNum, uid, canEdit, canEditProject, todayISO, memberName } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, campPill, collabPill, memberAvatar, chipBtn, selectChip, seg, F, group, memberOpts, projectOpts, openSheet, island, csvCell, downloadBlob, tierPill, commentsBox, filterUI } from "../ui.js";
import { create, update, destroy, hooks } from "../store.js";
import { campaignActual } from "./finance.js";

export function campaignCreators(cid) { return D().collaborations.filter(c => c.campaign_id === cid); }

export function viewCampaigns() {
  const d = D(), cf = S.ui.cf;
  const q = (S.ui.cq || "").trim().toLowerCase();
  const camps = d.campaigns.filter(c => (!cf.project || c.project_id === cf.project) && (!cf.status || c.status === cf.status)
    && (!cf.channel || chOf(c.channel).key === cf.channel) && (!cf.owner || c.owner_id === cf.owner)
    && (!q || [c.name, c.kpi, c.target, c.notes, proj(c.project_id)?.name].join(" ").toLowerCase().includes(q))).sort((a, b) => (a.start_date || "9999").localeCompare(b.start_date || "9999"));
  const budget = camps.reduce((s, c) => s + (+c.budget || 0), 0), spent = camps.reduce((s, c) => s + (+c.spent || 0), 0);
  const collabs = d.collaborations.filter(c => camps.some(x => x.id === c.campaign_id));
  const fees = collabs.reduce((s, c) => s + (+c.fee || 0), 0);
  const views = collabs.reduce((s, c) => s + (+c.views || 0), 0);
  const head = pageHead(t("camp.count", { n: d.campaigns.length }), t("nav.campaigns"),
    (matchMedia("(max-width: 760px)").matches ? "" : seg("campView", [["table", t("view.table"), "table"], ["cards", t("view.cards"), "grid"]], S.ui.campView)) +
    `<a class="btn glassy hide-m" href="#timeline">${icon("gantt", 17)}${t("nav.timeline")}</a><button class="circle-btn" data-act="exportCamp" aria-label="${t("common.exportCsv")}" title="${t("common.exportCsv")}">${icon("download", 18)}</button>` +
    (canEdit() ? `<button class="btn filled" data-act="newCamp">${icon("plus", 18, 2.4)}${t("camp.new")}</button>` : ""));
  if (!d.campaigns.length) return head + `<div class="card glass">${empty("megaphone", t("camp.emptyTitle"), t("camp.emptyText"), canEdit() ? `<button class="btn filled" data-act="newCamp">${icon("plus", 18, 2.4)}${t("camp.new")}</button>` : "")}</div>`;
  const stats = [
    [t("nav.campaigns"), camps.length, "megaphone", "accent"], [t("campStatus.live"), camps.filter(c => c.status === "live").length, "zap", "green"],
    [t("camp.budgetTotal"), moneyShort(budget), "wallet", "indigo"], [t("camp.spent"), budget ? Math.round(spent / budget * 100) + "%" : "—", "target", "orange"],
    [t("camp.creatorFees"), moneyShort(fees), "star", "violet"], [t("camp.totalViews"), fmtNum(views), "eye", "pink"]
  ].map(([l, v, ic, c]) => `<div class="stat glass c-${c}"><span class="stat-l">${icon(ic, 15)}<span>${l}</span></span><b>${v}</b></div>`).join("");
  // same filter pattern as the creators page: search + one Filters button; chips only for filters in use
  const fu = filterUI("cf", [
    { k: "project", label: t("common.project"), icon: "folder", opts: d.projects.map(p => [p.id, `${p.emoji || "📁"} ${p.name}`]) },
    { k: "status", label: t("common.status"), icon: "activity", opts: CAMP_ST.map(s => [s.key, s.label]) },
    { k: "channel", label: t("camp.channel"), icon: "megaphone", opts: CHANNELS.map(c => [c.key, c.label]) },
    { k: "owner", label: t("common.owner"), icon: "user", opts: d.members.map(m => [m.user_id, m.name]) }
  ]);
  const chips = `<div class="toolbar mt"><label class="search-field glass">${icon("search", 16)}<input id="campSearch" data-model="cq" value="${esc(S.ui.cq || "")}" placeholder="${t("camp.search")}" autocomplete="off" type="search"></label>
    <div class="right">${fu.button}<span class="faint small">${t("camp.count", { n: camps.length })}</span></div></div>${fu.chips}`;
  const byCh = CHANNELS.map(ch => ({ ...ch, label: ch.label, b: camps.filter(c => chOf(c.channel).key === ch.key).reduce((s, c) => s + (+c.budget || 0), 0) })).filter(x => x.b);
  const maxB = Math.max(1, ...byCh.map(x => x.b));
  const chCard = byCh.length ? `<div class="card glass mt"><div class="card-head"><h3>${icon("wallet", 18)}${t("camp.budgetByChannel")}</h3><span class="faint small">${t("common.total")} ${money(budget)}</span></div><div class="ch-bars">${byCh.map(x => `<div class="c-${x.color}"><span class="ch-name"><span class="r-icon sm c-${x.color}">${icon(x.icon, 13, 2.4)}</span>${esc(x.label)}</span><div class="bar"><i style="width:${x.b / maxB * 100}%"></i></div><b>${moneyShort(x.b)}</b></div>`).join("")}</div></div>` : "";
  const cards = camps.map(c => {
    const ch = chOf(c.channel), p = proj(c.project_id), cr = campaignCreators(c.id);
    const pct = +c.budget ? Math.min(100, Math.round((+c.spent || 0) / +c.budget * 100)) : 0;
    const posted = cr.filter(x => ["posted", "completed"].includes(x.status)).length;
    return `<button class="camp glass" data-act="editCamp" data-id="${c.id}">
      <div class="camp-top"><span class="r-icon c-${ch.color}">${icon(ch.icon, 19, 2.2)}</span><div class="grow"><h3>${esc(c.name)}</h3><span class="faint small">${esc(ch.label)}${c.objective ? " · " + esc(byKey(OBJECTIVES, c.objective)?.label || c.objective) : ""}</span></div>${campPill(c.status)}</div>
      <div class="camp-facts"><div><span>${t("camp.period")}</span><b><span class="nw">${c.start_date ? fmtDate(c.start_date) : "—"}${c.end_date ? " –" : ""}</span>${c.end_date ? ` <span class="nw">${fmtDate(c.end_date)}</span>` : ""}</b></div><div><span>KPI</span><b>${esc(c.kpi || "—")}${c.target ? " · " + esc(c.target) : ""}</b></div><div><span>${t("camp.budget")}</span><b>${money(c.budget)}</b></div><div><span>${t("nav.influencers")}</span><b>${cr.length ? t("camp.creatorsPosted", { n: cr.length, p: posted }) : "—"}</b></div></div>
      ${+c.budget ? `<div class="c-${ch.color}"><div class="kv"><span>${t("camp.spentOf", { v: money(c.spent) })}</span><b>${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>` : ""}
      <div class="camp-foot">${p ? `<span>${esc(p.emoji || "📁")} ${esc(p.name)}</span>` : "<span></span>"}${memberAvatar(c.owner_id, 24)}</div>
    </button>`;
  }).join("");
  // table: one line per campaign — period, budget used, creators and posts at a glance
  const wide = !matchMedia("(max-width: 760px)").matches;
  const table = camps.map(c => {
    const ch = chOf(c.channel), p = proj(c.project_id), cr = campaignCreators(c.id);
    const pct = +c.budget ? Math.min(100, Math.round((+c.spent || 0) / +c.budget * 100)) : 0;
    const posted = cr.filter(x => ["posted", "completed"].includes(x.status)).length;
    return `<div class="dt-row" data-act="editCamp" data-id="${c.id}" role="button" tabindex="0">
      <span class="dt-main"><b><span class="dot c-${ch.color}"></span>${esc(c.name)}</b><small class="ellipsis">${esc(ch.label)}${c.objective ? " · " + esc(byKey(OBJECTIVES, c.objective)?.label || c.objective) : ""}</small></span>
      <span class="ellipsis">${p ? `${esc(p.emoji || "📁")} ${esc(p.name)}` : `<span class="faint">${t("common.noProject")}</span>`}</span>
      <span>${campPill(c.status)}</span>
      <span class="small"><span class="nw">${c.start_date ? fmtDate(c.start_date) : "—"}</span>${c.end_date ? ` – <span class="nw">${fmtDate(c.end_date)}</span>` : ""}</span>
      <span class="dt-num">${+c.budget ? `<b>${money(c.budget)}</b><span class="mini-bar c-${pct >= 100 ? "red" : "accent"}"><i style="width:${pct}%"></i></span>` : `<span class="faint">—</span>`}</span>
      <span class="dt-num">${cr.length ? `<b>${fmtNum(cr.length)}</b><small>${t("camp.postedN", { n: posted })}</small>` : `<span class="faint">—</span>`}</span>
      <span>${memberAvatar(c.owner_id, 24)}</span>
    </div>`;
  }).join("");
  const list = S.ui.campView === "table" && wide
    ? `<div class="dt dt-camps glass mt"><div class="dt-head"><span>${t("nav.campaigns")}</span><span>${t("common.project")}</span><span>${t("common.status")}</span><span>${t("camp.period")}</span><span class="dt-num">${t("camp.budget")}</span><span class="dt-num">${t("camp.creators")}</span><span></span></div>${table}</div>`
    : `<div class="camp-grid">${cards}</div>`;
  return head + `<div class="stat-tiles six">${stats}</div>` + chCard + chips + (camps.length ? list : `<div class="card glass mt">${empty("search", t("camp.noneFound"), t("tasks.noneFoundText"), `<button class="btn gray" data-act="fClear" data-m="cf">${t("filter.clear")}</button>`)}</div>`);
}

export function editCamp(id, preset = {}) {
  const ex = D().campaigns.find(c => c.id === id);
  const c = ex || { id: uid(), name: "", project_id: preset.project_id ?? (S.ui.cf.project || ""), channel: "social", objective: "awareness", status: "draft", start_date: "", end_date: "", budget: "", spent: "", kpi: "", target: "", owner_id: S.user.id, notes: "" };
  const chKey = chOf(c.channel).key;
  const chOpts = [...CHANNELS.map(x => [x.key, x.label]), ...(CHANNELS.some(x => x.key === chKey) ? [] : [[c.channel, c.channel]])];
  const cr = ex ? campaignCreators(ex.id) : [];
  const creators = ex ? group(t("camp.creatorsIn", { n: cr.length }), (cr.map(x => `<button type="button" class="set-row" data-act="editCollab" data-id="${x.id}"><span class="avatar c-violet" style="--s:30px">★</span><div class="grow"><b class="w550">${esc(x.influencer_name)}</b> ${tierPill(x.influencer_tier)}<div class="faint small">${x.fee ? money(x.fee) + " · " : ""}${x.post_date ? fmtDate(x.post_date) : ""}${x.views ? " · " + fmtNum(x.views) + " views" : ""}</div></div><span class="end">${collabPill(x.status)}${icon("chevR", 16)}</span></button>`).join("") || `<div class="empty-row">${t("camp.noCreators")}</div>`) +
    (canEdit() ? `<button type="button" class="add-row" data-act="newCollab" data-campaign="${ex.id}">${icon("plus", 18, 2.4)}${t("inf.addToCampaign")}</button>` : "")) : "";
  openSheet({
    title: ex ? t("camp.detail") : t("camp.new"), readOnly: !canEditProject(c.project_id),
    body: group("", F.title("name", c.name, t("camp.namePh")) + F.area("notes", t("camp.brief"), c.notes, t("camp.briefPh"))) +
      group(t("common.status"), F.radios("status", c.status, CAMP_ST)) +
      group(t("camp.plan"), F.select("project_id", t("common.project"), c.project_id || "", projectOpts()) + F.select("channel", t("camp.channel"), chKey, chOpts) + F.select("objective", t("camp.objective"), c.objective || "", OBJECTIVES.map(o => [o.key, o.label])) + F.select("owner_id", t("common.owner"), c.owner_id || "", memberOpts(true, c.project_id))) +
      group(t("camp.period"), F.text("start_date", t("camp.start"), c.start_date, { type: "date" }) + F.text("end_date", t("camp.end"), c.end_date, { type: "date" })) +
      group(t("camp.budgetKpi"), F.text("budget", t("camp.budgetThb"), c.budget, { type: "number", attrs: 'min="0" step="1000" inputmode="numeric"' }) + F.text("spent", t("camp.spentThb"), c.spent, { type: "number", attrs: 'min="0" step="1000" inputmode="numeric"' }) + F.text("kpi", "KPI", c.kpi, { ph: t("camp.kpiPh") }) + F.text("target", t("camp.target"), c.target, { ph: "1,000,000" })) +
      creators + (ex ? group(t("erp.spendFromExpenses"), `<div class="set-row"><span class="r-icon c-green">${icon("receipt", 15, 2.2)}</span>${t("erp.approvedSpend")}<span class="end"><b>${money(campaignActual(ex.id))}</b></span></div>` + (canEdit() ? `<button type="button" class="add-row" data-act="newExpense" data-campaign="${ex.id}" data-project="${ex.project_id || ""}">${icon("plus", 18, 2.4)}${t("erp.newExpense")}</button>` : "")) : "") + commentsBox("campaigns", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      if (fd.start_date && fd.end_date && fd.end_date < fd.start_date) throw new Error(t("err.date_order"));
      const data = { name: fd.name.trim(), notes: fd.notes, status: fd.status, project_id: fd.project_id || null, channel: fd.channel, objective: fd.objective || null, owner_id: fd.owner_id || null, start_date: fd.start_date || null, end_date: fd.end_date || null, budget: fd.budget || null, spent: fd.spent || null, kpi: fd.kpi, target: fd.target };
      if (ex) { await update("campaigns", ex.id, data); return t("toast.saved"); }
      await create("campaigns", { id: c.id, ...data });
      return t("toast.campAdded");
    },
    onDelete: ex ? async () => { await destroy("campaigns", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("camp.delete")
  });
}

function exportCsv() {
  const cols = [t("camp.name"), t("common.project"), t("camp.channel"), t("camp.objective"), t("common.status"), t("camp.start"), t("camp.end"), t("camp.budget"), t("camp.spent"), "KPI", t("camp.target"), t("common.owner"), t("nav.influencers"), t("camp.brief")];
  const rows = [cols, ...D().campaigns.map(c => [c.name, proj(c.project_id)?.name || "", chOf(c.channel).label, byKey(OBJECTIVES, c.objective)?.label || "", byKey(CAMP_ST, c.status)?.label, c.start_date || "", c.end_date || "", c.budget ?? "", c.spent ?? "", c.kpi || "", c.target || "", memberName(c.owner_id), campaignCreators(c.id).length, c.notes || ""])];
  downloadBlob(`tempo-campaigns-${todayISO()}.csv`, new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  island(t("toast.exported"), "download", "blue");
}

export const campActions = {
  newCamp: el => editCamp(null, { project_id: el.dataset.project }),
  editCamp: el => editCamp(el.dataset.id),
  cProject: el => { S.ui.cf.project = el.dataset.v; hooks.render(); },
  campView: el => { S.ui.campView = el.dataset.v; try { localStorage.setItem("pf.campView", el.dataset.v); } catch {} hooks.render(); },
  cStatus: el => { S.ui.cf.status = S.ui.cf.status === el.dataset.v ? "" : el.dataset.v; hooks.render(); },
  exportCamp: () => exportCsv()
};
export { iconInline };
