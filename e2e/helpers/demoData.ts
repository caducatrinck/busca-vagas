export const API = 'http://127.0.0.1:8790'

export const emptyFilters = {
  excludeTitle: [],
  includeTitle: [],
  excludeDescription: [],
  includeDescription: [],
  language: '' as const,
}

export const demoSettings = {
  linkedinLiAt: 'demo-li-at-for-screenshots',
  linkedinJsessionId: 'ajax:demo-jsession',
  linkedinMaxPages: 3,
  searchCooldownMs: 30_000,
  maxSearchesPerHour: 30,
  maxSearchesPerDay: 500,
  jobDetailConcurrency: 2,
  rateLimitDefaultsRev: 2,
}

export function demoStore(opts?: {
  pollingEnabled?: boolean
  withJobs?: boolean
  liAt?: string
}) {
  const pollingEnabled = opts?.pollingEnabled ?? true
  const withJobs = opts?.withJobs ?? true
  const now = new Date().toISOString()
  const next = new Date(Date.now() + 12 * 60_000).toISOString()

  const monitor = {
    id: 'mon-react',
    name: 'React Senior',
    search: {
      query: 'React',
      location: 'Brasil',
      postedWithin: 'week',
      fetchDescriptions: false,
    },
    pollingEnabled,
    intervalMinutes: 20,
    lastRunAt: now,
    nextRunAt: pollingEnabled ? next : null,
    lastError: null,
    newCountLastRun: withJobs ? 2 : 0,
    lastRunMode: pollingEnabled ? 'pooling' : null,
    knownIdsAtStart: [],
    lastRunStats: null,
    descriptionFilters: {
      excludeDescription: [],
      includeDescription: [],
      language: '',
    },
  }

  const jobs = withJobs
    ? {
        'job-1': {
          id: 'job-1',
          title: 'Front-end Senior',
          company: 'Acme Tech',
          location: 'Remoto — Brasil',
          description: 'React, TypeScript, design system.',
          url: 'https://www.linkedin.com/jobs/view/1',
          postedAt: 'há 2 horas',
          status: 'viewed',
          applied: false,
          firstSeenAt: now,
          lastSeenAt: now,
          monitorIds: ['mon-react'],
        },
        'job-2': {
          id: 'job-2',
          title: 'React Engineer',
          company: 'Beta Labs',
          location: 'São Paulo',
          description: 'Produto B2B, React e Node.',
          url: 'https://www.linkedin.com/jobs/view/2',
          postedAt: 'há 5 horas',
          status: 'viewed',
          applied: false,
          firstSeenAt: now,
          lastSeenAt: now,
          monitorIds: ['mon-react'],
        },
      }
    : {}

  return {
    version: 1,
    store: {
      jobs,
      monitors: [monitor],
      rateLimit: {
        events: [],
        lastSearchAt: null,
        blockedUntil: null,
        blockReason: null,
        lastLinkedInStatus: null,
      },
      settings: {
        ...demoSettings,
        linkedinLiAt: opts?.liAt ?? demoSettings.linkedinLiAt,
      },
      filters: emptyFilters,
      theme: 'light',
      locale: 'pt',
    },
  }
}

export async function importStore(body: unknown) {
  const res = await fetch(`${API}/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`import failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function patchSettings(patch: Record<string, unknown>) {
  const res = await fetch(`${API}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(`settings failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function resetFresh() {
  return importStore({
    version: 1,
    store: {
      jobs: {},
      monitors: [],
      rateLimit: {
        events: [],
        lastSearchAt: null,
        blockedUntil: null,
        blockReason: null,
        lastLinkedInStatus: null,
      },
      settings: {
        ...demoSettings,
        linkedinLiAt: '',
        linkedinJsessionId: '',
      },
      filters: emptyFilters,
      theme: 'light',
      locale: 'pt',
    },
  })
}
