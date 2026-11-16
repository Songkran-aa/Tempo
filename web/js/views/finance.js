// Budget & expenses: purchase requests / expense claims with an approval flow, budget vs actual per campaign and project.
import { S, D, esc, icon, uid, money, moneyShort, fmtDate, relDay, byKey, canEdit, proj, camp, partner, contract, memberName, todayISO, daysTo, EXP_KINDS, EXP_ST, expenseEditable, canDecide, canPay, isAdmin2, modOn, widOf } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, chipBtn, F, group, projectOpts, openSheet, island, seg, memberAvatar, commentsBox, filterUI, kpi, keyPill, closeSheet, askInput, askConfirm, csvCell, downloadBlob } from "../ui.js";
import { create, update, destroy, hooks, fail, errText } from "../store.js";

let current = { ex: null, e: null }; // the expense open in the sheet
import { api } from "../api.js";

const committed = e => ["approved", "paid"].includes(e.status);
const sum = (list, f = () => true) => list.filter(f).reduce((s, e) => s + (+e.amount || 0), 0);
export const myApprovals = () => (D().expenses || []).filter(e => e.status === "pending" && e.approver_id === S.user.id);
export const campaignActual = cid => sum(D().expenses, e => e.campaign_id === cid && committed(e));

/** members who can approve (editor+), the requester only if admin */
const approverOpts = () => D().members.filter(m => ["owner", "admin", "editor"].includes(m.role) && (m.user_id !== S.user.id || isAdmin2()))
  .sort((a, b) => ["owner", "admin", "editor"].indexOf(a.role) - ["owner", "admin", "editor"].indexOf(b.role))
  .map(m => [m.user_id, `${m.name}${m.user_id === S.user.id ? ` (${t("common.me")})` : ""} · ${t("role." + m.role)}`]);

export function expenseRow(e) {
  const k = byKey(EXP_KINDS, e.kind) || EXP_KINDS[1];
  const sub = [partner(e.partner_id)?.name, camp(e.campaign_id)?.name || proj(e.project_id)?.name, e.expense_date ? fmtDate(e.expense_date) : ""].filter(Boolean).map(esc).join(" · ");
  const waiting = e.status === "pending" ? `<span class="faint small hide-m">${t("erp.waitingFor", { name: esc(memberName(e.approver_id) || "—") })}</span>` : "";
  return `<button class="row wrap-sm" data-act="editExpense" data-id="${e.id}" style="--inset:58px"><span class="r-icon c-${k.color}">${icon("receipt", 15, 2.2)}</span>
    <div class="r-main"><span class="r-title">${esc(e.title)}</span><span class="r-sub">${esc(k.label)}${sub ? " · " + sub : ""}</span></div>
    <span class="r-end">${waiting}${memberAvatar(e.created_by, 22)}<b class="money">${money(e.amount)}</b>${keyPill(EXP_ST, e.status)}</span></button>`;
}

