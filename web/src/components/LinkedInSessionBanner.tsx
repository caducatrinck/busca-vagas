import { useI18n } from '../i18n'
import type { LinkedInSessionStatus } from '../lib/api'
import { Button } from '../ui'
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

  const body =
    session.httpStatus === 429
      ? t('session.body.rateLimited')
      : session.code === 'expired'
        ? t('session.body.expired')
        : session.code === 'incomplete'
          ? t('session.body.incomplete')
          : session.code === 'missing'
            ? t('session.body.missing')
            : session.code === 'network'
              ? t('session.body.network')
              : t('session.body.unknown')

  return (
    <aside className="linkedin-session-alert" role="alert">
      <p className="linkedin-session-alert__title">{title}</p>
      <p className="linkedin-session-alert__body">{body}</p>
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
