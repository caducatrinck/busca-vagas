import { useEffect, useState } from 'react'
import type { DesktopUpdaterState } from '../desktop'

const IDLE: DesktopUpdaterState = {
  phase: 'idle',
  currentVersion: '',
  remoteVersion: null,
  assetName: null,
  downloadUrl: null,
  progress: 0,
  downloadedPath: null,
  error: null,
  packaged: false,
}

export function useDesktopUpdater() {
  const [state, setState] = useState<DesktopUpdaterState>(IDLE)
  const enabled =
    typeof window !== 'undefined' && Boolean(window.buscaVagasDesktop?.updater)

  useEffect(() => {
    const api = window.buscaVagasDesktop?.updater
    if (!api) return

    let cancelled = false
    void api.getState().then((s) => {
      if (!cancelled) setState(s)
    })

    const unsub = api.onState((next) => {
      setState(next)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return {
    enabled,
    state,
    download: () => window.buscaVagasDesktop?.updater?.download(),
    dismiss: () => window.buscaVagasDesktop?.updater?.dismiss(),
    openDownloaded: () => window.buscaVagasDesktop?.updater?.openDownloaded(),
    relaunch: () => window.buscaVagasDesktop?.updater?.relaunch(),
    retryCheck: () => window.buscaVagasDesktop?.updater?.check(),
  }
}
