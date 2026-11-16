// Notifications inbox, the module launcher ("all apps") and the ERP "to handle" card on Home.
import { S, D, esc, icon, ago, money, relDay, todayISO, daysTo, canEdit, isGuest, partner, modOn } from "../core.js";
import { t } from "../i18n.js";
import { openSheet, closeSheet } from "../ui.js";
import { hooks, setUnread, fail } from "../store.js";
import { api } from "../api.js";
import { myApprovals } from "./finance.js";
import { lowStock } from "./inventory.js";
import { expiringContracts } from "./partners.js";
import { calendarItems } from "./calendar.js";

const KIND_ICON = {
  assigned: ["user", "blue"], mention: ["message", "accent"], comment: ["message", "gray"], approval_request: ["bell", "orange"], approved: ["checkSmall", "green"],
  rejected: ["x", "red"], paid: ["wallet", "green"], invited_event: ["calendar", "accent"], low_stock: ["box", "orange"], contract_expiring: ["file", "teal"],
  shared: ["link", "indigo"], invite: ["userPlus", "green"]
};
export const notifText = n => t(`notif.${n.kind}`, { who: n.actor_name || "Tempo", label: n.label || "" });

let items = [];
function render() {
  const unread = items.filter(n => !n.read_at).length;
  document.getElementById("sheetBody").innerHTML = `<div class="inbox-head"><span class="faint small">${unread ? t("erp.unreadN", { n: unread }) : t("erp.allRead")}</span>${unread ? `<button type="button" class="text-btn" data-act="notifAllRead">${t("erp.markAllRead")}</button>` : ""}</div>` +
    `<div class="fgroup">${items.map(n => {
      const [ic, color] = KIND_ICON[n.kind] || ["bell", "gray"];
      return `<button type="button" class="set-row notif${n.read_at ? "" : " unread"}" data-act="openNotif" data-id="${n.id}"><span class="r-icon c-${color}">${icon(ic, 15, 2.2)}</span>
        <div class="grow min0"><b class="w550">${esc(notifText(n))}</b>${n.body ? `<div class="faint small clamp2">${esc(n.body)}</div>` : ""}<div class="faint small">${ago(n.created_at)}${n.workspace_name && n.workspace_id !== S.wid ? " · " + esc(t("space.sharedBy", { name: D().sharedFrom?.[n.workspace_id] || n.workspace_name })) : ""}</div></div>
        ${n.read_at ? "" : '<span class="unread-dot" aria-hidden="true"></span>'}</button>`;
    }).join("") || `<div class="empty-row">${icon("bell", 22)}<br>${t("erp.noNotifications")}</div>`}</div>`;
}

export async function openInbox() {
  openSheet({ title: t("erp.notifications"), save: t("common.done"), noCancel: true, body: `<div class="empty-row">${t("common.loading")}</div>`, onSave: async () => {} });
  try {
    const r = await api("GET", "/notifications");
    items = r.items; setUnread(r.unread);
    render();
  } catch (e) { fail(e); }
}

export const inboxActions = {
  inbox: () => openInbox(),
  notifAllRead: async () => { const r = await api("POST", "/notifications/read", { all: true }); items.forEach(n => { n.read_at = n.read_at || new Date().toISOString(); }); setUnread(r.unread); render(); },
  openNotif: async el => {
    const n = items.find(x => String(x.id) === el.dataset.id);
    if (!n) return;
    if (!n.read_at) api("POST", "/notifications/read", { ids: [n.id] }).then(r => setUnread(r.unread)).catch(() => {});
    n.read_at = new Date().toISOString();
    closeSheet();
    await hooks.openEntity(n.entity, n.entity_id, n.workspace_id);
  }
};

