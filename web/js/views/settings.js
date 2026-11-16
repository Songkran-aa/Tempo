import { S, D, esc, icon, ACCENTS, fmtDate, isAdmin, canEdit, isGuest, PALETTE, role, isSharedProject, sharedOwner } from "../core.js";
import { t, getLang, setLang } from "../i18n.js";
import { api } from "../api.js";
import { downloadBlob } from "../ui.js";
import { F, group, openSheet, askConfirm, askInput, island, avatar, closeSheet, openPopover, seg } from "../ui.js";
import { fail, hooks, reload } from "../store.js";

const ROLES = ["owner", "admin", "editor", "viewer"];
const row = (act, ic, color, label, end = icon("chevR", 16), cls = "", extra = "") => `<button type="button" class="set-row ${cls}" data-act="${act}" ${extra}><span class="r-icon c-${color}">${icon(ic, 16, 2.2)}</span>${label}<span class="end">${end}</span></button>`;

const MODULES = [["partners", "briefcase", "yellow"], ["inventory", "box", "teal"]];

// Settings in three tabs: Me (profile, look, menus, notifications, account) · Sharing (projects I share, projects shared with me) · Data (import/export).
// One account = one place. People share single projects; shared projects sit next to your own, nothing to switch.
export function openSettings(tab) {
  if (tab) S.ui.setTab = tab;
  const u = S.user, d = D(), admin = isAdmin(), guest = isGuest();
  const tabs = [["me", t("settings.tabMe")], ["share", t("settings.tabShare")], ...(guest ? [] : [["data", t("settings.tabData")]])];
  const cur = tabs.some(x => x[0] === S.ui.setTab) ? S.ui.setTab : "me";
  const head = `<div class="set-tabs">${seg("setTab", tabs, cur).replace('class="seg"', 'class="seg full"')}</div>`;
  let body = "";

  if (cur === "me") {
    body = `<div class="profile-card">${avatar(u.name, 60, u.accent)}<div class="min0"><b>${esc(u.name)}</b><small>${esc(u.email)}</small><br><small class="faint">${t("settings.memberSince", { date: fmtDate(String(u.created_at).slice(0, 10), true) })}</small></div></div>` +
      group(t("settings.profile"), `<label class="field"><span>${t("auth.firstName")}</span><input data-set="first_name" value="${esc(u.first_name || "")}" autocomplete="given-name" maxlength="60"></label><label class="field"><span>${t("auth.lastName")}</span><input data-set="last_name" value="${esc(u.last_name || "")}" autocomplete="family-name" maxlength="60"></label>`) +
      group(t("settings.appearance"),
        `<div class="set-row"><span class="r-icon c-blue">${icon("globe", 16, 2.2)}</span>${t("settings.language")}<span class="end"><span class="seg">${[["th", "ไทย"], ["en", "English"]].map(([k, l]) => `<button type="button" data-act="setLang" data-v="${k}" aria-pressed="${getLang() === k}">${l}</button>`).join("")}</span></span></div>
         <div class="set-row"><span class="r-icon c-indigo">${icon(document.documentElement.dataset.theme === "dark" ? "moon" : "sun", 16, 2.2)}</span>${t("settings.theme")}<span class="end"><span class="seg">${["auto", "light", "dark"].map(k => `<button type="button" data-act="setTheme" data-v="${k}" aria-pressed="${u.theme === k}">${t("theme." + k)}</button>`).join("")}</span></span></div>
         <div class="set-row"><span class="r-icon c-accent">${icon("sparkles", 16, 2.2)}</span>${t("settings.accent")}</div>
         <div class="color-pick indent">${Object.keys(ACCENTS).map(a => `<button type="button" class="${u.accent === a ? "on" : ""}" data-act="setAccent" data-v="${a}" aria-label="${a}" style="--c:${ACCENTS[a][0]}"><span></span></button>`).join("")}</div>`) +
      (!guest && admin ? group(t("settings.modules"), MODULES.map(([k, ic, c]) => `<label class="set-row"><span class="r-icon c-${c}">${icon(ic, 16, 2.2)}</span><div class="grow min0"><b class="w550">${t("nav." + k)}</b><div class="faint small">${t("settings.mod." + k)}</div></div><span class="end"><span class="switch"><input type="checkbox" data-act="toggleModule" data-v="${k}" ${d.workspace.modules?.[k] ? "checked" : ""}><span></span></span></span></label>`).join(""), t("settings.modulesNote")) : "") +
      group(t("erp.notifSettings"), `<label class="set-row"><span class="r-icon c-orange">${icon("mail", 16, 2.2)}</span>${t("erp.emailNotif")}<span class="end"><span class="switch"><input type="checkbox" data-act="toggleNotifyEmail" ${u.notify_email !== false ? "checked" : ""}><span></span></span></span></label>` + row("inbox", "bell", "red", t("erp.notifications")) + row("calSubscribe", "calendar", "accent", t("erp.subscribe")), S.config.mail ? t("erp.emailNote") : t("erp.emailOff")) +
      group(t("settings.account"), row("changePw", "key", "gray", t("settings.changePw")) + row("signOut", "logout", "red", t("settings.signOut"), "", "red")) +
      `<button type="button" class="danger-row" data-act="deleteAccount">${t("settings.deleteAccount")}</button>`;
  }

  if (cur === "share") {
    const shares = d.projectShares || [], pending = d.shareInvites || [];
    // projects I share: one row per project, tap to manage who has it
    const projRows = d.projects.filter(p => !isSharedProject(p.id)).map(p => {
      const ppl = shares.filter(x => x.project_id === p.id), inv = pending.filter(x => x.project_id === p.id), n = ppl.length + inv.length;
      const who = n ? [...ppl.map(x => x.name), ...inv.map(x => `${x.email} (${t("share.pending")})`)].join(", ") : t("settings.notShared");
      return `<button type="button" class="set-row" data-act="shareProject" data-id="${p.id}"><span class="r-icon c-${p.color || "accent"}">${esc(p.emoji || "📁")}</span><div class="grow min0"><b class="w550 ellipsis">${esc(p.name)}</b><div class="faint small ellipsis">${esc(who)}</div></div><span class="end">${n ? `<span class="pill c-blue">${n}</span>` : ""}${icon("chevR", 16)}</span></button>`;
    }).join("") || `<div class="empty-row">${t("settings.noProjects")}</div>`;
    // people from the old whole-account invites: shown only if any are left, so they can be removed
    const roleOpts = r => ROLES.filter(x => x !== "owner" || role() === "owner").map(x => `<option value="${x}" ${x === r ? "selected" : ""}>${t("role." + x)}</option>`).join("");
    const legacy = guest ? [] : d.members.filter(m => m.role !== "guest" && m.user_id !== u.id);
    const legacyRows = legacy.map(m => `<div class="set-row">${avatar(m.name, 32, m.color)}<div class="grow min0"><b class="w550">${esc(m.name)}</b><div class="faint small ellipsis">${esc(m.email)}</div></div>
      ${admin && m.role !== "owner" ? `<select class="role-sel" data-member-role="${m.user_id}" aria-label="${t("settings.role")}">${roleOpts(m.role)}</select><button type="button" class="mini-x" data-act="rmMember" data-id="${m.user_id}" aria-label="${t("common.remove")}">${icon("x", 14, 2.4)}</button>` : `<span class="pill c-gray">${t("role." + m.role)}</span>`}</div>`).join("") +
      (admin ? (d.invites || []).map(i => `<div class="set-row"><span class="r-icon c-gray">${icon("mail", 15, 2.2)}</span><div class="grow min0"><b class="w550 ellipsis">${esc(i.email)}</b><div class="faint small">${t("settings.pendingInvite")}</div></div><button type="button" class="mini-x" data-act="rmInvite" data-id="${i.id}" aria-label="${t("common.remove")}">${icon("x", 14, 2.4)}</button></div>`).join("") : "");
    // shared with me: the projects themselves, with who shared them — tap to open
    const sharedRows = d.projects.filter(p => isSharedProject(p.id)).map(p => `<button type="button" class="set-row" data-act="openSharedProject" data-id="${p.id}"><span class="r-icon c-${p.color || "accent"}">${esc(p.emoji || "📁")}</span><div class="grow min0"><b class="w550 ellipsis">${esc(p.name)}</b><div class="faint small ellipsis">${esc(t("space.sharedBy", { name: sharedOwner(p.id) }))} · ${t("role." + (d.myShares[p.id] || "viewer"))}</div></div><span class="end">${icon("chevR", 16)}</span></button>`).join("");
    body = group(t("settings.myShares"), projRows, t("settings.mySharesNote")) +
      (legacy.length || (admin && d.invites?.length) ? group(t("settings.legacyMembers", { n: legacy.length }), legacyRows, t("settings.legacyNote")) : "") +
      group(t("settings.sharedWithMe"), sharedRows || `<div class="empty-row">${t("settings.sharedWithMeNone")}</div>`, sharedRows ? t("settings.sharedWithMeNote") : "");
  }

  if (cur === "data") {
    body = group(t("settings.export"),
        row("exportWorkspace", "download", "accent", `<div class="grow min0"><b class="w550">${t("io.export")}</b><div class="faint small">${t("io.exportSub")}</div></div>`) + row("exportXlsx", "download", "violet", t("inf.export")) + row("exportTasks", "table", "green", t("tasks.exportCsv")) + row("exportCamp", "table", "green", t("camp.exportCsv"))) +
      (canEdit() ? group(t("settings.import"), row("importWorkspace", "upload", "accent", `<div class="grow min0"><b class="w550">${t("io.import")}</b><div class="faint small">${t("io.importSub")}</div></div>`) + row("importXlsx", "upload", "violet", t("inf.import")), t("io.mergeNote")) : "") +
      `<p class="fgroup-note">${t("settings.dataNote")}</p>` +
      (role() === "owner" ? `<button type="button" class="danger-row" data-act="wipe">${t("settings.wipe")}</button>` : "");
  }

  openSheet({
    title: t("settings.title"), save: t("common.done"), noCancel: true, tall: true,
    body: head + body + `<p class="fgroup-note center mt">Tempo ${esc(S.config.version || "")} · ${t("app.tagline")}</p>`,
    onSave: () => null
  });
}

