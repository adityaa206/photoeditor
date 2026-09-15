/* PhotoEditor - app.js : viewport rendering, input handling, shortcuts, bootstrap */
(function () {
  'use strict';
  const PE = window.PE;

  PE.doc = null;
  PE.preview = null;
  PE.fg = [0, 0, 0]; PE.bg = [255, 255, 255];
  PE.settings = { showAnts: true, showBounds: true, maskOverlay: false, maskView: false, checker: true, pixelGrid: true };
  PE.pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, down: false };

  PE.setFg = (rgb) => { if (!rgb) return; PE.fg = rgb.map((v) => PE.clamp(Math.round(v), 0, 255)); PE.events.emit('colorchange'); };
  PE.setBg = (rgb) => { if (!rgb) return; PE.bg = rgb.map((v) => PE.clamp(Math.round(v), 0, 255)); PE.events.emit('colorchange'); };
  PE.swapColors = () => { const t = PE.fg; PE.fg = PE.bg; PE.bg = t; PE.events.emit('colorchange'); };
  PE.defaultColors = () => { const onMask = PE.doc && PE.doc.paintTarget === 'mask'; PE.fg = onMask ? [255, 255, 255] : [0, 0, 0]; PE.bg = onMask ? [0, 0, 0] : [255, 255, 255]; PE.events.emit('colorchange'); };

  /* ------------------------------------------------------------ view */
  const canvas = PE.$('#view');
  const ctx = canvas.getContext('2d');
  const viewport = PE.$('#viewport');
  const view = (PE.view = {
    zoom: 1, panX: 0, panY: 0, dpr: window.devicePixelRatio || 1, width: 0, height: 0,
    docToScreen(x, y) { return [x * this.zoom + this.panX, y * this.zoom + this.panY]; },
    screenToDoc(sx, sy) { return [(sx - this.panX) / this.zoom, (sy - this.panY) / this.zoom]; },
    setZoom(z, ax, ay) {
      z = PE.clamp(z, 0.02, 64);
      if (ax === undefined) { ax = this.width / 2; ay = this.height / 2; }
      const [dx, dy] = this.screenToDoc(ax, ay);
      this.zoom = z;
      this.panX = ax - dx * z; this.panY = ay - dy * z;
      PE.requestRender(); PE.events.emit('viewchange');
    },
    zoomIn() { this.setZoom(this.zoom * 1.25); },
    zoomOut() { this.setZoom(this.zoom / 1.25); },
    fit() {
      const d = PE.doc; if (!d) return;
      const pad = 40;
      const z = Math.min((this.width - pad) / d.width, (this.height - pad) / d.height, 8);
      this.zoom = Math.max(0.02, z);
      this.panX = (this.width - d.width * this.zoom) / 2; this.panY = (this.height - d.height * this.zoom) / 2;
      PE.requestRender(); PE.events.emit('viewchange');
    },
    center() { const d = PE.doc; if (!d) return; this.panX = (this.width - d.width * this.zoom) / 2; this.panY = (this.height - d.height * this.zoom) / 2; PE.requestRender(); },
  });
  function resize() {
    const r = viewport.getBoundingClientRect();
    view.dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    const first = view.width === 0;
    const cxOld = view.width / 2, cyOld = view.height / 2;
    view.width = w; view.height = h;
    canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
    if (first && PE.doc) view.fit(); else { view.panX += w / 2 - cxOld; view.panY += h / 2 - cyOld; }
    PE.requestRender();
  }
  new ResizeObserver(resize).observe(viewport);

  /* ------------------------------------------------------------ rendering */
  let renderQueued = false;
  PE.requestRender = function () { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; draw(); }); };
  let checker = null;
  function getChecker() {
    if (checker) return checker;
    const p = PE.createCanvas(16, 16); const pc = p.getContext('2d');
    pc.fillStyle = '#bcbcbc'; pc.fillRect(0, 0, 16, 16); pc.fillStyle = '#8a8a8a'; pc.fillRect(0, 0, 8, 8); pc.fillRect(8, 8, 8, 8);
    checker = ctx.createPattern(p, 'repeat');
    return checker;
  }
  let antsPhase = 0;
  setInterval(() => { if (PE.doc && PE.doc.selection && PE.settings.showAnts) { antsPhase = (antsPhase + 1) % 8; PE.requestRender(); } }, 120);

  function draw() {
    const d = PE.doc;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, view.width, view.height);
    if (!d) return;
    const z = view.zoom;
    const [ox, oy] = view.docToScreen(0, 0);
    const sw = d.width * z, sh = d.height * z;
    // canvas shadow + checkerboard
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 20; ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, sw, sh);
    ctx.restore();
    ctx.fillStyle = PE.settings.checker ? getChecker() : '#fff';
    ctx.fillRect(ox, oy, sw, sh);
    // composite
    if (d.compositeDirty || PE.preview) d.render(PE.preview);
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, sw, sh); ctx.clip();
    ctx.imageSmoothingEnabled = z < 1 || Math.abs(z - Math.round(z)) > 0.001 && z < 2;
    ctx.imageSmoothingQuality = 'high';
    if (PE.settings.maskView && d.active && d.active.mask) {
      const L = d.active;
      const mc = PE.createCanvas(d.width, d.height); const mctx = mc.getContext('2d');
      mctx.fillStyle = '#000'; mctx.fillRect(0, 0, d.width, d.height);
      mctx.setTransform(...L.matrix); mctx.drawImage(L.mask, 0, 0);
      ctx.drawImage(mc, ox, oy, sw, sh);
    } else {
      ctx.drawImage(d.composite, ox, oy, sw, sh);
      if (PE.settings.maskOverlay && d.active && d.active.mask && d.active.maskEnabled) {
        const L = d.active;
        const oc = PE.createCanvas(d.width, d.height); const octx = oc.getContext('2d');
        octx.fillStyle = 'rgba(255,0,0,0.5)'; octx.fillRect(0, 0, d.width, d.height);
        octx.globalCompositeOperation = 'destination-out'; octx.setTransform(...L.matrix); octx.drawImage(L.mask, 0, 0);
        ctx.drawImage(oc, ox, oy, sw, sh);
      }
    }
    // pixel grid
    if (PE.settings.pixelGrid && z >= 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-ox / z)), x1 = Math.min(d.width, Math.ceil((view.width - ox) / z));
      const y0 = Math.max(0, Math.floor(-oy / z)), y1 = Math.min(d.height, Math.ceil((view.height - oy) / z));
      for (let x = x0; x <= x1; x++) { const sx = Math.round(ox + x * z) + 0.5; ctx.moveTo(sx, oy + y0 * z); ctx.lineTo(sx, oy + y1 * z); }
      for (let y = y0; y <= y1; y++) { const sy = Math.round(oy + y * z) + 0.5; ctx.moveTo(ox + x0 * z, sy); ctx.lineTo(ox + x1 * z, sy); }
      ctx.stroke();
    }
    ctx.restore();
    // selection marching ants
    if (d.selection && PE.settings.showAnts) {
      const path = d.selection.path();
      ctx.save();
      ctx.setTransform(view.dpr * z, 0, 0, view.dpr * z, view.dpr * view.panX, view.dpr * view.panY);
      ctx.lineWidth = 1 / z; ctx.strokeStyle = '#fff'; ctx.setLineDash([]); ctx.stroke(path);
      ctx.strokeStyle = '#000'; ctx.setLineDash([4 / z, 4 / z]); ctx.lineDashOffset = -antsPhase / z; ctx.stroke(path);
      ctx.restore();
    }
    // tool overlay
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (PE.tool && PE.tool.draw) { try { PE.tool.draw(ctx); } catch (e) { console.error(e); } }
    if (PE.tool && !PE.tool.isBrush && PE.tool.id !== 'move' && PE.tool.id !== 'transform' && PE.settings.showBounds && d.active && PE.tool.id !== 'crop') {
      // faint bounds of the active layer
      const pts = d.active.corners().map((c) => view.docToScreen(c[0], c[1]));
      ctx.strokeStyle = 'rgba(80,160,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
    }
    updateStatus();
  }

  /* ------------------------------------------------------------ status bar */
  function updateStatus() {
    const d = PE.doc;
    const L = d && d.active;
    PE.$('#status-left').textContent = d ? `${d.name} · ${d.width}×${d.height}px · ${Math.round(view.zoom * 100)}%` : 'No document';
    PE.$('#status-mid').textContent = PE.tool ? (PE.TOOL_HINTS[PE.tool.id] || PE.tool.name) : '';
    const p = PE.pointer;
    const where = d && p.inside ? ` · x ${Math.floor(p.x)}, y ${Math.floor(p.y)}` : '';
    PE.$('#status-right').textContent = d ? (L ? `${d.paintTarget === 'mask' && L.mask ? 'Mask of ' : ''}${L.name}${L.locked ? ' (locked)' : ''}` : 'No layer') + (d.selection ? ' · selection' : '') + where : '';
  }

  /* ------------------------------------------------------------ pointer input */
  PE.eventScreen = function (e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let spaceDown = false, panDrag = null, activePointer = null;
  function updateCursor(sx, sy) {
    let c = PE.tool ? PE.tool.cursor || 'default' : 'default';
    if (spaceDown || panDrag) c = panDrag ? 'grabbing' : 'grab';
    else if (PE.tool && PE.tool.cursorFor && sx !== undefined) c = PE.tool.cursorFor(sx, sy);
    canvas.style.cursor = c;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (PE.ui.isDialogOpen()) return;
    PE.ui.closeMenus();
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.classList.contains('text-editor')) document.activeElement.blur();
    const [sx, sy] = PE.eventScreen(e);
    e.sx = sx; e.sy = sy;
    if (e.button === 1 || spaceDown || (e.button === 0 && PE.tool && PE.tool.id === 'hand')) {
      panDrag = { sx, sy, px: view.panX, py: view.panY }; activePointer = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} updateCursor(); e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    if (!PE.doc || !PE.tool) return;
    activePointer = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const [x, y] = view.screenToDoc(sx, sy);
    PE.pointer.down = true;
    try { PE.tool.onDown({ x, y }, e); } catch (err) { console.error(err); PE.toast(err.message, { type: 'error' }); }
    PE.requestRender();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = PE.eventScreen(e);
    e.sx = sx; e.sy = sy;
    const [x, y] = view.screenToDoc(sx, sy);
    Object.assign(PE.pointer, { x, y, sx, sy, inside: true });
    if (panDrag) { view.panX = panDrag.px + (sx - panDrag.sx); view.panY = panDrag.py + (sy - panDrag.sy); PE.requestRender(); return; }
    if (PE.doc && PE.tool && PE.pointer.down) { try { PE.tool.onMove({ x, y }, e); } catch (err) { console.error(err); } }
    else updateCursor(sx, sy);
    PE.requestRender();
  });
  const endPointer = (e) => {
    const [sx, sy] = PE.eventScreen(e);
    e.sx = sx; e.sy = sy;
    if (panDrag) { panDrag = null; updateCursor(sx, sy); if (activePointer !== null) { try { canvas.releasePointerCapture(activePointer); } catch (_) {} activePointer = null; } return; }
    if (!PE.pointer.down) return;
    PE.pointer.down = false;
    if (activePointer !== null) { try { canvas.releasePointerCapture(activePointer); } catch (_) {} activePointer = null; }
    const [x, y] = view.screenToDoc(sx, sy);
    if (PE.doc && PE.tool) { try { PE.tool.onUp({ x, y }, e); } catch (err) { console.error(err); PE.toast(err.message, { type: 'error' }); } }
    PE.requestRender();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { PE.pointer.inside = false; PE.requestRender(); });
  canvas.addEventListener('pointerenter', () => { PE.pointer.inside = true; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', () => { if (PE.tool && PE.tool.id === 'transform') PE.setTool('move'); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!PE.doc) return;
    const [sx, sy] = PE.eventScreen(e);
    if (e.shiftKey && !e.ctrlKey) { view.panX -= e.deltaY; PE.requestRender(); return; }
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.setZoom(view.zoom * factor, sx, sy);
  }, { passive: false });

  /* ------------------------------------------------------------ keyboard */
  function keyString(e) {
    let k = e.key;
    if (k === ' ') k = 'Space';
    else if (k.length === 1) k = k.toUpperCase();
    const mods = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '');
    return mods + k;
  }
  const toolKeys = {};
  for (const id of PE.toolOrder) toolKeys[PE.tools[id].key] = id;
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !PE.isEditableTarget(e.target)) { if (!spaceDown) { spaceDown = true; updateCursor(); } e.preventDefault(); return; }
    if (PE.isEditableTarget(e.target) || PE.ui.isDialogOpen()) return;
    const ks = keyString(e);
    const isMod = e.ctrlKey || e.metaKey || e.altKey;
    // tool-specific keys first (Enter / Escape / Backspace)
    if (PE.tool && PE.tool.onKey && !isMod && PE.tool.onKey(e)) { e.preventDefault(); return; }
    const menu = PE.ui.shortcutMap();
    let entry = menu[ks];
    if (!entry && ks === 'Ctrl+Shift+=') entry = menu['Ctrl+='];
    if (!entry && ks === 'Backspace') entry = menu['Delete'];
    if (entry) { if (!entry.enabled || entry.enabled()) { try { entry.run(); } catch (err) { console.error(err); PE.toast(err.message, { type: 'error' }); } } e.preventDefault(); return; }
    if (!isMod || ks === 'Ctrl+T') {
      const tid = toolKeys[ks];
      if (tid) { PE.setTool(tid); e.preventDefault(); return; }
    }
    if (isMod) return;
    const t = PE.tool;
    switch (ks) {
      case 'X': PE.swapColors(); break;
      case 'D': PE.defaultColors(); break;
      case '[': case ']': if (t && t.isBrush) { const o = PE.opts[t.id]; const step = o.size < 10 ? 1 : o.size < 50 ? 5 : o.size < 200 ? 10 : 50; o.size = PE.clamp(o.size + (ks === ']' ? step : -step), 1, 3000); PE.ui.refreshOptions(); PE.requestRender(); } break;
      case 'Shift+{': case 'Shift+}': if (t && t.isBrush) { const o = PE.opts[t.id]; o.hardness = PE.clamp(o.hardness + (ks === 'Shift+}' ? 10 : -10), 0, 100); PE.ui.refreshOptions(); } break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': case 'Shift+ArrowLeft': case 'Shift+ArrowRight': case 'Shift+ArrowUp': case 'Shift+ArrowDown': {
        if (!PE.doc || !PE.doc.active) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = ks.endsWith('Left') ? -step : ks.endsWith('Right') ? step : 0, dy = ks.endsWith('Up') ? -step : ks.endsWith('Down') ? step : 0;
        PE.actions.nudgeLayer(dx, dy); break;
      }
      case 'Escape': if (PE.doc && PE.doc.selection) PE.actions.deselect(); break;
      default: return;
    }
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; updateCursor(); } });
  window.addEventListener('blur', () => { spaceDown = false; });

  /* ------------------------------------------------------------ drag & drop / paste */
  let dragCounter = 0;
  const dz = PE.$('#dropzone');
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragCounter++; dz.hidden = false; } });
  window.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (!dragCounter) dz.hidden = true; });
  window.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragCounter = 0; dz.hidden = true;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) PE.io.importFiles(files, { asNew: !PE.doc });
  });
  document.addEventListener('paste', (e) => {
    if (PE.isEditableTarget(e.target) || PE.ui.isDialogOpen()) return;
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const files = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); PE.io.importFiles(files, { asNew: !PE.doc }); return; }
    if (PE.clipboard) { e.preventDefault(); PE.actions.paste(); }
  });
  window.addEventListener('beforeunload', (e) => { if (PE.doc && PE.history.entries.length) { e.preventDefault(); e.returnValue = ''; } });

  /* ------------------------------------------------------------ bootstrap */
  PE.$('#file-input').setAttribute('accept', PE.io.ACCEPT);
  PE.ui.init();
  PE.setTool('move');
  PE.events.on('toolchange', () => { updateCursor(); updateStatus(); });
  PE.events.on('docchange', PE.requestRender);
  PE.events.on('selectionchange', PE.requestRender);
  PE.events.on('activechange', () => { PE.requestRender(); if (PE.tool && PE.tool.liveValues) PE.ui.refreshOptionValues(); });
  PE.events.on('newdoc', () => { PE.$('#welcome').hidden = !!PE.doc; });
  resize();
  PE.$('#welcome').hidden = false;
  console.log('PhotoEditor ready', PE.VERSION);
})();
