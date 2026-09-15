/* PhotoEditor - io.js : import (any image format the browser or the optional decoders understand) and export */
(function () {
  'use strict';
  const PE = window.PE;
  const IO = (PE.io = {});

  IO.LIBS = {
    utif: 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js',
    heic2any: 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
    agpsd: 'https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js',
  };
  const TIFF_EXT = ['tif', 'tiff', 'dng', 'cr2', 'nef', 'arw', 'orf', 'pef', 'srw', 'rw2', 'erf', '3fr', 'raf', 'kdc', 'dcr', 'mos'];
  const HEIC_EXT = ['heic', 'heif', 'hif'];
  const PSD_EXT = ['psd', 'psb'];
  const PROJECT_EXT = ['pep'];
  IO.ACCEPT = 'image/*,.tif,.tiff,.dng,.cr2,.nef,.arw,.orf,.pef,.srw,.rw2,.raf,.heic,.heif,.hif,.psd,.psb,.pep,.avif,.jxl,.webp,.bmp,.gif,.ico,.svg,.jpg,.jpeg,.png';

  IO.VENDOR = { utif: 'libs/UTIF.js', heic2any: 'libs/heic2any.min.js', agpsd: 'libs/ag-psd.bundle.js' };
  /** load an optional library from ./vendor when available (desktop app), else from the CDN */
  async function loadLib(key) {
    const base = await PE.assetBase();
    if (base) { try { await PE.loadScript(base + IO.VENDOR[key]); return; } catch (e) { console.warn('vendor lib failed, trying CDN', e); } }
    await PE.loadScript(IO.LIBS[key]);
  }
  const lib = {
    async utif() { if (!window.UTIF) await loadLib('utif'); if (!window.UTIF) throw new Error('TIFF decoder unavailable'); return window.UTIF; },
    async heic() { if (!window.heic2any) await loadLib('heic2any'); if (!window.heic2any) throw new Error('HEIC decoder unavailable'); return window.heic2any; },
    async psd() { if (!window.agPsd) await loadLib('agpsd'); if (!window.agPsd) throw new Error('PSD library unavailable'); return window.agPsd; },
  };
  IO.lib = lib;

  /** clamp an image to the safe maximum size; returns canvas */
  function toSafeCanvas(source, w, h) {
    w = w || source.width; h = h || source.height;
    const k = Math.min(1, PE.MAX_DIM / w, PE.MAX_DIM / h, Math.sqrt(PE.MAX_AREA / (w * h)));
    const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    const c = PE.createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, W, H);
    if (k < 1) PE.toast(`Image reduced to ${W}×${H} (max ${PE.MAX_DIM}px per side / ${PE.MAX_AREA / 1e6} MP)`, { type: 'warn', ms: 6000 });
    return c;
  }
  const readBuffer = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read file')); r.readAsArrayBuffer(file); });
  const readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read file')); r.readAsText(file); });

  /* ---------- decoders ---------- */
  async function decodeNative(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await PE.loadImage(url);
      let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) { w = 1024; h = 1024; } // e.g. SVG without intrinsic size
      return toSafeCanvas(img, w, h);
    } finally { URL.revokeObjectURL(url); }
  }
  async function decodeTiff(file) {
    const UTIF = await lib.utif();
    const buf = await readBuffer(file);
    const ifds = UTIF.decode(buf);
    if (!ifds || !ifds.length) throw new Error('No image found in TIFF/RAW file');
    // prefer the largest decodable page (RAW files often carry small previews first)
    const sorted = ifds.slice().sort((a, b) => (b.width * b.height || 0) - (a.width * a.height || 0));
    let lastErr = null;
    for (const ifd of sorted) {
      try {
        UTIF.decodeImage(buf, ifd);
        const rgba = UTIF.toRGBA8(ifd);
        if (!ifd.width || !ifd.height || !rgba || !rgba.length) continue;
        const id = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, ifd.width * ifd.height * 4), ifd.width, ifd.height);
        return toSafeCanvas(PE.canvasFromImageData(id));
      } catch (e) { lastErr = e; }
    }
    throw new Error('Unsupported TIFF/RAW encoding' + (lastErr ? ': ' + lastErr.message : ''));
  }
  async function decodeHeic(file) {
    const heic2any = await lib.heic();
    let out = await heic2any({ blob: file, toType: 'image/png' });
    if (Array.isArray(out)) out = out[0];
    return decodeNative(out);
  }
  const PSD_BLEND = { 'normal': 'normal', 'multiply': 'multiply', 'screen': 'screen', 'overlay': 'overlay', 'darken': 'darken', 'lighten': 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', 'difference': 'difference', 'exclusion': 'exclusion', 'hue': 'hue', 'saturation': 'saturation', 'color': 'color', 'luminosity': 'luminosity' };
  const BLEND_PSD = {}; for (const k in PSD_BLEND) BLEND_PSD[PSD_BLEND[k]] = k;
  async function decodePsd(file) {
    const agPsd = await lib.psd();
    const buf = await readBuffer(file);
    const psd = agPsd.readPsd(buf, { skipThumbnail: true, useImageData: false });
    const layers = [];
    const walk = (children, hidden) => {
      for (const ch of children || []) {
        const isHidden = hidden || !!ch.hidden;
        if (ch.children) { walk(ch.children, isHidden); continue; }
        if (!ch.canvas || !ch.canvas.width || !ch.canvas.height) continue;
        layers.push({
          canvas: ch.canvas, name: ch.name || 'Layer', left: ch.left || 0, top: ch.top || 0,
          opacity: ch.opacity === undefined ? 1 : ch.opacity, blend: PSD_BLEND[ch.blendMode] || 'normal', visible: !isHidden,
          mask: ch.mask && ch.mask.canvas ? { canvas: ch.mask.canvas, left: ch.mask.left || 0, top: ch.mask.top || 0, defaultColor: ch.mask.defaultColor === undefined ? 0 : ch.mask.defaultColor, disabled: !!ch.mask.disabled } : null,
        });
      }
    };
    walk(psd.children, false);
    if (!layers.length && psd.canvas) layers.push({ canvas: psd.canvas, name: PE.baseName(file.name), left: 0, top: 0, opacity: 1, blend: 'normal', visible: true, mask: null });
    if (!layers.length) throw new Error('PSD contains no raster layers');
    const k = Math.min(1, PE.MAX_DIM / psd.width, PE.MAX_DIM / psd.height);
    if (k < 1) throw new Error(`PSD is larger than the supported ${PE.MAX_DIM}px limit`);
    return { kind: 'layered', width: psd.width, height: psd.height, name: PE.baseName(file.name), layers };
  }

  /** Decode any supported file -> {kind:'image', canvas} | {kind:'layered', ...} | {kind:'project', data} */
  IO.decodeFile = async function (file) {
    const ext = PE.fileExt(file.name);
    const type = (file.type || '').toLowerCase();
    if (PROJECT_EXT.includes(ext) || (ext === 'json' && file.size < 512 * 1024 * 1024)) {
      const text = await readText(file);
      let data; try { data = JSON.parse(text); } catch (e) { throw new Error('Not a valid project file'); }
      if (data && data.app === 'PhotoEditor') return { kind: 'project', data };
      throw new Error('Not a PhotoEditor project file');
    }
    if (PSD_EXT.includes(ext) || type === 'image/vnd.adobe.photoshop') return decodePsd(file);
    if (TIFF_EXT.includes(ext) || type === 'image/tiff') return { kind: 'image', canvas: await decodeTiff(file) };
    if (HEIC_EXT.includes(ext) || type === 'image/heic' || type === 'image/heif') return { kind: 'image', canvas: await decodeHeic(file) };
    // everything else: let the browser try first (png, jpeg, gif, webp, bmp, ico, svg, avif, jxl ...)
    try { return { kind: 'image', canvas: await decodeNative(file) }; }
    catch (e) {
      // unknown extension / misnamed file: try the other decoders
      try { return { kind: 'image', canvas: await decodeTiff(file) }; } catch (_) { /* ignore */ }
      try { return { kind: 'image', canvas: await decodeHeic(file) }; } catch (_) { /* ignore */ }
      throw new Error(`Cannot decode "${file.name}" — format not supported by this browser`);
    }
  };

  /**
   * Import files: first file opens a new document if there is none (or asNew), others are placed as layers.
   * @param {File[]} files  @param {object} o {asNew:boolean}
   */
  IO.importFiles = async function (files, o) {
    o = o || {};
    files = Array.from(files || []);
    if (!files.length) return;
    PE.ui && PE.ui.busy(true, 'Importing…');
    let ok = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const r = await IO.decodeFile(f);
          const openNew = !PE.doc || (o.asNew && i === 0) || r.kind === 'project';
          if (openNew && PE.doc && PE.history.entries.length && !o.force) {
            const yes = await PE.ui.confirm('Replace the current document?', `Opening "${f.name}" as a new document discards unsaved changes to "${PE.doc.name}". (Use File ▸ Place to add it as a layer instead.)`);
            if (!yes) continue;
          }
          if (r.kind === 'project') { await IO.loadProject(r.data, f.name); ok++; continue; }
          if (r.kind === 'layered') {
            if (openNew) PE.actions.openLayeredDocument(r);
            else PE.actions.transact('Place ' + f.name, (d) => { for (const l of r.layers) d.addLayer(PE.actions.layerFromDesc(l)); });
          } else if (openNew) PE.actions.openImageAsDocument(r.canvas, f.name);
          else PE.actions.placeImage(r.canvas, f.name);
          ok++;
        } catch (e) {
          console.error(e);
          PE.toast(`${f.name}: ${e.message}`, { type: 'error' });
        }
      }
    } finally { PE.ui && PE.ui.busy(false); }
    if (ok) PE.requestRender();
    return ok;
  };

  /* ---------- project save / load ---------- */
  IO.projectData = function (d) {
    const layers = [];
    for (const L of d.layers) {
      layers.push({
        name: L.name, type: L.type, opacity: L.opacity, blend: L.blend, visible: L.visible, locked: L.locked,
        cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, maskEnabled: L.maskEnabled, text: L.text,
        img: L.img.toDataURL('image/png'), mask: L.mask ? L.mask.toDataURL('image/png') : null,
      });
    }
    return { app: 'PhotoEditor', version: 1, name: d.name, width: d.width, height: d.height, activeIndex: d.activeIndex, layers };
  };
  IO.saveProject = async function () {
    const d = PE.doc; if (!d) return;
    PE.ui && PE.ui.busy(true, 'Saving project…');
    try {
      const data = IO.projectData(d);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      await PE.saveBlob(blob, (PE.baseName(d.name) || 'project') + '.pep', 'PhotoEditor project');
    } finally { PE.ui && PE.ui.busy(false); }
  };
  IO.loadProject = async function (data, fileName) {
    if (!data || data.app !== 'PhotoEditor' || !Array.isArray(data.layers)) throw new Error('Invalid project file');
    const d = new PE.Doc(data.width, data.height, PE.baseName(fileName) || data.name || 'Project');
    for (const l of data.layers) {
      const img = await PE.loadImage(l.img);
      const c = PE.copyCanvas(img, img.naturalWidth, img.naturalHeight);
      let mask = null;
      if (l.mask) { const mi = await PE.loadImage(l.mask); mask = PE.copyCanvas(mi, mi.naturalWidth, mi.naturalHeight); }
      d.layers.push(new PE.Layer({ img: c, mask, name: l.name, type: l.type, opacity: l.opacity, blend: l.blend, visible: l.visible, locked: l.locked, cx: l.cx, cy: l.cy, sx: l.sx, sy: l.sy, rot: l.rot, maskEnabled: l.maskEnabled, text: l.text }));
    }
    if (!d.layers.length) d.layers.push(new PE.Layer({ img: PE.createCanvas(d.width, d.height), name: 'Layer 1' }));
    d.activeIndex = PE.clamp(data.activeIndex || 0, 0, d.layers.length - 1);
    PE.actions.setDocument(d);
    return d;
  };

  /* ---------- encoders ---------- */
  function encodeBMP(canvas) {
    // 24-bit BMP, composited over white (BMP has no reliable alpha)
    const w = canvas.width, h = canvas.height;
    const tmp = PE.createCanvas(w, h); const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, w, h); tctx.drawImage(canvas, 0, 0);
    const d = tctx.getImageData(0, 0, w, h).data;
    const rowSize = Math.floor((24 * w + 31) / 32) * 4, imgSize = rowSize * h;
    const buf = new ArrayBuffer(54 + imgSize); const v = new DataView(buf); const u8 = new Uint8Array(buf);
    v.setUint8(0, 0x42); v.setUint8(1, 0x4d); v.setUint32(2, 54 + imgSize, true); v.setUint32(10, 54, true);
    v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true);
    v.setUint32(30, 0, true); v.setUint32(34, imgSize, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * rowSize;
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u8[o++] = d[i + 2]; u8[o++] = d[i + 1]; u8[o++] = d[i]; }
    }
    return new Blob([buf], { type: 'image/bmp' });
  }
  async function encodeTIFF(canvas) {
    const UTIF = await lib.utif();
    const id = PE.getImageData(canvas);
    const buf = UTIF.encodeImage(id.data.buffer, canvas.width, canvas.height);
    return new Blob([buf], { type: 'image/tiff' });
  }
  async function encodePSD(d) {
    const agPsd = await lib.psd();
    const W = d.width, H = d.height;
    const children = d.layers.map((L) => {
      const canvas = L.renderToDoc(W, H, false);
      const child = { name: L.name, canvas, left: 0, top: 0, right: W, bottom: H, opacity: L.opacity, blendMode: BLEND_PSD[L.blend] || 'normal', hidden: !L.visible };
      if (L.mask) {
        const m = L.renderMaskToDoc(W, H);
        const id = PE.getImageData(m), px = id.data;
        for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; px[i] = a; px[i + 1] = a; px[i + 2] = a; px[i + 3] = 255; }
        child.mask = { canvas: PE.canvasFromImageData(id), left: 0, top: 0, right: W, bottom: H, defaultColor: 0, disabled: !L.maskEnabled };
      }
      return child;
    });
    const psd = { width: W, height: H, children, canvas: d.flatten() };
    const buf = agPsd.writePsd(psd, { generateThumbnail: true, trimImageData: true });
    return new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
  }

  IO.encoders = { bmp: encodeBMP, tiff: encodeTIFF, psd: encodePSD };
  IO.FORMATS = [
    ['png', 'PNG (lossless, transparency)'], ['jpeg', 'JPEG'], ['webp', 'WebP'], ['bmp', 'BMP'], ['tiff', 'TIFF'], ['psd', 'Photoshop PSD (layers)'],
  ];
  /**
   * Export the document. o = {format, quality(0..1), scale(0..1+), layerOnly:boolean, background:'#fff'|null}
   */
  IO.exportImage = async function (o) {
    const d = PE.doc; if (!d) return;
    o = o || {};
    const fmt = o.format || 'png';
    const base = PE.baseName(d.name) || 'image';
    PE.ui && PE.ui.busy(true, 'Exporting…');
    try {
      if (fmt === 'psd') { const blob = await encodePSD(d); await PE.saveBlob(blob, base + '.psd', 'Photoshop document'); return; }
      let src = o.layerOnly && d.active ? d.active.renderToDoc(d.width, d.height) : d.flatten();
      if (o.selectionOnly && d.selection) {
        const b = d.selection.bounds();
        const c = PE.createCanvas(b.w, b.h); const ctx = c.getContext('2d');
        ctx.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(d.selection.canvas(), b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        src = c;
      }
      const scale = o.scale || 1;
      if (scale !== 1) src = scale < 1 ? PE.downscale(src, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale))) : PE.scaleCanvas(src, Math.round(src.width * scale), Math.round(src.height * scale));
      if (o.background && fmt !== 'png' && fmt !== 'webp' && fmt !== 'tiff' || (o.background && o.flattenBackground)) {
        const c = PE.createCanvas(src.width, src.height); const ctx = c.getContext('2d');
        ctx.fillStyle = o.background; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0); src = c;
      }
      let blob, ext = fmt;
      if (fmt === 'png') blob = await PE.canvasToBlob(src, 'image/png');
      else if (fmt === 'jpeg') { const c = PE.createCanvas(src.width, src.height); const ctx = c.getContext('2d'); ctx.fillStyle = o.background || '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0); blob = await PE.canvasToBlob(c, 'image/jpeg', o.quality === undefined ? 0.92 : o.quality); ext = 'jpg'; }
      else if (fmt === 'webp') { blob = await PE.canvasToBlob(src, 'image/webp', o.quality === undefined ? 0.92 : o.quality); if (blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP'); }
      else if (fmt === 'bmp') blob = encodeBMP(src);
      else if (fmt === 'tiff') { blob = await encodeTIFF(src); ext = 'tif'; }
      else throw new Error('Unknown format ' + fmt);
      await PE.saveBlob(blob, `${base}${o.layerOnly ? '-layer' : ''}.${ext}`, fmt.toUpperCase() + ' image');
      PE.toast(`Exported ${fmt.toUpperCase()} (${PE.formatBytes(blob.size)})`);
    } catch (e) { console.error(e); PE.toast('Export failed: ' + e.message, { type: 'error' }); }
    finally { PE.ui && PE.ui.busy(false); }
  };

  /* ---------- file pickers ---------- */
  IO.openFilePicker = function (asNew) {
    const inp = PE.$('#file-input');
    inp.value = '';
    inp.onchange = () => { const files = Array.from(inp.files || []); if (files.length) IO.importFiles(files, { asNew }); };
    inp.click();
  };
})();