let nameTimer;
export function onSettingsInput(el) {
  const k = el.dataset.set, v = el.value.trim();
  if (!v && k !== "last_name") return;
  clearTimeout(nameTimer);
  nameTimer = setTimeout(async () => {
    try {
      if (k === "first_name" || k === "last_name") { const r = await api("PATCH", "/me", { [k]: v }); S.user = r.user; if (r.workspaces) S.workspaces = r.workspaces; await reload(); }
    } catch (e) { fail(e); }
  }, 600);
}
export async function onRoleChange(el) {
  try { await api("PATCH", `/w/${S.wid}/members/${el.dataset.memberRole}`, { role: el.value }); await reload(); openSettings(); island(t("toast.saved")); }
  catch (e) { fail(e); openSettings(); }
}

async function savePref(patch) {
  Object.assign(S.user, patch);
  hooks.applyAppearance();
  try { const r = await api("PATCH", "/me", patch); S.user = r.user; } catch (e) { fail(e); }
}

function changePassword() {
  openSheet({
    title: t("settings.changePw"),
    body: group("", `<label class="field"><span>${t("settings.currentPw")}</span><input name="current" type="password" autocomplete="current-password" required></label><label class="field"><span>${t("settings.newPw")}</span><input name="next" type="password" autocomplete="new-password" required placeholder="${t("auth.pwHint")}"></label><label class="field"><span>${t("settings.confirmPw")}</span><input name="again" type="password" autocomplete="new-password" required></label>`),
    onSave: async fd => {
      if (fd.next.length < 8) throw new Error(t("err.weak_password"));
      if (fd.next !== fd.again) throw new Error(t("err.pwMismatch"));
      await api("POST", "/me/password", { current: fd.current, next: fd.next });
      return t("toast.pwChanged");
    }
  });
}

