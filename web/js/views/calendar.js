// Team calendar: one month view of everything with a date (tasks, milestones, campaigns, creator posts,
// meetings, contract ends, payment due dates) + meetings with attendees + a personal .ics subscription.
import { S, D, esc, icon, uid, isDone, proj, chOf, byKey, COLLAB_ST, canEdit, todayISO, addDays, firstOfMonth, fmtLong, partner, money, modOn } from "../core.js";
import { t, getLang } from "../i18n.js";
import { pageHead, F, group, projectOpts, openSheet, island, chipBtn, avatar, commentsBox, copyText } from "../ui.js";
import { create, update, destroy, hooks } from "../store.js";
import { api } from "../api.js";

export const LAYERS = [
  { key: "events", icon: "users", color: "accent" }, { key: "tasks", icon: "checklist", color: "blue" }, { key: "marketing", icon: "megaphone", color: "pink" },
  { key: "finance", icon: "receipt", color: "orange" }, { key: "partners", icon: "file", color: "teal" }
];

/** All dated items between from..to (inclusive, ISO strings). */
export function calendarItems(from, to) {
  const d = D(), out = [], inR = x => x && x >= from && x <= to;
  const push = (layer, date, o) => { if (inR(date)) out.push({ layer, d: date, ...o }); };
  (d.events || []).forEach(e => push("events", e.event_date, { title: e.title, time: e.start_time, color: "accent", ic: "users", act: `data-act="editEvent" data-id="${e.id}"`, mine: (e.attendees || []).includes(S.user.id) }));
  d.tasks.filter(x => !isDone(x)).forEach(x => push("tasks", x.due_date, { title: x.title, color: proj(x.project_id)?.color || "blue", ic: "checklist", act: `data-act="editTask" data-id="${x.id}"`, mine: x.assignee_id === S.user.id }));
  d.projects.forEach(p => (p.milestones || []).filter(m => m.date && !m.done).forEach(m => push("tasks", m.date, { title: `${m.label} · ${p.name}`, color: p.color || "indigo", ic: "diamond", act: `data-act="goProject" data-id="${p.id}" data-tab="milestones"` })));
  d.campaigns.forEach(c => {
    push("marketing", c.start_date, { title: t("home.campaignStarts", { name: c.name }), color: chOf(c.channel).color, ic: "megaphone", act: `data-act="editCamp" data-id="${c.id}"` });
    if (c.end_date && c.end_date !== c.start_date) push("marketing", c.end_date, { title: t("erp.campaignEnds", { name: c.name }), color: chOf(c.channel).color, ic: "flag", act: `data-act="editCamp" data-id="${c.id}"` });
  });
  d.collaborations.filter(c => !["posted", "completed", "declined"].includes(c.status)).forEach(c => push("marketing", c.post_date, { title: t("home.creatorPosts", { name: c.influencer_name }), color: "violet", ic: "star", act: `data-act="editCollab" data-id="${c.id}"`, sub: byKey(COLLAB_ST, c.status)?.label }));
  (d.expenses || []).filter(e => ["pending", "approved"].includes(e.status)).forEach(e => push("finance", e.due_date, { title: t("erp.paymentDue", { name: e.title }), color: "orange", ic: "receipt", act: `data-act="editExpense" data-id="${e.id}"`, sub: money(e.amount) }));
  (d.contracts || []).filter(c => c.status === "active").forEach(c => push("partners", c.end_date, { title: t("erp.contractEnds", { name: c.title }), color: "teal", ic: "file", act: `data-act="editContract" data-id="${c.id}"`, sub: partner(c.partner_id)?.name }));
  return out.sort((a, b) => a.d.localeCompare(b.d) || (a.time || "99").localeCompare(b.time || "99"));
}

const itemChip = it => `<button class="cal-chip c-${it.color}${it.mine ? " mine" : ""}" ${it.act} title="${esc(it.title)}">${it.time ? `<b>${esc(it.time)}</b>` : `<i></i>`}<span>${esc(it.title)}</span></button>`;
const itemRow = it => `<button class="row" ${it.act} style="--inset:58px"><span class="r-icon c-${it.color}">${icon(it.ic, 15, 2.2)}</span><div class="r-main"><span class="r-title">${esc(it.title)}</span>${it.sub || it.time ? `<span class="r-sub">${esc([it.time, it.sub].filter(Boolean).join(" · "))}</span>` : ""}</div><span class="r-end">${it.mine ? `<span class="pill c-accent">${t("common.me")}</span>` : ""}${icon("chevR", 15)}</span></button>`;

