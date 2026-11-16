import { S, D, esc, icon, iconInline, isDone, bucketOf, BUCKETS, proj, sortTasks, todayISO, fmtLong, relDay, fmtNum, chOf, byKey, COLLAB_ST, TIERS, canEdit, projStats, fmtDate, isGuest, money, moneyShort, daysTo, CAMP_ST } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, ringSm, avatar } from "../ui.js";
import { taskRow } from "./tasks.js";
import { erpHomeCard } from "./inbox.js";
import { myApprovals, campaignActual } from "./finance.js";

export function projCard(p) {
  const s = projStatsSafe(p);
  return `<a class="proj glass c-${p.color || "blue"}" href="#project/${p.id}">
    <div class="proj-top"><span class="emoji">${esc(p.emoji || "📁")}</span><span class="ring-cap" title="${esc(t("project.readiness"))}">${ringSm(s.readyPct, p.color || "blue", 46)}<small>${t("project.ready")}</small></span></div>
    <div><h3>${esc(p.name)}</h3><p>${esc(p.description || t("project.noDescription"))}</p></div>
    <div class="proj-stats"><div><b>${s.open}</b>${t("project.openTasks")}</div><div><b>${s.camps}</b>${t("nav.campaigns")}</div><div><b>${s.creators}</b>${t("nav.influencers")}</div></div>
    <div><div class="kv"><span>${t("project.taskProgress")}</span><b>${s.pct}%</b></div><div class="bar c-${p.color || "blue"}"><i style="width:${s.pct}%"></i></div></div>
    <div class="proj-foot"><span>${iconInline("flag")} ${p.launch_date ? t("project.launchOn", { date: fmtShort(p.launch_date) }) : t("project.noLaunch")}</span><b>${p.launch_date ? relDay(p.launch_date) : ""}</b></div>
  </a>`;
}
const projStatsSafe = p => projStats(p);
const fmtShort = d => fmtDate(d);

