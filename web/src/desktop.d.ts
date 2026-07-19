export {}

export type DesktopUpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'dismissed'

export type DesktopUpdaterState = {
  phase: DesktopUpdaterPhase
  currentVersion: string
  remoteVersion: string | null
  assetName: string | null
  downloadUrl: string | null
  progress: number
  downloadedPath: string | null
  error: string | null
  packaged: boolean
}

declare global {
  interface Window {
    buscaVagasDesktop?: {
      isDesktop: boolean
      setTrayBadge: (count: number) => void
      linkedinLogin?: () => Promise<{
        ok: boolean
        cancelled?: boolean
        timedOut?: boolean
        linkedinLiAt?: string
        linkedinJsessionId?: string
        error?: string
      }>
      linkedinLogout?: () => Promise<{ ok: boolean; error?: string }>
      updater?: {
        getState: () => Promise<DesktopUpdaterState>
        check: () => Promise<DesktopUpdaterState>
        download: () => Promise<DesktopUpdaterState>
        dismiss: () => Promise<DesktopUpdaterState>
        openDownloaded: () => Promise<{ ok: boolean }>
        relaunch: () => Promise<{ ok: boolean }>
        onState: (callback: (state: DesktopUpdaterState) => void) => () => void
      }
    }
  }
}
