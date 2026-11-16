import fs from "node:fs";
import { config } from "./config.js";

// Return dates as 'YYYY-MM-DD', numerics/bigints as JS numbers.
const PARSERS = {
  1082: v => v,
  1700: v => (v == null ? null : Number(v)),
  20: v => (v == null ? null : Number(v))
};

let impl = null;

export async function initDb({ memory = false } = {}) {
  if (impl) return impl;
  if (config.databaseUrl && !memory) {
    const pg = (await import("pg")).default;
    for (const [oid, fn] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), fn);
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined
    });
    impl = {
      kind: "postgres",
      query: (text, params) => pool.query(text, params),
      exec: text => pool.query(text),
      tx: async fn => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn({ query: (t, p) => client.query(t, p) });
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end()
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const opts = { parsers: PARSERS };
    if (!memory) {
      fs.mkdirSync(config.pgliteDir, { recursive: true });
      opts.dataDir = config.pgliteDir;
    }
    const lite = await PGlite.create(opts);
    impl = {
      kind: memory ? "pglite-memory" : "pglite",
      query: (text, params) => lite.query(text, params),
      exec: text => lite.exec(text),
      tx: fn => lite.transaction(tx => fn({ query: (t, p) => tx.query(t, p) })),
      close: () => lite.close()
    };
  }
  return impl;
}

export const db = {
  query: (text, params) => impl.query(text, params),
  exec: text => impl.exec(text),
  tx: fn => impl.tx(fn),
  get kind() { return impl?.kind; },
  close: async () => { if (impl) { await impl.close(); impl = null; } }
};
