import { useEffect, useRef, useState } from 'react'
import './DataWarningBanner.css'

const GITHUB_URL = 'https://github.com/caducatrinck'

type Props = {
  onExport: () => Promise<void>
  onImportFile: (file: File) => Promise<void>
}

type Feedback = {
  action: 'export' | 'import'
  kind: 'ok' | 'error'
  text: string
}

export function DataWarningBanner({ onExport, onImportFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const clearTimer = useRef<number | null>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    return () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
    }
  }, [])

  function showFeedback(next: Feedback) {
    setFeedback(next)
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => {
      setFeedback(null)
      clearTimer.current = null
    }, 2800)
  }

  async function handleExport() {
    setBusy('export')
    setFeedback(null)
    try {
      await onExport()
      showFeedback({ action: 'export', kind: 'ok', text: 'Baixado' })
    } catch (err) {
      showFeedback({
        action: 'export',
        kind: 'error',
        text: err instanceof Error ? err.message : 'Falhou',
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    const ok = window.confirm(
      'Importar vai substituir vagas e monitores atuais pelos do arquivo. Continuar?',
    )
    if (!ok) return

    setBusy('import')
    setFeedback(null)
    try {
      await onImportFile(file)
      showFeedback({ action: 'import', kind: 'ok', text: 'Importado' })
    } catch (err) {
      showFeedback({
        action: 'import',
        kind: 'error',
        text: err instanceof Error ? err.message : 'Falhou',
      })
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function buttonLabel(
    action: 'export' | 'import',
    idle: string,
    loading: string,
  ) {
    if (busy === action) return loading
    if (feedback?.action === action) return feedback.text
    return idle
  }

  return (
    <div className="app-top">
      <div className="app-top__bar">
        <p className="app-top__credit">
          created by{' '}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="app-top__credit-link"
          >
            caducatrinck
          </a>
        </p>
        <div className="app-top__actions">
          <button
            type="button"
            className={[
              'data-banner__btn',
              feedback?.action === 'export' && feedback.kind === 'ok'
                ? 'data-banner__btn--ok'
                : '',
              feedback?.action === 'export' && feedback.kind === 'error'
                ? 'data-banner__btn--err'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy !== null}
            title={
              feedback?.action === 'export' && feedback.kind === 'error'
                ? feedback.text
                : 'Exportar backup JSON'
            }
            onClick={() => void handleExport()}
          >
            {buttonLabel('export', 'Exportar', 'Exportando…')}
          </button>
          <button
            type="button"
            className={[
              'data-banner__btn',
              'data-banner__btn--accent',
              feedback?.action === 'import' && feedback.kind === 'ok'
                ? 'data-banner__btn--ok'
                : '',
              feedback?.action === 'import' && feedback.kind === 'error'
                ? 'data-banner__btn--err'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy !== null}
            title={
              feedback?.action === 'import' && feedback.kind === 'error'
                ? feedback.text
                : 'Importar backup JSON'
            }
            onClick={() => inputRef.current?.click()}
          >
            {buttonLabel('import', 'Importar', 'Importando…')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void handleImport(e.target.files?.[0])}
          />
        </div>
      </div>

      <aside className="linkedin-alert" role="note">
        <p className="linkedin-alert__title">Cuidado com o LinkedIn</p>
        <p className="linkedin-alert__body">
          Muitas requisições seguidas podem fazer o LinkedIn bloquear
          temporariamente as buscas. Se isso acontecer,{' '}
          <strong>espere</strong> o bloqueio passar e, nas Configurações,
          reduza o ritmo: aumente o <strong>intervalo entre buscas</strong> e
          baixe os tetos por hora/dia. Use o app com parcimônia e evite várias
          abas buscando ao mesmo tempo.
        </p>
      </aside>
    </div>
  )
}
