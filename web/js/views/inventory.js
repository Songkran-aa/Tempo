// Products & stock: on-hand per product (from stock moves), receipts, issues, creator samples, low-stock alerts.
import { S, D, esc, icon, uid, money, moneyShort, fmtDate, fmtNum, byKey, canEdit, partner, product, isLow, todayISO, MOVE_KINDS, MOVE_SIGN, diffDays } from "../core.js";
import { t } from "../i18n.js";
import { pageHead, empty, chipBtn, F, group, projectOpts, openSheet, island, seg, commentsBox, kpi, keyPill, searchBox, csvCell, downloadBlob, pill } from "../ui.js";
import { create, update, destroy, hooks, reload } from "../store.js";

const supplierOpts = () => [["", t("common.none")], ...D().partners.map(p => [p.id, p.name])];
const moveSigned = m => MOVE_SIGN[m.kind] * m.qty;
const qtyText = (n, unit) => `${n > 0 ? "+" : ""}${fmtNum(n)}${unit ? " " + esc(unit) : ""}`;
export const lowStock = () => (D().products || []).filter(isLow);

function stockBadge(p) {
  const n = p.on_hand ?? 0;
  const color = n <= 0 ? "red" : isLow(p) ? "orange" : "green";
  return `<span class="stock c-${color}"><b>${fmtNum(n)}</b><small>${esc(p.unit || t("erp.pcs"))}</small></span>`;
}

function moveRow(m) {
  const p = product(m.product_id), k = byKey(MOVE_KINDS, m.kind);
  const who = m.collaboration_id ? D().collaborations.find(c => c.id === m.collaboration_id)?.influencer_name : partner(m.partner_id)?.name;
  return `<button class="row" data-act="editMove" data-id="${m.id}" style="--inset:58px"><span class="r-icon c-${k?.color || "gray"}">${icon(MOVE_SIGN[m.kind] > 0 ? "arrowIn" : "arrowOut", 15, 2.2)}</span>
    <div class="r-main"><span class="r-title">${esc(p?.name || "—")}</span><span class="r-sub">${fmtDate(m.move_date)} · ${esc(k?.label || m.kind)}${who ? " · " + esc(who) : ""}${m.note ? " · " + esc(m.note) : ""}</span></div>
    <span class="r-end"><b class="qty ${MOVE_SIGN[m.kind] > 0 ? "plus" : "minus"}">${qtyText(moveSigned(m), p?.unit)}</b></span></button>`;
}

export function viewInventory() {
  const d = D(), f = S.ui.inv, q = S.ui.invq.trim().toLowerCase();
  const head = pageHead(t("erp.productsCount", { n: d.products.length }), t("nav.inventory"),
    `<button class="circle-btn" data-act="exportProducts" aria-label="${t("common.exportCsv")}" title="${t("common.exportCsv")}">${icon("download", 18)}</button>` +
    (canEdit() ? `<button class="btn glassy hide-m" data-act="newMove">${icon("truck", 17)}${t("erp.newMove")}</button><button class="btn filled" data-act="newProduct">${icon("plus", 18, 2.4)}${t("erp.newProduct")}</button>` : ""));
  if (!d.products.length) return head + `<div class="card glass">${empty("box", t("erp.productsEmpty"), t("erp.productsEmptyText"), canEdit() ? `<button class="btn filled" data-act="newProduct">${icon("plus", 18, 2.4)}${t("erp.newProduct")}</button>` : "")}</div>`;
  const value = d.products.reduce((s, p) => s + Math.max(0, p.on_hand || 0) * (+p.cost || 0), 0);
  const recent = d.stock_moves.filter(m => diffDays(m.move_date, todayISO()) <= 30);
  const samples = recent.filter(m => m.kind === "sample").reduce((s, m) => s + m.qty, 0);
  const stats = `<div class="stat-tiles">${[
    kpi(t("erp.products"), d.products.filter(p => p.active !== false).length, "box", "accent"),
    kpi(t("erp.stockValue"), moneyShort(value), "wallet", "indigo"),
    kpi(t("erp.lowStock"), lowStock().length, "alert", lowStock().length ? "orange" : "green"),
    kpi(t("erp.samples30"), fmtNum(samples), "star", "violet")
  ].join("")}</div>`;
  const tabs = seg("invTab", [["products", t("erp.products"), "box"], ["moves", t("erp.moves"), "truck"]], f.tab);
  const toolbar = `<div class="toolbar"><div class="left">${tabs}</div><div class="right">${searchBox("invq", "invq", S.ui.invq, t("erp.searchProducts"))}</div></div>`;

  if (f.tab === "moves") {
    const list = d.stock_moves.filter(m => !q || [product(m.product_id)?.name, product(m.product_id)?.sku, m.note, partner(m.partner_id)?.name].join(" ").toLowerCase().includes(q));
    return head + stats + toolbar + `<div class="card glass list-card"><div class="list">${list.slice(0, 200).map(moveRow).join("") || `<div class="empty-row">${t("erp.noMoves")}</div>`}</div></div>`;
  }

  const cats = [...new Set(d.products.map(p => p.category).filter(Boolean))].sort();
  const chips = `<div class="chips">${chipBtn("invCat", "", t("common.all"), !f.cat && !f.low)}${chipBtn("invLow", "1", `${t("erp.lowStock")} ${lowStock().length || ""}`, f.low, `<span class="dot c-orange"></span>`)}${cats.length ? '<span class="chip-sep"></span>' : ""}${cats.map(c => chipBtn("invCat", c, c, f.cat === c)).join("")}</div>`;
  const list = d.products.filter(p => (!f.cat || p.category === f.cat) && (!f.low || isLow(p)) && (!q || [p.name, p.sku, p.barcode, p.category, partner(p.partner_id)?.name].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name));
  const rows = list.map(p => `<div class="row prod-row wrap-sm ${p.active === false ? "muted" : ""}" style="--inset:58px">
      <span class="r-icon c-${isLow(p) ? "orange" : "teal"}">${icon("box", 15, 2.2)}</span>
      <div class="r-main" data-act="editProduct" data-id="${p.id}" role="button" tabindex="0"><span class="r-title">${esc(p.name)} ${isLow(p) ? pill(t("erp.low"), "orange") : ""}</span><span class="r-sub">${p.sku ? `<code>${esc(p.sku)}</code>` : ""}${p.category ? esc(p.category) : ""}${partner(p.partner_id) ? " · " + esc(partner(p.partner_id).name) : ""}${p.price ? " · " + money(p.price) : ""}</span></div>
      <span class="r-end">${stockBadge(p)}${canEdit() ? `<button class="mini-btn lbl c-green" data-act="newMove" data-product="${p.id}" data-kind="in" title="${esc(t("mv.in"))}" aria-label="${esc(t("mv.in"))}">${icon("plus", 15, 2.6)}<span>${t("mv.in")}</span></button><button class="mini-btn lbl c-blue" data-act="newMove" data-product="${p.id}" data-kind="out" title="${esc(t("mv.out"))}" aria-label="${esc(t("mv.out"))}">${icon("arrowOut", 15, 2.4)}<span>${t("mv.outShort")}</span></button>` : ""}</span></div>`).join("");
  return head + stats + toolbar + chips + `<div class="card glass list-card mt"><div class="list">${rows || `<div class="empty-row">${t("erp.noProducts")}</div>`}</div></div>`;
}