export function viewFinance() {
  const d = D(), xf = S.ui.xf;
  const head = pageHead(t("erp.expensesCount", { n: d.expenses.length }), t("nav.finance"),
    `<button class="circle-btn" data-act="exportExpenses" aria-label="${t("common.exportCsv")}" title="${t("common.exportCsv")}">${icon("download", 18)}</button>` +
    (canEdit() ? `<button class="btn filled" data-act="newExpense">${icon("plus", 18, 2.4)}${t("erp.newExpense")}</button>` : ""));
  const budget = d.campaigns.reduce((s, c) => s + (+c.budget || 0), 0);
  const appr = sum(d.expenses, committed), paid = sum(d.expenses, e => e.status === "paid"), pend = d.expenses.filter(e => e.status === "pending");
  const stats = `<div class="stat-tiles five">${[
    kpi(t("camp.budgetTotal"), moneyShort(budget), "wallet", "indigo"),
    kpi(t("erp.committed"), moneyShort(appr), "checkSmall", "teal", budget ? t("erp.ofBudget", { p: Math.round(appr / budget * 100) }) : ""),
    kpi(t("xst.paid"), moneyShort(paid), "receipt", "green"),
    kpi(t("xst.pending"), moneyShort(sum(pend)), "clock", "orange", t("erp.nRequests", { n: pend.length })),
    kpi(t("erp.remaining"), budget ? moneyShort(budget - appr) : "—", "target", budget - appr < 0 ? "red" : "accent")
  ].join("")}</div>`;
  const mine = myApprovals();
  const tabs = seg("xfTab", [["all", t("erp.allRequests")], ["approve", `${t("erp.toApprove")}${mine.length ? ` (${mine.length})` : ""}`], ["mine", t("erp.myRequests")], ["budget", t("erp.budgetVsActual")]], xf.tab);
  const alert = mine.length && xf.tab !== "approve" ? `<button class="banner glass c-orange" data-act="xfTab" data-v="approve">${icon("bell", 18)}<span>${t("erp.approvalsBanner", { n: mine.length, v: money(sum(mine)) })}</span>${icon("chevR", 16)}</button>` : "";

  if (xf.tab === "budget") return head + stats + alert + `<div class="toolbar"><div class="left">${tabs}</div></div>` + budgetView();
  if (!d.expenses.length) return head + stats + `<div class="toolbar"><div class="left">${tabs}</div></div><div class="card glass">${empty("receipt", t("erp.expensesEmpty"), t("erp.expensesEmptyText"), canEdit() ? `<button class="btn filled" data-act="newExpense">${icon("plus", 18, 2.4)}${t("erp.newExpense")}</button>` : "")}</div>`;
  let list = d.expenses;
  if (xf.tab === "approve") list = list.filter(e => e.status === "pending" && (e.approver_id === S.user.id || isAdmin2()));
  if (xf.tab === "mine") list = list.filter(e => e.created_by === S.user.id);
  list = list.filter(e => (!xf.status || e.status === xf.status) && (!xf.project || e.project_id === xf.project));
  // same filter pattern as the creators page: one button + panel; chips only for filters in use
  const fu = filterUI("xf", [
    { k: "status", label: t("common.status"), icon: "activity", opts: EXP_ST.map(s => [s.key, s.label]) },
    { k: "project", label: t("common.project"), icon: "folder", opts: D().projects.map(p => [p.id, `${p.emoji || "📁"} ${p.name}`]) }
  ]);
  const chips = fu.chips;
  return head + stats + alert + `<div class="toolbar"><div class="left">${tabs}</div><div class="right">${fu.button}<span class="faint small">${t("common.total")} <b>${money(sum(list))}</b></span></div></div>` + chips +
    `<div class="card glass list-card mt"><div class="list">${list.map(expenseRow).join("") || `<div class="empty-row">${xf.tab === "approve" ? t("erp.nothingToApprove") : t("erp.noExpenses")}</div>`}</div></div>`;
}

