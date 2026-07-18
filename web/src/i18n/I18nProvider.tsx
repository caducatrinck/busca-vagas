import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fetchUiPrefs, saveUiPrefs } from '../lib/api'
import { translate, type MessageKey } from './messages'
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from './types'

type I18nValue = {
  locale: Locale
  ready: boolean
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  setLocale: (next: Locale) => void
  toggleLocale: () => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)
  const [ready, setReady] = useState(false)
  const skipSave = useRef(true)

  useEffect(() => {
    let cancelled = false
    void fetchUiPrefs()
      .then((prefs) => {
        if (cancelled) return
        const next = normalizeLocale(
          (prefs as { locale?: unknown }).locale,
        )
        setLocaleState(next)
        document.documentElement.lang = next
        setReady(true)
        skipSave.current = true
      })
      .catch(() => {
        if (cancelled) return
        document.documentElement.lang = DEFAULT_LOCALE
        setReady(true)
        skipSave.current = true
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    if (!ready) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    void saveUiPrefs({ locale }).catch(() => undefined)
  }, [locale, ready])

  const setLocale = useCallback((next: Locale) => {
    skipSave.current = true
    setLocaleState(next)
    document.documentElement.lang = next
    void saveUiPrefs({ locale: next }).catch(() => undefined)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === 'pt' ? 'en' : 'pt'
      return next
    })
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  )

  const value = useMemo(
    () => ({ locale, ready, t, setLocale, toggleLocale }),
    [locale, ready, t, setLocale, toggleLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
