// Run: npm test   (uses an in-memory PGlite database)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initDb } from "../db.js";
import { migrate } from "../migrate.js";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { parseInfluencerWorkbook } from "../lib/influencer-xlsx.js";
import { SAMPLE, sampleInfluencerXlsx } from "./fixtures/sample-influencers.js";

const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

let app;
const H = { "x-requested-with": "tempo" };
const jar = {};
async function call(who, method, url, body, remoteAddress) {
  const res = await app.inject({ method, url, payload: body, remoteAddress, headers: { ...H, ...(jar[who] ? { cookie: jar[who] } : {}) } });
  const set = res.headers["set-cookie"];
  if (set) jar[who] = [].concat(set).map(c => c.split(";")[0]).join("; ");
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

before(async () => {
  await initDb({ memory: true });
  await migrate(() => {});
  app = await buildApp({ logger: false });
});
after(async () => { await app.close(); await db.close(); });

test("auth: register, me, login, wrong password, csrf", async () => {
  let r = await call("a", "POST", "/api/auth/register", { name: "Alice", email: "Alice@Example.com", password: "password123", lang: "en" });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, "alice@example.com");
  assert.equal(r.body.workspaces.length, 1);
  r = await call("a", "GET", "/api/me");
  assert.equal(r.body.user.name, "Alice");
  r = await call("x", "POST", "/api/auth/login", { email: "alice@example.com", password: "nope-nope" });
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "invalid_credentials");
  r = await call("a", "POST", "/api/auth/register", { name: "A2", email: "alice@example.com", password: "password123" });
  assert.equal(r.status, 409);
  const res = await app.inject({ method: "POST", url: "/api/workspaces", payload: { name: "x" }, headers: { cookie: jar.a } });
  assert.equal(res.statusCode, 403, "mutations without the CSRF header are rejected");
  r = await call("anon", "GET", "/api/me");
  assert.equal(r.status, 401);
});

test("workspace data, permissions and invites", async () => {
  const me = await call("a", "GET", "/api/me");
  const wid = me.body.workspaces[0].id;
  let r = await call("a", "POST", `/api/w/${wid}/projects`, { name: "Launch", color: "blue", milestones: [{ id: "m1", label: "Kick-off", date: "2027-01-10" }] });
  assert.equal(r.status, 200);
  const pid = r.body.item.id;
  assert.ok(r.body.rev > 1);
  r = await call("a", "POST", `/api/w/${wid}/tasks`, { title: "Write brief", project_id: pid, due_date: "2027-01-05", status: "doing" });
  assert.equal(r.status, 200);
  r = await call("a", "POST", `/api/w/${wid}/tasks`, { title: "Bad", status: "nope" });
  assert.equal(r.status, 400);
  r = await call("a", "POST", `/api/w/${wid}/campaigns`, { name: "C", start_date: "2027-02-01", end_date: "2027-01-01" });
  assert.equal(r.body.code, "date_order");

  // invite Bob before he has an account -> joins on sign-up as viewer
  r = await call("a", "POST", `/api/w/${wid}/invites`, { email: "bob@example.com", role: "viewer" });
  assert.equal(r.body.invited, true);
  r = await call("b", "POST", "/api/auth/register", { name: "Bob", email: "bob@example.com", password: "password123" });
  // everyone gets a space of their own first; the invited one comes after it
  assert.equal(r.body.workspaces[0].personal, true); assert.equal(r.body.workspaces[0].role, "owner");
  assert.equal(r.body.workspaces[1].id, wid);
  r = await call("b", "POST", `/api/w/${wid}/tasks`, { title: "Viewer cannot write" });
  assert.equal(r.status, 403);
  r = await call("b", "GET", `/api/w/${wid}/bootstrap`);
  assert.equal(r.body.tasks.length, 1);
  assert.equal(r.body.members.length, 2);

  // a stranger cannot see the workspace
  await call("c", "POST", "/api/auth/register", { name: "Carol", email: "carol@example.com", password: "password123" });
  r = await call("c", "GET", `/api/w/${wid}/bootstrap`);
  assert.equal(r.status, 404);
});

test("influencer xlsx import, search, collaboration", async () => {
  const me = await call("a", "GET", "/api/me");
  const wid = me.body.workspaces[0].id;
  const xlsx = await sampleInfluencerXlsx();
  const boundary = "----pf" + Date.now();
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Influencer_Database_Master.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    xlsx, Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const res = await app.inject({ method: "POST", url: `/api/w/${wid}/influencers/import`, payload, headers: { ...H, cookie: jar.a, "content-type": `multipart/form-data; boundary=${boundary}` } });
  const out = JSON.parse(res.body);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(out.total, SAMPLE.total);
  assert.equal(out.blacklisted, SAMPLE.blacklisted);
  // second import merges, does not duplicate
  const res2 = await app.inject({ method: "POST", url: `/api/w/${wid}/influencers/import`, payload, headers: { ...H, cookie: jar.a, "content-type": `multipart/form-data; boundary=${boundary}` } });
  assert.equal(JSON.parse(res2.body).created, 0);

  let r = await call("a", "GET", `/api/w/${wid}/influencers?type=${encodeURIComponent(SAMPLE.mainNiche)}&size=5`);
  assert.equal(r.body.items.length, 5);
  assert.ok(r.body.items[0].followers_max >= r.body.items[4].followers_max);
  assert.equal(r.body.total, SAMPLE.main - SAMPLE.mainBlacklisted, "main niche minus blacklisted");
  r = await call("a", "GET", `/api/w/${wid}/influencers?q=${SAMPLE.star.name}`);
  assert.equal(r.body.items[0].code, SAMPLE.star.code);
  assert.ok(r.body.items[0].followers_max > 1000000);
  const infId = r.body.items[0].id;
  r = await call("a", "POST", `/api/w/${wid}/collaborations`, { influencer_id: infId, status: "contacted", fee: "3,500", platform: "tiktok" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.item.fee, 3500);
  r = await call("a", "GET", `/api/w/${wid}/influencers/${infId}`);
  assert.equal(r.body.collaborations.length, 1);
  // likes stored in date-formatted cells beyond the date range (194.6M) must survive; all 27 columns kept
  assert.equal(r.body.item.likes_total, SAMPLE.star.likes);
  assert.ok(r.body.item.type_source);
  assert.ok(r.body.item.merged_count >= 1);
  const x = await app.inject({ method: "GET", url: `/api/w/${wid}/influencers/export.xlsx`, headers: { cookie: jar.a } });
  assert.equal(x.statusCode, 200);
  assert.ok(x.rawPayload.length > 10000);
  // export -> re-parse round-trips the data
  const back = (await parseInfluencerWorkbook(x.rawPayload)).rows;
  const orig = (await parseInfluencerWorkbook(xlsx)).rows;
  assert.equal(back.length, SAMPLE.total);
  for (const k of ["type_source", "merged_count", "likes_total", "followers_max", "address", "blacklist_reason", "legacy_code"]) {
    assert.equal(back.filter(p => p[k] != null).length, orig.filter(p => p[k] != null).length, k);
  }
  // the old one-box "Contact" text is split into LINE / phone / email on import — nobody loses a contact
  const anyContact = p => p.contact != null || p.contact_line != null || p.contact_phone != null || p.contact_email != null;
  assert.equal(back.filter(anyContact).length, orig.filter(p => p.contact != null).length, "contact");
  assert.ok(back.filter(p => p.contact_line != null).length > 100, "LINE ids split out");
});

test("auth: first / last name", async () => {
  let r = await call("f", "POST", "/api/auth/register", { first_name: "สมชาย", last_name: "", email: "f@example.com", password: "password123" });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "last_name_required");
  r = await call("f", "POST", "/api/auth/register", { first_name: " สมชาย ", last_name: "ใจดี", email: "f@example.com", password: "password123" });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.user.first_name, r.body.user.last_name, r.body.user.name], ["สมชาย", "ใจดี", "สมชาย ใจดี"]);
  r = await call("f", "PATCH", "/api/me", { last_name: "รักงาน" });
  assert.equal(r.body.user.name, "สมชาย รักงาน");
  r = await call("f", "PATCH", "/api/me", { first_name: "" });
  assert.equal(r.body.code, "first_name_required");
  r = await call("a", "GET", "/api/me");
  assert.deepEqual([r.body.user.first_name, r.body.user.last_name], ["Alice", ""], "legacy single-name sign-up still works");
});

