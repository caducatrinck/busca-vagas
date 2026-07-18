import { useI18n } from '../../i18n'
import { localizeVisibleError } from '../../lib/localizeVisibleError'
import { NumberInput } from '../../ui'
import { clampIntervalMinutes } from './constants'

type Props = {
  value: number
  busy: boolean
  lastError: string | null
  onCommit: (minutes: number) => void
  hideError?: boolean
}

export function MonitorPollInterval({
  value,
  busy,
  lastError,
  onCommit,
  hideError,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="search-panel__form monitor-poll">
      <div className="monitor-poll__row">
        <label className="monitor-poll__minutes">
          <span>{t('poll.interval')}</span>
          <NumberInput
            min={1}
            max={120}
            value={value}
            emptyValue={20}
            disabled={busy}
            onValueChange={(n) => onCommit(clampIntervalMinutes(n))}
            aria-label={t('poll.intervalAria')}
          />
        </label>
      </div>
      {lastError && !hideError ? (
        <p className="monitor-error">{localizeVisibleError(lastError, t)}</p>
      ) : null}
    </div>
  )
}
