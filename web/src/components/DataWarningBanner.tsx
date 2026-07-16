import { useEffect, useRef, useState } from 'react'
import './DataWarningBanner.css'

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
    <aside className="data-banner" role="note">
      <div className="data-banner__text">
        <p className="data-banner__title">Sem banco de dados</p>
        <p className="data-banner__body">
          Tudo fica em <strong>JSON local</strong>, filtros no{' '}
          localstorage do browser. Se limpar cache, apagar o volume
          Docker ou resetar os dados, <strong>você perde tudo</strong>. Exporte
          um backup com frequência.
        </p>
      </div>
      <div className="data-banner__actions">
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
              : undefined
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
              : undefined
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
    </aside>
  )
}
