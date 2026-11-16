import { S, D, $, esc, icon, logoImg, ACCENTS, isDone, proj, chOf, byKey, TASK_ST, canEdit, isGuest, todayISO, money, isLow, EXP_ST, PARTNER_KINDS, modOn, isSharedProject, sharedOwner, fmtNum } from "./core.js";
import { t, setLang, getLang, initialLang } from "./i18n.js";
import { api } from "./api.js";
import { hooks, loadMe, loadWorkspace, reload, startSync, stopSync, fail, refreshUnread } from "./store.js";
import { initSheet, island, closePopover, openPopover, avatar, listActions, commentActions, closeSheet, filterActions } from "./ui.js";
import { initBoardDnD } from "./dnd.js";
import { initThai } from "./thai.js";
import { renderAuth, submitAuth, authActions } from "./views/auth.js";
import { viewHome } from "./views/home.js";
import { viewTasks, taskActions, dropTask, editTask, initTaskInputs } from "./views/tasks.js";
import { viewCampaigns, campActions, editCamp } from "./views/campaigns.js";
import { viewInfluencers, infActions, initInfluencerInputs, onInfFilter, dropCollab, editCollab, openInfluencer, loadInfluencers } from "./views/influencers.js";
import { viewTimeline, tlActions } from "./views/timeline.js";
import { viewProjects, viewProject, projActions, onBindInput, editProject, onShareRoleChange } from "./views/projects.js";
import { settingsActions, openSettings, onSettingsInput, onRoleChange, initWorkspaceFileInput } from "./views/settings.js";
import { viewCalendar, calendarActions, editEvent } from "./views/calendar.js";
import { viewFinance, financeActions, editExpense, myApprovals } from "./views/finance.js";
import { viewInventory, inventoryActions, editProduct, editMove } from "./views/inventory.js";
import { viewPartners, partnerActions, editPartner, editContract } from "./views/partners.js";
import { viewMore, inboxActions, erpHomeCard } from "./views/inbox.js";

// Order follows the structure: home → projects (the container) → what lives in them (tasks, campaigns, creators) → calendar → money and back office.
// mobile: in the phone tab bar · hidden: routable but not in the menu (timeline is a tab of Projects) · module: optional, switched on in Settings
const TABS = [
  { key: "home", icon: "home", mobile: true },
  { key: "projects", icon: "folder", sep: true }, { key: "timeline", icon: "gantt", hidden: true }, { key: "tasks", icon: "checklist", mobile: true }, { key: "campaigns", icon: "megaphone" }, { key: "influencers", icon: "star", member: true },
  { key: "calendar", icon: "calendar", mobile: true, sep: true },
  { key: "finance", icon: "wallet", member: true, mobile: true, sep: true }, { key: "partners", icon: "briefcase", member: true, module: "partners" }, { key: "inventory", icon: "box", member: true, module: "inventory" },
  { key: "more", icon: "grid", mobile: true, mobileOnly: true }
];

// a project guest only sees their shared projects: no creator database, no back-office modules
const tabs = () => TABS.filter(x => !(isGuest() && x.member) && (!x.module || modOn(x.module)));

/* ---------------- appearance ---------------- */
const mqDark = matchMedia("(prefers-color-scheme: dark)");
function applyAppearance() {
  const u = S.user || {};
  const theme = u.theme || localStorage.getItem("pf.theme") || "auto";
  const dark = theme === "dark" || (theme === "auto" && mqDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const [lhex, lrgb, dhex, drgb] = ACCENTS[u.accent] || ACCENTS.indigo;
  const hex = dark && dhex ? dhex : lhex, rgb = dark && drgb ? drgb : lrgb;
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-rgb", rgb);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#F4F2FA");
  try { localStorage.setItem("pf.theme", theme); } catch {}
}
mqDark.addEventListener?.("change", applyAppearance);

