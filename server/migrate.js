import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { db, initDb } from "./db.js";

export async function migrate(log = console.log) {
  await db.exec(`create table if not exists schema_migrations (name text primary key, run_at timestamptz not null default now())`);
  const done = new Set((await db.query("select name from schema_migrations")).rows.map(r => r.name));
  const files = fs.readdirSync(config.migrationsDir).filter(f => /\.(sql|js)$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const file = path.join(config.migrationsDir, f);
    // .sql = plain statements; .js = a data migration exporting `default async tx => {}`
    const run = f.endsWith(".js") ? (await import(pathToFileURL(file).href)).default : null;
    await db.tx(async tx => {
      if (run) await run(tx);
      else for (const stmt of splitSql(fs.readFileSync(file, "utf8"))) await tx.query(stmt);
      await tx.query("insert into schema_migrations (name) values ($1)", [f]);
    });
    log(`migrated ${f}`);
  }
}

function splitSql(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await initDb();
  await migrate();
  await db.close();
}