export function viewCalendar() {
  const month = S.ui.calMonth, today = todayISO();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = addDays(month, -first.getUTCDay()); // weeks start on Sunday
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const off = S.ui.calOff;
  const items = calendarItems(days[0], days[41]).filter(it => !off[it.layer]);
  const byDay = new Map();
  items.forEach(it => { if (!byDay.has(it.d)) byDay.set(it.d, []); byDay.get(it.d).push(it); });
  const title = getLang() === "th" ? `${t("date.monthsLong").split(",")[m - 1]} ${y + 543}` : `${t("date.monthsLong").split(",")[m - 1]} ${y}`;
  const head = pageHead(t("erp.calendarSub"), t("nav.calendar"),
    `<button class="btn glassy hide-m" data-act="calSubscribe">${icon("link", 17)}${t("erp.subscribe")}</button>` +
    (canEdit() ? `<button class="btn filled" data-act="newEvent" data-date="${S.ui.calDay}">${icon("plus", 18, 2.4)}${t("erp.newEvent")}</button>` : ""));
  const nav = `<div class="toolbar"><div class="left"><button class="circle-btn" data-act="calMove" data-v="-1" aria-label="${t("common.prev")}">${icon("chevL", 18)}</button><h2 class="cal-title">${esc(title)}</h2><button class="circle-btn" data-act="calMove" data-v="1" aria-label="${t("common.next")}">${icon("chevR", 18)}</button><button class="btn gray sm" data-act="calToday">${t("date.today")}</button></div>
    <div class="right chips">${LAYERS.filter(l => l.key !== "partners" || modOn("partners")).map(l => chipBtn("calLayer", l.key, t("erp.layer." + l.key), !off[l.key], `<span class="dot c-${l.color}"></span>`)).join("")}</div></div>`;
  const dows = t("date.daysShort").split(",");
  const grid = `<div class="cal glass"><div class="cal-dows">${dows.map(x => `<span>${x}</span>`).join("")}</div><div class="cal-grid">${days.map(d => {
    const list = byDay.get(d) || [], out = d.slice(0, 7) !== month.slice(0, 7);
    return `<div class="cal-day${out ? " out" : ""}${d === today ? " today" : ""}${d === S.ui.calDay ? " sel" : ""}" data-act="calPick" data-v="${d}" role="button" tabindex="0" aria-label="${esc(fmtLong(d))}">
      <span class="cal-num">${+d.slice(8)}</span>
      <div class="cal-items">${list.slice(0, 3).map(itemChip).join("")}${list.length > 3 ? `<span class="cal-more">+${list.length - 3}</span>` : ""}</div>
      <div class="cal-dots">${list.slice(0, 4).map(it => `<i class="c-${it.color}"></i>`).join("")}</div></div>`;
  }).join("")}</div></div>`;
  const sel = S.ui.calDay, selItems = (byDay.get(sel) || calendarItems(sel, sel).filter(it => !off[it.layer]));
  const agenda = `<div class="card glass list-card mt"><div class="card-head"><h3>${icon("calendar", 18)}${esc(fmtLong(sel))}</h3>${canEdit() ? `<button class="text-btn" data-act="newEvent" data-date="${sel}">${icon("plus", 15, 2.4)} ${t("erp.newEvent")}</button>` : ""}</div>
    <div class="list">${selItems.map(itemRow).join("") || `<div class="empty-row">${t("erp.dayEmpty")}</div>`}</div></div>`;
  return head + nav + grid + agenda;
}