/* ---------------- routing ---------------- */
function parseRoute() {
  const [r, arg] = location.hash.replace(/^#\/?/, "").split("/");
  if (r === "project" && arg && proj(arg)) return { r: "project", id: arg };
  if (r === "open") return { r: "open", entity: arg, id: location.hash.split("/")[2] };
  return { r: tabs().some(x => x.key === r) ? r : "home" };
}

function mountShell() {
  document.documentElement.classList.remove("auth-mode");
  $("root").innerHTML = `<div class="app">
    <aside class="sidebar glass" aria-label="${t("nav.main")}">
      <a class="brand" href="#home">${logoImg(40)}<div class="min0"><b>Tempo</b><small id="wsName"></small></div></a>
      <div class="side-tools"><button class="search-btn" data-act="spot">${icon("search", 16)}<span>${t("common.search")}</span><kbd>⌘K</kbd></button><button class="bell-btn" data-act="inbox" aria-label="${t("erp.notifications")}" title="${t("erp.notifications")}">${icon("bell", 18)}<span class="bell-count" hidden></span></button></div>
      <nav class="nav" id="nav"></nav>
      <div class="side-sec"><span>${t("nav.projects")}</span>${canEdit() ? `<button data-act="newProject" aria-label="${t("projects.new")}">${icon("plus", 16, 2.4)}</button>` : ""}</div>
      <div class="side-projects" id="sideProjects"></div>
      <div class="offline-pill" id="offlinePill" hidden>${icon("wifiOff", 14)}${t("common.offline")}</div>
      <button class="account" data-act="account" id="accountBtn"></button>
    </aside>
    <main class="main">
      <header class="topbar">${logoImg(30)}<b>Tempo</b>
        <button class="circle-btn" data-act="spot" aria-label="${t("common.search")}">${icon("search", 18)}</button>
        <button class="circle-btn bell-btn" data-act="inbox" aria-label="${t("erp.notifications")}">${icon("bell", 18)}<span class="bell-count" hidden></span></button>
        ${canEdit() ? `<button class="circle-btn accent" data-act="newMenu" aria-label="${t("common.create")}">${icon("plus", 18, 2.4)}</button>` : ""}
        <button class="avatar-btn" data-act="account" aria-label="${t("settings.title")}" id="topAvatar"></button>
      </header>
      <div class="offline-bar" id="offlineBar" hidden>${icon("wifiOff", 14)} ${t("common.offlineLong")}</div>
      <section class="view" id="view"></section>
    </main>
    <nav class="tabbar glass" id="tabbar" aria-label="${t("nav.main")}"></nav>
  </div>`;
  S.shellLang = getLang(); S.shellRole = S.data.role;
}

function renderChrome() {
  const { r, id } = parseRoute();
  const active = r === "project" || r === "timeline" ? "projects" : r;
  const d = D();
  const appr = myApprovals().length, low = (d.products || []).filter(isLow).length;
  const counts = { tasks: d.tasks.filter(x => !isDone(x)).length, influencers: d.influencerStats?.total ? fmtNum(d.influencerStats.total) : "", campaigns: d.campaigns.length, projects: d.projects.length, partners: (d.partners || []).length };
  const alerts = { finance: appr, inventory: low };
  const link = x => `<a href="#${x.key}" ${active === x.key ? 'aria-current="page"' : ""}>${icon(x.icon, 20)}${t("nav." + x.key)}${alerts[x.key] ? `<span class="badge warn">${alerts[x.key]}</span>` : counts[x.key] ? `<span class="badge">${counts[x.key]}</span>` : ""}</a>`;
  $("nav").innerHTML = tabs().filter(x => !x.mobileOnly && !x.hidden).map(x => (x.sep ? `<hr class="nav-sep">` : "") + link(x)).join("");
  const onMobile = new Set(tabs().filter(x => x.mobile).map(x => x.key));
  $("tabbar").innerHTML = tabs().filter(x => x.mobile).map(x => `<a href="#${x.key}" ${active === x.key || (x.key === "more" && !onMobile.has(active)) ? 'aria-current="page"' : ""}>${icon(x.icon, 22)}<span>${t("nav." + x.key)}</span>${alerts[x.key] ? `<i class="tab-dot"></i>` : ""}</a>`).join("");
  renderBell();
  const sideLink = p => `<a href="#project/${p.id}" ${id === p.id ? 'aria-current="page"' : ""} ${isSharedProject(p.id) ? `title="${esc(t("space.sharedBy", { name: sharedOwner(p.id) }))}"` : ""}><span>${esc(p.emoji || "📁")}</span><span class="t">${esc(p.name)}</span><small>${d.tasks.filter(x => x.project_id === p.id && !isDone(x)).length || ""}</small></a>`;
  const mineP = d.projects.filter(p => !isSharedProject(p.id)), sharedP = d.projects.filter(p => isSharedProject(p.id));
  $("sideProjects").innerHTML = (mineP.length ? mineP.map(sideLink).join("") : `<p class="faint small pad">${t("projects.none")}</p>`) +
    (sharedP.length ? `<div class="side-sec"><span>${t("settings.sharedWithMe")}</span></div>` + sharedP.map(sideLink).join("") : "");
  $("wsName").textContent = "";
  $("accountBtn").innerHTML = `${avatar(S.user.name, 36, S.user.accent)}<div><b>${esc(S.user.name)}</b><small>${esc(S.user.email)}</small></div>${icon("chevD", 16)}`;
  $("topAvatar").innerHTML = avatar(S.user.name, 36, S.user.accent);
  $("offlinePill").hidden = S.online; $("offlineBar").hidden = S.online;
}

const VIEWS = { home: viewHome, tasks: viewTasks, campaigns: viewCampaigns, influencers: viewInfluencers, timeline: viewTimeline, projects: viewProjects,
  calendar: viewCalendar, finance: viewFinance, inventory: viewInventory, partners: viewPartners, more: viewMore };

function renderBell() {
  document.querySelectorAll(".bell-count").forEach(el => { el.hidden = !S.unread; el.textContent = S.unread > 99 ? "99+" : S.unread; });
}

/* open any record by entity name (notifications, email links, search) */
const OPENERS = {
  tasks: id => editTask(id), campaigns: id => editCamp(id), collaborations: id => editCollab(id), projects: id => { location.hash = "project/" + id; },
  partners: id => editPartner(id), contracts: id => editContract(id), products: id => editProduct(id), expenses: id => editExpense(id), events: id => editEvent(id)
};
async function openEntity(entity, id, wid) {
  const exists = !id || entity === "projects" ? true : (D()[entity] || []).some(x => x.id === id);
  if (!OPENERS[entity] || !exists) { if (entity === "workspace") location.hash = "home"; else island(t("err.not_found"), "alert", "orange"); return; }
  OPENERS[entity](id);
}

function render() {
  if (!S.user || !S.data) return renderAuth();
  if (!$("view") || S.shellLang !== getLang() || S.shellRole !== S.data.role) mountShell();
  if (location.hash.startsWith("#open/")) { const [, entity, id] = location.hash.split("/"); history.replaceState(null, "", "#home"); setTimeout(() => openEntity(entity, id), 0); }
  for (const [k, v] of [["f", "project"], ["cf", "project"]]) if (S.ui[k][v] && !proj(S.ui[k][v])) S.ui[k][v] = "";
  if (S.ui.tlProject && !proj(S.ui.tlProject)) S.ui.tlProject = "";
  renderChrome();
  const route = parseRoute();
  const key = route.r + (route.id || "");
  const v = $("view");
  const a = document.activeElement;
  const keepId = a && a.id && v.contains(a) ? a.id : null;
  const caret = keepId ? a.selectionStart : null;
  v.innerHTML = route.r === "project" ? viewProject(route.id) : (VIEWS[route.r] || viewHome)();
  if (S.ui.lastRoute !== key) { v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter"); S.ui.lastRoute = key; window.scrollTo({ top: 0 }); }
  v.querySelectorAll("textarea.ie").forEach(autosize);
  if (keepId && $(keepId)) { $(keepId).focus({ preventScroll: true }); try { $(keepId).setSelectionRange(caret, caret); } catch {} }
  document.title = `${S.unread ? `(${S.unread}) ` : ""}${route.r === "project" ? proj(route.id)?.name : t("nav." + (VIEWS[route.r] ? route.r : "home"))} · Tempo`;
}
const autosize = el => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };

/* ---------------- session ---------------- */
async function signedIn(r, msg) {
  S.user = r.user; S.workspaces = r.workspaces;
  if (r.user.lang) setLang(r.user.lang);
  applyAppearance();
  const wid = (r.workspaces.find(w => w.role === "owner" && w.personal) || r.workspaces.find(w => w.role === "owner") || r.workspaces[0])?.id;
  if (!wid) { await loadMe(); await loadWorkspace(S.workspaces[0].id); } // /me makes sure everyone has their own space
  else await loadWorkspace(wid);
  S.inf.loadedFor = null;
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#home");
  render();
  startSync(() => $("sheet").open || document.querySelector(".is-dragging") || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || ""));
  refreshUnread();
  if (msg) island(msg, "user", "blue");
}
function signedOut(msg) {
  stopSync();
  S.user = null; S.data = null; S.wid = null; S.workspaces = [];
  closePopover(); if ($("sheet").open) $("sheet").close();
  S.ui.authMode = "signin"; S.ui.authError = "";
  applyAppearance();
  renderAuth();
  if (msg) island(msg, "logout", "gray");
}
async function signOut() {
  try { await api("POST", "/auth/logout"); } catch {}
  signedOut(t("toast.signedOut"));
}

