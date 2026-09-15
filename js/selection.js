/* PhotoEditor - selection.js : pixel selections (doc-sized 8-bit mask) */
(function () {
  'use strict';
  const PE = window.PE;

  class Selection {
    constructor(w, h, data) {
      this.w = w; this.h = h;
      this.data = data || new Uint8ClampedArray(w * h); // 0..255 selected amount
      this._canvas = null; this._path = null; this._bounds = undefined;
    }
    invalidate() { this._canvas = null; this._path = null; this._bounds = undefined; }
    static fromCanvasAlpha(canvas) {
      const id = PE.getImageData(canvas), d = id.data;
      const s = new Selection(canvas.width, canvas.height);
      const out = s.data;
      for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = d[j];
      return s;
    }
    /** Draw a shape with `drawFn(ctx)` (fill it) into a doc-sized canvas and take its alpha (anti-aliased). */
    static fromShape(w, h, drawFn) {
      const c = PE.createCanvas(w, h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      drawFn(ctx);
      return Selection.fromCanvasAlpha(c);
    }
    static rect(w, h, r) {
      return Selection.fromShape(w, h, (ctx) => ctx.fillRect(r.x, r.y, r.w, r.h));
    }
    static all(w, h) { const s = new Selection(w, h); s.data.fill(255); return s; }
    isEmpty() { return this.bounds() === null; }
    bounds() {
      if (this._bounds !== undefined) return this._bounds;
      const w = this.w, h = this.h, d = this.data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) if (d[row + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      this._bounds = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      return this._bounds;
    }
    /** doc-sized canvas, white with alpha = selection amount */
    canvas() {
      if (this._canvas) return this._canvas;
      const id = new ImageData(this.w, this.h), d = id.data, s = this.data;
      for (let i = 0, j = 0; i < s.length; i++, j += 4) { if (s[i]) { d[j] = 255; d[j + 1] = 255; d[j + 2] = 255; d[j + 3] = s[i]; } }
      this._canvas = PE.canvasFromImageData(id);
      return this._canvas;
    }
    /** Marching-ants outline as a Path2D in doc coordinates (threshold 50%). */
    path() {
      if (this._path) return this._path;
      const w = this.w, h = this.h, d = this.data, W = w + 1;
      const segs = new Map();
      const add = (s, e) => { let a = segs.get(s); if (!a) { a = []; segs.set(s, a); } a.push(e); };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (d[i] < 128) continue;
          if (y === 0 || d[i - w] < 128) add(y * W + x, y * W + x + 1);                 // top edge ->
          if (x === w - 1 || d[i + 1] < 128) add(y * W + x + 1, (y + 1) * W + x + 1);   // right edge v
          if (y === h - 1 || d[i + w] < 128) add((y + 1) * W + x + 1, (y + 1) * W + x); // bottom edge <-
          if (x === 0 || d[i - 1] < 128) add((y + 1) * W + x, y * W + x);               // left edge ^
        }
      }
      const path = new Path2D();
      for (const [start, ends] of segs) {
        while (ends.length) {
          let cur = start, next = ends.pop();
          path.moveTo(cur % W, Math.floor(cur / W));
          let dir = next - cur; // direction code (+1, -1, +W, -W)
          let guard = 0;
          while (next !== start && guard++ < 50000000) {
            const arr = segs.get(next);
            if (!arr || !arr.length) break;
            // prefer continuing straight to keep vertex count low
            let k = 0;
            for (let j = 0; j < arr.length; j++) if (arr[j] - next === dir) { k = j; break; }
            const n2 = arr[k]; arr[k] = arr[arr.length - 1]; arr.pop();
            const ndir = n2 - next;
            if (ndir !== dir) { path.lineTo(next % W, Math.floor(next / W)); dir = ndir; }
            cur = next; next = n2;
          }
          path.closePath();
        }
      }
      this._path = path;
      return path;
    }
    /* ---------- boolean ops (return new selections) ---------- */
    combine(other, mode) {
      if (!other) return this;
      if (mode === 'new' || !mode) return other;
      const out = new Selection(this.w, this.h);
      const a = this.data, b = other.data, o = out.data;
      const n = o.length;
      if (mode === 'add') for (let i = 0; i < n; i++) o[i] = a[i] > b[i] ? a[i] : b[i];
      else if (mode === 'subtract') for (let i = 0; i < n; i++) o[i] = (a[i] * (255 - b[i])) / 255;
      else if (mode === 'intersect') for (let i = 0; i < n; i++) o[i] = a[i] < b[i] ? a[i] : b[i];
      else return other;
      return out;
    }
    invert() {
      const out = new Selection(this.w, this.h);
      const a = this.data, o = out.data;
      for (let i = 0; i < o.length; i++) o[i] = 255 - a[i];
      return out;
    }
    /** Gaussian feather (radius in px) */
    feather(radius) {
      if (!(radius > 0)) return this;
      const src = this.canvas();
      const c = PE.createCanvas(this.w, this.h);
      const ctx = c.getContext('2d');
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(src, 0, 0);
      ctx.filter = 'none';
      return Selection.fromCanvasAlpha(c);
    }
    /** Exact euclidean distance transform helper: returns Float32Array of squared distances to nearest "seed" pixel */
    static _edt(seed, w, h) {
      const INF = 1e20;
      const f = new Float32Array(Math.max(w, h));
      const dsq = new Float32Array(w * h);
      const v = new Int32Array(Math.max(w, h)), z = new Float32Array(Math.max(w, h) + 1), dd = new Float32Array(Math.max(w, h));
      const dt1d = (n) => {
        let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
        for (let q = 1; q < n; q++) {
          let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
          while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
          k++; v[k] = q; z[k] = s; z[k + 1] = INF;
        }
        k = 0;
        for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; dd[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
      };
      // columns
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) f[y] = seed[y * w + x] ? 0 : INF;
        dt1d(h);
        for (let y = 0; y < h; y++) dsq[y * w + x] = dd[y];
      }
      // rows
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) f[x] = dsq[y * w + x];
        dt1d(w);
        for (let x = 0; x < w; x++) dsq[y * w + x] = dd[x];
      }
      return dsq;
    }
    expand(px) {
      if (!(px > 0)) return this;
      const w = this.w, h = this.h, a = this.data;
      const seed = new Uint8Array(w * h); for (let i = 0; i < seed.length; i++) seed[i] = a[i] >= 128 ? 1 : 0;
      const dsq = Selection._edt(seed, w, h), r2 = px * px;
      const out = new Selection(w, h), o = out.data;
      for (let i = 0; i < o.length; i++) o[i] = dsq[i] <= r2 ? 255 : 0;
      return out;
    }
    contract(px) {
      if (!(px > 0)) return this;
      const w = this.w, h = this.h, a = this.data;
      const seed = new Uint8Array(w * h); for (let i = 0; i < seed.length; i++) seed[i] = a[i] < 128 ? 1 : 0;
      const dsq = Selection._edt(seed, w, h), r2 = px * px;
      const out = new Selection(w, h), o = out.data;
      for (let i = 0; i < o.length; i++) o[i] = a[i] >= 128 && dsq[i] > r2 ? 255 : 0;
      return out;
    }
    /** Selection as an ImageData-like alpha array resampled into a layer's bitmap space (Uint8ClampedArray of layer.w*layer.h). */
    toLayerSpace(layer) {
      if (layer.isPixelAligned() && layer.w === this.w && layer.h === this.h && layer.cx === this.w / 2 && layer.cy === this.h / 2) return this.data;
      const c = PE.createCanvas(layer.w, layer.h);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(...layer.inverse);
      ctx.drawImage(this.canvas(), 0, 0);
      const d = PE.getImageData(c).data;
      const out = new Uint8ClampedArray(layer.w * layer.h);
      for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = d[j];
      return out;
    }
    /** Selection canvas resampled into a layer's bitmap space (white+alpha). */
    toLayerCanvas(layer) {
      const c = PE.createCanvas(layer.w, layer.h);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(...layer.inverse);
      ctx.drawImage(this.canvas(), 0, 0);
      return c;
    }
  }
  PE.Selection = Selection;

  /* ---------- flood fill (magic wand / bucket) ---------- */
  /**
   * @param {ImageData} id  source pixels (doc space)
   * @param {number} sx,sy  seed
   * @param {number} tol    0..255 tolerance (max channel difference, alpha included)
   * @param {boolean} contiguous
   * @returns {Uint8ClampedArray} mask (255 selected)
   */
  PE.floodSelect = function (id, sx, sy, tol, contiguous) {
    const w = id.width, h = id.height, d = id.data;
    const out = new Uint8ClampedArray(w * h);
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
    const si = (sy * w + sx) * 4;
    const r0 = d[si], g0 = d[si + 1], b0 = d[si + 2], a0 = d[si + 3];
    const match = (i) => {
      const j = i * 4;
      const da = Math.abs(d[j + 3] - a0);
      if (a0 === 0 && d[j + 3] === 0) return true; // fully transparent matches transparent regardless of color
      return Math.abs(d[j] - r0) <= tol && Math.abs(d[j + 1] - g0) <= tol && Math.abs(d[j + 2] - b0) <= tol && da <= tol;
    };
    if (!contiguous) {
      for (let i = 0; i < w * h; i++) if (match(i)) out[i] = 255;
      return out;
    }
    // scanline flood fill: each popped pixel expands to its full horizontal run, then seeds the rows above/below
    const stack = [sy * w + sx];
    while (stack.length) {
      const p = stack.pop();
      if (out[p] || !match(p)) continue;
      const y = Math.floor(p / w), x = p - y * w;
      let x1 = x, x2 = x;
      while (x1 > 0 && !out[y * w + x1 - 1] && match(y * w + x1 - 1)) x1--;
      while (x2 < w - 1 && !out[y * w + x2 + 1] && match(y * w + x2 + 1)) x2++;
      for (let xx = x1; xx <= x2; xx++) out[y * w + xx] = 255;
      for (let k = -1; k <= 1; k += 2) {
        const ny = y + k;
        if (ny < 0 || ny >= h) continue;
        let inRun = false;
        for (let xx = x1; xx <= x2; xx++) {
          const q = ny * w + xx;
          if (!out[q] && match(q)) { if (!inRun) { stack.push(q); inRun = true; } }
          else inRun = false;
        }
      }
    }
    return out;
  };
})();
