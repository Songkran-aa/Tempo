import { db } from "../db.js";
import { config } from "../config.js";
import { access, bad } from "../lib/core.js";
import { importTrackerRows, parseTrackerCsv } from "../lib/tracker-csv.js";

export default async function trackerRoutes(app) {
  // Upload a product-tracker CSV. ?preview=1 only parses and reports what would happen.
  app.post("/api/w/:wid/tasks/import", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async req => {
    const { wid } = req.params;
    await access(req, wid, "editor");
    const file = await req.file({ limits: { fileSize: config.uploadMaxMb * 1024 * 1024 } });
    if (!file) throw bad("file_required", "Please choose a .csv file");
    if (!/\.csv$/i.test(file.filename || "")) throw bad("csv_only", "Only .csv files are supported");
    const buf = await file.toBuffer();
    let parsed;
    try { parsed = parseTrackerCsv(buf.toString("utf8")); }
    catch (e) { throw bad(e.code === "csv_no_title" ? "csv_no_title" : "csv_invalid", "Could not read this CSV"); }
    if (!parsed.rows.length) throw bad("csv_empty", "No task rows were found");
    const projects = [...new Set(parsed.rows.map(r => r.project).filter(Boolean))];
    if (req.query?.preview === "1") return { preview: true, total: parsed.rows.length, projects, columns: parsed.columns };
    return db.tx(async q => ({ ...(await importTrackerRows(q, wid, req.user.id, parsed.rows)), total: parsed.rows.length, projects }));
  });
}