Object.assign(hooks, {
  render, island, applyAppearance, signedIn, signedOut, openEntity,
  renderBell: () => { renderBell(); if (S.data) document.title = document.title.replace(/^\(\d+\+?\) /, "") .replace(/^/, S.unread ? `(${S.unread}) ` : ""); },
  onUnauthorized: () => { if (S.user) signedOut(t("err.sessionExpired")); }
});

/* ---------------- spotlight ---------------- */
let spotSel = 0, spotItems = [];
function openSpot() {
  if (!S.data) return;
  closePopover();
  $("spotIcon").innerHTML = icon("search", 22);
  $("spotInput").value = ""; $("spotInput").placeholder = t("spot.placeholder");
  spotSel = 0; renderSpot();
  $("spot").showModal(); $("spotInput").focus();
}
let infHits = [], spotQ = "";
async function searchInf(q) {
  try { const r = await api("GET", `/w/${S.wid}/influencers?q=${encodeURIComponent(q)}&size=6&blacklist=include`); if (q === spotQ) { infHits = r.items; renderSpot(); } } catch {}
}
let spotTimer;
function renderSpot() {
  const q = $("spotInput").value.trim().toLowerCase();
  if (q !== spotQ) { spotQ = q; infHits = []; clearTimeout(spotTimer); if (q.length > 1) spotTimer = setTimeout(() => searchInf(q), 220); }
  const d = D(), sec = [];
  if (!q) {
    if (canEdit()) sec.push([t("spot.quick"), [
      { ic: "plus", color: "accent", title: t("tasks.new"), run: () => editTask() },
      { ic: "star", color: "violet", title: t("inf.addToCampaign"), run: () => editCollab() },
      { ic: "megaphone", color: "pink", title: t("camp.new"), run: () => editCamp() },
      { ic: "folder", color: "orange", title: t("projects.new"), run: () => editProject() },
      ...(isGuest() ? [] : [
        { ic: "receipt", color: "green", title: t("erp.newExpense"), run: () => editExpense() },
        { ic: "calendar", color: "red", title: t("erp.newEvent"), run: () => editEvent() },
        ...(modOn("inventory") ? [{ ic: "truck", color: "teal", title: t("erp.newMove"), run: () => editMove() }] : []),
        ...(modOn("partners") ? [{ ic: "briefcase", color: "yellow", title: t("erp.newPartner"), run: () => editPartner() }] : [])
      ])
    ]]);
    sec.push([t("spot.goTo"), tabs().filter(x => !x.mobileOnly).map(x => ({ ic: x.icon, color: "indigo", title: t("nav." + x.key), run: () => { location.hash = x.key; } })).concat([{ ic: "gear", color: "gray", title: t("settings.title"), run: openSettings }])]);
  } else {
    const m = s => String(s || "").toLowerCase().includes(q);
    sec.push([t("nav.influencers"), infHits.map(x => ({ emoji: "★", color: "violet", title: x.name, sub: `${x.tier || ""} · ${x.pet_name || ""}`, run: () => openInfluencer(x.id) }))]);
    sec.push([t("nav.projects"), d.projects.filter(p => m(p.name) || m(p.description)).slice(0, 5).map(p => ({ emoji: p.emoji || "📁", color: p.color, title: p.name, sub: p.description, run: () => { location.hash = "project/" + p.id; } }))]);
    sec.push([t("nav.tasks"), d.tasks.filter(x => m(x.title) || m(x.notes) || m(x.category)).slice(0, 7).map(x => ({ ic: "checklist", color: proj(x.project_id)?.color || "gray", title: x.title, sub: byKey(TASK_ST, x.status)?.label + (proj(x.project_id) ? " · " + proj(x.project_id).name : ""), run: () => editTask(x.id) }))]);
    sec.push([t("nav.campaigns"), d.campaigns.filter(c => m(c.name) || m(c.notes)).slice(0, 5).map(c => ({ ic: chOf(c.channel).icon, color: chOf(c.channel).color, title: c.name, sub: chOf(c.channel).label, run: () => editCamp(c.id) }))]);
    if (!isGuest()) {
      if (modOn("partners")) sec.push([t("nav.partners"), d.partners.filter(p => m(p.name) || m(p.contact_name) || m(p.email) || m(p.tags)).slice(0, 5).map(p => ({ ic: "briefcase", color: byKey(PARTNER_KINDS, p.kind)?.color || "gray", title: p.name, sub: byKey(PARTNER_KINDS, p.kind)?.label, run: () => editPartner(p.id) }))
        .concat(d.contracts.filter(c => m(c.title)).slice(0, 3).map(c => ({ ic: "file", color: "teal", title: c.title, sub: t("erp.contract"), run: () => editContract(c.id) })))]);
      if (modOn("inventory")) sec.push([t("nav.inventory"), d.products.filter(p => m(p.name) || m(p.sku) || m(p.barcode)).slice(0, 5).map(p => ({ ic: "box", color: isLow(p) ? "orange" : "teal", title: p.name, sub: `${p.sku || ""} · ${t("erp.onHand")} ${p.on_hand ?? 0}`, run: () => editProduct(p.id) }))]);
      sec.push([t("nav.finance"), d.expenses.filter(e => m(e.title) || m(e.notes)).slice(0, 5).map(e => ({ ic: "receipt", color: byKey(EXP_ST, e.status)?.color || "gray", title: e.title, sub: `${money(e.amount)} · ${byKey(EXP_ST, e.status)?.label}`, run: () => editExpense(e.id) }))]);
      sec.push([t("nav.calendar"), d.events.filter(e => m(e.title) || m(e.location)).slice(0, 4).map(e => ({ ic: "users", color: "accent", title: e.title, sub: e.event_date, run: () => editEvent(e.id) }))]);
    }
  }
  spotItems = sec.flatMap(s => s[1]);
  spotSel = Math.min(spotSel, Math.max(0, spotItems.length - 1));
  $("spotResults").innerHTML = sec.filter(s => s[1].length).map(([title, items]) => `<div class="sec">${title}</div>${items.map(it => { const k = spotItems.indexOf(it); return `<button class="row ${k === spotSel ? "sel" : ""}" data-spot="${k}">${it.emoji ? `<span class="r-icon c-${it.color} emoji-ic">${esc(it.emoji)}</span>` : `<span class="r-icon c-${it.color}">${icon(it.ic, 15, 2.2)}</span>`}<div class="r-main"><span class="r-title">${esc(it.title)}</span>${it.sub ? `<span class="r-sub">${esc(it.sub)}</span>` : ""}</div><span class="r-end">${icon("chevR", 15)}</span></button>`; }).join("")}`).join("")
    || (q ? `<div class="empty-row">${t("spot.none", { q: esc(q) })}</div>` : "");
}
function runSpot(k) { const it = spotItems[k]; if (!it) return; $("spot").close(); it.run(); }

