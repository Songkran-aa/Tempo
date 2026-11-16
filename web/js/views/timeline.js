import { S, D, esc, icon, chOf, firstOfMonth, addDays, todayISO, monthShort, fmtDate, relDay, byKey, TASK_ST } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, chipBtn } from "../ui.js";
import { hooks } from "../store.js";
import { projSwitch } from "./projects.js";

export function viewTimeline() {
  const d = D(), today = todayISO();
  const start = S.ui.tlStart;
  const months = Array.from({ length: 12 }, (_, i) => firstOfMonth(start, i));
  const end = firstOfMonth(start, 12);
  const s0 = Date.parse(start + "T00:00:00Z"), e0 = Date.parse(end + "T00:00:00Z");
  const pos = iso => (Date.parse(iso + "T00:00:00Z") - s0) / (e0 - s0) * 100;
  const inR = iso => iso && iso >= start && iso < end;
  const clamp = v => Math.max(0, Math.min(100, v));
  const mLabel = (iso, withYear) => `${monthShort(+iso.slice(5, 7) - 1)}${withYear ? " " + iso.slice(2, 4) : ""}`;
  const head = pageHead(t("tl.eyebrow"), t("nav.projects"),
    `<div class="seg"><button data-act="tlShift" data-v="-3" aria-label="${t("common.prev")}">${icon("chevL", 16, 2.4)}</button><button aria-pressed="true" data-act="tlToday">${mLabel(months[0], true)} – ${mLabel(months[11], true)}</button><button data-act="tlShift" data-v="3" aria-label="${t("common.next")}">${icon("chevR", 16, 2.4)}</button></div><button class="btn gray sm" data-act="tlToday">${t("date.today")}</button>`) + projSwitch("timeline");
  if (!d.projects.length && !d.campaigns.length) return head + `<div class="card glass">${empty("gantt", t("tl.emptyTitle"), t("tl.emptyText"))}</div>`;
  const chips = `<div class="chips">${chipBtn("tlProject", "", t("filter.allProjects"), !S.ui.tlProject)}${d.projects.map(p => chipBtn("tlProject", p.id, p.name, S.ui.tlProject === p.id, `<span>${esc(p.emoji || "📁")}</span>`)).join("")}</div>`;
  const todayLine = inR(today) ? `<i class="g-today" style="left:${pos(today)}%" title="${t("date.today")}"></i>` : "";
  const headRow = `<div class="g-row g-head"><div class="g-label"><b>${t("tl.items")}</b></div><div class="g-track">${months.map((m, i) => `<span>${mLabel(m, i === 0 || m.slice(5, 7) === "01")}</span>`).join("")}</div></div>`;

  const projRows = d.projects.filter(p => !S.ui.tlProject || p.id === S.ui.tlProject).map(p => {
    const ms = (p.milestones || []).filter(m => inR(m.date)).sort((a, b) => a.date.localeCompare(b.date));
    const roomy = i => (i === ms.length - 1 ? pos(ms[i].date) < 90 : pos(ms[i + 1].date) - pos(ms[i].date) > 10);
    const msRow = `<div class="g-row"><div class="g-label"><b>${t("project.milestones")}</b><span>${t("tl.dated", { n: (p.milestones || []).filter(m => m.date).length, total: (p.milestones || []).length })}</span></div><div class="g-track">${todayLine}${ms.map((m, i) => `<span class="g-ms c-${p.color || "blue"} ${m.done ? "done" : ""}" style="left:${pos(m.date)}%" title="${esc(m.label)} · ${fmtDate(m.date)}" data-act="goProject" data-id="${p.id}" data-tab="milestones"></span>${roomy(i) ? `<span class="g-ms-label" style="left:${pos(m.date)}%">${esc(m.label)}</span>` : ""}`).join("") || `<div class="g-none" ${inR(today) && pos(today) < 50 ? `style="left:auto;right:10px"` : ""}>${t("tl.noMilestones")}</div>`}</div></div>`;
    const camps = d.campaigns.filter(c => c.project_id === p.id);
    const tasks = d.tasks.filter(x => x.project_id === p.id && inR(x.due_date));
    const taskRow = tasks.length ? `<div class="g-row"><div class="g-label"><b>${t("tl.taskDue")}</b><span>${t("tl.tasksN", { n: tasks.length })}</span></div><div class="g-track">${todayLine}${tasks.map(x => `<span class="g-dot c-${byKey(TASK_ST, x.status)?.color || "gray"}" style="left:${pos(x.due_date)}%" title="${esc(x.title)} · ${fmtDate(x.due_date)}" data-act="editTask" data-id="${x.id}"></span>`).join("")}</div></div>` : "";
    return `<div class="g-row g-group c-${p.color || "blue"}"><div class="g-label"><span>${esc(p.emoji || "📁")}</span><a href="#project/${p.id}">${esc(p.name)}</a></div><div class="g-track">${todayLine}${p.launch_date && inR(p.launch_date) ? `<span class="g-ms c-${p.color || "blue"}" style="left:${pos(p.launch_date)}%" title="${t("project.launchOn", { date: fmtDate(p.launch_date) })}"></span>` : ""}</div></div>${msRow}${campRows(camps)}${taskRow}`;
  }).join("");
  function campRows(camps) {
    return camps.filter(c => c.start_date && c.start_date < end && (c.end_date || c.start_date) >= start).map(c => {
      const l = clamp(pos(c.start_date)), r = clamp(pos(addDays(c.end_date || c.start_date, 1))), ch = chOf(c.channel);
      const posts = d.collaborations.filter(x => x.campaign_id === c.id && inR(x.post_date));
      return `<div class="g-row"><div class="g-label"><b>${esc(c.name)}</b><span>${esc(ch.label)}${posts.length ? ` · ${t("tl.posts", { n: posts.length })}` : ""}</span></div><div class="g-track">${todayLine}<button class="g-bar c-${ch.color}" style="left:${l}%;width:${Math.max(1, r - l)}%" data-act="editCamp" data-id="${c.id}" title="${esc(c.name)} · ${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}"><span class="g-bar-t">${esc(c.name)}</span></button>${posts.map(x => `<span class="g-star" style="left:${pos(x.post_date)}%" title="${esc(x.influencer_name)} · ${fmtDate(x.post_date)}" data-act="editCollab" data-id="${x.id}">★</span>`).join("")}</div></div>`;
    }).join("");
  }
  const loose = S.ui.tlProject ? "" : campRows(d.campaigns.filter(c => !c.project_id));
  const looseBlock = loose ? `<div class="g-row g-group c-gray"><div class="g-label"><span>📣</span>${t("tl.otherCampaigns")}</div><div class="g-track">${todayLine}</div></div>${loose}` : "";
  const legend = `<div class="legend-row"><span class="c-accent"><i class="diamond"></i>${t("tl.legendMs")}</span><span class="c-green"><i class="diamond"></i>${t("tl.legendDone")}</span><span class="c-pink"><i class="barlg"></i>${t("tl.legendCamp")}</span><span class="c-orange"><b class="star-lg">★</b>${t("tl.legendPost")}</span><span class="c-blue"><i class="dot"></i>${t("tl.legendTask")}</span><span class="c-red"><i class="barlg today-lg"></i>${t("date.today")}</span></div>`;
  const next = d.projects.flatMap(p => (p.milestones || []).filter(m => m.date && !m.done && m.date >= today).map(m => ({ ...m, p }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const list = next.length ? `<div class="list-title">${t("tl.nextMilestones")}</div><div class="list glass">${next.map(m => `<button class="row" data-act="goProject" data-id="${m.p.id}" data-tab="milestones" style="--inset:58px"><span class="r-icon c-${m.p.color || "blue"}">${icon("diamond", 14, 2.4)}</span><div class="r-main"><span class="r-title">${esc(m.label)}</span><span class="r-sub">${esc(m.p.emoji || "📁")} ${esc(m.p.name)}</span></div><span class="r-end">${fmtDate(m.date)} · ${relDay(m.date)}${icon("chevR", 16)}</span></button>`).join("")}</div>` : "";
  return head + chips + `<div class="gantt-card glass"><div class="gantt-scroll"><div class="gantt">${headRow}${projRows}${looseBlock}</div></div>${legend}</div>` + list;
}

export const tlActions = {
  tlShift: el => { S.ui.tlStart = firstOfMonth(S.ui.tlStart, +el.dataset.v); hooks.render(); },
  tlToday: () => { S.ui.tlStart = firstOfMonth(todayISO(), -1); hooks.render(); },
  tlProject: el => { S.ui.tlProject = el.dataset.v; hooks.render(); }
};