export function viewHome() {
  const d = D();
  const today = todayISO();
  const h = new Date().getHours();
  const greet = t(h < 5 ? "home.greetNight" : h < 12 ? "home.greetMorning" : h < 17 ? "home.greetAfternoon" : "home.greetEvening");
  const first = esc(S.user.first_name || S.user.name.split(" ")[0]);
  const open = d.tasks.filter(x => !isDone(x));
  const n = b => (b === "doing" ? d.tasks.filter(x => x.status === "doing").length : open.filter(x => bucketOf(x) === b).length);
  const seesMoney = canEdit() && !isGuest();
  const committed = (D().expenses || []).filter(e => ["approved", "paid"].includes(e.status)).reduce((a, e) => a + (+e.amount || 0), 0);
  const budgetAll = d.campaigns.reduce((a, c) => a + (+c.budget || 0), 0);
  const tile = (act, v, color, ic, num, label) => `<button class="tile glass c-${color}" data-act="${act}" data-v="${v}"><div class="t-row"><span class="t-ic">${icon(ic, 17, 2.4)}</span><strong>${num}</strong></div><span>${label}</span></button>`;
  const tiles = ["late", "today"].map(b => tile("bucket", b, BUCKETS[b].color, BUCKETS[b].icon, n(b), t("bucket." + b))).join("") +
    (seesMoney
      ? tile("xfTab", "approve", "orange", "bell", myApprovals().length, t("home.toApprove")) + tile("xfTab", "budget", budgetAll && committed > budgetAll ? "red" : "green", "wallet", budgetAll ? Math.round(committed / budgetAll * 100) + "%" : "—", t("home.budgetUsed"))
      : ["week", "doing"].map(b => tile("bucket", b, BUCKETS[b].color, BUCKETS[b].icon, n(b), t("bucket." + b))).join(""));

  const actions = canEdit() ? `<button class="btn glassy hide-m" data-act="newCollab">${icon("star", 17)}${t("home.addCreator")}</button><button class="btn filled" data-act="newTask">${icon("plus", 18, 2.4)}${t("tasks.new")}</button>` : "";
  if (!d.projects.length && !d.tasks.length && !d.influencerStats.total) {
    return pageHead(fmtLong(today), `${greet}, ${first}`) + `<div class="card glass">${empty("sparkles", t("home.emptyTitle"), t("home.emptyText"),
      canEdit() ? `<div class="head-actions center"><button class="btn filled" data-act="newProject">${icon("plus", 18, 2.4)}${t("projects.new")}</button><button class="btn gray" data-act="importXlsx">${icon("upload", 18)}${t("inf.import")}</button></div>` : "")}</div>`;
  }

  const posted = d.collaborations.filter(c => ["posted", "completed"].includes(c.status)).length;
  const activeCollabs = d.collaborations.filter(c => c.status !== "declined").length;
  const statusCard = projectStatusCard(today);
  const moneyCard = seesMoney ? moneyCardHtml(budgetAll, committed, today) : "";
  const campCard = activeCampaignsCard(seesMoney);

  let mine = sortTasks(open.filter(x => x.assignee_id === S.user.id)).slice(0, 6);
  const mineTitle = mine.length ? t("home.myTasks") : t("home.todo");
  if (!mine.length) mine = sortTasks(open).slice(0, 6);
  const mineCard = `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("checklist", 18)}${mineTitle}</h3><button class="text-btn" data-act="mineAll">${t("common.seeAll")}</button></div>
    <div class="list">${mine.map(x => taskRow(x)).join("") || `<div class="empty-row">${t("home.allClear")}</div>`}</div></div>`;

  const ev = [];
  open.filter(x => x.due_date).forEach(x => ev.push({ d: x.due_date, title: x.title, sub: proj(x.project_id)?.name || t("nav.tasks"), color: proj(x.project_id)?.color || "gray", ic: "checklist", act: `data-act="editTask" data-id="${x.id}"` }));
  d.projects.forEach(p => (p.milestones || []).filter(m => m.date && !m.done).forEach(m => ev.push({ d: m.date, title: m.label, sub: p.name, color: p.color, ic: "diamond", act: `data-act="goProject" data-id="${p.id}" data-tab="milestones"` })));
  d.campaigns.forEach(c => { if (c.start_date && c.status !== "done") ev.push({ d: c.start_date, title: t("home.campaignStarts", { name: c.name }), sub: chOf(c.channel).label, color: chOf(c.channel).color, ic: "megaphone", act: `data-act="editCamp" data-id="${c.id}"` }); });
  d.collaborations.forEach(c => { if (c.post_date && !["posted", "completed", "declined"].includes(c.status)) ev.push({ d: c.post_date, title: t("home.creatorPosts", { name: c.influencer_name }), sub: byKey(COLLAB_ST, c.status)?.label, color: "violet", ic: "star", act: `data-act="editCollab" data-id="${c.id}"` }); });
  (d.events || []).forEach(e => ev.push({ d: e.event_date, title: e.title, sub: [e.start_time, e.location].filter(Boolean).join(" · ") || t("nav.calendar"), color: "accent", ic: "users", act: `data-act="editEvent" data-id="${e.id}"` }));
  const up = ev.filter(e => e.d >= today).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
  const upCard = `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("calendar", 18)}${t("home.upNext")}</h3><a class="text-btn" href="#calendar">${t("nav.calendar")}</a></div>
    <div class="list">${up.map(e => `<button class="row" ${e.act} style="--inset:58px"><span class="r-icon c-${e.color}">${icon(e.ic, 15, 2.2)}</span><div class="r-main"><span class="r-title">${esc(e.title)}</span><span class="r-sub">${esc(e.sub || "")}</span></div><span class="r-end">${relDay(e.d)}</span></button>`).join("") || `<div class="empty-row">${t("home.noUpcoming")}</div>`}</div></div>`;

  const st = d.influencerStats;
  const pipe = COLLAB_ST.filter(s => s.key !== "declined").map(s => [s, d.collaborations.filter(c => c.status === s.key).length]);
  const creatorsCard = `<div class="card glass span-2"><div class="card-head"><h3>${icon("star", 18)}${t("home.creators")}</h3><a class="text-btn" href="#influencers">${t("common.open")}</a></div>
    <div class="mini-stats"><div><b>${fmtNum(st.total)}</b><span>${t("inf.inDatabase")}</span></div><div><b>${fmtNum(st.with_contact)}</b><span>${t("inf.withContact")}</span></div><div><b>${activeCollabs}</b><span>${t("inf.inPipeline")}</span></div><div><b class="c-red" style="color:var(--red)">${st.blacklisted}</b><span>Blacklist</span></div></div>
    <div class="tier-bar">${TIERS.map(x => { const v = st.byTier?.[x.key] || 0; return v ? `<i class="c-${x.color}" style="flex:${v}" title="${x.label}: ${v}"></i>` : ""; }).join("")}</div>
    <div class="legend-inline">${TIERS.map(x => `<span class="c-${x.color}"><i class="dot"></i>${x.label} ${st.byTier?.[x.key] || 0}</span>`).join("")}</div>
    <div class="pipe-mini">${pipe.map(([s, v]) => `<button class="c-${s.color}" data-act="pipeStatus" data-v="${s.key}"><b>${v}</b><span>${s.label}</span></button>`).join("")}</div></div>`;

  const actCard = `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("activity", 18)}${t("home.activity")}</h3></div><div class="list">${(d.activity || []).slice(0, 7).map(a => `<div class="row" style="--inset:58px">${avatar(a.user_name || "?", 30)}<div class="r-main"><span class="r-title small">${esc(activityText(a))}</span><span class="r-sub">${timeAgo(a.at)}</span></div></div>`).join("") || `<div class="empty-row">${t("home.noActivity")}</div>`}</div></div>`;

  return pageHead(fmtLong(today), `${greet}, ${first}`, actions) +
    `<div class="widgets"><div class="span-4 tiles four">${tiles}</div>${erpHomeCard()}${mineCard}${statusCard}${moneyCard || campCard}${moneyCard ? campCard : ""}${creatorsCard}${upCard}${actCard}</div>`;
}

