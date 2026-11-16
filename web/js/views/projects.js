import { S, D, esc, icon, iconInline, proj, projStats, sortTasks, chOf, CHECK_ST, byKey, fmtDate, relDay, uid, canEdit, canEditProject, isGuest, projectShares, isSharedProject, sharedOwner, widOf, isLaunchMs, todayISO, newProjectData, EMOJIS, PALETTE, memberName, money, fmtNum } from "../core.js";
import { getLang, t } from "../i18n.js";
import { pageHead, empty, ringSm, campPill, collabPill, tierPill, F, group, memberOpts, openSheet, askConfirm, seg, avatar, island, closeSheet, commentsBox, dtBox } from "../ui.js";
import { api } from "../api.js";
import { loadMe, loadWorkspace } from "../store.js";
import { create, update, destroy, fail, hooks, saveProjectField, reload } from "../store.js";
import { projCard } from "./home.js";
import { taskRow } from "./tasks.js";

export const projSwitch = cur => `<div class="tabs-row">${seg("go", [["projects", t("projects.tabList"), "folder"], ["timeline", t("nav.timeline"), "gantt"]], cur)}</div>`;

export function viewProjects() {
  const d = D();
  const head = pageHead(t("projects.count", { n: d.projects.length }), t("nav.projects"),
    (canEdit() ? `<button class="btn filled" data-act="newProject">${icon("plus", 18, 2.4)}${t("projects.new")}</button>` : ""));
  return head + projSwitch("projects") + `<div class="proj-grid">${d.projects.map(projCard).join("")}${canEdit() ? `<button class="proj new" data-act="newProject"><span class="emoji">${icon("plus", 26, 2.4)}</span>${t("projects.create")}<span class="faint small w500">${t("projects.templateHint")}</span></button>` : ""}</div>` +
    (!d.projects.length && !canEdit() ? `<div class="card glass">${empty("folder", t("projects.emptyTitle"), t("projects.viewerEmpty"))}</div>` : "");
}

