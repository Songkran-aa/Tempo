import { config } from "./config.js";
import { db, initDb } from "./db.js";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { startBackgroundJobs, stopBackgroundJobs } from "./lib/notify.js";

await initDb();
await migrate(msg => console.log(msg));

const app = await buildApp();
await app.listen({ port: config.port, host: config.host });
startBackgroundJobs();
console.log(`Tempo ${config.version} running on http://localhost:${config.port}  (db: ${db.kind})`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    stopBackgroundJobs();
    await app.close();
    await db.close();
    process.exit(0);
  });
}
