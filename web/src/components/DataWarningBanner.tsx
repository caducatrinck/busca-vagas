import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { Button, cx } from '../ui'
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
  const { t } = useI18n()
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
      showFeedback({ action: 'export', kind: 'ok', text: t('data.exported') })
    } catch (err) {
      showFeedback({
        action: 'export',
        kind: 'error',
        text: err instanceof Error ? err.message : t('data.failed'),
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    const ok = window.confirm(t('data.importConfirm'))
    if (!ok) return

    setBusy('import')
    setFeedback(null)
    try {
      await onImportFile(file)
      showFeedback({ action: 'import', kind: 'ok', text: t('data.imported') })
    } catch (err) {
      showFeedback({
        action: 'import',
        kind: 'error',
        text: err instanceof Error ? err.message : t('data.failed'),
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

  function feedbackClass(action: 'export' | 'import') {
    if (feedback?.action !== action) return undefined
    return feedback.kind === 'ok'
      ? 'data-banner__btn--ok'
      : 'data-banner__btn--err'
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
          <Button
            size="sm"
            variant="ghost"
            className={cx('data-banner__btn', feedbackClass('export'))}
            disabled={busy !== null}
            title={
              feedback?.action === 'export' && feedback.kind === 'error'
                ? feedback.text
                : t('data.export')
            }
            onClick={() => void handleExport()}
          >
            {buttonLabel('export', t('data.export'), `${t('data.export')}…`)}
          </Button>
          <Button
            size="sm"
            variant="primary"
            className={cx(
              'data-banner__btn',
              'data-banner__btn--accent',
              feedbackClass('import'),
            )}
            disabled={busy !== null}
            title={
              feedback?.action === 'import' && feedback.kind === 'error'
                ? feedback.text
                : t('data.import')
            }
            onClick={() => inputRef.current?.click()}
          >
            {buttonLabel('import', t('data.import'), `${t('data.import')}…`)}
          </Button>
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
        <p className="linkedin-alert__title">{t('data.linkedinTitle')}</p>
        <p className="linkedin-alert__body">{t('data.linkedinBody')}</p>
      </aside>
    </div>
  )
}
