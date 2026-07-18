import { useI18n } from '../i18n'
import { Button } from '../ui'
import type { LinkedInSessionStatus } from '../lib/api'
import './LinkedInSessionBanner.css'

type Props = {
  session: LinkedInSessionStatus
  checking: boolean
  onGoSettings: () => void
  onRecheck: () => void
}

export function LinkedInSessionBanner({
  session,
  checking,
  onGoSettings,
  onRecheck,
}: Props) {
  const { t } = useI18n()
  const title =
    session.code === 'expired'
      ? t('session.expired')
      : session.code === 'incomplete'
        ? t('session.incomplete')
        : session.code === 'missing'
          ? t('session.missing')
          : t('session.unknown')

  return (
    <aside className="linkedin-session-alert" role="alert">
      <p className="linkedin-session-alert__title">{title}</p>
      <p className="linkedin-session-alert__body">{session.message}</p>
      <div className="linkedin-session-alert__actions">
        <Button size="sm" variant="primary" onClick={onGoSettings}>
          {t('session.openSettings')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={checking}
          onClick={onRecheck}
        >
          {checking ? t('session.checking') : t('session.recheck')}
        </Button>
      </div>
    </aside>
  )
}
