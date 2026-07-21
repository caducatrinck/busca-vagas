import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchUiPrefs, saveUiPrefs } from '../lib/api'
import { normalizeForMatch } from '../lib/filterJobs'
import {
  EMPTY_FILTERS,
  type DescriptionLanguage,
  type JobFilters,
  type WordFilterKey,
} from '../lib/types'

function normalizeFilters(parsed?: Partial<JobFilters> | null): JobFilters {
  if (!parsed) return { ...EMPTY_FILTERS }
  const language =
    parsed.language === 'pt' || parsed.language === 'en' ? parsed.language : ''
  return {
    ...EMPTY_FILTERS,
    ...parsed,
    language,
    excludeTitle: Array.isArray(parsed.excludeTitle) ? parsed.excludeTitle : [],
    includeTitle: Array.isArray(parsed.includeTitle) ? parsed.includeTitle : [],
    excludeDescription: Array.isArray(parsed.excludeDescription)
      ? parsed.excludeDescription
      : [],
    includeDescription: Array.isArray(parsed.includeDescription)
      ? parsed.includeDescription
      : [],
    selectedTagIds: Array.isArray(parsed.selectedTagIds)
      ? parsed.selectedTagIds
      : [],
    excludedTagIds: Array.isArray(parsed.excludedTagIds)
      ? parsed.excludedTagIds
      : [],
  }
}

export function usePersistedFilters() {
  const [filters, setFilters] = useState<JobFilters>({ ...EMPTY_FILTERS })
  const [ready, setReady] = useState(false)
  const skipSave = useRef(true)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchUiPrefs()
      .then((prefs) => {
        if (cancelled) return
        setFilters(normalizeFilters(prefs.filters))
        setReady(true)
        skipSave.current = true
      })
      .catch(() => {
        if (cancelled) return
        setReady(true)
        skipSave.current = true
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void saveUiPrefs({ filters }).catch(() => undefined)
    }, 250)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [filters, ready])

  const addWord = useCallback((key: WordFilterKey, word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return
    setFilters((prev) => {
      if (prev[key].some((w) => normalizeForMatch(w) === normalizeForMatch(trimmed))) {
        return prev
      }
      return { ...prev, [key]: [...prev[key], trimmed] }
    })
  }, [])

  const removeWord = useCallback((key: WordFilterKey, word: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].filter((w) => w !== word),
    }))
  }, [])

  const setLanguage = useCallback((language: DescriptionLanguage) => {
    setFilters((prev) => ({ ...prev, language }))
  }, [])

  const setSelectedTagIds = useCallback((selectedTagIds: string[]) => {
    setFilters((prev) => ({
      ...prev,
      selectedTagIds,
      excludedTagIds: prev.excludedTagIds.filter(
        (id) => !selectedTagIds.includes(id),
      ),
    }))
  }, [])

  const setExcludedTagIds = useCallback((excludedTagIds: string[]) => {
    setFilters((prev) => ({
      ...prev,
      excludedTagIds,
      selectedTagIds: prev.selectedTagIds.filter(
        (id) => !excludedTagIds.includes(id),
      ),
    }))
  }, [])

  const replaceFilters = useCallback((next: JobFilters) => {
    skipSave.current = true
    setFilters(normalizeFilters(next))
  }, [])

  return {
    filters,
    setFilters,
    replaceFilters,
    setLanguage,
    setSelectedTagIds,
    setExcludedTagIds,
    addWord,
    removeWord,
    ready,
  }
}