function budgetView() {
  const d = D();
  const bar = (label, sub, budget, actual, act) => {
    const pct = budget ? Math.round(actual / budget * 100) : 0;
    const color = !budget ? "gray" : pct > 100 ? "red" : pct > 85 ? "orange" : "green";
    return `<button class="bv-row" ${act}><div class="bv-head"><span class="grow min0"><b class="ellipsis">${esc(label)}</b>${sub ? `<small class="faint ellipsis">${esc(sub)}</small>` : ""}</span><span class="bv-num"><b>${money(actual)}</b><small class="faint">/ ${budget ? money(budget) : t("erp.noBudget")}</small></span></div><div class="bar c-${color}"><i style="width:${Math.min(100, pct)}%"></i></div></button>`;
  };
  const camps = d.campaigns.map(c => ({ c, actual: campaignActual(c.id) })).filter(x => +x.c.budget || x.actual).sort((a, b) => b.actual - a.actual);
  const projs = d.projects.map(p => {
    const budget = d.campaigns.filter(c => c.project_id === p.id).reduce((s, c) => s + (+c.budget || 0), 0);
    return { p, budget, actual: sum(d.expenses, e => e.project_id === p.id && committed(e)) };
  }).filter(x => x.budget || x.actual);
  const byKind = EXP_KINDS.map(k => ({ k, v: sum(d.expenses, e => e.kind === k.key && committed(e)) })).filter(x => x.v);
  const maxK = Math.max(1, ...byKind.map(x => x.v));
  return `<div class="widgets two">
    <div class="card glass span-2"><div class="card-head"><h3>${icon("megaphone", 18)}${t("nav.campaigns")}</h3><span class="faint small">${t("erp.budgetHint")}</span></div>${camps.map(x => bar(x.c.name, proj(x.c.project_id)?.name || "", +x.c.budget, x.actual, `data-act="editCamp" data-id="${x.c.id}"`)).join("") || `<div class="empty-row">${t("erp.noBudgetData")}</div>`}</div>
    <div class="card glass span-2"><div class="card-head"><h3>${icon("folder", 18)}${t("nav.projects")}</h3></div>${projs.map(x => bar(`${x.p.emoji || "📁"} ${x.p.name}`, t("camp.count", { n: d.campaigns.filter(c => c.project_id === x.p.id).length }), x.budget, x.actual, `data-act="xfProjectGo" data-v="${x.p.id}"`)).join("") || `<div class="empty-row">${t("erp.noBudgetData")}</div>`}
      ${byKind.length ? `<div class="card-head mt"><h3>${icon("receipt", 18)}${t("erp.byKind")}</h3></div><div class="ch-bars">${byKind.map(x => `<div class="c-${x.k.color}"><span class="ch-name">${esc(x.k.label)}</span><div class="bar"><i style="width:${x.v / maxK * 100}%"></i></div><b>${moneyShort(x.v)}</b></div>`).join("")}</div>` : ""}</div></div>`;
}

function approvalPanel(e) {
  if (!e) return "";
  const steps = [
    [t("erp.stepCreated"), e.created_at, memberName(e.created_by), true],
    [t("erp.stepSubmitted"), e.submitted_at, memberName(e.approver_id) ? t("erp.to", { name: memberName(e.approver_id) }) : "", !!e.submitted_at],
    [e.status === "rejected" ? t("xst.rejected") : t("xst.approved"), e.decided_at, memberName(e.decided_by), !!e.decided_at],
    [t("xst.paid"), e.paid_at, "", !!e.paid_at]
  ];
  const tl = `<div class="steps">${steps.map(([l, at, who, done], i) => `<div class="step ${done ? "done" : ""} ${i === 2 && e.status === "rejected" ? "bad" : ""}"><i></i><div><b>${esc(l)}</b><small class="faint">${at ? fmtDate(String(at).slice(0, 10), true) : "—"}${who ? " · " + esc(who) : ""}</small></div></div>`).join("")}</div>`;
  const note = e.decision_note ? `<div class="note-box c-${e.status === "rejected" ? "red" : "teal"}">${icon("message", 15)}<span>${esc(e.decision_note)}</span></div>` : "";
  const btns = [];
  if (canDecide(e)) btns.push(`<button type="button" class="btn filled" data-act="expApprove" data-id="${e.id}">${icon("checkSmall", 17, 2.6)}${t("erp.approve")}</button>`, `<button type="button" class="btn destructive" data-act="expReject" data-id="${e.id}">${icon("x", 17, 2.4)}${t("erp.reject")}</button>`);
  if (canPay(e)) btns.push(`<button type="button" class="btn tinted" data-act="expPay" data-id="${e.id}">${icon("wallet", 17)}${t("erp.markPaid")}</button>`);
  return group(t("erp.approval"), `<div class="appr">${tl}${note}${btns.length ? `<div class="appr-actions">${btns.join("")}</div>` : ""}</div>`);
}

