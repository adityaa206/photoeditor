/* PhotoEditor - actions.js : undoable document / layer / mask / selection commands */
(function () {
  'use strict';
  const PE = window.PE;
  const A = (PE.actions = {});
  const doc = () => PE.doc;

  /* ------------------------------------------------------------ snapshots */
  const LAYER_KEYS = ['img', 'mask', 'w', 'h', 'cx', 'cy', 'sx', 'sy', 'rot', 'opacity', 'blend', 'visible', 'locked', 'maskEnabled', 'name', 'type', 'text'];
  function snap(d) {
    return {
      w: d.width, h: d.height, layers: d.layers.slice(), active: d.activeIndex, sel: d.selection, target: d.paintTarget,
      props: d.layers.map((L) => { const p = { L }; for (const k of LAYER_KEYS) p[k] = L[k]; return p; }),
    };
  }
  function restore(d, s) {
    d.layers = s.layers.slice();
    for (const p of s.props) { for (const k of LAYER_KEYS) p.L[k] = p[k]; p.L.invalidate(); }
    const sizeChanged = d.width !== s.w || d.height !== s.h;
    d.width = s.w; d.height = s.h;
    if (sizeChanged) d.composite = PE.createCanvas(s.w, s.h);
    d.activeIndex = PE.clamp(s.active, -1, d.layers.length - 1);
    d.selection = s.sel; d.paintTarget = s.target;
    d.markDirty();
    if (sizeChanged) PE.events.emit('sizechange');
    PE.events.emit('selectionchange', d.selection);
    PE.events.emit('activechange', d.active);
    PE.events.emit('docchange');
  }
  /** Run fn() as one undoable step that may change layer structure, transforms, canvases (by replacement) or doc size. */
  A.transact = function (label, fn) {
    const d = doc(); if (!d) return;
    const before = snap(d);
    const r = fn(d);
    const after = snap(d);
    PE.history.push({ label, undo: () => restore(d, before), redo: () => restore(d, after) });
    d.markDirty();
    PE.events.emit('activechange', d.active);
    PE.events.emit('docchange');
    return r;
  };
  const needLayer = (silent) => {
    const d = doc(); if (!d) return null;
    const L = d.active; if (!L && !silent) PE.toast('No layer selected', { type: 'warn' });
    return L;
  };
  const needUnlocked = () => { const L = needLayer(); if (L && L.locked) { PE.toast('Layer is locked', { type: 'warn' }); return null; } return L; };

  /* ------------------------------------------------------------ document */
  A.newDocument = function (w, h, bg, name) {
    w = PE.clamp(Math.round(w), 1, PE.MAX_DIM); h = PE.clamp(Math.round(h), 1, PE.MAX_DIM);
    const d = new PE.Doc(w, h, name || 'Untitled');
    const c = PE.createCanvas(w, h);
    if (bg && bg !== 'transparent') PE.fillCanvas(c, bg);
    d.layers.push(new PE.Layer({ img: c, name: 'Background' }));
    d.activeIndex = 0;
    A.setDocument(d);
    return d;
  };
  A.setDocument = function (d) {
    if (PE.tool && PE.tool.onDeactivate) PE.tool.onDeactivate();
    PE.preview = null;
    PE.doc = d;
    PE.history.clear();
    PE.events.emit('sizechange');
    PE.events.emit('selectionchange', null);
    PE.events.emit('activechange', d && d.active);
    PE.events.emit('docchange');
    PE.events.emit('newdoc', d);
    if (PE.view && d) PE.view.fit();
    PE.requestRender && PE.requestRender();
  };
  A.closeDocument = function () { A.setDocument(null); };
  A.openImageAsDocument = function (canvas, name) {
    const d = new PE.Doc(canvas.width, canvas.height, name || 'Image');
    d.layers.push(new PE.Layer({ img: canvas, name: name ? PE.baseName(name) : 'Background' }));
    d.activeIndex = 0;
    A.setDocument(d);
    return d;
  };
  /** Open a multi-layer document description {width,height,name,layers:[{canvas,name,left,top,opacity,blend,visible,mask:{canvas(gray),left,top}}]} */
  /** Build a Layer from a description {canvas,name,left,top,opacity,blend,visible,mask:{canvas(gray),left,top,defaultColor,disabled}} */
  A.layerFromDesc = function (l) {
    const L = new PE.Layer({ img: l.canvas, name: l.name, opacity: l.opacity, blend: l.blend, visible: l.visible, cx: (l.left || 0) + l.canvas.width / 2, cy: (l.top || 0) + l.canvas.height / 2 });
    if (l.mask && l.mask.canvas) {
      // layer-space mask: default (outside the mask rect) = defaultColor
      const g = PE.createCanvas(L.w, L.h);
      const gctx = g.getContext('2d');
      gctx.fillStyle = l.mask.defaultColor ? '#fff' : '#000'; gctx.fillRect(0, 0, L.w, L.h);
      gctx.drawImage(l.mask.canvas, (l.mask.left || 0) - (l.left || 0), (l.mask.top || 0) - (l.top || 0));
      L.mask = PE.maskFromGray(g);
      L.maskEnabled = !l.mask.disabled;
    }
    return L;
  };
  A.openLayeredDocument = function (desc) {
    const d = new PE.Doc(desc.width, desc.height, desc.name || 'Document');
    for (const l of desc.layers) d.layers.push(A.layerFromDesc(l));
    if (!d.layers.length) { const c = PE.createCanvas(d.width, d.height); d.layers.push(new PE.Layer({ img: c, name: 'Layer 1' })); }
    d.activeIndex = d.layers.length - 1;
    A.setDocument(d);
    return d;
  };
  /** Place an image as a new layer above the active one (scaled to fit if bigger than the canvas). */
  A.placeImage = function (canvas, name) {
    const d = doc(); if (!d) return A.openImageAsDocument(canvas, name);
    return A.transact('Place ' + (name || 'image'), () => {
      const L = new PE.Layer({ img: canvas, name: PE.baseName(name || 'Placed'), cx: d.width / 2, cy: d.height / 2 });
      const k = Math.min(1, d.width / L.w, d.height / L.h);
      if (k < 1) { L.sx = L.sy = k; PE.toast(`Placed "${L.name}" scaled to ${Math.round(k * 100)}% to fit the canvas`); }
      d.addLayer(L);
      return L;
    });
  };
  A.setCanvasSize = function (w, h, dx, dy, label) {
    const d = doc(); if (!d) return;
    A.transact(label || 'Canvas Size', () => { d.resizeCanvas(w, h, dx, dy); });
    PE.view.fit();
  };
  /** Canvas size dialog helper: anchor 0..8 (grid), new size */
  A.canvasSize = function (w, h, anchor) {
    const d = doc(); if (!d) return;
    const ax = anchor % 3, ay = Math.floor(anchor / 3);
    const dx = [0, (w - d.width) / 2, w - d.width][ax], dy = [0, (h - d.height) / 2, h - d.height][ay];
    A.setCanvasSize(w, h, Math.round(dx), Math.round(dy), 'Canvas Size');
  };
  A.resizeImage = function (w, h) {
    const d = doc(); if (!d) return;
    w = PE.clamp(Math.round(w), 1, PE.MAX_DIM); h = PE.clamp(Math.round(h), 1, PE.MAX_DIM);
    const fx = w / d.width, fy = h / d.height;
    A.transact('Image Size', () => {
      for (const L of d.layers) {
        if (Math.abs(fx - fy) > 1e-6 && Math.abs(L.rot) > 1e-9) {
          // non-uniform scaling of a rotated layer: bake it to doc space first
          const c = L.renderToDoc(d.width, d.height, false);
          const m = L.mask ? L.renderMaskToDoc(d.width, d.height) : null;
          L.img = c; L.mask = m; L.w = c.width; L.h = c.height; L.cx = d.width / 2; L.cy = d.height / 2; L.sx = L.sy = 1; L.rot = 0; L.type = 'raster'; L.text = null; L.invalidate();
        }
        L.cx *= fx; L.cy *= fy; L.sx *= fx; L.sy *= fy;
      }
      d.resizeCanvas(w, h, 0, 0);
    });
    PE.view.fit();
  };
  A.rotateCanvas = function (deg) {
    const d = doc(); if (!d) return;
    const rad = PE.rad(deg), cos = Math.cos(rad), sin = Math.sin(rad);
    const swap = Math.abs(deg) === 90 || Math.abs(deg) === 270;
    const W = swap ? d.height : d.width, H = swap ? d.width : d.height;
    A.transact('Rotate Canvas', () => {
      for (const L of d.layers) {
        const x = L.cx - d.width / 2, y = L.cy - d.height / 2;
        L.cx = W / 2 + x * cos - y * sin; L.cy = H / 2 + x * sin + y * cos;
        L.rot = PE.normAngle(L.rot + rad);
      }
      d.resizeCanvas(W, H, 0, 0);
    });
    PE.view.fit();
  };
  A.flipCanvas = function (dir) {
    const d = doc(); if (!d) return;
    A.transact('Flip Canvas', () => {
      for (const L of d.layers) {
        if (dir === 'h') { L.cx = d.width - L.cx; L.sx = -L.sx; L.rot = PE.normAngle(-L.rot); }
        else { L.cy = d.height - L.cy; L.sy = -L.sy; L.rot = PE.normAngle(-L.rot); }
      }
    });
  };
  A.cropToSelection = function () {
    const d = doc(); if (!d || !d.selection) { PE.toast('No selection'); return; }
    const b = d.selection.bounds();
    A.setCanvasSize(b.w, b.h, -b.x, -b.y, 'Crop');
  };
  A.trimToLayers = function () {
    const d = doc(); if (!d) return;
    const b = d.layersBounds(true); if (!b) return;
    A.setCanvasSize(Math.ceil(b.w), Math.ceil(b.h), -Math.floor(b.x), -Math.floor(b.y), 'Fit Canvas to Layers');
  };

  /* ------------------------------------------------------------ layers */
  A.newLayer = function (name) {
    const d = doc(); if (!d) return;
    return A.transact('New Layer', () => d.addLayer(new PE.Layer({ img: PE.createCanvas(d.width, d.height), name: name || `Layer ${d.layers.length + 1}`, cx: d.width / 2, cy: d.height / 2 })));
  };
  A.duplicateLayer = function () {
    const L = needLayer(); if (!L) return;
    return A.transact('Duplicate Layer', (d) => { const c = L.clone(); c.name = L.name + ' copy'; d.addLayer(c, d.indexOf(L) + 1); return c; });
  };
  A.deleteLayer = function (L) {
    L = L || needLayer(); if (!L) return;
    A.transact('Delete Layer', (d) => d.removeLayer(L));
  };
  A.renameLayer = function (L, name) { if (!L || !name || name === L.name) return; A.transact('Rename Layer', () => { L.name = name; }); };
  A.setLayerProp = function (L, key, value, label) {
    if (!L || L[key] === value) return;
    const commit = PE.history.propChange(label || 'Layer Property', L, [key], () => { doc().markDirty(L); PE.events.emit('docchange'); });
    L[key] = value; commit(); doc().markDirty(L); PE.events.emit('docchange');
  };
  A.reorderLayer = function (L, newIndex) {
    const d = doc(); if (!d || !L) return;
    if (newIndex === d.indexOf(L)) return;
    A.transact('Reorder Layers', () => d.moveLayer(L, newIndex));
  };
  A.moveLayerUp = function () { const L = needLayer(); if (L) A.reorderLayer(L, doc().indexOf(L) + 1); };
  A.moveLayerDown = function () { const L = needLayer(); if (L) A.reorderLayer(L, doc().indexOf(L) - 1); };
  A.selectLayerBelow = function () { const d = doc(); if (d && d.activeIndex > 0) d.setActive(d.activeIndex - 1); };
  A.selectLayerAbove = function () { const d = doc(); if (d && d.activeIndex < d.layers.length - 1) d.setActive(d.activeIndex + 1); };

  /** Merge a list of layers (bottom->top order) into one raster canvas covering the union of their bounds (limited to the extended doc area). */
  function mergeLayers(d, list) {
    let b = null; for (const L of list) b = PE.rectUnion(b, L.bounds());
    const x0 = Math.max(-d.width, Math.min(0, Math.floor(b.x))), y0 = Math.max(-d.height, Math.min(0, Math.floor(b.y)));
    const x1 = Math.min(2 * d.width, Math.max(d.width, Math.ceil(b.x + b.w))), y1 = Math.min(2 * d.height, Math.max(d.height, Math.ceil(b.y + b.h)));
    const c = PE.createCanvas(x1 - x0, y1 - y0);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    list.forEach((L, i) => {
      ctx.globalAlpha = i === 0 ? 1 : L.opacity;
      ctx.globalCompositeOperation = i === 0 ? 'source-over' : PE.blendToOp(L.blend);
      ctx.setTransform(...PE.matMul(PE.matTranslate(-x0, -y0), L.matrix));
      ctx.drawImage(L.effective(), 0, 0);
    });
    return { canvas: c, cx: x0 + c.width / 2, cy: y0 + c.height / 2 };
  }
  A.mergeDown = function () {
    const d = doc(); const L = needLayer(); if (!L) return;
    const i = d.indexOf(L); if (i === 0) { PE.toast('No layer below to merge with'); return; }
    const B = d.layers[i - 1];
    if (B.locked) { PE.toast('Layer below is locked', { type: 'warn' }); return; }
    A.transact('Merge Down', () => {
      const m = mergeLayers(d, [B, L]);
      B.img = m.canvas; B.w = m.canvas.width; B.h = m.canvas.height; B.cx = m.cx; B.cy = m.cy; B.sx = B.sy = 1; B.rot = 0; B.mask = null; B.type = 'raster'; B.text = null; B.invalidate();
      d.removeLayer(L); d.setActive(B);
    });
  };
  A.mergeVisible = function () {
    const d = doc(); if (!d) return;
    const vis = d.layers.filter((L) => L.visible); if (vis.length < 2) { PE.toast('Need at least two visible layers'); return; }
    A.transact('Merge Visible', () => {
      const m = mergeLayers(d, vis);
      const target = vis[0];
      target.img = m.canvas; target.w = m.canvas.width; target.h = m.canvas.height; target.cx = m.cx; target.cy = m.cy; target.sx = target.sy = 1; target.rot = 0; target.mask = null; target.opacity = 1; target.blend = 'normal'; target.type = 'raster'; target.text = null; target.invalidate();
      for (let k = 1; k < vis.length; k++) d.removeLayer(vis[k]);
      d.setActive(target);
    });
  };
  A.flatten = function () {
    const d = doc(); if (!d) return;
    A.transact('Flatten Image', () => {
      const c = d.flatten();
      const L = new PE.Layer({ img: c, name: 'Background', cx: d.width / 2, cy: d.height / 2 });
      d.layers = [L]; d.activeIndex = 0; d.paintTarget = 'img';
    });
  };
  A.rasterize = function () { const L = needUnlocked(); if (!L) return; if (L.type !== 'text' && L.isPixelAligned()) { PE.toast('Layer is already rasterized'); return; } PE.ensurePaintable(L); };

  /* ------------------------------------------------------------ transforms */
  A.flipLayer = function (dir) {
    const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange('Flip Layer', L, ['sx', 'sy', 'rot'], () => doc().markDirty(L));
    // mirror across a document-axis line through the layer center (like Photoshop): M·R(θ)·S = R(-θ)·M·S
    if (dir === 'h') L.sx = -L.sx; else L.sy = -L.sy;
    L.rot = PE.normAngle(-L.rot);
    commit(); doc().markDirty(L); PE.events.emit('docchange');
  };
  A.rotateLayer = function (deg) {
    const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange('Rotate Layer', L, ['rot'], () => doc().markDirty(L));
    L.rot = PE.normAngle(L.rot + PE.rad(deg)); commit(); doc().markDirty(L); PE.events.emit('docchange');
  };
  A.resetTransform = function () {
    const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange('Reset Transform', L, ['sx', 'sy', 'rot'], () => doc().markDirty(L));
    L.sx = 1; L.sy = 1; L.rot = 0; commit(); doc().markDirty(L); PE.events.emit('docchange');
  };
  A.fitLayer = function (mode) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange(mode === 'fill' ? 'Fill Canvas' : 'Fit to Canvas', L, ['cx', 'cy', 'sx', 'sy', 'rot'], () => d.markDirty(L));
    const k = mode === 'fill' ? Math.max(d.width / L.w, d.height / L.h) : Math.min(d.width / L.w, d.height / L.h);
    L.sx = Math.sign(L.sx || 1) * k; L.sy = Math.sign(L.sy || 1) * k; L.rot = 0; L.cx = d.width / 2; L.cy = d.height / 2;
    commit(); d.markDirty(L); PE.events.emit('docchange');
  };
  A.centerLayer = function () {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange('Center Layer', L, ['cx', 'cy'], () => d.markDirty(L));
    L.cx = d.width / 2; L.cy = d.height / 2; commit(); d.markDirty(L); PE.events.emit('docchange');
  };
  A.alignLayer = function (where) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    const commit = PE.history.propChange('Align Layer', L, ['cx', 'cy'], () => d.markDirty(L));
    const b = L.bounds();
    if (where === 'left') L.cx -= b.x; else if (where === 'right') L.cx += d.width - (b.x + b.w); else if (where === 'hcenter') L.cx += d.width / 2 - (b.x + b.w / 2);
    else if (where === 'top') L.cy -= b.y; else if (where === 'bottom') L.cy += d.height - (b.y + b.h); else if (where === 'vcenter') L.cy += d.height / 2 - (b.y + b.h / 2);
    commit(); d.markDirty(L); PE.events.emit('docchange');
  };
  A.nudgeLayer = function (dx, dy) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    // merge consecutive nudges into one history entry
    const last = PE.history.entries[PE.history.index - 1];
    if (last && last.nudge === L && PE.history.index === PE.history.entries.length && Date.now() - last.t < 1500) {
      L.cx += dx; L.cy += dy; last.after = { cx: L.cx, cy: L.cy }; last.t = Date.now();
    } else {
      const before = { cx: L.cx, cy: L.cy }; L.cx += dx; L.cy += dy;
      const e = { label: 'Nudge Layer', nudge: L, t: Date.now(), after: { cx: L.cx, cy: L.cy }, undo() { Object.assign(L, before); d.markDirty(L); }, redo() { Object.assign(L, e.after); d.markDirty(L); } };
      PE.history.push(e);
    }
    d.markDirty(L); PE.events.emit('docchange');
  };

  /* ------------------------------------------------------------ masks */
  A.addMask = function (kind) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    if (L.mask) { PE.toast('Layer already has a mask'); return; }
    A.transact('Add Layer Mask', () => {
      let m;
      if ((kind === 'selection' || kind === 'hideSelection') && d.selection) {
        m = d.selection.toLayerCanvas(L);
        if (kind === 'hideSelection') { const inv = PE.solidMask(L.w, L.h, 1); const ctx = inv.getContext('2d'); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, 0, 0); m = inv; }
        d.selection = null;
      } else m = PE.solidMask(L.w, L.h, kind === 'hide' ? 0 : 1);
      L.mask = m; L.maskEnabled = true; L.invalidate(); d.paintTarget = 'mask';
    });
    PE.events.emit('selectionchange', d.selection);
  };
  A.deleteMask = function () {
    const L = needUnlocked(); if (!L || !L.mask) return;
    A.transact('Delete Layer Mask', (d) => { L.mask = null; L.invalidate(); d.paintTarget = 'img'; });
  };
  A.applyMask = function () {
    const L = needUnlocked(); if (!L || !L.mask) return;
    A.transact('Apply Layer Mask', (d) => {
      const c = PE.copyCanvas(L.img); const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(L.mask, 0, 0);
      L.img = c; L.mask = null; L.type = 'raster'; L.text = null; L.invalidate(); d.paintTarget = 'img';
    });
  };
  A.toggleMask = function () { const L = needLayer(); if (!L || !L.mask) return; A.setLayerProp(L, 'maskEnabled', !L.maskEnabled, L.maskEnabled ? 'Disable Mask' : 'Enable Mask'); };
  A.invertMask = function () {
    const L = needUnlocked(); if (!L || !L.mask) return;
    A.transact('Invert Mask', () => {
      const inv = PE.solidMask(L.w, L.h, 1); const ctx = inv.getContext('2d');
      ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(L.mask, 0, 0);
      L.mask = inv; L.invalidate();
    });
  };
  A.setPaintTarget = function (t) { const d = doc(); if (!d) return; const L = d.active; d.paintTarget = t === 'mask' && L && L.mask ? 'mask' : 'img'; PE.events.emit('docchange'); };

  /* ------------------------------------------------------------ selection */
  A.setSelection = function (sel, label) {
    const d = doc(); if (!d) return;
    const before = d.selection;
    if (sel && sel.isEmpty()) sel = null;
    if (before === sel) return;
    d.setSelection(sel);
    const after = d.selection;
    PE.history.push({ label: label || 'Selection', undo() { d.setSelection(before); }, redo() { d.setSelection(after); } });
  };
  A.selectAll = function () { const d = doc(); if (d) A.setSelection(PE.Selection.all(d.width, d.height), 'Select All'); };
  A.deselect = function () { const d = doc(); if (d && d.selection) A.setSelection(null, 'Deselect'); };
  A.invertSelection = function () { const d = doc(); if (!d) return; A.setSelection(d.selection ? d.selection.invert() : null, 'Inverse Selection'); };
  A.featherSelection = function (px) { const d = doc(); if (!d || !d.selection) { PE.toast('No selection'); return; } A.setSelection(d.selection.feather(px), 'Feather'); };
  A.expandSelection = function (px) { const d = doc(); if (!d || !d.selection) { PE.toast('No selection'); return; } A.setSelection(d.selection.expand(px), 'Expand Selection'); };
  A.contractSelection = function (px) { const d = doc(); if (!d || !d.selection) { PE.toast('No selection'); return; } A.setSelection(d.selection.contract(px), 'Contract Selection'); };
  A.selectLayerPixels = function (L) { const d = doc(); L = L || needLayer(); if (!d || !L) return; A.setSelection(PE.Selection.fromCanvasAlpha(L.renderToDoc(d.width, d.height)), 'Select Layer Pixels'); };
  A.maskToSelection = function () { const d = doc(); const L = needLayer(); if (!d || !L || !L.mask) { PE.toast('Layer has no mask'); return; } A.setSelection(PE.Selection.fromCanvasAlpha(L.renderMaskToDoc(d.width, d.height)), 'Load Mask as Selection'); };

  /* ------------------------------------------------------------ pixels: clear / fill / copy / paste */
  function coverageFromSelection(L, d) {
    return d.selection ? d.selection.toLayerCanvas(L) : PE.solidMask(L.w, L.h, 1);
  }
  A.clearSelected = function () {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    if (!d.selection && d.paintTarget !== 'mask') { PE.toast('Nothing selected — make a selection first (Ctrl+A for all)'); return; }
    if (d.paintTarget === 'mask' && L.mask) PE.applyCoverage({ layer: L, target: 'mask', canvas: coverageFromSelection(L, d), value: 0, label: 'Clear (mask)' });
    else { if (L.type === 'text') PE.ensurePaintable(L); PE.applyCoverage({ layer: L, target: 'img', canvas: coverageFromSelection(L, d), mode: 'erase', label: 'Clear' }); }
  };
  A.fillSelection = function (rgb, label) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    const cov = coverageFromSelection(L, d);
    if (d.paintTarget === 'mask' && L.mask) { PE.applyCoverage({ layer: L, target: 'mask', canvas: cov, value: PE.luma(...rgb), label: label || 'Fill (mask)' }); return; }
    if (L.type === 'text') PE.ensurePaintable(L);
    const c = PE.createCanvas(L.w, L.h); const ctx = c.getContext('2d');
    ctx.fillStyle = PE.rgbStr(rgb); ctx.fillRect(0, 0, L.w, L.h);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(cov, 0, 0);
    PE.applyCoverage({ layer: L, target: 'img', canvas: c, label: label || 'Fill' });
  };
  PE.clipboard = null; // {canvas, x, y}
  A.copy = function (merged) {
    const d = doc(); if (!d) return;
    const L = d.active;
    if (!merged && !L) { PE.toast('No layer selected'); return; }
    let src = merged ? d.flatten() : L.renderToDoc(d.width, d.height);
    let r = d.selection ? d.selection.bounds() : (merged ? { x: 0, y: 0, w: d.width, h: d.height } : PE.rectClampInt(L.bounds(), d.width, d.height));
    if (!r) { PE.toast('Layer has no pixels inside the canvas'); return; }
    const c = PE.createCanvas(r.w, r.h); const ctx = c.getContext('2d');
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (d.selection) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(d.selection.canvas(), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); }
    PE.clipboard = { canvas: c, x: r.x, y: r.y };
    // also try the system clipboard so other apps can paste it
    if (navigator.clipboard && window.ClipboardItem) {
      PE.canvasToBlob(c, 'image/png').then((blob) => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])).catch(() => {});
    }
    PE.toast(merged ? 'Copied merged pixels' : 'Copied');
  };
  A.cut = function () { const d = doc(); if (!d) return; A.copy(false); if (d.selection) A.clearSelected(); };
  A.paste = function () {
    const d = doc(); const cb = PE.clipboard;
    if (!cb) { PE.toast('Clipboard is empty (use Ctrl+V after copying an image from another app, or Copy here first)'); return; }
    if (!d) { A.openImageAsDocument(PE.copyCanvas(cb.canvas), 'Pasted'); return; }
    A.transact('Paste', () => {
      const L = new PE.Layer({ img: PE.copyCanvas(cb.canvas), name: 'Pasted', cx: cb.x + cb.canvas.width / 2, cy: cb.y + cb.canvas.height / 2 });
      if (cb.x + cb.canvas.width > d.width || cb.y + cb.canvas.height > d.height || cb.x < 0 || cb.y < 0) { L.cx = d.width / 2; L.cy = d.height / 2; }
      d.addLayer(L);
    });
  };
  A.layerViaCopy = function () {
    const d = doc(); const L = needLayer(); if (!L) return;
    if (!d.selection) { A.duplicateLayer(); return; }
    const r = d.selection.bounds();
    const src = L.renderToDoc(d.width, d.height);
    const c = PE.createCanvas(r.w, r.h); const ctx = c.getContext('2d');
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(d.selection.canvas(), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    A.transact('Layer Via Copy', () => { d.addLayer(new PE.Layer({ img: c, name: L.name + ' (copy)', cx: r.x + r.w / 2, cy: r.y + r.h / 2 }), d.indexOf(L) + 1); d.selection = null; });
    PE.events.emit('selectionchange', null);
  };

  /* ------------------------------------------------------------ text layers */
  A.addTextLayer = function (props, x, y) {
    const d = doc(); if (!d) return;
    const c = PE.renderText(props);
    return A.transact('Add Text', () => d.addLayer(new PE.Layer({ img: c, type: 'text', text: props, name: props.text.split('\n')[0].slice(0, 24) || 'Text', cx: x + c.width / 2, cy: y + c.height / 2 })));
  };
  A.updateTextLayer = function (L, props) {
    const d = doc(); if (!d || !L) return;
    const c = PE.renderText(props);
    A.transact('Edit Text', () => {
      const b = L.bounds();
      L.img = c; L.w = c.width; L.h = c.height; L.text = props; L.name = props.text.split('\n')[0].slice(0, 24) || 'Text';
      if (L.mask) L.mask = PE.scaleCanvas(L.mask, c.width, c.height);
      const nb = L.bounds(); L.cx += b.x - nb.x; L.cy += b.y - nb.y;
      L.invalidate();
    });
  };

  /* ------------------------------------------------------------ adjustments (with live preview) */
  /**
   * Start an adjustment session on the active layer (image or mask target).
   * session.preview(fn) where fn(ImageData) -> ImageData, or session.previewCanvas(fn) where fn(canvas)->canvas
   */
  A.startAdjustment = function () {
    const d = doc(); const L = needUnlocked(); if (!L) return null;
    const useMask = d.paintTarget === 'mask' && !!L.mask;
    const orig = useMask ? L.mask : L.img;
    const srcCanvas = useMask ? L.maskAsGray() : orig;
    const origData = PE.getImageData(srcCanvas);
    const selMask = d.selection ? d.selection.toLayerSpace(L) : null;
    let current = orig;
    const finish = (resultCanvas) => {
      let out = resultCanvas;
      if (selMask) {
        // blend result with original by selection amount
        const rd = PE.getImageData(resultCanvas), o = origData.data, r = rd.data;
        for (let i = 0, j = 0; i < selMask.length; i++, j += 4) {
          const m = selMask[i] / 255;
          if (m >= 1) continue;
          r[j] = o[j] + (r[j] - o[j]) * m; r[j + 1] = o[j + 1] + (r[j + 1] - o[j + 1]) * m; r[j + 2] = o[j + 2] + (r[j + 2] - o[j + 2]) * m; r[j + 3] = o[j + 3] + (r[j + 3] - o[j + 3]) * m;
        }
        out = PE.canvasFromImageData(rd);
      }
      if (useMask) out = PE.maskFromGray(out);
      current = out;
      if (useMask) L.mask = out; else L.img = out;
      L.invalidate(); d.markDirty(L);
    };
    return {
      layer: L, target: useMask ? 'mask' : 'img', origData,
      preview(fn) { finish(PE.canvasFromImageData(fn(origData))); },
      previewCanvas(fn) { finish(fn(srcCanvas)); },
      cancel() { if (useMask) L.mask = orig; else L.img = orig; L.invalidate(); d.markDirty(L); },
      commit(label) {
        if (current === orig) return false;
        const after = current;
        PE.history.push({
          label, bytes: after.width * after.height * 4,
          undo() { if (useMask) L.mask = orig; else L.img = orig; L.invalidate(); d.markDirty(L); },
          redo() { if (useMask) L.mask = after; else L.img = after; L.invalidate(); d.markDirty(L); },
        });
        return true;
      },
    };
  };
  /** Apply a one-shot ImageData filter with no dialog */
  A.applyFilterNow = function (label, fn) {
    const s = A.startAdjustment(); if (!s) return;
    s.preview(fn); s.commit(label);
  };
  /* ------------------------------------------------------------ perspective */
  /** Bake a perspective warp (H maps layer bitmap px -> doc px, quad = destination corners) into the layer. */
  A.applyPerspective = function (L, H, quad) {
    const d = doc(); if (!d || !L) return;
    const b = PE.pointsBounds(quad);
    const x0 = Math.max(-d.width, Math.floor(b.x)), y0 = Math.max(-d.height, Math.floor(b.y));
    const x1 = Math.min(2 * d.width, Math.ceil(b.x + b.w)), y1 = Math.min(2 * d.height, Math.ceil(b.y + b.h));
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (rect.w < 1 || rect.h < 1) { PE.toast('The shape is outside the workable area', { type: 'warn' }); return; }
    const img = PE.warpPerspective(L.img, H, rect);
    const mask = L.mask ? PE.warpPerspective(L.mask, H, rect) : null;
    A.transact('Perspective', () => {
      L.img = img; L.mask = mask; L.w = img.width; L.h = img.height;
      L.cx = rect.x + rect.w / 2; L.cy = rect.y + rect.h / 2; L.sx = 1; L.sy = 1; L.rot = 0; L.type = 'raster'; L.text = null; L._aiMask = null;
      L.invalidate();
    });
  };

  /* ------------------------------------------------------------ background removal */
  A.removeBackgroundAI = async function (o) {
    const d = doc(); const L = needUnlocked(); if (!L) return false;
    o = o || {};
    PE.ui && PE.ui.busy(true, 'Removing background…');
    try {
      const t0 = performance.now();
      const raw = await PE.ai.segment(L.img);
      const refined = PE.ai.refineMask(raw, o);
      A.transact('Remove Background (AI)', () => { L._aiMask = raw; L.mask = refined; L.maskEnabled = true; L.invalidate(); d.paintTarget = 'mask'; });
      PE.toast(`Background removed in ${((performance.now() - t0) / 1000).toFixed(1)} s. Use the Background Eraser / Restore brush to fix any spots.`, { ms: 6000 });
      return true;
    } catch (e) {
      console.error(e);
      PE.toast('Background removal failed: ' + e.message, { type: 'error', ms: 9000 });
      return false;
    } finally { PE.ui && PE.ui.busy(false); }
  };
  A.refineAIMask = function (o) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    if (!L._aiMask) { PE.toast('Run "Remove background (AI)" on this layer first'); return; }
    const refined = PE.ai.refineMask(L._aiMask, o);
    A.transact('Refine Background Mask', () => { L.mask = refined; L.maskEnabled = true; L.invalidate(); d.paintTarget = 'mask'; });
  };
  /** Hide pixels similar to rgb (within tol) on the active layer's mask; seed = doc point for contiguous mode. */
  A.removeBackgroundColor = function (rgb, tol, contiguous, seed) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    if (L.type === 'text') PE.ensurePaintable(L);
    const id = PE.getImageData(L.img), W = id.width, H = id.height, dd = id.data;
    let cov;
    if (contiguous && seed) {
      const [lx, ly] = L.toLocal(seed.x, seed.y);
      if (lx < 0 || ly < 0 || lx >= W || ly >= H) { PE.toast('Click inside the layer'); return; }
      cov = PE.floodSelect(id, lx, ly, tol, true);
    } else {
      cov = new Uint8ClampedArray(W * H);
      const soft = tol * 0.5 + 4;
      for (let i = 0, j = 0; i < cov.length; i++, j += 4) {
        if (dd[j + 3] < 8) continue;
        const cd = Math.max(Math.abs(dd[j] - rgb[0]), Math.abs(dd[j + 1] - rgb[1]), Math.abs(dd[j + 2] - rgb[2]));
        if (cd <= tol) cov[i] = 255; else if (cd < tol + soft) cov[i] = Math.round(255 * (1 - (cd - tol) / soft));
      }
    }
    const covId = new ImageData(W, H), cd2 = covId.data;
    let n = 0;
    for (let i = 0, j = 0; i < cov.length; i++, j += 4) if (cov[i]) { cd2[j] = 255; cd2[j + 1] = 255; cd2[j + 2] = 255; cd2[j + 3] = cov[i]; n++; }
    if (!n) { PE.toast('No matching pixels'); return; }
    const covCanvas = PE.canvasFromImageData(covId);
    const smooth = PE.createCanvas(W, H); const sctx = smooth.getContext('2d');
    sctx.filter = 'blur(0.7px)'; sctx.drawImage(covCanvas, 0, 0); sctx.filter = 'none';
    const mask = L.mask ? PE.copyCanvas(L.mask) : PE.solidMask(W, H, 1);
    const mctx = mask.getContext('2d'); mctx.globalCompositeOperation = 'destination-out'; mctx.drawImage(smooth, 0, 0);
    A.transact('Remove Background (color)', () => { L.mask = mask; L.maskEnabled = true; L.invalidate(); d.paintTarget = 'mask'; });
    PE.toast(`Hid ${n.toLocaleString()} pixels on the mask. Paint white to restore, black to hide more.`);
  };

  A.matchColorToBelow = function (amount) {
    const d = doc(); const L = needUnlocked(); if (!L) return;
    const i = d.indexOf(L); if (i === 0) { PE.toast('No layer below to match'); return; }
    const ref = PE.getImageData(d.layers[i - 1].renderToDoc(d.width, d.height));
    A.applyFilterNow('Match Color', (src) => PE.filters.matchColor(src, { ref, amount: amount === undefined ? 100 : amount }));
  };
})();
