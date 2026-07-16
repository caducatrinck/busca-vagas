import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { storeRepository } from './infrastructure/persistence/storeRepository.js'
import { registerJobRoutes } from './presentation/routes/jobs.js'
import { registerMonitorRoutes } from './presentation/routes/monitors.js'
import { registerSearchRoutes } from './presentation/routes/search.js'
import { registerSettingsRoutes } from './presentation/routes/settings.js'
import {
  restoreSchedulersFromDisk,
} from './poller.js'
import { restoreRateLimitFromDisk } from './rateLimit.js'
import {
  getAppSettings,
  isAppConfigured,
  listMonitors,
  toPublicSettings,
} from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

const PORT = Number(process.env.API_PORT || 8787)
const HOST = process.env.API_HOST || '127.0.0.1'
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:80,http://localhost'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

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
registerJobRoutes(app, { repo })
registerMonitorRoutes(app, {
  repo,
  corsOrigins: CORS_ORIGINS,
  rejectIfNotConfigured,
})
registerSearchRoutes(app, { repo, rejectIfNotConfigured })

try {
  await restoreRateLimitFromDisk()
  await restoreSchedulersFromDisk()
  await app.listen({ port: PORT, host: HOST })
  console.log(`API em http://${HOST}:${PORT}`)
  console.log(
    `Monitores ativos: ${(await listMonitors()).filter((m) => m.pollingEnabled).length}`,
  )
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
