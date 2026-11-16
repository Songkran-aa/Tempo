import { $, esc, icon, colorFor, initials, member, S, byKey, TASK_ST, CAMP_ST, COLLAB_ST, TIERS, todayISO, bucketOf, isDone, relDay, fmtDate, ago, isGuest, isSharedProject, widOf } from "./core.js";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { errText, hooks } from "./store.js";

/* ---------- small builders ---------- */
export const avatar = (name, s = 34, color) => `<span class="avatar c-${color || colorFor(name)}" style="--s:${s}px" title="${esc(name)}">${esc(initials(name))}</span>`;
export const memberAvatar = (uid, s = 28) => { const m = member(uid); return m ? avatar(m.name, s, m.color) : ""; };
export const pill = (label, color, extra = "") => `<span class="pill c-${color}">${extra}${esc(label)}</span>`;
export const statusPill = k => { const s = byKey(TASK_ST, k) || TASK_ST[0]; return pill(s.label, s.color); };
export const campPill = k => { const s = byKey(CAMP_ST, k) || CAMP_ST[0]; return pill(s.label, s.color); };
export const collabPill = k => { const s = byKey(COLLAB_ST, k) || COLLAB_ST[0]; return pill(s.label, s.color); };
export const tierPill = k => { const s = byKey(TIERS, k); return s ? pill(s.label, s.color) : ""; };
export function dueChip(task) {
  if (!task.due_date) return "";
  const b = isDone(task) ? "" : bucketOf(task);
  return `<span class="due ${b === "late" ? "late" : b === "today" ? "today" : ""}">${icon("calendar", 13)}${b === "late" || b === "today" ? relDay(task.due_date) : fmtDate(task.due_date)}</span>`;
}
export const pageHead = (eyebrow, title, actions = "") => `<div class="page-head"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h1 class="large-title">${title}</h1></div><div class="head-actions">${actions}</div></div>`;
export const empty = (ic, title, text, action = "") => `<div class="empty"><div class="e-ic">${icon(ic, 30)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
export function ringSm(pct, color = "accent", s = 44, label) {
  const r = 16, c = 2 * Math.PI * r;
  return `<span class="ring-sm" style="--s:${s}px"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" stroke="var(--fill)" stroke-width="4.5"/><circle cx="20" cy="20" r="${r}" stroke="var(--${color})" stroke-width="4.5" stroke-dasharray="${c * pct / 100} ${c}"/></svg><b>${label ?? pct + "%"}</b></span>`;
}
export function activityRings(vals) {
  const R = [62, 45, 28];
  return `<svg class="rings" viewBox="0 0 150 150" style="transform:rotate(-90deg)" aria-hidden="true">${vals.map((v, i) => { const r = R[i], c = 2 * Math.PI * r; return `<circle cx="75" cy="75" r="${r}" stroke="var(--${v.color})" stroke-opacity=".2" stroke-width="14"/><circle cx="75" cy="75" r="${r}" stroke="var(--${v.color})" stroke-width="14" stroke-dasharray="${c * Math.min(100, v.pct) / 100} ${c}"/>`; }).join("")}</svg>`;
}
export const chipBtn = (act, v, label, on, extra = "") => `<button class="chip ${on ? "on" : ""}" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on}">${extra}${esc(label)}</button>`;
export const selectChip = (model, label, opts, val) => `<label class="chip ${val ? "on" : ""}"><select data-filter="${model}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
// The creators-page filter pattern for any list: one "Filters" button (with a count) opening a panel,
// and a row of removable chips for the filters in use. defs: [{ k, label, opts:[[v,l]], icon?, sw? }].
// Values live in S.ui[model]; selects use data-filter, so the app's change handler updates and re-renders.
export function filterUI(model, defs, extra = []) {
  const f = S.ui[model];
  const lbl = d => d.sw ? d.label : `${d.label}: ${d.opts.find(o => o[0] === f[d.k])?.[1] ?? f[d.k]}`;
  (S.ui.fkeys ||= {})[model] = defs.map(d => d.k);
  (S.ui.fpanels ||= {})[model] = () => `<div class="fpanel"><div class="fp-head"><b>${t("inf.filters")}</b><button type="button" class="text-btn" data-act="fClear" data-m="${model}">${t("filter.clear")}</button></div>
    ${defs.map(d => d.sw
      ? `<label class="fp-row"><span>${d.icon ? icon(d.icon, 15) : ""} ${esc(d.label)}</span><span class="switch"><input type="checkbox" data-filter="${model}.${d.k}" ${S.ui[model][d.k] ? "checked" : ""}><span></span></span></label>`
      : `<label class="fp-row"><span>${d.icon ? icon(d.icon, 15) : ""} ${esc(d.label)}</span><select data-filter="${model}.${d.k}"><option value="">${t("common.all")}</option>${d.opts.map(([v, l]) => `<option value="${esc(v)}" ${v === S.ui[model][d.k] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`).join("")}</div>`;
  const active = [...defs.filter(d => f[d.k]).map(d => `<button class="chip on" data-act="fUnset" data-m="${model}" data-v="${d.k}">${esc(lbl(d))} ${icon("x", 13, 2.6)}</button>`), ...extra];
  return {
    button: `<button type="button" class="chip ${active.length ? "on" : ""}" data-act="fPanel" data-m="${model}">${icon("filter", 15)} ${t("inf.filters")}${active.length ? ` <span class="n-badge">${active.length}</span>` : ""}</button>`,
    chips: active.length ? `<div class="chips active-filters">${active.join("")}<button class="text-btn" data-act="fClear" data-m="${model}">${t("filter.clear")}</button></div>` : ""
  };
}
export const filterActions = {
  fPanel: el => { const m = el.dataset.m; openPopover(el, S.ui.fpanels?.[m]?.() || "", () => S.ui.fpanels?.[m]?.() || ""); },
  fUnset: el => { const f = S.ui[el.dataset.m]; f[el.dataset.v] = typeof f[el.dataset.v] === "boolean" ? false : ""; hooks.render(); },
  fClear: el => { const f = S.ui[el.dataset.m]; for (const k of S.ui.fkeys?.[el.dataset.m] || []) f[k] = typeof f[k] === "boolean" ? false : ""; if (el.dataset.m === "f") { S.ui.q = ""; S.ui.f.bucket = ""; } if (el.dataset.m === "cf") S.ui.cq = ""; closePopover(); hooks.render(); }
};
export const seg = (act, items, cur) => `<div class="seg" role="group">${items.map(([k, l, ic]) => `<button data-act="${act}" data-v="${k}" aria-pressed="${cur === k}">${ic ? icon(ic, 16) : ""}${esc(l)}</button>`).join("")}</div>`;

/* ---------- form builders (iOS grouped) ---------- */
// Native date/time inputs print in the browser's own locale (mm/dd/yyyy, 10:00 AM on an English Windows).
// We lay the app's own format ("16 พ.ย. 26", "10:00") over the input; the native picker still does the work.
export const dtText = (type, v) => !v ? "—" : type === "date" ? fmtDate(v, true) : type === "time" ? String(v).slice(0, 5) : v;
export const dtBox = (input, type, val) => type === "date" || type === "time"
  ? `<span class="dt-box">${input}<span class="dt-show ${val ? "" : "dt-none"}" aria-hidden="true">${esc(dtText(type, val))}</span></span>` : input;
const syncDt = el => { const sh = el.parentNode?.classList?.contains("dt-box") && el.nextElementSibling; if (sh) { sh.textContent = dtText(el.type, el.value); sh.classList.toggle("dt-none", !el.value); } };
document.addEventListener("input", e => { if (e.target.matches?.("input[type=date],input[type=time]")) syncDt(e.target); }, true);
document.addEventListener("change", e => { if (e.target.matches?.("input[type=date],input[type=time]")) syncDt(e.target); }, true);
// a tap anywhere on the box opens the picker (the typed segments would show the browser's format)
document.addEventListener("click", e => { const el = e.target.closest?.(".dt-box>input"); if (el && !el.disabled && el.showPicker) { try { el.showPicker(); } catch {} } });

export const F = {
  // grows with the text so long names are always fully visible; Enter still saves
  title: (name, val, ph) => `<label class="field"><textarea class="title-input" name="${name}" rows="1" placeholder="${esc(ph)}" required autocomplete="off">${esc(val ?? "")}</textarea></label>`,
  text: (name, label, val, o = {}) => `<label class="field"><span>${label}</span>${dtBox(`<input name="${name}" type="${o.type || "text"}" value="${esc(val ?? "")}" placeholder="${esc(o.ph ?? (o.type === "number" ? "0" : ""))}" ${o.attrs || ""}>`, o.type, val)}</label>`,
  area: (name, label, val, ph = "", rows = 3) => `<label class="field stack"><span>${label}</span><textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(val ?? "")}</textarea></label>`,
  select: (name, label, val, opts) => `<label class="field"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`,
  radios: (name, val, opts) => `<div class="radio-chips" role="radiogroup">${opts.map(o => `<label class="c-${o.color}"><input type="radio" name="${name}" value="${o.key}" ${o.key === val ? "checked" : ""}><span>${esc(o.label)}</span></label>`).join("")}</div>`,
  toggle: (name, label, on) => `<label class="field"><span>${label}</span><span class="switch"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span></span></span></label>`
};
/* ---------- editable list of small items (Draft/QC rounds, posts, follow-ups) ----------
   Each row: a done-checkbox + two fields. Read back with readList(name) inside onSave. */
const LIST_KINDS = {
  drafts: { flag: "qc", a: ["label", "text"], b: ["link", "text"] },
  posts: { flag: "posted", a: ["date", "date"], b: ["url", "url"] },
  followups: { flag: "done", a: ["label", "text"], b: ["at", "text"] },
  log: { flag: "important", a: ["at", "date"], b: ["text", "text"] }
};
export function listRow(kind, item = {}) {
  const k = LIST_KINDS[kind];
  return `<div class="le-row" data-id="${esc(item.id || "")}"><label class="le-flag" title="${esc(t(`list.${kind}.flag`))}"><input type="checkbox" ${item[k.flag] ? "checked" : ""}><span>${esc(t(`list.${kind}.flag`))}</span></label>
    <input class="le-a" type="${k.a[1]}" value="${esc(item[k.a[0]] ?? "")}" placeholder="${esc(t(`list.${kind}.a`))}" aria-label="${esc(t(`list.${kind}.a`))}">
    <input class="le-b" type="${k.b[1]}" value="${esc(item[k.b[0]] ?? "")}" placeholder="${esc(t(`list.${kind}.b`))}" aria-label="${esc(t(`list.${kind}.b`))}">
    <button type="button" class="mini-x" data-act="listDel" aria-label="${esc(t("common.delete"))}">${icon("x", 14, 2.4)}</button></div>`;
}
F.list = (kind, items) => `<div class="le" data-list="${kind}">${(items || []).map(x => listRow(kind, x)).join("")}<button type="button" class="add-row" data-act="listAdd" data-kind="${kind}">${icon("plus", 18, 2.4)}${esc(t(`list.${kind}.add`))}</button></div>`;
export function readList(kind) {
  const k = LIST_KINDS[kind], box = document.querySelector(`#sheet [data-list="${kind}"]`);
  if (!box) return undefined;
  return [...box.querySelectorAll(".le-row")].map((r, i) => ({
    id: r.dataset.id || `${kind}-${Date.now().toString(36)}-${i}`,
    [k.flag]: r.querySelector("input[type=checkbox]").checked,
    [k.a[0]]: r.querySelector(".le-a").value.trim(), [k.b[0]]: r.querySelector(".le-b").value.trim()
  })).filter(x => x[k.a[0]] || x[k.b[0]] || x[k.flag]);
}
export const listActions = {
  listAdd: el => { el.insertAdjacentHTML("beforebegin", listRow(el.dataset.kind)); el.previousElementSibling.querySelector(".le-a")?.focus(); },
  listDel: el => el.closest(".le-row")?.remove()
};

export const group = (title, inner, note = "") => `${title ? `<div class="fgroup-title">${title}</div>` : ""}<div class="fgroup">${inner}</div>${note ? `<p class="fgroup-note">${note}</p>` : ""}`;
// people who can be assigned: in a project shared with me, that owner's people; otherwise mine
const peopleFor = pid => (isSharedProject(pid) ? S.data.membersByWs?.[S.data.projects.find(p => p.id === pid).workspace_id] : S.data.membersByWs?.[S.wid]) || S.data.members;
export const memberOpts = (includeNone = true, pid = null) => [...(includeNone ? [["", t("common.unassigned")]] : []), ...peopleFor(pid).map(m => [m.user_id, m.name + (m.user_id === S.user.id ? ` (${t("common.me")})` : "")])];
export const projectOpts = (ownOnly = false) => {
  const opt = p => [p.id, `${p.emoji || "📁"} ${p.name}`];
  if (S.data.role === "guest") return S.data.projects.filter(p => S.data.myShares?.[p.id] === "editor").map(opt);
  // my projects, plus shared ones I may edit
  return [["", t("common.noProject")], ...S.data.projects.filter(p => !isSharedProject(p.id) || (!ownOnly && S.data.myShares?.[p.id] === "editor")).map(opt)];
};

/* ---------- sheet ---------- */
let sheetSave = null, sheetDelete = null;
const fitTitle = el => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };
document.addEventListener("input", e => {
  if (!e.target.classList?.contains("title-input")) return;
  if (/\n/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*\n+\s*/g, " "); // titles are one line, even when pasted
  fitTitle(e.target);
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && e.target.classList?.contains("title-input")) { e.preventDefault(); e.target.form?.requestSubmit(); } });

