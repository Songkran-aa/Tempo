import { $, S, D, esc, icon, iconInline, isDone, bucketOf, BUCKETS, proj, sortTasks, filteredTasks, TASK_ST, PRIORITIES, byKey, memberName, uid, canEdit, canEditProject, isGuest, safeUrl, todayISO } from "../core.js";
import { t, getLang } from "../i18n.js";
import { api } from "../api.js";
import { pageHead, empty, statusPill, dueChip, memberAvatar, chipBtn, selectChip, seg, F, group, memberOpts, projectOpts, openSheet, openPopover, island, csvCell, downloadBlob, askConfirm, commentsBox, filterUI } from "../ui.js";
import { create, update, destroy, fail, hooks, reload } from "../store.js";

export function taskRow(x, { showProject = true } = {}) {
  const p = proj(x.project_id);
  const done = isDone(x);
  return `<div class="row ${done ? "done" : ""}">
    <button class="check c-${p?.color || "accent"} ${done ? "on" : ""}" data-act="toggleTask" data-id="${x.id}" aria-label="${t(done ? "tasks.markUndone" : "tasks.markDone")}" ${canEditProject(x.project_id) ? "" : "disabled"}>${icon("checkSmall", 14, 3)}</button>
    <div class="r-main" data-act="editTask" data-id="${x.id}" role="button" tabindex="0">
      <span class="r-title">${esc(x.title)}</span>
      <span class="r-sub">${showProject && p ? `<span>${esc(p.emoji || "📁")} ${esc(p.name)}</span>` : ""}${statusPill(x.status)}${dueChip(x)}${x.category ? `<span class="faint">#${esc(x.category)}</span>` : ""}${x.team ? `<span class="faint">${iconInline("users", 12)} ${esc(x.team)}</span>` : ""}</span>${x.next_step && x.status !== "done" ? `<span class="r-sub faint ellipsis">→ ${esc(x.next_step)}</span>` : ""}
    </div>
    <div class="r-end">${x.priority === "high" && !done ? `<span class="flag c-red" title="${t("priority.high")}">${icon("flag", 16)}</span>` : ""}${memberAvatar(x.assignee_id, 28)}</div>
  </div>`;
}

// phones have no room for the table: they get the list (the saved choice comes back on a wide screen)
const narrow = () => matchMedia("(max-width: 760px)").matches;
const taskView = () => (S.ui.taskView === "table" && narrow() ? "list" : S.ui.taskView);

export function viewTasks() {
  const d = D(), f = S.ui.f, list = filteredTasks();
  const head = pageHead(t("tasks.openCount", { n: d.tasks.filter(x => !isDone(x)).length }), t("nav.tasks"),
    seg("taskView", [...(narrow() ? [] : [["table", t("view.table"), "table"]]), ["list", t("view.list"), "list"], ["board", t("view.board"), "kanban"]], taskView()) +
    `<button class="circle-btn" data-act="taskMore" aria-label="${t("common.more")}">${icon("more", 20)}</button>` +
    (canEdit() ? `<button class="btn filled" data-act="newTask">${icon("plus", 18, 2.4)}${t("tasks.new")}</button>` : ""));
  if (!d.tasks.length) return head + `<div class="card glass">${empty("checklist", t("tasks.emptyTitle"), t("tasks.emptyText"), canEdit() ? `<button class="btn filled" data-act="newTask">${icon("plus", 18, 2.4)}${t("tasks.new")}</button>` : "")}</div>`;
  // same filter pattern as the creators page: one button + panel, chips only for the filters in use
  const fu = filterUI("f", [
    { k: "mine", label: t("filter.mine"), icon: "user", sw: true },
    { k: "project", label: t("common.project"), icon: "folder", opts: d.projects.map(p => [p.id, `${p.emoji || "📁"} ${p.name}`]) },
    { k: "status", label: t("common.status"), icon: "activity", opts: TASK_ST.map(s => [s.key, s.label]) },
    { k: "assignee", label: t("tasks.assignee"), icon: "users", opts: d.members.map(m => [m.user_id, m.name]) },
    { k: "priority", label: t("common.priority"), icon: "flag", opts: PRIORITIES.map(p => [p.key, p.label]) }
  ], f.bucket ? [`<button class="chip on" data-act="clearBucket">${t("bucket." + f.bucket)} ${icon("x", 13, 2.6)}</button>`] : []);
  const chips = fu.chips;
  const toolbar = `<div class="toolbar"><label class="search-field glass">${icon("search", 16)}<input id="taskSearch" data-model="q" value="${esc(S.ui.q)}" placeholder="${t("tasks.search")}" autocomplete="off"></label>
    <div class="right">${fu.button}${taskView() === "list" ? `<span class="faint small">${t("tasks.groupBy")}</span>${seg("groupBy", [["project", t("tasks.byProject")], ["status", t("tasks.byStatus")], ["due", t("tasks.byDue")]], S.ui.groupBy)}` : taskView() !== "board" ? "" : `<span class="faint small hint">${icon("kanban", 14)} ${t(matchMedia("(hover:none)").matches ? "board.hintTouch" : "board.hintMouse")}</span>`}</div></div>`;

  // table: one row per task with the columns people scan for — sortable, the default on wide screens
  if (taskView() === "table") {
    const rows = (S.ui.showDone ? list : list.filter(x => !isDone(x)));
    const doneN = list.filter(isDone).length;
    const { k, dir } = S.ui.taskSort || { k: "due", dir: 1 };
    const pr = { high: 0, med: 1, low: 2 }, st = Object.fromEntries(TASK_ST.map((x, i) => [x.key, i]));
    const key = {
      title: x => x.title.toLowerCase(), project: x => (proj(x.project_id)?.name || "~").toLowerCase(), assignee: x => (memberName(x.assignee_id) || "~").toLowerCase(),
      due: x => x.due_date || "9999", status: x => st[x.status] ?? 9, priority: x => pr[x.priority] ?? 1
    }[k] || (x => x.due_date || "9999");
    const sorted = [...rows].sort((a, b) => { const A = key(a), B = key(b); return (A < B ? -1 : A > B ? 1 : 0) * dir; });
    const th = (col, label) => `<button type="button" class="dt-th ${k === col ? "on" : ""}" data-act="taskSort" data-v="${col}">${label}${k === col ? icon(dir > 0 ? "chevD" : "chevU", 12, 2.6) : ""}</button>`;
    const prio = x => { const P = byKey(PRIORITIES, x.priority); return x.priority === "med" ? `<span class="faint">${P?.label || ""}</span>` : `<span class="pill c-${P?.color || "gray"}">${P?.label || ""}</span>`; };
    const body = sorted.map(x => { const p = proj(x.project_id), done = isDone(x); return `<div class="dt-row ${done ? "done" : ""}" data-act="editTask" data-id="${x.id}" role="button" tabindex="0">
        <span><button class="check c-${p?.color || "accent"} ${done ? "on" : ""}" data-act="toggleTask" data-id="${x.id}" aria-label="${t(done ? "tasks.markUndone" : "tasks.markDone")}" ${canEditProject(x.project_id) ? "" : "disabled"}>${icon("checkSmall", 14, 3)}</button></span>
        <span class="dt-main"><b>${esc(x.title)}</b>${x.next_step && !done ? `<small class="ellipsis">→ ${esc(x.next_step)}</small>` : x.category ? `<small class="ellipsis">#${esc(x.category)}</small>` : ""}</span>
        <span class="ellipsis">${p ? `${esc(p.emoji || "📁")} ${esc(p.name)}` : `<span class="faint">${t("common.noProject")}</span>`}</span>
        <span class="dt-who">${x.assignee_id ? `${memberAvatar(x.assignee_id, 24)}<span class="ellipsis">${esc(memberName(x.assignee_id))}</span>` : `<span class="faint">${t("common.unassigned")}</span>`}</span>
        <span>${dueChip(x) || `<span class="faint">—</span>`}</span>
        <span>${statusPill(x.status)}</span>
        <span>${prio(x)}</span>
      </div>`; }).join("");
    const table = sorted.length ? `<div class="dt dt-tasks glass"><div class="dt-head"><span></span>${th("title", t("tasks.colTask"))}${th("project", t("common.project"))}${th("assignee", t("tasks.assignee"))}${th("due", t("tasks.due"))}${th("status", t("common.status"))}${th("priority", t("common.priority"))}</div>${body}</div>`
      : `<div class="card glass mt">${empty("search", t("tasks.noneFound"), t("tasks.noneFoundText"), `<button class="btn gray" data-act="resetFilters">${t("filter.clear")}</button>`)}</div>`;
    const toggle = doneN ? `<div class="center mt"><button class="btn gray sm" data-act="showDone">${t(S.ui.showDone ? "tasks.hideDone" : "tasks.showDone", { n: doneN })}</button></div>` : "";
    return head + toolbar + chips + table + toggle;
  }

  if (S.ui.taskView === "board") {
    const cols = TASK_ST.map(s => {
      const items = sortTasks(list.filter(x => x.status === s.key));
      return `<div class="col glass" data-drop-kind="task" data-drop="${s.key}"><div class="col-head"><span class="dot c-${s.color}"></span>${s.label}<span class="n">${items.length}</span></div>
        ${items.map(x => { const p = proj(x.project_id); return `<button class="kcard" ${canEditProject(x.project_id) ? `data-drag-id="${x.id}" data-drag-kind="task"` : ""} data-act="editTask" data-id="${x.id}">
          <span class="k-top">${p ? `${esc(p.emoji || "📁")} ${esc(p.name)}` : t("common.noProject")}${x.priority === "high" ? `<span class="flag c-red">${icon("flag", 14)}</span>` : ""}</span>
          <span class="k-title">${esc(x.title)}</span>
          <span class="k-meta">${dueChip(x) || `<span class="faint">${t("tasks.noDue")}</span>`}${memberAvatar(x.assignee_id, 24)}</span></button>`; }).join("") || `<div class="col-empty">${t("board.empty")}</div>`}
        ${canEdit() ? `<button class="text-btn add-in-col" data-act="newTask" data-status="${s.key}">${iconInline("plus")} ${t("common.add")}</button>` : ""}</div>`;
    }).join("");
    return head + toolbar + chips + `<div class="board">${cols}</div>`;
  }

  const visible = S.ui.showDone ? list : list.filter(x => !isDone(x));
  const doneCount = list.filter(isDone).length;
  let groups;
  if (S.ui.groupBy === "project") {
    groups = d.projects.map(p => ({ title: `${p.emoji || "📁"} ${p.name}`, items: visible.filter(x => x.project_id === p.id), add: p.id }));
    groups.push({ title: t("common.noProject"), items: visible.filter(x => !proj(x.project_id)), add: "" });
  } else if (S.ui.groupBy === "status") {
    groups = TASK_ST.map(s => ({ title: s.label, dot: s.color, items: visible.filter(x => x.status === s.key) }));
  } else {
    groups = ["late", "today", "week", "later", "none"].map(b => ({ title: t("bucket." + b), dot: BUCKETS[b].color, items: visible.filter(x => !isDone(x) && bucketOf(x) === b) }));
    groups.push({ title: t("taskStatus.done"), dot: "green", items: visible.filter(isDone) });
  }
  groups = groups.filter(g => g.items.length);
  const body = groups.map(g => `<div class="list-title">${g.dot ? `<span class="dot c-${g.dot}"></span>` : ""}${esc(g.title)} <span class="count">${g.items.length}</span>${S.ui.groupBy === "project" && canEdit() ? `<button class="text-btn" data-act="newTask" data-project="${g.add}">+ ${t("common.add")}</button>` : ""}</div><div class="list glass">${sortTasks(g.items).map(x => taskRow(x, { showProject: S.ui.groupBy !== "project" })).join("")}</div>`).join("")
    || `<div class="card glass mt">${empty("search", t("tasks.noneFound"), t("tasks.noneFoundText"), `<button class="btn gray" data-act="resetFilters">${t("filter.clear")}</button>`)}</div>`;
  const toggle = doneCount ? `<div class="center mt"><button class="btn gray sm" data-act="showDone">${t(S.ui.showDone ? "tasks.hideDone" : "tasks.showDone", { n: doneCount })}</button></div>` : "";
  return head + toolbar + chips + body + toggle;
}

export function editTask(id, preset = {}) {
  const ex = D().tasks.find(x => x.id === id);
  const x = ex || { id: uid(), title: "", project_id: preset.project_id ?? (S.ui.f.project || (isGuest() ? D().projects.find(p => canEditProject(p.id))?.id || "" : "")), status: preset.status || "todo", priority: "med", assignee_id: S.user.id, due_date: "", category: "", notes: "", link: "", team: "", next_step: "", ref_link: "" };
  const ro = !canEditProject(x.project_id);
  openSheet({
    title: ex ? t("tasks.detail") : t("tasks.new"), readOnly: ro,
    body: group("", F.title("title", x.title, t("tasks.titlePh")) + F.area("notes", t("common.details"), x.notes, t("tasks.notesPh"))) +
      group(t("common.status"), F.radios("status", x.status, TASK_ST)) +
      group(t("tasks.info"), F.select("project_id", t("common.project"), x.project_id || "", projectOpts()) + F.select("assignee_id", t("tasks.assignee"), x.assignee_id || "", memberOpts(true, x.project_id)) + F.text("due_date", t("tasks.due"), x.due_date, { type: "date" }) + F.text("category", t("tasks.category"), x.category, { ph: t("tasks.categoryPh") }) + F.text("team", t("tasks.team"), x.team, { ph: t("tasks.teamPh") })) +
      group(t("tasks.nextStep"), F.area("next_step", t("tasks.nextStep"), x.next_step, t("tasks.nextStepPh"), 2)) +
      group(t("common.priority"), F.radios("priority", x.priority, PRIORITIES)) +
      group(t("common.link"), F.text("link", t("tasks.linkLabel"), x.link, { type: "url", ph: "https://" }) + F.text("ref_link", t("tasks.refLink"), x.ref_link, { type: "url", ph: "https://" })) +
      (ex && (safeUrl(x.link) || safeUrl(x.ref_link)) ? `<p class="fgroup-note">${[[x.link, t("tasks.linkLabel")], [x.ref_link, t("tasks.refLink")]].filter(([u]) => safeUrl(u)).map(([u, l]) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${iconInline("external")} ${l}</a>`).join(" · ")}</p>` : "") +
      (ex ? `<p class="fgroup-note">${t("common.createdBy", { name: esc(memberName(x.created_by) || "—") })}</p>` : "") + commentsBox("tasks", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      if ((fd.link && !safeUrl(fd.link)) || (fd.ref_link && !safeUrl(fd.ref_link))) throw new Error(t("err.badLink"));
      const data = { title: fd.title.trim(), notes: fd.notes, status: fd.status, project_id: fd.project_id || null, assignee_id: fd.assignee_id || null, due_date: fd.due_date || null, category: fd.category, priority: fd.priority, link: fd.link || null, team: fd.team || null, next_step: fd.next_step || null, ref_link: fd.ref_link || null };
      if (ex) { await update("tasks", ex.id, data); return t("toast.saved"); }
      await create("tasks", { id: x.id, ...data });
      return t("toast.taskAdded");
    },
    onDelete: ex ? async () => { await destroy("tasks", ex.id); return t("toast.deleted"); } : null,
    deleteLabel: t("tasks.delete")
  });
}