export function viewProject(id) {
  const p = proj(id); if (!p) return viewProjects();
  const s = projStats(p), tab = S.ui.projTab, ed = canEditProject(p.id);
  const shared = projectShares(p.id);
  const shareBtn = canEdit() || isGuest() || isSharedProject(p.id) ? `<button class="btn glassy" data-act="shareProject" data-id="${p.id}">${icon("users", 16)}${t("share.btn")}${shared.length ? ` <span class="count">${shared.length}</span>` : ""}</button>` : "";
  const dis = ed ? "" : "disabled";
  const hero = `<a class="back" href="#projects">${icon("chevL", 22, 2.4)}${t("nav.projects")}</a>
    <div class="p-hero glass c-${p.color || "blue"}"><div class="p-hero-top"><span class="emoji">${esc(p.emoji || "📁")}</span><div class="grow"><h1>${esc(p.name)}</h1><p>${esc(p.description || t("project.noDescription"))}</p></div>
      ${p.id ? `<div class="p-actions">${shareBtn}<button class="btn glassy" data-act="projComments" data-id="${p.id}">${icon("message", 16)}${t("erp.comments")}</button>${ed ? `<button class="btn glassy" data-act="editProject" data-id="${p.id}">${icon("edit", 16)}${t("common.edit")}</button><button class="btn filled" data-act="newTask" data-project="${p.id}">${icon("plus", 18, 2.4)}${t("nav.tasks")}</button>` : ""}</div>` : ""}</div>
      <div class="p-meta"><span class="pill c-${p.color || "blue"}">${iconInline("flag", 13)} ${p.launch_date ? `${t("project.launchOn", { date: fmtDate(p.launch_date) })} · ${relDay(p.launch_date)}` : t("project.noLaunch")}</span>${p.start_date ? `<span class="pill c-gray">${t("project.startOn", { date: fmtDate(p.start_date) })}</span>` : ""}${p.owner_id ? `<span class="pill c-gray">${iconInline("user", 13)} ${esc(memberName(p.owner_id))}</span>` : ""}${isGuest() || isSharedProject(p.id) ? `<span class="pill c-accent">${iconInline("users", 13)} ${isSharedProject(p.id) ? esc(t("space.sharedBy", { name: sharedOwner(p.id) })) : t("share.sharedWithYou")} · ${t("role." + (D().myShares?.[p.id] || "viewer"))}</span>` : ""}</div></div>`;
  const tabs = `<div class="tabs-row">${seg("projTab", [["overview", t("project.overview")], ["creators", t("nav.influencers")], ["brief", "Brief"], ["milestones", t("project.milestones")], ["checklist", t("project.readiness")]], tab)}</div>`;
  let body = "";
  if (tab === "overview") {
    const tasks = sortTasks(D().tasks.filter(x => x.project_id === p.id));
    const camps = D().campaigns.filter(c => c.project_id === p.id);
    // meetings linked to this project: upcoming first (soonest on top), then past ones (latest on top)
    const td = todayISO(), evs = (D().events || []).filter(e => e.project_id === p.id).sort((a, b) => (a.event_date >= td) !== (b.event_date >= td) ? (a.event_date >= td ? -1 : 1) : a.event_date >= td ? (a.event_date + (a.start_time || "")).localeCompare(b.event_date + (b.start_time || "")) : b.event_date.localeCompare(a.event_date));
    body = `<div class="stat-tiles mt">${[[t("project.openTasks"), s.open, "checklist", "blue"], [t("taskStatus.done"), `${s.pct}%`, "check", "green"], [t("nav.campaigns"), s.camps, "megaphone", "pink"], [t("project.readiness"), `${s.ready}/${s.ckTotal}`, "target", "teal"]].map(([l, v, ic, c]) => `<div class="stat glass c-${c}"><span class="stat-l">${icon(ic, 15)}<span>${l}</span></span><b>${v}</b></div>`).join("")}</div>
      <div class="list-title">${t("nav.tasks")} <span class="count">${tasks.length}</span>${ed ? `<button class="text-btn" data-act="newTask" data-project="${p.id}">+ ${t("common.add")}</button>` : ""}</div>
      <div class="list glass">${tasks.map(x => taskRow(x, { showProject: false })).join("") || `<div class="empty-row">${t("project.noTasks")}</div>`}</div>
      <div class="list-title">${t("nav.campaigns")} <span class="count">${camps.length}</span>${ed ? `<button class="text-btn" data-act="newCamp" data-project="${p.id}">+ ${t("common.add")}</button>` : ""}</div>
      <div class="list glass">${camps.map(c => { const ch = chOf(c.channel); return `<button class="row" data-act="editCamp" data-id="${c.id}" style="--inset:58px"><span class="r-icon c-${ch.color}">${icon(ch.icon, 15, 2.2)}</span><div class="r-main"><span class="r-title">${esc(c.name)}</span><span class="r-sub">${esc(ch.label)} · ${c.start_date ? fmtDate(c.start_date) : "—"}${c.end_date ? " – " + fmtDate(c.end_date) : ""}</span></div><span class="r-end">${campPill(c.status)}${icon("chevR", 16)}</span></button>`; }).join("") || `<div class="empty-row">${t("project.noCampaigns")}</div>`}</div>
      <div class="list-title">${t("project.meetings")} <span class="count">${evs.length}</span>${ed ? `<button class="text-btn" data-act="newEvent" data-project="${p.id}" data-date="${todayISO()}">+ ${t("common.add")}</button>` : ""}</div>
      <div class="list glass">${evs.map(e => `<button class="row" data-act="editEvent" data-id="${e.id}" style="--inset:58px"><span class="r-icon c-accent">${icon("users", 15, 2.2)}</span><div class="r-main"><span class="r-title">${esc(e.title)}</span><span class="r-sub">${esc([fmtDate(e.event_date), e.start_time, e.location].filter(Boolean).join(" · "))}</span></div><span class="r-end">${e.event_date >= todayISO() ? relDay(e.event_date) : ""}${icon("chevR", 16)}</span></button>`).join("") || `<div class="empty-row">${t("project.noMeetings")}</div>`}</div>`;
  } else if (tab === "creators") {
    const cr = D().collaborations.filter(c => c.project_id === p.id);
    const fee = cr.reduce((a, c) => a + (+c.fee || 0), 0), views = cr.reduce((a, c) => a + (+c.views || 0), 0);
    body = `<div class="stat-tiles mt">${[[t("nav.influencers"), cr.length, "star", "violet"], [t("collabStatus.posted"), cr.filter(c => ["posted", "completed"].includes(c.status)).length, "play", "pink"], [t("pipe.fee"), money(fee), "wallet", "green"], ["Views", fmtNum(views), "eye", "blue"]].map(([l, v, ic, c]) => `<div class="stat glass c-${c}"><span class="stat-l">${icon(ic, 15)}<span>${l}</span></span><b>${v}</b></div>`).join("")}</div>
      <div class="list-title">${t("nav.influencers")} <span class="count">${cr.length}</span></div>
      <div class="list glass">${cr.map(c => `<button class="row" data-act="editCollab" data-id="${c.id}" style="--inset:58px"><span class="avatar c-violet" style="--s:32px">★</span><div class="r-main"><span class="r-title">${esc(c.influencer_name)} ${tierPill(c.influencer_tier)}</span><span class="r-sub">${esc(c.title || "")}${c.fee ? " · " + money(c.fee) : ""}${c.post_date ? " · " + fmtDate(c.post_date) : ""}</span></div><span class="r-end">${collabPill(c.status)}${icon("chevR", 16)}</span></button>`).join("") || `<div class="empty-row">${t("project.noCreators")}</div>`}</div>
      <p class="fgroup-note">${t("project.creatorsHint")}</p>`;
  } else if (tab === "brief") {
    const filled = (p.brief || []).filter(b => (b.value || "").trim()).length;
    body = `<div class="list-title">Brief / Positioning <span class="count">${t("project.briefFilled", { n: filled, total: (p.brief || []).length })}</span></div>
      <div class="list glass">${(p.brief || []).map(b => `<div class="brief-row"><input class="ie ie-label" value="${esc(b.label)}" data-bind="brief.label" data-pid="${p.id}" data-id="${b.id}" aria-label="${t("project.heading")}" ${dis}><textarea class="ie" rows="1" placeholder="${t("project.typeDetails")}" data-bind="brief.value" data-pid="${p.id}" data-id="${b.id}" ${dis}>${esc(b.value)}</textarea>${ed ? `<button class="mini-x" data-act="rmItem" data-kind="brief" data-pid="${p.id}" data-id="${b.id}" aria-label="${t("common.delete")}">${icon("x", 14, 2.4)}</button>` : ""}</div>`).join("")}
      ${ed ? `<button class="add-row" data-act="addItem" data-kind="brief" data-pid="${p.id}">${icon("plus", 18, 2.4)}${t("project.addHeading")}</button>` : ""}</div>
      <p class="fgroup-note">${t("project.autosave")}</p>`;
  } else if (tab === "milestones") {
    const ms = (p.milestones || []).slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    body = `<div class="list-title">${t("project.milestones")} <span class="count">${t("project.msPassed", { n: (p.milestones || []).filter(m => m.done).length, total: (p.milestones || []).length })}</span></div>
      <div class="list glass">${ms.map(m => `<div class="row wrap-sm" style="--inset:52px"><button class="check c-${p.color || "blue"} ${m.done ? "on" : ""}" data-act="msToggle" data-pid="${p.id}" data-id="${m.id}" aria-label="${t("project.passed")}" ${dis}>${icon("checkSmall", 14, 3)}</button><div class="r-main text"><input class="ie ms-label ${m.done ? "done" : ""}" value="${esc(m.label)}" data-bind="ms.label" data-pid="${p.id}" data-id="${m.id}" aria-label="${t("project.milestone")}" ${dis}>${m.date ? `<span class="r-sub">${relDay(m.date)}${isLaunchMs(m) ? ` · ${iconInline("flag", 12)} ${t("project.launchLinked")}` : ""}</span>` : isLaunchMs(m) ? `<span class="r-sub">${iconInline("flag", 12)} ${t("project.launchLinked")}</span>` : ""}</div>${dtBox(`<input type="date" class="date-in" value="${esc(m.date || "")}" data-bind="ms.date" data-pid="${p.id}" data-id="${m.id}" aria-label="${t("common.date")}" ${dis}>`, "date", m.date)}${ed ? `<button class="mini-x" data-act="rmItem" data-kind="milestones" data-pid="${p.id}" data-id="${m.id}" aria-label="${t("common.delete")}">${icon("x", 14, 2.4)}</button>` : ""}</div>`).join("")}
      ${ed ? `<button class="add-row" data-act="addItem" data-kind="milestones" data-pid="${p.id}">${icon("plus", 18, 2.4)}${t("project.addMilestone")}</button>` : ""}</div>`;
  } else {
    body = `<div class="card glass mt flex-row">${ringSm(s.readyPct, "green", 72)}<div><b class="big">${t("project.readyCount", { n: s.ready, total: s.ckTotal })}</b><div class="muted small">${t("project.readyNote")} · ${p.launch_date ? t("project.launchOn", { date: fmtDate(p.launch_date) }) : t("project.noLaunch")}</div></div></div>
      <div class="list-title">${t("project.launchChecklist")}</div>
      <div class="list glass">${(p.checklist || []).map(c => { const st = byKey(CHECK_ST, c.state) || CHECK_ST[0]; return `<div class="row wrap-sm" style="--inset:52px"><button class="check c-green ${c.state === "ready" ? "on" : ""}" data-act="ckToggle" data-pid="${p.id}" data-id="${c.id}" aria-label="${t("checkState.ready")}" ${dis}>${icon("checkSmall", 14, 3)}</button><div class="r-main text"><input class="ie ms-label" value="${esc(c.label)}" data-bind="ck.label" data-pid="${p.id}" data-id="${c.id}" ${dis}><input class="ie note" placeholder="${t("project.evidence")}" value="${esc(c.note || "")}" data-bind="ck.note" data-pid="${p.id}" data-id="${c.id}" ${dis}></div><select class="state-sel c-${st.color}" data-bind="ck.state" data-pid="${p.id}" data-id="${c.id}" aria-label="${t("common.status")}" ${dis}>${CHECK_ST.map(x => `<option value="${x.key}" ${x.key === c.state ? "selected" : ""}>${x.label}</option>`).join("")}</select>${ed ? `<button class="mini-x" data-act="rmItem" data-kind="checklist" data-pid="${p.id}" data-id="${c.id}" aria-label="${t("common.delete")}">${icon("x", 14, 2.4)}</button>` : ""}</div>`; }).join("")}
      ${ed ? `<button class="add-row" data-act="addItem" data-kind="checklist" data-pid="${p.id}">${icon("plus", 18, 2.4)}${t("project.addItem")}</button>` : ""}</div>`;
  }
  return hero + tabs + body;
}

