import { scrypt, randomBytes, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { db } from "../db.js";

/* ---------- errors ---------- */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.statusCode = status;
    this.code = code;
  }
}
export const bad = (code, message) => new HttpError(400, code, message);
export const notFound = () => new HttpError(404, "not_found", "Not found");
export const forbidden = () => new HttpError(403, "forbidden", "You do not have permission");

/* ---------- ids & passwords ---------- */
export const uuid = () => randomUUID();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = v => typeof v === "string" && UUID_RE.test(v);
const scryptP = (pw, salt) => new Promise((res, rej) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptP(pw, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored || "").split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const key = await scryptP(pw, Buffer.from(s, "base64"));
  const hb = Buffer.from(h, "base64");
  return hb.length === key.length && timingSafeEqual(hb, key);
}
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = s => createHash("sha256").update(s).digest("hex");
export const normEmail = e => String(e || "").trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- enums (shared with the web client) ---------- */
export const ENUMS = {
  color: ["blue", "indigo", "violet", "purple", "pink", "red", "orange", "yellow", "green", "teal", "gray"],
  taskStatus: ["todo", "doing", "waiting", "review", "approved", "done"],
  priority: ["high", "med", "low"],
  campaignStatus: ["draft", "planned", "live", "paused", "done"],
  objective: ["awareness", "consideration", "conversion", "retention", "sellin"],
  collabStatus: ["shortlist", "contacted", "negotiating", "confirmed", "shipped", "content", "posted", "completed", "declined"],
  dealType: ["paid", "barter", "affiliate", "free"],
  platform: ["tiktok", "instagram", "facebook", "youtube", "x", "lemon8", "other"],
  tier: ["Mega", "Macro", "Micro", "Nano"],
  role: ["owner", "admin", "editor", "viewer"],
  partnerKind: ["supplier", "agency", "customer", "retailer", "media", "other"],
  contractStatus: ["draft", "active", "expired", "terminated"],
  moveKind: ["in", "return", "out", "sample", "damaged"],
  expenseKind: ["purchase", "expense", "creator_fee", "ads", "travel", "other"],
  expenseStatus: ["draft", "pending", "approved", "rejected", "paid"]
};
// stock direction per move kind
export const MOVE_SIGN = { in: 1, return: 1, out: -1, sample: -1, damaged: -1 };
// guest = only sees the projects shared with them (project_members); never passes a workspace-level check
export const ROLE_RANK = { guest: 0, viewer: 1, editor: 2, admin: 3, owner: 4 };
export const SHARE_ROLES = ["editor", "viewer"];

/* ---------- validation ---------- */
export function clean(schema, body, { partial = false } = {}) {
  const out = {};
  body = body && typeof body === "object" ? body : {};
  for (const [k, f] of Object.entries(schema)) {
    if (!(k in body)) {
      if (!partial && f.req) throw bad("validation", `${k} is required`);
      continue;
    }
    let v = body[k];
    if (typeof v === "string" && f.t !== "text") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (f.req) throw bad("validation", `${k} is required`);
      out[k] = f.t === "bool" ? (f.def ?? false) : f.t === "json" || f.t === "members" ? JSON.stringify(f.def ?? []) : null;
      continue;
    }
    switch (f.t) {
      case "text":
        v = String(v);
        if (f.req && !v.trim()) throw bad("validation", `${k} is required`);
        if (v.length > (f.max || 10000)) throw bad("validation", `${k} is too long`);
        break;
      case "enum":
        if (!f.v.includes(v)) throw bad("validation", `${k} is invalid`);
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad("validation", `${k} must be a date`);
        break;
      case "int":
        v = Math.round(Number(String(v).replace(/,/g, "")));
        if (!Number.isFinite(v) || v < 0 || v > 9e15) throw bad("validation", `${k} must be a number`);
        break;
      case "num":
        v = Number(String(v).replace(/,/g, ""));
        if (!Number.isFinite(v) || v < 0 || v > 1e12) throw bad("validation", `${k} must be a number`);
        break;
      case "bool":
        v = v === true || v === "true" || v === "on" || v === 1 || v === "1";
        break;
      case "url":
        try {
          const u = new URL(String(v));
          if (!["http:", "https:"].includes(u.protocol)) throw 0;
          v = u.href;
        } catch {
          throw bad("validation", `${k} must be an http(s) link`);
        }
        break;
      case "json":
        if (typeof v !== "object") throw bad("validation", `${k} must be a list`);
        v = JSON.stringify(v);
        if (v.length > 200000) throw bad("validation", `${k} is too large`);
        break;
      case "time":
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad("validation", `${k} must be a time (HH:MM)`);
        break;
      case "email":
        v = normEmail(v);
        if (!EMAIL_RE.test(v)) throw bad("email_invalid", "Please enter a valid email");
        break;
      case "members":
        if (!Array.isArray(v) || v.length > 100 || !v.every(isUuid)) throw bad("validation", `${k} is invalid`);
        v = JSON.stringify([...new Set(v)]);
        break;
      case "ref":
      case "member":
        if (!isUuid(v)) throw bad("validation", `${k} is invalid`);
        break;
      default:
        break;
    }
    out[k] = v;
  }
  return out;
}

/* ---------- workspace access ---------- */
// { guest: true } lets project guests through; the caller must then check per-project rights (guestProjects).
export async function access(req, wid, minRole = "viewer", { guest = false } = {}) {
  if (!req.user) throw new HttpError(401, "unauthorized", "Please sign in");
  if (!isUuid(wid)) throw notFound();
  const { rows } = await db.query("select role from memberships where workspace_id=$1 and user_id=$2", [wid, req.user.id]);
  if (!rows.length) throw notFound();
  if (rows[0].role === "guest" && guest) return "guest";
  if (ROLE_RANK[rows[0].role] < ROLE_RANK[minRole]) throw forbidden();
  return rows[0].role;
}

/** Projects shared with a guest in this workspace: Map(project_id -> "editor" | "viewer") */
export async function guestProjects(wid, userId, q = db) {
  const { rows } = await q.query("select project_id, role from project_members where workspace_id=$1 and user_id=$2", [wid, userId]);
  return new Map(rows.map(r => [r.project_id, r.role]));
}

/** Throws unless a guest may write to this project (shared with them as editor). */
export function guestCanWrite(shares, projectId) {
  if (!projectId || shares.get(projectId) !== "editor") throw forbidden();
}

/** A guest whose last shared project in a workspace is gone no longer belongs to that workspace. */
export async function pruneGuests(q, wid) {
  await q.query(`delete from memberships m where m.workspace_id=$1 and m.role='guest'
                 and not exists (select 1 from project_members p where p.workspace_id=m.workspace_id and p.user_id=m.user_id)`, [wid]);
}

export async function touch(q, wid, userId, action, entity, entityId, label) {
  const { rows } = await q.query("update workspaces set rev = rev + 1 where id=$1 returning rev", [wid]);
  await q.query("insert into activity (workspace_id, user_id, action, entity, entity_id, label) values ($1,$2,$3,$4,$5,$6)",
    [wid, userId, action, entity, entityId || null, label ? String(label).slice(0, 200) : null]);
  return rows[0]?.rev;
}