export function openSheet({ title, body, save = t("common.save"), onSave, onDelete = null, deleteLabel = t("common.delete"), noCancel = false, readOnly = false, wide = false, tall = false }) {
  $("sheetTitle").textContent = title;
  // delete sits at the end of the form (scrolls with it) instead of a bar that always takes the bottom of the screen
  $("sheetBody").innerHTML = body + (onDelete && !readOnly ? `<div class="sheet-danger"><button type="button" class="danger-row" id="sheetDelete">${icon("trash", 16)} ${esc(deleteLabel)}</button></div>` : "");
  $("sheetSave").textContent = save;
  $("sheetSave").hidden = readOnly;
  $("sheetCancel").textContent = readOnly ? t("common.close") : t("common.cancel");
  $("sheetCancel").classList.toggle("invisible", noCancel && !readOnly);
  $("sheetFoot").innerHTML = "";
  $("sheetError").textContent = "";
  $("sheet").classList.toggle("wide", wide);
  $("sheet").classList.toggle("tall", tall); // fixed height: tabs inside (settings) don't make the window jump
  sheetSave = onSave; sheetDelete = onDelete;
  closePopover();
  if (readOnly) $("sheetBody").querySelectorAll("input,select,textarea").forEach(el => { if (!el.closest(".cmt")) el.disabled = true; });
  $("sheetBody").querySelectorAll(".cmt[data-entity]").forEach(loadComments);
  if (!$("sheet").open) { $("sheet").showModal(); if (document.activeElement && $("sheet").contains(document.activeElement) && !document.activeElement.matches("input,textarea,select")) { $("sheet").tabIndex = -1; $("sheet").focus({ preventScroll: true }); } }
  $("sheetBody").scrollTop = 0;
  $("sheetBody").querySelectorAll(".title-input").forEach(fitTitle);
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("sheetBody").querySelector(".title-input:not([disabled])")?.focus(), 60);
}
export const closeSheet = () => $("sheet").open && $("sheet").close();
export function initSheet(afterSave) {
  $("sheetForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = $("sheetForm");
    const missing = [...form.querySelectorAll("[required]")].find(el => !el.disabled && !el.value.trim());
    if (missing) { $("sheetError").textContent = t("err.required"); missing.focus(); return; }
    const btn = $("sheetSave");
    btn.disabled = true;
    try {
      const fd = Object.fromEntries(new FormData(form));
      form.querySelectorAll('input[type=checkbox][name]').forEach(cb => { fd[cb.name] = cb.checked; });
      const msg = await sheetSave?.(fd);
      if (msg === false) return;
      closeSheet(); afterSave();
      if (msg) island(msg);
    } catch (err) {
      $("sheetError").textContent = errText(err);
    } finally { btn.disabled = false; }
  });
  $("sheetCancel").onclick = closeSheet;
  $("sheet").addEventListener("click", async e => {
    if (e.target === $("sheet")) { closeSheet(); return; }
    if (e.target.closest("#sheetDelete")) {
      if (!await askConfirm(t("confirm.deleteTitle"), t("confirm.deleteMsg"), t("common.delete"))) return;
      try {
        const msg = await sheetDelete?.();
        if (msg === false) return;
        closeSheet(); afterSave(); island(msg || t("toast.deleted"), "trash", "red");
      } catch (err) { $("sheetError").textContent = errText(err); }
    }
  });
}

