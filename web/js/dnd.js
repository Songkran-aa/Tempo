/* Pointer-based drag & drop for kanban boards — works with mouse, pen and touch.
   Cards: [data-drag-id][data-drag-kind]   Columns: [data-drop-kind][data-drop]
   Touch: long-press (~280ms) to pick up a card, so normal scrolling still works. */
export function initBoardDnD(onDrop) {
  let st = null; // { id, kind, card, ghost, startX, startY, dx, dy, active, timer, over, pointerId }
  let suppressClick = false;

  const cleanup = () => {
    if (!st) return;
    clearTimeout(st.timer);
    st.ghost?.remove();
    st.card?.classList.remove("dragging", "lifting");
    st.over?.classList.remove("over");
    document.body.classList.remove("is-dragging");
    st = null;
  };

  const activate = () => {
    if (!st || st.active) return;
    st.active = true;
    const r = st.card.getBoundingClientRect();
    st.dx = st.startX - r.left; st.dy = st.startY - r.top;
    const g = st.card.cloneNode(true);
    g.classList.add("drag-ghost");
    g.style.width = r.width + "px";
    g.style.left = r.left + "px"; g.style.top = r.top + "px";
    document.body.append(g);
    st.ghost = g;
    st.card.classList.add("dragging");
    document.body.classList.add("is-dragging");
    navigator.vibrate?.(12);
  };

  const move = (x, y) => {
    if (!st?.active) return;
    st.ghost.style.left = x - st.dx + "px";
    st.ghost.style.top = y - st.dy + "px";
    st.ghost.style.pointerEvents = "none";
    const under = document.elementFromPoint(x, y);
    const col = under?.closest(`[data-drop-kind="${st.kind}"]`);
    if (col !== st.over) { st.over?.classList.remove("over"); col?.classList.add("over"); st.over = col; }
    // auto-scroll the board horizontally near the edges
    const board = st.card.closest(".board");
    if (board) {
      const br = board.getBoundingClientRect();
      if (x > br.right - 50) board.scrollLeft += 14;
      else if (x < br.left + 50) board.scrollLeft -= 14;
    }
  };

  document.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const card = e.target.closest("[data-drag-id]");
    if (!card || e.target.closest("input,select,textarea,a")) return;
    cleanup();
    st = { id: card.dataset.dragId, kind: card.dataset.dragKind, card, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId, touch: e.pointerType !== "mouse" };
    if (st.touch) {
      card.classList.add("lifting");
      st.timer = setTimeout(activate, 280);
    }
  });

  document.addEventListener("pointermove", e => {
    if (!st || e.pointerId !== st.pointerId) return;
    const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
    if (!st.active) {
      if (st.touch) { if (dist > 10) cleanup(); return; } // finger moved before long-press -> it's a scroll
      if (dist > 6) activate(); else return;
    }
    e.preventDefault();
    move(e.clientX, e.clientY);
  }, { passive: false });

  // stop the page from scrolling while dragging on touch screens
  document.addEventListener("touchmove", e => { if (st?.active) e.preventDefault(); }, { passive: false });

  const end = e => {
    if (!st || (e.pointerId !== undefined && e.pointerId !== st.pointerId)) return;
    if (st.active) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 50);
      const target = st.over;
      const { id, kind } = st;
      cleanup();
      if (target) onDrop(kind, id, target.dataset.drop);
    } else cleanup();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", () => cleanup());
  document.addEventListener("contextmenu", e => { if (st?.touch) e.preventDefault(); });
  document.addEventListener("click", e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
}