export function editProduct(id) {
  const ex = D().products.find(p => p.id === id);
  const p = ex || { id: uid(), name: "", sku: "", category: "", unit: "", cost: "", price: "", reorder_level: "", barcode: "", partner_id: "", project_id: "", active: true, notes: "" };
  const moves = ex ? D().stock_moves.filter(m => m.product_id === ex.id) : [];
  const summary = ex ? `<div class="mini-stats">${[[fmtNum(ex.on_hand ?? 0), t("erp.onHand")], [money(Math.max(0, ex.on_hand || 0) * (+ex.cost || 0)), t("erp.stockValue")], [fmtNum(moves.filter(m => m.kind === "sample").reduce((s, m) => s + m.qty, 0)), t("mv.sample")], [ex.reorder_level ?? "—", t("erp.reorderLevel")]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>` +
    (canEdit() ? `<div class="quick-bar">${MOVE_KINDS.slice(0, 4).map(k => `<button type="button" class="btn gray sm" data-act="newMove" data-product="${ex.id}" data-kind="${k.key}">${icon(MOVE_SIGN[k.key] > 0 ? "arrowIn" : "arrowOut", 15)}${esc(k.label)}</button>`).join("")}</div>` : "") : "";
  const history = ex ? group(t("erp.movesOf", { n: moves.length }), `<div class="list">${moves.slice(0, 15).map(moveRow).join("") || `<div class="empty-row">${t("erp.noMoves")}</div>`}</div>`) : "";
  openSheet({
    title: ex ? t("erp.product") : t("erp.newProduct"), readOnly: !canEdit(), wide: true,
    body: summary + group("", F.title("name", p.name, t("erp.productNamePh")) + F.text("sku", "SKU", p.sku, { ph: "SKU-001" }) + F.text("category", t("tasks.category"), p.category, { ph: t("erp.categoryPh"), attrs: 'list="prodCats"' }) + `<datalist id="prodCats">${[...new Set(D().products.map(x => x.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>`) +
      group(t("erp.pricing"), F.text("unit", t("erp.unit"), p.unit, { ph: t("erp.pcs") }) + F.text("cost", t("erp.costThb"), p.cost, { type: "number", attrs: 'min="0" step="0.01" inputmode="decimal"' }) + F.text("price", t("erp.priceThb"), p.price, { type: "number", attrs: 'min="0" step="0.01" inputmode="decimal"' }) + F.text("reorder_level", t("erp.reorderLevel"), p.reorder_level, { type: "number", attrs: 'min="0" inputmode="numeric"' })) +
      group(t("erp.links"), F.select("partner_id", t("erp.supplier"), p.partner_id || "", supplierOpts()) + F.select("project_id", t("common.project"), p.project_id || "", projectOpts(true)) + F.text("barcode", t("erp.barcode"), p.barcode) + F.toggle("active", t("erp.activeProduct"), p.active !== false)) +
      group("", F.area("notes", t("common.notes"), p.notes)) + history + commentsBox("products", ex?.id),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      const data = { name: fd.name.trim(), sku: fd.sku.trim() || null, category: fd.category.trim() || null, unit: fd.unit.trim() || null, cost: fd.cost || null, price: fd.price || null, reorder_level: fd.reorder_level === "" ? null : fd.reorder_level, barcode: fd.barcode || null, partner_id: fd.partner_id || null, project_id: fd.project_id || null, active: fd.active, notes: fd.notes };
      if (ex) { await update("products", ex.id, data); return t("toast.saved"); }
      await create("products", { id: p.id, on_hand: 0, ...data });
      return t("erp.productAdded");
    },
    onDelete: ex ? async () => { await destroy("products", ex.id); await reload(); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deleteProduct")
  });
}

