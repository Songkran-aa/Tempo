// Partners & contracts (CRM): suppliers, agencies, customers … with their contracts, products and spend.
import { S, D, esc, icon, uid, money, moneyShort, fmtDate, relDay, byKey, canEdit, proj, partner, daysTo, todayISO, memberName, PARTNER_KINDS, CONTRACT_ST, EXP_ST, safeUrl } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, chipBtn, F, group, memberOpts, projectOpts, openSheet, island, seg, avatar, memberAvatar, commentsBox, kpi, keyPill, searchBox, readList, csvCell, downloadBlob } from "../ui.js";
import { create, update, destroy, hooks, reload } from "../store.js";

const partnerOpts = (none = true) => [...(none ? [["", t("common.none")]] : []), ...D().partners.map(p => [p.id, p.name])];
export const partnerSpend = pid => D().expenses.filter(e => e.partner_id === pid && ["approved", "paid"].includes(e.status)).reduce((s, e) => s + (+e.amount || 0), 0);

/** active contracts that end within their reminder window (or already ended but still marked active) */
export const expiringContracts = () => D().contracts.filter(c => c.status === "active" && c.end_date && daysTo(c.end_date) <= (c.remind_days ?? 30));

function contractEnd(c) {
  if (!c.end_date) return "";
  const n = daysTo(c.end_date);
  if (c.status !== "active") return `<span class="faint small">${fmtDate(c.end_date)}</span>`;
  const cls = n < 0 ? "late" : n <= (c.remind_days ?? 30) ? "today" : "";
  return `<span class="due ${cls}">${icon("calendar", 13)}${n < 0 || n <= (c.remind_days ?? 30) ? relDay(c.end_date) : fmtDate(c.end_date)}</span>`;
}

export function contractRow(c) {
  const p = partner(c.partner_id);
  return `<button class="row" data-act="editContract" data-id="${c.id}" style="--inset:58px"><span class="r-icon c-${byKey(CONTRACT_ST, c.status)?.color || "gray"}">${icon("file", 15, 2.2)}</span>
    <div class="r-main"><span class="r-title">${esc(c.title)}</span><span class="r-sub">${p ? esc(p.name) + " · " : ""}${c.start_date ? fmtDate(c.start_date) : ""}${c.end_date ? " – " + fmtDate(c.end_date) : ""}</span></div>
    <span class="r-end">${c.value ? `<b class="money">${money(c.value)}</b>` : ""}${contractEnd(c)}${keyPill(CONTRACT_ST, c.status)}</span></button>`;
}