/* ---------- alert ---------- */
export function askConfirm(title, msg, ok = t("common.delete"), destructive = true) {
  return new Promise(res => {
    $("alertTitle").textContent = title; $("alertMsg").textContent = msg || "";
    $("alertInput").hidden = true;
    const okB = $("alertOk"), cB = $("alertCancel");
    okB.textContent = ok; okB.classList.toggle("destructive", destructive); cB.textContent = t("common.cancel");
    const done = v => { $("alert").close(); okB.onclick = cB.onclick = null; res(v); };
    okB.onclick = () => done(true); cB.onclick = () => done(false);
    $("alert").oncancel = e => { e.preventDefault(); done(false); };
    $("alert").showModal(); cB.focus();
  });
}
export function askInput(title, msg, { type = "text", placeholder = "", ok = t("common.ok"), destructive = false } = {}) {
  return new Promise(res => {
    $("alertTitle").textContent = title; $("alertMsg").textContent = msg || "";
    const inp = $("alertInput"); inp.hidden = false; inp.type = type; inp.value = ""; inp.placeholder = placeholder;
    const okB = $("alertOk"), cB = $("alertCancel");
    okB.textContent = ok; okB.classList.toggle("destructive", destructive); cB.textContent = t("common.cancel");
    const done = v => { $("alert").close(); okB.onclick = cB.onclick = inp.onkeydown = null; res(v); };
    okB.onclick = () => done(inp.value); cB.onclick = () => done(null);
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); done(inp.value); } };
    $("alert").oncancel = e => { e.preventDefault(); done(null); };
    $("alert").showModal(); setTimeout(() => inp.focus(), 30);
  });
}