/* ---------- Tempo workspace file (.xlsx) ---------- */
export function initWorkspaceFileInput() {
  document.getElementById("fileWs").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importWorkspaceFile(f); });
}
async function exportWorkspaceFile() {
  try {
    island(t("io.preparing"), "download", "blue");
    const res = await api("GET", `/w/${S.wid}/export.xlsx`, null, { raw: true });
    const name = decodeURIComponent((res.headers.get("content-disposition") || "").match(/filename\*=UTF-8''([^;]+)/)?.[1] || "Tempo.xlsx");
    downloadBlob(name, await res.blob());
    island(t("toast.exported"), "download", "blue");
  } catch (e) { fail(e); }
}
const IO_SHEETS = ["projects", "milestones", "readiness", "brief", "tasks", "campaigns", "influencers", "collaborations"];
async function importWorkspaceFile(file) {
  const fd = () => { const f = new FormData(); f.append("file", file); return f; };
  try {
    island(t("inf.reading"), "upload", "blue");
    const pre = await api("POST", `/w/${S.wid}/import?preview=1`, fd());
    const lines = IO_SHEETS.filter(k => pre.counts[k]).map(k => `${t("io.sheet." + k)} ${pre.counts[k]}`).join(" · ");
    if (!await askConfirm(t("io.confirm"), `${lines}\n\n${t("io.mergeNote")}`, t("inf.importBtn"), false)) return;
    const r = await api("POST", `/w/${S.wid}/import`, fd());
    await reload(); S.inf.loadedFor = null; hooks.render();
    const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
    island(t("io.done", { c: sum(r.created), u: sum(r.updated) }), "upload", "green");
    if (r.warnings?.length) await askConfirm(t("tasks.importWarnTitle", { n: r.warnings.length }), r.warnings.slice(0, 15).map(w => `${w.sheet} ${t("tasks.line", { n: w.row })}: ${t("io.warn." + w.code)}${w.value ? " — " + w.value : ""}`).join("\n"), t("common.done"), false);
  } catch (e) { fail(e); }
}