export function editMove(id, preset = {}) {
  const ex = D().stock_moves.find(m => m.id === id);
  const m = ex || { id: uid(), product_id: preset.product_id || D().products[0]?.id || "", kind: preset.kind || "in", qty: "", move_date: todayISO(), partner_id: "", collaboration_id: "", unit_cost: "", note: "" };
  if (!D().products.length) { island(t("erp.addProductFirst"), "alert", "orange"); return; }
  const collabs = D().collaborations.filter(c => !["declined"].includes(c.status));
  openSheet({
    title: ex ? t("erp.move") : t("erp.newMove"), readOnly: !canEdit(),
    body: group("", F.select("product_id", t("erp.product"), m.product_id, D().products.map(p => [p.id, `${p.name}${p.sku ? " · " + p.sku : ""} (${p.on_hand ?? 0})`]))) +
      group(t("erp.moveKind"), F.radios("kind", m.kind, MOVE_KINDS)) +
      group(t("erp.quantity"), F.text("qty", t("erp.qty"), m.qty, { type: "number", attrs: 'min="1" step="1" inputmode="numeric" required' }) + F.text("move_date", t("common.date"), m.move_date, { type: "date" }) + F.text("unit_cost", t("erp.unitCost"), m.unit_cost, { type: "number", attrs: 'min="0" step="0.01" inputmode="decimal"' })) +
      group(t("erp.counterparty"), F.select("partner_id", t("erp.partner"), m.partner_id || "", supplierOpts()) + F.select("collaboration_id", t("erp.toCreator"), m.collaboration_id || "", [["", t("common.none")], ...collabs.map(c => [c.id, c.influencer_name + (c.title ? " · " + c.title : "")])]) + F.text("note", t("common.notes"), m.note, { ph: t("erp.moveNotePh") }), t("erp.moveNote")),
    save: ex ? t("common.done") : t("common.add"),
    onSave: async fd => {
      const data = { product_id: fd.product_id, kind: fd.kind, qty: fd.qty, move_date: fd.move_date || todayISO(), unit_cost: fd.unit_cost || null, partner_id: fd.partner_id || null, collaboration_id: fd.collaboration_id || null, note: fd.note };
      if (!(+data.qty > 0)) throw new Error(t("erp.qtyRequired"));
      if (ex) await update("stock_moves", ex.id, data); else await create("stock_moves", { id: m.id, ...data });
      await reload(); // refresh on-hand numbers
      return ex ? t("toast.saved") : t("erp.moveAdded");
    },
    onDelete: ex ? async () => { await destroy("stock_moves", ex.id); await reload(); return t("toast.deleted"); } : null,
    deleteLabel: t("erp.deleteMove")
  });
}

function exportCsv() {
  const cols = ["SKU", t("common.name"), t("tasks.category"), t("erp.unit"), t("erp.onHand"), t("erp.reorderLevel"), t("erp.costThb"), t("erp.priceThb"), t("erp.stockValue"), t("erp.supplier"), t("erp.barcode")];
  const rows = [cols, ...D().products.map(p => [p.sku || "", p.name, p.category || "", p.unit || "", p.on_hand ?? 0, p.reorder_level ?? "", p.cost ?? "", p.price ?? "", Math.max(0, p.on_hand || 0) * (+p.cost || 0), partner(p.partner_id)?.name || "", p.barcode || ""])];
  downloadBlob(`tempo-stock-${todayISO()}.csv`, new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  island(t("toast.exported"), "download", "blue");
}

export const inventoryActions = {
  newProduct: () => editProduct(),
  editProduct: el => editProduct(el.dataset.id),
  newMove: el => editMove(null, { product_id: el.dataset.product, kind: el.dataset.kind }),
  editMove: el => editMove(el.dataset.id),
  invTab: el => { S.ui.inv.tab = el.dataset.v; hooks.render(); },
  invCat: el => { S.ui.inv.cat = el.dataset.v; S.ui.inv.low = false; hooks.render(); },
  invLow: () => { S.ui.inv.low = !S.ui.inv.low; S.ui.inv.cat = ""; hooks.render(); },
  exportProducts: () => exportCsv()
};
