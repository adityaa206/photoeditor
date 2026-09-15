/* PhotoEditor desktop shell: serves the app from a private local port and adds native save dialogs. */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p === '/') p = '/index.html';
        const file = path.normalize(path.join(ROOT, p));
        if (!file.startsWith(ROOT) || file.includes(path.sep + 'node_modules' + path.sep)) { res.writeHead(403); res.end(); return; }
        fs.stat(file, (err, st) => {
          if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Content-Length': st.size,
            'Cache-Control': 'no-store',
            // enables multi-threaded WebAssembly (crossOriginIsolated) without blocking CDN fallbacks
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
          });
          fs.createReadStream(file).pipe(res);
        });
      } catch (e) { res.writeHead(500); res.end(); }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

let win = null;
async function createWindow() {
  const port = await startServer();
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 620,
    title: 'PhotoEditor', backgroundColor: '#1e1e1e', autoHideMenuBar: true, show: false,
    icon: path.join(ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.show(); win.maximize(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => {
    // ask the renderer whether there are unsaved changes
    if (win.__forceClose) return;
    e.preventDefault();
    win.webContents.executeJavaScript('!!(window.PE && PE.doc && PE.history && PE.history.entries.length)', true).then((dirty) => {
      if (!dirty) { win.__forceClose = true; win.close(); return; }
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Quit', 'Cancel'], defaultId: 1, cancelId: 1, title: 'PhotoEditor', message: 'You have unsaved changes. Quit anyway?' });
      if (r === 0) { win.__forceClose = true; win.close(); }
    }).catch(() => { win.__forceClose = true; win.close(); });
  });
  await win.loadURL(`http://127.0.0.1:${port}/index.html`);
  // `PhotoEditor.exe --selftest=<dir>` writes a screenshot + environment report to <dir> and exits (used for automated checks)
  const st = process.argv.find((a) => a.startsWith('--selftest'));
  if (st) {
    const dir = st.includes('=') ? st.slice(st.indexOf('=') + 1) : app.getPath('temp');
    setTimeout(async () => {
      let info;
      try {
        info = await win.webContents.executeJavaScript(`(async () => { const s = PE.warpSession(PE.createCanvas(64, 64)); const gpu = s.gpu; s.dispose(); const base = await PE.assetBase(); return { version: PE.VERSION, gpuWarp: gpu, crossOriginIsolated: window.crossOriginIsolated, vendor: base, electron: !!window.electronAPI, tools: PE.toolOrder.length }; })()`, true);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'photoeditor-selftest.png'), img.toPNG());
      } catch (e) { info = { error: String(e && e.message || e) }; }
      fs.writeFileSync(path.join(dir, 'photoeditor-selftest.json'), JSON.stringify(info));
      win.__forceClose = true; app.exit(0);
    }, 5000);
  }
}

ipcMain.handle('save-file', async (event, { name, data, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: filters && filters.length ? filters : [{ name: 'All files', extensions: ['*'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(r.filePath, Buffer.from(data.buffer ? data.buffer : data, data.byteOffset || 0, data.byteLength));
  return { ok: true, path: r.filePath };
});
ipcMain.handle('show-item', async (event, p) => { shell.showItemInFolder(p); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
