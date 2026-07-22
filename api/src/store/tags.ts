import { randomUUID } from 'node:crypto'
import {
  MAX_TAG_LABEL_LENGTH,
  findTagByLabel,
  mergeBuiltinTags,
  normalizeTagLabel,
  type AppTag,
} from '../shared/tags.js'
import { ensureStore, persist } from './persistence.js'
import { normalizeTagIds } from './defaults.js'

export async function listTags(): Promise<AppTag[]> {
  const store = await ensureStore()
  store.tags = mergeBuiltinTags(store.tags)
  return store.tags
}

export async function createTag(label: string): Promise<AppTag> {
  const store = await ensureStore()
  store.tags = mergeBuiltinTags(store.tags)

  const trimmed = label.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    throw Object.assign(new Error('err:tag_empty'), { statusCode: 400 })
  }
  if (trimmed.length > MAX_TAG_LABEL_LENGTH) {
    throw Object.assign(new Error('err:tag_too_long'), { statusCode: 400 })
  }

  const existing = findTagByLabel(store.tags, trimmed)
  if (existing) return existing

  const tag: AppTag = {
    id: randomUUID(),
    label: trimmed,
    kind: 'custom',
    builtin: false,
  }
  store.tags = [...store.tags, tag]
  await persist(store)
  return tag
}

export async function deleteTag(id: string): Promise<boolean> {
  const store = await ensureStore()
  store.tags = mergeBuiltinTags(store.tags)
  const tag = store.tags.find((t) => t.id === id)
  if (!tag) return false

  store.tags = store.tags.filter((t) => t.id !== id)
  store.filters.selectedTagIds = store.filters.selectedTagIds.filter(
    (tid) => tid !== id,
  )
  store.filters.excludedTagIds = (store.filters.excludedTagIds ?? []).filter(
    (tid) => tid !== id,
  )
  for (const monitor of store.monitors) {
    monitor.selectedTagIds = monitor.selectedTagIds.filter((tid) => tid !== id)
    monitor.excludedTagIds = (monitor.excludedTagIds ?? []).filter(
      (tid) => tid !== id,
    )
  }
  await persist(store)
  return true
}

export async function resolveTagsByIds(ids: string[]): Promise<AppTag[]> {
  const catalog = await listTags()
  const validIds = normalizeTagIds(ids, catalog)
  return catalog.filter((t) => validIds.includes(t.id))
}

export function tagLabelKey(label: string): string {
  return normalizeTagLabel(label)
}
