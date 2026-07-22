import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchSettings,
  resetAppData,
  saveSettings,
  type PublicAppSettings,
  type SettingsPatch,
} from '../lib/api'
import { useI18n } from '../i18n'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import { Alert, Button, Field, NumberInput, TextInput } from '../ui'
import { LinkedInSignInButton } from './LinkedInSignInButton'
import './SettingsPanel.css'

const COOKIE_MASK = '********'
const DELETE_ALL_CODE = 'DELETEALL'

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

function stripCookieQuotes(value: string): string {
  let next = value.trim()
  for (let i = 0; i < 4; i++) {
    const first = next[0]
    const last = next[next.length - 1]
    const paired =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '\u201C' && last === '\u201D') ||
      (first === '\u2018' && last === '\u2019')
    if (!paired || next.length < 2) break
    next = next.slice(1, -1).trim()
  }
  return next
}

function cookiePatchValue(
  value: string,
  alreadySet: boolean,
): 'keep' | 'clear' | { set: string } {
  const trimmed = stripCookieQuotes(value)
  if (alreadySet && value.trim() === COOKIE_MASK) return 'keep'
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
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [linkedinLoggingIn, setLinkedinLoggingIn] = useState(false)
  const [linkedinLoggingOut, setLinkedinLoggingOut] = useState(false)

  const [setupPath, setSetupPath] = useState<null | 'manual'>(null)
  const canLinkedInLogin =
    import.meta.env.VITE_E2E_DESKTOP_LOGIN === 'true' ||
    (typeof window !== 'undefined' &&
      typeof window.buscaVagasDesktop?.linkedinLogin === 'function')

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

  useEffect(() => {
    if (!confirmReset) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !resetting) {
        setConfirmReset(false)
        setResetCode('')
        setResetError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmReset, resetting])

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

  async function handleLinkedInLogin() {
    const login = window.buscaVagasDesktop?.linkedinLogin
    if (!login || !form || !current) return
    setLinkedinLoggingIn(true)
    setError(null)
    setOkMsg(null)
    try {
      const result = await login()
      if (result.cancelled) {
        setOkMsg(t('settings.loginCancelled'))
        return
      }
      if (result.timedOut) {
        setError(t('settings.loginTimeout'))
        return
      }
      if (!result.ok || !result.linkedinLiAt) {
        setError(
          result.error
            ? localizeVisibleError(result.error, t)
            : t('settings.loginFailed'),
        )
        return
      }

      const patch: SettingsPatch = {
        linkedinLiAt: stripCookieQuotes(result.linkedinLiAt),
        ...(result.linkedinJsessionId
          ? {
              linkedinJsessionId: stripCookieQuotes(result.linkedinJsessionId),
            }
          : {}),
        linkedinMaxPages: form.linkedinMaxPages,
        searchCooldownMs: Math.max(0, Math.round(form.searchCooldownSec * 1000)),
        maxSearchesPerHour: form.maxSearchesPerHour,
        maxSearchesPerDay: form.maxSearchesPerDay,
        jobDetailConcurrency: form.jobDetailConcurrency,
      }
      const next = await saveSettings(patch)
      setCurrent(next)
      setForm(formFromSettings(next))
      setOkMsg(
        next.ready ? t('settings.loginSavedOk') : t('settings.savedBlocked'),
      )
      onSaved?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.loginFailed'))
    } finally {
      setLinkedinLoggingIn(false)
    }
  }

  async function handleLinkedInLogout() {
    setLinkedinLoggingOut(true)
    setError(null)
    setOkMsg(null)
    try {
      await window.buscaVagasDesktop?.linkedinLogout?.()
      const patch: SettingsPatch = {
        clearLinkedinLiAt: true,
        clearLinkedinJsessionId: true,
        linkedinMaxPages: form?.linkedinMaxPages,
        searchCooldownMs: form
          ? Math.max(0, Math.round(form.searchCooldownSec * 1000))
          : undefined,
        maxSearchesPerHour: form?.maxSearchesPerHour,
        maxSearchesPerDay: form?.maxSearchesPerDay,
        jobDetailConcurrency: form?.jobDetailConcurrency,
      }
      const next = await saveSettings(patch)
      setCurrent(next)
      setForm(formFromSettings(next))
      setSetupPath(null)
      setOkMsg(t('settings.logoutOk'))
      onSaved?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.logoutFailed'))
    } finally {
      setLinkedinLoggingOut(false)
    }
  }

  async function handleFactoryReset() {
    if (resetCode !== DELETE_ALL_CODE) {
      setResetError(t('settings.dangerMismatch'))
      return
    }
    setResetting(true)
    setResetError(null)
    try {
      await resetAppData()
      window.location.reload()
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : t('settings.saveError'),
      )
      setResetting(false)
    }
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

  const showSetupChooser = setupRequired && setupPath === null
  const showManualFields =
    !setupRequired ||
    setupPath === 'manual' ||
    (!canLinkedInLogin && setupRequired)

  return (
    <section className="settings-panel">
      <header className="settings-panel__header">
        <p className="settings-panel__mark">{t('nav.settings')}</p>
        <h1>
          {setupRequired ? t('settings.setupTitle') : t('settings.title')}
        </h1>
        {setupRequired && !showSetupChooser ? (
          <p className="settings-panel__banner" role="alert">
            {t('settings.setupLead')}
          </p>
        ) : null}
      </header>

      <p className="settings-panel__privacy" role="note">
        {t('settings.privacyNote')}
      </p>

      {showSetupChooser ? (
        <div className="settings-panel__chooser">
          <h2>{t('settings.chooseTitle')}</h2>
          <p className="settings-panel__chooser-lead">{t('settings.chooseLead')}</p>
          <div className="settings-panel__chooser-options">
            {canLinkedInLogin ? (
              <div className="settings-panel__choice-card">
                <LinkedInSignInButton
                  disabled={linkedinLoggingIn || saving}
                  onClick={() => void handleLinkedInLogin()}
                >
                  {linkedinLoggingIn
                    ? t('settings.loginWorking')
                    : t('settings.loginButton')}
                </LinkedInSignInButton>
                <p className="settings-panel__choice-desc">
                  {t('settings.chooseLoginBody')}
                </p>
              </div>
            ) : null}
            <div className="settings-panel__choice-card">
              <button
                type="button"
                className="settings-panel__manual-btn"
                disabled={linkedinLoggingIn}
                onClick={() => setSetupPath('manual')}
              >
                {t('settings.chooseManual')}
              </button>
              <p className="settings-panel__choice-desc">
                {t('settings.chooseManualBody')}
              </p>
            </div>
          </div>
          {!canLinkedInLogin ? (
            <p className="settings-panel__login-hint">{t('settings.loginDesktopOnly')}</p>
          ) : null}
        </div>
      ) : null}

      {error && showSetupChooser ? (
        <Alert tone="danger">{localizeVisibleError(error, t)}</Alert>
      ) : null}
      {okMsg && showSetupChooser ? (
        <p className="settings-panel__ok">{okMsg}</p>
      ) : null}

      {showManualFields || (!setupRequired && current.ready) ? (
        <>
          {setupPath === 'manual' || (!canLinkedInLogin && setupRequired) ? (
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
              {setupRequired && canLinkedInLogin ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSetupPath(null)}
                >
                  {t('settings.chooseBack')}
                </Button>
              ) : null}
            </aside>
          ) : null}

          <form className="settings-panel__form" onSubmit={handleSubmit}>
            <fieldset>
              <legend>{t('settings.legendLinkedIn')}</legend>

              {!setupRequired && current.ready ? (
                <div className="settings-panel__login">
                  <p className="settings-panel__connected">{t('settings.connected')}</p>
                  {canLinkedInLogin ? (
                    <>
                      <LinkedInSignInButton
                        disabled={linkedinLoggingIn || linkedinLoggingOut || saving}
                        onClick={() => void handleLinkedInLogin()}
                      >
                        {linkedinLoggingIn
                          ? t('settings.loginWorking')
                          : t('settings.loginAgain')}
                      </LinkedInSignInButton>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={linkedinLoggingIn || linkedinLoggingOut || saving}
                        onClick={() => void handleLinkedInLogout()}
                      >
                        {linkedinLoggingOut
                          ? t('settings.logoutWorking')
                          : t('settings.logoutButton')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={linkedinLoggingOut || saving}
                      onClick={() => void handleLinkedInLogout()}
                    >
                      {linkedinLoggingOut
                        ? t('settings.logoutWorking')
                        : t('settings.logoutButton')}
                    </Button>
                  )}
                </div>
              ) : null}

              {(setupPath === 'manual' ||
                (!canLinkedInLogin && setupRequired) ||
                !setupRequired) && (
                <>
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
                      onChange={(e) =>
                        onCookieChange('linkedinLiAt', e.target.value)
                      }
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
                        if (form.linkedinJsessionId === COOKIE_MASK)
                          e.target.select()
                      }}
                      onChange={(e) =>
                        onCookieChange('linkedinJsessionId', e.target.value)
                      }
                    />
                  </Field>
                </>
              )}

              {!setupRequired || setupPath === 'manual' || !canLinkedInLogin ? (
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
              ) : null}
            </fieldset>

            {!setupRequired || setupPath === 'manual' || !canLinkedInLogin ? (
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
            ) : null}

            {error ? (
              <Alert tone="danger">{localizeVisibleError(error, t)}</Alert>
            ) : null}
            {okMsg ? <p className="settings-panel__ok">{okMsg}</p> : null}

            {!setupRequired || setupPath === 'manual' || !canLinkedInLogin ? (
              <Button type="submit" disabled={saving || linkedinLoggingOut}>
                {saving ? t('settings.saving') : t('settings.save')}
              </Button>
            ) : null}
          </form>
        </>
      ) : null}

      {!setupRequired ? (
      <div className="settings-panel__danger">
        <h2>{t('settings.dangerTitle')}</h2>
        <p>{t('settings.dangerLead')}</p>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setConfirmReset(true)
            setResetCode('')
            setResetError(null)
          }}
        >
          {t('settings.dangerButton')}
        </Button>
      </div>
      ) : null}

      {confirmReset ? (
        <div
          className="settings-panel__modal-backdrop"
          role="presentation"
          onClick={() => {
            if (resetting) return
            setConfirmReset(false)
            setResetCode('')
            setResetError(null)
          }}
        >
          <div
            className="settings-panel__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="factory-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="factory-reset-title">{t('settings.dangerConfirmTitle')}</h3>
            <p>
              {t('settings.dangerConfirmBody', { code: DELETE_ALL_CODE })}
            </p>
            <Field label={t('settings.dangerConfirmPh')}>
              <TextInput
                value={resetCode}
                placeholder={DELETE_ALL_CODE}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={resetting}
                onChange={(e) => {
                  setResetCode(e.target.value)
                  setResetError(null)
                }}
              />
            </Field>
            {resetError ? (
              <Alert tone="danger">{localizeVisibleError(resetError, t)}</Alert>
            ) : null}
            <div className="settings-panel__modal-actions">
              <Button
                variant="ghost"
                disabled={resetting}
                onClick={() => {
                  setConfirmReset(false)
                  setResetCode('')
                  setResetError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={resetting || resetCode !== DELETE_ALL_CODE}
                onClick={() => void handleFactoryReset()}
              >
                {resetting
                  ? t('settings.dangerResetting')
                  : t('settings.dangerConfirmYes')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