/* ---------------- actions ---------------- */
const ACTIONS = {
  ...authActions, ...taskActions, ...campActions, ...infActions, ...tlActions, ...projActions, ...settingsActions, ...listActions,
  ...commentActions, ...filterActions, ...calendarActions, ...financeActions, ...inventoryActions, ...partnerActions, ...inboxActions,
  spot: () => openSpot(),
  newMenu: el => openPopover(el, `<button class="mi" data-act="newTask">${icon("checklist", 18)}${t("tasks.new")}<kbd class="ml-auto">N</kbd></button>${isGuest() ? "" : `<button class="mi" data-act="newEvent">${icon("calendar", 18)}${t("erp.newEvent")}</button>`}<hr><button class="mi" data-act="newProject">${icon("folder", 18)}${t("projects.new")}</button><button class="mi" data-act="newCamp">${icon("megaphone", 18)}${t("camp.new")}</button><button class="mi" data-act="newCollab">${icon("star", 18)}${t("inf.addToCampaign")}</button><button class="mi" data-act="newInf">${icon("userPlus", 18)}${t("inf.new")}</button>` + (isGuest() ? "" : `<hr><button class="mi" data-act="newExpense">${icon("receipt", 18)}${t("erp.newExpense")}</button>${modOn("partners") ? `<button class="mi" data-act="newPartner">${icon("briefcase", 18)}${t("erp.newPartner")}</button>` : ""}${modOn("inventory") ? `<button class="mi" data-act="newProduct">${icon("box", 18)}${t("erp.newProduct")}</button><button class="mi" data-act="newMove">${icon("truck", 18)}${t("erp.newMove")}</button>` : ""}`)),
  go: el => { location.hash = el.dataset.v; },
  signOut: () => signOut(),
  reloadPage: () => location.reload()
};

