// Downloads the optional runtime assets (format decoders, ONNX Runtime, the segmentation model)
// into ./vendor so the desktop app works fully offline. Run: node scripts/fetch-vendor.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const FILES = [
  ['ort/ort.min.js', ORT + 'ort.min.js'],
  ['ort/ort-wasm-simd-threaded.wasm', ORT + 'ort-wasm-simd-threaded.wasm'],
  ['ort/ort-wasm-simd-threaded.mjs', ORT + 'ort-wasm-simd-threaded.mjs'],
  ['libs/UTIF.js', 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js'],
  ['libs/heic2any.min.js', 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'],
  ['libs/ag-psd.bundle.js', 'https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js'],
  // Background segmentation model (U²-Net "silueta" variant, Apache-2.0, from the rembg project)
  ['models/silueta.onnx', 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx'],
];

let failed = 0;
for (const [rel, url] of FILES) {
  const dest = join(root, 'vendor', rel);
  await mkdir(dirname(dest), { recursive: true });
  try {
    const s = await stat(dest).catch(() => null);
    if (s && s.size > 1000) { console.log('exists  ', rel, `(${(s.size / 1e6).toFixed(1)} MB)`); continue; }
    process.stdout.write('download ' + rel + ' ... ');
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  } catch (e) { failed++; console.log('FAILED:', e.message); }
}
await writeFile(join(root, 'vendor', 'manifest.json'), JSON.stringify({ files: FILES.map((f) => f[0]), fetched: new Date().toISOString() }, null, 2));
console.log(failed ? `${failed} file(s) failed` : 'all vendor files ready');
process.exit(failed ? 1 : 0);
