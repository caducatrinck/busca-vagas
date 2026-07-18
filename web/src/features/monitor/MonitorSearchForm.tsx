import { useMemo } from 'react'
import { poolingWindowMinutes } from '../../../../shared/poolingWindow'
import { useI18n } from '../../i18n'
import type { Monitor, SearchForm } from '../../lib/types'
import { Alert, Button, Field, Select, TextInput, type SelectOption } from '../../ui'

type Props = {
  draft: SearchForm
  active: Monitor
  now: number
  searching: boolean
  searchBlocked: boolean
  rateLimitMsg: string | null
  onDraftChange: (next: SearchForm) => void
  onPausePooling: () => void
  onRunNow: () => void
}

export function MonitorSearchForm({
  draft,
  active,
  now,
  searching,
  searchBlocked,
  rateLimitMsg,
  onDraftChange,
  onPausePooling,
  onRunNow,
}: Props) {
  const { t } = useI18n()
  const pooling = active.pollingEnabled
  const pauseMode = pooling && !searching

  const postedOptions = useMemo<
    Array<SelectOption<SearchForm['postedWithin']>>
  >(
    () => [
      { value: '30m', label: t('search.posted.30m') },
      { value: '1h', label: t('search.posted.1h') },
      { value: '10h', label: t('search.posted.10h') },
      { value: '24h', label: t('search.posted.24h') },
      { value: 'week', label: t('search.posted.week') },
      { value: 'month', label: t('search.posted.month') },
    ],
    [t],
  )

  return (
    <div className="search-panel__form">
      <Field label={t('search.query')}>
        <TextInput
          value={draft.query}
          onChange={(e) => onDraftChange({ ...draft, query: e.target.value })}
          placeholder={t('search.queryPh')}
        />
      </Field>

      <Field label={t('search.location')}>
        <TextInput
          value={draft.location}
          onChange={(e) =>
            onDraftChange({ ...draft, location: e.target.value })
          }
          placeholder={t('search.locationPh')}
        />
      </Field>

      <Field
        label={t('search.posted')}
        hint={
          pooling && !searching ? t('search.postedPoolingHint') : undefined
        }
      >
        {pooling && !searching ? (
          <TextInput
            disabled
            value={t('search.poolingWindow', {
              n: poolingWindowMinutes(
                active.intervalMinutes,
                active.lastRunAt,
                now,
              ),
            })}
            aria-label={t('search.postedPoolingAria')}
          />
        ) : (
          <Select
            fullWidth
            value={draft.postedWithin}
            options={postedOptions}
            aria-label={t('search.posted')}
            onChange={(postedWithin) =>
              onDraftChange({ ...draft, postedWithin })
            }
          />
        )}
      </Field>

      <Button
        fullWidth
        variant={pauseMode ? 'danger' : 'primary'}
        disabled={
          searching || (!pooling && (!draft.query.trim() || searchBlocked))
        }
        title={
          searching
            ? t('search.titleSearching')
            : pooling
              ? t('search.titlePause')
              : rateLimitMsg
                ? rateLimitMsg
                : t('search.titleRun')
        }
        onClick={() => {
          if (pauseMode) onPausePooling()
          else onRunNow()
        }}
      >
        {searching
          ? t('search.searching')
          : pooling
            ? t('search.pause')
            : t('search.run')}
      </Button>

      {rateLimitMsg && !pooling ? (
        <Alert tone="danger" className="monitor-rate-limit">
          {rateLimitMsg}
        </Alert>
      ) : null}
    </div>
  )
}
