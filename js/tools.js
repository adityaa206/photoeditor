/* PhotoEditor - tools.js : all canvas tools */
(function () {
  'use strict';
  const PE = window.PE;
  PE.tools = {}; PE.toolOrder = []; PE.opts = {};

  function defTool(t) {
    PE.tools[t.id] = t; PE.toolOrder.push(t.id);
    PE.opts[t.id] = {};
    for (const o of t.options || []) if (o.key && o.value !== undefined) PE.opts[t.id][o.key] = o.value;
    return t;
  }
  const O = (id) => PE.opts[id];
  const doc = () => PE.doc;
  const HANDLE_R = 6;

  /* ------------------------------------------------------------------ helpers */
  function activeLayerForEdit(silent) {
    const d = doc(); if (!d) return null;
    const L = d.active;
    if (!L) { if (!silent) PE.toast('No layer selected', { type: 'warn' }); return null; }
    if (L.locked) { if (!silent) PE.toast('Layer is locked', { type: 'warn' }); return null; }
    if (!L.visible) { if (!silent) PE.toast('Layer is hidden — make it visible first', { type: 'warn' }); return null; }
    return L;
  }
  function paintTarget() {
    const d = doc(); const L = activeLayerForEdit(); if (!L) return null;
    const target = d.paintTarget === 'mask' && L.mask ? 'mask' : 'img';
    return { layer: L, target };
  }
  const luma = (rgb) => PE.luma(rgb[0], rgb[1], rgb[2]);
  function selectionMode(e, base) {
    if (e.shiftKey && e.altKey) return 'intersect';
    if (e.shiftKey) return 'add';
    if (e.altKey) return 'subtract';
    return base || 'new';
  }
  function eyedrop(p, e) {
    const d = doc(); if (!d) return;
    const size = O('eyedropper').sample || 1;
    const comp = d.compositeDirty ? d.render(null) : d.composite;
    const half = Math.floor(size / 2);
    const x = PE.clamp(Math.floor(p.x) - half, 0, d.width - 1), y = PE.clamp(Math.floor(p.y) - half, 0, d.height - 1);
    const w = Math.min(size, d.width - x), h = Math.min(size, d.height - y);
    const px = comp.getContext('2d').getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i + 3] === 0) continue; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    if (!n) { PE.toast('Transparent pixel'); return; }
    const rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    if (e.altKey && PE.tool.id === 'eyedropper') PE.setBg(rgb); else PE.setFg(rgb);
  }
  /** text props -> canvas */
  PE.renderText = function (t) {
    const size = Math.max(1, t.size || 48);
    const font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${size}px ${t.font || 'Arial'}`;
    const lines = String(t.text || '').split('\n');
    const m = PE.createCanvas(1, 1).getContext('2d'); m.font = font;
    const lineH = size * 1.25, pad = Math.ceil(size * 0.25);
    let maxW = 1;
    for (const ln of lines) maxW = Math.max(maxW, m.measureText(ln || ' ').width);
    const W = Math.ceil(maxW + pad * 2), H = Math.ceil(lines.length * lineH + pad * 2);
    const c = PE.createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PE.rgbStr(t.color || [0, 0, 0]);
    ctx.textAlign = t.align || 'left';
    const ax = t.align === 'center' ? W / 2 : t.align === 'right' ? W - pad : pad;
    lines.forEach((ln, i) => ctx.fillText(ln, ax, pad + size * 0.95 + i * lineH));
    return c;
  };
  function drawHandle(ctx, x, y, active) {
    ctx.fillStyle = active ? '#4af' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.fillRect(x - HANDLE_R, y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
    ctx.strokeRect(x - HANDLE_R + 0.5, y - HANDLE_R + 0.5, HANDLE_R * 2 - 1, HANDLE_R * 2 - 1);
  }
  function screenDist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function constrainAxis(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? [dx, 0] : [0, dy]; }
  /** local handle positions of a layer (4 corners then 4 edge midpoints) */
  function layerHandlesLocal(L) {
    const w = L.w, h = L.h;
    return [[0, 0], [w, 0], [w, h], [0, h], [w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
  }

  /* ------------------------------------------------------------------ MOVE */
  const moveTool = defTool({
    id: 'move', name: 'Move', key: 'V', cursor: 'default',
    options: [
      { type: 'checkbox', key: 'autoSelect', label: 'Auto-select layer', value: true },
      { type: 'button', label: 'Align: Left', onClick: () => PE.actions.alignLayer('left') },
      { type: 'button', label: 'H-Center', onClick: () => PE.actions.alignLayer('hcenter') },
      { type: 'button', label: 'Right', onClick: () => PE.actions.alignLayer('right') },
      { type: 'button', label: 'Top', onClick: () => PE.actions.alignLayer('top') },
      { type: 'button', label: 'V-Center', onClick: () => PE.actions.alignLayer('vcenter') },
      { type: 'button', label: 'Bottom', onClick: () => PE.actions.alignLayer('bottom') },
      { type: 'button', label: 'Free Transform (Ctrl+T)', onClick: () => PE.setTool('transform') },
    ],
    onDown(p, e) {
      const d = doc(); if (!d) return;
      let L = d.active;
      if (O('move').autoSelect !== (e.ctrlKey || e.metaKey)) {
        for (let i = d.layers.length - 1; i >= 0; i--) {
          const c = d.layers[i];
          if (c.visible && c.hitTest(p.x, p.y, 8)) { L = c; break; }
        }
        if (L && L !== d.active) d.setActive(L);
      }
      if (!L) return;
      if (L.locked) { PE.toast('Layer is locked', { type: 'warn' }); return; }
      this.drag = { L, x0: p.x, y0: p.y, cx: L.cx, cy: L.cy, commit: PE.history.propChange('Move Layer', L, ['cx', 'cy'], () => d.markDirty(L)) };
    },
    onMove(p, e) {
      const g = this.drag; if (!g) return;
      let dx = p.x - g.x0, dy = p.y - g.y0;
      if (e.shiftKey) [dx, dy] = constrainAxis(dx, dy);
      g.L.cx = g.cx + dx; g.L.cy = g.cy + dy;
      doc().markDirty();
    },
    onUp() { if (this.drag) { this.drag.commit(); PE.events.emit('docchange'); this.drag = null; } },
    draw(ctx) {
      const d = doc(); const L = d && d.active; if (!L || !PE.settings.showBounds) return;
      const pts = L.corners().map((c) => PE.view.docToScreen(c[0], c[1]));
      ctx.strokeStyle = 'rgba(80,160,255,0.9)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
    },
  });

  /* ------------------------------------------------------------------ FREE TRANSFORM */
  const transformTool = defTool({
    id: 'transform', name: 'Free Transform', key: 'Ctrl+T', cursor: 'default',
    options: [
      { type: 'number', key: 'x', label: 'X', step: 1, live: true },
      { type: 'number', key: 'y', label: 'Y', step: 1, live: true },
      { type: 'number', key: 'w', label: 'W', step: 1, min: 1, live: true },
      { type: 'number', key: 'h', label: 'H', step: 1, min: 1, live: true },
      { type: 'number', key: 'angle', label: 'Angle°', step: 0.1, live: true },
      { type: 'checkbox', key: 'lock', label: 'Lock ratio', value: true },
      { type: 'button', label: 'Flip H', onClick: () => PE.actions.flipLayer('h') },
      { type: 'button', label: 'Flip V', onClick: () => PE.actions.flipLayer('v') },
      { type: 'button', label: 'Fit to canvas', onClick: () => PE.actions.fitLayer('fit') },
      { type: 'button', label: 'Fill canvas', onClick: () => PE.actions.fitLayer('fill') },
      { type: 'button', label: 'Center', onClick: () => PE.actions.centerLayer() },
      { type: 'button', label: 'Reset', onClick: () => PE.actions.resetTransform() },
      { type: 'button', label: 'Done (Enter)', primary: true, onClick: () => PE.setTool('move') },
    ],
    /** values shown in the options bar */
    liveValues() {
      const d = doc(); const L = d && d.active; if (!L) return { x: 0, y: 0, w: 0, h: 0, angle: 0 };
      const b = L.bounds();
      return { x: PE.round(b.x, 1), y: PE.round(b.y, 1), w: PE.round(L.w * Math.abs(L.sx), 1), h: PE.round(L.h * Math.abs(L.sy), 1), angle: PE.round(PE.deg(L.rot), 2) };
    },
    onOptionChange(key, val) {
      const d = doc(); const L = d && d.active; if (!L || L.locked) return;
      const commit = PE.history.propChange('Transform', L, ['cx', 'cy', 'sx', 'sy', 'rot'], () => d.markDirty(L));
      const b = L.bounds();
      if (key === 'x') L.cx += val - b.x;
      else if (key === 'y') L.cy += val - b.y;
      else if (key === 'w' && val > 0) { const k = val / (L.w * Math.abs(L.sx)); L.sx *= k; if (O('transform').lock) L.sy *= k; }
      else if (key === 'h' && val > 0) { const k = val / (L.h * Math.abs(L.sy)); L.sy *= k; if (O('transform').lock) L.sx *= k; }
      else if (key === 'angle') L.rot = PE.rad(val);
      commit(); d.markDirty(L); PE.events.emit('docchange');
    },
    hit(sx, sy, L) {
      const hl = layerHandlesLocal(L), m = L.matrix;
      const hs = hl.map((q) => { const dp = PE.matApply(m, q[0], q[1]); return PE.view.docToScreen(dp[0], dp[1]); });
      for (let i = 0; i < 8; i++) if (screenDist(sx, sy, hs[i][0], hs[i][1]) <= HANDLE_R + 3) return { kind: 'scale', index: i };
      const [dx, dy] = PE.view.screenToDoc(sx, sy);
      const [lx, ly] = L.toLocal(dx, dy);
      if (lx >= 0 && ly >= 0 && lx <= L.w && ly <= L.h) return { kind: 'move' };
      return { kind: 'rotate' };
    },
    cursorFor(sx, sy) {
      const d = doc(); const L = d && d.active; if (!L) return 'default';
      const h = this.hit(sx, sy, L);
      if (h.kind === 'move') return 'move';
      if (h.kind === 'rotate') return 'crosshair';
      return ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize', 'ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'][h.index];
    },
    onDown(p, e) {
      const d = doc(); if (!d) return;
      const L = d.active; if (!L) return;
      if (L.locked) { PE.toast('Layer is locked', { type: 'warn' }); return; }
      const h = this.hit(e.sx, e.sy, L);
      const g = { L, kind: h.kind, index: h.index, x0: p.x, y0: p.y, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, shift0: e.shiftKey };
      g.commit = PE.history.propChange('Transform', L, ['cx', 'cy', 'sx', 'sy', 'rot'], () => d.markDirty(L));
      if (h.kind === 'rotate') g.a0 = Math.atan2(p.y - L.cy, p.x - L.cx);
      if (h.kind === 'scale') {
        const hl = layerHandlesLocal(L);
        g.handleLocal = hl[h.index];
        g.anchorLocal = hl[(h.index + 2) % 4 + (h.index >= 4 ? 4 : 0)];
        g.centerLocal = [L.w / 2, L.h / 2];
      }
      this.drag = g;
    },
    onMove(p, e) {
      const g = this.drag; if (!g) return;
      const L = g.L;
      if (g.kind === 'move') {
        let dx = p.x - g.x0, dy = p.y - g.y0;
        if (e.shiftKey) [dx, dy] = constrainAxis(dx, dy);
        L.cx = g.cx + dx; L.cy = g.cy + dy;
      } else if (g.kind === 'rotate') {
        const a = Math.atan2(p.y - g.cy, p.x - g.cx);
        let rot = g.rot + (a - g.a0);
        if (e.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
        L.rot = PE.normAngle(rot);
        L.cx = g.cx; L.cy = g.cy;
      } else {
        // scale about anchor (opposite handle) or about center with Alt
        const cos = Math.cos(g.rot), sin = Math.sin(g.rot);
        const anchorLocal = e.altKey ? g.centerLocal : g.anchorLocal;
        const startM = [g.sx * cos, g.sx * sin, -g.sy * sin, g.sy * cos, 0, 0];
        startM[4] = g.cx - (startM[0] * L.w / 2 + startM[2] * L.h / 2);
        startM[5] = g.cy - (startM[1] * L.w / 2 + startM[3] * L.h / 2);
        const A = PE.matApply(startM, anchorLocal[0], anchorLocal[1]);
        const D = [g.handleLocal[0] - anchorLocal[0], g.handleLocal[1] - anchorLocal[1]];
        // mouse offset from anchor, expressed in the rotated (unscaled) frame
        const mx = p.x - A[0], my = p.y - A[1];
        const qx = mx * cos + my * sin, qy = -mx * sin + my * cos;
        let sx = g.sx, sy = g.sy;
        const isCorner = g.index < 4;
        const lock = isCorner ? (O('transform').lock !== e.shiftKey) : false;
        if (lock) {
          const vx = g.sx * D[0], vy = g.sy * D[1];
          const k = (qx * vx + qy * vy) / (vx * vx + vy * vy || 1);
          sx = g.sx * k; sy = g.sy * k;
        } else {
          if (Math.abs(D[0]) > 1e-9) sx = qx / D[0];
          if (Math.abs(D[1]) > 1e-9) sy = qy / D[1];
        }
        const minS = 0.001;
        if (Math.abs(sx) < minS) sx = sx < 0 ? -minS : minS;
        if (Math.abs(sy) < minS) sy = sy < 0 ? -minS : minS;
        L.sx = sx; L.sy = sy;
        // keep anchor fixed: C' = A - R*S'*(anchorLocal - centerLocal)
        const ax = anchorLocal[0] - L.w / 2, ay = anchorLocal[1] - L.h / 2;
        const rx = sx * ax * cos - sy * ay * sin, ry = sx * ax * sin + sy * ay * cos;
        L.cx = A[0] - rx; L.cy = A[1] - ry;
      }
      doc().markDirty();
      PE.ui && PE.ui.refreshOptionValues();
    },
    onUp() { if (this.drag) { this.drag.commit(); this.drag = null; PE.events.emit('docchange'); } },
    onKey(e) {
      if (e.key === 'Enter') { PE.setTool('move'); return true; }
      return false;
    },
    draw(ctx) {
      const d = doc(); const L = d && d.active; if (!L) return;
      const hl = layerHandlesLocal(L), m = L.matrix;
      const hs = hl.map((q) => { const dp = PE.matApply(m, q[0], q[1]); return PE.view.docToScreen(dp[0], dp[1]); });
      ctx.save();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.setLineDash([]);
      ctx.beginPath(); for (let i = 0; i < 4; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, hs[i][0], hs[i][1]); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 8; i++) drawHandle(ctx, hs[i][0], hs[i][1], this.drag && this.drag.index === i);
      const c = PE.view.docToScreen(L.cx, L.cy);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ SELECTION TOOLS */
  const selModeOption = { type: 'select', key: 'mode', label: 'Mode', value: 'new', items: [['new', 'New'], ['add', 'Add (Shift)'], ['subtract', 'Subtract (Alt)'], ['intersect', 'Intersect (Shift+Alt)']] };
  const featherOption = { type: 'number', key: 'feather', label: 'Feather (px)', value: 0, min: 0, max: 500, step: 0.5 };

  function finishShapeSelection(mode, feather, drawFn) {
    const d = doc();
    let sel = PE.Selection.fromShape(d.width, d.height, drawFn);
    if (feather > 0) sel = sel.feather(feather);
    PE.actions.setSelection(d.selection ? d.selection.combine(sel, mode) : (mode === 'subtract' ? null : sel), 'Selection');
  }
  function makeMarquee(id, name, key, ellipse) {
    return defTool({
      id, name, key, cursor: 'crosshair', options: [selModeOption, featherOption],
      onDown(p, e) { if (!doc()) return; this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, mode: selectionMode(e, O(id).mode), shift0: e.shiftKey, alt0: e.altKey }; },
      rect(g, e) {
        let x0 = g.x0, y0 = g.y0, x1 = g.x1, y1 = g.y1;
        let dx = x1 - x0, dy = y1 - y0;
        if (e.shiftKey && !g.shift0) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
        if (e.altKey && !g.alt0) return { x: x0 - dx, y: y0 - dy, w: 2 * dx, h: 2 * dy, fromCenter: true };
        return { x: x0, y: y0, w: dx, h: dy };
      },
      norm(r) { return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) }; },
      onMove(p, e) { const g = this.drag; if (!g) return; g.x1 = p.x; g.y1 = p.y; g.lastE = e; PE.requestRender(); },
      onUp(p, e) {
        const g = this.drag; if (!g) return; this.drag = null;
        g.x1 = p.x; g.y1 = p.y;
        const r = this.norm(this.rect(g, e));
        if (r.w < 1 || r.h < 1) { if (g.mode === 'new') PE.actions.setSelection(null, 'Deselect'); PE.requestRender(); return; }
        finishShapeSelection(g.mode, O(id).feather, (ctx) => {
          if (ellipse) { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(r.x, r.y, r.w, r.h);
        });
      },
      onKey(e) { if (e.key === 'Escape' && this.drag) { this.drag = null; PE.requestRender(); return true; } return false; },
      draw(ctx) {
        const g = this.drag; if (!g) return;
        const r = this.norm(this.rect(g, g.lastE || {}));
        const a = PE.view.docToScreen(r.x, r.y), b = PE.view.docToScreen(r.x + r.w, r.y + r.h);
        ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath();
        if (ellipse) ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
        else ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.strokeStyle = '#000'; ctx.lineDashOffset = 4; ctx.stroke();
        ctx.restore();
      },
    });
  }
  makeMarquee('marqueeRect', 'Rectangular Marquee', 'M', false);
  makeMarquee('marqueeEllipse', 'Elliptical Marquee', 'Shift+M', true);

  const lassoTool = defTool({
    id: 'lasso', name: 'Lasso', key: 'L', cursor: 'crosshair', options: [selModeOption, featherOption],
    onDown(p, e) { if (!doc()) return; this.pts = [[p.x, p.y]]; this.mode = selectionMode(e, O('lasso').mode); },
    onMove(p) { if (!this.pts) return; const l = this.pts[this.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) >= 0.5) { this.pts.push([p.x, p.y]); PE.requestRender(); } },
    onUp(p) {
      const pts = this.pts; if (!pts) return; this.pts = null;
      pts.push([p.x, p.y]);
      const b = PE.pointsBounds(pts);
      if (pts.length < 3 || (b.w < 1 && b.h < 1)) { if (this.mode === 'new') PE.actions.setSelection(null, 'Deselect'); PE.requestRender(); return; }
      finishShapeSelection(this.mode, O('lasso').feather, (ctx) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); });
    },
    onKey(e) { if (e.key === 'Escape' && this.pts) { this.pts = null; PE.requestRender(); return true; } return false; },
    draw(ctx) {
      const pts = this.pts; if (!pts || pts.length < 2) return;
      ctx.save(); ctx.lineWidth = 1; ctx.beginPath();
      pts.forEach((q, i) => { const s = PE.view.docToScreen(q[0], q[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
      ctx.strokeStyle = '#000'; ctx.setLineDash([]); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.stroke();
      ctx.restore();
    },
  });

  const polyLassoTool = defTool({
    id: 'polyLasso', name: 'Polygonal Lasso', key: 'Shift+L', cursor: 'crosshair', options: [selModeOption, featherOption,
      { type: 'button', label: 'Close (Enter)', onClick: () => polyLassoTool.close() }, { type: 'button', label: 'Cancel (Esc)', onClick: () => polyLassoTool.cancel() }],
    onDown(p, e) {
      if (!doc()) return;
      if (!this.pts) { this.pts = [[p.x, p.y]]; this.mode = selectionMode(e, O('polyLasso').mode); this.cur = [p.x, p.y]; this.lastClick = Date.now(); return; }
      const first = PE.view.docToScreen(this.pts[0][0], this.pts[0][1]);
      const dbl = Date.now() - this.lastClick < 350 && screenDist(e.sx, e.sy, this.lastSx || -99, this.lastSy || -99) < 4;
      this.lastClick = Date.now(); this.lastSx = e.sx; this.lastSy = e.sy;
      if ((this.pts.length >= 3 && screenDist(e.sx, e.sy, first[0], first[1]) < 8) || dbl) { this.close(); return; }
      this.pts.push([p.x, p.y]); PE.requestRender();
    },
    onMove(p) { if (this.pts) { this.cur = [p.x, p.y]; PE.requestRender(); } },
    onUp() {},
    close() {
      const pts = this.pts; if (!pts) return; this.pts = null;
      if (pts.length < 3) { PE.requestRender(); return; }
      finishShapeSelection(this.mode, O('polyLasso').feather, (ctx) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); });
    },
    cancel() { this.pts = null; PE.requestRender(); },
    onKey(e) {
      if (!this.pts) return false;
      if (e.key === 'Enter') { this.close(); return true; }
      if (e.key === 'Escape') { this.cancel(); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { this.pts.pop(); if (!this.pts.length) this.pts = null; PE.requestRender(); return true; }
      return false;
    },
    onDeactivate() { this.pts = null; },
    draw(ctx) {
      const pts = this.pts; if (!pts) return;
      ctx.save(); ctx.lineWidth = 1; ctx.beginPath();
      pts.forEach((q, i) => { const s = PE.view.docToScreen(q[0], q[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
      if (this.cur) { const s = PE.view.docToScreen(this.cur[0], this.cur[1]); ctx.lineTo(s[0], s[1]); }
      ctx.strokeStyle = '#000'; ctx.setLineDash([]); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.stroke();
      const f = PE.view.docToScreen(pts[0][0], pts[0][1]); drawHandle(ctx, f[0], f[1]);
      ctx.restore();
    },
  });

  const wandTool = defTool({
    id: 'wand', name: 'Magic Wand', key: 'W', cursor: 'crosshair',
    options: [selModeOption, { type: 'number', key: 'tolerance', label: 'Tolerance', value: 32, min: 0, max: 255, step: 1 },
      { type: 'checkbox', key: 'contiguous', label: 'Contiguous', value: true }, { type: 'checkbox', key: 'sampleAll', label: 'Sample all layers', value: true }, featherOption],
    onDown(p, e) {
      const d = doc(); if (!d) return;
      const o = O('wand');
      let src;
      if (o.sampleAll) src = d.compositeDirty ? d.render(null) : d.composite;
      else { const L = d.active; if (!L) { PE.toast('No layer selected'); return; } src = L.renderToDoc(d.width, d.height); }
      const id = PE.getImageData(src);
      const mask = PE.floodSelect(id, p.x, p.y, o.tolerance, o.contiguous);
      let sel = new PE.Selection(d.width, d.height, mask);
      if (o.feather > 0) sel = sel.feather(o.feather);
      const mode = selectionMode(e, o.mode);
      PE.actions.setSelection(d.selection ? d.selection.combine(sel, mode) : (mode === 'subtract' ? null : sel), 'Magic Wand');
    },
    onMove() {}, onUp() {},
  });

  /* ------------------------------------------------------------------ CROP */
  const cropTool = defTool({
    id: 'crop', name: 'Crop', key: 'C', cursor: 'crosshair',
    options: [
      { type: 'button', label: 'Apply (Enter)', primary: true, onClick: () => cropTool.apply() },
      { type: 'button', label: 'Cancel (Esc)', onClick: () => cropTool.cancel() },
      { type: 'button', label: 'Use selection', onClick: () => cropTool.fromSelection() },
      { type: 'button', label: 'Fit all layers', onClick: () => { const d = doc(); const b = d && d.layersBounds(true); if (b) { cropTool.rect = { ...b }; PE.requestRender(); } } },
    ],
    rect: null,
    handles() { const r = this.rect; return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]]; },
    onDown(p, e) {
      if (!doc()) return;
      if (this.rect) {
        const hs = this.handles();
        for (let i = 0; i < 8; i++) { const s = PE.view.docToScreen(hs[i][0], hs[i][1]); if (screenDist(e.sx, e.sy, s[0], s[1]) <= HANDLE_R + 3) { this.drag = { kind: 'resize', i, r0: { ...this.rect }, x0: p.x, y0: p.y }; return; } }
        const r = this.rect;
        if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) { this.drag = { kind: 'move', r0: { ...r }, x0: p.x, y0: p.y }; return; }
      }
      this.drag = { kind: 'new', x0: p.x, y0: p.y };
      this.rect = { x: p.x, y: p.y, w: 0, h: 0 };
    },
    onMove(p, e) {
      const g = this.drag; if (!g) return;
      if (g.kind === 'new') {
        let dx = p.x - g.x0, dy = p.y - g.y0;
        if (e.shiftKey) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
        this.rect = PE.rectFromPoints(g.x0, g.y0, g.x0 + dx, g.y0 + dy);
      } else if (g.kind === 'move') {
        this.rect = { ...g.r0, x: g.r0.x + p.x - g.x0, y: g.r0.y + p.y - g.y0 };
      } else {
        const r = { ...g.r0 }; const dx = p.x - g.x0, dy = p.y - g.y0, i = g.i;
        let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
        if (i === 0 || i === 3 || i === 7) x0 += dx;
        if (i === 1 || i === 2 || i === 5) x1 += dx;
        if (i === 0 || i === 1 || i === 4) y0 += dy;
        if (i === 2 || i === 3 || i === 6) y1 += dy;
        this.rect = PE.rectFromPoints(x0, y0, x1, y1);
      }
      PE.requestRender();
    },
    onUp() { if (this.drag) { this.drag = null; if (this.rect && (this.rect.w < 1 || this.rect.h < 1)) this.rect = null; PE.requestRender(); } },
    apply() {
      const d = doc(); if (!d || !this.rect) { PE.toast('Drag a crop rectangle first'); return; }
      const r = this.rect;
      const x = Math.round(r.x), y = Math.round(r.y), w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
      this.rect = null;
      PE.actions.setCanvasSize(w, h, -x, -y, 'Crop');
      PE.setTool('move');
    },
    cancel() { this.rect = null; PE.requestRender(); },
    fromSelection() { const d = doc(); if (!d || !d.selection) { PE.toast('No selection'); return; } this.rect = { ...d.selection.bounds() }; PE.requestRender(); },
    onKey(e) { if (e.key === 'Enter') { this.apply(); return true; } if (e.key === 'Escape') { this.cancel(); return true; } return false; },
    onDeactivate() { this.rect = null; this.drag = null; },
    draw(ctx) {
      const r = this.rect; if (!r) return;
      const a = PE.view.docToScreen(r.x, r.y), b = PE.view.docToScreen(r.x + r.w, r.y + r.h);
      const W = ctx.canvas.width / PE.view.dpr, H = ctx.canvas.height / PE.view.dpr;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, a[1]); ctx.fillRect(0, b[1], W, H - b[1]); ctx.fillRect(0, a[1], a[0], b[1] - a[1]); ctx.fillRect(b[0], a[1], W - b[0], b[1] - a[1]);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.strokeRect(a[0] + 0.5, a[1] + 0.5, b[0] - a[0], b[1] - a[1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i < 3; i++) { const x = a[0] + (b[0] - a[0]) * i / 3, y = a[1] + (b[1] - a[1]) * i / 3; ctx.beginPath(); ctx.moveTo(x, a[1]); ctx.lineTo(x, b[1]); ctx.moveTo(a[0], y); ctx.lineTo(b[0], y); ctx.stroke(); }
      for (const h of this.handles()) { const s = PE.view.docToScreen(h[0], h[1]); drawHandle(ctx, s[0], s[1]); }
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ EYEDROPPER */
  defTool({
    id: 'eyedropper', name: 'Eyedropper', key: 'I', cursor: 'crosshair',
    options: [{ type: 'select', key: 'sample', label: 'Sample', value: 1, items: [[1, 'Point (1px)'], [3, '3×3 average'], [5, '5×5 average'], [11, '11×11 average']] }],
    onDown(p, e) { eyedrop(p, e); this.down = true; }, onMove(p, e) { if (this.down) eyedrop(p, e); }, onUp() { this.down = false; },
  });

  /* ------------------------------------------------------------------ BRUSH / ERASER / CLONE */
  const brushOptions = (extra) => [
    { type: 'number', key: 'size', label: 'Size', value: 40, min: 1, max: 3000, step: 1 },
    { type: 'range', key: 'hardness', label: 'Hardness', value: 60, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'range', key: 'opacity', label: 'Opacity', value: 100, min: 1, max: 100, step: 1, unit: '%' },
    { type: 'range', key: 'flow', label: 'Flow', value: 100, min: 1, max: 100, step: 1, unit: '%' },
    { type: 'checkbox', key: 'pressure', label: 'Pen pressure', value: true },
    ...(extra || []),
  ];
  function makeBrushTool(cfg) {
    return defTool({
      id: cfg.id, name: cfg.name, key: cfg.key, cursor: 'none', isBrush: true,
      options: brushOptions(cfg.extraOptions),
      onDown(p, e) {
        if (!doc()) return;
        if (e.altKey && cfg.id !== 'clone') { eyedrop(p, e); return; }
        if (cfg.id === 'clone' && e.altKey) { this.source = [p.x, p.y]; this.offset = null; PE.toast('Clone source set'); PE.requestRender(); return; }
        const info = paintTarget(); if (!info) return;
        const L = info.layer, o = O(cfg.id), d = doc();
        if (cfg.id === 'clone' && !this.source) { PE.toast('Alt+click to set the clone source first', { type: 'warn' }); return; }
        if (info.target === 'img') PE.ensurePaintable(L);
        const fg = PE.fg, bg = PE.bg;
        let mode = 'paint', value, color = fg;
        if (cfg.id === 'eraser') { if (info.target === 'mask') { value = luma(bg); } else mode = 'erase'; }
        else if (cfg.id === 'clone') mode = 'clone';
        else value = luma(fg);
        let clone = null;
        if (cfg.id === 'clone') {
          const src = o.sampleAll ? d.flatten() : L.renderToDoc(d.width, d.height);
          if (!this.offset || !o.aligned) this.offset = [this.source[0] - p.x, this.source[1] - p.y];
          clone = { src, dx: this.offset[0], dy: this.offset[1] };
        }
        const stroke = new PE.Stroke({
          layer: L, target: info.target, mode, color, value, size: o.size, hardness: o.hardness / 100, opacity: o.opacity / 100, flow: o.flow / 100,
          selection: d.selection, clone, pressure: o.pressure,
        });
        if (e.shiftKey && this.lastPt) {
          stroke.addPoint(this.lastPt[0], this.lastPt[1], e.pressure, e.pointerType);
          stroke.addPoint(p.x, p.y, e.pressure, e.pointerType);
          stroke.commit(cfg.label);
          this.lastPt = [p.x, p.y];
          return;
        }
        this.stroke = stroke;
        stroke.addPoint(p.x, p.y, e.pressure, e.pointerType);
        PE.preview = { layer: L, render: () => stroke.previewLayer() };
        d.compositeDirty = true; PE.requestRender();
      },
      onMove(p, e) {
        const s = this.stroke; if (!s) return;
        let list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        if (!list || !list.length) list = [e];
        for (const ce of list) { const q = ce === e ? [p.x, p.y] : PE.view.screenToDoc(...PE.eventScreen(ce)); s.addPoint(q[0], q[1], ce.pressure, ce.pointerType); }
        doc().compositeDirty = true; PE.requestRender();
      },
      onUp(p) {
        const s = this.stroke; if (!s) return;
        this.stroke = null; PE.preview = null;
        s.commit(cfg.label);
        this.lastPt = [p.x, p.y];
        doc().markDirty(s.layer);
      },
      onDeactivate() { if (this.stroke) { this.stroke.commit(cfg.label); this.stroke = null; PE.preview = null; } },
      draw(ctx) {
        const pt = PE.pointer; if (!pt || !pt.inside || !doc()) return;
        const r = (O(cfg.id).size / 2) * PE.view.zoom;
        ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(pt.sx, pt.sy, Math.max(1, r), 0, Math.PI * 2);
        ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.beginPath(); ctx.arc(pt.sx, pt.sy, Math.max(1, r) + 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
        if (r < 6) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(pt.sx - 8, pt.sy); ctx.lineTo(pt.sx + 8, pt.sy); ctx.moveTo(pt.sx, pt.sy - 8); ctx.lineTo(pt.sx, pt.sy + 8); ctx.stroke(); }
        if (cfg.id === 'clone' && this.source) {
          let sx, sy;
          if (this.stroke && this.stroke.clone) { sx = pt.x + this.stroke.clone.dx; sy = pt.y + this.stroke.clone.dy; }
          else if (this.offset && O('clone').aligned) { sx = pt.x + this.offset[0]; sy = pt.y + this.offset[1]; }
          else { sx = this.source[0]; sy = this.source[1]; }
          const s = PE.view.docToScreen(sx, sy);
          ctx.strokeStyle = '#4af'; ctx.beginPath(); ctx.moveTo(s[0] - 10, s[1]); ctx.lineTo(s[0] + 10, s[1]); ctx.moveTo(s[0], s[1] - 10); ctx.lineTo(s[0], s[1] + 10); ctx.stroke();
          ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      },
    });
  }
  makeBrushTool({ id: 'brush', name: 'Brush', key: 'B', label: 'Brush Stroke' });
  makeBrushTool({ id: 'eraser', name: 'Eraser', key: 'E', label: 'Eraser' });
  makeBrushTool({ id: 'clone', name: 'Clone Stamp (Alt+click = source)', key: 'S', label: 'Clone Stamp', extraOptions: [
    { type: 'checkbox', key: 'aligned', label: 'Aligned', value: true }, { type: 'checkbox', key: 'sampleAll', label: 'Sample all layers', value: true }] });

  /* ------------------------------------------------------------------ GRADIENT */
  defTool({
    id: 'gradient', name: 'Gradient', key: 'G', cursor: 'crosshair',
    options: [
      { type: 'select', key: 'type', label: 'Type', value: 'linear', items: [['linear', 'Linear'], ['radial', 'Radial']] },
      { type: 'select', key: 'colors', label: 'Colors', value: 'fgbg', items: [['fgbg', 'Foreground → Background'], ['fgt', 'Foreground → Transparent']] },
      { type: 'checkbox', key: 'reverse', label: 'Reverse', value: false },
      { type: 'range', key: 'opacity', label: 'Opacity', value: 100, min: 1, max: 100, step: 1, unit: '%' },
    ],
    onDown(p) { if (!doc()) return; this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; },
    onMove(p, e) { const g = this.drag; if (!g) return; g.x1 = p.x; g.y1 = p.y; if (e.shiftKey) { const [dx, dy] = constrainAxis(p.x - g.x0, p.y - g.y0); g.x1 = g.x0 + dx; g.y1 = g.y0 + dy; } PE.requestRender(); },
    onUp() {
      const g = this.drag; if (!g) return; this.drag = null; PE.requestRender();
      if (Math.hypot(g.x1 - g.x0, g.y1 - g.y0) < 1) return;
      const info = paintTarget(); if (!info) return;
      const L = info.layer, o = O('gradient'), d = doc();
      if (info.target === 'img') PE.ensurePaintable(L);
      let c0 = PE.fg, c1 = PE.bg;
      const fgt = o.colors === 'fgt';
      const makeGrad = (ctx) => {
        if (o.type === 'linear') return ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
        return ctx.createRadialGradient(g.x0, g.y0, 0, g.x0, g.y0, Math.hypot(g.x1 - g.x0, g.y1 - g.y0));
      };
      const b = L.bounds();
      const fillLayerSpace = (stops) => {
        const c = PE.createCanvas(L.w, L.h); const ctx = c.getContext('2d');
        ctx.setTransform(...L.inverse);
        const gr = makeGrad(ctx); for (const s of stops) gr.addColorStop(s[0], s[1]);
        ctx.fillStyle = gr; ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        return c;
      };
      if (info.target === 'img') {
        let stops = fgt ? [[0, PE.rgbStr(c0, 1)], [1, PE.rgbStr(c0, 0)]] : [[0, PE.rgbStr(c0, 1)], [1, PE.rgbStr(c1, 1)]];
        if (o.reverse) stops = stops.map((s, i) => [s[0], stops[stops.length - 1 - i][1]]);
        PE.applyCoverage({ layer: L, target: 'img', canvas: fillLayerSpace(stops), opacity: o.opacity / 100, selection: d.selection, label: 'Gradient' });
      } else {
        let v0 = luma(c0), v1 = luma(c1);
        if (fgt) {
          let stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']];
          if (o.reverse) stops = [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,1)']];
          PE.applyCoverage({ layer: L, target: 'mask', canvas: fillLayerSpace(stops), value: v0, opacity: o.opacity / 100, selection: d.selection, label: 'Gradient (mask)' });
        } else {
          if (o.reverse) [v0, v1] = [v1, v0];
          const valueCanvas = fillLayerSpace([[0, `rgba(255,255,255,${v0})`], [1, `rgba(255,255,255,${v1})`]]);
          PE.applyCoverage({ layer: L, target: 'mask', canvas: PE.solidMask(L.w, L.h, 1), valueCanvas, opacity: o.opacity / 100, selection: d.selection, label: 'Gradient (mask)' });
        }
      }
    },
    draw(ctx) {
      const g = this.drag; if (!g) return;
      const a = PE.view.docToScreen(g.x0, g.y0), b = PE.view.docToScreen(g.x1, g.y1);
      ctx.save(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = '#000'; ctx.stroke(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ PAINT BUCKET */
  defTool({
    id: 'bucket', name: 'Paint Bucket', key: 'Shift+G', cursor: 'crosshair',
    options: [
      { type: 'number', key: 'tolerance', label: 'Tolerance', value: 32, min: 0, max: 255, step: 1 },
      { type: 'checkbox', key: 'contiguous', label: 'Contiguous', value: true },
      { type: 'checkbox', key: 'sampleAll', label: 'Sample all layers', value: true },
      { type: 'range', key: 'opacity', label: 'Opacity', value: 100, min: 1, max: 100, step: 1, unit: '%' },
    ],
    onDown(p, e) {
      if (!doc()) return;
      if (e.altKey) { eyedrop(p, e); return; }
      const info = paintTarget(); if (!info) return;
      const L = info.layer, o = O('bucket'), d = doc();
      if (info.target === 'img') PE.ensurePaintable(L);
      const src = o.sampleAll ? (d.compositeDirty ? d.render(null) : d.composite) : L.renderToDoc(d.width, d.height);
      const mask = PE.floodSelect(PE.getImageData(src), p.x, p.y, o.tolerance, o.contiguous);
      const id = new ImageData(d.width, d.height), dd = id.data;
      const fg = PE.fg;
      for (let i = 0, j = 0; i < mask.length; i++, j += 4) if (mask[i]) { dd[j] = fg[0]; dd[j + 1] = fg[1]; dd[j + 2] = fg[2]; dd[j + 3] = 255; }
      const docCanvas = PE.canvasFromImageData(id);
      const cov = PE.createCanvas(L.w, L.h); const cctx = cov.getContext('2d');
      cctx.imageSmoothingEnabled = true; cctx.setTransform(...L.inverse); cctx.drawImage(docCanvas, 0, 0);
      if (info.target === 'img') PE.applyCoverage({ layer: L, target: 'img', canvas: cov, opacity: o.opacity / 100, selection: d.selection, label: 'Paint Bucket' });
      else PE.applyCoverage({ layer: L, target: 'mask', canvas: cov, value: luma(fg), opacity: o.opacity / 100, selection: d.selection, label: 'Paint Bucket (mask)' });
    },
    onMove() {}, onUp() {},
  });

  /* ------------------------------------------------------------------ TEXT */
  const textTool = defTool({
    id: 'text', name: 'Text', key: 'T', cursor: 'text',
    options: [
      { type: 'select', key: 'font', label: 'Font', value: 'Arial', items: [['Arial', 'Arial'], ['Helvetica', 'Helvetica'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Trebuchet MS', 'Trebuchet MS'], ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Courier New', 'Courier New'], ['Impact', 'Impact'], ['Comic Sans MS', 'Comic Sans MS'], ['Segoe UI', 'Segoe UI'], ['Consolas', 'Consolas']] },
      { type: 'number', key: 'size', label: 'Size', value: 64, min: 4, max: 1000, step: 1 },
      { type: 'checkbox', key: 'bold', label: 'Bold', value: false },
      { type: 'checkbox', key: 'italic', label: 'Italic', value: false },
      { type: 'select', key: 'align', label: 'Align', value: 'left', items: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
      { type: 'color', key: 'color', label: 'Color', value: '#000000' },
      { type: 'button', label: 'Commit (Enter)', primary: true, onClick: () => textTool.commit() },
      { type: 'button', label: 'Cancel (Esc)', onClick: () => textTool.cancel() },
    ],
    onDown(p, e) {
      const d = doc(); if (!d) return;
      if (this.editor) { this.commit(); return; }
      // click on an existing text layer edits it
      let target = null;
      for (let i = d.layers.length - 1; i >= 0; i--) { const L = d.layers[i]; if (L.type === 'text' && L.visible && L.hitTest(p.x, p.y)) { target = L; break; } }
      const o = O('text');
      if (target) { d.setActive(target); Object.assign(o, { font: target.text.font, size: target.text.size, bold: target.text.bold, italic: target.text.italic, align: target.text.align, color: PE.rgbToHex(...target.text.color) }); PE.ui.refreshOptions(); }
      this.openEditor(target ? target.bounds().x : p.x, target ? target.bounds().y : p.y, target);
    },
    onMove() {}, onUp() {},
    openEditor(x, y, layer) {
      const o = O('text');
      const s = PE.view.docToScreen(x, y);
      const ta = PE.el('textarea', { class: 'text-editor', spellcheck: 'false', placeholder: 'Type text…' });
      ta.value = layer ? layer.text.text : '';
      Object.assign(ta.style, { left: s[0] + 'px', top: s[1] + 'px', font: `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${Math.max(10, o.size * PE.view.zoom)}px ${o.font}`, color: o.color });
      PE.$('#viewport').appendChild(ta);
      ta.focus();
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
        e.stopPropagation();
      });
      this.editor = { ta, x, y, layer };
    },
    commit() {
      const ed = this.editor; if (!ed) return; this.editor = null;
      const text = ed.ta.value; ed.ta.remove();
      const d = doc(); if (!d) return;
      if (!text.trim()) { PE.requestRender(); return; }
      const o = O('text');
      const props = { text, font: o.font, size: o.size, bold: !!o.bold, italic: !!o.italic, align: o.align, color: PE.hexToRgb(o.color) || [0, 0, 0] };
      if (ed.layer) PE.actions.updateTextLayer(ed.layer, props);
      else PE.actions.addTextLayer(props, ed.x, ed.y);
    },
    cancel() { const ed = this.editor; if (!ed) return; this.editor = null; ed.ta.remove(); },
    onKey(e) { if (e.key === 'Escape' && this.editor) { this.cancel(); return true; } return false; },
    onDeactivate() { this.commit(); },
  });

  /* ------------------------------------------------------------------ SHAPES */
  defTool({
    id: 'shape', name: 'Shape', key: 'U', cursor: 'crosshair',
    options: [
      { type: 'select', key: 'kind', label: 'Shape', value: 'rect', items: [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line']] },
      { type: 'checkbox', key: 'fill', label: 'Fill', value: true },
      { type: 'color', key: 'fillColor', label: 'Fill', value: '#3399ff' },
      { type: 'checkbox', key: 'stroke', label: 'Stroke', value: false },
      { type: 'color', key: 'strokeColor', label: 'Stroke', value: '#000000' },
      { type: 'number', key: 'strokeWidth', label: 'Width', value: 4, min: 1, max: 500, step: 1 },
      { type: 'range', key: 'opacity', label: 'Opacity', value: 100, min: 1, max: 100, step: 1, unit: '%' },
    ],
    onDown(p) { if (!doc()) return; this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; },
    onMove(p, e) {
      const g = this.drag; if (!g) return; g.x1 = p.x; g.y1 = p.y;
      if (e.shiftKey) {
        const dx = p.x - g.x0, dy = p.y - g.y0;
        if (O('shape').kind === 'line') { const [cx, cy] = constrainAxis(dx, dy); g.x1 = g.x0 + cx; g.y1 = g.y0 + cy; }
        else { const s = Math.max(Math.abs(dx), Math.abs(dy)); g.x1 = g.x0 + Math.sign(dx || 1) * s; g.y1 = g.y0 + Math.sign(dy || 1) * s; }
      }
      PE.requestRender();
    },
    pathOn(ctx, g) {
      const o = O('shape');
      ctx.beginPath();
      if (o.kind === 'line') { ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x1, g.y1); return; }
      const r = PE.rectFromPoints(g.x0, g.y0, g.x1, g.y1);
      if (o.kind === 'rect') ctx.rect(r.x, r.y, r.w, r.h);
      else ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    },
    onUp() {
      const g = this.drag; if (!g) return; this.drag = null; PE.requestRender();
      if (Math.hypot(g.x1 - g.x0, g.y1 - g.y0) < 1) return;
      const info = paintTarget(); if (!info) return;
      const L = info.layer, o = O('shape'), d = doc();
      if (info.target === 'img') PE.ensurePaintable(L);
      const cov = PE.createCanvas(L.w, L.h); const ctx = cov.getContext('2d');
      ctx.setTransform(...L.inverse);
      const isLine = o.kind === 'line';
      this.pathOn(ctx, g);
      if (info.target === 'mask') ctx.fillStyle = ctx.strokeStyle = '#fff';
      else { ctx.fillStyle = o.fillColor; ctx.strokeStyle = o.strokeColor; }
      if (o.fill && !isLine) ctx.fill();
      if (o.stroke || isLine) { ctx.lineWidth = o.strokeWidth; ctx.lineCap = 'round'; ctx.stroke(); }
      if (info.target === 'img') PE.applyCoverage({ layer: L, target: 'img', canvas: cov, opacity: o.opacity / 100, selection: d.selection, label: 'Shape' });
      else PE.applyCoverage({ layer: L, target: 'mask', canvas: cov, value: luma(PE.hexToRgb(o.fillColor) || [255, 255, 255]), opacity: o.opacity / 100, selection: d.selection, label: 'Shape (mask)' });
    },
    draw(ctx) {
      const g = this.drag; if (!g) return;
      ctx.save();
      const v = PE.view; ctx.setTransform(v.dpr * v.zoom, 0, 0, v.dpr * v.zoom, v.dpr * v.panX, v.dpr * v.panY);
      this.pathOn(ctx, g);
      ctx.lineWidth = 1 / v.zoom; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.setLineDash([4 / v.zoom, 4 / v.zoom]); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ PERSPECTIVE / DISTORT */
  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const perspTool = defTool({
    id: 'perspective', name: 'Perspective / Distort', key: 'Ctrl+Shift+T', cursor: 'default',
    options: [
      { type: 'select', key: 'mode', label: 'Mode', value: 'perspective', items: [['perspective', 'Perspective (symmetric)'], ['distort', 'Distort (free corners)']] },
      { type: 'checkbox', key: 'grid', label: 'Show grid', value: true },
      { type: 'button', label: 'Reset', onClick: () => perspTool.reset() },
      { type: 'button', label: 'Apply (Enter)', primary: true, onClick: () => perspTool.apply() },
      { type: 'button', label: 'Cancel (Esc)', onClick: () => perspTool.cancel() },
    ],
    quad: null, layer: null, session: null, orig: null, _cache: null,
    onActivate() {
      this.begin();
      this._onActive = () => { const d = doc(); if (d && d.active !== this.layer) { this.commitPending(); this.begin(); } };
      PE.events.on('activechange', this._onActive);
    },
    onDeactivate() { if (this._onActive) { PE.events.off('activechange', this._onActive); this._onActive = null; } this.commitPending(); this.teardown(); },
    begin() {
      this.teardown();
      const d = doc(); const L = d && d.active;
      if (!L) return;
      if (L.locked) { PE.toast('Layer is locked', { type: 'warn' }); return; }
      this.layer = L; this.quad = L.corners(); this.orig = this.quad.map((p) => p.slice());
      this.session = PE.warpSession(L.effective());
      this.updatePreview();
    },
    teardown() { if (this.session) { this.session.dispose(); this.session = null; } PE.preview = null; this.quad = null; this.layer = null; this.orig = null; this._cache = null; this.drag = null; if (doc()) { doc().compositeDirty = true; PE.requestRender(); } },
    homography() { const L = this.layer; return PE.homography([[0, 0], [L.w, 0], [L.w, L.h], [0, L.h]], this.quad); },
    changed() { return !!(this.quad && this.orig && this.quad.some((p, i) => Math.abs(p[0] - this.orig[i][0]) > 1e-6 || Math.abs(p[1] - this.orig[i][1]) > 1e-6)); },
    updatePreview() {
      const d = doc(); const L = this.layer; if (!d || !L || !this.session) return;
      const H = this.homography();
      if (!H || !PE.quadIsValid(this.quad)) { PE.preview = null; d.compositeDirty = true; PE.requestRender(); return; }
      this._cache = this.session.render(H, { x: 0, y: 0, w: d.width, h: d.height });
      const tool = this;
      PE.preview = { layer: L, docSpace: true, render: () => tool._cache };
      d.compositeDirty = true; PE.requestRender();
    },
    hit(sx, sy) {
      const q = this.quad; if (!q) return null;
      const S = q.map((p) => PE.view.docToScreen(p[0], p[1]));
      for (let i = 0; i < 4; i++) if (screenDist(sx, sy, S[i][0], S[i][1]) <= HANDLE_R + 3) return { kind: 'corner', i };
      for (let i = 0; i < 4; i++) { const a = S[i], b = S[(i + 1) % 4]; if (screenDist(sx, sy, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2) <= HANDLE_R + 3) return { kind: 'edge', i }; }
      if (pointInPoly([sx, sy], S)) return { kind: 'move' };
      return null;
    },
    cursorFor(sx, sy) { const h = this.hit(sx, sy); return !h ? 'default' : h.kind === 'move' ? 'move' : 'crosshair'; },
    onDown(p, e) {
      if (!this.quad) { this.begin(); if (!this.quad) return; }
      const h = this.hit(e.sx, e.sy); if (!h) return;
      this.drag = { ...h, x0: p.x, y0: p.y, q0: this.quad.map((pt) => pt.slice()) };
    },
    onMove(p, e) {
      const g = this.drag; if (!g) return;
      let dx = p.x - g.x0, dy = p.y - g.y0;
      if (e.shiftKey) [dx, dy] = constrainAxis(dx, dy);
      const q = g.q0.map((pt) => pt.slice());
      if (g.kind === 'move') for (const pt of q) { pt[0] += dx; pt[1] += dy; }
      else if (g.kind === 'edge') { const j = (g.i + 1) % 4; q[g.i][0] += dx; q[g.i][1] += dy; q[j][0] += dx; q[j][1] += dy; }
      else {
        const i = g.i; q[i][0] += dx; q[i][1] += dy;
        if (O('perspective').mode === 'perspective' && !e.altKey) {
          // corners: 0 TL, 1 TR, 2 BR, 3 BL — mirror horizontal motion on the horizontal neighbour, vertical on the vertical neighbour
          q[i ^ 1][0] -= dx; q[3 - i][1] -= dy;
        }
      }
      if (PE.quadIsValid(q)) { this.quad = q; this.updatePreview(); }
    },
    onUp() { this.drag = null; },
    commitPending() {
      if (this.quad && this.layer && this.changed()) {
        const H = this.homography();
        if (H && PE.quadIsValid(this.quad)) PE.actions.applyPerspective(this.layer, H, this.quad);
      }
    },
    apply() { this.commitPending(); this.teardown(); PE.setTool('move'); },
    cancel() { this.teardown(); PE.setTool('move'); },
    reset() { if (this.orig) { this.quad = this.orig.map((p) => p.slice()); this.updatePreview(); } },
    onKey(e) { if (e.key === 'Enter') { this.apply(); return true; } if (e.key === 'Escape') { this.cancel(); return true; } return false; },
    draw(ctx) {
      const q = this.quad; if (!q) return;
      const S = q.map((p) => PE.view.docToScreen(p[0], p[1]));
      ctx.save();
      const outline = () => { ctx.beginPath(); S.forEach((s, i) => (i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]))); ctx.closePath(); };
      if (O('perspective').grid && this.layer) {
        const H = this.homography();
        if (H) {
          const L = this.layer; ctx.beginPath();
          for (let k = 1; k < 3; k++) {
            const fx = (L.w * k) / 3, fy = (L.h * k) / 3;
            let a = PE.homographyApply(H, fx, 0), b = PE.homographyApply(H, fx, L.h); a = PE.view.docToScreen(a[0], a[1]); b = PE.view.docToScreen(b[0], b[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
            a = PE.homographyApply(H, 0, fy); b = PE.homographyApply(H, L.w, fy); a = PE.view.docToScreen(a[0], a[1]); b = PE.view.docToScreen(b[0], b[1]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
        }
      }
      outline(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = PE.quadIsValid(q) ? '#fff' : '#f55'; ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = S[i], b = S[(i + 1) % 4]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); }
      for (let i = 0; i < 4; i++) drawHandle(ctx, S[i][0], S[i][1], this.drag && this.drag.kind === 'corner' && this.drag.i === i);
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ BACKGROUND ERASER (smart brush on the layer mask) */
  function sampleLayerColor(L, p) {
    const [lx, ly] = L.toLocal(p.x, p.y);
    if (lx < 0 || ly < 0 || lx >= L.w || ly >= L.h) return null;
    const px = L.img.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
    return px[3] > 8 ? [px[0], px[1], px[2]] : null;
  }
  const bgEraserTool = defTool({
    id: 'bgEraser', name: 'Background Eraser', key: 'Shift+E', cursor: 'none', isBrush: true,
    options: [
      { type: 'select', key: 'mode', label: 'Mode', value: 'smart', items: [['smart', 'Erase similar colors'], ['erase', 'Erase everything'], ['restore', 'Restore']] },
      { type: 'number', key: 'size', label: 'Size', value: 60, min: 1, max: 3000, step: 1 },
      { type: 'range', key: 'hardness', label: 'Hardness', value: 80, min: 0, max: 100, step: 1, unit: '%' },
      { type: 'range', key: 'tolerance', label: 'Tolerance', value: 40, min: 1, max: 255, step: 1 },
      { type: 'select', key: 'sampling', label: 'Sample color', value: 'continuous', items: [['continuous', 'Continuously under cursor'], ['once', 'Once per stroke'], ['fixed', 'Fixed (Alt+click to pick)']] },
      { type: 'range', key: 'opacity', label: 'Strength', value: 100, min: 1, max: 100, step: 1, unit: '%' },
      { type: 'checkbox', key: 'pressure', label: 'Pen pressure', value: true },
    ],
    onDown(p, e) {
      const d = doc(); if (!d) return;
      const L = activeLayerForEdit(); if (!L) return;
      const o = O('bgEraser');
      if (e.altKey) { const c = sampleLayerColor(L, p); if (c) { this.fixedColor = c; o.sampling = 'fixed'; PE.ui.refreshOptions(); PE.toast(`Erase color set to ${PE.rgbToHex(...c)}`); } else PE.toast('No pixel there'); return; }
      if (L.type === 'text') PE.ensurePaintable(L);
      if (!L.mask) PE.actions.addMask('reveal');
      d.paintTarget = 'mask';
      const restore = o.mode === 'restore';
      const stroke = new PE.Stroke({ layer: L, target: 'mask', mode: 'paint', value: restore ? 1 : 0, size: o.size, hardness: o.hardness / 100, opacity: o.opacity / 100, flow: 1, selection: d.selection, pressure: o.pressure });
      if (o.mode === 'smart') {
        if (o.sampling === 'fixed' && !this.fixedColor) { PE.toast('Alt+click a color to erase first', { type: 'warn' }); return; }
        const smart = { tol: o.tolerance, sampling: o.sampling, color: o.sampling === 'fixed' ? this.fixedColor : null, img: PE.getImageData(L.img), hardness: o.hardness / 100 };
        stroke.stamp = function (x, y, r) {
          const [lx, ly] = PE.matApply(this.inv, x, y);
          const rl = Math.max(0.5, r * this.scale);
          const W = smart.img.width, Hh = smart.img.height, id = smart.img.data;
          if (smart.sampling !== 'fixed' && (!smart.color || smart.sampling === 'continuous')) {
            const cx = Math.floor(lx), cy = Math.floor(ly);
            if (cx < 0 || cy < 0 || cx >= W || cy >= Hh) return;
            const k = (cy * W + cx) * 4; if (id[k + 3] < 8) return; // transparent under cursor: nothing to sample
            smart.color = [id[k], id[k + 1], id[k + 2]];
          }
          const col = smart.color; if (!col) return;
          const x0 = Math.max(0, Math.floor(lx - rl - 1)), y0 = Math.max(0, Math.floor(ly - rl - 1));
          const x1 = Math.min(W, Math.ceil(lx + rl + 1)), y1 = Math.min(Hh, Math.ceil(ly + rl + 1));
          if (x1 <= x0 || y1 <= y0) return;
          const rw = x1 - x0, rh = y1 - y0, cov = new ImageData(rw, rh), cd = cov.data;
          const inner = Math.min(smart.hardness, Math.max(0, 1 - 1.2 / rl)) * rl, tol = smart.tol, soft = tol * 0.5 + 4;
          for (let yy = 0; yy < rh; yy++) {
            for (let xx = 0; xx < rw; xx++) {
              const px = x0 + xx, py = y0 + yy;
              const dist = Math.hypot(px + 0.5 - lx, py + 0.5 - ly);
              if (dist > rl) continue;
              const shape = dist <= inner ? 1 : 1 - (dist - inner) / (rl - inner || 1);
              const k = (py * W + px) * 4;
              if (id[k + 3] < 8) continue;
              const cdist = Math.max(Math.abs(id[k] - col[0]), Math.abs(id[k + 1] - col[1]), Math.abs(id[k + 2] - col[2]));
              const sim = cdist <= tol ? 1 : Math.max(0, 1 - (cdist - tol) / soft);
              const a = shape * sim; if (a <= 0) continue;
              const o4 = (yy * rw + xx) * 4; cd[o4] = 255; cd[o4 + 1] = 255; cd[o4 + 2] = 255; cd[o4 + 3] = Math.round(a * 255);
            }
          }
          const tmp = PE.canvasFromImageData(cov);
          this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.globalCompositeOperation = 'source-over'; this.ctx.globalAlpha = 1;
          this.ctx.drawImage(tmp, x0, y0);
          this.dirty = PE.rectUnion(this.dirty, { x: x0, y: y0, w: rw, h: rh });
          this.stamps++;
        };
      }
      this.stroke = stroke;
      stroke.addPoint(p.x, p.y, e.pressure, e.pointerType);
      PE.preview = { layer: L, render: () => stroke.previewLayer() };
      d.compositeDirty = true; PE.requestRender();
    },
    onMove(p, e) {
      const s = this.stroke; if (!s) return;
      let list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!list || !list.length) list = [e];
      for (const ce of list) { const q = ce === e ? [p.x, p.y] : PE.view.screenToDoc(...PE.eventScreen(ce)); s.addPoint(q[0], q[1], ce.pressure, ce.pointerType); }
      doc().compositeDirty = true; PE.requestRender();
    },
    onUp() { const s = this.stroke; if (!s) return; this.stroke = null; PE.preview = null; s.commit(O('bgEraser').mode === 'restore' ? 'Restore' : 'Background Eraser'); doc().markDirty(s.layer); },
    onDeactivate() { if (this.stroke) { this.stroke.commit('Background Eraser'); this.stroke = null; PE.preview = null; } },
    draw(ctx) {
      const pt = PE.pointer; if (!pt || !pt.inside || !doc()) return;
      const r = (O('bgEraser').size / 2) * PE.view.zoom, mode = O('bgEraser').mode;
      ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(pt.sx, pt.sy, Math.max(1, r), 0, Math.PI * 2); ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.beginPath(); ctx.arc(pt.sx, pt.sy, Math.max(1, r) + 1, 0, Math.PI * 2); ctx.strokeStyle = mode === 'restore' ? 'rgba(80,255,120,0.9)' : 'rgba(255,90,90,0.9)'; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(pt.sx - 6, pt.sy); ctx.lineTo(pt.sx + 6, pt.sy); ctx.moveTo(pt.sx, pt.sy - 6); ctx.lineTo(pt.sx, pt.sy + 6); ctx.stroke();
      ctx.restore();
    },
  });

  /* ------------------------------------------------------------------ hints shown in the status bar */
  PE.TOOL_HINTS = {
    move: 'Drag to move the layer (auto-selects the layer under the cursor). Shift constrains. Arrow keys nudge. Ctrl+T to transform.',
    transform: 'Drag inside to move, corner handles to scale (proportional; Shift frees, Alt scales from center), outside the box to rotate (Shift snaps). Enter applies.',
    perspective: 'Drag corners to change the perspective (opposite corner mirrors; Alt frees), edge dots to skew, inside to move. Enter applies, Esc cancels.',
    marqueeRect: 'Drag a rectangle. Shift adds to the selection, Alt subtracts. Shift while dragging = square, Alt = from center. Click to deselect.',
    marqueeEllipse: 'Drag an ellipse. Shift adds, Alt subtracts. Set Feather for a soft edge, then ◐ in Layers to turn it into a mask.',
    lasso: 'Draw a free-hand outline; release to close. Shift adds, Alt subtracts.',
    polyLasso: 'Click to add points, click the first point or press Enter to close, Backspace removes the last point.',
    wand: 'Click a color to select similar pixels. Tolerance sets the range; uncheck Contiguous to grab the color everywhere.',
    crop: 'Drag a crop rectangle, adjust the handles, press Enter. Layers keep their pixels outside the crop.',
    eyedropper: 'Click to pick the foreground color, Alt+click for the background color.',
    brush: 'Paint with the foreground color (on a mask: white reveals, black hides). [ ] change size, Alt+click picks a color, Shift+click draws a line.',
    eraser: 'Erase pixels (on a mask: paints the background color). [ ] change size.',
    bgEraser: 'Removes the background non-destructively on a mask: samples the color under the cursor and hides similar colors inside the brush. Restore mode brings pixels back.',
    clone: 'Alt+click to set the source, then paint to copy pixels from there. Great for cleaning seams.',
    gradient: 'Drag to draw a gradient (foreground → background). On a mask this makes a smooth fade.',
    bucket: 'Click to fill similar-colored pixels with the foreground color.',
    text: 'Click to place text, type, press Enter (Shift+Enter for a new line). Click an existing text layer to edit it.',
    shape: 'Drag to draw a rectangle, ellipse or line. Shift constrains proportions.',
    hand: 'Drag to pan. You can also hold Space with any tool, or use the mouse wheel to zoom.',
    zoom: 'Click to zoom in, Alt+click to zoom out. Ctrl+0 fits the image, Ctrl+1 shows 100%.',
  };

  /* ------------------------------------------------------------------ HAND / ZOOM */
  defTool({
    id: 'hand', name: 'Hand (Space)', key: 'H', cursor: 'grab', options: [
      { type: 'button', label: 'Fit (Ctrl+0)', onClick: () => PE.view.fit() }, { type: 'button', label: '100% (Ctrl+1)', onClick: () => PE.view.setZoom(1) }],
    onDown(p, e) { this.drag = { sx: e.sx, sy: e.sy, px: PE.view.panX, py: PE.view.panY }; },
    onMove(p, e) { const g = this.drag; if (!g) return; PE.view.panX = g.px + (e.sx - g.sx); PE.view.panY = g.py + (e.sy - g.sy); PE.requestRender(); },
    onUp() { this.drag = null; },
  });
  defTool({
    id: 'zoom', name: 'Zoom (Alt = out)', key: 'Z', cursor: 'zoom-in', options: [
      { type: 'button', label: 'Fit (Ctrl+0)', onClick: () => PE.view.fit() }, { type: 'button', label: '100% (Ctrl+1)', onClick: () => PE.view.setZoom(1) },
      { type: 'button', label: '200%', onClick: () => PE.view.setZoom(2) }, { type: 'button', label: '400%', onClick: () => PE.view.setZoom(4) }],
    onDown(p, e) { PE.view.setZoom(PE.view.zoom * (e.altKey ? 1 / 1.5 : 1.5), e.sx, e.sy); },
    onMove() {}, onUp() {},
  });

  /* ------------------------------------------------------------------ tool switching */
  PE.tool = null;
  PE.setTool = function (id) {
    const t = PE.tools[id]; if (!t) return;
    if (PE.tool === t) return;
    if (PE.tool && PE.tool.onDeactivate) PE.tool.onDeactivate();
    PE.tool = t;
    if (t.onActivate) t.onActivate();
    PE.events.emit('toolchange', t);
    PE.requestRender && PE.requestRender();
  };
})();
