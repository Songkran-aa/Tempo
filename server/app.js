import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { HttpError } from "./lib/core.js";
import authRoutes, { loadSessionUser } from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import resourceRoutes from "./routes/resources.js";
import influencerRoutes from "./routes/influencers.js";
import trackerRoutes from "./routes/tracker.js";
import workspaceIoRoutes from "./routes/workspace-io.js";
import erpRoutes from "./routes/erp.js";

export async function buildApp({ logger = !process.env.QUIET } = {}) {
  const app = Fastify({
    logger: logger ? { level: config.production ? "info" : "warn" } : false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.production ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  });
  await app.register(compress, { global: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1 } });

  // Session + CSRF guard for the JSON API
  app.addHook("onRequest", async req => {
    if (!req.url.startsWith("/api/")) return;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers["x-requested-with"] !== "tempo") {
      throw new HttpError(403, "csrf", "Missing request header");
    }
    req.user = await loadSessionUser(req);
    const open = ["/api/config", "/api/health", "/api/auth/", "/api/cal/"].some(p => req.url.startsWith(p));
    if (!req.user && !open && !req.url.startsWith("/api/me")) throw new HttpError(401, "unauthorized", "Please sign in");
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500;
    if (status >= 500) req.log.error(err);
    const code = err.code && typeof err.code === "string" && status < 500 ? (err.code.startsWith("FST_") ? (status === 429 ? "rate_limited" : "bad_request") : err.code) : "server_error";
    reply.status(status).send({ code, message: status >= 500 ? "Something went wrong" : err.message });
  });

  app.get("/api/health", async () => {
    await db.query("select 1");
    return { ok: true, db: db.kind, version: config.version };
  });

  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(resourceRoutes);
  await app.register(influencerRoutes);
  await app.register(trackerRoutes);
  await app.register(workspaceIoRoutes);
  await app.register(erpRoutes);

  // Static web app + SPA fallback
  await app.register(fastifyStatic, {
    root: config.webRoot,
    prefix: "/",
    index: ["index.html"],
    cacheControl: false,
    setHeaders: (res, file) => {
      const set = (k, v) => (typeof res.setHeader === "function" ? res.setHeader(k, v) : res.header(k, v));
      if (file.endsWith("sw.js") || file.endsWith(".html")) set("cache-control", "no-cache");
      else if (/\.(js|css)$/.test(file)) set("cache-control", "no-cache");
      else if (/\.(svg|png|webmanifest)$/.test(file)) set("cache-control", "no-cache"); // revalidate by ETag (cheap 304) so logo/icon changes show up right away
    }
  });
  const indexHtml = fs.readFileSync(path.join(config.webRoot, "index.html"));
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.status(404).send({ code: "not_found", message: "Not found" });
    reply.header("cache-control", "no-cache").type("text/html").send(indexHtml);
  });

  return app;
}
