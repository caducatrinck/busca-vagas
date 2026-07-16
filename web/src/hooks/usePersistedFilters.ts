import { useCallback, useEffect, useState } from 'react'
import { normalizeForMatch } from '../lib/filterJobs'
import {
  EMPTY_FILTERS,
  type DescriptionLanguage,
  type JobFilters,
  type WordFilterKey,
} from '../lib/types'

const FILTERS_KEY = 'busca-vagas:filters'

function loadFilters(): JobFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return { ...EMPTY_FILTERS }
    const parsed = JSON.parse(raw) as Partial<JobFilters>
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
    }
  } catch {
    return { ...EMPTY_FILTERS }
  }
}

export function usePersistedFilters() {
  const [filters, setFilters] = useState<JobFilters>(() => loadFilters())

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  }, [filters])

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

  return { filters, setFilters, setLanguage, addWord, removeWord }
}