// Same column layout as the product tracker CSV import so a file can go out and back in.
const TRACKER_HEAD = {
  th: ["ID", "โปรเจกต์", "แบรนด์", "สินค้า", "รุ่น / สูตร", "ขั้นตอน", "งานที่ต้องทำ", "ผู้ประสานงาน", "เจ้าของงาน", "สถานะ", "เดดไลน์", "งานถัดไป", "หมายเหตุ", "ลิงก์ไฟล์", "ลิงก์อ้างอิง", "ความสำคัญ"],
  en: ["ID", "Project", "Brand", "Product", "Variant", "Stage", "Task", "Team", "Owner", "Status", "Due date", "Next step", "Notes", "File link", "Reference link", "Priority"]
};
function exportCsv() {
  const rows = [TRACKER_HEAD[getLang()] || TRACKER_HEAD.en, ...sortTasks(D().tasks).map(x => [x.external_id || x.id, proj(x.project_id)?.name || "", "", "", "", x.category || "", x.title,
    x.team || "", memberName(x.assignee_id), byKey(TASK_ST, x.status)?.label, x.due_date || "", x.next_step || "", x.notes || "", x.link || "", x.ref_link || "", byKey(PRIORITIES, x.priority)?.label])];
  downloadBlob(`tempo-tasks-${todayISO()}.csv`, new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  island(t("toast.exported"), "download", "blue");
}

/* ---------- import a product-tracker CSV ---------- */
export function initTaskInputs() {
  $("fileCsv").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importCsv(f); });
}
async function importCsv(file) {
  const fd = () => { const f = new FormData(); f.append("file", file); return f; };
  try {
    island(t("inf.reading"), "upload", "blue");
    const pre = await api("POST", `/w/${S.wid}/tasks/import?preview=1`, fd());
    const msg = [pre.projects.length ? t("tasks.importProjects", { list: pre.projects.join(", ") }) : "", t("tasks.importMerge")].filter(Boolean).join("\n\n");
    if (!await askConfirm(t("tasks.importConfirm", { n: pre.total }), msg, t("inf.importBtn"), false)) return;
    const r = await api("POST", `/w/${S.wid}/tasks/import`, fd());
    await reload();
    island(t("tasks.imported", { c: r.created, u: r.updated, p: r.projectsCreated }), "upload", "green");
    if (r.warnings?.length) await askConfirm(t("tasks.importWarnTitle", { n: r.warnings.length }), r.warnings.slice(0, 12).map(w => `${t("tasks.line", { n: w.line })}: ${t("tasks.warn." + w.code)} — ${w.value}`).join("\n"), t("common.done"), false);
  } catch (e) { fail(e); }
}

