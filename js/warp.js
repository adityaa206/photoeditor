/* PhotoEditor - warp.js : homographies and perspective warping (WebGL with CPU fallback) */
(function () {
  'use strict';
  const PE = window.PE;

  /** Solve the 3x3 homography H (row-major, h33 = 1) mapping src[i] -> dst[i] for 4 point pairs [[x,y],...]. */
  PE.homography = function (src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [X, Y] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    // gaussian elimination with partial pivoting
    const n = 8;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null; // degenerate quad
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  };
  PE.homographyApply = function (H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  };
  PE.homographyInvert = function (H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
    return inv.map((v) => v / det);
  };
  /** Bounding box of a quad */
  PE.quadBounds = (q) => PE.pointsBounds(q);
  /** Is the quad convex and non-degenerate (all cross products same sign, area > 0)? */
  PE.quadIsValid = function (q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) < 1e-6) return false;
      const s = cr > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  };

  /* ---------------- WebGL warp ---------------- */
  let GL = null, glFailed = false;
  function initGL() {
    if (GL || glFailed) return GL;
    try {
      const canvas = document.createElement('canvas');
      const opts = { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, alpha: true };
      let gl = canvas.getContext('webgl2', opts), gl2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) { glFailed = true; return null; }
      const deriv = gl2 || !!gl.getExtension('OES_standard_derivatives');
      // WebGL2 uses GLSL ES 3.00 (derivatives built in); WebGL1 uses ES 1.00 with the derivatives extension when present
      const body = 'vec2 doc=vec2(uOrigin.x+gl_FragCoord.x,uOrigin.y+(uOut.y-gl_FragCoord.y));vec3 s=uHinv*vec3(doc,1.0);' +
        'if(s.z<=0.0){OUT=vec4(0.0);return;}vec2 sp=s.xy/s.z;vec2 uv=sp/uSrc;' +
        'float e=min(min(sp.x,uSrc.x-sp.x),min(sp.y,uSrc.y-sp.y));' +
        (deriv ? 'float aa=clamp(e/max(fwidth(e),1e-4)+0.5,0.0,1.0);' : 'float aa=step(0.0,e);') +
        'if(aa<=0.0){OUT=vec4(0.0);return;}vec4 c=TEX(uTex,clamp(uv,0.0,1.0));OUT=c*aa;';
      const uniforms = 'precision highp float;uniform mat3 uHinv;uniform vec2 uOrigin;uniform vec2 uOut;uniform vec2 uSrc;uniform sampler2D uTex;';
      const vsSrc = gl2 ? '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}' : 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
      const fsSrc = gl2
        ? '#version 300 es\n' + uniforms + 'out vec4 fragColor;void main(){' + body.replace(/OUT/g, 'fragColor').replace(/TEX/g, 'texture') + '}'
        : (deriv ? '#extension GL_OES_standard_derivatives : enable\n' : '') + uniforms + 'void main(){' + body.replace(/OUT/g, 'gl_FragColor').replace(/TEX/g, 'texture2D') + '}';
      const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aLoc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      GL = { gl, gl2, canvas, prog, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRB: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        u: { Hinv: gl.getUniformLocation(prog, 'uHinv'), origin: gl.getUniformLocation(prog, 'uOrigin'), out: gl.getUniformLocation(prog, 'uOut'), src: gl.getUniformLocation(prog, 'uSrc'), tex: gl.getUniformLocation(prog, 'uTex') } };
      return GL;
    } catch (e) { console.warn('WebGL warp unavailable, using CPU fallback', e); glFailed = true; return null; }
  }

  /**
   * Create a warp session for a source canvas. session.render(H, rect) warps the source with the
   * homography H (source pixel coords -> document coords) into a canvas covering `rect` (doc coords).
   */
  PE.warpSession = function (src) {
    const g = initGL();
    if (!g) return cpuSession(src);
    const { gl } = g;
    let tex = null, texW = src.width, texH = src.height;
    try {
      let upload = src;
      if (src.width > g.maxTex || src.height > g.maxTex) {
        const k = g.maxTex / Math.max(src.width, src.height);
        upload = PE.downscale(src, Math.floor(src.width * k), Math.floor(src.height * k));
      }
      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (g.gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('texture upload failed');
    } catch (e) { console.warn('WebGL texture failed, using CPU fallback', e); if (tex) gl.deleteTexture(tex); return cpuSession(src); }
    return {
      gpu: true,
      render(H, rect) {
        const Hinv = PE.homographyInvert(H); if (!Hinv) return PE.createCanvas(rect.w, rect.h);
        const W = Math.max(1, Math.round(rect.w)), Hh = Math.max(1, Math.round(rect.h));
        if (W > g.maxRB || Hh > g.maxRB) return cpuSession(src).render(H, rect);
        g.canvas.width = W; g.canvas.height = Hh;
        gl.viewport(0, 0, W, Hh);
        gl.useProgram(g.prog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        // GLSL mat3 is column-major: transpose the row-major inverse
        gl.uniformMatrix3fv(g.u.Hinv, false, new Float32Array([Hinv[0], Hinv[3], Hinv[6], Hinv[1], Hinv[4], Hinv[7], Hinv[2], Hinv[5], Hinv[8]]));
        gl.uniform2f(g.u.origin, rect.x, rect.y); gl.uniform2f(g.u.out, W, Hh); gl.uniform2f(g.u.src, texW, texH); gl.uniform1i(g.u.tex, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const out = PE.createCanvas(W, Hh);
        out.getContext('2d').drawImage(g.canvas, 0, 0);
        return out;
      },
      dispose() { if (tex) { gl.deleteTexture(tex); tex = null; } },
    };
  };

  /* ---------------- CPU fallback (bilinear, premultiplied) ---------------- */
  function cpuSession(src) {
    const sw = src.width, sh = src.height;
    const sd = PE.getImageData(src).data;
    // premultiply once
    const pm = new Float32Array(sd.length);
    for (let i = 0; i < sd.length; i += 4) { const a = sd[i + 3] / 255; pm[i] = sd[i] * a; pm[i + 1] = sd[i + 1] * a; pm[i + 2] = sd[i + 2] * a; pm[i + 3] = sd[i + 3]; }
    return {
      gpu: false,
      render(H, rect) {
        const Hinv = PE.homographyInvert(H);
        const W = Math.max(1, Math.round(rect.w)), Hh = Math.max(1, Math.round(rect.h));
        const out = new ImageData(W, Hh), od = out.data;
        if (!Hinv) return PE.canvasFromImageData(out);
        for (let y = 0; y < Hh; y++) {
          const dy = rect.y + y + 0.5;
          for (let x = 0; x < W; x++) {
            const dx = rect.x + x + 0.5;
            const w = Hinv[6] * dx + Hinv[7] * dy + Hinv[8];
            if (w <= 0) continue;
            const sx = (Hinv[0] * dx + Hinv[1] * dy + Hinv[2]) / w - 0.5, sy = (Hinv[3] * dx + Hinv[4] * dy + Hinv[5]) / w - 0.5;
            if (sx < -1 || sy < -1 || sx > sw || sy > sh) continue;
            const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
            let r = 0, g = 0, b = 0, a = 0;
            for (let j = 0; j < 2; j++) {
              const yy = y0 + j; if (yy < 0 || yy >= sh) continue;
              const wy = j ? fy : 1 - fy;
              for (let i = 0; i < 2; i++) {
                const xx = x0 + i; if (xx < 0 || xx >= sw) continue;
                const wgt = wy * (i ? fx : 1 - fx), k = (yy * sw + xx) * 4;
                r += pm[k] * wgt; g += pm[k + 1] * wgt; b += pm[k + 2] * wgt; a += pm[k + 3] * wgt;
              }
            }
            if (a <= 0) continue;
            const o = (y * W + x) * 4, ia = 255 / a;
            od[o] = r * ia; od[o + 1] = g * ia; od[o + 2] = b * ia; od[o + 3] = a;
          }
        }
        return PE.canvasFromImageData(out);
      },
      dispose() {},
    };
  }
  /** One-shot warp helper */
  PE.warpPerspective = function (src, H, rect) { const s = PE.warpSession(src); try { return s.render(H, rect); } finally { s.dispose(); } };
})();
