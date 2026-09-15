// Builds the Windows desktop app into dist/PhotoEditor-win32-x64/PhotoEditor.exe
// Run: npm run fetch-vendor && npm run pack
// (Assembles the app manually from Electron's prebuilt runtime: copies the runtime, puts the app in
//  resources/app, renames the executable and stamps icon/version info with rcedit.)
import { cp, mkdir, rm, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const NAME = 'PhotoEditor';
const out = join(root, 'dist', `${NAME}-win32-x64`);

// 1. locate Electron's prebuilt runtime
let electronDist = join(root, 'node_modules', 'electron', 'dist');
if (!existsSync(join(electronDist, 'electron.exe'))) {
  console.log('Electron runtime not extracted yet, running its installer…');
  execFileSync(process.execPath, [join(root, 'node_modules', 'electron', 'install.js')], { stdio: 'inherit' });
}
if (!existsSync(join(electronDist, 'electron.exe'))) throw new Error('node_modules/electron/dist/electron.exe not found — run `npm install` (or `node node_modules/electron/install.js`) first');
if (!existsSync(join(root, 'vendor', 'manifest.json'))) console.warn('WARNING: vendor/ is missing — run `npm run fetch-vendor` first so the app works offline (AI model, decoders).');

// 2. copy the runtime
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
console.log('copying Electron runtime…');
await cp(electronDist, out, { recursive: true });
await rm(join(out, 'resources', 'default_app.asar'), { force: true });
await rm(join(out, 'electron.exe'));
await cp(join(electronDist, 'electron.exe'), join(out, `${NAME}.exe`));

// 3. copy the application into resources/app (skipping dev-only files)
const IGNORE = [/^dist(\/|$)/, /^node_modules(\/|$)/, /^\.git(\/|$)/, /^\.claude(\/|$)/, /^dev-server\.py$/, /^Start PhotoEditor\.cmd$/, /^package-lock\.json$/, /\.log$/];
const appDir = join(out, 'resources', 'app');
console.log('copying application…');
let files = 0;
await mkdir(appDir, { recursive: true });
// copy entry by entry (the output folder lives inside the project, so a whole-tree copy is not allowed)
for (const entry of await readdir(root)) {
  if (IGNORE.some((re) => re.test(entry) || re.test(entry + '/'))) continue;
  await cp(join(root, entry), join(appDir, entry), {
    recursive: true,
    filter: (src) => {
      const rel = relative(root, src).split(sep).join('/');
      if (IGNORE.some((re) => re.test(rel))) return false;
      files++;
      return true;
    },
  });
}
// production package.json (no dev deps, so Electron does not look for them)
await writeFile(join(appDir, 'package.json'), JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, description: pkg.description, main: pkg.main, private: true, license: pkg.license }, null, 2));

// 4. icon + version resources
try {
  // rcedit ships with @electron/packager; find its executable wherever npm placed it
  const findFile = async (dir, name, depth) => {
    if (depth < 0) return null;
    let entries = []; try { entries = await readdir(dir, { withFileTypes: true }); } catch (_) { return null; }
    for (const e of entries) { if (e.isFile() && e.name.toLowerCase() === name) return join(dir, e.name); }
    for (const e of entries) { if (e.isDirectory()) { const r = await findFile(join(dir, e.name), name, depth - 1); if (r) return r; } }
    return null;
  };
  const rcedit = (await findFile(join(root, 'node_modules'), 'rcedit-x64.exe', 6)) || (await findFile(join(root, 'node_modules'), 'rcedit.exe', 6));
  if (!rcedit) throw new Error('rcedit executable not found under node_modules');
  execFileSync(rcedit, [join(out, `${NAME}.exe`), '--set-icon', join(root, 'build', 'icon.ico'),
    '--set-version-string', 'ProductName', NAME, '--set-version-string', 'FileDescription', NAME,
    '--set-version-string', 'CompanyName', NAME, '--set-version-string', 'InternalName', NAME, '--set-version-string', 'OriginalFilename', `${NAME}.exe`,
    '--set-file-version', pkg.version, '--set-product-version', pkg.version]);
  console.log('icon and version info applied');
} catch (e) { console.warn('rcedit not available, exe keeps the default Electron icon:', e.message); }

const size = async (dir) => { let n = 0; for (const f of await readdir(dir, { withFileTypes: true })) { const p = join(dir, f.name); n += f.isDirectory() ? await size(p) : (await stat(p)).size; } return n; };
console.log(`packaged ${files} app files -> ${join(out, NAME + '.exe')} (${(await size(out) / 1e6).toFixed(0)} MB)`);
