import { fileURLToPath } from "node:url";
import path from "node:path";

// Load .env if present (Node >= 20.12)
try { process.loadEnvFile?.(); } catch { /* no .env file */ }

const env = process.env;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  root,
  port: Number(env.PORT || 3000),
  host: env.HOST || "0.0.0.0",
  production: env.NODE_ENV === "production",
  // PostgreSQL in production. Leave empty to use the embedded PGlite database (development only).
  databaseUrl: env.DATABASE_URL || "",
  dbPoolMax: Number(env.DB_POOL_MAX || 20),
  dbSsl: env.DB_SSL === "1",
  pgliteDir: env.PGLITE_DIR || path.join(root, "data", "pglite"),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "1" : env.NODE_ENV === "production",
  sessionDays: Number(env.SESSION_DAYS || 30),
  allowSignup: env.ALLOW_SIGNUP !== "0",
  uploadMaxMb: Number(env.UPLOAD_MAX_MB || 15),
  webRoot: path.join(root, "web"),
  migrationsDir: path.join(root, "server", "migrations"),
  // Email (optional): smtp(s)://user:pass@host:port — leave empty to turn email off (in-app notifications still work)
  smtpUrl: env.SMTP_URL || "",
  mailFrom: env.MAIL_FROM || "Tempo <no-reply@localhost>",
  // Public address of the app, used for links in emails and calendar feeds (e.g. https://tempo.example.com)
  appUrl: (env.APP_URL || (env.DOMAIN ? "https://" + env.DOMAIN : "")).replace(/\/+$/, ""),
  version: "1.13.0"
};
