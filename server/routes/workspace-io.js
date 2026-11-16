import { db } from "../db.js";
import { config } from "../config.js";
import { access, bad } from "../lib/core.js";
import { buildWorkspaceWorkbook, exportWorkspace, importWorkspace, parseWorkspaceWorkbook } from "../lib/workspace-xlsx.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default async function workspaceIoRoutes(app) {
  // Whole workspace as one Tempo .xlsx file
  app.get("/api/w/:wid/export.xlsx", async (req, reply) => {
    const { wid } = req.params;
    await access(req, wid);
    const data = await exportWorkspace(db, wid);
    const buf = await buildWorkspaceWorkbook(data);
    const name = `Tempo_${String(data.workspace.name).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    reply.header("content-type", XLSX).header("content-disposition", `attachment; filename="workspace.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return reply.send(Buffer.from(buf));
  });

  // Import a Tempo .xlsx (?preview=1 only reads and counts)
  app.post("/api/w/:wid/import", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async req => {
    const { wid } = req.params;
    await access(req, wid, "editor");
    const file = await req.file({ limits: { fileSize: config.uploadMaxMb * 1024 * 1024 } });
    if (!file) throw bad("file_required", "Please choose an .xlsx file");
    if (!/\.xlsx$/i.test(file.filename || "")) throw bad("xlsx_only", "Only .xlsx files are supported");
    let parsed;
    try { parsed = await parseWorkspaceWorkbook(await file.toBuffer()); } catch { throw bad("xlsx_invalid", "Could not read this spreadsheet"); }
    if (!parsed.format) throw bad("not_workspace_file", "This is not a Tempo workspace file");
    if (req.query?.preview === "1") return { preview: true, counts: parsed.counts };
    const res = await db.tx(q => importWorkspace(q, wid, req.user.id, parsed));
    return { ...res, counts: parsed.counts };
  });
}