export function editProject(id) {
  const ex = proj(id);
  const p = ex || newProjectData(getLang(), { color: PALETTE[D().projects.length % 9] });
  openSheet({
    title: ex ? t("projects.edit") : t("projects.new"), readOnly: !canEditProject(ex?.id),
    body: group("", F.title("name", p.name, t("projects.namePh")) + F.area("description", t("common.description"), p.description, t("projects.descPh"))) +
      group(t("projects.icon"), `<div class="emoji-pick">${[...new Set([p.emoji || "🚀", ...EMOJIS])].map(e => `<label><input type="radio" name="emoji" value="${e}" ${e === p.emoji ? "checked" : ""}><span>${e}</span></label>`).join("")}</div>`) +
      group(t("projects.color"), `<div class="color-pick">${PALETTE.map(c => `<label class="c-${c}"><input type="radio" name="color" value="${c}" ${c === p.color ? "checked" : ""} aria-label="${c}"><span></span></label>`).join("")}</div>`) +
      group(t("common.details"), F.select("owner_id", t("common.owner"), p.owner_id || "", memberOpts()) + F.text("start_date", t("projects.start"), p.start_date, { type: "date" }) + F.text("launch_date", t("projects.launch"), p.launch_date, { type: "date" }), ex ? "" : t("projects.templateNote")),
    save: ex ? t("common.done") : t("common.create"),
    onSave: async fd => {
      if (fd.start_date && fd.launch_date && fd.launch_date < fd.start_date) throw new Error(t("err.launchBeforeStart"));
      const data = { name: fd.name.trim(), description: fd.description, emoji: fd.emoji || "📁", color: fd.color || "blue", owner_id: fd.owner_id || null, start_date: fd.start_date || null, launch_date: fd.launch_date || null };
      const ms = (ex ? ex.milestones : p.milestones) || [];
      const lm = ms.find(isLaunchMs);
      if (lm) { lm.date = data.launch_date || ""; data.milestones = ms; }
      if (ex) { await update("projects", ex.id, data); return t("toast.saved"); }
      await create("projects", { ...p, ...data });
      S.ui.projTab = "overview";
      location.hash = "project/" + p.id;
      return t("toast.projectCreated");
    },
    onDelete: ex && canEdit() && !isSharedProject(id) ? async () => {
      const nT = D().tasks.filter(x => x.project_id === id).length, nC = D().campaigns.filter(c => c.project_id === id).length;
      if ((nT || nC) && !await askConfirm(t("projects.deleteAllTitle"), t("projects.deleteAllMsg", { t: nT, c: nC }), t("projects.deleteAll"))) return false;
      await destroy("projects", id);
      location.hash = "projects";
      return t("toast.deleted");
    } : null,
    deleteLabel: t("projects.delete")
  });
}

