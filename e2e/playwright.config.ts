import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(root, '..')
const dataDir = path.join(root, '.data')
const API_PORT = '8790'
const WEB_PORT = '5190'
const API = `http://127.0.0.1:${API_PORT}`
const WEB = `http://127.0.0.1:${WEB_PORT}`

export default defineConfig({
  testDir: root,
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(root, 'test-results'),
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB,
    viewport: { width: 1280, height: 840 },
    locale: 'pt-BR',
    colorScheme: 'light',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  webServer: [
    {
      command: `npx tsx "${path.join(repo, 'api/src/runServer.ts')}"`,
      cwd: repo,
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        API_HOST: '127.0.0.1',
        API_PORT,
        BUSCA_VAGAS_DATA_DIR: dataDir,
        CORS_ORIGINS: `${WEB},http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev -w web -- --host 127.0.0.1 --port ${WEB_PORT}`,
      cwd: repo,
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_URL: API,
      },
    },
  ],
})