export function editExpense(id, preset = {}) {
  const ex = D().expenses.find(e => e.id === id);
  const e = ex || { id: uid(), title: "", kind: preset.kind || "expense", amount: "", expense_date: todayISO(), due_date: "", partner_id: preset.partner_id || "", project_id: preset.project_id || "", campaign_id: preset.campaign_id || "", contract_id: preset.contract_id || "", receipt_link: "", notes: "", status: "draft" };
  current = { ex, e };
  const editable = expenseEditable(ex);
  const approvers = approverOpts();
  const canSubmit = canEdit() && ["draft", "rejected"].includes(e.status);
  const defaultApprover = e.approver_id && approvers.some(a => a[0] === e.approver_id) ? e.approver_id : approvers.find(a => a[0] !== S.user.id)?.[0] || approvers[0]?.[0] || "";
  const submitBox = canSubmit ? group(t("erp.sendForApproval"), (approvers.length ? F.select("approver_id", t("erp.approver"), defaultApprover, approvers) : `<div class="empty-row small">${t("erp.noApprover")}</div>`) +
    (approvers.length ? `<button type="button" class="add-row" data-act="expSubmit">${icon("send", 17)}${ex?.status === "rejected" ? t("erp.resubmit") : t("erp.saveAndSubmit")}</button>` : ""), t("erp.approvalNote")) : "";
  openSheet({
    title: ex ? t("erp.expense") : t("erp.newExpense"), readOnly: !editable, wide: true,
    body: (ex ? `<div class="exp-hero"><b>${money(ex.amount)}</b>${keyPill(EXP_ST, ex.status)}${ex.due_date && ["pending", "approved"].includes(ex.status) ? `<span class="due ${daysTo(ex.due_date) < 0 ? "late" : ""}">${icon("calendar", 13)}${t("erp.dueOn", { d: relDay(ex.due_date) })}</span>` : ""}</div>` : "") +
      approvalPanel(ex) +
      group("", F.title("title", e.title, t("erp.expenseTitlePh")) + F.text("amount", t("erp.amountThb"), e.amount, { type: "number", attrs: 'min="0" step="0.01" inputmode="decimal" required' }) + F.select("kind", t("erp.kind"), e.kind, EXP_KINDS.map(k => [k.key, k.label]))) +
      group(t("erp.dates"), F.text("expense_date", t("erp.expenseDate"), e.expense_date, { type: "date" }) + F.text("due_date", t("erp.dueDate"), e.due_date, { type: "date" })) +
      group(t("erp.links"), (modOn("partners") || e.partner_id ? F.select("partner_id", t("erp.partner"), e.partner_id || "", [["", t("common.none")], ...D().partners.map(p => [p.id, p.name])]) : "") +
        F.select("project_id", t("common.project"), e.project_id || "", projectOpts(true)) +
        F.select("campaign_id", t("pipe.campaign"), e.campaign_id || "", [["", t("common.none")], ...D().campaigns.filter(c => widOf(c) === S.wid).map(c => [c.id, c.name])]) +
        (modOn("partners") || e.contract_id ? F.select("contract_id", t("erp.contract"), e.contract_id || "", [["", t("common.none")], ...D().contracts.map(c => [c.id, c.title + (partner(c.partner_id) ? " · " + partner(c.partner_id).name : "")])]) : "") +
        F.text("receipt_link", t("erp.receiptLink"), e.receipt_link, { type: "url", ph: "https://" })) +
      group("", F.area("notes", t("common.notes"), e.notes, t("erp.expenseNotesPh"))) +
      (editable ? submitBox : "") + commentsBox("expenses", ex?.id),
    save: ex ? t("common.save") : t("erp.saveDraft"),
    onSave: async fd => { await saveExpense(ex, e, fd); return ex ? t("toast.saved") : t("erp.draftSaved"); },
    onDelete: ex && editable ? async () => { await destroy("expenses", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deleteExpense")
  });
}

function formData() {
  const form = document.getElementById("sheetForm");
  const fd = Object.fromEntries(new FormData(form));
  form.querySelectorAll("input[type=checkbox][name]").forEach(cb => { fd[cb.name] = cb.checked; });
  return fd;
}
async function saveExpense(ex, e, fd) {
  if (!fd.title?.trim()) throw new Error(t("err.required"));
  if (fd.amount === "" || !(+fd.amount >= 0)) throw new Error(t("erp.amountRequired"));
  const data = { title: fd.title.trim(), amount: fd.amount, kind: fd.kind, expense_date: fd.expense_date || null, due_date: fd.due_date || null, partner_id: fd.partner_id || null, project_id: fd.project_id || null, campaign_id: fd.campaign_id || null, contract_id: fd.contract_id || null, receipt_link: fd.receipt_link || null, notes: fd.notes };
  if (ex) { if (expenseEditable(ex)) await update("expenses", ex.id, data); return ex; }
  return create("expenses", { id: e.id, status: "draft", created_by: S.user.id, ...data });
}

function replaceExpense(item, rev) {
  const list = D().expenses, i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = { ...list[i], ...item }; else list.unshift(item);
  if (rev) D().workspace.rev = rev;
}

async function act(path, body, okMsg, color = "green", ic = "checkSmall") {
  const r = await api("POST", `/w/${S.wid}/expenses/${path}`, body);
  replaceExpense(r.item, r.rev);
  closeSheet(); hooks.render(); island(okMsg, ic, color);
}

export const financeActions = {
  newExpense: el => editExpense(null, { campaign_id: el.dataset.campaign, project_id: el.dataset.project, partner_id: el.dataset.partner }),
  editExpense: el => editExpense(el.dataset.id),
  xfTab: el => { S.ui.xf.tab = el.dataset.v; if (location.hash !== "#finance") location.hash = "finance"; else hooks.render(); },
  xfStatus: el => { S.ui.xf.status = el.dataset.v; hooks.render(); },
  xfProject: el => { S.ui.xf.project = el.dataset.v; hooks.render(); },
  xfProjectGo: el => { S.ui.xf.project = el.dataset.v; S.ui.xf.tab = "all"; hooks.render(); },
  expSubmit: async el => {
    const fd = formData(), err = document.getElementById("sheetError");
    if (!fd.approver_id) { err.textContent = t("erp.noApprover"); return; }
    el.disabled = true;
    try {
      const saved = await saveExpense(current.ex, current.e, fd);
      current.ex = saved;
      await act(`${saved.id}/submit`, { approver_id: fd.approver_id }, fd.approver_id === S.user.id ? t("erp.approvedSelf") : t("erp.submitted", { name: memberName(fd.approver_id) }), "blue", "send");
    } catch (e) { err.textContent = errText(e); }
    finally { el.disabled = false; }
  },
  expApprove: async el => {
    if (!await askConfirm(t("erp.approveTitle"), t("erp.approveMsg"), t("erp.approve"), false)) return;
    await act(`${el.dataset.id}/decide`, { decision: "approve" }, t("erp.approvedToast"));
  },
  expReject: async el => {
    const note = await askInput(t("erp.rejectTitle"), t("erp.rejectMsg"), { placeholder: t("erp.reasonPh"), ok: t("erp.reject"), destructive: true });
    if (note == null) return;
    if (!note.trim()) { fail(new Error(t("erp.reasonRequired"))); return; }
    await act(`${el.dataset.id}/decide`, { decision: "reject", note }, t("erp.rejectedToast"), "red", "x");
  },
  expPay: async el => {
    if (!await askConfirm(t("erp.payTitle"), t("erp.payMsg"), t("erp.markPaid"), false)) return;
    await act(`${el.dataset.id}/pay`, {}, t("erp.paidToast"), "green", "wallet");
  },
  exportExpenses: () => {
    const cols = [t("common.name"), t("erp.kind"), t("erp.amountThb"), t("common.status"), t("erp.expenseDate"), t("erp.dueDate"), t("erp.partner"), t("common.project"), t("pipe.campaign"), t("erp.contract"), t("erp.requester"), t("erp.approver"), t("erp.decisionNote"), t("erp.receiptLink")];
    const rows = [cols, ...D().expenses.map(e => [e.title, byKey(EXP_KINDS, e.kind)?.label || "", e.amount, byKey(EXP_ST, e.status)?.label || "", e.expense_date || "", e.due_date || "", partner(e.partner_id)?.name || "", proj(e.project_id)?.name || "", camp(e.campaign_id)?.name || "", contract(e.contract_id)?.title || "", memberName(e.created_by), memberName(e.approver_id), e.decision_note || "", e.receipt_link || ""])];
    downloadBlob(`tempo-expenses-${todayISO()}.csv`, new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    island(t("toast.exported"), "download", "blue");
  }
};