/* ---------- sharing a project with registered accounts ---------- */
let userDir = null;
export async function openShare(pid) {
  const p = proj(pid); if (!p) return;
  const manage = canEdit() && !isSharedProject(pid);
  if (manage && !userDir) { try { userDir = (await api("GET", "/users")).users; } catch (e) { fail(e); userDir = []; } }
  const shares = projectShares(pid);
  const taken = new Set([...shares.map(s => s.user_id), ...D().members.filter(m => m.role !== "guest").map(m => m.user_id)]);
  const roleSel = (attrs, cur) => `<select class="role-sel" ${attrs}>${["editor", "viewer"].map(r => `<option value="${r}" ${r === cur ? "selected" : ""}>${t("role." + r)}</option>`).join("")}</select>`;
  const rows = shares.map(s => `<div class="set-row">${avatar(s.name, 32)}<div class="grow min0"><b class="w550">${esc(s.name)}</b>${s.user_id === S.user.id ? ` <span class="faint">(${t("common.me")})</span>` : ""}<div class="faint small ellipsis">${esc(s.email)}</div></div>
      ${manage ? roleSel(`data-share-role="${s.user_id}" data-pid="${pid}" aria-label="${t("settings.role")}"`, s.role) + `<button type="button" class="mini-x" data-act="rmShare" data-pid="${pid}" data-uid="${s.user_id}" aria-label="${t("common.remove")}">${icon("x", 14, 2.4)}</button>` : `<span class="pill c-gray">${t("role." + s.role)}</span>`}</div>`).join("")
    + (manage ? (D().shareInvites || []).filter(i => i.project_id === pid).map(i => `<div class="set-row"><span class="r-icon c-gray">${icon("mail", 15, 2.2)}</span><div class="grow min0"><b class="w550 ellipsis">${esc(i.email)}</b><div class="faint small">${t("share.pending")} · ${t("role." + i.role)}</div></div><button type="button" class="mini-x" data-act="rmShareInvite" data-pid="${pid}" data-id="${i.id}" aria-label="${t("common.remove")}">${icon("x", 14, 2.4)}</button></div>`).join("") : "")
    || `<div class="empty-row">${t("share.none")}</div>`;
  const add = manage ? `<div class="set-row invite-row"><span class="r-icon c-green">${icon("userPlus", 16, 2.2)}</span><input id="shareEmail" type="email" list="shareDir" placeholder="${t("share.emailPh")}" autocomplete="off">
      <datalist id="shareDir">${userDir.filter(u => !taken.has(u.id)).map(u => `<option value="${esc(u.email)}">${esc(u.name)}</option>`).join("")}</datalist>
      ${roleSel('id="shareRole"', "editor")}<button type="button" class="btn tinted sm" data-act="addShare" data-pid="${pid}">${t("share.add")}</button></div>` : "";
  openSheet({
    title: t("share.title", { name: p.name }), save: t("common.done"), noCancel: true,
    body: group(t("share.people", { n: shares.length + (manage ? (D().shareInvites || []).filter(i => i.project_id === pid).length : 0) }), rows + add, manage ? t("share.note") : t("share.guestNote")) +
      ((isGuest() || isSharedProject(pid)) && shares.some(s => s.user_id === S.user.id) ? `<button type="button" class="danger-row" data-act="leaveProject" data-pid="${pid}">${t("share.leave")}</button>` : ""),
    onSave: () => null
  });
}
async function afterShareChange(pid, msg, ic = "users") { await reload(); openShare(pid); if (msg) island(msg, ic, "blue"); }
export async function onShareRoleChange(el) {
  try { await api("PATCH", `/w/${S.wid}/projects/${el.dataset.pid}/shares/${el.dataset.shareRole}`, { role: el.value }); await afterShareChange(el.dataset.pid, t("toast.saved"), "checkSmall"); }
  catch (e) { fail(e); openShare(el.dataset.pid); }
}