export const taskActions = {
  newTask: el => editTask(null, { project_id: el.dataset.project, status: el.dataset.status }),
  editTask: el => editTask(el.dataset.id),
  toggleTask: el => {
    const x = D().tasks.find(y => y.id === el.dataset.id); if (!x || !canEditProject(x.project_id)) return;
    const next = isDone(x) ? "todo" : "done";
    update("tasks", x.id, { status: next }).then(() => island(next === "done" ? t("toast.taskDone") : t("toast.taskReopened"), next === "done" ? "checkSmall" : "swap", next === "done" ? "green" : "gray")).catch(fail);
  },
  bucket: el => { S.ui.f = { project: "", status: "", assignee: "", mine: false, bucket: el.dataset.v }; S.ui.showDone = false; S.ui.taskView = "list"; S.ui.groupBy = "due"; location.hash = "tasks"; hooks.render(); },
  mineAll: () => { S.ui.f = { project: "", status: "", assignee: "", mine: true, bucket: "" }; location.hash = "tasks"; hooks.render(); },
  clearBucket: () => { S.ui.f.bucket = ""; hooks.render(); },
  fProject: el => { S.ui.f.project = el.dataset.v; hooks.render(); },
  fMine: () => { S.ui.f.mine = !S.ui.f.mine; hooks.render(); },
  resetFilters: () => { S.ui.f = { project: "", status: "", assignee: "", priority: "", mine: false, bucket: "" }; S.ui.q = ""; hooks.render(); },
  taskView: el => { S.ui.taskView = el.dataset.v; try { localStorage.setItem("pf.taskView", el.dataset.v); } catch {} hooks.render(); },
  taskSort: el => { const cur = S.ui.taskSort || { k: "due", dir: 1 }; S.ui.taskSort = { k: el.dataset.v, dir: cur.k === el.dataset.v ? -cur.dir : 1 }; hooks.render(); },
  groupBy: el => { S.ui.groupBy = el.dataset.v; hooks.render(); },
  showDone: () => { S.ui.showDone = !S.ui.showDone; hooks.render(); },
  taskMore: el => openPopover(el, `${canEdit() ? `<button class="mi" data-act="importTasks">${icon("upload", 18)}${t("tasks.importCsv")}</button>` : ""}<button class="mi" data-act="exportTasks">${icon("download", 18)}${t("tasks.exportCsv")}</button><hr><button class="mi" data-act="resetFilters">${icon("x", 18)}${t("filter.clear")}</button>`),
  exportTasks: () => exportCsv(),
  importTasks: () => $("fileCsv").click()
};

export function dropTask(id, status) {
  const x = D().tasks.find(y => y.id === id);
  if (!x || x.status === status) return;
  update("tasks", id, { status }).then(() => island(t("toast.movedTo", { name: byKey(TASK_ST, status).label }), "kanban", byKey(TASK_ST, status).color)).catch(fail);
}
export { askConfirm };
