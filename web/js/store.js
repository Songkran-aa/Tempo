import { api, ApiError } from "./api.js";
import { S, isLaunchMs, widOf } from "./core.js";
import { t } from "./i18n.js";

/* hooks set by app.js to avoid circular imports */
export const hooks = { render: () => {}, island: () => {}, onUnauthorized: () => {} };

// every record is saved to its owner's account: mine, or the owner of a project shared with me
const W = (wid = S.wid) => `/w/${wid}`;
const list = res => S.data[res];

export function errText(e) {
  if (e instanceof ApiError) {
    if (e.status === 401) { hooks.onUnauthorized(); return t("err.unauthorized"); }
    const k = `err.${e.code}`;
    const msg = t(k);
    return msg === k ? e.message || t("err.generic") : msg;
  }
  return e?.message || t("err.generic");
}
export function fail(e) { hooks.island(errText(e), "alert", "red"); }

function setRev(r, wid = S.wid) { if (r?.rev && S.data && wid === S.wid) S.data.workspace.rev = r.rev; }

export async function loadMe() {
  const r = await api("GET", "/me");
  S.user = r.user; S.workspaces = r.workspaces;
  return r;
}

// One account = one place: my own data, plus every project someone shared with me merged in next to it.
export async function loadWorkspace(wid) {
  const [data, shared] = await Promise.all([api("GET", `/w/${wid}/bootstrap`), api("GET", "/shared").catch(() => ({ items: [] }))]);
  data.myShares = {}; data.sharedFrom = {}; data.membersByWs = { [wid]: data.members };
  for (const sh of shared.items) {
    for (const k of ["projects", "tasks", "campaigns", "collaborations", "projectShares"]) data[k] = [...data[k], ...sh[k]];
    Object.assign(data.myShares, sh.myShares);
    data.sharedFrom[sh.wid] = sh.owner_name || "";
    data.membersByWs[sh.wid] = sh.members;
    for (const m of sh.members) if (!data.members.some(x => x.user_id === m.user_id)) data.members = [...data.members, { ...m, role: "guest" }];
  }
  S.sharedRev = null;
  S.wid = wid;
  S.data = data;
  try { localStorage.setItem("pf.wid", wid); } catch {}
  return data;
}

export async function reload() {
  if (!S.wid) return;
  try { await loadWorkspace(S.wid); hooks.render(); } catch (e) { fail(e); }
}

/* optimistic CRUD */
export async function create(res, item) {
  list(res).push(item);
  hooks.render();
  try {
    const wid = widOf(item);
    const r = await api("POST", `${W(wid)}/${res}`, strip(item));
    Object.assign(item, r.item);
    setRev(r, wid);
    hooks.render();
    return item;
  } catch (e) {
    S.data[res] = list(res).filter(x => x !== item);
    hooks.render();
    throw e;
  }
}

export async function update(res, id, patch, { silent = false } = {}) {
  const it = list(res)?.find(x => x.id === id);
  const before = it ? { ...it } : null;
  if (it) Object.assign(it, patch);
  if (!silent) hooks.render();
  try {
    const wid = widOf(before || {});
    const r = await api("PATCH", `${W(wid)}/${res}/${id}`, strip(patch));
    if (it) Object.assign(it, r.item);
    setRev(r, wid);
    if (!silent) hooks.render();
    return r.item;
  } catch (e) {
    if (it && before) Object.assign(it, before);
    hooks.render();
    throw e;
  }
}

export async function destroy(res, id) {
  const before = list(res);
  const wid = widOf(before.find(x => x.id === id) || {});
  S.data[res] = before.filter(x => x.id !== id);
  hooks.render();
  try {
    const r = await api("DELETE", `${W(wid)}/${res}/${id}`);
    setRev(r, wid);
    if (res === "projects") await reload(); // cascades to tasks/campaigns server-side
  } catch (e) {
    S.data[res] = before;
    hooks.render();
    throw e;
  }
}

// Send only server fields (drop joined/display fields)
const DROP = new Set(["created_at", "updated_at", "created_by", "workspace_id", "influencer_name", "influencer_tier", "influencer_followers", "influencer_type", "influencer_blacklisted", "campaign_name", "on_hand"]);
function strip(o) { const out = {}; for (const [k, v] of Object.entries(o)) if (!DROP.has(k)) out[k] = v; return out; }

/* project inline edits: debounced PATCH of a json column */
const pending = new Map();
export function saveProjectField(p, field) {
  const key = p.id + field;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    const patch = { [field]: p[field] };
    if (field === "milestones") { const m = p.milestones.find(isLaunchMs); if (m) patch.launch_date = m.date || null; }
    update("projects", p.id, patch, { silent: true }).catch(fail);
  }, 600));
}
export const hasPendingWrites = () => pending.size > 0;

/* live sync: poll the workspace revision */
let pollTimer = null;
export function startSync(shouldPause) {
  stopSync();
  const tick = async () => {
    if (!S.wid || document.hidden || shouldPause() || hasPendingWrites()) return;
    try {
      const { rev, sharedRev, unread } = await api("GET", `${W()}/rev`);
      setUnread(unread);
      if (!S.online) { S.online = true; hooks.render(); }
      const sharedMoved = S.sharedRev != null && sharedRev !== S.sharedRev;
      S.sharedRev = sharedRev;
      if (S.data && (rev !== S.data.workspace.rev || sharedMoved)) await reload();
    } catch (e) {
      if (e.code === "network" && S.online) { S.online = false; hooks.render(); }
      if (e.status === 401) hooks.onUnauthorized();
    }
  };
  pollTimer = setInterval(tick, 15000);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", tick);
  function onVis() { if (!document.hidden) tick(); }
  startSync.cleanup = () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", tick); };
}
export function setUnread(n) {
  if (typeof n !== "number" || n === S.unread) return;
  S.unread = n;
  hooks.renderBell?.();
}
export async function refreshUnread() {
  try { const r = await api("GET", `${W()}/rev`); setUnread(r.unread); } catch {}
}
export function stopSync() { clearInterval(pollTimer); startSync.cleanup?.(); }