export const projActions = {
  // project-level discussion — also open to the people the project is shared with
  projComments: el => { const p = proj(el.dataset.id); if (p) openSheet({ title: `${p.emoji || "📁"} ${p.name}`, body: commentsBox("projects", p.id) || `<div class="empty-row">${t("erp.noComments")}</div>`, readOnly: true }); },
  shareProject: el => openShare(el.dataset.id),
  addShare: async el => {
    const inp = document.getElementById("shareEmail"), email = inp.value.trim();
    if (!email) return inp.focus();
    try {
      const r = await api("POST", `/w/${S.wid}/projects/${el.dataset.pid}/shares`, { email, role: document.getElementById("shareRole").value });
      const u = userDir?.find(x => x.email === email.toLowerCase());
      await afterShareChange(el.dataset.pid, r.invited ? t("toast.shareInvited", { email }) : t("toast.shared", { name: u?.name || email }), r.invited ? "mail" : "userPlus");
    } catch (e) { fail(e); }
  },
  rmShare: async el => {
    const s = projectShares(el.dataset.pid).find(x => x.user_id === el.dataset.uid);
    if (!await askConfirm(t("share.rmTitle", { name: s?.name || "" }), t("share.rmMsg"), t("common.remove"))) return openShare(el.dataset.pid);
    try { await api("DELETE", `/w/${S.wid}/projects/${el.dataset.pid}/shares/${el.dataset.uid}`); await afterShareChange(el.dataset.pid, t("toast.unshared"), "x"); }
    catch (e) { fail(e); }
  },
  rmShareInvite: async el => {
    try { await api("DELETE", `/w/${S.wid}/projects/${el.dataset.pid}/invites/${el.dataset.id}`); await afterShareChange(el.dataset.pid, t("toast.unshared"), "x"); }
    catch (e) { fail(e); }
  },
  leaveProject: async el => {
    const p = proj(el.dataset.pid);
    if (!await askConfirm(t("share.leaveTitle"), t("share.leaveMsg", { name: p?.name || "" }), t("share.leave"))) return openShare(el.dataset.pid);
    try {
      await api("DELETE", `/w/${widOf(p)}/projects/${el.dataset.pid}/shares/${S.user.id}`);
      await loadMe(); closeSheet();
      await loadWorkspace(S.wid);
      location.hash = "projects"; hooks.render();
    } catch (e) { fail(e); }
  },
  newProject: () => editProject(),
  editProject: el => editProject(el.dataset.id),
  goProject: el => { const tab = el.dataset.tab || "overview"; if (location.hash === "#project/" + el.dataset.id) { S.ui.projTab = tab; hooks.render(); } else { S.ui.nextTab = tab; location.hash = "project/" + el.dataset.id; } },
  projTab: el => { S.ui.projTab = el.dataset.v; hooks.render(); },
  msToggle: el => { const p = proj(el.dataset.pid); const m = p?.milestones.find(x => x.id === el.dataset.id); if (m) { m.done = !m.done; hooks.render(); saveProjectField(p, "milestones"); } },
  ckToggle: el => { const p = proj(el.dataset.pid); const c = p?.checklist.find(x => x.id === el.dataset.id); if (c) { c.state = c.state === "ready" ? "todo" : "ready"; hooks.render(); saveProjectField(p, "checklist"); } },
  addItem: el => {
    const p = proj(el.dataset.pid); if (!p) return;
    const k = el.dataset.kind;
    const item = k === "brief" ? { id: uid(), label: t("project.newHeading"), value: "" } : k === "milestones" ? { id: uid(), label: t("project.newMilestone"), date: "", done: false } : { id: uid(), label: t("project.newItem"), state: "todo", note: "" };
    p[k] = [...(p[k] || []), item];
    hooks.render(); saveProjectField(p, k);
    setTimeout(() => { const inp = document.querySelector(`[data-id="${item.id}"][data-bind$="label"]`); inp?.focus(); inp?.select(); }, 30);
  },
  rmItem: async el => {
    const p = proj(el.dataset.pid); if (!p) return;
    const k = el.dataset.kind, it = p[k].find(x => x.id === el.dataset.id);
    if (it && isLaunchMs(it)) { if (!await askConfirm(t("project.rmLaunchTitle"), t("project.rmLaunchMsg"), t("common.delete"))) return; }
    else if ((it?.value || it?.note || it?.date) && !await askConfirm(t("project.rmItemTitle"), `“${it.label}”`, t("common.delete"))) return;
    p[k] = p[k].filter(x => x.id !== el.dataset.id);
    hooks.render(); saveProjectField(p, k);
  }
};

/* inline binding for brief / milestones / checklist */
export function onBindInput(target, isChange) {
  const p = proj(target.dataset.pid); if (!p || !canEditProject(p.id)) return;
  const [kind, field] = target.dataset.bind.split(".");
  const key = { brief: "brief", ms: "milestones", ck: "checklist" }[kind];
  const it = p[key]?.find(x => x.id === target.dataset.id); if (!it) return;
  it[field] = target.value;
  if (kind === "ms" && field === "date" && isLaunchMs(it)) p.launch_date = target.value || null;
  saveProjectField(p, key);
  if (isChange && (field === "state" || field === "date")) hooks.render();
}
export { reload, fail };