export function editEvent(id, preset = {}) {
  const ex = D().events.find(e => e.id === id);
  const ev = ex || { id: uid(), title: "", event_date: preset.date || S.ui.calDay || todayISO(), start_time: "10:00", end_time: "11:00", location: "", link: "", attendees: [S.user.id], project_id: preset.project_id || "", notes: "" };
  const people = D().members.filter(m => m.role !== "guest");
  const att = `<div class="att-list">${people.map(m => `<label class="att"><input type="checkbox" name="att_${m.user_id}" ${(ev.attendees || []).includes(m.user_id) ? "checked" : ""}>${avatar(m.name, 26, m.color)}<span>${esc(m.name)}${m.user_id === S.user.id ? ` (${t("common.me")})` : ""}</span></label>`).join("")}</div>`;
  openSheet({
    title: ex ? t("erp.event") : t("erp.newEvent"), readOnly: !canEdit(),
    body: group("", F.title("title", ev.title, t("erp.eventTitlePh")) + F.text("event_date", t("common.date"), ev.event_date, { type: "date", attrs: "required" }) +
        `<div class="field-pair">${F.text("start_time", t("erp.start"), ev.start_time || "", { type: "time" })}${F.text("end_time", t("erp.end"), ev.end_time || "", { type: "time" })}</div>`) +
      group(t("erp.where"), F.text("location", t("erp.location"), ev.location, { ph: t("erp.locationPh") }) + F.text("link", t("erp.meetingLink"), ev.link, { type: "url", ph: "https://meet.google.com/…" }) + F.select("project_id", t("common.project"), ev.project_id || "", projectOpts(true))) +
      group(t("erp.attendees"), att, t("erp.attendeesNote")) +
      group("", F.area("notes", t("erp.agenda"), ev.notes, t("erp.agendaPh"))) + commentsBox("events", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      if (fd.start_time && fd.end_time && fd.end_time < fd.start_time) throw new Error(t("erp.timeOrder"));
      const attendees = people.filter(m => fd["att_" + m.user_id]).map(m => m.user_id);
      const data = { title: fd.title.trim(), event_date: fd.event_date, start_time: fd.start_time || null, end_time: fd.end_time || null, location: fd.location, link: fd.link || null, project_id: fd.project_id || null, attendees, notes: fd.notes };
      S.ui.calDay = fd.event_date; S.ui.calMonth = firstOfMonth(fd.event_date);
      if (ex) { await update("events", ex.id, data); return t("toast.saved"); }
      await create("events", { id: ev.id, ...data });
      return attendees.filter(u => u !== S.user.id).length ? t("erp.eventInvited", { n: attendees.filter(u => u !== S.user.id).length }) : t("erp.eventAdded");
    },
    onDelete: ex ? async () => { await destroy("events", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deleteEvent")
  });
}

export const calUrl = token => `${location.origin}/api/cal/${token}.ics`;
export async function ensureCalToken(rotate = false) {
  if (S.user.cal_token && !rotate) return S.user.cal_token;
  const r = await api("POST", "/me/calendar");
  S.user.cal_token = r.token;
  return r.token;
}

export const calendarActions = {
  newEvent: el => editEvent(null, { date: el.dataset.date, project_id: el.dataset.project }),
  editEvent: el => editEvent(el.dataset.id),
  calMove: el => { S.ui.calMonth = firstOfMonth(S.ui.calMonth, +el.dataset.v); hooks.render(); },
  calToday: () => { S.ui.calMonth = firstOfMonth(todayISO()); S.ui.calDay = todayISO(); hooks.render(); },
  calPick: (el, e) => { S.ui.calDay = el.dataset.v; if (el.dataset.v.slice(0, 7) !== S.ui.calMonth.slice(0, 7)) S.ui.calMonth = firstOfMonth(el.dataset.v); hooks.render(); },
  calLayer: el => { S.ui.calOff[el.dataset.v] = !S.ui.calOff[el.dataset.v]; hooks.render(); },
  calSubscribe: async () => {
    const token = await ensureCalToken();
    openSheet({
      title: t("erp.subscribe"), save: t("common.done"), noCancel: true,
      body: `<div class="sub-hero">${icon("calendar", 30)}<p>${t("erp.subscribeText")}</p></div>` +
        group(t("erp.yourLink"), `<div class="set-row"><input id="calUrl" readonly value="${esc(calUrl(token))}"><button type="button" class="btn tinted sm" data-act="calCopy">${icon("copy", 15)}${t("erp.copy")}</button></div>`, t("erp.subscribeNote")) +
        group(t("erp.howTo"), `<div class="howto"><p><b>Google Calendar</b> — ${t("erp.howGoogle")}</p><p><b>iPhone / Mac</b> — ${t("erp.howApple")}</p><p><b>Outlook</b> — ${t("erp.howOutlook")}</p></div>`) +
        `<button type="button" class="danger-row" data-act="calRotate">${t("erp.rotateLink")}</button>`,
      onSave: async () => {}
    });
  },
  calCopy: () => copyText(document.getElementById("calUrl")?.value || ""),
  calRotate: async () => { const tok = await ensureCalToken(true); const inp = document.getElementById("calUrl"); if (inp) inp.value = calUrl(tok); island(t("erp.linkRotated"), "key", "orange"); }
};