function activityText(a) {
  const who = a.user_name || t("common.someone");
  const what = t(`entity.${a.entity}`) === `entity.${a.entity}` ? a.entity : t(`entity.${a.entity}`);
  return t(`act.${a.action}`, { who, what, label: a.label ? `“${a.label}”` : "" }).replace(/\s+/g, " ").trim();
}
export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("time.justNow");
  if (s < 3600) return t("time.minutes", { n: Math.floor(s / 60) });
  if (s < 86400) return t("time.hours", { n: Math.floor(s / 3600) });
  return t("time.days", { n: Math.floor(s / 86400) });
}

/* ---------- project health: on track / at risk / late / finished ---------- */
export function projectHealth(p, today = todayISO()) {
  const st = projStats(p);
  const late = S.data.tasks.filter(x => x.project_id === p.id && !isDone(x) && x.due_date && x.due_date < today).length;
  const dl = p.launch_date ? daysTo(p.launch_date) : null;
  let key = "ok";
  if (dl != null && dl < 0 && !st.open) key = "done";
  else if (late >= 3 || (late && dl != null && dl <= 14) || (dl != null && dl < 0 && st.open)) key = "late";
  else if (late || (dl != null && dl <= 30 && st.ckTotal && st.readyPct < 70) || (dl != null && dl <= 14 && st.total && st.pct < 60)) key = "risk";
  return { key, late, dl, ...st };
}
const HEALTH = { late: ["red", 0], risk: ["orange", 1], ok: ["green", 2], done: ["gray", 3] };

function projectStatusCard(today) {
  const d = D();
  const rows = d.projects.map(p => ({ p, h: projectHealth(p, today) })).sort((a, b) => HEALTH[a.h.key][1] - HEALTH[b.h.key][1] || (a.h.dl ?? 9999) - (b.h.dl ?? 9999));
  const count = k => rows.filter(r => r.h.key === k).length;
  const sum = ["late", "risk", "ok"].map(k => `<span class="pill c-${HEALTH[k][0]}"><i class="dot"></i>${t("health." + k)} ${count(k)}</span>`).join("");
  const row = ({ p, h }) => {
    const bits = [h.dl == null ? t("project.noLaunch") : h.dl < 0 ? t("health.launched", { when: relDay(p.launch_date) }) : t("health.launchIn", { n: h.dl }),
      h.ckTotal ? t("health.ready", { p: h.readyPct }) : "", h.late ? t("health.lateTasks", { n: h.late }) : ""].filter(Boolean).join(" · ");
    return `<a class="row ph-row" href="#project/${p.id}" style="--inset:58px"><span class="r-icon c-${p.color || "blue"} emoji-ic">${esc(p.emoji || "📁")}</span>
      <div class="r-main"><span class="r-title">${esc(p.name)}</span><span class="r-sub">${bits}</span><div class="bar c-${HEALTH[h.key][0]}"><i style="width:${h.pct}%"></i></div></div>
      <span class="r-end"><span class="pill c-${HEALTH[h.key][0]}">${t("health." + h.key)}</span></span></a>`;
  };
  return `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("folder", 18)}${t("home.projectStatus")}</h3><a class="text-btn" href="#projects">${t("common.seeAll")}</a></div>
    ${rows.length ? `<div class="chips ph-sum">${sum}</div>` : ""}
    <div class="list">${rows.slice(0, 6).map(row).join("") || `<div class="empty-row">${t("projects.none")}</div>`}</div></div>`;
}