/* ---------------- launcher ---------------- */
export function viewMore() {
  const d = D();
  const tiles = [
    ["home", "home", "accent", ""], ["tasks", "checklist", "blue", d.tasks.filter(x => x.status !== "done").length],
    ["calendar", "calendar", "red", calendarItems(todayISO(), todayISO()).length || ""],
    ["projects", "folder", "orange", d.projects.length || ""], ["timeline", "gantt", "indigo", ""], ["campaigns", "megaphone", "pink", d.campaigns.length || ""],
    ...(isGuest() ? [] : [["influencers", "star", "violet", d.influencerStats.total || ""], ["finance", "wallet", "green", myApprovals().length ? `${myApprovals().length} ⏳` : ""]]),
    ...(modOn("partners") ? [["partners", "briefcase", "yellow", d.partners.length || ""]] : []),
    ...(modOn("inventory") ? [["inventory", "box", "teal", lowStock().length ? `${lowStock().length} ⚠︎` : d.products.length || ""]] : [])
  ];
  return `<div class="page-head"><div><p class="eyebrow"></p><h1 class="large-title">${t("nav.more")}</h1></div></div>
    <div class="launcher">${tiles.map(([k, ic, c, badge]) => `<a class="app-tile" href="#${k}"><span class="app-ic c-${c}">${icon(ic, 26, 2.1)}</span><b>${t("nav." + k)}</b>${badge !== "" ? `<small>${typeof badge === "number" ? badge.toLocaleString("en-US") : badge}</small>` : ""}</a>`).join("")}
    <button class="app-tile" data-act="inbox"><span class="app-ic c-gray">${icon("bell", 26, 2.1)}</span><b>${t("erp.notifications")}</b>${S.unread ? `<small>${S.unread}</small>` : ""}</button>
    <button class="app-tile" data-act="settings"><span class="app-ic c-gray">${icon("gear", 26, 2.1)}</span><b>${t("settings.title")}</b></button></div>`;
}

/* ---------------- home card: things that need someone ---------------- */
export function erpHomeCard() {
  if (isGuest()) return "";
  const d = D(), rows = [];
  myApprovals().forEach(e => rows.push({ ic: "bell", color: "orange", title: t("erp.approveThis", { name: e.title }), sub: money(e.amount), act: `data-act="editExpense" data-id="${e.id}"` }));
  d.expenses.filter(e => e.created_by === S.user.id && e.status === "rejected").forEach(e => rows.push({ ic: "x", color: "red", title: t("erp.fixRejected", { name: e.title }), sub: e.decision_note || "", act: `data-act="editExpense" data-id="${e.id}"` }));
  d.expenses.filter(e => e.status === "approved" && e.due_date && daysTo(e.due_date) <= 7 && (e.approver_id === S.user.id || ["owner", "admin"].includes(d.role))).forEach(e => rows.push({ ic: "wallet", color: "green", title: t("erp.paymentDue", { name: e.title }), sub: `${money(e.amount)} · ${relDay(e.due_date)}`, act: `data-act="editExpense" data-id="${e.id}"` }));
  if (modOn("inventory")) lowStock().forEach(p => rows.push({ ic: "box", color: "orange", title: t("erp.lowStockOf", { name: p.name }), sub: t("erp.onHandN", { n: p.on_hand ?? 0, min: p.reorder_level }), act: `data-act="editProduct" data-id="${p.id}"` }));
  if (modOn("partners")) expiringContracts().forEach(c => rows.push({ ic: "file", color: "teal", title: t("erp.contractEnds", { name: c.title }), sub: `${partner(c.partner_id)?.name || ""} · ${relDay(c.end_date)}`, act: `data-act="editContract" data-id="${c.id}"` }));
  d.events.filter(e => e.event_date === todayISO() && (e.attendees || []).includes(S.user.id)).forEach(e => rows.push({ ic: "users", color: "accent", title: e.title, sub: `${t("date.today")}${e.start_time ? " · " + e.start_time : ""}${e.location ? " · " + e.location : ""}`, act: `data-act="editEvent" data-id="${e.id}"` }));
  return `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("zap", 18)}${t("erp.toHandle")}</h3>${rows.length ? `<span class="pill c-orange">${rows.length}</span>` : ""}</div>
    <div class="list">${rows.slice(0, 7).map(r => `<button class="row" ${r.act} style="--inset:58px"><span class="r-icon c-${r.color}">${icon(r.ic, 15, 2.2)}</span><div class="r-main"><span class="r-title">${esc(r.title)}</span>${r.sub ? `<span class="r-sub">${esc(r.sub)}</span>` : ""}</div><span class="r-end">${icon("chevR", 15)}</span></button>`).join("") || `<div class="empty-row">${t("erp.nothingToHandle")}</div>`}</div>
    ${canEdit() ? `<div class="quick-bar pad-x"><button class="btn gray sm" data-act="newExpense">${icon("receipt", 15)}${t("erp.newExpense")}</button><button class="btn gray sm" data-act="newEvent">${icon("calendar", 15)}${t("erp.newEvent")}</button>${modOn("inventory") ? `<button class="btn gray sm" data-act="newMove">${icon("truck", 15)}${t("erp.newMove")}</button>` : ""}</div>` : ""}</div>`;
}

