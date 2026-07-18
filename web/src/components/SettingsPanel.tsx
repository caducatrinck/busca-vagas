import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchSettings,
  saveSettings,
  type PublicAppSettings,
  type SettingsPatch,
} from '../lib/api'
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
          setError(err instanceof Error ? err.message : 'Erro ao carregar')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

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
        next.ready
          ? 'Configurações salvas — app liberado'
          : 'Salvo. Sem cookie li_at — o app fica bloqueado até você colar um.',
      )
      onSaved?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
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
        <p className="settings-panel__lead">Carregando configurações…</p>
      </section>
    )
  }

  if (!form || !current) {
    return (
      <section className="settings-panel">
        <header className="settings-panel__header">
          <p className="settings-panel__mark">Configurações</p>
          <h1>Não foi possível carregar</h1>
        </header>
        <Alert tone="danger">{error || 'API indisponível. Confira se o serviço está no ar.'}</Alert>
        <p className="settings-panel__lead">
          Em desenvolvimento a API precisa estar em{' '}
          <code>http://127.0.0.1:8787</code>.
        </p>
        <Button variant="ghost" onClick={() => setReloadKey((n) => n + 1)}>
          Tentar de novo
        </Button>
      </section>
    )
  }

  return (
    <section className="settings-panel">
      <header className="settings-panel__header">
        <p className="settings-panel__mark">Configurações</p>
        <h1>{setupRequired ? 'Configure para continuar' : 'Cookies e limites'}</h1>
        {setupRequired ? (
          <p className="settings-panel__banner" role="alert">
            O app está bloqueado até você salvar o cookie <code>li_at</code> do
            LinkedIn. Sem ele não é possível buscar vagas.
          </p>
        ) : null}
      </header>

      <aside className="settings-guide" aria-labelledby="settings-guide-title">
        <h2 id="settings-guide-title">Como pegar os cookies</h2>
        <ol>
          <li>Abra o LinkedIn no navegador e faça login na sua conta.</li>
          <li>
            Pressione <kbd>F12</kbd> (ou clique com o botão direito → Inspecionar)
            para abrir as DevTools.
          </li>
          <li>
            Vá em <strong>Application</strong> (Chrome/Edge) ou{' '}
            <strong>Armazenamento</strong> (Firefox).
          </li>
          <li>
            Em Cookies, selecione <code>https://www.linkedin.com</code>.
          </li>
          <li>
            Copie o valor de <code>li_at</code> (obrigatório) e, se existir, de{' '}
            <code>JSESSIONID</code> (sem as aspas).
          </li>
          <li>
            Cole abaixo e salve. Cookies expiram — se a busca começar a falhar
            com 401/403, atualize o <code>li_at</code>.
          </li>
        </ol>
        <p className="settings-guide__note">
          Não compartilhe esses valores. Eles equivalem a estar logado na sua
          conta.
        </p>
      </aside>

      <form className="settings-panel__form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>LinkedIn</legend>

          <Field label="Cookie li_at">
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Cole o li_at"
              value={form.linkedinLiAt}
              onFocus={(e) => {
                if (form.linkedinLiAt === COOKIE_MASK) e.target.select()
              }}
              onChange={(e) => onCookieChange('linkedinLiAt', e.target.value)}
            />
          </Field>

          <Field label="Cookie JSESSIONID">
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Cole o JSESSIONID"
              value={form.linkedinJsessionId}
              onFocus={(e) => {
                if (form.linkedinJsessionId === COOKIE_MASK) e.target.select()
              }}
              onChange={(e) =>
                onCookieChange('linkedinJsessionId', e.target.value)
              }
            />
          </Field>

          <Field label="Máx. páginas por busca">
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
          <legend>Rate limit</legend>

          <Field label="Intervalo mínimo entre buscas (segundos)">
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

          <Field label="Máx. buscas por hora">
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

          <Field label="Máx. buscas por dia">
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

          <Field label="Concorrência de descrições">
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

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {okMsg ? <p className="settings-panel__ok">{okMsg}</p> : null}

        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </Button>
      </form>
    </section>
  )
}
