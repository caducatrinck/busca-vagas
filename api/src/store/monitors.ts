import type { Monitor } from './types.js'
import { createMonitor, normalizeDescriptionFilters } from './defaults.js'
import { ensureStore, persist } from './persistence.js'

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
  const monitor = createMonitor({
    ...input,
    name:
      input?.name ||
      input?.search?.query?.trim()?.slice(0, 28) ||
      `Monitor ${store.monitors.length + 1}`,
  })
  store.monitors.push(monitor)
  await persist(store)
  return monitor
}

export async function updateMonitor(
  id: string,
  patch: Partial<Monitor>,
): Promise<Monitor | null> {
  const store = await ensureStore()
  const index = store.monitors.findIndex((m) => m.id === id)
  if (index < 0) return null

  const current = store.monitors[index]
  const next = createMonitor({
    ...current,
    ...patch,
    id: current.id,
    search: {
      ...current.search,
      ...patch.search,
    },
    descriptionFilters: normalizeDescriptionFilters(
      patch.descriptionFilters ?? current.descriptionFilters,
    ),
  })
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