function moneyCardHtml(budget, committed, today) {
  const ex = D().expenses || [];
  const pend = ex.filter(e => e.status === "pending");
  const month = today.slice(0, 7);
  const dueMonth = ex.filter(e => e.status === "approved" && e.due_date && e.due_date.slice(0, 7) <= month);
  const total = l => l.reduce((a, e) => a + (+e.amount || 0), 0);
  const pct = budget ? Math.round(committed / budget * 100) : 0;
  const color = !budget ? "gray" : pct > 100 ? "red" : pct > 85 ? "orange" : "green";
  if (!budget && !ex.length) return `<div class="card glass span-2"><div class="card-head"><h3>${icon("wallet", 18)}${t("home.money")}</h3></div>${empty("wallet", t("home.moneyEmpty"), t("home.moneyEmptyText"), `<button class="btn tinted sm" data-act="newExpense">${icon("plus", 15, 2.4)}${t("erp.newExpense")}</button>`)}</div>`;
  return `<div class="card glass span-2"><div class="card-head"><h3>${icon("wallet", 18)}${t("home.money")}</h3><button class="text-btn" data-act="xfTab" data-v="budget">${t("erp.budgetVsActual")}</button></div>
    <div class="money-big"><div><small>${t("erp.committed")}</small><b>${money(committed)}</b></div><div class="right"><small>${t("camp.budgetTotal")}</small><b>${budget ? money(budget) : "—"}</b></div></div>
    <div class="bar lg c-${color}"><i style="width:${Math.min(100, pct)}%"></i></div>
    <p class="faint small mt-xs">${budget ? (committed > budget ? t("home.overBudget", { v: money(committed - budget) }) : t("home.leftBudget", { v: money(budget - committed), p: pct })) : t("home.noBudget")}</p>
    <div class="mini-stats three">
      <button data-act="xfTab" data-v="approve"><b>${moneyShort(total(pend))}</b><span>${t("home.pendingN", { n: pend.length })}</span></button>
      <button data-act="xfTab" data-v="all"><b>${moneyShort(total(dueMonth))}</b><span>${t("home.toPay", { n: dueMonth.length })}</span></button>
      <button data-act="xfTab" data-v="all"><b>${moneyShort(total(ex.filter(e => e.status === "paid")))}</b><span>${t("xst.paid")}</span></button>
    </div></div>`;
}

function activeCampaignsCard(seesMoney) {
  const d = D(), order = { live: 0, planned: 1, paused: 2, draft: 3 };
  const list = d.campaigns.filter(c => c.status in order).sort((a, b) => order[a.status] - order[b.status] || (a.start_date || "9999").localeCompare(b.start_date || "9999")).slice(0, 5);
  const row = c => {
    const ch = chOf(c.channel), st = byKey(CAMP_ST, c.status) || CAMP_ST[0];
    const collabs = d.collaborations.filter(x => x.campaign_id === c.id && x.status !== "declined");
    const posted = collabs.filter(x => ["posted", "completed"].includes(x.status)).length;
    const spent = seesMoney ? campaignActual(c.id) : 0, budget = +c.budget || 0;
    const pct = seesMoney && budget ? Math.round(spent / budget * 100) : collabs.length ? Math.round(posted / collabs.length * 100) : 0;
    const sub = [c.start_date ? `${fmtDate(c.start_date)}${c.end_date ? " – " + fmtDate(c.end_date) : ""}` : "", collabs.length ? t("home.postedOf", { n: posted, total: collabs.length }) : "",
      seesMoney && budget ? t("home.spentOf", { v: moneyShort(spent), b: moneyShort(budget) }) : ""].filter(Boolean).join(" · ");
    return `<button class="row" data-act="editCamp" data-id="${c.id}" style="--inset:58px"><span class="r-icon c-${ch.color}">${icon(ch.icon, 15, 2.2)}</span>
      <div class="r-main"><span class="r-title">${esc(c.name)}</span><span class="r-sub">${sub || esc(ch.label)}</span><div class="bar c-${pct > 100 ? "red" : ch.color}"><i style="width:${Math.min(100, pct)}%"></i></div></div>
      <span class="r-end"><span class="pill c-${st.color}">${esc(st.label)}</span></span></button>`;
  };
  return `<div class="card glass span-2 list-card"><div class="card-head"><h3>${icon("megaphone", 18)}${t("home.activeCampaigns")}</h3><a class="text-btn" href="#campaigns">${t("common.seeAll")}</a></div>
    <div class="list">${list.map(row).join("") || `<div class="empty-row">${t("home.noCampaigns")}</div>`}</div></div>`;
}
