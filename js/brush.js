/* PhotoEditor - brush.js : brush stamps, strokes (paint / erase / clone), commit to layer bitmap or mask */
(function () {
  'use strict';
  const PE = window.PE;

  const stampCache = new Map();
  /** Radial brush stamp canvas of resolution `res`, hardness 0..1, color 'r,g,b' */
  PE.getStamp = function (res, hardness, colorKey) {
    const key = res + '|' + hardness.toFixed(3) + '|' + colorKey;
    let c = stampCache.get(key);
    if (c) return c;
    c = PE.createCanvas(res, res);
    const ctx = c.getContext('2d');
    const r = res / 2;
    const inner = PE.clamp(hardness, 0, 1) * r;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${colorKey},1)`);
    if (inner > 0) g.addColorStop(Math.min(0.999, inner / r), `rgba(${colorKey},1)`);
    g.addColorStop(1, `rgba(${colorKey},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, res, res);
    if (stampCache.size > 64) stampCache.delete(stampCache.keys().next().value);
    stampCache.set(key, c);
    return c;
  };
  const pow2 = (v) => { let p = 16; while (p < v && p < 2048) p *= 2; return p; };

  /**
   * A stroke accumulates brush stamps into a canvas in the target's bitmap space
   * (layer image or layer mask), so the whole stroke can be applied with one opacity
   * and clipped by the selection, like Photoshop.
   */
  class Stroke {
    /**
     * @param {object} o {layer, target:'img'|'mask', mode:'paint'|'erase'|'clone', color:[r,g,b], size, hardness, opacity, flow, spacing, selection, clone:{src,dx,dy}, pressure:boolean}
     */
    constructor(o) {
      this.layer = o.layer; this.target = o.target || 'img'; this.mode = o.mode || 'paint';
      this.color = o.color || [0, 0, 0];
      this.size = Math.max(1, o.size || 10); this.hardness = PE.clamp(o.hardness === undefined ? 1 : o.hardness, 0, 1);
      this.opacity = PE.clamp(o.opacity === undefined ? 1 : o.opacity, 0, 1);
      this.flow = PE.clamp(o.flow === undefined ? 1 : o.flow, 0.01, 1);
      this.spacing = o.spacing || 0.12;
      this.selection = o.selection || null;
      this.clone = o.clone || null;
      this.usePressure = !!o.pressure;
      this.value = o.value; // mask value 0..1 (mask target)
      const L = this.layer;
      this.canvas = PE.createCanvas(L.w, L.h);
      this.ctx = this.canvas.getContext('2d');
      this.inv = L.inverse;
      this.scale = PE.matScale(this.inv);
      this.last = null; this.acc = 0; this.dirty = null; this.stamps = 0;
      // stroke color: mask/erase strokes are white coverage, paint strokes carry the color
      this.colorKey = (this.target === 'mask' || this.mode === 'erase' || this.mode === 'clone') ? '255,255,255' : this.color.join(',');
      this._tmp = null;
    }
    addPoint(x, y, pressure, pointerType) {
      let r = this.size / 2;
      if (this.usePressure && pointerType === 'pen' && pressure > 0) r *= PE.clamp(pressure * 1.5, 0.05, 1);
      if (!this.last) { this.stamp(x, y, r); this.last = [x, y, r]; return; }
      const [lx, ly, lr] = this.last;
      const dx = x - lx, dy = y - ly, dist = Math.hypot(dx, dy);
      const spacing = Math.max(0.5, Math.max(r, lr) * 2 * this.spacing);
      let pos = 0;
      while (this.acc + (dist - pos) >= spacing) {
        pos += spacing - this.acc; this.acc = 0;
        const t = pos / dist;
        this.stamp(lx + dx * t, ly + dy * t, PE.lerp(lr, r, t));
      }
      this.acc += dist - pos;
      this.last = [x, y, r];
    }
    /** stamp at doc coords (x,y) radius r (doc px) */
    stamp(x, y, r) {
      const ctx = this.ctx;
      ctx.setTransform(...this.inv);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = this.flow;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      // limit hardness so there is always ~1px anti-aliasing at the edge
      const rPx = r * this.scale;
      const hard = Math.min(this.hardness, Math.max(0, 1 - 1.2 / Math.max(1, rPx)));
      if (this.mode === 'clone' && this.clone) {
        const D = Math.max(2, Math.ceil(2 * r)), R = D / 2;
        if (!this._tmp || this._tmp.width !== D) { this._tmp = PE.createCanvas(D, D); }
        const t = this._tmp, tctx = t.getContext('2d');
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.globalCompositeOperation = 'source-over';
        tctx.clearRect(0, 0, D, D);
        tctx.drawImage(PE.getStamp(pow2(D), hard, '255,255,255'), 0, 0, D, D);
        tctx.globalCompositeOperation = 'source-in';
        tctx.drawImage(this.clone.src, R - (x + this.clone.dx), R - (y + this.clone.dy));
        ctx.drawImage(t, x - R, y - R, D, D);
        this._dirty(x - R, y - R, D, D);
      } else {
        const res = pow2(2 * rPx);
        ctx.drawImage(PE.getStamp(res, hard, this.colorKey), x - r, y - r, 2 * r, 2 * r);
        this._dirty(x - r, y - r, 2 * r, 2 * r);
      }
      this.stamps++;
    }
    _dirty(x, y, w, h) {
      const b = PE.transformRectBounds(this.inv, x, y, w, h);
      b.x -= 1; b.y -= 1; b.w += 2; b.h += 2;
      this.dirty = PE.rectUnion(this.dirty, b);
    }
    /** stroke canvas clipped by selection (in target space) */
    clipped() {
      if (!this.selection) return this.canvas;
      const c = PE.copyCanvas(this.canvas);
      const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(...this.inv);
      ctx.drawImage(this.selection.canvas(), 0, 0);
      return c;
    }
    /** apply this stroke onto `canvas` (a layer image or mask canvas / or a copy of it) */
    applyTo(canvas, rect) {
      const src = this.clipped();
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const r = rect || { x: 0, y: 0, w: canvas.width, h: canvas.height };
      if (this.target === 'mask') {
        // mask_new = mask*(1 - s*o) + v*s*o   (mask stored as white with alpha)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = this.opacity;
        ctx.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.opacity * PE.clamp(this.value === undefined ? 1 : this.value, 0, 1);
        if (ctx.globalAlpha > 0) ctx.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      } else {
        ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
        ctx.globalAlpha = this.opacity;
        ctx.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      }
      ctx.restore();
    }
    /** canvas to use for live preview of the layer (image with mask) while stroking */
    previewLayer() {
      const L = this.layer;
      if (this.target === 'mask') {
        const m = PE.copyCanvas(L.mask);
        this.applyTo(m);
        const c = PE.copyCanvas(L.img);
        if (L.maskEnabled) { const ctx = c.getContext('2d'); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0); }
        return c;
      }
      const c = PE.copyCanvas(L.img);
      this.applyTo(c);
      if (L.mask && L.maskEnabled) { const ctx = c.getContext('2d'); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(L.mask, 0, 0); }
      return c;
    }
    /** apply the stroke to the real layer and record undo */
    commit(label) {
      const L = this.layer;
      const canvas = this.target === 'mask' ? L.mask : L.img;
      if (!canvas) return false;
      const rect = PE.rectClampInt(this.dirty, canvas.width, canvas.height);
      if (!rect || !this.stamps) return false;
      const ctx = canvas.getContext('2d');
      const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
      this.applyTo(canvas, rect);
      const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
      const doc = PE.doc;
      PE.history.push(PE.history.pixelEntry(label || 'Brush', canvas, rect, before, after, () => doc.markDirty(L)));
      doc.markDirty(L);
      return true;
    }
  }
  PE.Stroke = Stroke;

  /**
   * Apply a ready-made coverage canvas (target space, white+alpha or colored) to a layer/mask, e.g. fill / gradient / shapes.
   * @param {object} o {layer, target, canvas, mode:'paint'|'erase', opacity, value, selection, label, valueCanvas}
   *  - for masks: `canvas` = coverage (alpha = c), `valueCanvas` (optional) = white with alpha = new value; if omitted `value` is used.
   */
  PE.applyCoverage = function (o) {
    const L = o.layer, target = o.target || 'img';
    const canvas = target === 'mask' ? L.mask : L.img;
    if (!canvas) return false;
    let cov = o.canvas;
    if (o.selection) {
      cov = PE.copyCanvas(cov);
      const cctx = cov.getContext('2d');
      cctx.globalCompositeOperation = 'destination-in';
      cctx.setTransform(...L.inverse);
      cctx.drawImage(o.selection.canvas(), 0, 0);
    }
    const rect = PE.rectClampInt(o.rect || { x: 0, y: 0, w: canvas.width, h: canvas.height }, canvas.width, canvas.height);
    if (!rect) return false;
    const ctx = canvas.getContext('2d');
    const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const op = o.opacity === undefined ? 1 : o.opacity;
    if (target === 'mask') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = op;
      ctx.drawImage(cov, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      if (o.valueCanvas) {
        // value canvas alpha = g ; need g*c : intersect with coverage
        const v = PE.copyCanvas(o.valueCanvas);
        const vctx = v.getContext('2d');
        vctx.globalCompositeOperation = 'destination-in';
        vctx.drawImage(cov, 0, 0);
        ctx.globalAlpha = op;
        ctx.drawImage(v, 0, 0);
      } else {
        ctx.globalAlpha = op * PE.clamp(o.value === undefined ? 1 : o.value, 0, 1);
        if (ctx.globalAlpha > 0) ctx.drawImage(cov, 0, 0);
      }
    } else {
      ctx.globalCompositeOperation = o.mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.globalAlpha = op;
      ctx.drawImage(cov, 0, 0);
    }
    ctx.restore();
    const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    const doc = PE.doc;
    PE.history.push(PE.history.pixelEntry(o.label || 'Fill', canvas, rect, before, after, () => doc.markDirty(L)));
    doc.markDirty(L);
    return true;
  };

  /**
   * Make sure a layer can be painted on in doc space: bitmap must be pixel aligned and cover the document.
   * Otherwise the layer is rasterized (transform baked) into a bitmap covering doc ∪ layer bounds.
   * Text layers become raster layers.
   */
  PE.ensurePaintable = function (L) {
    const doc = PE.doc;
    if (!L) return false;
    const needsRaster = L.type === 'text';
    let ok = !needsRaster && L.isPixelAligned();
    if (ok) {
      const [ox, oy] = L.offset();
      if (ox > 0 || oy > 0 || ox + L.w < doc.width || oy + L.h < doc.height) ok = false;
    }
    if (ok) return true;
    // union of doc rect and layer bounds (limited to one doc size beyond each edge)
    const b = L.bounds();
    const x0 = Math.max(-doc.width, Math.min(0, Math.floor(b.x)));
    const y0 = Math.max(-doc.height, Math.min(0, Math.floor(b.y)));
    const x1 = Math.min(2 * doc.width, Math.max(doc.width, Math.ceil(b.x + b.w)));
    const y1 = Math.min(2 * doc.height, Math.max(doc.height, Math.ceil(b.y + b.h)));
    const W = x1 - x0, H = y1 - y0;
    const m = PE.matMul(PE.matTranslate(-x0, -y0), L.matrix);
    const bake = (src) => {
      const c = PE.createCanvas(W, H);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(...m);
      ctx.drawImage(src, 0, 0);
      return c;
    };
    const before = { img: L.img, mask: L.mask, w: L.w, h: L.h, cx: L.cx, cy: L.cy, sx: L.sx, sy: L.sy, rot: L.rot, type: L.type, text: L.text };
    const after = {
      img: bake(L.img), mask: L.mask ? bake(L.mask) : null, w: W, h: H,
      cx: x0 + W / 2, cy: y0 + H / 2, sx: 1, sy: 1, rot: 0, type: 'raster', text: null,
    };
    Object.assign(L, after); L.invalidate();
    PE.history.push({
      label: 'Rasterize Layer', bytes: W * H * 8,
      undo() { Object.assign(L, before); L.invalidate(); doc.markDirty(L); },
      redo() { Object.assign(L, after); L.invalidate(); doc.markDirty(L); },
    });
    doc.markDirty(L);
    PE.toast(needsRaster ? 'Text layer rasterized' : 'Layer rasterized to canvas for painting');
    return true;
  };
})();
