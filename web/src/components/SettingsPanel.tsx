import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchSettings,
  saveSettings,
  type PublicAppSettings,
  type SettingsPatch,
} from '../lib/api'
import { useI18n } from '../i18n'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import { Alert, Button, Field, NumberInput, TextInput } from '../ui'
import './SettingsPanel.css'

const COOKIE_MASK = '********'

type Props = {
  setupRequired?: boolean
  onSaved?: (settings: PublicAppSettings) => void
}

type FormState = {
  linkedinLiAt: string
  linkedinJsessionId: string
  linkedinMaxPages: number
  searchCooldownSec: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
}

function formFromSettings(s: PublicAppSettings): FormState {
  return {
    linkedinLiAt: s.linkedinLiAtSet ? COOKIE_MASK : '',
    linkedinJsessionId: s.linkedinJsessionIdSet ? COOKIE_MASK : '',
    linkedinMaxPages: s.linkedinMaxPages,
    searchCooldownSec: Math.round(s.searchCooldownMs / 1000),
    maxSearchesPerHour: s.maxSearchesPerHour,
    maxSearchesPerDay: s.maxSearchesPerDay,
    jobDetailConcurrency: s.jobDetailConcurrency,
  }
}

function cookiePatchValue(
  value: string,
  alreadySet: boolean,
): 'keep' | 'clear' | { set: string } {
  const trimmed = value.trim()
  if (alreadySet && trimmed === COOKIE_MASK) return 'keep'
  if (!trimmed) return 'clear'
  return { set: trimmed }
}