document.addEventListener("click", e => {
  const pop = $("popover");
  const trigger = e.target.closest("[data-act=account],[data-act=newMenu],[data-act=taskMore],[data-act=infMore],[data-act=infFilter]");
  if (!pop.hidden && !pop.contains(e.target) && !trigger) closePopover();
  const spotRow = e.target.closest("[data-spot]");
  if (spotRow) { runSpot(+spotRow.dataset.spot); return; }
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "A") e.preventDefault();
  if (pop.contains(el)) closePopover();
  Promise.resolve(fn(el)).catch(fail);
});
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === "Enter" && !typing && document.activeElement?.matches?.("[role=button][data-act]")) { document.activeElement.click(); return; }
  if (!S.data) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("spot").open ? $("spot").close() : openSpot(); return; }
  if (e.key === "Escape") closePopover();
  if (typing || document.querySelector("dialog[open]")) return;
  if (e.key === "/") { e.preventDefault(); openSpot(); }
  if (e.key.toLowerCase() === "n" && canEdit() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); editTask(); }
});
window.addEventListener("resize", closePopover);
window.addEventListener("scroll", closePopover, { passive: true });
window.addEventListener("hashchange", () => {
  closePopover();
  if (location.hash.startsWith("#project/")) { S.ui.projTab = S.ui.nextTab || "overview"; S.ui.nextTab = ""; }
  if (S.data) render();
});
window.addEventListener("online", () => { S.online = true; if (S.data) render(); });
window.addEventListener("offline", () => { S.online = false; if (S.data) render(); island(t("common.offline"), "wifiOff", "orange"); });

