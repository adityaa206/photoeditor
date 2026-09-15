/* PhotoEditor - util.js : shared helpers (math, canvas, color, DOM, events) */
(function () {
  'use strict';
  const PE = (window.PE = window.PE || {});
  PE.VERSION = '1.1.0';

  // ---------- numbers ----------
  PE.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PE.lerp = (a, b, t) => a + (b - a) * t;
  PE.round = (v, d = 0) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
  PE.deg = (rad) => (rad * 180) / Math.PI;
  PE.rad = (deg) => (deg * Math.PI) / 180;
  PE.normAngle = (a) => { a = a % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
  let _uid = 1;
  PE.uid = () => _uid++;

  // ---------- canvas ----------
  PE.MAX_DIM = 8192;      // max width/height of an imported image (browser canvas safety)
  PE.MAX_AREA = 48e6;     // max pixel area of an imported image

  PE.createCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  PE.ctx = (c, opts) => c.getContext('2d', opts || undefined);
  PE.copyCanvas = function (src, w, h) {
    const c = PE.createCanvas(w || src.width, h || src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  PE.canvasFromImageData = function (id) {
    const c = PE.createCanvas(id.width, id.height);
    c.getContext('2d').putImageData(id, 0, 0);
    return c;
  };
  PE.getImageData = (canvas, x, y, w, h) => {
    if (x === undefined) return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    return canvas.getContext('2d').getImageData(x, y, w, h);
  };
  PE.fillCanvas = function (canvas, color) {
    const ctx = canvas.getContext('2d');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
  };
  /** Draw `src` scaled to fit inside w x h, returns new canvas */
  PE.scaleCanvas = function (src, w, h) {
    const c = PE.createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, c.width, c.height);
    return c;
  };
  /** Downscale a canvas in steps (better quality for big reductions). */
  PE.downscale = function (src, w, h) {
    let cur = src;
    while (cur.width / 2 > w && cur.height / 2 > h) {
      cur = PE.scaleCanvas(cur, Math.floor(cur.width / 2), Math.floor(cur.height / 2));
    }
    return PE.scaleCanvas(cur, w, h);
  };
  PE.canvasHasPixels = function (c) {
    const d = PE.getImageData(c).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return true;
    return false;
  };
  /** Bounding box of non-transparent pixels, or null */
  PE.alphaBounds = function (canvas) {
    const w = canvas.width, h = canvas.height, d = PE.getImageData(canvas).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };

  // ---------- rects ----------
  PE.rectUnion = function (a, b) {
    if (!a) return b ? { ...b } : null; if (!b) return { ...a };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  PE.rectIntersect = function (a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x || y2 <= y) return null;
    return { x, y, w: x2 - x, h: y2 - y };
  };
  /** Round a float rect outward to integers and clamp to [0,W]x[0,H]; null if empty */
  PE.rectClampInt = function (r, W, H) {
    if (!r) return null;
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const x2 = Math.min(W, Math.ceil(r.x + r.w)), y2 = Math.min(H, Math.ceil(r.y + r.h));
    if (x2 <= x || y2 <= y) return null;
    return { x, y, w: x2 - x, h: y2 - y };
  };
  PE.rectFromPoints = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  PE.pointsBounds = function (pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  // ---------- affine matrices [a,b,c,d,e,f] (canvas convention) ----------
  PE.matIdentity = () => [1, 0, 0, 1, 0, 0];
  /** M * N  (apply N first, then M) */
  PE.matMul = function (m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  };
  PE.matInvert = function (m) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    if (!det) return [1, 0, 0, 1, 0, 0];
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
  };
  PE.matApply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  PE.matTranslate = (tx, ty) => [1, 0, 0, 1, tx, ty];
  /** bbox of a rect (x,y,w,h) transformed by m */
  PE.transformRectBounds = function (m, x, y, w, h) {
    return PE.pointsBounds([PE.matApply(m, x, y), PE.matApply(m, x + w, y), PE.matApply(m, x + w, y + h), PE.matApply(m, x, y + h)]);
  };
  /** approximate uniform scale factor of matrix */
  PE.matScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

  // ---------- colors ----------
  PE.hexToRgb = function (hex) {
    hex = String(hex || '').trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  PE.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => PE.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  PE.rgbStr = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  PE.luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  PE.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  };
  PE.hslToRgb = function (h, s, l) {
    h = ((h % 1) + 1) % 1;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  };

  // ---------- events ----------
  PE.events = {
    _h: {},
    on(name, fn) { (this._h[name] = this._h[name] || []).push(fn); return fn; },
    off(name, fn) { const a = this._h[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(name, ...args) { const a = this._h[name]; if (a) for (const fn of a.slice()) { try { fn(...args); } catch (e) { console.error('event handler error', name, e); } } },
  };

  // ---------- DOM ----------
  PE.$ = (sel, root) => (root || document).querySelector(sel);
  PE.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  PE.el = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k in e && k !== 'list' && typeof v !== 'string') { try { e[k] = v; } catch (_) { e.setAttribute(k, v); } }
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return e;
  };
  PE.isEditableTarget = function (t) {
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  };

  // ---------- toasts ----------
  PE.toast = function (msg, opts) {
    opts = opts || {};
    const host = PE.$('#toasts'); if (!host) { console.log('[toast]', msg); return; }
    const t = PE.el('div', { class: 'toast ' + (opts.type || 'info') }, msg);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    const ms = opts.ms || (opts.type === 'error' ? 6000 : 3200);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // ---------- misc ----------
  /** Coalesce calls into one per animation frame (with a timer fallback for hidden tabs). */
  PE.rafThrottle = function (fn) {
    let scheduled = false, lastArgs = null, token = 0;
    return function (...args) {
      lastArgs = args;
      if (scheduled) return;
      scheduled = true;
      const t = ++token;
      const go = () => { if (t !== token || !scheduled) return; scheduled = false; fn(...lastArgs); };
      requestAnimationFrame(go);
      setTimeout(go, 80);
    };
  };
  PE.formatBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  PE.fileExt = (name) => { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  PE.baseName = (name) => String(name || 'image').replace(/\.[^.]+$/, '');
  PE.loadScript = function (url) {
    PE._scripts = PE._scripts || {};
    if (PE._scripts[url]) return PE._scripts[url];
    PE._scripts[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete PE._scripts[url]; reject(new Error('Failed to load ' + url + ' (are you online?)')); };
      document.head.appendChild(s);
    });
    return PE._scripts[url];
  };
  /** Base URL of the local ./vendor folder (desktop app / http server) or null when running from file:// */
  PE.assetBase = async function () {
    if (PE._assetBase !== undefined) return PE._assetBase;
    PE._assetBase = null;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try { const r = await fetch('vendor/manifest.json', { cache: 'no-store' }); if (r.ok) PE._assetBase = new URL('vendor/', location.href).href; } catch (_) { /* no vendor folder */ }
    }
    return PE._assetBase;
  };
  /** Save a Blob to disk: native dialog in the desktop app, File System Access API in browsers, else a download link. */
  PE.saveBlob = async function (blob, filename, typeDesc) {
    if (window.electronAPI && window.electronAPI.saveFile) {
      const ext = PE.fileExt(filename);
      const data = new Uint8Array(await blob.arrayBuffer());
      const r = await window.electronAPI.saveFile(filename, data, ext ? [{ name: typeDesc || ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : []);
      if (r && r.ok) PE.toast('Saved ' + r.path);
      return !!(r && r.ok);
    }
    if (window.showSaveFilePicker) {
      try {
        const ext = '.' + PE.fileExt(filename);
        const opts = { suggestedName: filename };
        if (ext.length > 1 && blob.type) opts.types = [{ description: typeDesc || 'File', accept: { [blob.type]: [ext] } }];
        const handle = await window.showSaveFilePicker(opts);
        const w = await handle.createWritable();
        await w.write(blob); await w.close();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false; // user cancelled
        console.warn('showSaveFilePicker failed, falling back to download', e);
      }
    }
    const url = URL.createObjectURL(blob);
    const a = PE.el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  };
  PE.canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image as ' + type))), type, quality);
  });
  PE.loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });
})();
