/* PhotoEditor - ui.js : menus, toolbox, options bar, panels, dialogs */
(function () {
  'use strict';
  const PE = window.PE;
  const UI = (PE.ui = {});
  const A = () => PE.actions;
  const doc = () => PE.doc;
  const el = PE.el;

  /* ------------------------------------------------------------ icons */
  const ICONS = {
    move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    transform: '<rect x="5" y="5" width="14" height="14"/><rect x="3" y="3" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4" fill="currentColor"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="17" width="4" height="4" fill="currentColor"/>',
    marqueeRect: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>',
    marqueeEllipse: '<ellipse cx="12" cy="12" rx="8" ry="6" stroke-dasharray="3 2"/>',
    lasso: '<path d="M12 4c5 0 8 2.5 8 5.5S16 15 12 15 4 12.5 4 9.5 7 4 12 4z" stroke-dasharray="3 2"/><path d="M9 14c-1 3 0 5 2 7"/>',
    polyLasso: '<path d="M5 6l9-2 6 6-3 9-10-2z" stroke-dasharray="3 2"/>',
    wand: '<path d="M4 20l9-9"/><path d="M15 3l1 2.5 2.5 1-2.5 1L15 10l-1-2.5L11.5 6.5 14 5.5z" fill="currentColor"/><path d="M19 12l.5 1.5L21 14l-1.5.5L19 16l-.5-1.5L17 14l1.5-.5z" fill="currentColor"/>',
    crop: '<path d="M7 2v15h15M2 7h15v15"/>',
    eyedropper: '<path d="M4 20l1-4 9-9 3 3-9 9zM13 6l2-2a2 2 0 013 3l-2 2"/>',
    brush: '<path d="M4 20c0-3 1-4 3-4s3 1 3 3-1 3-3 3-3-1-3-2z"/><path d="M9 15L19 4l2 2L11 17"/>',
    eraser: '<path d="M4 15l8-8 6 6-6 6H8z"/><path d="M8 19h12"/>',
    clone: '<path d="M8 10h8v4H8z"/><path d="M12 4v6M6 14v6h12v-6"/>',
    gradient: '<defs><linearGradient id="gi" x1="0" x2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><rect x="4" y="5" width="16" height="14" fill="url(#gi)"/>',
    bucket: '<path d="M5 11l7-7 8 8-7 7z"/><path d="M12 4v4"/><path d="M19 15c1 2 2 3 2 4a2 2 0 01-4 0c0-1 1-2 2-4z" fill="currentColor"/>',
    text: '<path d="M5 5h14M12 5v15M9 20h6"/>',
    shape: '<rect x="3" y="3" width="11" height="11"/><circle cx="16" cy="16" r="5"/>',
    hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4a1.5 1.5 0 013 0v7M14 11V6a1.5 1.5 0 013 0v7"/><path d="M8 12l-2-2a1.5 1.5 0 00-2 2l4 6c1 2 3 3 6 3s5-2 5-6v-4"/>',
    perspective: '<path d="M7 5h10l3 14H4z"/><path d="M10.3 5l-1.3 14M13.7 5l1.3 14M6 12h12"/><rect x="5" y="3" width="4" height="4" fill="currentColor"/><rect x="15" y="3" width="4" height="4" fill="currentColor"/><rect x="2" y="17" width="4" height="4" fill="currentColor"/><rect x="18" y="17" width="4" height="4" fill="currentColor"/>',
    bgEraser: '<path d="M4 15l8-8 6 6-6 6H8z"/><path d="M8 19h12"/><circle cx="17" cy="6" r="3" stroke-dasharray="2 1.5"/>',
    zoom: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6M8 10h4M10 8v4"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

  /* ------------------------------------------------------------ menus */
  const SEP = { sep: true };
  const hasDoc = () => !!doc();
  const hasLayer = () => !!(doc() && doc().active);
  const hasMask = () => !!(doc() && doc().active && doc().active.mask);
  const hasSel = () => !!(doc() && doc().selection);
  UI.menus = [
    { title: 'File', items: [
      { label: 'New…', key: 'Ctrl+N', run: () => UI.newDocDialog() },
      { label: 'Open…', key: 'Ctrl+O', run: () => PE.io.openFilePicker(true) },
      { label: 'Place (import as layer)…', key: 'Ctrl+Shift+O', run: () => PE.io.openFilePicker(false) },
      SEP,
      { label: 'Save Project (.pep)…', key: 'Ctrl+S', run: () => PE.io.saveProject(), enabled: hasDoc },
      { label: 'Export Image…', key: 'Ctrl+Shift+S', run: () => UI.exportDialog(), enabled: hasDoc },
      { label: 'Quick Export PNG', key: 'Ctrl+Alt+S', run: () => PE.io.exportImage({ format: 'png' }), enabled: hasDoc },
      SEP,
      { label: 'Close Document', key: 'Ctrl+W', run: () => UI.closeDoc(), enabled: hasDoc },
    ] },
    { title: 'Edit', items: [
      { label: 'Undo', key: 'Ctrl+Z', run: () => PE.history.undo(), enabled: () => PE.history.canUndo(), dyn: () => 'Undo ' + (PE.history.canUndo() ? PE.history.entries[PE.history.index - 1].label : '') },
      { label: 'Redo', key: 'Ctrl+Shift+Z', run: () => PE.history.redo(), enabled: () => PE.history.canRedo(), dyn: () => 'Redo ' + (PE.history.canRedo() ? PE.history.entries[PE.history.index].label : '') },
      { label: 'Redo (alt)', key: 'Ctrl+Y', run: () => PE.history.redo(), hidden: true },
      SEP,
      { label: 'Cut', key: 'Ctrl+X', run: () => A().cut(), enabled: hasLayer },
      { label: 'Copy', key: 'Ctrl+C', run: () => A().copy(false), enabled: hasLayer },
      { label: 'Copy Merged', key: 'Ctrl+Shift+C', run: () => A().copy(true), enabled: hasDoc },
      { label: 'Paste', key: 'Ctrl+V', run: () => A().paste() },
      { label: 'Clear (delete selected pixels)', key: 'Delete', run: () => A().clearSelected(), enabled: hasLayer },
      SEP,
      { label: 'Fill Selection with Foreground', key: 'Alt+Backspace', run: () => A().fillSelection(PE.fg, 'Fill Foreground'), enabled: hasLayer },
      { label: 'Fill Selection with Background', key: 'Ctrl+Backspace', run: () => A().fillSelection(PE.bg, 'Fill Background'), enabled: hasLayer },
      SEP,
      { label: 'Free Transform', key: 'Ctrl+T', run: () => PE.setTool('transform'), enabled: hasLayer },
      { label: 'Perspective / Distort', key: 'Ctrl+Shift+T', run: () => PE.setTool('perspective'), enabled: hasLayer },
    ] },
    { title: 'Image', items: [
      { label: 'Image Size…', key: 'Ctrl+Alt+I', run: () => UI.imageSizeDialog(), enabled: hasDoc },
      { label: 'Canvas Size…', key: 'Ctrl+Alt+C', run: () => UI.canvasSizeDialog(), enabled: hasDoc },
      { label: 'Crop to Selection', run: () => A().cropToSelection(), enabled: hasSel },
      { label: 'Fit Canvas to All Layers', run: () => A().trimToLayers(), enabled: hasDoc },
      SEP,
      { label: 'Rotate 90° Clockwise', run: () => A().rotateCanvas(90), enabled: hasDoc },
      { label: 'Rotate 90° Counter-clockwise', run: () => A().rotateCanvas(-90), enabled: hasDoc },
      { label: 'Rotate 180°', run: () => A().rotateCanvas(180), enabled: hasDoc },
      { label: 'Flip Canvas Horizontal', run: () => A().flipCanvas('h'), enabled: hasDoc },
      { label: 'Flip Canvas Vertical', run: () => A().flipCanvas('v'), enabled: hasDoc },
      SEP,
      { label: 'Flatten Image', run: () => A().flatten(), enabled: hasDoc },
    ] },
    { title: 'Layer', items: [
      { label: 'New Layer', key: 'Ctrl+Shift+N', run: () => A().newLayer(), enabled: hasDoc },
      { label: 'Duplicate Layer / Layer via Copy', key: 'Ctrl+J', run: () => A().layerViaCopy(), enabled: hasLayer },
      { label: 'Delete Layer', run: () => A().deleteLayer(), enabled: hasLayer },
      { label: 'Rename Layer…', run: () => UI.renameActive(), enabled: hasLayer },
      SEP,
      { label: 'Merge Down', key: 'Ctrl+E', run: () => A().mergeDown(), enabled: hasLayer },
      { label: 'Merge Visible', key: 'Ctrl+Shift+E', run: () => A().mergeVisible(), enabled: hasDoc },
      { label: 'Bring Forward', key: 'Ctrl+]', run: () => A().moveLayerUp(), enabled: hasLayer },
      { label: 'Send Backward', key: 'Ctrl+[', run: () => A().moveLayerDown(), enabled: hasLayer },
      SEP,
      { label: 'Mask ▸ Reveal All', run: () => A().addMask('reveal'), enabled: hasLayer },
      { label: 'Mask ▸ Hide All', run: () => A().addMask('hide'), enabled: hasLayer },
      { label: 'Mask ▸ Reveal Selection', run: () => A().addMask('selection'), enabled: hasSel },
      { label: 'Mask ▸ Hide Selection', run: () => A().addMask('hideSelection'), enabled: hasSel },
      { label: 'Mask ▸ Enable / Disable', run: () => A().toggleMask(), enabled: hasMask },
      { label: 'Mask ▸ Invert', run: () => A().invertMask(), enabled: hasMask },
      { label: 'Mask ▸ Apply (bake into pixels)', run: () => A().applyMask(), enabled: hasMask },
      { label: 'Mask ▸ Delete', run: () => A().deleteMask(), enabled: hasMask },
      SEP,
      { label: 'Flip Layer Horizontal', run: () => A().flipLayer('h'), enabled: hasLayer },
      { label: 'Flip Layer Vertical', run: () => A().flipLayer('v'), enabled: hasLayer },
      { label: 'Rotate Layer 90° CW', run: () => A().rotateLayer(90), enabled: hasLayer },
      { label: 'Rotate Layer 90° CCW', run: () => A().rotateLayer(-90), enabled: hasLayer },
      { label: 'Reset Transform', run: () => A().resetTransform(), enabled: hasLayer },
      { label: 'Fit Layer to Canvas', run: () => A().fitLayer('fit'), enabled: hasLayer },
      { label: 'Center Layer', run: () => A().centerLayer(), enabled: hasLayer },
      { label: 'Rasterize Layer', run: () => A().rasterize(), enabled: hasLayer },
      SEP,
      { label: 'Match Color to Layer Below', run: () => A().matchColorToBelow(100), enabled: hasLayer },
      SEP,
      { label: 'Remove Background (AI)', run: () => UI.removeBackgroundAI(), enabled: hasLayer },
      { label: 'Remove Background by Color (click it)…', run: () => UI.startColorPick(), enabled: hasLayer },
      { label: 'Background Eraser Brush', key: 'Shift+E', run: () => { PE.opts.bgEraser.mode = 'smart'; PE.setTool('bgEraser'); }, enabled: hasLayer },
    ] },
    { title: 'Select', items: [
      { label: 'All', key: 'Ctrl+A', run: () => A().selectAll(), enabled: hasDoc },
      { label: 'Deselect', key: 'Ctrl+D', run: () => A().deselect(), enabled: hasSel },
      { label: 'Inverse', key: 'Ctrl+Shift+I', run: () => A().invertSelection(), enabled: hasSel },
      SEP,
      { label: 'Feather…', key: 'Shift+F6', run: () => UI.numberDialog('Feather Selection', 'Radius (px)', 5, (v) => A().featherSelection(v)), enabled: hasSel },
      { label: 'Expand…', run: () => UI.numberDialog('Expand Selection', 'Pixels', 5, (v) => A().expandSelection(v)), enabled: hasSel },
      { label: 'Contract…', run: () => UI.numberDialog('Contract Selection', 'Pixels', 5, (v) => A().contractSelection(v)), enabled: hasSel },
      SEP,
      { label: 'Select Layer Pixels', run: () => A().selectLayerPixels(), enabled: hasLayer },
      { label: 'Load Layer Mask as Selection', run: () => A().maskToSelection(), enabled: hasMask },
      { label: 'Selection → Layer Mask', run: () => A().addMask('selection'), enabled: hasSel },
    ] },
    { title: 'Adjust', items: [
      { label: 'Brightness / Contrast…', run: () => UI.adjust('brightnessContrast'), enabled: hasLayer },
      { label: 'Levels…', key: 'Ctrl+L', run: () => UI.adjust('levels'), enabled: hasLayer },
      { label: 'Exposure…', run: () => UI.adjust('exposure'), enabled: hasLayer },
      { label: 'Hue / Saturation…', key: 'Ctrl+U', run: () => UI.adjust('hueSaturation'), enabled: hasLayer },
      { label: 'Color Temperature / Tint…', run: () => UI.adjust('colorBalance'), enabled: hasLayer },
      { label: 'Vibrance…', run: () => UI.adjust('vibrance'), enabled: hasLayer },
      SEP,
      { label: 'Auto Contrast', run: () => A().applyFilterNow('Auto Contrast', PE.filters.autoContrast), enabled: hasLayer },
      { label: 'Invert', key: 'Ctrl+I', run: () => A().applyFilterNow('Invert', PE.filters.invert), enabled: hasLayer },
      { label: 'Desaturate', key: 'Ctrl+Shift+U', run: () => A().applyFilterNow('Desaturate', PE.filters.desaturate), enabled: hasLayer },
      { label: 'Sepia…', run: () => UI.adjust('sepia'), enabled: hasLayer },
      { label: 'Threshold…', run: () => UI.adjust('threshold'), enabled: hasLayer },
      { label: 'Posterize…', run: () => UI.adjust('posterize'), enabled: hasLayer },
    ] },
    { title: 'Filter', items: [
      { label: 'Gaussian Blur…', run: () => UI.adjust('gaussianBlur'), enabled: hasLayer },
      { label: 'Unsharp Mask (Sharpen)…', run: () => UI.adjust('sharpen'), enabled: hasLayer },
      { label: 'Add Noise…', run: () => UI.adjust('noise'), enabled: hasLayer },
      { label: 'Pixelate…', run: () => UI.adjust('pixelate'), enabled: hasLayer },
    ] },
    { title: 'View', items: [
      { label: 'Zoom In', key: 'Ctrl+=', run: () => PE.view.zoomIn() },
      { label: 'Zoom In (alt)', key: 'Ctrl++', run: () => PE.view.zoomIn(), hidden: true },
      { label: 'Zoom Out', key: 'Ctrl+-', run: () => PE.view.zoomOut() },
      { label: 'Fit on Screen', key: 'Ctrl+0', run: () => PE.view.fit() },
      { label: 'Actual Pixels (100%)', key: 'Ctrl+1', run: () => PE.view.setZoom(1) },
      SEP,
      { label: 'Show Selection Edges', key: 'Ctrl+H', run: () => UI.toggleSetting('showAnts'), checked: () => PE.settings.showAnts },
      { label: 'Show Layer Bounds', run: () => UI.toggleSetting('showBounds'), checked: () => PE.settings.showBounds },
      { label: 'Mask Overlay (red = hidden)', key: '\\', run: () => UI.toggleSetting('maskOverlay'), checked: () => PE.settings.maskOverlay },
      { label: 'View Mask Only', key: 'Alt+\\', run: () => UI.toggleSetting('maskView'), checked: () => PE.settings.maskView },
      { label: 'Checkerboard for Transparency', run: () => UI.toggleSetting('checker'), checked: () => PE.settings.checker },
      { label: 'Pixel Grid when zoomed in', run: () => UI.toggleSetting('pixelGrid'), checked: () => PE.settings.pixelGrid },
    ] },
    { title: 'Help', items: [
      { label: 'Quick Guide: replace part of a photo (eye swap)', run: () => UI.guideDialog() },
      { label: 'Stitching two photos', run: () => UI.stitchGuideDialog() },
      { label: 'Keyboard Shortcuts', run: () => UI.shortcutsDialog() },
      { label: 'Supported File Formats', run: () => UI.formatsDialog() },
      { label: 'About', run: () => UI.aboutDialog() },
    ] },
  ];

  let openMenu = null;
  function buildMenubar() {
    const bar = PE.$('#menubar'); bar.innerHTML = '';
    for (const m of UI.menus) {
      const btn = el('div', { class: 'menu-title' }, m.title);
      const drop = el('div', { class: 'menu-drop' });
      const wrap = el('div', { class: 'menu' }, btn, drop);
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (openMenu === wrap) closeMenus(); else showMenu(wrap, m, drop); });
      btn.addEventListener('mouseenter', () => { if (openMenu && openMenu !== wrap) showMenu(wrap, m, drop); });
      bar.appendChild(wrap);
    }
    const logo = el('div', { class: 'menu-logo' }, 'PhotoEditor');
    bar.insertBefore(logo, bar.firstChild);
    document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenus(); });
  }
  function showMenu(wrap, m, drop) {
    closeMenus();
    drop.innerHTML = '';
    for (const it of m.items) {
      if (it.hidden) continue;
      if (it.sep) { drop.appendChild(el('div', { class: 'menu-sep' })); continue; }
      const enabled = it.enabled ? !!it.enabled() : true;
      const row = el('div', { class: 'menu-item' + (enabled ? '' : ' disabled') },
        el('span', { class: 'menu-check' }, it.checked && it.checked() ? '✓' : ''),
        el('span', { class: 'menu-label' }, it.dyn ? it.dyn() : it.label),
        el('span', { class: 'menu-key' }, it.key || ''));
      if (enabled) row.addEventListener('mouseup', (e) => { e.stopPropagation(); closeMenus(); try { it.run(); } catch (err) { console.error(err); PE.toast(err.message, { type: 'error' }); } });
      drop.appendChild(row);
    }
    wrap.classList.add('open'); openMenu = wrap;
  }
  function closeMenus() { if (openMenu) { openMenu.classList.remove('open'); openMenu = null; } }
  UI.closeMenus = closeMenus;
  /** map of shortcut string -> run() built from menus */
  UI.shortcutMap = function () {
    const map = {};
    for (const m of UI.menus) for (const it of m.items) if (it.key) map[it.key] = it;
    return map;
  };

  /* ------------------------------------------------------------ toolbox */
  function buildToolbox() {
    const box = PE.$('#toolbox'); box.innerHTML = '';
    const groups = [['move', 'transform', 'perspective'], ['marqueeRect', 'marqueeEllipse', 'lasso', 'polyLasso', 'wand'], ['crop', 'eyedropper'], ['brush', 'eraser', 'bgEraser', 'clone'], ['gradient', 'bucket'], ['text', 'shape'], ['hand', 'zoom']];
    for (const g of groups) {
      const grp = el('div', { class: 'tool-group' });
      for (const id of g) {
        const t = PE.tools[id];
        const b = el('button', { class: 'tool-btn', dataset: { tool: id }, title: `${t.name} (${t.key})`, html: svg(id) });
        b.addEventListener('click', () => PE.setTool(id));
        grp.appendChild(b);
      }
      box.appendChild(grp);
    }
    // colors
    const sw = el('div', { class: 'swatches', title: 'Foreground / Background colors (X swap, D default)' });
    const fg = el('div', { class: 'swatch fg' }), bg = el('div', { class: 'swatch bg' });
    const fgInput = el('input', { type: 'color', class: 'hidden-color' }), bgInput = el('input', { type: 'color', class: 'hidden-color' });
    fg.addEventListener('click', () => { fgInput.value = PE.rgbToHex(...PE.fg); fgInput.click(); });
    bg.addEventListener('click', () => { bgInput.value = PE.rgbToHex(...PE.bg); bgInput.click(); });
    fgInput.addEventListener('input', () => PE.setFg(PE.hexToRgb(fgInput.value)));
    bgInput.addEventListener('input', () => PE.setBg(PE.hexToRgb(bgInput.value)));
    const swap = el('button', { class: 'mini', title: 'Swap (X)', onclick: () => PE.swapColors() }, '⇄');
    const def = el('button', { class: 'mini', title: 'Default colors (D)', onclick: () => PE.defaultColors() }, '◩');
    sw.append(bg, fg, fgInput, bgInput, el('div', { class: 'swatch-btns' }, swap, def));
    box.appendChild(sw);
    UI.updateSwatches = () => { fg.style.background = PE.rgbToHex(...PE.fg); bg.style.background = PE.rgbToHex(...PE.bg); UI.refreshColorPanel && UI.refreshColorPanel(); };
    UI.updateSwatches();
  }
  UI.markTool = function () {
    for (const b of PE.$$('.tool-btn')) b.classList.toggle('active', PE.tool && b.dataset.tool === PE.tool.id);
  };

  /* ------------------------------------------------------------ options bar */
  UI.refreshOptions = function () {
    const bar = PE.$('#optionsbar'); bar.innerHTML = '';
    const t = PE.tool; if (!t) return;
    bar.appendChild(el('span', { class: 'opt-toolname' }, t.name));
    const o = PE.opts[t.id];
    const live = t.liveValues ? t.liveValues() : null;
    UI._liveInputs = [];
    for (const spec of t.options || []) {
      const wrap = el('label', { class: 'opt' });
      const val = spec.live && live ? live[spec.key] : o[spec.key];
      const setVal = (v) => { if (spec.live) { t.onOptionChange && t.onOptionChange(spec.key, v); } else { o[spec.key] = v; t.onOptionChange && t.onOptionChange(spec.key, v); } PE.requestRender(); };
      if (spec.type === 'button') {
        const b = el('button', { class: 'opt-btn' + (spec.primary ? ' primary' : ''), onclick: spec.onClick }, spec.label);
        bar.appendChild(b); continue;
      }
      wrap.appendChild(el('span', { class: 'opt-label' }, spec.label));
      let input;
      if (spec.type === 'number') {
        input = el('input', { type: 'number', value: val, min: spec.min, max: spec.max, step: spec.step || 1, class: 'opt-num' });
        input.addEventListener('change', () => { let v = parseFloat(input.value); if (isNaN(v)) v = val; if (spec.min !== undefined) v = Math.max(spec.min, v); if (spec.max !== undefined) v = Math.min(spec.max, v); input.value = v; setVal(v); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); } e.stopPropagation(); });
        if (spec.live) UI._liveInputs.push({ input, key: spec.key });
      } else if (spec.type === 'range') {
        input = el('input', { type: 'range', value: val, min: spec.min, max: spec.max, step: spec.step || 1, class: 'opt-range' });
        const num = el('input', { type: 'number', value: val, min: spec.min, max: spec.max, step: spec.step || 1, class: 'opt-num small' });
        input.addEventListener('input', () => { num.value = input.value; setVal(parseFloat(input.value)); });
        num.addEventListener('change', () => { let v = PE.clamp(parseFloat(num.value) || spec.min, spec.min, spec.max); num.value = v; input.value = v; setVal(v); });
        num.addEventListener('keydown', (e) => e.stopPropagation());
        wrap.appendChild(input); wrap.appendChild(num); if (spec.unit) wrap.appendChild(el('span', { class: 'opt-unit' }, spec.unit));
        bar.appendChild(wrap); continue;
      } else if (spec.type === 'checkbox') {
        input = el('input', { type: 'checkbox', checked: !!val });
        input.addEventListener('change', () => setVal(input.checked));
        wrap.classList.add('check'); wrap.insertBefore(input, wrap.firstChild); bar.appendChild(wrap); continue;
      } else if (spec.type === 'select') {
        input = el('select', {}, ...spec.items.map((it) => el('option', { value: it[0], selected: String(it[0]) === String(val) }, it[1])));
        input.addEventListener('change', () => { const raw = input.value; const item = spec.items.find((it) => String(it[0]) === raw); setVal(item ? item[0] : raw); });
      } else if (spec.type === 'color') {
        input = el('input', { type: 'color', value: val });
        input.addEventListener('input', () => setVal(input.value));
      }
      wrap.appendChild(input); bar.appendChild(wrap);
    }
  };
  UI.refreshOptionValues = function () {
    const t = PE.tool; if (!t || !t.liveValues || !UI._liveInputs) return;
    const live = t.liveValues();
    for (const { input, key } of UI._liveInputs) if (document.activeElement !== input) input.value = live[key];
  };

  /* ------------------------------------------------------------ panels */
  function panel(id, title, body) {
    const head = el('div', { class: 'panel-head' }, el('span', {}, title), el('span', { class: 'panel-toggle' }, '▾'));
    const p = el('div', { class: 'panel', id: 'panel-' + id }, head, body);
    head.addEventListener('click', () => p.classList.toggle('collapsed'));
    return p;
  }
  function buildPanels() {
    const host = PE.$('#panels'); host.innerHTML = '';
    host.appendChild(panel('layers', 'Layers', buildLayersPanel()));
    host.appendChild(panel('props', 'Properties & Transform', buildPropsPanel()));
    host.appendChild(panel('bg', 'Background Remover', buildBackgroundPanel()));
    host.appendChild(panel('stitch', 'Stitch & Composite', buildStitchPanel()));
    host.appendChild(panel('color', 'Color', buildColorPanel()));
    host.appendChild(panel('history', 'History', buildHistoryPanel()));
  }
  /* --- background remover --- */
  function buildBackgroundPanel() {
    const body = el('div', { class: 'panel-body bg-body' });
    const b = (label, fn, title, primary) => el('button', { class: 'mini wide' + (primary ? ' primary' : ''), onclick: fn, title }, label);
    const status = el('div', { class: 'hint ai-status' }, 'AI: loads on first use (44 MB model, bundled in the desktop app).');
    const bar = el('div', { class: 'ai-progress' }, el('div', { class: 'ai-progress-fill' }));
    bar.hidden = true;
    const feather = el('input', { type: 'number', value: 1, min: 0, max: 60, step: 0.5, class: 'opt-num' });
    const shift = el('input', { type: 'number', value: 0, min: -60, max: 60, step: 1, class: 'opt-num', title: 'Negative shrinks the cut-out (removes fringes), positive grows it' });
    const threshold = el('input', { type: 'number', value: 50, min: 5, max: 95, step: 1, class: 'opt-num', title: 'Lower keeps more of the image, higher removes more' });
    const tol = el('input', { type: 'number', value: 40, min: 1, max: 255, step: 1, class: 'opt-num' });
    const contig = el('input', { type: 'checkbox', checked: true });
    [feather, shift, threshold, tol].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    UI._bgVals = () => ({ feather: parseFloat(feather.value) || 0, shift: parseInt(shift.value, 10) || 0, threshold: (parseFloat(threshold.value) || 50) / 100, hardness: 0.7, tol: parseFloat(tol.value) || 40, contiguous: contig.checked });
    body.append(
      el('div', { class: 'hint' }, 'Everything here works on a layer mask, so nothing is deleted: paint white to bring pixels back, black to hide more.'),
      b('✨ Remove background (AI)', () => UI.removeBackgroundAI(), 'Finds the main subject automatically and hides the rest', true),
      status, bar,
      el('div', { class: 'prop-grid' },
        el('label', { class: 'prop' }, el('span', {}, 'Edge soft'), feather), el('label', { class: 'prop' }, el('span', {}, 'Shrink/grow'), shift),
        el('label', { class: 'prop' }, el('span', {}, 'Threshold'), threshold), b('Re-apply edge settings', () => A().refineAIMask(UI._bgVals()), 'Recompute the mask from the last AI result with these settings')),
      el('div', { class: 'hint' }, 'Solid or plain backgrounds (no AI needed):'),
      el('div', { class: 'prop-grid' }, el('label', { class: 'prop' }, el('span', {}, 'Tolerance'), tol), el('label', { class: 'prop check' }, contig, el('span', {}, 'Contiguous only'))),
      el('div', { class: 'prop-btns' }, b('Click a background color…', () => UI.startColorPick(), 'Then click the color on the image to remove it'), b('Remove background swatch color', () => A().removeBackgroundColor(PE.bg, UI._bgVals().tol, false, null), 'Removes the current background color everywhere on the layer')),
      el('div', { class: 'hint' }, 'Brush mode (paint to remove or bring back):'),
      el('div', { class: 'prop-btns' },
        b('Background Eraser (Shift+E)', () => { PE.opts.bgEraser.mode = 'smart'; PE.setTool('bgEraser'); }, 'Erases colors similar to the one under the cursor'),
        b('Erase brush', () => { PE.opts.bgEraser.mode = 'erase'; PE.setTool('bgEraser'); }),
        b('Restore brush', () => { PE.opts.bgEraser.mode = 'restore'; PE.setTool('bgEraser'); }, 'Brings hidden pixels back')),
      el('div', { class: 'prop-btns' },
        b('Show hidden as red (\\)', () => UI.toggleSetting('maskOverlay')), b('Invert', () => A().invertMask()), b('Apply permanently', () => A().applyMask(), 'Bakes the mask into the pixels'), b('Remove mask', () => A().deleteMask())));
    PE.events.on('aistatus', (s) => {
      status.textContent = 'AI: ' + s.message;
      bar.hidden = s.state !== 'loading';
      bar.firstChild.style.width = Math.round((s.progress || 0) * 100) + '%';
    });
    return body;
  }
  UI.removeBackgroundAI = function () { return A().removeBackgroundAI(UI._bgVals ? UI._bgVals() : {}); };
  UI.startColorPick = function () { if (!doc() || !doc().active) return; PE.setTool('bgPick'); PE.toast('Click the background color on the image (Esc to cancel)'); };
  // transient picker tool used by "Remove Background by Color"
  PE.tools.bgPick = {
    id: 'bgPick', name: 'Pick background color', cursor: 'crosshair',
    options: [{ type: 'button', label: 'Cancel (Esc)', onClick: () => PE.setTool('move') }],
    onDown(p) {
      const d = doc(); const L = d && d.active; if (!L) return;
      const [lx, ly] = L.toLocal(p.x, p.y);
      if (lx < 0 || ly < 0 || lx >= L.w || ly >= L.h) { PE.toast('Click inside the layer'); return; }
      const px = L.img.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
      if (px[3] < 8) { PE.toast('That pixel is already transparent'); return; }
      const v = UI._bgVals();
      A().removeBackgroundColor([px[0], px[1], px[2]], v.tol, v.contiguous, p);
      PE.setTool('move');
    },
    onMove() {}, onUp() {},
    onKey(e) { if (e.key === 'Escape') { PE.setTool('move'); return true; } return false; },
  };
  PE.opts.bgPick = {};
  PE.TOOL_HINTS.bgPick = 'Click the background color you want to remove. "Contiguous only" limits it to the connected area.';
  /* --- color --- */
  function buildColorPanel() {
    const body = el('div', { class: 'panel-body color-body' });
    const fgHex = el('input', { type: 'text', class: 'hex', maxlength: 7 }), bgHex = el('input', { type: 'text', class: 'hex', maxlength: 7 });
    const fgC = el('input', { type: 'color' }), bgC = el('input', { type: 'color' });
    fgC.addEventListener('input', () => PE.setFg(PE.hexToRgb(fgC.value)));
    bgC.addEventListener('input', () => PE.setBg(PE.hexToRgb(bgC.value)));
    const hexHandler = (inp, setter) => { inp.addEventListener('change', () => { const rgb = PE.hexToRgb(inp.value); if (rgb) setter(rgb); else UI.refreshColorPanel(); }); inp.addEventListener('keydown', (e) => e.stopPropagation()); };
    hexHandler(fgHex, PE.setFg); hexHandler(bgHex, PE.setBg);
    const presets = el('div', { class: 'presets' });
    for (const c of ['#000000', '#ffffff', '#808080', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#8b4513', '#ffc0a0']) {
      const s = el('div', { class: 'preset', style: { background: c }, title: c });
      s.addEventListener('click', (e) => (e.shiftKey ? PE.setBg : PE.setFg)(PE.hexToRgb(c)));
      presets.appendChild(s);
    }
    body.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Foreground'), fgC, fgHex), el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Background'), bgC, bgHex), presets,
      el('div', { class: 'hint' }, 'On a mask: white reveals, black hides, gray = partial. Shift+click a preset sets the background.'));
    UI.refreshColorPanel = () => { fgC.value = fgHex.value = PE.rgbToHex(...PE.fg); bgC.value = bgHex.value = PE.rgbToHex(...PE.bg); };
    UI.refreshColorPanel();
    return body;
  }
  /* --- layers --- */
  const THUMB = 44;
  let checkerPattern = null;
  function thumbOf(canvas, isMask) {
    const w = canvas.width, h = canvas.height, k = Math.min(THUMB / w, THUMB / h);
    const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    const c = PE.createCanvas(THUMB, THUMB); const ctx = c.getContext('2d');
    if (!checkerPattern) { const p = PE.createCanvas(8, 8); const pc = p.getContext('2d'); pc.fillStyle = '#999'; pc.fillRect(0, 0, 8, 8); pc.fillStyle = '#666'; pc.fillRect(0, 0, 4, 4); pc.fillRect(4, 4, 4, 4); checkerPattern = ctx.createPattern(p, 'repeat'); }
    const ox = (THUMB - tw) / 2, oy = (THUMB - th) / 2;
    if (isMask) { ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, tw, th); } else { ctx.fillStyle = checkerPattern; ctx.fillRect(ox, oy, tw, th); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(canvas, ox, oy, tw, th);
    return c;
  }
  function buildLayersPanel() {
    const body = el('div', { class: 'panel-body layers-body' });
    const blend = el('select', { class: 'blend' }, ...PE.BLEND_MODES.map((b) => el('option', { value: b[0] }, b[1])));
    const opacity = el('input', { type: 'range', min: 0, max: 100, step: 1, value: 100, title: 'Opacity' });
    const opNum = el('input', { type: 'number', min: 0, max: 100, step: 1, value: 100, class: 'opt-num small' });
    const lock = el('button', { class: 'mini', title: 'Lock / unlock layer' }, '🔒');
    blend.addEventListener('change', () => { const L = doc() && doc().active; if (L) A().setLayerProp(L, 'blend', blend.value, 'Blend Mode'); });
    let opCommit = null;
    opacity.addEventListener('input', () => { const L = doc() && doc().active; if (!L) return; if (!opCommit) opCommit = PE.history.propChange('Opacity', L, ['opacity'], () => doc().markDirty(L)); L.opacity = opacity.value / 100; opNum.value = opacity.value; doc().markDirty(L); });
    opacity.addEventListener('change', () => { if (opCommit) { opCommit(); opCommit = null; PE.events.emit('docchange'); } });
    opNum.addEventListener('change', () => { const L = doc() && doc().active; if (L) A().setLayerProp(L, 'opacity', PE.clamp(parseFloat(opNum.value) || 0, 0, 100) / 100, 'Opacity'); });
    opNum.addEventListener('keydown', (e) => e.stopPropagation());
    lock.addEventListener('click', () => { const L = doc() && doc().active; if (L) A().setLayerProp(L, 'locked', !L.locked, L.locked ? 'Unlock Layer' : 'Lock Layer'); });
    const top = el('div', { class: 'layers-top' }, blend, el('span', { class: 'lbl' }, 'Opacity'), opacity, opNum, lock);
    const list = el('div', { class: 'layer-list' });
    const btn = (label, title, fn) => el('button', { class: 'mini', title, onclick: fn }, label);
    const bottom = el('div', { class: 'layers-bottom' },
      btn('＋', 'New layer (Ctrl+Shift+N)', () => A().newLayer()),
      btn('⧉', 'Duplicate layer (Ctrl+J)', () => A().duplicateLayer()),
      btn('◐', 'Add layer mask (reveal all, or reveal selection if one exists)', () => A().addMask(doc() && doc().selection ? 'selection' : 'reveal')),
      btn('▲', 'Move layer up (Ctrl+])', () => A().moveLayerUp()),
      btn('▼', 'Move layer down (Ctrl+[)', () => A().moveLayerDown()),
      btn('⤓', 'Merge down (Ctrl+E)', () => A().mergeDown()),
      btn('🗑', 'Delete layer', () => A().deleteLayer()));
    body.append(top, list, bottom, el('div', { class: 'hint' }, 'Click the mask thumbnail to paint on the mask, the image thumbnail to paint on pixels. Alt+click mask = view mask, Shift+click mask = disable.'));

    let dragFrom = null;
    UI.refreshLayers = function () {
      const d = doc();
      list.innerHTML = '';
      if (!d) return;
      const L = d.active;
      blend.value = L ? L.blend : 'normal'; opacity.value = L ? Math.round(L.opacity * 100) : 100; opNum.value = opacity.value;
      lock.classList.toggle('active', !!(L && L.locked));
      for (let i = d.layers.length - 1; i >= 0; i--) {
        const layer = d.layers[i];
        const row = el('div', { class: 'layer-row' + (layer === L ? ' active' : '') + (layer.visible ? '' : ' hidden-layer'), draggable: 'true', dataset: { index: i } });
        const eye = el('div', { class: 'eye' + (layer.visible ? ' on' : ''), title: 'Toggle visibility' }, layer.visible ? '👁' : '');
        eye.addEventListener('click', (e) => { e.stopPropagation(); A().setLayerProp(layer, 'visible', !layer.visible, layer.visible ? 'Hide Layer' : 'Show Layer'); });
        if (layer.thumbDirty || !layer._thumb) { layer._thumb = thumbOf(layer.effective(), false); layer._maskThumb = layer.mask ? thumbOf(layer.mask, true) : null; layer.thumbDirty = false; }
        const thumb = el('div', { class: 'thumb' + (layer === L && d.paintTarget === 'img' ? ' target' : ''), title: 'Layer pixels (click to paint on pixels)' }, layer._thumb);
        thumb.addEventListener('click', (e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) { A().selectLayerPixels(layer); return; } d.setActive(layer); A().setPaintTarget('img'); });
        row.append(eye, thumb);
        if (layer.mask) {
          const mt = el('div', { class: 'thumb mask' + (layer === L && d.paintTarget === 'mask' ? ' target' : '') + (layer.maskEnabled ? '' : ' disabled'), title: 'Layer mask (click to paint on mask · Alt+click view · Shift+click disable · Ctrl+click load as selection)' }, layer._maskThumb);
          mt.addEventListener('click', (e) => {
            e.stopPropagation(); d.setActive(layer);
            if (e.altKey) { UI.toggleSetting('maskView'); return; }
            if (e.shiftKey) { A().toggleMask(); return; }
            if (e.ctrlKey || e.metaKey) { A().maskToSelection(); return; }
            A().setPaintTarget('mask');
          });
          row.appendChild(mt);
        }
        const name = el('div', { class: 'lname' }, layer.name + (layer.type === 'text' ? ' (T)' : ''));
        name.addEventListener('dblclick', (e) => { e.stopPropagation(); UI.renameInline(layer, name); });
        row.appendChild(name);
        if (layer.locked) row.appendChild(el('span', { class: 'lock' }, '🔒'));
        row.addEventListener('click', () => { d.setActive(layer); });
        row.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} });
        row.addEventListener('dragover', (e) => { e.preventDefault(); const r = row.getBoundingClientRect(); row.classList.toggle('drop-above', e.clientY < r.top + r.height / 2); row.classList.toggle('drop-below', e.clientY >= r.top + r.height / 2); });
        row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
        row.addEventListener('drop', (e) => {
          e.preventDefault(); row.classList.remove('drop-above', 'drop-below');
          if (dragFrom === null) return;
          const r = row.getBoundingClientRect(); const above = e.clientY < r.top + r.height / 2;
          let target = above ? i + 1 : i; // array index where the dragged layer should land
          const from = dragFrom; dragFrom = null;
          if (from < target) target--;
          A().reorderLayer(d.layers[from], PE.clamp(target, 0, d.layers.length - 1));
        });
        list.appendChild(row);
      }
    };
    return body;
  }
  UI.renameInline = function (layer, nameEl) {
    const inp = el('input', { type: 'text', value: layer.name, class: 'rename' });
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; if (ok && inp.value.trim()) A().renameLayer(layer, inp.value.trim()); UI.refreshLayers(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  };
  UI.renameActive = async function () { const L = doc() && doc().active; if (!L) return; const v = await UI.prompt('Rename Layer', 'Name', L.name); if (v) A().renameLayer(L, v); };

  /* --- properties --- */
  function buildPropsPanel() {
    const body = el('div', { class: 'panel-body props-body' });
    const info = el('div', { class: 'hint' });
    const num = (label, key) => { const i = el('input', { type: 'number', step: 0.1, class: 'opt-num' }); i.addEventListener('change', () => PE.tools.transform.onOptionChange(key, parseFloat(i.value))); i.addEventListener('keydown', (e) => e.stopPropagation()); return [el('label', { class: 'prop' }, el('span', {}, label), i), i]; };
    const [xw, xi] = num('X', 'x'), [yw, yi] = num('Y', 'y'), [ww, wi] = num('W', 'w'), [hw, hi] = num('H', 'h'), [aw, ai] = num('Angle°', 'angle');
    const lock = el('input', { type: 'checkbox', checked: true }); lock.addEventListener('change', () => { PE.opts.transform.lock = lock.checked; });
    const grid = el('div', { class: 'prop-grid' }, xw, yw, ww, hw, aw, el('label', { class: 'prop check' }, lock, el('span', {}, 'Lock ratio')));
    const b = (label, fn, title) => el('button', { class: 'mini wide', onclick: fn, title }, label);
    const btns = el('div', { class: 'prop-btns' },
      b('Flip H', () => A().flipLayer('h')), b('Flip V', () => A().flipLayer('v')), b('Rot 90°', () => A().rotateLayer(90)),
      b('Fit', () => A().fitLayer('fit'), 'Scale to fit the canvas'), b('Fill', () => A().fitLayer('fill'), 'Scale to cover the canvas'), b('Center', () => A().centerLayer()),
      b('Reset', () => A().resetTransform(), 'Reset scale and rotation'), b('Rasterize', () => A().rasterize()), b('Transform', () => PE.setTool('transform'), 'Free Transform (Ctrl+T)'));
    body.append(info, grid, btns);
    UI.refreshProps = function () {
      const d = doc(); const L = d && d.active;
      lock.checked = !!PE.opts.transform.lock;
      if (!L) { info.textContent = d ? 'No layer selected' : 'No document open'; [xi, yi, wi, hi, ai].forEach((i) => (i.value = '')); return; }
      const v = PE.tools.transform.liveValues();
      info.textContent = `${L.name} — ${L.w}×${L.h}px bitmap${L.mask ? ' + mask' : ''}${L.type === 'text' ? ' (text)' : ''}, ${Math.round(Math.abs(L.sx) * 100)}% × ${Math.round(Math.abs(L.sy) * 100)}%${L.locked ? ' · locked' : ''}`;
      if (document.activeElement !== xi) xi.value = v.x; if (document.activeElement !== yi) yi.value = v.y;
      if (document.activeElement !== wi) wi.value = v.w; if (document.activeElement !== hi) hi.value = v.h; if (document.activeElement !== ai) ai.value = v.angle;
    };
    return body;
  }
  /* --- stitch --- */
  function buildStitchPanel() {
    const body = el('div', { class: 'panel-body stitch-body' });
    const dir = el('select', {}, el('option', { value: 'h' }, 'Left → right'), el('option', { value: 'v' }, 'Top → bottom'));
    const align = el('select', {}, el('option', { value: 'start' }, 'Align top/left'), el('option', { value: 'center' }, 'Align centers'), el('option', { value: 'end' }, 'Align bottom/right'));
    const overlap = el('input', { type: 'number', value: 120, min: 0, step: 1, class: 'opt-num' });
    const blend = el('input', { type: 'number', value: 120, min: 0, step: 1, class: 'opt-num' });
    [overlap, blend].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    const b = (label, fn, title, primary) => el('button', { class: 'mini wide' + (primary ? ' primary' : ''), onclick: fn, title }, label);
    body.append(
      el('div', { class: 'hint' }, 'Arrange all visible layers in a row (bottom layer first), overlapping, with soft blended seams.'),
      el('div', { class: 'prop-grid' }, el('label', { class: 'prop' }, el('span', {}, 'Direction'), dir), el('label', { class: 'prop' }, el('span', {}, 'Align'), align),
        el('label', { class: 'prop' }, el('span', {}, 'Overlap px'), overlap), el('label', { class: 'prop' }, el('span', {}, 'Blend px'), blend)),
      el('div', { class: 'prop-btns' },
        b('Arrange & blend visible layers', () => PE.stitch.arrange({ direction: dir.value, overlap: parseFloat(overlap.value) || 0, blend: parseFloat(blend.value) || 0, align: align.value }), '', true),
        b('Auto-align to layer below', () => PE.stitch.autoAlignActive(), 'Finds the best horizontal/vertical shift of the active layer to match the layer below (translation only)'),
        b('Expand canvas to fit layers', () => PE.stitch.expandCanvasToLayers())),
      el('div', { class: 'hint' }, 'Soft edge on the active layer (mask ramp), using the Blend px width:'),
      el('div', { class: 'prop-btns' },
        b('◧ Left', () => PE.stitch.blendActiveEdge('left', parseFloat(blend.value))), b('◨ Right', () => PE.stitch.blendActiveEdge('right', parseFloat(blend.value))),
        b('⬒ Top', () => PE.stitch.blendActiveEdge('top', parseFloat(blend.value))), b('⬓ Bottom', () => PE.stitch.blendActiveEdge('bottom', parseFloat(blend.value)))),
      el('div', { class: 'hint' }, 'Alignment aids for the active layer:'),
      el('div', { class: 'prop-btns' },
        b('Difference blend on/off', () => { const L = doc() && doc().active; if (L) A().setLayerProp(L, 'blend', L.blend === 'difference' ? 'normal' : 'difference', 'Blend Mode'); }, 'Overlapping identical areas turn black when aligned'),
        b('50% opacity on/off', () => { const L = doc() && doc().active; if (L) A().setLayerProp(L, 'opacity', L.opacity === 0.5 ? 1 : 0.5, 'Opacity'); }),
        b('Match color to layer below', () => A().matchColorToBelow(100), 'Matches brightness/color statistics to the layer below')));
    return body;
  }
  /* --- history --- */
  function buildHistoryPanel() {
    const body = el('div', { class: 'panel-body history-body' });
    const list = el('div', { class: 'history-list' });
    body.appendChild(list);
    UI.refreshHistory = function () {
      list.innerHTML = '';
      const H = PE.history;
      const first = el('div', { class: 'hist-row' + (H.index === 0 ? ' current' : '') }, 'Original');
      first.addEventListener('click', () => H.jumpTo(0));
      list.appendChild(first);
      H.entries.forEach((e, i) => {
        const row = el('div', { class: 'hist-row' + (i < H.index ? '' : ' undone') + (i === H.index - 1 ? ' current' : '') }, e.label || 'Edit');
        row.addEventListener('click', () => H.jumpTo(i + 1));
        list.appendChild(row);
      });
      // keep the current step visible inside the list only (scrollIntoView would scroll the whole panel column)
      const cur = list.querySelector('.current');
      if (cur) {
        const top = cur.offsetTop, bottom = top + cur.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
      }
    };
    return body;
  }

  /* ------------------------------------------------------------ dialogs */
  UI.dialog = function (spec) {
    return new Promise((resolve) => {
      const host = PE.$('#dialog-host');
      const values = {};
      const fieldsEl = el('div', { class: 'dlg-fields' });
      const inputs = {};
      const fire = () => spec.onChange && spec.onChange({ ...values });
      for (const f of spec.fields || []) {
        values[f.key] = f.value;
        let input;
        const row = el('label', { class: 'dlg-row' }, el('span', { class: 'dlg-label' }, f.label));
        if (f.type === 'checkbox') {
          input = el('input', { type: 'checkbox', checked: !!f.value });
          input.addEventListener('change', () => { values[f.key] = input.checked; fire(); });
          row.classList.add('check'); row.insertBefore(input, row.firstChild);
        } else if (f.type === 'select') {
          input = el('select', {}, ...f.items.map((it) => el('option', { value: it[0], selected: String(it[0]) === String(f.value) }, it[1])));
          input.addEventListener('change', () => { const it = f.items.find((x) => String(x[0]) === input.value); values[f.key] = it ? it[0] : input.value; fire(); });
          row.appendChild(input);
        } else if (f.type === 'text') {
          input = el('input', { type: 'text', value: f.value || '' });
          input.addEventListener('input', () => { values[f.key] = input.value; fire(); });
          row.appendChild(input);
        } else if (f.type === 'color') {
          input = el('input', { type: 'color', value: f.value || '#000000' });
          input.addEventListener('input', () => { values[f.key] = input.value; fire(); });
          row.appendChild(input);
        } else if (f.type === 'anchor') {
          const grid = el('div', { class: 'anchor-grid' });
          for (let i = 0; i < 9; i++) { const c = el('button', { class: 'anchor' + (i === f.value ? ' on' : ''), type: 'button' }, '·'); c.addEventListener('click', () => { values[f.key] = i; grid.querySelectorAll('.anchor').forEach((x, j) => x.classList.toggle('on', j === i)); fire(); }); grid.appendChild(c); }
          row.appendChild(grid); input = grid;
        } else if (f.type === 'info') {
          row.innerHTML = ''; row.appendChild(el('div', { class: 'dlg-info', html: f.html || '' }, f.text || '')); input = row;
        } else { // number / range
          const isRange = f.min !== undefined && f.max !== undefined && f.type !== 'number';
          input = el('input', { type: 'number', value: f.value, min: f.min, max: f.max, step: f.step || 1, class: 'dlg-num' });
          const commitNum = () => { let v = parseFloat(input.value); if (isNaN(v)) v = f.value; if (f.min !== undefined) v = Math.max(f.min, v); if (f.max !== undefined) v = Math.min(f.max, v); values[f.key] = v; if (range) range.value = v; fire(); };
          input.addEventListener('change', commitNum);
          input.addEventListener('input', () => { const v = parseFloat(input.value); if (!isNaN(v)) { values[f.key] = PE.clamp(v, f.min === undefined ? -Infinity : f.min, f.max === undefined ? Infinity : f.max); if (range) range.value = values[f.key]; fire(); } });
          let range = null;
          if (isRange) { range = el('input', { type: 'range', value: f.value, min: f.min, max: f.max, step: f.step || 1 }); range.addEventListener('input', () => { values[f.key] = parseFloat(range.value); input.value = range.value; fire(); }); row.appendChild(range); }
          row.appendChild(input);
        }
        inputs[f.key] = input;
        fieldsEl.appendChild(row);
      }
      const box = el('div', { class: 'dlg' }, el('div', { class: 'dlg-title' }, spec.title || ''), spec.html ? el('div', { class: 'dlg-html', html: spec.html }) : null, fieldsEl);
      const overlay = el('div', { class: 'dlg-overlay' }, box);
      const close = (result) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(result); };
      const btns = el('div', { class: 'dlg-btns' });
      for (const b of spec.extraButtons || []) btns.appendChild(el('button', { type: 'button', onclick: () => b.onClick({ ...values }, close, inputs) }, b.label));
      if (spec.cancel !== false) btns.appendChild(el('button', { type: 'button', onclick: () => close(null) }, spec.cancel || 'Cancel'));
      btns.appendChild(el('button', { type: 'button', class: 'primary', onclick: () => close({ ...values }) }, spec.ok || 'OK'));
      box.appendChild(btns);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA') && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); e.stopPropagation(); if (e.target && e.target.type === 'number') e.target.dispatchEvent(new Event('change')); close({ ...values }); }
        else e.stopPropagation();
      };
      document.addEventListener('keydown', onKey, true);
      host.appendChild(overlay);
      const firstInput = box.querySelector('input:not([type=checkbox]), select'); if (firstInput) { firstInput.focus(); if (firstInput.select) firstInput.select(); }
      if (spec.onOpen) spec.onOpen(inputs, values);
    });
  };
  UI.isDialogOpen = () => !!PE.$('#dialog-host .dlg-overlay');
  UI.confirm = async (title, text) => !!(await UI.dialog({ title, fields: [{ type: 'info', key: '_', text }], ok: 'Yes', cancel: 'No' }));
  UI.prompt = async (title, label, value) => { const r = await UI.dialog({ title, fields: [{ type: 'text', key: 'v', label, value }] }); return r ? r.v : null; };
  UI.numberDialog = async function (title, label, value, fn) { const r = await UI.dialog({ title, fields: [{ type: 'number', key: 'v', label, value, min: 0, max: 5000, step: 0.5 }] }); if (r) fn(r.v); };
  UI.busy = function (on, text) { const b = PE.$('#busy'); if (!b) return; b.hidden = !on; PE.$('#busy-text').textContent = text || ''; };

  UI.newDocDialog = async function () {
    const r = await UI.dialog({ title: 'New Document', fields: [
      { type: 'number', key: 'w', label: 'Width (px)', value: 1920, min: 1, max: PE.MAX_DIM }, { type: 'number', key: 'h', label: 'Height (px)', value: 1080, min: 1, max: PE.MAX_DIM },
      { type: 'select', key: 'bg', label: 'Background', value: '#ffffff', items: [['#ffffff', 'White'], ['transparent', 'Transparent'], ['#000000', 'Black'], ['bg', 'Background color']] }] });
    if (!r) return;
    if (doc() && PE.history.entries.length && !(await UI.confirm('Discard current document?', 'The current document has unsaved changes.'))) return;
    A().newDocument(r.w, r.h, r.bg === 'bg' ? PE.rgbToHex(...PE.bg) : r.bg);
  };
  UI.closeDoc = async function () {
    if (!doc()) return;
    if (PE.history.entries.length && !(await UI.confirm('Close document?', 'Unsaved changes will be lost.'))) return;
    A().closeDocument();
  };
  UI.imageSizeDialog = async function () {
    const d = doc(); if (!d) return;
    const ratio = d.width / d.height;
    let lockRatio = true;
    const r = await UI.dialog({ title: 'Image Size', fields: [
      { type: 'info', key: '_', text: `Current: ${d.width} × ${d.height} px. Layers are scaled without losing their original pixels.` },
      { type: 'number', key: 'w', label: 'Width (px)', value: d.width, min: 1, max: PE.MAX_DIM }, { type: 'number', key: 'h', label: 'Height (px)', value: d.height, min: 1, max: PE.MAX_DIM },
      { type: 'checkbox', key: 'lock', label: 'Constrain proportions', value: true },
      { type: 'number', key: 'pct', label: 'Scale (%)', value: 100, min: 1, max: 1000, step: 0.1 }],
      onOpen(inputs) {
        inputs.lock.addEventListener('change', () => (lockRatio = inputs.lock.checked));
        inputs.w.addEventListener('input', () => { if (lockRatio) inputs.h.value = Math.max(1, Math.round(parseFloat(inputs.w.value) / ratio)); inputs.pct.value = PE.round(parseFloat(inputs.w.value) / d.width * 100, 1); inputs.h.dispatchEvent(new Event('input')); });
        inputs.h.addEventListener('input', () => { if (lockRatio && document.activeElement === inputs.h) { inputs.w.value = Math.max(1, Math.round(parseFloat(inputs.h.value) * ratio)); inputs.w.dispatchEvent(new Event('change')); } });
        inputs.pct.addEventListener('input', () => { const p = parseFloat(inputs.pct.value) / 100; if (p > 0) { inputs.w.value = Math.max(1, Math.round(d.width * p)); inputs.h.value = Math.max(1, Math.round(d.height * p)); inputs.w.dispatchEvent(new Event('change')); inputs.h.dispatchEvent(new Event('change')); } });
      } });
    if (r) A().resizeImage(r.w, r.h);
  };
  UI.canvasSizeDialog = async function () {
    const d = doc(); if (!d) return;
    const r = await UI.dialog({ title: 'Canvas Size', fields: [
      { type: 'info', key: '_', text: `Current: ${d.width} × ${d.height} px. Layers keep their size; the canvas grows or shrinks around the anchor.` },
      { type: 'number', key: 'w', label: 'Width (px)', value: d.width, min: 1, max: PE.MAX_DIM }, { type: 'number', key: 'h', label: 'Height (px)', value: d.height, min: 1, max: PE.MAX_DIM },
      { type: 'anchor', key: 'anchor', label: 'Anchor', value: 4 }] });
    if (r) A().canvasSize(r.w, r.h, r.anchor);
  };
  UI.exportDialog = async function () {
    const d = doc(); if (!d) return;
    const r = await UI.dialog({ title: 'Export Image', fields: [
      { type: 'select', key: 'format', label: 'Format', value: 'png', items: PE.io.FORMATS },
      { type: 'range', key: 'quality', label: 'Quality (JPEG/WebP)', value: 92, min: 1, max: 100, step: 1 },
      { type: 'number', key: 'scale', label: 'Scale (%)', value: 100, min: 1, max: 400, step: 1 },
      { type: 'select', key: 'what', label: 'Content', value: 'all', items: [['all', 'Whole image (flattened)'], ['layer', 'Active layer only'], ['sel', 'Selection only (flattened)']] },
      { type: 'color', key: 'bg', label: 'Background for JPEG/BMP', value: '#ffffff' },
      { type: 'info', key: '_', text: 'PSD keeps all layers and masks (needs internet the first time to load the PSD library). TIFF also needs the online decoder.' }] });
    if (!r) return;
    await PE.io.exportImage({ format: r.format, quality: r.quality / 100, scale: r.scale / 100, layerOnly: r.what === 'layer', selectionOnly: r.what === 'sel', background: r.bg });
  };
  /** adjustment / filter dialog with live preview */
  UI.adjust = async function (id) {
    const cat = PE.filters.catalog[id]; if (!cat) return;
    const session = A().startAdjustment(); if (!session) return;
    let closed = false, lastVals = null;
    const apply = (vals) => { if (closed) return; try { if (cat.canvasFn) session.previewCanvas((c) => cat.canvasFn(c, vals)); else session.preview((src) => cat.fn(src, vals)); } catch (e) { console.error(e); PE.toast(e.message, { type: 'error' }); } };
    const throttled = PE.rafThrottle((vals) => { if (!closed) apply(vals); });
    const fields = cat.params.map((p) => ({ ...p, type: p.type || 'range' }));
    fields.unshift({ type: 'info', key: '_', text: `Applies to: ${session.layer.name}${session.target === 'mask' ? ' (mask)' : ''}${doc().selection ? ' within the selection' : ''}` });
    const r = await UI.dialog({ title: cat.title, fields, onChange: (vals) => { lastVals = vals; throttled(vals); }, extraButtons: [{ label: 'Reset', onClick: (vals, close, inputs) => { for (const p of cat.params) { const i = inputs[p.key]; if (!i) continue; if (i.type === 'checkbox') i.checked = !!p.value; else { i.value = p.value; const rg = i.previousSibling; if (rg && rg.type === 'range') rg.value = p.value; } i.dispatchEvent(new Event(i.type === 'checkbox' ? 'change' : 'input')); } } }] });
    closed = true;
    if (r) { apply(r); session.commit(cat.title); PE.events.emit('docchange'); }
    else session.cancel();
  };
  UI.toggleSetting = function (key) { PE.settings[key] = !PE.settings[key]; if (key === 'maskView' && PE.settings.maskView) PE.settings.maskOverlay = false; if (key === 'maskOverlay' && PE.settings.maskOverlay) PE.settings.maskView = false; PE.requestRender(); PE.events.emit('settingschange'); };

  /* --- help dialogs --- */
  UI.guideDialog = () => UI.dialog({ title: 'Quick Guide — replace a part of a photo (e.g. the pigeon eye)', cancel: false, ok: 'Close', html: `
<ol class="guide">
<li><b>Open the base photo</b>: File ▸ Open (Ctrl+O) or drag it onto the canvas.</li>
<li><b>Import the second photo as a layer</b>: File ▸ Place (Ctrl+Shift+O) or drag it onto the open document. It appears as a new layer above.</li>
<li><b>Position it over the eye</b>: press <kbd>Ctrl+T</kbd> (Free Transform). Drag inside to move, corners to scale, outside the box to rotate, then <kbd>Enter</kbd>. Lower its opacity in the Layers panel (or use “Difference” in the Stitch panel) to line things up precisely; arrow keys nudge by 1px (Shift = 10px).</li>
<li><b>Mask out everything except the eye</b>: choose the Elliptical Marquee (<kbd>Shift+M</kbd>), set Feather (e.g. 8px) in the options bar, drag an ellipse over the eye, then click the “◐” button in the Layers panel (Selection ▸ Layer Mask). Everything outside the ellipse is hidden — nothing is deleted.</li>
<li><b>Refine the edge</b>: with the mask thumbnail selected (highlighted), paint with the Brush (<kbd>B</kbd>): black hides, white reveals, low hardness = soft edge. Press <kbd>X</kbd> to swap black/white. Press <kbd>\\</kbd> to see hidden areas in red.</li>
<li><b>Match the look</b>: Stitch panel ▸ “Match color to layer below”, or Adjust ▸ Hue/Saturation / Levels on the eye layer. Use the Clone Stamp (<kbd>S</kbd>, Alt+click a source) to clean up any seams.</li>
<li><b>Fix the perspective</b>: if the placed photo was shot from a different angle, use Edit ▸ Perspective / Distort (<kbd>Ctrl+Shift+T</kbd>). Drag the corners so its edges follow the base photo's perspective (the grid helps), then <kbd>Enter</kbd>.</li>
<li><b>Cut out a subject</b>: Background Remover panel ▸ “Remove background (AI)”, or click a plain background color, then tidy up with the Background Eraser / Restore brushes (<kbd>Shift+E</kbd>). All of this lives on the layer mask, so it is never destructive.</li>
<li><b>Save</b>: File ▸ Save Project keeps layers and masks editable (.pep). File ▸ Export writes PNG/JPEG/WebP/BMP/TIFF or a layered PSD.</li>
</ol>` });
  UI.stitchGuideDialog = () => UI.dialog({ title: 'Stitching two photos together', cancel: false, ok: 'Close', html: `
<ol class="guide">
<li>Open the first photo, then Place the second (Ctrl+Shift+O). Keep both visible.</li>
<li>Stitch panel ▸ set Direction, Overlap and Blend width ▸ <b>Arrange &amp; blend visible layers</b>. The canvas grows to fit and the seam gets a soft gradient mask.</li>
<li>Fine-tune: select the top layer, use <b>Auto-align to layer below</b> (finds the best shift), or move it with the Move tool / arrow keys while “Difference blend” is on (aligned areas turn black).</li>
<li>Fix exposure differences with <b>Match color to layer below</b>, then paint on the mask with a soft brush to hide ghosting.</li>
<li>Image ▸ Fit Canvas to All Layers, crop (<kbd>C</kbd>) and export.</li>
</ol>` });
  UI.shortcutsDialog = () => {
    const rows = [];
    for (const id of PE.toolOrder) rows.push([PE.tools[id].key, PE.tools[id].name]);
    for (const m of UI.menus) for (const it of m.items) if (it.key && !it.hidden) rows.push([it.key, it.label]);
    rows.push(['[ / ]', 'Brush size down / up'], ['Shift+[ / ]', 'Brush hardness down / up'], ['X', 'Swap foreground / background'], ['D', 'Default colors'], ['Space + drag', 'Pan'], ['Mouse wheel', 'Zoom at cursor'], ['Arrow keys', 'Nudge layer (Shift = 10px)'], ['Alt + click (brush)', 'Pick color'], ['Shift + click (brush)', 'Straight line from last point'], ['Esc / Enter', 'Cancel / confirm the current tool action']);
    return UI.dialog({ title: 'Keyboard Shortcuts', cancel: false, ok: 'Close', html: '<table class="keys">' + rows.map((r) => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('') + '</table>' });
  };
  UI.formatsDialog = () => UI.dialog({ title: 'Supported File Formats', cancel: false, ok: 'Close', html: `
<p><b>Open / Place (import):</b> PNG, JPEG, GIF (first frame), WebP, BMP, ICO, SVG, AVIF and JXL (when the browser supports them) — decoded natively.<br>
TIFF, DNG and TIFF-based camera RAW (CR2, NEF, ARW, …), HEIC/HEIF, and layered Photoshop PSD/PSB are decoded with small libraries that load on demand (internet needed the first time; RAW support is best effort).<br>
Project files (.pep) restore every layer, mask and transform. Unknown extensions are tried with every decoder.</p>
<p><b>Export:</b> PNG, JPEG (quality), WebP, BMP, TIFF, layered PSD, and .pep project files. Images larger than ${PE.MAX_DIM}px per side are reduced on import for browser stability.</p>` });
  UI.aboutDialog = () => UI.dialog({ title: 'PhotoEditor', cancel: false, ok: 'Close', html: `<p>PhotoEditor ${PE.VERSION} — a layer-based photo compositor that runs entirely in your browser. Nothing is uploaded; files stay on your computer.</p><p>Non-destructive layer transforms, layer masks, selections with feathering, brush/eraser/clone stamp, adjustments, filters, panorama stitching helpers, unlimited undo, and import/export of common and professional formats.</p>` });

  /* ------------------------------------------------------------ init & events */
  UI.init = function () {
    buildMenubar(); buildToolbox(); buildPanels();
    PE.events.on('toolchange', () => { UI.markTool(); UI.refreshOptions(); });
    const refreshAll = PE.rafThrottle(() => { UI.refreshLayers && UI.refreshLayers(); UI.refreshProps && UI.refreshProps(); UI.refreshOptionValues(); });
    PE.events.on('docchange', refreshAll);
    PE.events.on('activechange', refreshAll);
    PE.events.on('layerchange', PE.rafThrottle(() => { UI.refreshLayers && UI.refreshLayers(); }));
    PE.events.on('historychange', PE.rafThrottle(() => { UI.refreshHistory && UI.refreshHistory(); refreshAll(); }));
    PE.events.on('colorchange', () => UI.updateSwatches && UI.updateSwatches());
    PE.events.on('newdoc', () => { PE.$('#welcome').hidden = !!PE.doc; });
    UI.refreshHistory(); refreshAll();
    PE.$('#welcome').hidden = !!PE.doc;
  };
})();