test("project bundle import (JSON bundle) is complete and idempotent", async () => {
  const { importProjectBundle } = await import("../lib/project-import.js");
  const bundle = JSON.parse(fs.readFileSync(fixture("sample-bundle.json"), "utf8"));
  const me = await call("a", "GET", "/api/me");
  const wid = me.body.workspaces[0].id, uid = me.body.user.id;
  const r1 = await db.tx(q => importProjectBundle(q, wid, uid, bundle));
  assert.deepEqual([r1.projects, r1.tasks], [2, 9]);
  const r2 = await db.tx(q => importProjectBundle(q, wid, uid, bundle));
  assert.deepEqual([r2.projects, r2.tasks, r2.skipped], [0, 0, 11], "second run adds nothing");
  const b = (await call("a", "GET", `/api/w/${wid}/bootstrap`)).body;
  const sample = b.projects.find(p => p.name === "Sample Product A");
  assert.equal(sample.brief.length, 11);
  assert.equal(sample.milestones.length, 7);
  assert.equal(sample.checklist.length, 10);
  assert.equal(sample.milestones.find(m => m.key === "launch").label, "วันเปิดตัว");
  const t = b.tasks.find(x => x.title === "ต้นทุนและราคา");
  assert.deepEqual([t.status, t.category, t.team, t.next_step], ["waiting", "ต้นทุนและราคา", "Purchasing", "ขอราคาต้นทุนต่อชิ้นและวันสรุปการเจรจา"]);
  assert.match(t.notes, /ราคาอยู่ระหว่างเจรจา/);
  assert.equal(b.tasks.filter(x => bundle.projects.some(p => p.tasks.some(y => y.title === x.title))).length, 9);
});

test("product tracker CSV import: parse, upsert by ID, create projects", async () => {
  const { parseCsv, parseDate, parseTrackerCsv } = await import("../lib/tracker-csv.js");
  assert.deepEqual(parseCsv('\uFEFF"a","b ""q""",c\r\n"multi\nline",,x\n'), [["a", 'b "q"', "c"], ["multi\nline", "", "x"]]);
  assert.equal(parseDate("15/03/2570"), "2027-03-15");
  assert.equal(parseDate("2027-02-30"), null);
  const csv = Buffer.from('"ID","โปรเจกต์","งานที่ต้องทำ","สถานะ","ผู้ประสานงาน"\n"original-4","Sample Product A","ต้นทุนและราคา","รอตรวจสอบ","Purchasing"\n');
  const n = parseTrackerCsv(csv.toString("utf8")).rows.length;
  const up = async (who, wid, preview = "") => {
    const boundary = "----pf" + Math.random();
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tracker.csv"\r\nContent-Type: text/csv\r\n\r\n`), csv, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const res = await app.inject({ method: "POST", url: `/api/w/${wid}/tasks/import${preview}`, payload, headers: { ...H, cookie: jar[who], "content-type": `multipart/form-data; boundary=${boundary}` } });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  };
  // workspace that already has the JSON bundle -> everything matches, nothing duplicated
  const me = await call("a", "GET", "/api/me");
  const wid = me.body.workspaces[0].id;
  let r = await up("a", wid, "?preview=1");
  assert.equal(r.body.total, n);
  r = await up("a", wid);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.created, r.body.projectsCreated], [0, 0]);
  assert.equal(r.body.updated, n);
  // fresh workspace -> creates projects and tasks; second run only updates
  const w2 = (await call("a", "POST", "/api/workspaces", { name: "Tracker test" })).body.id;
  r = await up("a", w2);
  assert.equal(r.body.created, n);
  assert.ok(r.body.projectsCreated >= 1);
  r = await up("a", w2);
  assert.deepEqual([r.body.created, r.body.updated, r.body.projectsCreated], [0, n, 0]);
  const b = (await call("a", "GET", `/api/w/${w2}/bootstrap`)).body;
  const t = b.tasks.find(x => x.external_id === "original-4");
  assert.deepEqual([t.title, t.status, t.team, t.category], ["ต้นทุนและราคา", "waiting", "Purchasing", null]);
  assert.equal(b.projects.find(p => p.id === t.project_id).brief.length, 11);
});

