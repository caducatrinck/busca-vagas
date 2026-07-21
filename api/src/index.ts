import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { storeRepository } from './infrastructure/persistence/storeRepository.js'
import { registerJobRoutes } from './presentation/routes/jobs.js'
import { registerMonitorRoutes } from './presentation/routes/monitors.js'
import { registerSearchRoutes } from './presentation/routes/search.js'
import { registerSettingsRoutes } from './presentation/routes/settings.js'
import { registerTagRoutes } from './presentation/routes/tags.js'
import { restoreSchedulersFromDisk } from './poller.js'
import { restoreRateLimitFromDisk } from './rateLimit.js'
import {
  getAppSettings,
  isAppConfigured,
  listMonitors,
  toPublicSettings,
} from './store.js'
import { log } from './logger.js'
import { resolveDataDir, resolveLogsDir } from './paths.js'

function resolveModuleDir(): string {
  try {
    const meta = import.meta.url
    if (meta && String(meta).startsWith('file:')) {
      return path.dirname(fileURLToPath(meta))
    }
  } catch {
    /* esbuild CJS */
  }
  return path.dirname(path.resolve(process.argv[1] || process.cwd()))
}

const moduleDir = resolveModuleDir()
dotenv.config({ path: path.resolve(moduleDir, '../../.env') })
dotenv.config()

export type StartServerOptions = {
  port?: number
  host?: string
  corsOrigins?: string[]
  staticDir?: string
}

export type StartedServer = {
  port: number
  host: string
  close: () => Promise<void>
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<StartedServer> {
  const PORT = Number(options.port ?? (process.env.API_PORT || 8787))
  const HOST = options.host ?? process.env.API_HOST ?? '127.0.0.1'
  const CORS_ORIGINS = (
    options.corsOrigins?.join(',') ??
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:80,http://localhost,http://127.0.0.1:8787'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const staticDir =
    options.staticDir?.trim() ||
    process.env.BUSCA_VAGAS_STATIC_DIR?.trim() ||
    ''

  const app = Fastify({ logger: true })
  const repo = storeRepository

  await app.register(cors, {
    origin: CORS_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })

  app.get('/health', async () => ({ ok: true }))

  const SETTINGS_REQUIRED_MSG =
    'Configure o cookie li_at em Configurações antes de buscar vagas.'

  async function rejectIfNotConfigured(reply: {
    status: (code: number) => { send: (body: unknown) => unknown }
  }) {
    const settings = await getAppSettings()
    if (isAppConfigured(settings)) return null
    return reply.status(503).send({
      error: SETTINGS_REQUIRED_MSG,
      settingsRequired: true,
      settings: toPublicSettings(settings),
    })
  }

  registerSettingsRoutes(app, { repo })
  registerTagRoutes(app, { repo })
  registerJobRoutes(app, { repo })
  registerMonitorRoutes(app, {
    repo,
    corsOrigins: CORS_ORIGINS,
    rejectIfNotConfigured,
  })
  registerSearchRoutes(app, { repo, rejectIfNotConfigured })

  if (staticDir) {
    await app.register(fastifyStatic, {
      root: path.resolve(staticDir),
      prefix: '/',
      // wildcard: pega asset novo sem precisar reiniciar
      wildcard: true,
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        const apiPrefixes = [
          '/health',
          '/settings',
          '/linkedin',
          '/jobs',
          '/monitors',
          '/search',
          '/prefs',
          '/data',
          '/rate-limit',
          '/tags',
        ]
        if (apiPrefixes.some((p) => request.url === p || request.url.startsWith(`${p}/`) || request.url.startsWith(`${p}?`))) {
          return reply.status(404).send({ error: 'Not found' })
        }
        // .js/.css faltando → 404 JSON, não o index.html (senão MIME explode)
        const pathOnly = request.url.split('?')[0] ?? request.url
        if (/\.(?:js|mjs|css|map|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$/i.test(pathOnly)) {
          return reply.status(404).send({ error: 'Not found' })
        }
        return reply.sendFile('index.html')
      }
      return reply.status(404).send({ error: 'Not found' })
    })
  }

  await restoreRateLimitFromDisk()
  await restoreSchedulersFromDisk()

  // Sessão UI = cookies; sync antes de aceitar requests (sem Voyager).
  const { syncLinkedInSessionFromCookies, probeLinkedInSession } =
    await import('./linkedinSession.js')
  await syncLinkedInSessionFromCookies()

  await app.listen({ port: PORT, host: HOST })
  log.info('api.started', {
    host: HOST,
    port: PORT,
    dataDir: resolveDataDir(),
    logsDir: resolveLogsDir(),
    staticDir: staticDir || null,
    monitorsPolling: (await listMonitors()).filter((m) => m.pollingEnabled)
      .length,
  })

  void probeLinkedInSession({ force: true, clearGuards: false })
  setInterval(
    () => {
      void probeLinkedInSession({ force: false })
    },
    30 * 60 * 1000,
  )

  return {
    port: PORT,
    host: HOST,
    close: async () => {
      await app.close()
    },
  }
}
