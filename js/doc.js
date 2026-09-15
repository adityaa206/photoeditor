/* PhotoEditor - doc.js : Layer + Document model and compositor */
(function () {
  'use strict';
  const PE = window.PE;

  PE.BLEND_MODES = [
    ['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
    ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'],
    ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
    ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'],
  ];
  PE.blendToOp = (b) => (b === 'normal' ? 'source-over' : b);

  /* ------------------------------------------------------------------ */
  class Layer {
    /**
     * @param {object} o  { img(canvas), name, type, cx, cy, sx, sy, rot, opacity, blend, visible, locked, mask, maskEnabled, text }
     * Transform: doc = T(cx,cy) · R(rot) · S(sx,sy) · T(-w/2,-h/2) · layerPoint
     */
    constructor(o) {
      o = o || {};
      this.id = PE.uid();
      this.name = o.name || 'Layer';
      this.type = o.type || 'raster'; // 'raster' | 'text'
      this.img = o.img || PE.createCanvas(1, 1);
      this.w = this.img.width; this.h = this.img.height;
      this.cx = o.cx !== undefined ? o.cx : this.w / 2;
      this.cy = o.cy !== undefined ? o.cy : this.h / 2;
      this.sx = o.sx !== undefined ? o.sx : 1;
      this.sy = o.sy !== undefined ? o.sy : 1;
      this.rot = o.rot || 0;
      this.opacity = o.opacity !== undefined ? o.opacity : 1;
      this.blend = o.blend || 'normal';
      this.visible = o.visible !== undefined ? !!o.visible : true;
      this.locked = !!o.locked;
      this.mask = o.mask || null;           // canvas, same size as img, white with alpha = mask value
      this.maskEnabled = o.maskEnabled !== undefined ? !!o.maskEnabled : true;
      this.text = o.text || null;            // {text,font,size,color,bold,italic,align}
      this._eff = null;
      this.thumbDirty = true;
    }
    get matrix() {
      const cos = Math.cos(this.rot), sin = Math.sin(this.rot);
      const a = this.sx * cos, b = this.sx * sin, c = -this.sy * sin, d = this.sy * cos;
      return [a, b, c, d, this.cx - (a * this.w / 2 + c * this.h / 2), this.cy - (b * this.w / 2 + d * this.h / 2)];
    }
    get inverse() { return PE.matInvert(this.matrix); }
    corners() {
      const m = this.matrix, w = this.w, h = this.h;
      return [PE.matApply(m, 0, 0), PE.matApply(m, w, 0), PE.matApply(m, w, h), PE.matApply(m, 0, h)];
    }
    bounds() { return PE.pointsBounds(this.corners()); }
    /** true when layer pixels map 1:1 to document pixels (integer translation only) */
    isPixelAligned() {
      const ox = this.cx - this.w / 2, oy = this.cy - this.h / 2;
      return Math.abs(this.rot) < 1e-9 && this.sx === 1 && this.sy === 1 && Math.abs(ox - Math.round(ox)) < 1e-6 && Math.abs(oy - Math.round(oy)) < 1e-6;
    }
    hasTransform() { return !(Math.abs(this.rot) < 1e-9 && this.sx === 1 && this.sy === 1); }
    /** top-left of the layer bitmap in doc space (only meaningful when pixel aligned) */
    offset() { return [Math.round(this.cx - this.w / 2), Math.round(this.cy - this.h / 2)]; }
    setImage(canvas) {
      this.img = canvas;
      if (this.mask && (this.mask.width !== canvas.width || this.mask.height !== canvas.height)) {
        // keep mask in sync with the new bitmap size (nearest fit)
        this.mask = PE.scaleCanvas(this.mask, canvas.width, canvas.height);
      }
      this.w = canvas.width; this.h = canvas.height;
      this.invalidate();
    }
    invalidate() { this._eff = null; this.thumbDirty = true; }
    /** layer bitmap with mask applied (cached). Returns the raw bitmap when there is no active mask. */
    effective() {
      if (!this.mask || !this.maskEnabled) return this.img;
      if (this._eff) return this._eff;
      const c = PE.copyCanvas(this.img);
      const ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.mask, 0, 0);
      this._eff = c;
      return c;
    }
    /** point in doc space -> layer bitmap space */
    toLocal(x, y) { return PE.matApply(this.inverse, x, y); }
    /** does this layer have an opaque pixel at doc point (x,y)? */
    hitTest(x, y, alphaThreshold) {
      const [lx, ly] = this.toLocal(x, y);
      if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return false;
      if (alphaThreshold === undefined) return true;
      const px = this.effective().getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
      return px[3] > alphaThreshold;
    }
    clone() {
      const L = new Layer({
        img: PE.copyCanvas(this.img), name: this.name, type: this.type, cx: this.cx, cy: this.cy, sx: this.sx, sy: this.sy, rot: this.rot,
        opacity: this.opacity, blend: this.blend, visible: this.visible, locked: false,
        mask: this.mask ? PE.copyCanvas(this.mask) : null, maskEnabled: this.maskEnabled,
        text: this.text ? { ...this.text } : null,
      });
      return L;
    }
    /** Render this layer (with transform and mask, without opacity/blend) into a doc-sized canvas. */
    renderToDoc(docW, docH, useMask = true) {
      const c = PE.createCanvas(docW, docH);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(...this.matrix);
      ctx.drawImage(useMask ? this.effective() : this.img, 0, 0);
      return c;
    }
    /** Render the mask (as white+alpha) into a doc-sized canvas. */
    renderMaskToDoc(docW, docH) {
      const c = PE.createCanvas(docW, docH);
      if (!this.mask) return c;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(...this.matrix);
      ctx.drawImage(this.mask, 0, 0);
      return c;
    }
    /** Convert mask (white+alpha) to an opaque grayscale canvas (for PSD/export). */
    maskAsGray() {
      if (!this.mask) return null;
      const id = PE.getImageData(this.mask), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const v = d[i + 3]; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
      return PE.canvasFromImageData(id);
    }
  }
  PE.Layer = Layer;

  /** Build a mask canvas (white + alpha) from a grayscale canvas (uses red channel). */
  PE.maskFromGray = function (gray) {
    const id = PE.getImageData(gray), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = d[i]; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = v; }
    return PE.canvasFromImageData(id);
  };
  /** Solid mask canvas: value 1 = reveal all, 0 = hide all */
  PE.solidMask = function (w, h, value) {
    const c = PE.createCanvas(w, h);
    if (value > 0) { const ctx = c.getContext('2d'); ctx.fillStyle = `rgba(255,255,255,${value})`; ctx.fillRect(0, 0, c.width, c.height); }
    return c;
  };

  /* ------------------------------------------------------------------ */
  class Doc {
    constructor(w, h, name) {
      this.width = Math.max(1, Math.round(w));
      this.height = Math.max(1, Math.round(h));
      this.name = name || 'Untitled';
      this.layers = [];         // bottom -> top
      this.activeIndex = -1;
      this.selection = null;    // PE.Selection | null
      this.paintTarget = 'img'; // 'img' | 'mask'
      this.composite = PE.createCanvas(this.width, this.height);
      this.compositeDirty = true;
    }
    get active() { return this.layers[this.activeIndex] || null; }
    indexOf(layer) { return this.layers.indexOf(layer); }
    setActive(layer) {
      const i = typeof layer === 'number' ? layer : this.indexOf(layer);
      if (i === this.activeIndex) return;
      this.activeIndex = i;
      this.paintTarget = 'img';
      PE.events.emit('activechange', this.active);
      PE.events.emit('docchange');
    }
    addLayer(layer, index) {
      if (index === undefined || index === null) index = this.activeIndex + 1;
      index = PE.clamp(index, 0, this.layers.length);
      this.layers.splice(index, 0, layer);
      this.activeIndex = index;
      this.paintTarget = 'img';
      this.markDirty(layer);
      PE.events.emit('activechange', layer);
      PE.events.emit('docchange');
      return layer;
    }
    removeLayer(layer) {
      const i = this.indexOf(layer);
      if (i < 0) return -1;
      this.layers.splice(i, 1);
      if (this.activeIndex >= this.layers.length) this.activeIndex = this.layers.length - 1;
      else if (this.activeIndex > i) this.activeIndex--;
      this.paintTarget = 'img';
      this.markDirty();
      PE.events.emit('activechange', this.active);
      PE.events.emit('docchange');
      return i;
    }
    moveLayer(layer, newIndex) {
      const i = this.indexOf(layer);
      if (i < 0) return;
      newIndex = PE.clamp(newIndex, 0, this.layers.length - 1);
      if (newIndex === i) return;
      this.layers.splice(i, 1);
      this.layers.splice(newIndex, 0, layer);
      this.activeIndex = this.indexOf(this.active) >= 0 ? this.indexOf(this.active) : newIndex;
      this.markDirty();
      PE.events.emit('docchange');
    }
    markDirty(layer) {
      this.compositeDirty = true;
      if (layer) { layer.invalidate(); PE.events.emit('layerchange', layer); }
      PE.requestRender && PE.requestRender();
    }
    setSelection(sel) {
      this.selection = sel && !sel.isEmpty() ? sel : null;
      PE.events.emit('selectionchange', this.selection);
      PE.requestRender && PE.requestRender();
    }
    /** Composite all visible layers into this.composite. `preview` = in-progress stroke {layer, render(layer)->canvas}. */
    render(preview) {
      const ctx = this.composite.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      for (const L of this.layers) {
        if (!L.visible) continue;
        ctx.globalAlpha = L.opacity;
        ctx.globalCompositeOperation = PE.blendToOp(L.blend);
        if (preview && preview.layer === L) {
          const src = preview.render(L);
          if (!src) continue;
          // docSpace previews (e.g. perspective warp) are already rendered in document coordinates
          if (preview.docSpace) ctx.setTransform(1, 0, 0, 1, 0, 0); else ctx.setTransform(...L.matrix);
          ctx.drawImage(src, 0, 0);
          continue;
        }
        ctx.setTransform(...L.matrix);
        ctx.drawImage(L.effective(), 0, 0);
      }
      ctx.restore();
      this.compositeDirty = false;
      return this.composite;
    }
    /** Flattened image (fresh canvas) */
    flatten() {
      if (this.compositeDirty) this.render(null);
      return PE.copyCanvas(this.composite);
    }
    /** Bounds (doc space) of all layers (visible only if onlyVisible). */
    layersBounds(onlyVisible) {
      let b = null;
      for (const L of this.layers) { if (onlyVisible && !L.visible) continue; b = PE.rectUnion(b, L.bounds()); }
      return b;
    }
    /** Change the canvas size; (dx,dy) = translation applied to all layers (new origin offset). */
    resizeCanvas(newW, newH, dx, dy) {
      this.width = Math.max(1, Math.round(newW)); this.height = Math.max(1, Math.round(newH));
      for (const L of this.layers) { L.cx += dx; L.cy += dy; }
      this.composite = PE.createCanvas(this.width, this.height);
      this.selection = null;
      this.markDirty();
      PE.events.emit('selectionchange', null);
      PE.events.emit('docchange');
      PE.events.emit('sizechange');
    }
  }
  PE.Doc = Doc;
})();
