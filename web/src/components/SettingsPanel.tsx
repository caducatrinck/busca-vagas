import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchSettings,
  saveSettings,
  type PublicAppSettings,
  type SettingsPatch,
} from '../lib/api'
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
  searchCooldownMs: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
}

function formFromSettings(s: PublicAppSettings): FormState {
  return {
    linkedinLiAt: s.linkedinLiAtSet ? COOKIE_MASK : '',
    linkedinJsessionId: s.linkedinJsessionIdSet ? COOKIE_MASK : '',
    linkedinMaxPages: s.linkedinMaxPages,
    searchCooldownMs: s.searchCooldownMs,
    maxSearchesPerHour: s.maxSearchesPerHour,
    maxSearchesPerDay: s.maxSearchesPerDay,
    jobDetailConcurrency: s.jobDetailConcurrency,
  }
}

function cookiePatchValue(
  value: string,
  alreadySet: boolean,
): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (alreadySet && trimmed === COOKIE_MASK) return undefined
  return trimmed
}

export function SettingsPanel({ setupRequired = false, onSaved }: Props) {
  const [current, setCurrent] = useState<PublicAppSettings | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

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
  }, [])

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

      if (!current.linkedinLiAtSet && !liAt) {
        setError('Cole o cookie li_at para continuar.')
        setSaving(false)
        return
      }

      const patch: SettingsPatch = {
        linkedinMaxPages: form.linkedinMaxPages,
        searchCooldownMs: form.searchCooldownMs,
        maxSearchesPerHour: form.maxSearchesPerHour,
        maxSearchesPerDay: form.maxSearchesPerDay,
        jobDetailConcurrency: form.jobDetailConcurrency,
      }
      if (liAt) patch.linkedinLiAt = liAt
      if (jsession) patch.linkedinJsessionId = jsession

      const next = await saveSettings(patch)
      setCurrent(next)
      setForm(formFromSettings(next))
      setOkMsg(
        next.ready
          ? 'Configurações salvas — app liberado'
          : 'Salvo. Ainda falta o cookie li_at para liberar o app.',
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

  if (loading || !form || !current) {
    return (
      <section className="settings-panel">
        <p className="settings-panel__lead">Carregando configurações…</p>
        {error ? <p className="settings-panel__error">{error}</p> : null}
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
          <li>
            Abra o LinkedIn no navegador e faça login na sua conta.
          </li>
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
            Cole abaixo e salve. Cookies expiram — se a busca começar a
            falhar com 401/403, atualize o <code>li_at</code>.
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

          <label>
            Cookie li_at (obrigatório)
            <span className="settings-panel__hint">
              {current.linkedinLiAtSet
                ? 'Preenchido — cole um novo valor só se quiser trocar'
                : 'Cole o valor do cookie'}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required={!current.linkedinLiAtSet}
              placeholder="Cole o li_at"
              value={form.linkedinLiAt}
              onFocus={(e) => {
                if (form.linkedinLiAt === COOKIE_MASK) e.target.select()
              }}
              onChange={(e) => onCookieChange('linkedinLiAt', e.target.value)}
            />
          </label>

          <label>
            Cookie JSESSIONID
            <span className="settings-panel__hint">
              {current.linkedinJsessionIdSet
                ? 'Preenchido — cole um novo valor só se quiser trocar'
                : 'Opcional'}
            </span>
            <input
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
          </label>

          <label>
            Máx. páginas por busca
            <span className="settings-panel__hint">
              ~10 vagas por página (guest). Padrão 1000 ≈ sem teto prático.
            </span>
            <input
              type="number"
              min={1}
              max={5000}
              value={form.linkedinMaxPages}
              onChange={(e) =>
                setForm({
                  ...form,
                  linkedinMaxPages: Number(e.target.value) || 1,
                })
              }
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Rate limit</legend>

          <label>
            Intervalo mínimo entre buscas (ms)
            <span className="settings-panel__hint">Ex.: 30000 = 30 segundos</span>
            <input
              type="number"
              min={0}
              max={600000}
              step={1000}
              value={form.searchCooldownMs}
              onChange={(e) =>
                setForm({
                  ...form,
                  searchCooldownMs: Number(e.target.value) || 0,
                })
              }
            />
          </label>

          <label>
            Máx. buscas por hora
            <input
              type="number"
              min={1}
              max={500}
              value={form.maxSearchesPerHour}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxSearchesPerHour: Number(e.target.value) || 1,
                })
              }
            />
          </label>

          <label>
            Máx. buscas por dia
            <input
              type="number"
              min={1}
              max={2000}
              value={form.maxSearchesPerDay}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxSearchesPerDay: Number(e.target.value) || 1,
                })
              }
            />
          </label>

          <label>
            Concorrência de descrições
            <span className="settings-panel__hint">
              Quantas páginas de detalhe buscar em paralelo
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={form.jobDetailConcurrency}
              onChange={(e) =>
                setForm({
                  ...form,
                  jobDetailConcurrency: Number(e.target.value) || 1,
                })
              }
            />
          </label>
        </fieldset>

        {error ? <p className="settings-panel__error">{error}</p> : null}
        {okMsg ? <p className="settings-panel__ok">{okMsg}</p> : null}

        <button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </form>
    </section>
  )
}