export function viewPartners() {
  const d = D(), pf = S.ui.pf, q = S.ui.pq.trim().toLowerCase();
  const tabs = seg("pfTab", [["partners", t("erp.partners"), "briefcase"], ["contracts", t("erp.contracts"), "file"]], pf.tab);
  const head = pageHead(t("erp.partnersCount", { n: d.partners.length }), t("nav.partners"),
    `<button class="circle-btn" data-act="exportPartners" aria-label="${t("common.exportCsv")}" title="${t("common.exportCsv")}">${icon("download", 18)}</button>` +
    (canEdit() ? `<button class="btn glassy hide-m" data-act="newContract">${icon("file", 17)}${t("erp.newContract")}</button><button class="btn filled" data-act="newPartner">${icon("plus", 18, 2.4)}${t("erp.newPartner")}</button>` : ""));
  if (!d.partners.length && !d.contracts.length) return head + `<div class="card glass">${empty("briefcase", t("erp.partnersEmpty"), t("erp.partnersEmptyText"), canEdit() ? `<button class="btn filled" data-act="newPartner">${icon("plus", 18, 2.4)}${t("erp.newPartner")}</button>` : "")}</div>`;

  const active = d.contracts.filter(c => c.status === "active");
  const stats = `<div class="stat-tiles">${[
    kpi(t("erp.partners"), d.partners.length, "briefcase", "accent"),
    kpi(t("erp.activeContracts"), active.length, "file", "green"),
    kpi(t("erp.contractValue"), moneyShort(active.reduce((s, c) => s + (+c.value || 0), 0)), "wallet", "indigo"),
    kpi(t("erp.expiringSoon"), expiringContracts().length, "clock", "orange")
  ].join("")}</div>`;
  const toolbar = `<div class="toolbar"><div class="left">${tabs}</div><div class="right">${searchBox("pq", "pq", S.ui.pq, t("erp.searchPartners"))}</div></div>`;

  if (pf.tab === "contracts") {
    const list = d.contracts.filter(c => (!pf.cst || c.status === pf.cst) && (!q || [c.title, partner(c.partner_id)?.name, c.notes].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || (a.end_date || "9999").localeCompare(b.end_date || "9999"));
    const chips = `<div class="chips">${chipBtn("pfCst", "", t("common.all"), !pf.cst)}${CONTRACT_ST.map(s => chipBtn("pfCst", s.key, s.label, pf.cst === s.key, `<span class="dot c-${s.color}"></span>`)).join("")}</div>`;
    return head + stats + toolbar + chips + `<div class="card glass list-card mt"><div class="list">${list.map(contractRow).join("") || `<div class="empty-row">${t("erp.noContracts")}</div>`}</div></div>`;
  }

  const list = d.partners.filter(p => (!pf.kind || p.kind === pf.kind) && (!q || [p.name, p.contact_name, p.email, p.phone, p.tags, p.notes].join(" ").toLowerCase().includes(q)));
  const chips = `<div class="chips">${chipBtn("pfKind", "", t("common.all"), !pf.kind)}${PARTNER_KINDS.map(k => chipBtn("pfKind", k.key, `${k.label} ${d.partners.filter(p => p.kind === k.key).length || ""}`, pf.kind === k.key, `<span class="dot c-${k.color}"></span>`)).join("")}</div>`;
  const cards = list.map(p => {
    const k = byKey(PARTNER_KINDS, p.kind) || PARTNER_KINDS[5];
    const cs = d.contracts.filter(c => c.partner_id === p.id), spend = partnerSpend(p.id), prods = d.products.filter(x => x.partner_id === p.id).length;
    return `<button class="pcard glass" data-act="editPartner" data-id="${p.id}">
      <div class="pcard-top">${avatar(p.name, 42, k.color)}<div class="grow min0"><h3 class="clamp2">${esc(p.name)}</h3>${p.contact_name || p.email || p.phone ? `<span class="faint small ellipsis">${esc(p.contact_name || p.email || p.phone)}</span>` : ""}</div>${keyPill(PARTNER_KINDS, p.kind)}</div>
      <div class="pcard-facts"><div><span>${t("erp.contracts")}</span><b>${cs.length}</b></div><div><span>${t("nav.inventory")}</span><b>${prods}</b></div><div><span>${t("erp.spend")}</span><b>${moneyShort(spend)}</b></div></div>
      ${p.tags ? `<div class="tag-row">${p.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean).slice(0, 4).map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="camp-foot"><span class="faint small">${p.owner_id ? esc(memberName(p.owner_id)) : ""}</span>${memberAvatar(p.owner_id, 24)}</div></button>`;
  }).join("");
  return head + stats + toolbar + chips + (list.length ? `<div class="camp-grid mt">${cards}</div>` : `<div class="card glass mt">${empty("search", t("erp.noPartners"), t("tasks.noneFoundText"))}</div>`);
}

export function editPartner(id, preset = {}) {
  const ex = D().partners.find(p => p.id === id);
  const p = ex || { id: uid(), kind: preset.kind || "supplier", name: "", contact_name: "", email: "", phone: "", address: "", tax_id: "", website: "", tags: "", notes: "", log: [], owner_id: S.user.id };
  const quick = ex ? `<div class="quick-bar">${p.email ? `<a class="btn gray sm" href="mailto:${esc(p.email)}">${icon("mail", 15)}${t("erp.email")}</a>` : ""}${p.phone ? `<a class="btn gray sm" href="tel:${esc(p.phone.replace(/[^\d+]/g, ""))}">${icon("phone", 15)}${t("erp.call")}</a>` : ""}${safeUrl(p.website) ? `<a class="btn gray sm" href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener">${icon("external", 15)}${t("erp.website")}</a>` : ""}</div>` : "";
  const cs = ex ? D().contracts.filter(c => c.partner_id === ex.id) : [];
  const ex2 = ex ? D().expenses.filter(e => e.partner_id === ex.id) : [];
  const prods = ex ? D().products.filter(x => x.partner_id === ex.id) : [];
  const related = ex ? group(t("erp.contractsOf", { n: cs.length }), cs.map(c => `<button type="button" class="set-row" data-act="editContract" data-id="${c.id}"><span class="r-icon c-${byKey(CONTRACT_ST, c.status)?.color}">${icon("file", 15, 2.2)}</span><div class="grow min0"><b class="w550">${esc(c.title)}</b><div class="faint small">${c.value ? money(c.value) + " · " : ""}${c.end_date ? t("erp.endsOn", { d: fmtDate(c.end_date) }) : ""}</div></div><span class="end">${keyPill(CONTRACT_ST, c.status)}${icon("chevR", 16)}</span></button>`).join("") +
      (canEdit() ? `<button type="button" class="add-row" data-act="newContract" data-partner="${ex.id}">${icon("plus", 18, 2.4)}${t("erp.newContract")}</button>` : "")) +
    (ex2.length ? group(t("erp.expensesOf", { n: ex2.length, v: money(partnerSpend(ex.id)) }), ex2.slice(0, 8).map(e => `<button type="button" class="set-row" data-act="editExpense" data-id="${e.id}"><span class="r-icon c-${byKey(EXP_ST, e.status)?.color}">${icon("receipt", 15, 2.2)}</span><div class="grow min0"><b class="w550">${esc(e.title)}</b><div class="faint small">${money(e.amount)}</div></div><span class="end">${keyPill(EXP_ST, e.status)}</span></button>`).join("")) : "") +
    (prods.length ? group(t("erp.productsOf", { n: prods.length }), prods.map(x => `<button type="button" class="set-row" data-act="editProduct" data-id="${x.id}"><span class="r-icon c-teal">${icon("box", 15, 2.2)}</span><div class="grow min0"><b class="w550">${esc(x.name)}</b><div class="faint small">${esc(x.sku || "")}</div></div><span class="end">${x.on_hand ?? 0} ${esc(x.unit || "")}</span></button>`).join("")) : "") : "";
  openSheet({
    title: ex ? t("erp.partner") : t("erp.newPartner"), readOnly: !canEdit(), wide: true,
    body: quick + group("", F.title("name", p.name, t("erp.partnerNamePh")) + F.select("kind", t("erp.kind"), p.kind, PARTNER_KINDS.map(k => [k.key, k.label])) + F.select("owner_id", t("common.owner"), p.owner_id || "", memberOpts())) +
      group(t("erp.contact"), F.text("contact_name", t("erp.contactName"), p.contact_name) + F.text("email", t("auth.email"), p.email, { type: "email", attrs: 'inputmode="email" autocomplete="off"' }) + F.text("phone", t("erp.phone"), p.phone, { type: "tel" }) + F.text("website", t("erp.website"), p.website, { type: "url", ph: "https://" })) +
      group(t("erp.companyInfo"), F.text("tax_id", t("erp.taxId"), p.tax_id) + F.area("address", t("erp.address"), p.address, "", 2) + F.text("tags", t("erp.tags"), p.tags, { ph: t("erp.tagsPh") })) +
      group(t("erp.contactLog"), F.list("log", p.log || []), t("erp.contactLogNote")) +
      group("", F.area("notes", t("common.notes"), p.notes)) + related + commentsBox("partners", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      const data = { name: fd.name.trim(), kind: fd.kind, owner_id: fd.owner_id || null, contact_name: fd.contact_name, email: fd.email || null, phone: fd.phone, website: fd.website || null, tax_id: fd.tax_id, address: fd.address, tags: fd.tags, notes: fd.notes, log: readList("log") || [] };
      if (ex) { await update("partners", ex.id, data); return t("toast.saved"); }
      await create("partners", { id: p.id, ...data });
      return t("erp.partnerAdded");
    },
    onDelete: ex ? async () => { await destroy("partners", ex.id); await reload(); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deletePartner")
  });
}

export function editContract(id, preset = {}) {
  const ex = D().contracts.find(c => c.id === id);
  const c = ex || { id: uid(), title: "", partner_id: preset.partner_id || "", project_id: "", status: "active", value: "", start_date: todayISO(), end_date: "", link: "", remind_days: 30, owner_id: S.user.id, notes: "" };
  const exps = ex ? D().expenses.filter(e => e.contract_id === ex.id) : [];
  const used = exps.filter(e => ["approved", "paid"].includes(e.status)).reduce((s, e) => s + (+e.amount || 0), 0);
  const usage = ex && +ex.value ? `<div class="card-lite"><div class="kv"><span>${t("erp.contractUsed", { v: money(used), of: money(ex.value) })}</span><b>${Math.round(used / ex.value * 100)}%</b></div><div class="bar c-${used > ex.value ? "red" : "green"}"><i style="width:${Math.min(100, used / ex.value * 100)}%"></i></div></div>` : "";
  openSheet({
    title: ex ? t("erp.contract") : t("erp.newContract"), readOnly: !canEdit(),
    body: usage + group("", F.title("title", c.title, t("erp.contractTitlePh")) + F.select("partner_id", t("erp.partner"), c.partner_id || "", partnerOpts())) +
      group(t("common.status"), F.radios("status", c.status, CONTRACT_ST)) +
      group(t("erp.terms"), F.text("value", t("erp.valueThb"), c.value, { type: "number", attrs: 'min="0" step="1000" inputmode="numeric"' }) + F.text("start_date", t("camp.start"), c.start_date, { type: "date" }) + F.text("end_date", t("camp.end"), c.end_date, { type: "date" }) + F.text("remind_days", t("erp.remindDays"), c.remind_days ?? 30, { type: "number", attrs: 'min="0" max="365" inputmode="numeric"' })) +
      group(t("camp.plan"), F.select("project_id", t("common.project"), c.project_id || "", projectOpts(true)) + F.select("owner_id", t("common.owner"), c.owner_id || "", memberOpts()) + F.text("link", t("erp.documentLink"), c.link, { type: "url", ph: "https://" })) +
      group("", F.area("notes", t("common.notes"), c.notes)) +
      (exps.length ? group(t("erp.expensesOf", { n: exps.length, v: money(used) }), exps.map(e => `<button type="button" class="set-row" data-act="editExpense" data-id="${e.id}"><span class="r-icon c-${byKey(EXP_ST, e.status)?.color}">${icon("receipt", 15, 2.2)}</span><div class="grow min0"><b class="w550">${esc(e.title)}</b><div class="faint small">${money(e.amount)}</div></div><span class="end">${keyPill(EXP_ST, e.status)}</span></button>`).join("")) : "") +
      commentsBox("contracts", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      if (fd.start_date && fd.end_date && fd.end_date < fd.start_date) throw new Error(t("err.date_order"));
      const data = { title: fd.title.trim(), partner_id: fd.partner_id || null, status: fd.status, value: fd.value || null, start_date: fd.start_date || null, end_date: fd.end_date || null, remind_days: fd.remind_days === "" ? 30 : fd.remind_days, project_id: fd.project_id || null, owner_id: fd.owner_id || null, link: fd.link || null, notes: fd.notes };
      if (ex) { await update("contracts", ex.id, data); return t("toast.saved"); }
      await create("contracts", { id: c.id, ...data });
      return t("erp.contractAdded");
    },
    onDelete: ex ? async () => { await destroy("contracts", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deleteContract")
  });
}

function exportCsv() {
  const cols = [t("common.name"), t("erp.kind"), t("erp.contactName"), t("auth.email"), t("erp.phone"), t("erp.taxId"), t("erp.address"), t("erp.tags"), t("common.owner"), t("erp.contracts"), t("erp.spend")];
  const rows = [cols, ...D().partners.map(p => [p.name, byKey(PARTNER_KINDS, p.kind)?.label || "", p.contact_name || "", p.email || "", p.phone || "", p.tax_id || "", p.address || "", p.tags || "", memberName(p.owner_id), D().contracts.filter(c => c.partner_id === p.id).length, partnerSpend(p.id)])];
  downloadBlob(`tempo-partners-${todayISO()}.csv`, new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  island(t("toast.exported"), "download", "blue");
}

export const partnerActions = {
  newPartner: () => editPartner(),
  editPartner: el => editPartner(el.dataset.id),
  newContract: el => editContract(null, { partner_id: el.dataset.partner }),
  editContract: el => editContract(el.dataset.id),
  pfTab: el => { S.ui.pf.tab = el.dataset.v; hooks.render(); },
  pfKind: el => { S.ui.pf.kind = el.dataset.v; hooks.render(); },
  pfCst: el => { S.ui.pf.cst = el.dataset.v; hooks.render(); },
  exportPartners: () => exportCsv()
};

