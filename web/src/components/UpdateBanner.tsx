import { useI18n } from '../i18n'
import { Button } from '../ui'
import type { DesktopUpdaterState } from '../desktop'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import './UpdateBanner.css'

type Props = {
  state: DesktopUpdaterState
  onAccept: () => void
  onDismiss: () => void
  onOpen: () => void
  onRelaunch: () => void
  onRetry: () => void
}

export function UpdateBanner({
  state,
  onAccept,
  onDismiss,
  onOpen,
  onRelaunch,
  onRetry,
}: Props) {
  const { t } = useI18n()

  if (
    state.phase === 'idle' ||
    state.phase === 'checking' ||
    state.phase === 'dismissed'
  ) {
    return null
  }

  const remote = state.remoteVersion ?? '?'
  const current = state.currentVersion || '?'

  return (
    <aside className="update-banner" role="status">
      {state.phase === 'available' ? (
        <>
          <p className="update-banner__title">
            {t('update.availableTitle', { version: remote })}
          </p>
          <p className="update-banner__body">
            {t('update.availableBody', { current, version: remote })}
          </p>
          <div className="update-banner__actions">
            <Button size="sm" variant="primary" onClick={onAccept}>
              {t('update.yes')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('update.no')}
            </Button>
          </div>
        </>
      ) : null}

      {state.phase === 'downloading' ? (
        <>
          <p className="update-banner__title">{t('update.downloading')}</p>
          <p className="update-banner__body">
            {t('update.progress', { n: state.progress })}
          </p>
          <div
            className="update-banner__bar"
            role="progressbar"
            aria-valuenow={state.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="update-banner__bar-fill"
              style={{ width: `${Math.max(0, Math.min(100, state.progress))}%` }}
            />
          </div>
          <div className="update-banner__actions">
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('update.cancel')}
            </Button>
          </div>
        </>
      ) : null}

      {state.phase === 'ready' ? (
        <>
          <p className="update-banner__title">{t('update.readyTitle')}</p>
          <p className="update-banner__body">{t('update.readyBody')}</p>
          <div className="update-banner__actions">
            <Button size="sm" variant="primary" onClick={onRelaunch}>
              {t('update.relaunch')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpen}>
              {t('update.openFolder')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('update.later')}
            </Button>
          </div>
        </>
      ) : null}

      {state.phase === 'error' ? (
        <>
          <p className="update-banner__title">{t('update.errorTitle')}</p>
          <p className="update-banner__body">
            {state.error
              ? localizeVisibleError(state.error, t)
              : t('update.errorBody')}
          </p>
          <div className="update-banner__actions">
            <Button size="sm" variant="primary" onClick={onRetry}>
              {t('update.retry')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('update.dismiss')}
            </Button>
          </div>
        </>
      ) : null}
    </aside>
  )
}
