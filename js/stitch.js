/* PhotoEditor - stitch.js : arranging / blending / aligning layers for panoramas and composites */
(function () {
  'use strict';
  const PE = window.PE;
  const S = (PE.stitch = {});

  /** Build a layer-space mask that ramps from 0 to 1 along a doc-space segment (x0,y0)->(x1,y1). */
  function rampMask(L, x0, y0, x1, y1) {
    const c = PE.createCanvas(L.w, L.h);
    const ctx = c.getContext('2d');
    ctx.setTransform(...L.inverse);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    const b = L.bounds();
    ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    return c;
  }

  /**
   * Arrange layers side by side (in their current stacking order, bottom first) with an overlap, blend the seams
   * with gradient masks and grow the canvas to fit.
   * o = { layers:[Layer], direction:'h'|'v', overlap:px, blend:px, align:'start'|'center'|'end' }
   */
  S.arrange = function (o) {
    const d = PE.doc; if (!d) return;
    const layers = (o.layers || d.layers.filter((L) => L.visible)).filter((L) => !L.locked);
    if (layers.length < 2) { PE.toast('Select at least two unlocked, visible layers to stitch', { type: 'warn' }); return; }
    const horiz = o.direction !== 'v';
    const overlap = Math.max(0, o.overlap || 0), blend = Math.max(0, Math.min(o.blend || 0, overlap || o.blend || 0));
    PE.actions.transact('Stitch Layers', () => {
      let cursor = 0, maxCross = 0;
      const sizes = layers.map((L) => L.bounds());
      for (const b of sizes) maxCross = Math.max(maxCross, horiz ? b.h : b.w);
      layers.forEach((L, i) => {
        const b = sizes[i];
        // position along the stitch axis
        const start = i === 0 ? 0 : cursor - overlap;
        let cross = 0;
        if (o.align === 'center') cross = (maxCross - (horiz ? b.h : b.w)) / 2;
        else if (o.align === 'end') cross = maxCross - (horiz ? b.h : b.w);
        if (horiz) { L.cx += start - b.x; L.cy += cross - b.y; } else { L.cy += start - b.y; L.cx += cross - b.x; }
        cursor = start + (horiz ? b.w : b.h);
        L.invalidate();
        if (i > 0 && blend > 0) {
          L.mask = horiz ? rampMask(L, start, 0, start + blend, 0) : rampMask(L, 0, start, 0, start + blend);
          L.maskEnabled = true;
        }
      });
      const W = horiz ? Math.ceil(cursor) : Math.ceil(maxCross), H = horiz ? Math.ceil(maxCross) : Math.ceil(cursor);
      d.resizeCanvas(W, H, 0, 0);
    });
    PE.view.fit();
    PE.toast('Layers arranged. Use the Move tool / arrow keys to fine-tune, then paint on the masks to refine the seam.');
  };

  /** Blend the seam between the active layer and the layer below with a ramp mask on the active layer. */
  S.blendActiveEdge = function (side, width) {
    const d = PE.doc; if (!d) return;
    const L = d.active; if (!L || L.locked) { PE.toast('Select an unlocked layer'); return; }
    const b = L.bounds(); width = Math.max(1, width || 100);
    PE.actions.transact('Blend Edge', () => {
      let m;
      if (side === 'left') m = rampMask(L, b.x, 0, b.x + width, 0);
      else if (side === 'right') m = rampMask(L, b.x + b.w, 0, b.x + b.w - width, 0);
      else if (side === 'top') m = rampMask(L, 0, b.y, 0, b.y + width);
      else m = rampMask(L, 0, b.y + b.h, 0, b.y + b.h - width);
      if (L.mask) { const ctx = m.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(L.mask, 0, 0); }
      L.mask = m; L.maskEnabled = true; L.invalidate();
    });
  };

  /* ---------- automatic translation alignment (normalized cross correlation, coarse to fine) ---------- */
  function grayLevel(canvas, size) {
    const k = Math.min(1, size / Math.max(canvas.width, canvas.height));
    const w = Math.max(2, Math.round(canvas.width * k)), h = Math.max(2, Math.round(canvas.height * k));
    const small = PE.downscale(canvas, w, h);
    const d = PE.getImageData(small).data;
    const g = new Float32Array(w * h), a = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) { g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; a[i] = d[j + 3] > 32 ? 1 : 0; }
    // high-pass: subtract local mean (box 7x7) to be robust to exposure differences
    const r = 3, hp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) { if (a[yy * w + xx]) { s += g[yy * w + xx]; n++; } }
      hp[y * w + x] = n ? g[y * w + x] - s / n : 0;
    }
    return { g: hp, a, w, h, k };
  }
  /** NCC score of B shifted by (dx,dy) against A (same size grids) */
  function ncc(A, B, dx, dy) {
    const w = A.w, h = A.h;
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    const y0 = Math.max(0, dy), y1 = Math.min(h, h + dy), x0 = Math.max(0, dx), x1 = Math.min(w, w + dx);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ia = y * w + x, ib = (y - dy) * w + (x - dx);
        if (!A.a[ia] || !B.a[ib]) continue;
        const va = A.g[ia], vb = B.g[ib];
        n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
      }
    }
    if (n < 64) return -2;
    const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    if (va <= 1e-6 || vb <= 1e-6) return -2;
    return cov / Math.sqrt(va * vb);
  }
  /**
   * Estimate the translation that best aligns the active layer onto the layer below (or `ref`).
   * Returns {dx,dy,score} in doc pixels (how far to move the active layer) or null.
   */
  S.estimateAlignment = function (L, ref, maxShiftFrac) {
    const d = PE.doc;
    const A = ref.renderToDoc(d.width, d.height), B = L.renderToDoc(d.width, d.height);
    const levels = [64, 128, 256, 512].filter((s, i, arr) => i === 0 || s <= Math.max(d.width, d.height) * 1.0);
    let best = null;
    for (let li = 0; li < levels.length; li++) {
      const ga = grayLevel(A, levels[li]), gb = grayLevel(B, levels[li]);
      let cands = [];
      if (li === 0) {
        const range = Math.round(Math.max(ga.w, ga.h) * (maxShiftFrac || 0.5));
        for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) cands.push([dx, dy]);
      } else {
        const f = ga.w / best.w, bx = Math.round(best.dx * f), by = Math.round(best.dy * f);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) cands.push([bx + dx, by + dy]);
      }
      let lb = null;
      for (const [dx, dy] of cands) { const s = ncc(ga, gb, dx, dy); if (!lb || s > lb.score) lb = { dx, dy, score: s }; }
      if (!lb || lb.score <= -2) return null;
      best = { dx: lb.dx, dy: lb.dy, score: lb.score, w: ga.w, k: ga.k };
    }
    return { dx: best.dx / best.k, dy: best.dy / best.k, score: best.score };
  };
  S.autoAlignActive = function () {
    const d = PE.doc; if (!d) return;
    const L = d.active; if (!L || L.locked) { PE.toast('Select an unlocked layer'); return; }
    const i = d.indexOf(L); if (i === 0) { PE.toast('No layer below to align with'); return; }
    const ref = d.layers[i - 1];
    PE.ui && PE.ui.busy(true, 'Aligning…');
    setTimeout(() => {
      try {
        const r = S.estimateAlignment(L, ref, 0.5);
        if (!r || r.score < 0.15) { PE.toast('Could not find a confident alignment (score too low). Try positioning roughly by hand first.', { type: 'warn' }); return; }
        const commit = PE.history.propChange('Auto Align', L, ['cx', 'cy'], () => d.markDirty(L));
        L.cx += r.dx; L.cy += r.dy; commit(); d.markDirty(L); PE.events.emit('docchange');
        PE.toast(`Aligned: moved ${Math.round(r.dx)}, ${Math.round(r.dy)} px (confidence ${(r.score * 100).toFixed(0)}%)`);
      } finally { PE.ui && PE.ui.busy(false); }
    }, 30);
  };
  S.expandCanvasToLayers = function () { PE.actions.trimToLayers(); };
})();
