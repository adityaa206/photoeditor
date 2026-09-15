const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  saveFile: (name, data, filters) => ipcRenderer.invoke('save-file', { name, data, filters }),
  showItem: (p) => ipcRenderer.invoke('show-item', p),
});
