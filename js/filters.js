/* PhotoEditor - filters.js : adjustments and filters (operate on ImageData / canvas) */
(function () {
  'use strict';
  const PE = window.PE;
  const F = (PE.filters = {});

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  /* ---------- per-pixel adjustments: (ImageData, params) -> ImageData (new) ---------- */
  F.brightnessContrast = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const b = (p.brightness || 0) * 1.5; // -150..150 -> -225..225
    const c = PE.clamp(p.contrast || 0, -100, 100);
    const f = c >= 0 ? 1 + c / 100 * 2 : 1 + c / 100; // up to 3x, down to 0x
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = clamp255((i + b - 128) * f + 128);
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return out;
  };
  F.levels = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const inB = PE.clamp(p.inBlack || 0, 0, 254), inW = PE.clamp(p.inWhite === undefined ? 255 : p.inWhite, inB + 1, 255);
    const gamma = PE.clamp(p.gamma || 1, 0.1, 10);
    const outB = PE.clamp(p.outBlack || 0, 0, 255), outW = PE.clamp(p.outWhite === undefined ? 255 : p.outWhite, 0, 255);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = PE.clamp((i - inB) / (inW - inB), 0, 1);
      v = Math.pow(v, 1 / gamma);
      lut[i] = clamp255(outB + v * (outW - outB));
    }
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return out;
  };
  F.exposure = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const ev = p.exposure || 0, off = (p.offset || 0) * 255, gamma = PE.clamp(p.gamma || 1, 0.1, 10);
    const mult = Math.pow(2, ev);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = clamp255(Math.pow(PE.clamp((i * mult + off) / 255, 0, 1), 1 / gamma) * 255);
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return out;
  };
  F.hueSaturation = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const dh = (p.hue || 0) / 360, ds = (p.saturation || 0) / 100, dl = (p.lightness || 0) / 100;
    if (!dh && !ds && !dl) return out;
    for (let i = 0; i < d.length; i += 4) {
      let [h, s, l] = PE.rgbToHsl(d[i], d[i + 1], d[i + 2]);
      h += dh;
      s = PE.clamp(ds >= 0 ? s + (1 - s) * ds : s * (1 + ds), 0, 1);
      l = dl >= 0 ? l + (1 - l) * dl : l * (1 + dl);
      const rgb = PE.hslToRgb(h, s, l);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    return out;
  };
  F.colorBalance = function (src, p) {
    // temperature: warm(+) / cool(-), tint: magenta(+) / green(-)
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const t = (p.temperature || 0) / 100, g = (p.tint || 0) / 100;
    const rS = 1 + t * 0.3, bS = 1 - t * 0.3, gS = 1 - g * 0.3;
    const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { lr[i] = clamp255(i * rS); lg[i] = clamp255(i * gS); lb[i] = clamp255(i * bS); }
    for (let i = 0; i < d.length; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; }
    return out;
  };
  F.vibrance = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const v = (p.vibrance || 0) / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b), avg = (r + g + b) / 3;
      const amt = ((Math.abs(max - avg) * 2) / 255) * v;
      if (max !== r) d[i] = clamp255(r + (max - r) * amt);
      if (max !== g) d[i + 1] = clamp255(g + (max - g) * amt);
      if (max !== b) d[i + 2] = clamp255(b + (max - b) * amt);
    }
    return out;
  };
  F.invert = function (src) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    return out;
  };
  F.desaturate = function (src) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    for (let i = 0; i < d.length; i += 4) { const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = v; }
    return out;
  };
  F.sepia = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const a = PE.clamp((p && p.amount !== undefined ? p.amount : 100) / 100, 0, 1);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
      d[i] = clamp255(r + (sr - r) * a); d[i + 1] = clamp255(g + (sg - g) * a); d[i + 2] = clamp255(b + (sb - b) * a);
    }
    return out;
  };
  F.threshold = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const t = p.level === undefined ? 128 : p.level;
    for (let i = 0; i < d.length; i += 4) { const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] >= t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
    return out;
  };
  F.posterize = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const n = PE.clamp(Math.round(p.levels || 4), 2, 255);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.floor(i / 256 * n) * (255 / (n - 1)));
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return out;
  };
  F.autoContrast = function (src) {
    const d = src.data;
    let lo = 255, hi = 0;
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; hist[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++; n++; }
    if (!n) return new ImageData(new Uint8ClampedArray(d), src.width, src.height);
    const cut = n * 0.005; let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
    if (hi <= lo) return new ImageData(new Uint8ClampedArray(d), src.width, src.height);
    return F.levels(src, { inBlack: lo, inWhite: hi, gamma: 1 });
  };
  F.noise = function (src, p) {
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const amt = (p.amount || 10) * 2.55, mono = !!p.monochrome;
    for (let i = 0; i < d.length; i += 4) {
      if (mono) { const n = (Math.random() - 0.5) * 2 * amt; d[i] = clamp255(d[i] + n); d[i + 1] = clamp255(d[i + 1] + n); d[i + 2] = clamp255(d[i + 2] + n); }
      else { d[i] = clamp255(d[i] + (Math.random() - 0.5) * 2 * amt); d[i + 1] = clamp255(d[i + 1] + (Math.random() - 0.5) * 2 * amt); d[i + 2] = clamp255(d[i + 2] + (Math.random() - 0.5) * 2 * amt); }
    }
    return out;
  };
  /** Reinhard-style color transfer: match per-channel mean/std of src to `ref` (ImageData) */
  F.matchColor = function (src, p) {
    const ref = p.ref; if (!ref) return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    const stats = (id) => {
      const d = id.data, sum = [0, 0, 0], sq = [0, 0, 0]; let n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; n++; for (let c = 0; c < 3; c++) { sum[c] += d[i + c]; sq[c] += d[i + c] * d[i + c]; } }
      if (!n) return null;
      const mean = sum.map((s) => s / n), std = sq.map((s, c) => Math.sqrt(Math.max(1, s / n - mean[c] * mean[c])));
      return { mean, std };
    };
    const a = stats(src), b = stats(ref);
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    if (!a || !b) return out;
    const amt = PE.clamp((p.amount === undefined ? 100 : p.amount) / 100, 0, 1);
    const luminanceOnly = !!p.luminanceOnly;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c];
        let nv;
        if (luminanceOnly) { const ma = (a.mean[0] + a.mean[1] + a.mean[2]) / 3, mb = (b.mean[0] + b.mean[1] + b.mean[2]) / 3, sa = (a.std[0] + a.std[1] + a.std[2]) / 3, sb = (b.std[0] + b.std[1] + b.std[2]) / 3; nv = (v - ma) * (sb / sa) + mb; }
        else nv = (v - a.mean[c]) * (b.std[c] / a.std[c]) + b.mean[c];
        d[i + c] = clamp255(v + (nv - v) * amt);
      }
    }
    return out;
  };

  /* ---------- canvas based filters: (canvas, params) -> canvas ---------- */
  const supportsFilter = (() => { try { const c = PE.createCanvas(1, 1).getContext('2d'); return 'filter' in c; } catch (e) { return false; } })();
  /** separable box blur ×3 fallback (approximates gaussian) */
  function boxBlurImageData(src, radius) {
    const w = src.width, h = src.height;
    let a = new Float32Array(src.data), b = new Float32Array(a.length);
    const r = Math.max(1, Math.round(radius));
    const pass = (inp, out, horizontal) => {
      const len = horizontal ? w : h, lines = horizontal ? h : w;
      for (let l = 0; l < lines; l++) {
        for (let c = 0; c < 4; c++) {
          let acc = 0, count = 0;
          const idx = (i) => (horizontal ? (l * w + i) * 4 + c : (i * w + l) * 4 + c);
          for (let i = -r; i <= r; i++) { const j = PE.clamp(i, 0, len - 1); acc += inp[idx(j)]; count++; }
          for (let i = 0; i < len; i++) {
            out[idx(i)] = acc / count;
            const add = PE.clamp(i + r + 1, 0, len - 1), rem = PE.clamp(i - r, 0, len - 1);
            acc += inp[idx(add)] - inp[idx(rem)];
          }
        }
      }
    };
    for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
    return new ImageData(new Uint8ClampedArray(a.map((v) => clamp255(v))), w, h);
  }
  /** Premultiplied-correct gaussian blur of a canvas (alpha handled by the browser filter). */
  F.gaussianBlurCanvas = function (canvas, radius) {
    radius = Math.max(0, radius || 0);
    if (radius === 0) return PE.copyCanvas(canvas);
    if (supportsFilter) {
      // pad edges by drawing the image with edge-clamped border to avoid dark/transparent halos at the boundary
      const pad = Math.ceil(radius * 3);
      const w = canvas.width, h = canvas.height;
      const big = PE.createCanvas(w + pad * 2, h + pad * 2);
      const bctx = big.getContext('2d');
      bctx.imageSmoothingEnabled = false;
      // center
      bctx.drawImage(canvas, pad, pad);
      // edges (stretch 1px borders)
      bctx.drawImage(canvas, 0, 0, w, 1, pad, 0, w, pad);                 // top
      bctx.drawImage(canvas, 0, h - 1, w, 1, pad, h + pad, w, pad);       // bottom
      bctx.drawImage(canvas, 0, 0, 1, h, 0, pad, pad, h);                 // left
      bctx.drawImage(canvas, w - 1, 0, 1, h, w + pad, pad, pad, h);       // right
      bctx.drawImage(canvas, 0, 0, 1, 1, 0, 0, pad, pad);
      bctx.drawImage(canvas, w - 1, 0, 1, 1, w + pad, 0, pad, pad);
      bctx.drawImage(canvas, 0, h - 1, 1, 1, 0, h + pad, pad, pad);
      bctx.drawImage(canvas, w - 1, h - 1, 1, 1, w + pad, h + pad, pad, pad);
      const out = PE.createCanvas(w, h);
      const octx = out.getContext('2d');
      octx.filter = `blur(${radius}px)`;
      octx.drawImage(big, -pad, -pad);
      octx.filter = 'none';
      return out;
    }
    return PE.canvasFromImageData(boxBlurImageData(PE.getImageData(canvas), radius));
  };
  F.sharpenCanvas = function (canvas, p) {
    const amount = (p.amount === undefined ? 100 : p.amount) / 100, radius = p.radius || 1;
    const blurred = PE.getImageData(F.gaussianBlurCanvas(canvas, radius));
    const src = PE.getImageData(canvas);
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    const d = out.data, b = blurred.data, s = src.data;
    const thr = p.threshold || 0;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = s[i + c] - b[i + c];
        if (Math.abs(diff) > thr) d[i + c] = clamp255(s[i + c] + diff * amount);
      }
    }
    return PE.canvasFromImageData(out);
  };
  F.pixelateCanvas = function (canvas, p) {
    const size = Math.max(2, Math.round(p.size || 8));
    const w = canvas.width, h = canvas.height;
    const small = PE.createCanvas(Math.max(1, Math.ceil(w / size)), Math.max(1, Math.ceil(h / size)));
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    const out = PE.createCanvas(w, h);
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(small, 0, 0, small.width, small.height, 0, 0, small.width * size, small.height * size);
    return out;
  };

  /* ---------- catalog used by the UI ---------- */
  F.catalog = {
    brightnessContrast: { title: 'Brightness / Contrast', params: [{ key: 'brightness', label: 'Brightness', min: -150, max: 150, step: 1, value: 0 }, { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, value: 0 }], fn: F.brightnessContrast },
    levels: { title: 'Levels', params: [{ key: 'inBlack', label: 'Input black', min: 0, max: 254, step: 1, value: 0 }, { key: 'gamma', label: 'Gamma', min: 0.1, max: 5, step: 0.01, value: 1 }, { key: 'inWhite', label: 'Input white', min: 1, max: 255, step: 1, value: 255 }, { key: 'outBlack', label: 'Output black', min: 0, max: 255, step: 1, value: 0 }, { key: 'outWhite', label: 'Output white', min: 0, max: 255, step: 1, value: 255 }], fn: F.levels },
    exposure: { title: 'Exposure', params: [{ key: 'exposure', label: 'Exposure (EV)', min: -5, max: 5, step: 0.01, value: 0 }, { key: 'offset', label: 'Offset', min: -0.5, max: 0.5, step: 0.001, value: 0 }, { key: 'gamma', label: 'Gamma', min: 0.1, max: 5, step: 0.01, value: 1 }], fn: F.exposure },
    hueSaturation: { title: 'Hue / Saturation', params: [{ key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, value: 0 }, { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, value: 0 }, { key: 'lightness', label: 'Lightness', min: -100, max: 100, step: 1, value: 0 }], fn: F.hueSaturation },
    colorBalance: { title: 'Color Temperature / Tint', params: [{ key: 'temperature', label: 'Temperature (cool ↔ warm)', min: -100, max: 100, step: 1, value: 0 }, { key: 'tint', label: 'Tint (green ↔ magenta)', min: -100, max: 100, step: 1, value: 0 }], fn: F.colorBalance },
    vibrance: { title: 'Vibrance', params: [{ key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1, value: 0 }], fn: F.vibrance },
    sepia: { title: 'Sepia', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, value: 100 }], fn: F.sepia },
    threshold: { title: 'Threshold', params: [{ key: 'level', label: 'Level', min: 1, max: 255, step: 1, value: 128 }], fn: F.threshold },
    posterize: { title: 'Posterize', params: [{ key: 'levels', label: 'Levels', min: 2, max: 32, step: 1, value: 4 }], fn: F.posterize },
    noise: { title: 'Add Noise', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, value: 10 }, { key: 'monochrome', label: 'Monochrome', type: 'checkbox', value: false }], fn: F.noise },
    gaussianBlur: { title: 'Gaussian Blur', params: [{ key: 'radius', label: 'Radius (px)', min: 0, max: 100, step: 0.1, value: 3 }], canvasFn: (c, p) => F.gaussianBlurCanvas(c, p.radius) },
    sharpen: { title: 'Unsharp Mask', params: [{ key: 'amount', label: 'Amount (%)', min: 0, max: 500, step: 1, value: 100 }, { key: 'radius', label: 'Radius (px)', min: 0.1, max: 50, step: 0.1, value: 1 }, { key: 'threshold', label: 'Threshold', min: 0, max: 255, step: 1, value: 0 }], canvasFn: F.sharpenCanvas },
    pixelate: { title: 'Pixelate', params: [{ key: 'size', label: 'Cell size (px)', min: 2, max: 200, step: 1, value: 8 }], canvasFn: F.pixelateCanvas },
  };
})();