/* ---------- dynamic island ---------- */
let islandTimer;
export function island(msg, ic = "checkSmall", color = "green") {
  const el = $("island");
  el.innerHTML = `<span class="i-ic c-${color}">${icon(ic, 15, 2.6)}</span><span>${esc(msg)}</span>`;
  el.classList.add("show");
  clearTimeout(islandTimer);
  islandTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ---------- popover ---------- */
/* Menus and filter panels.
   Phones: a bottom sheet (full width, scrolls inside, closes on a tap outside) — it ignores page scroll and the
   keyboard resizing the screen, which used to close it the moment a finger brushed the page.
   Larger screens: a popover under its button that follows the button when the page scrolls.
   refresh (optional) rebuilds the content after the view re-renders, so a filter panel stays open and current. */
const phoneMenus = () => matchMedia("(max-width: 640px)").matches;
let popAnchor = null, popRefresh = null, popBackdrop = null;
function placePopover() {
  const p = $("popover");
  if (p.classList.contains("as-sheet")) { p.style.left = p.style.top = ""; return; }
  if (!popAnchor?.isConnected) return;
  const r = popAnchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  if (r.bottom < 0 || r.top > innerHeight) { closePopover(); return; } // its button scrolled away
  let left = r.right - w; if (left < 12) left = Math.min(r.left, innerWidth - w - 12);
  let top = r.bottom + 8; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
  p.style.left = Math.max(12, left) + "px"; p.style.top = top + "px";
}
export function openPopover(anchor, html, refresh = null) {
  const p = $("popover"); p.innerHTML = html; p.hidden = false;
  popAnchor = anchor; popRefresh = refresh;
  const sheet = phoneMenus();
  p.classList.toggle("as-sheet", sheet);
  if (sheet) {
    if (!popBackdrop) { popBackdrop = document.createElement("div"); popBackdrop.className = "pop-backdrop"; popBackdrop.addEventListener("click", closePopover); document.body.append(popBackdrop); }
    popBackdrop.hidden = false;
    document.documentElement.classList.add("pop-open");
    p.scrollTop = 0;
  }
  placePopover();
}
export function closePopover() {
  const p = $("popover"); if (!p || p.hidden) return;
  p.hidden = true; popAnchor = popRefresh = null;
  if (popBackdrop) popBackdrop.hidden = true;
  document.documentElement.classList.remove("pop-open");
}
/** Page scrolled / window resized: phones keep the sheet; elsewhere the popover follows its button. */
export function popoverViewportChanged() {
  const p = $("popover"); if (!p || p.hidden || p.classList.contains("as-sheet")) return;
  placePopover();
}
/** After a re-render: a panel that knows how to rebuild itself shows the current state; its button is found again. */
export function refreshPopover() {
  const p = $("popover"); if (!p || p.hidden || !popRefresh) return;
  if (popAnchor && !popAnchor.isConnected) {
    const sel = ["act", "m"].filter(k => popAnchor.dataset[k]).map(k => `[data-${k}="${popAnchor.dataset[k]}"]`).join("");
    popAnchor = (sel && [...document.querySelectorAll(sel)].find(x => x.offsetParent)) || popAnchor;
  }
  const keep = p.scrollTop;
  p.innerHTML = popRefresh();
  p.scrollTop = keep;
  placePopover();
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); island(t("toast.copied"), "copy", "blue"); }
  catch { island(t("err.copy"), "alert", "orange"); }
}
export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const csvCell = v => { const s = String(v ?? ""); return '"' + (/^[=+@-]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'; };
export const todayStamp = () => todayISO();

/* ---------- comments with @mentions (inside sheets) ---------- */
// Comments go to the workspace the item lives in — for a project shared with you that is the owner's workspace.
// People a project is shared with can comment on the project's tasks, campaigns, deals and events.
const GUEST_CMT = ["projects", "tasks", "campaigns", "collaborations", "events"];
export const commentsBox = (entity, id) => {
  const item = id && (S.data[entity] || []).find(x => x.id === id);
  if (!item) return "";
  const wid = widOf(item) || S.wid;
  if ((wid !== S.wid || isGuest()) && !GUEST_CMT.includes(entity)) return "";
  return `<div class="fgroup-title">${t("erp.comments")}</div>
  <div class="cmt fgroup" data-entity="${entity}" data-id="${id}" data-wid="${esc(wid)}"><div class="cmt-list"><div class="empty-row">${t("common.loading")}</div></div>
  <div class="cmt-new"><textarea class="cmt-input" rows="1" placeholder="${esc(t("erp.commentPh"))}" aria-label="${esc(t("erp.comments"))}"></textarea><button type="button" class="circle-btn accent sm" data-act="cmtSend" aria-label="${esc(t("erp.send"))}">${icon("send", 16)}</button></div>
  <div class="cmt-suggest" hidden></div></div>`;
};

// highlight "@Full Name" / "@email" of members (longest names first; placeholders avoid nested matches)
function mentionHtml(body) {
  let h = esc(body);
  const found = [];
  const people = [...(S.data?.members || [])].sort((x, y) => y.name.length - x.name.length);
  for (const m of people) for (const tok of [esc("@" + m.name), esc("@" + m.email)]) {
    if (!h.includes(tok)) continue;
    h = h.split(tok).join("\u0000" + found.length + "\u0000");
    found.push(`<b class="mention">@${esc(m.name)}</b>`);
  }
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => found[+i]);
}

export async function loadComments(box) {
  const list = box.querySelector(".cmt-list");
  try {
    const r = await api("GET", `/w/${box.dataset.wid || S.wid}/comments?entity=${box.dataset.entity}&id=${box.dataset.id}`);
    const admin = (box.dataset.wid || S.wid) === S.wid && ["owner", "admin"].includes(S.data.role);
    list.innerHTML = r.items.map(c => `<div class="cmt-row">${avatar(c.user_name || "?", 30, c.user_color)}<div class="grow min0"><div class="cmt-meta"><b>${esc(c.user_name || t("common.someone"))}</b><span class="faint">${ago(c.created_at)}</span>${c.user_id === S.user.id || admin ? `<button type="button" class="mini-x" data-act="cmtDel" data-id="${c.id}" aria-label="${esc(t("common.delete"))}">${icon("x", 12, 2.4)}</button>` : ""}</div><div class="cmt-body">${mentionHtml(c.body)}</div></div></div>`).join("")
      || `<div class="empty-row small">${t("erp.noComments")}</div>`;
  } catch (e) { list.innerHTML = `<div class="empty-row small">${esc(errText(e))}</div>`; }
}

async function sendComment(box) {
  const inp = box.querySelector(".cmt-input");
  const body = inp.value.trim();
  if (!body) return;
  inp.disabled = true;
  try {
    const r = await api("POST", `/w/${box.dataset.wid || S.wid}/comments`, { entity: box.dataset.entity, entity_id: box.dataset.id, body });
    if (r.rev && S.data && (box.dataset.wid || S.wid) === S.wid) S.data.workspace.rev = r.rev;
    inp.value = ""; inp.style.height = "";
    await loadComments(box);
    if (r.mentioned) island(t("erp.mentionSent", { n: r.mentioned }), "bell", "blue");
  } catch (e) { island(errText(e), "alert", "red"); }
  finally { inp.disabled = false; inp.focus(); }
}

function mentionQuery(inp) {
  const before = inp.value.slice(0, inp.selectionStart);
  const m = before.match(/(?:^|\s)@([^@\n]{0,30})$/);
  return m ? m[1] : null;
}
function suggest(inp) {
  const box = inp.closest(".cmt"), sug = box.querySelector(".cmt-suggest");
  const q = mentionQuery(inp);
  if (q == null) { sug.hidden = true; return; }
  const ql = q.toLowerCase();
  const hits = (S.data?.members || []).filter(m => m.role !== "guest" && m.user_id !== S.user.id && (m.name.toLowerCase().includes(ql) || m.email.includes(ql))).slice(0, 6);
  sug.innerHTML = hits.map(m => `<button type="button" class="mi" data-act="cmtPick" data-name="${esc(m.name)}">${avatar(m.name, 24, m.color)}<span>${esc(m.name)}</span><small class="faint">${esc(m.email)}</small></button>`).join("");
  sug.hidden = !hits.length;
}
document.addEventListener("input", e => {
  const el = e.target;
  if (!el.classList?.contains("cmt-input")) return;
  el.style.height = "auto"; el.style.height = Math.min(160, el.scrollHeight) + "px";
  suggest(el);
});
document.addEventListener("keydown", e => {
  const el = e.target;
  if (!el.classList?.contains("cmt-input")) return;
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendComment(el.closest(".cmt")); }
  if (e.key === "Escape") { el.closest(".cmt").querySelector(".cmt-suggest").hidden = true; e.stopPropagation(); }
});
export const commentActions = {
  cmtSend: el => sendComment(el.closest(".cmt")),
  cmtDel: async el => {
    const box = el.closest(".cmt");
    if (!await askConfirm(t("erp.deleteComment"), "", t("common.delete"))) return;
    try { await api("DELETE", `/w/${box.dataset.wid || S.wid}/comments/${el.dataset.id}`); await loadComments(box); } catch (e) { island(errText(e), "alert", "red"); }
  },
  cmtPick: el => {
    const box = el.closest(".cmt"), inp = box.querySelector(".cmt-input");
    const pos = inp.selectionStart, before = inp.value.slice(0, pos).replace(/@([^@\n]{0,30})$/, "@" + el.dataset.name + " ");
    inp.value = before + inp.value.slice(pos);
    inp.focus(); inp.setSelectionRange(before.length, before.length);
    box.querySelector(".cmt-suggest").hidden = true;
  }
};

/* ---------- small ERP builders ---------- */
export const kpi = (label, value, ic, color, sub = "") => `<div class="stat glass c-${color}"><span class="stat-l">${icon(ic, 15)}<span>${label}</span></span><b>${value}</b>${sub ? `<small class="faint">${sub}</small>` : ""}</div>`;
export const keyPill = (list, k) => { const s = byKey(list, k) || list[0]; return pill(s.label, s.color); };
export const searchBox = (id, model, val, ph) => `<label class="search-field">${icon("search", 16)}<input id="${id}" data-model="${model}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" type="search"></label>`;