document.addEventListener("submit", e => { if (e.target.id === "authForm") { e.preventDefault(); submitAuth(e.target); } });
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.model && el.dataset.model in S.ui) { S.ui[el.dataset.model] = el.value; render(); return; }
  if (el.dataset.bind) { onBindInput(el, false); if (el.tagName === "TEXTAREA") autosize(el); return; }
  if (el.dataset.set) onSettingsInput(el);
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.filter) {
    const [m, k] = el.dataset.filter.split(".");
    if (m === "inf") onInfFilter(k, el.type === "checkbox" ? el.checked : el.value);
    else if (m === "pipe") { S.ui.pipePic = el.value; S.ui.pipeShow = {}; render(); }
    else { S.ui[m][k] = el.type === "checkbox" ? el.checked : el.value; render(); }
    return;
  }
  if (el.dataset.bind) onBindInput(el, true);
  if (el.dataset.memberRole) onRoleChange(el);
  if (el.dataset.shareRole) onShareRoleChange(el);
});

$("spotInput").addEventListener("input", () => { spotSel = 0; renderSpot(); });
$("spotInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); spotSel = Math.min(spotItems.length - 1, spotSel + 1); renderSpot(); }
  if (e.key === "ArrowUp") { e.preventDefault(); spotSel = Math.max(0, spotSel - 1); renderSpot(); }
  if (e.key === "Enter") { e.preventDefault(); runSpot(spotSel); }
});
$("spot").addEventListener("click", e => { if (e.target === $("spot")) $("spot").close(); });

initThai();
initSheet(() => render());
initInfluencerInputs();
initTaskInputs();
initWorkspaceFileInput();
initBoardDnD((kind, id, target) => (kind === "task" ? dropTask(id, target) : dropCollab(id, target)));

/* ---------------- boot ---------------- */
(async function boot() {
  setLang(initialLang());
  applyAppearance();
  try { S.config = await api("GET", "/config"); } catch { S.config = {}; }
  try {
    const r = await loadMe();
    await signedIn(r);
  } catch (e) {
    if (e.code === "network") { $("root").innerHTML = `<div class="boot-error">${logoImg(64)}<h2>${t("err.network")}</h2><button class="btn filled" data-act="reloadPage">${t("common.retry")}</button></div>`; return; }
    renderAuth();
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // a new release takes over by itself: reload once when it does (not on the very first install)
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register("/sw.js").then(reg => {
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
})();
export { reload, loadInfluencers, todayISO };
