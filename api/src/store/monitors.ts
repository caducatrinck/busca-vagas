import type { Monitor } from './types.js'
import { createMonitor, normalizeTagIds } from './defaults.js'
import { ensureStore, persist } from './persistence.js'
import { mergeBuiltinTags } from '../shared/tags.js'

export async function listMonitors(): Promise<Monitor[]> {
  const store = await ensureStore()
  return store.monitors
}

export async function getMonitor(id: string): Promise<Monitor | null> {
  const store = await ensureStore()
  return store.monitors.find((m) => m.id === id) ?? null
}

export async function createMonitorRecord(
  input?: Partial<Monitor>,
): Promise<Monitor> {
  const store = await ensureStore()
  const catalog = mergeBuiltinTags(store.tags)
  const monitor = createMonitor(
    {
      ...input,
      name:
        input?.name ||
        input?.search?.query?.trim()?.slice(0, 28) ||
        `Monitor ${store.monitors.length + 1}`,
    },
    catalog,
  )
  store.monitors.push(monitor)
  await persist(store)
  return monitor
}

export async function updateMonitor(
  id: string,
  patch: Partial<Monitor> & {
    descriptionFilters?: Monitor['descriptionFilters']
  },
): Promise<Monitor | null> {
  const store = await ensureStore()
  const index = store.monitors.findIndex((m) => m.id === id)
  if (index < 0) return null

  const catalog = mergeBuiltinTags(store.tags)
  const current = store.monitors[index]

  const language =
    patch.language === 'pt' || patch.language === 'en' || patch.language === ''
      ? patch.language
      : patch.descriptionFilters?.language !== undefined
        ? patch.descriptionFilters.language === 'pt' ||
          patch.descriptionFilters.language === 'en'
          ? patch.descriptionFilters.language
          : ''
        : current.language

  const selectedTagIds =
    patch.selectedTagIds !== undefined
      ? normalizeTagIds(patch.selectedTagIds, catalog)
      : current.selectedTagIds

  const excludedTagIds =
    patch.excludedTagIds !== undefined
      ? normalizeTagIds(patch.excludedTagIds, catalog)
      : current.excludedTagIds

  const next = createMonitor(
    {
      ...current,
      ...patch,
      id: current.id,
      search: {
        ...current.search,
        ...patch.search,
      },
      language,
      selectedTagIds,
      excludedTagIds,
    },
    catalog,
  )
  store.monitors[index] = next
  await persist(store)
  return next
}

export async function deleteMonitor(id: string): Promise<boolean> {
  const store = await ensureStore()
  const before = store.monitors.length
  store.monitors = store.monitors.filter((m) => m.id !== id)
  if (store.monitors.length === before) return false
  await persist(store)
  return true
}
