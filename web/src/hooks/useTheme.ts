import { useEffect, useRef, useState } from 'react'
import { fetchUiPrefs, saveUiPrefs } from '../lib/api'

export type ThemeMode = 'light' | 'dark'

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('light')
  const [ready, setReady] = useState(false)
  const skipSave = useRef(true)

  useEffect(() => {
    let cancelled = false
    void fetchUiPrefs()
      .then((prefs) => {
        if (cancelled) return
        const next = prefs.theme === 'dark' ? 'dark' : 'light'
        applyTheme(next)
        setThemeState(next)
        setReady(true)
        skipSave.current = true
      })
      .catch(() => {
        if (cancelled) return
        applyTheme('light')
        setReady(true)
        skipSave.current = true
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (!ready) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    void saveUiPrefs({ theme }).catch(() => undefined)
  }, [theme, ready])

  function toggleTheme() {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  function setTheme(next: ThemeMode) {
    skipSave.current = true
    applyTheme(next)
    setThemeState(next)
  }

  return { theme, toggleTheme, setTheme, isDark: theme === 'dark', ready }
}