export const settingsActions = {
  exportWorkspace: () => exportWorkspaceFile(),
  importWorkspace: () => document.getElementById("fileWs").click(),
  settings: () => openSettings(),
  setTab: el => openSettings(el.dataset.v),
  toggleModule: async el => {
    const k = el.dataset.v, on = el.checked;
    try {
      const r = await api("PATCH", `/w/${S.wid}`, { modules: { [k]: on } });
      D().workspace.modules = r.modules;
      hooks.render();
      island(t(on ? "toast.moduleOn" : "toast.moduleOff", { name: t("nav." + k) }), on ? "check" : "x", on ? "green" : "gray");
    } catch (e) { el.checked = !on; fail(e); }
  },
  toggleNotifyEmail: el => { savePref({ notify_email: el.checked }); island(el.checked ? t("erp.emailOn") : t("erp.emailOffToast"), "mail", el.checked ? "green" : "gray"); },
  setLang: el => { setLang(el.dataset.v); savePref({ lang: el.dataset.v }); hooks.render(); openSettings(); },
  setTheme: el => { savePref({ theme: el.dataset.v }); openSettings(); },
  setAccent: el => { savePref({ accent: el.dataset.v }); openSettings(); },
  quickTheme: () => { savePref({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }); },
  quickLang: () => { const l = getLang() === "th" ? "en" : "th"; setLang(l); savePref({ lang: l }); hooks.render(); },
  openSharedProject: el => { closeSheet(); location.hash = "project/" + el.dataset.id; },
  rmInvite: async el => { try { await api("DELETE", `/w/${S.wid}/invites/${el.dataset.id}`); await reload(); openSettings(); } catch (e) { fail(e); } },
  rmMember: async el => {
    const m = D().members.find(x => x.user_id === el.dataset.id);
    if (!await askConfirm(t("settings.removeTitle", { name: m?.name || "" }), t("settings.removeMsg"), t("common.remove"))) return;
    try { await api("DELETE", `/w/${S.wid}/members/${el.dataset.id}`); await reload(); openSettings(); } catch (e) { fail(e); }
  },
  wipe: async () => {
    const word = t("settings.wipeWord");
    const v = await askInput(t("settings.wipe"), t("settings.wipeMsg", { name: word }), { placeholder: word, ok: t("settings.wipeBtn"), destructive: true });
    if (v == null) return;
    if (v.trim() !== word) return island(t("err.nameMismatch"), "alert", "orange");
    try { await api("DELETE", `/w/${S.wid}/data`, { scope: "plans" }); closeSheet(); await reload(); location.hash = "home"; island(t("toast.wiped"), "trash", "red"); } catch (e) { fail(e); }
  },
  changePw: () => changePassword(),
  account: el => openPopover(el, `<div class="p-head">${avatar(S.user.name, 44, S.user.accent)}<div class="min0"><b class="ellipsis">${esc(S.user.name)}</b><small class="ellipsis">${esc(S.user.email)}</small></div></div>
    <button class="mi" data-act="settings">${icon("gear", 18)}${t("settings.title")}</button>
    <button class="mi" data-act="quickLang">${icon("globe", 18)}${getLang() === "th" ? "English" : "ภาษาไทย"}</button>
    <button class="mi" data-act="quickTheme">${icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon", 18)}${t(document.documentElement.dataset.theme === "dark" ? "theme.toLight" : "theme.toDark")}</button>
    <hr><button class="mi red" data-act="signOut">${icon("logout", 18)}${t("settings.signOut")}</button>`),
  deleteAccount: async () => {
    const pw = await askInput(t("settings.deleteAccount"), t("settings.deleteAccountMsg"), { type: "password", placeholder: t("auth.password"), ok: t("common.delete"), destructive: true });
    if (!pw) return;
    try { await api("DELETE", "/me", { password: pw }); closeSheet(); hooks.signedOut(t("toast.accountDeleted")); } catch (e) { fail(e); }
  }
};
export { PALETTE };