export function SettingsPanel({ setupRequired = false, onSaved }: Props) {
  const { t } = useI18n()
  const [current, setCurrent] = useState<PublicAppSettings | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const settings = await fetchSettings()
        if (cancelled) return
        setCurrent(settings)
        setForm(formFromSettings(settings))
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('settings.loadError'),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey, t])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form || !current) return
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      const liAt = cookiePatchValue(form.linkedinLiAt, current.linkedinLiAtSet)
      const jsession = cookiePatchValue(
        form.linkedinJsessionId,
        current.linkedinJsessionIdSet,
      )

      const patch: SettingsPatch = {
        linkedinMaxPages: form.linkedinMaxPages,
        searchCooldownMs: Math.max(0, Math.round(form.searchCooldownSec * 1000)),
        maxSearchesPerHour: form.maxSearchesPerHour,
        maxSearchesPerDay: form.maxSearchesPerDay,
        jobDetailConcurrency: form.jobDetailConcurrency,
      }
      if (liAt === 'clear') patch.clearLinkedinLiAt = true
      else if (typeof liAt === 'object') patch.linkedinLiAt = liAt.set
      if (jsession === 'clear') patch.clearLinkedinJsessionId = true
      else if (typeof jsession === 'object') patch.linkedinJsessionId = jsession.set

      const next = await saveSettings(patch)
      setCurrent(next)
      setForm(formFromSettings(next))
      setOkMsg(
        next.ready ? t('settings.savedOk') : t('settings.savedBlocked'),
      )
      onSaved?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function onCookieChange(
    field: 'linkedinLiAt' | 'linkedinJsessionId',
    next: string,
  ) {
    if (!form) return
    const prev = form[field]

    if (prev === COOKIE_MASK && next !== COOKIE_MASK) {
      const added = next.startsWith(COOKIE_MASK)
        ? next.slice(COOKIE_MASK.length)
        : next.replace(COOKIE_MASK, '')
      setForm({ ...form, [field]: added || next })
      return
    }
    setForm({ ...form, [field]: next })
  }

  if (loading) {
    return (
      <section className="settings-panel">
        <p className="settings-panel__lead">{t('list.loading')}</p>
      </section>
    )
  }

  if (!form || !current) {
    return (
      <section className="settings-panel">
        <header className="settings-panel__header">
          <p className="settings-panel__mark">{t('nav.settings')}</p>
          <h1>{t('settings.loadFailedTitle')}</h1>
        </header>
        <Alert tone="danger">{error ? localizeVisibleError(error, t) : t('settings.apiDown')}</Alert>
        <p className="settings-panel__lead">
          {t('settings.devApiHint', { url: 'http://127.0.0.1:8787' })}
        </p>
        <Button variant="ghost" onClick={() => setReloadKey((n) => n + 1)}>
          {t('settings.retry')}
        </Button>
      </section>
    )
  }

  return (
    <section className="settings-panel">
      <header className="settings-panel__header">
        <p className="settings-panel__mark">{t('nav.settings')}</p>
        <h1>
          {setupRequired ? t('settings.setupTitle') : t('settings.title')}
        </h1>
        {setupRequired ? (
          <p className="settings-panel__banner" role="alert">
            {t('settings.setupLead')}
          </p>
        ) : null}
      </header>

      <aside className="settings-guide" aria-labelledby="settings-guide-title">
        <h2 id="settings-guide-title">{t('settings.guideTitle')}</h2>
        <p className="settings-guide__howto">{t('settings.howto')}</p>
        <ol>
          <li>{t('settings.guideStep1')}</li>
          <li>{t('settings.guideStep2')}</li>
          <li>{t('settings.guideStep3')}</li>
          <li>{t('settings.guideStep4')}</li>
          <li>{t('settings.guideStep5')}</li>
          <li>{t('settings.guideStep6')}</li>
        </ol>
        <p className="settings-guide__note">{t('settings.guideNote')}</p>
      </aside>

      <form className="settings-panel__form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>{t('settings.legendLinkedIn')}</legend>

          <Field label={t('settings.liAt')}>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('settings.liAtPh')}
              value={form.linkedinLiAt}
              onFocus={(e) => {
                if (form.linkedinLiAt === COOKIE_MASK) e.target.select()
              }}
              onChange={(e) => onCookieChange('linkedinLiAt', e.target.value)}
            />
          </Field>

          <Field label={t('settings.jsession')}>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('settings.jsessionPh')}
              value={form.linkedinJsessionId}
              onFocus={(e) => {
                if (form.linkedinJsessionId === COOKIE_MASK) e.target.select()
              }}
              onChange={(e) =>
                onCookieChange('linkedinJsessionId', e.target.value)
              }
            />
          </Field>

          <Field label={t('settings.maxPages')}>
            <NumberInput
              min={1}
              max={5000}
              value={form.linkedinMaxPages}
              emptyValue={1}
              onValueChange={(linkedinMaxPages) =>
                setForm({ ...form, linkedinMaxPages })
              }
            />
          </Field>
        </fieldset>

        <fieldset>
          <legend>{t('settings.legendRateLimit')}</legend>

          <Field label={t('settings.cooldown')}>
            <NumberInput
              min={0}
              max={600}
              step={1}
              value={form.searchCooldownSec}
              emptyValue={0}
              onValueChange={(searchCooldownSec) =>
                setForm({ ...form, searchCooldownSec })
              }
            />
          </Field>

          <Field label={t('settings.maxHour')}>
            <NumberInput
              min={0}
              max={500}
              value={form.maxSearchesPerHour}
              emptyValue={0}
              onValueChange={(maxSearchesPerHour) =>
                setForm({ ...form, maxSearchesPerHour })
              }
            />
          </Field>

          <Field label={t('settings.maxDay')}>
            <NumberInput
              min={0}
              max={2000}
              value={form.maxSearchesPerDay}
              emptyValue={0}
              onValueChange={(maxSearchesPerDay) =>
                setForm({ ...form, maxSearchesPerDay })
              }
            />
          </Field>

          <Field label={t('settings.concurrency')}>
            <NumberInput
              min={1}
              max={20}
              value={form.jobDetailConcurrency}
              emptyValue={1}
              onValueChange={(jobDetailConcurrency) =>
                setForm({ ...form, jobDetailConcurrency })
              }
            />
          </Field>
        </fieldset>

        {error ? (
          <Alert tone="danger">{localizeVisibleError(error, t)}</Alert>
        ) : null}
        {okMsg ? <p className="settings-panel__ok">{okMsg}</p> : null}

        <Button type="submit" disabled={saving}>
          {saving ? t('settings.saving') : t('settings.save')}
        </Button>
      </form>
    </section>
  )
}
