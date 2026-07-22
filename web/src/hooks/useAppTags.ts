import { useCallback, useEffect, useState } from 'react'
import {
  createTag as apiCreateTag,
  deleteTag as apiDeleteTag,
  fetchTags,
} from '../lib/api'
import type { AppTag } from '../lib/types'

export function useAppTags() {
  const [tags, setTags] = useState<AppTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTags()
      setTags(data.tags)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'err:tags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createTag = useCallback(async (label: string) => {
    const data = await apiCreateTag(label)
    setTags(data.tags)
    return data.tag
  }, [])

  const deleteTag = useCallback(async (id: string) => {
    const data = await apiDeleteTag(id)
    setTags(data.tags)
  }, [])

  return {
    tags,
    loading,
    error,
    reload,
    createTag,
    deleteTag,
  }
}