test("Tempo workspace file: export -> import round-trips everything, re-import never duplicates", async () => {
  const { parseWorkspaceWorkbook } = await import("../lib/workspace-xlsx.js");
  const me = await call("a", "GET", "/api/me");
  const wid = me.body.workspaces[0].id;
  // add a campaign (with decimals) + a collaboration linked to it so every sheet has data
  let b = (await call("a", "GET", `/api/w/${wid}/bootstrap`)).body;
  const camp = (await call("a", "POST", `/api/w/${wid}/campaigns`, { name: "Launch wave 1", project_id: b.projects[0].id, status: "planned", objective: "awareness", budget: 125000.5, start_date: "2027-01-10", end_date: "2027-02-10" })).body.item;
  const inf = (await call("a", "GET", `/api/w/${wid}/influencers?q=${SAMPLE.star.name}`)).body.items[0];
  await call("a", "POST", `/api/w/${wid}/collaborations`, { influencer_id: inf.id, campaign_id: camp.id, status: "confirmed", fee: 4500, post_date: "2027-01-20",
    pic: "Hunter Sam", source: "Kalodata", lead_status: "ทำสัญญาแล้ว", contract: true, affiliate_link_sent: true, brief_sent: false, tracking_number: "TH123", shipping_status: "ได้รับแล้ว",
    drafts: [{ id: "d1", label: "Draft 1", link: "", qc: true }], posts: [{ id: "p1", date: "2027-01-20", posted: true, url: "https://vt.tiktok.com/abc/" }, { id: "p2", date: "", posted: true, url: "https://vt.tiktok.com/def/" }],
    followups: [{ id: "f1", label: "ติดตาม 12 ชม.", at: "2027-01-10 10:00", done: true }] });

  const download = async w => (await app.inject({ method: "GET", url: `/api/w/${w}/export.xlsx`, headers: { cookie: jar.a } })).rawPayload;
  const upload = async (w, buf, preview = "") => {
    const boundary = "----pf" + Math.random();
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ws.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`), buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const res = await app.inject({ method: "POST", url: `/api/w/${w}/import${preview}`, payload, headers: { ...H, cookie: jar.a, "content-type": `multipart/form-data; boundary=${boundary}` } });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  };
  const file1 = await download(wid);
  const p1 = await parseWorkspaceWorkbook(file1);
  b = (await call("a", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(p1.counts.projects, b.projects.length);
  assert.equal(p1.counts.tasks, b.tasks.length);
  assert.equal(p1.counts.collaborations, b.collaborations.length);
  assert.equal(p1.counts.influencers, b.influencerStats.total);

  // same workspace: nothing new
  let r = await upload(wid, file1);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.created, {}, JSON.stringify(r.body.created));
  assert.deepEqual(r.body.warnings, []);

  // brand-new workspace: everything is created, then a second import only updates
  const w2 = (await call("a", "POST", "/api/workspaces", { name: "Round trip" })).body.id;
  r = await upload(w2, file1, "?preview=1");
  assert.equal(r.body.counts.tasks, b.tasks.length);
  r = await upload(w2, file1);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.created.projects, b.projects.length);
  assert.equal(r.body.created.tasks, b.tasks.length);
  r = await upload(w2, file1);
  assert.deepEqual(r.body.created, {}, "second import creates nothing");

  // compare the two workspaces through their exports
  const p2 = await parseWorkspaceWorkbook(await download(w2));
  const strip = rows => rows.map(({ _row, key, project, campaign, ...rest }) => JSON.stringify(rest)).sort();
  for (const k of ["projects", "milestones", "readiness", "brief", "tasks", "campaigns", "collaborations"]) {
    assert.deepEqual(strip(p2.sheets[k]), strip(p1.sheets[k]), k);
  }
  assert.equal(p2.influencers.length, p1.influencers.length);
  for (const f of ["likes_total", "contact", "address", "type_source", "merged_count", "blacklist_reason", "pet_type", "tier"]) {
    assert.equal(p2.influencers.filter(x => x[f] != null).length, p1.influencers.filter(x => x[f] != null).length, f);
  }
  const col2 = p2.sheets.collaborations.find(c => c.pic === "Hunter Sam");
  assert.ok(col2, "collaboration workflow fields survive");
  const back = (await call("a", "GET", `/api/w/${w2}/bootstrap`)).body.collaborations.find(c => c.pic === "Hunter Sam");
  assert.deepEqual(back.posts.map(p => [p.date, p.posted, p.url]), [["2027-01-20", true, "https://vt.tiktok.com/abc/"], ["", true, "https://vt.tiktok.com/def/"]]);
  assert.deepEqual([back.contract, back.affiliate_link_sent, back.brief_sent, back.tracking_number, back.drafts[0].qc, back.followups[0].at], [true, true, false, "TH123", true, "2027-01-10 10:00"]);
  const c2 = p2.sheets.campaigns.find(c => c.name === "Launch wave 1");
  assert.equal(Number(c2.budget), 125000.5);
  const sample = (await call("a", "GET", `/api/w/${w2}/bootstrap`)).body.projects.find(p => p.name === "Sample Product A");
  assert.equal(sample.brief.find(x => x.label === "Brand Territory").value, "พัฒนา Brand Territory / Framework ให้ชัดและสื่อความคุ้มค่า");

  // a non-Tempo workbook is rejected
  assert.equal((await upload(w2, await sampleInfluencerXlsx())).body.code, "not_workspace_file");
});

test("closed sign-up: only invited emails can register", async () => {
  const before = config.allowSignup;
  config.allowSignup = false;
  try {
    let r = await call("x1", "POST", "/api/auth/register", { first_name: "No", last_name: "Invite", email: "noinvite@example.com", password: "password123" });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "signup_disabled");
    const wid = (await call("a", "GET", "/api/me")).body.workspaces[0].id;
    await call("a", "POST", `/api/w/${wid}/invites`, { email: "invited@example.com", role: "editor" });
    r = await call("x2", "POST", "/api/auth/register", { first_name: "Yes", last_name: "Invited", email: "invited@example.com", password: "password123" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.workspaces.some(w => w.id === wid), "joined the inviting workspace");
  } finally { config.allowSignup = before; }
});

test("project sharing: guest sees only shared projects, editor/viewer rights, unshare and leave", async () => {
  // separate client IP: sign-up is rate limited per IP and earlier tests used the quota
  const reg = (who, name, email) => call(who, "POST", "/api/auth/register", { name, email, password: "password123" }, "10.9.9.9");
  await reg("own", "Owner Olive", "olive@example.com");
  await reg("g", "Guest Gus", "gus@example.com");
  await reg("v", "Viewer Vic", "vic@example.com");
  const wid = (await call("own", "GET", "/api/me")).body.workspaces[0].id;
  const pA = (await call("own", "POST", `/api/w/${wid}/projects`, { name: "Shared A" })).body.item.id;
  const pB = (await call("own", "POST", `/api/w/${wid}/projects`, { name: "Private B" })).body.item.id;
  const tA = (await call("own", "POST", `/api/w/${wid}/tasks`, { title: "task in A", project_id: pA })).body.item.id;
  const tB = (await call("own", "POST", `/api/w/${wid}/tasks`, { title: "task in B", project_id: pB })).body.item.id;

  // the directory lists registered accounts (not yourself)
  let r = await call("own", "GET", "/api/users?q=gus");
  assert.deepEqual(r.body.users.map(u => u.email), ["gus@example.com"]);
  assert.equal((await call("anon2", "GET", "/api/users")).status, 401);

  // an email without an account waits as a project invite (listed for the owner, removable)
  r = await call("own", "POST", `/api/w/${wid}/projects/${pA}/shares`, { email: "nobody@example.com" });
  assert.equal(r.status, 200); assert.equal(r.body.invited, true);
  let inv = (await call("own", "GET", `/api/w/${wid}/bootstrap`)).body.shareInvites;
  assert.deepEqual(inv.map(i => [i.project_id, i.email]), [[pA, "nobody@example.com"]]);
  r = await call("own", "DELETE", `/api/w/${wid}/projects/${pA}/invites/${inv[0].id}`);
  assert.equal(r.status, 200);
  assert.equal((await call("own", "GET", `/api/w/${wid}/bootstrap`)).body.shareInvites.length, 0);
  r = await call("own", "POST", `/api/w/${wid}/projects/${pA}/shares`, { email: "gus@example.com", role: "editor" });
  assert.equal(r.status, 200);
  await call("own", "POST", `/api/w/${wid}/projects/${pA}/shares`, { email: "vic@example.com", role: "viewer" });

  // the shared workspace shows up for the guest, with only project A in it
  const ws = (await call("g", "GET", "/api/me")).body.workspaces.find(w => w.id === wid);
  assert.equal(ws.role, "guest");
  let b = (await call("g", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(b.role, "guest");
  assert.deepEqual(b.projects.map(p => p.id), [pA]);
  assert.deepEqual(b.tasks.map(t => t.id), [tA]);
  assert.equal(b.myShares[pA], "editor");
  assert.equal(b.invites.length, 0);
  assert.equal(b.projectShares.length, 2);
  r = await call("g", "GET", `/api/w/${wid}/tasks`);
  assert.deepEqual(r.body.items.map(t => t.id), [tA]);

  // editor guest: can work inside A, cannot touch B or workspace-wide things
  assert.equal((await call("g", "PATCH", `/api/w/${wid}/tasks/${tA}`, { status: "done" })).status, 200);
  assert.equal((await call("g", "POST", `/api/w/${wid}/tasks`, { title: "new in A", project_id: pA })).status, 200);
  assert.equal((await call("g", "POST", `/api/w/${wid}/tasks`, { title: "no project" })).status, 403);
  assert.equal((await call("g", "PATCH", `/api/w/${wid}/tasks/${tB}`, { status: "done" })).status, 404);
  assert.equal((await call("g", "PATCH", `/api/w/${wid}/tasks/${tA}`, { project_id: pB })).status, 403, "cannot move a task out to a project not shared");
  assert.equal((await call("g", "PATCH", `/api/w/${wid}/projects/${pA}`, { description: "edited by guest" })).status, 200);
  assert.equal((await call("g", "DELETE", `/api/w/${wid}/projects/${pA}`)).status, 403);
  assert.equal((await call("g", "POST", `/api/w/${wid}/projects`, { name: "x" })).status, 403);
  assert.equal((await call("g", "GET", `/api/w/${wid}/influencers`)).status, 403);
  assert.equal((await call("g", "GET", `/api/w/${wid}/export.xlsx`)).status, 403);
  assert.equal((await call("g", "POST", `/api/w/${wid}/projects/${pA}/shares`, { email: "olive@example.com" })).status, 403, "guests cannot re-share");

  // viewer guest: read only
  assert.equal((await call("v", "PATCH", `/api/w/${wid}/tasks/${tA}`, { status: "todo" })).status, 403);
  assert.equal((await call("v", "GET", `/api/w/${wid}/bootstrap`)).body.myShares[pA], "viewer");
  r = await call("own", "PATCH", `/api/w/${wid}/projects/${pA}/shares/${b.projectShares.find(s => s.email === "vic@example.com").user_id}`, { role: "editor" });
  assert.equal(r.status, 200);
  assert.equal((await call("v", "PATCH", `/api/w/${wid}/tasks/${tA}`, { status: "todo" })).status, 200);

  // people a project is shared with can discuss it (even read-only viewers) — only inside the shared project
  assert.equal((await call("own", "PATCH", `/api/w/${wid}/projects/${pA}/shares/${b.projectShares.find(s => s.email === "vic@example.com").user_id}`, { role: "viewer" })).status, 200);
  r = await call("v", "POST", `/api/w/${wid}/comments`, { entity: "tasks", entity_id: tA, body: "viewer question @Owner Olive" });
  assert.equal(r.status, 200); assert.equal(r.body.mentioned, 1);
  assert.equal((await call("v", "POST", `/api/w/${wid}/comments`, { entity: "projects", entity_id: pA, body: "on the project" })).status, 200);
  assert.equal((await call("v", "POST", `/api/w/${wid}/comments`, { entity: "tasks", entity_id: tB, body: "not mine" })).status, 404);
  assert.equal((await call("v", "GET", `/api/w/${wid}/comments?entity=tasks&id=${tB}`)).status, 404);
  const seen = (await call("own", "GET", `/api/w/${wid}/comments?entity=tasks&id=${tA}`)).body.items;
  assert.deepEqual(seen.map(c => c.user_name), ["Viewer Vic"]);
  assert.equal((await call("own", "DELETE", `/api/w/${wid}/comments/${seen[0].id}`)).status, 200, "the owner (admin) can remove a guest's comment");

  // the guest's .ics feed carries the shared project's dated work, labelled with the project
  const due = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  await call("own", "POST", `/api/w/${wid}/tasks`, { title: "due soon in A", project_id: pA, due_date: due });
  await call("own", "POST", `/api/w/${wid}/tasks`, { title: "due soon in B", project_id: pB, due_date: due });
  const vtok = (await call("v", "POST", "/api/me/calendar")).body.token;
  const ics = (await app.inject({ method: "GET", url: `/api/cal/${vtok}.ics` })).payload;
  assert.match(ics, /due soon in A · Shared A/);
  assert.doesNotMatch(ics, /due soon in B/);

  // sharing with a full workspace member is pointless -> 409
  r = await call("own", "POST", `/api/w/${wid}/invites`, { email: "alice@example.com", role: "editor" });
  r = await call("own", "POST", `/api/w/${wid}/projects/${pA}/shares`, { email: "alice@example.com" });
  assert.equal(r.status, 409);

  // the guest leaves -> the workspace disappears from their list
  const gid = (await call("g", "GET", "/api/me")).body.user.id;
  assert.equal((await call("g", "DELETE", `/api/w/${wid}/projects/${pA}/shares/${gid}`)).status, 200);
  assert.ok(!(await call("g", "GET", "/api/me")).body.workspaces.some(w => w.id === wid));
  assert.equal((await call("g", "GET", `/api/w/${wid}/bootstrap`)).status, 404);

  // deleting the project removes the remaining guest too
  await call("own", "DELETE", `/api/w/${wid}/projects/${pA}`);
  assert.ok(!(await call("v", "GET", "/api/me")).body.workspaces.some(w => w.id === wid));
});

test("ERP: partners, contracts, stock, expense approvals, events, comments, notifications, calendar feed", async () => {
  const reg = (who, name, email) => call(who, "POST", "/api/auth/register", { name, email, password: "password123" }, "10.8.8.8");
  await reg("boss", "Boss Bee", "bee@example.com");
  await reg("staff", "Staff Sam", "sam@example.com");
  const wid = (await call("boss", "GET", "/api/me")).body.workspaces[0].id;
  const sam = (await call("staff", "GET", "/api/me")).body.user.id;
  const bee = (await call("boss", "GET", "/api/me")).body.user.id;
  // inviting an existing account adds them right away and notifies them
  let r = await call("boss", "POST", `/api/w/${wid}/invites`, { email: "sam@example.com", role: "editor" });
  assert.equal(r.body.added, true);
  r = await call("staff", "GET", "/api/notifications");
  assert.equal(r.body.items[0].kind, "invite");

  // CRM
  const partner = (await call("boss", "POST", `/api/w/${wid}/partners`, { name: "Acme Supplies", kind: "supplier", email: "Sales@Acme.example.com", owner_id: sam })).body.item;
  assert.equal(partner.email, "sales@acme.example.com");
  r = await call("boss", "POST", `/api/w/${wid}/partners`, { name: "Bad", email: "not-an-email" });
  assert.equal(r.body.code, "email_invalid");
  const contract = (await call("boss", "POST", `/api/w/${wid}/contracts`, { title: "Supply 2027", partner_id: partner.id, status: "active", value: 500000, start_date: "2027-01-01", end_date: "2027-12-31" })).body.item;
  assert.equal(contract.remind_days, 30);
  r = await call("boss", "POST", `/api/w/${wid}/contracts`, { title: "Backwards", start_date: "2027-02-01", end_date: "2027-01-01" });
  assert.equal(r.body.code, "date_order");

  // inventory: on-hand never goes below zero, low stock alerts owners/admins
  const prod = (await call("boss", "POST", `/api/w/${wid}/products`, { name: "Sample Snack", sku: "SN-01", reorder_level: 5, cost: 20, partner_id: partner.id })).body.item;
  assert.equal(prod.active, true);
  r = await call("boss", "POST", `/api/w/${wid}/products`, { name: "dup", sku: "SN-01" });
  assert.equal(r.status, 409);
  await call("staff", "POST", `/api/w/${wid}/stock_moves`, { product_id: prod.id, kind: "in", qty: 10, partner_id: partner.id });
  r = await call("staff", "POST", `/api/w/${wid}/stock_moves`, { product_id: prod.id, kind: "out", qty: 11 });
  assert.equal(r.body.code, "stock_negative");
  r = await call("staff", "POST", `/api/w/${wid}/stock_moves`, { product_id: prod.id, kind: "sample", qty: 6 });
  assert.equal(r.status, 200);
  let b = (await call("boss", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(b.products.find(p => p.id === prod.id).on_hand, 4);
  r = await call("boss", "GET", "/api/notifications");
  assert.ok(r.body.items.some(n => n.kind === "low_stock" && n.label === "Sample Snack"));
  const inMove = b.stock_moves.find(m => m.kind === "in");
  r = await call("boss", "DELETE", `/api/w/${wid}/stock_moves/${inMove.id}`);
  assert.equal(r.body.code, "stock_negative");

  // expenses: draft -> pending -> rejected -> pending -> approved -> paid; locked while waiting
  const exp = (await call("staff", "POST", `/api/w/${wid}/expenses`, { title: "Creator fees wave 1", amount: 45000, kind: "creator_fee", partner_id: partner.id, contract_id: contract.id })).body.item;
  assert.equal(exp.status, "draft");
  r = await call("staff", "POST", `/api/w/${wid}/expenses/${exp.id}/submit`, { approver_id: sam });
  assert.equal(r.body.code, "self_approval");
  r = await call("staff", "PATCH", `/api/w/${wid}/expenses/${exp.id}`, { status: "approved" });
  assert.equal(r.status, 400); // status is not a writable field
  r = await call("staff", "POST", `/api/w/${wid}/expenses/${exp.id}/submit`, { approver_id: bee });
  assert.equal(r.body.item.status, "pending");
  r = await call("staff", "PATCH", `/api/w/${wid}/expenses/${exp.id}`, { amount: 99999 });
  assert.equal(r.body.code, "expense_locked");
  r = await call("staff", "POST", `/api/w/${wid}/expenses/${exp.id}/decide`, { decision: "approve" });
  assert.equal(r.status, 403);
  r = await call("boss", "POST", `/api/w/${wid}/expenses/${exp.id}/decide`, { decision: "reject" });
  assert.equal(r.body.code, "reason_required");
  r = await call("boss", "POST", `/api/w/${wid}/expenses/${exp.id}/decide`, { decision: "reject", note: "Need the quotation" });
  assert.equal(r.body.item.status, "rejected");
  await call("staff", "PATCH", `/api/w/${wid}/expenses/${exp.id}`, { receipt_link: "https://example.com/quote.pdf" });
  await call("staff", "POST", `/api/w/${wid}/expenses/${exp.id}/submit`, { approver_id: bee });
  r = await call("boss", "POST", `/api/w/${wid}/expenses/${exp.id}/decide`, { decision: "approve" });
  assert.equal(r.body.item.status, "approved");
  r = await call("boss", "POST", `/api/w/${wid}/expenses/${exp.id}/pay`);
  assert.equal(r.body.item.status, "paid");
  const kinds = (await call("staff", "GET", "/api/notifications")).body.items.map(n => n.kind);
  for (const k of ["assigned", "rejected", "approved", "paid"]) assert.ok(kinds.includes(k), k);
  assert.ok((await call("boss", "GET", "/api/notifications")).body.items.some(n => n.kind === "approval_request"));

  // events notify attendees; only members can attend
  r = await call("boss", "POST", `/api/w/${wid}/events`, { title: "Supplier meeting", event_date: "2027-01-15", start_time: "10:00", end_time: "11:30", attendees: [sam, bee] });
  assert.equal(r.status, 200);
  const ev = r.body.item;
  assert.ok((await call("staff", "GET", "/api/notifications")).body.items.some(n => n.kind === "invited_event" && n.entity_id === ev.id));
  r = await call("boss", "POST", `/api/w/${wid}/events`, { title: "x", event_date: "2027-01-15", start_time: "25:00" });
  assert.equal(r.status, 400);

  // comments: @mention notifies, followers get "comment"; the unread count rides on /rev
  r = await call("boss", "POST", `/api/w/${wid}/comments`, { entity: "contracts", entity_id: contract.id, body: "@Staff Sam please check the renewal" });
  assert.equal(r.body.mentioned, 1);
  r = await call("boss", "GET", `/api/w/${wid}/comments?entity=contracts&id=${contract.id}`);
  assert.equal(r.body.items[0].user_name, "Boss Bee");
  r = await call("staff", "GET", `/api/w/${wid}/rev`);
  assert.ok(r.body.unread >= 5);
  r = await call("staff", "POST", "/api/notifications/read", { all: true });
  assert.equal(r.body.unread, 0);
  r = await call("boss", "POST", `/api/w/${wid}/comments`, { entity: "nope", entity_id: contract.id, body: "x" });
  assert.equal(r.status, 404);

  // calendar feed: token-protected .ics with events, contracts and campaigns
  const tok = (await call("boss", "POST", "/api/me/calendar")).body.token;
  const res = await app.inject({ method: "GET", url: `/api/cal/${tok}.ics` });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/calendar/);
  assert.match(res.body, /SUMMARY:Supplier meeting/);
  assert.match(res.body, /DTSTART;TZID=Asia\/Bangkok:20270115T100000/);
  assert.equal((await app.inject({ method: "GET", url: "/api/cal/wrong-token-wrong-token.ics" })).statusCode, 404);

  // a viewer cannot write ERP data
  await reg("view", "View Val", "val@example.com");
  await call("boss", "POST", `/api/w/${wid}/invites`, { email: "val@example.com", role: "viewer" });
  r = await call("view", "POST", `/api/w/${wid}/products`, { name: "nope" });
  assert.equal(r.status, 403);
});

test("workspace modules: off by default, admin toggles, unknown keys ignored, editors cannot", async () => {
  const reg = (who, name, email) => call(who, "POST", "/api/auth/register", { name, email, password: "password123" }, "10.9.9.9");
  await reg("modOwner", "Mod Owner", "modowner@example.com");
  await reg("modEd", "Mod Editor", "moded@example.com");
  const wid = (await call("modOwner", "GET", "/api/me")).body.workspaces[0].id;
  await call("modOwner", "POST", `/api/w/${wid}/invites`, { email: "moded@example.com", role: "editor" });
  let r = await call("modOwner", "GET", `/api/w/${wid}/bootstrap`);
  assert.deepEqual(r.body.workspace.modules, {});
  r = await call("modOwner", "PATCH", `/api/w/${wid}`, { modules: { inventory: true, hacked: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.modules, { inventory: true });
  r = await call("modOwner", "PATCH", `/api/w/${wid}`, { modules: { partners: 1 } });
  assert.deepEqual(r.body.modules, { inventory: true, partners: true });
  r = await call("modOwner", "GET", `/api/w/${wid}/bootstrap`);
  assert.equal(r.body.workspace.name.length > 0, true);
  assert.deepEqual(r.body.workspace.modules, { inventory: true, partners: true });
  r = await call("modEd", "PATCH", `/api/w/${wid}`, { modules: { inventory: false } });
  assert.equal(r.status, 403);
  r = await call("modOwner", "PATCH", `/api/w/${wid}`, {});
  assert.equal(r.status, 400);
});

test("structure: tasks may stand alone; collaborations and expenses follow their campaign's project", async () => {
  await call("structOwner", "POST", "/api/auth/register", { name: "Struct Owner", email: "structowner@example.com", password: "password123" }, "10.9.9.10");
  const wid = (await call("structOwner", "GET", "/api/me")).body.workspaces[0].id;
  const post = async (what, body) => { const r = await call("structOwner", "POST", `/api/w/${wid}/${what}`, body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.item; };
  const pA = await post("projects", { name: "Launch A" });
  const pB = await post("projects", { name: "Launch B" });

  // a task does not need a project, and can be moved into one later
  const task = await post("tasks", { title: "General admin" });
  assert.equal(task.project_id, null);
  let r = await call("structOwner", "PATCH", `/api/w/${wid}/tasks/${task.id}`, { project_id: pA.id });
  assert.equal(r.body.item.project_id, pA.id);

  // a collaboration / expense in a campaign takes the campaign's project, even if the client sends another one
  const camp = await post("campaigns", { name: "TikTok wave", project_id: pA.id });
  const inf = await post("influencers", { name: "struct_cat" });
  const collab = await post("collaborations", { influencer_id: inf.id, campaign_id: camp.id, project_id: pB.id });
  assert.equal(collab.project_id, pA.id);
  const exp = await post("expenses", { title: "Fee", amount: 1000, campaign_id: camp.id });
  assert.equal(exp.project_id, pA.id);
  r = await call("structOwner", "PATCH", `/api/w/${wid}/expenses/${exp.id}`, { project_id: pB.id });
  assert.equal(r.body.item.project_id, pA.id);

  // moving the campaign to another project carries its collaborations and expenses along
  await call("structOwner", "PATCH", `/api/w/${wid}/campaigns/${camp.id}`, { project_id: pB.id });
  const boot = (await call("structOwner", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(boot.collaborations.find(x => x.id === collab.id).project_id, pB.id);
  assert.equal(boot.expenses.find(x => x.id === exp.id).project_id, pB.id);

  // an expense without a campaign keeps the project it was given; deleting a project removes its tasks
  const loose = await post("expenses", { title: "Shoot", amount: 500, project_id: pA.id });
  assert.equal(loose.project_id, pA.id);
  r = await call("structOwner", "DELETE", `/api/w/${wid}/projects/${pA.id}`);
  assert.equal(r.status, 200);
  const after = (await call("structOwner", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(after.tasks.some(x => x.id === task.id), false);
  assert.equal(after.expenses.find(x => x.id === loose.id).project_id, null);
});

test("personal accounts: share a project with a new email (closed sign-up), names follow renames", async () => {
  const before = config.allowSignup;
  try {
    config.allowSignup = true;
    let r = await call("pOwner", "POST", "/api/auth/register", { first_name: "Pat", last_name: "Old", email: "pat@example.com", password: "password123" }, "10.9.9.11");
    assert.equal(r.status, 200);
    config.allowSignup = false;
    const own = r.body.workspaces[0];
    assert.equal(own.personal, true); assert.equal(own.name, "Pat Old");
    const wid = own.id;
    const pid = (await call("pOwner", "POST", `/api/w/${wid}/projects`, { name: "Joint launch" })).body.item.id;
    await call("pOwner", "POST", `/api/w/${wid}/projects`, { name: "Private" });

    // share with someone who has no account: they may sign up even though sign-up is closed, and land in that project only
    r = await call("pOwner", "POST", `/api/w/${wid}/projects/${pid}/shares`, { email: "newbie@example.com", role: "viewer" });
    assert.equal(r.body.invited, true);
    r = await call("pNew", "POST", "/api/auth/register", { first_name: "New", last_name: "Bie", email: "newbie@example.com", password: "password123" }, "10.9.9.11");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.workspaces[0].personal, true);
    const shared = r.body.workspaces.find(w => w.id === wid);
    assert.equal(shared.role, "guest"); assert.equal(shared.owner_name, "Pat Old");
    const b = (await call("pNew", "GET", `/api/w/${wid}/bootstrap`)).body;
    assert.deepEqual(b.projects.map(p => p.name), ["Joint launch"]);
    assert.equal(b.myShares[pid], "viewer");
    assert.equal((await call("pOwner", "GET", `/api/w/${wid}/bootstrap`)).body.shareInvites.length, 0);

    // renaming yourself renames your own space and shows up for the people you share with
    const rev0 = (await call("pOwner", "GET", `/api/w/${wid}/rev`)).body.rev;
    r = await call("pOwner", "PATCH", "/api/me", { last_name: "New" });
    assert.equal(r.body.user.name, "Pat New");
    assert.equal(r.body.workspaces[0].name, "Pat New");
    assert.ok((await call("pOwner", "GET", `/api/w/${wid}/rev`)).body.rev > rev0, "open screens refresh");
    assert.equal((await call("pNew", "GET", "/api/me")).body.workspaces.find(w => w.id === wid).owner_name, "Pat New");
    assert.equal((await call("pNew", "GET", `/api/w/${wid}/bootstrap`)).body.members.find(m => m.email === "pat@example.com").name, "Pat New");

    // deleting the owner never hands their whole account to someone they only shared a project with
    r = await call("pOwner", "DELETE", "/api/me", { password: "password123" });
    assert.equal(r.status, 200);
    r = await call("pNew", "GET", "/api/me");
    assert.equal(r.body.workspaces.some(w => w.id === wid), false);
    assert.equal((await call("pNew", "GET", `/api/w/${wid}/bootstrap`)).status, 404);
  } finally { config.allowSignup = before; }
});

test("one account: projects shared with me come with my own data; edits go to the owner; sync notices their changes", async () => {
  const reg = (who, f, l, email) => call(who, "POST", "/api/auth/register", { first_name: f, last_name: l, email, password: "password123" }, "10.9.9.12");
  const o = (await reg("oneOwner", "Oli", "Owner", "oli@example.com")).body.workspaces[0].id;
  const m = (await reg("oneMate", "Max", "Mate", "max@example.com")).body.workspaces[0].id;
  const pid = (await call("oneOwner", "POST", `/api/w/${o}/projects`, { name: "Together" })).body.item.id;
  await call("oneOwner", "POST", `/api/w/${o}/projects`, { name: "Owner only" });
  await call("oneOwner", "POST", `/api/w/${o}/tasks`, { title: "Owner task", project_id: pid });
  await call("oneOwner", "POST", `/api/w/${o}/projects/${pid}/shares`, { email: "max@example.com", role: "editor" });

  let r = await call("oneMate", "GET", "/api/shared");
  assert.equal(r.body.items.length, 1);
  const sh = r.body.items[0];
  assert.equal(sh.wid, o); assert.equal(sh.owner_name, "Oli Owner");
  assert.deepEqual(sh.projects.map(p => [p.name, p.workspace_id]), [["Together", o]]);
  assert.equal(sh.tasks.length, 1); assert.equal(sh.myShares[pid], "editor");
  assert.ok(sh.members.some(x => x.email === "oli@example.com"), "can assign the owner");

  // the mate edits in the owner's account through the shared project
  r = await call("oneMate", "POST", `/api/w/${o}/tasks`, { title: "Mate task", project_id: pid });
  assert.equal(r.status, 200);

  // the mate's sync check moves when the owner changes something in the shared project
  const before = (await call("oneMate", "GET", `/api/w/${m}/rev`)).body;
  await call("oneOwner", "POST", `/api/w/${o}/tasks`, { title: "Another", project_id: pid });
  const after = (await call("oneMate", "GET", `/api/w/${m}/rev`)).body;
  assert.equal(after.rev, before.rev);
  assert.notEqual(after.sharedRev, before.sharedRev);
  assert.equal((await call("anonOne", "GET", "/api/shared")).status, 401);
});

test("creator platforms & contact channels: own fields, counted as contact, searchable, filterable", async () => {
  await call("platOwner", "POST", "/api/auth/register", { first_name: "Plat", last_name: "Owner", email: "plat@example.com", password: "password123" }, "10.9.9.13");
  const wid = (await call("platOwner", "GET", "/api/me")).body.workspaces[0].id;
  let r = await call("platOwner", "POST", `/api/w/${wid}/influencers`, { name: "yt_sample", link_youtube: "https://www.youtube.com/@ytsample", followers_youtube: 250000,
    link_fb: "https://www.facebook.com/ytsample", followers_fb: 1200, contact_line: "@ytsampleline", contact_email: "creator@example.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.item.followers_max, 250000, "peak follows the biggest platform");
  r = await call("platOwner", "POST", `/api/w/${wid}/influencers`, { name: "bad_link", link_x: "javascript:alert(1)" });
  assert.equal(r.status, 400);
  const list = q => call("platOwner", "GET", `/api/w/${wid}/influencers?${q}`).then(x => x.body.items.map(i => i.name));
  assert.deepEqual(await list("platform=youtube"), ["yt_sample"]);
  assert.deepEqual(await list("contact=1"), ["yt_sample"]);
  assert.deepEqual(await list("q=ytsampleline"), ["yt_sample"]);
  const b = (await call("platOwner", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.equal(b.influencerStats.with_contact, 1);
});

test("old one-box contacts split into LINE / phone / email", async () => {
  const { splitContact } = await import("../lib/contact-split.js");
  assert.deepEqual(splitContact("Line : @sample_pizza"), { line: "@sample_pizza", phone: "", email: "", rest: "" });
  assert.deepEqual(splitContact("Line(For work): sample_nam\nLine: sample_nam"), { line: "sample_nam", phone: "", email: "", rest: "" });
  assert.deepEqual(splitContact("Tel : 0800000001"), { line: "", phone: "0800000001", email: "", rest: "" });
  assert.deepEqual(splitContact("sample.creator@example.com\nmail"), { line: "", phone: "", email: "sample.creator@example.com", rest: "" });
  assert.deepEqual(splitContact("Line : SampleLine\nIG:sample.glasses.studio"), { line: "SampleLine", phone: "", email: "", rest: "IG:sample.glasses.studio" });
  // anything unclear stays as notes
  assert.deepEqual(splitContact("Inbox Tiktok"), { line: "", phone: "", email: "", rest: "Inbox Tiktok" });
  assert.deepEqual(splitContact("ID : @123abcde"), { line: "", phone: "", email: "", rest: "ID : @123abcde" });
});

test("creator niches: the workspace's own list, added from a creator, renamed, searched, exported, removed", async () => {
  await call("nOwner", "POST", "/api/auth/register", { first_name: "Niche", last_name: "Owner", email: "niche@example.com", password: "password123" }, "10.9.9.14");
  const wid = (await call("nOwner", "GET", "/api/me")).body.workspaces[0].id;
  let b = (await call("nOwner", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.deepEqual(b.workspace.creator_niches, [], "a new workspace starts with no niches");
  // a creator saved with a niche nobody listed yet adds it to the list
  let r = await call("nOwner", "POST", `/api/w/${wid}/influencers`, { name: "glow_girl", pet_type: "บิวตี้" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await call("nOwner", "POST", `/api/w/${wid}/influencers`, { name: "noodle_man", pet_type: "อาหาร" });
  b = (await call("nOwner", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.deepEqual(b.workspace.creator_niches.map(n => n.key), ["บิวตี้", "อาหาร"]);
  // rename + icon: the key stays, so creators follow without rewriting
  r = await call("nOwner", "PUT", `/api/w/${wid}/creator-niches`, { niches: [{ key: "บิวตี้", label: "Beauty & Skincare", emoji: "💄" }, { key: "อาหาร", label: "อาหาร", emoji: "🍜" }, { label: "ท่องเที่ยว", emoji: "✈️ extra" }, { label: "Beauty & Skincare" }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.niches.map(n => [n.key, n.label, n.emoji]), [["บิวตี้", "Beauty & Skincare", "💄"], ["อาหาร", "อาหาร", "🍜"], ["ท่องเที่ยว", "ท่องเที่ยว", "✈️"], ["Beauty & Skincare", "Beauty & Skincare", "🏷️"]]);
  // searching the niche's name finds its creators
  const list = q => call("nOwner", "GET", `/api/w/${wid}/influencers?${q}`).then(x => x.body.items.map(i => i.name));
  assert.deepEqual(await list("q=skincare"), ["glow_girl"]);
  assert.deepEqual(await list(`type=${encodeURIComponent("อาหาร")}`), ["noodle_man"]);
  // the export has a sheet per niche, named by its label
  const x = await app.inject({ method: "GET", url: `/api/w/${wid}/influencers/export.xlsx`, headers: { cookie: jar.nOwner } });
  const sheets = (await parseInfluencerWorkbook(x.rawPayload)).sheets.map(s => s.name);
  assert.ok(sheets.includes("Beauty & Skincare") && sheets.includes("อาหาร"), sheets.join(","));
  // removing a niche leaves its creators unassigned
  r = await call("nOwner", "PUT", `/api/w/${wid}/creator-niches`, { niches: [{ key: "อาหาร", label: "อาหาร", emoji: "🍜" }] });
  assert.equal(r.body.cleared, 1);
  assert.deepEqual(await list("type=none"), ["glow_girl"]);
  // viewers can't change the list
  assert.equal((await call("anon3", "PUT", `/api/w/${wid}/creator-niches`, { niches: [] })).status, 401);
});

test("multi-niche creators + niche fields: several niches, own fields, filter/search, import/export, removal, report", async () => {
  await call("mn", "POST", "/api/auth/register", { first_name: "Multi", last_name: "Niche", email: "multiniche@example.com", password: "password123" }, "10.9.9.15");
  const wid = (await call("mn", "GET", "/api/me")).body.workspaces[0].id;
  let r = await call("mn", "PUT", `/api/w/${wid}/creator-niches`, { niches: [
    { key: "beauty", label: "บิวตี้", emoji: "💄", fields: [{ label: "สภาพผิว" }, { label: "สภาพผิว" }, { label: "โทนผิว" }] },
    { key: "mom", label: "แม่และเด็ก", emoji: "👶", fields: [{ label: "อายุลูก" }] }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.niches[0].fields.map(f => f.key), ["สภาพผิว", "โทนผิว"], "duplicate fields are dropped");
  r = await call("mn", "POST", `/api/w/${wid}/influencers`, { name: "mama_glow", code: "MG-1", niches: ["mom", "beauty", "mom", "อาหาร"], extra: { beauty: { "สภาพผิว": "ผิวมัน", "": "x" }, mom: { "อายุลูก": " 2 ขวบ " } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.item.niches, ["mom", "beauty", "อาหาร"]);
  assert.equal(r.body.item.pet_type, "mom", "the first niche is the main one");
  assert.deepEqual(r.body.item.extra, { beauty: { "สภาพผิว": "ผิวมัน" }, mom: { "อายุลูก": "2 ขวบ" } });
  const id = r.body.item.id;
  await call("mn", "POST", `/api/w/${wid}/influencers`, { name: "old_client", code: "OC-1", pet_type: "beauty" }); // an older client sending only pet_type
  const b = (await call("mn", "GET", `/api/w/${wid}/bootstrap`)).body;
  assert.ok(b.workspace.creator_niches.some(n => n.key === "อาหาร"), "a new niche joins the list");
  assert.equal(b.influencerStats.byType.beauty, 2, "both creators count in beauty");
  assert.equal(b.influencerStats.byType.mom, 1);
  const list = q => call("mn", "GET", `/api/w/${wid}/influencers?${q}`).then(x => x.body.items.map(i => i.name).sort());
  assert.deepEqual(await list("type=beauty"), ["mama_glow", "old_client"]);
  assert.deepEqual(await list("type=mom"), ["mama_glow"]);
  assert.deepEqual(await list(`q=${encodeURIComponent("ผิวมัน")}`), ["mama_glow"], "niche field values are searchable");
  assert.deepEqual(await list(`q=${encodeURIComponent("แม่และเด็ก")}`), ["mama_glow"]);
  // export: one "สาย / ประเภท" cell with every label, a column per niche field; re-import brings them back
  const x = await app.inject({ method: "GET", url: `/api/w/${wid}/influencers/export.xlsx`, headers: { cookie: jar.mn } });
  const parsed = await parseInfluencerWorkbook(x.rawPayload);
  const row = parsed.rows.find(p => p.name === "mama_glow");
  assert.deepEqual(row.niches, ["แม่และเด็ก", "บิวตี้", "อาหาร"]);
  assert.equal(row._extra["บิวตี้: สภาพผิว"], "ผิวมัน");
  await call("mn", "PATCH", `/api/w/${wid}/influencers/${id}`, { niches: ["beauty"], extra: {} });
  const { importInfluencers } = await import("../routes/influencers.js");
  await db.tx(q => importInfluencers(q, wid, null, parsed.rows));
  let item = (await call("mn", "GET", `/api/w/${wid}/influencers/${id}`)).body.item;
  assert.deepEqual(item.niches, ["mom", "beauty", "อาหาร"], "labels map back to the keys");
  assert.equal(item.extra.beauty["สภาพผิว"], "ผิวมัน");
  // removing a niche takes it off the creators and the next one becomes the main niche
  await call("mn", "PUT", `/api/w/${wid}/creator-niches`, { niches: b.workspace.creator_niches.filter(n => n.key !== "mom") });
  item = (await call("mn", "GET", `/api/w/${wid}/influencers/${id}`)).body.item;
  assert.deepEqual(item.niches, ["beauty", "อาหาร"]);
  assert.equal(item.pet_type, "beauty");
  assert.equal(item.extra.mom, undefined);
  // report by niche
  await call("mn", "POST", `/api/w/${wid}/collaborations`, { influencer_id: id, status: "posted", fee: 5000, product_value: 1000, views: 20000 });
  const rep = (await call("mn", "GET", `/api/w/${wid}/influencers/niche-report`)).body.rows;
  const beauty = rep.find(r2 => r2.k === "beauty");
  assert.equal(beauty.creators, 2);
  assert.equal(beauty.collabs, 1);
  assert.equal(beauty.spend, 6000);
  assert.equal(beauty.views, 20000);
  assert.equal(rep.find(r2 => r2.k === "อาหาร").spend, 6000, "a creator in two niches counts in both");
});

test("contact review: suggests moving handles / LINE / phone out of old notes, applies only what was ticked", async () => {
  const { contactSuggestions, contactRest } = await import("../lib/creator-tools.js");
  const s = contactSuggestions({ contact: "IG : sample.summer.studio\nTT:ช่องตัวอย่าง\nID : @123abcde\nInbox Tiktok\nhttps://www.tiktok.com/@sample.channel?lang=th", link_tiktok: null });
  assert.deepEqual(s.map(m => [m.field, m.value]), [["link_ig", "https://www.instagram.com/sample.summer.studio"], ["contact_line", "@123abcde"], ["link_tiktok", "https://www.tiktok.com/@sample.channel?lang=th"]]);
  assert.equal(contactRest("IG : sample.summer.studio\nTT:ช่องตัวอย่าง\nInbox Tiktok", s), "TT:ช่องตัวอย่าง\nInbox Tiktok");
  assert.deepEqual(contactSuggestions({ contact: "IG: abc_def", link_ig: "https://www.instagram.com/x" }), [], "a filled field is never overwritten");
  assert.deepEqual(contactSuggestions({ contact: "Line: second_one", contact_line: "first" }), []);
  assert.deepEqual(contactSuggestions({ contact: "@456wxyzq" }).map(m => m.field), ["contact_line"]);
  assert.deepEqual(contactSuggestions({ contact: "โทร 081-234-5678", contact_line: "x" }).map(m => m.field), ["contact_phone"]);

  await call("cr", "POST", "/api/auth/register", { first_name: "Contact", last_name: "Review", email: "contactreview@example.com", password: "password123" }, "10.9.9.16");
  const wid = (await call("cr", "GET", "/api/me")).body.workspaces[0].id;
  const a = (await call("cr", "POST", `/api/w/${wid}/influencers`, { name: "creator_a", contact: "IG:creator.a\nTT:creator_a_tt\nทีมติดต่อ" })).body.item;
  await call("cr", "POST", `/api/w/${wid}/influencers`, { name: "creator_b", contact: "Inbox IG" });
  let r = await call("cr", "GET", `/api/w/${wid}/influencers/contact-review`);
  assert.equal(r.body.withNotes, 2);
  assert.equal(r.body.items.length, 1);
  assert.deepEqual(r.body.items[0].moves.map(m => m.field), ["link_ig", "link_tiktok"]);
  r = await call("cr", "POST", `/api/w/${wid}/influencers/contact-review`, { items: [{ id: a.id, fields: ["link_ig", "address"] }] });
  assert.deepEqual([r.body.changed, r.body.moved], [1, 1]);
  const item = (await call("cr", "GET", `/api/w/${wid}/influencers/${a.id}`)).body.item;
  assert.equal(item.link_ig, "https://www.instagram.com/creator.a");
  assert.equal(item.link_tiktok, null, "unticked suggestions stay in the notes");
  assert.equal(item.contact, "TT:creator_a_tt\nทีมติดต่อ");
});

test("duplicates: warn on a likely duplicate, list groups, merge keeps everything", async () => {
  await call("dp", "POST", "/api/auth/register", { first_name: "Dupe", last_name: "Finder", email: "dupes@example.com", password: "password123" }, "10.9.9.17");
  const wid = (await call("dp", "GET", "/api/me")).body.workspaces[0].id;
  const mk = d => call("dp", "POST", `/api/w/${wid}/influencers`, d).then(x => x.body.item);
  const a = await mk({ name: "Glow Studio", link_tiktok: "https://www.tiktok.com/@glow.studio", contact_phone: "081-234-5678", notes: "rate 5k", niches: ["บิวตี้"], followers_tiktok: 50000 });
  const b = await mk({ name: "glow_studio_official", contact_phone: "+66 81 234 5678", address: "Bangkok", notes: "ส่งของทุกเดือน", niches: ["รีวิว"], link_tiktok: "https://www.tiktok.com/@other" });
  await mk({ name: "Totally Different" });
  let r = await call("dp", "POST", `/api/w/${wid}/influencers/dupes`, { name: "x", link_tiktok: "https://tiktok.com/@Glow.Studio?lang=th" });
  assert.deepEqual(r.body.items.map(i => [i.name, i.reasons]), [["Glow Studio", ["link_tiktok", "name"]]]);
  r = await call("dp", "POST", `/api/w/${wid}/influencers/dupes`, { id: a.id, name: "Glow Studio", link_tiktok: a.link_tiktok });
  assert.deepEqual(r.body.items.map(i => i.name), [], "a creator isn't its own duplicate");
  r = await call("dp", "GET", `/api/w/${wid}/influencers/duplicates`);
  assert.equal(r.body.groups.length, 1);
  assert.deepEqual(r.body.groups[0].members.map(m => m.name).sort(), ["Glow Studio", "glow_studio_official"]);
  assert.ok(r.body.groups[0].reasons.includes("contact_phone"));
  await call("dp", "POST", `/api/w/${wid}/collaborations`, { influencer_id: b.id, status: "posted", fee: 100 });
  r = await call("dp", "POST", `/api/w/${wid}/influencers/${a.id}/merge`, { from: [b.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.merged, r.body.collaborations], [1, 1]);
  const m = (await call("dp", "GET", `/api/w/${wid}/influencers/${a.id}`)).body;
  assert.equal(m.collaborations.length, 1, "collaborations move to the kept creator");
  assert.equal(m.item.address, "Bangkok", "empty fields are filled");
  assert.equal(m.item.link_tiktok, "https://www.tiktok.com/@glow.studio", "the kept value wins");
  assert.ok(m.item.link_other.includes("tiktok.com/@other"), "a differing link is kept in other links");
  assert.equal(m.item.notes, "rate 5k\nส่งของทุกเดือน");
  assert.equal(m.item.aliases, "glow_studio_official");
  assert.deepEqual(m.item.niches, ["บิวตี้", "รีวิว"]);
  assert.equal((await call("dp", "GET", `/api/w/${wid}/influencers/${b.id}`)).status, 404);
  assert.equal((await call("dp", "GET", `/api/w/${wid}/influencers/duplicates`)).body.groups.length, 0);
});
