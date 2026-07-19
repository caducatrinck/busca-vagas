const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('buscaVagasDesktop', {
  isDesktop: true,
  setTrayBadge(count) {
    const n = Number(count)
    ipcRenderer.send('tray:setBadge', Number.isFinite(n) ? Math.max(0, n) : 0)
  },
  linkedinLogin() {
    return ipcRenderer.invoke('linkedin:login')
  },
  updater: {
    getState() {
      return ipcRenderer.invoke('updater:getState')
    },
    check() {
      return ipcRenderer.invoke('updater:check')
    },
    download() {
      return ipcRenderer.invoke('updater:download')
    },
    dismiss() {
      return ipcRenderer.invoke('updater:dismiss')
    },
    openDownloaded() {
      return ipcRenderer.invoke('updater:openDownloaded')
    },
    relaunch() {
      return ipcRenderer.invoke('updater:relaunch')
    },
    onState(callback) {
      if (typeof callback !== 'function') return () => {}
      const handler = (_event, state) => {
        callback(state)
      }
      ipcRenderer.on('updater:state', handler)
      return () => {
        ipcRenderer.removeListener('updater:state', handler)
      }
    },
  },
})
