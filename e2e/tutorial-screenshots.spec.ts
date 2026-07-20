import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  demoStore,
  importStore,
  patchSettings,
  resetFresh,
} from './helpers/demoData'
import {
  clearOsChrome,
  showNotificationDemo,
  showTaskbarDemo,
} from './helpers/osChrome'

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../docs/tutorial/screenshots',
)

async function shot(page: import('@playwright/test').Page, name: string) {
  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({
    path: path.join(outDir, name),
    fullPage: false,
  })
}

/** Stub mínimo do bridge Electron (login no print não abre janela real). */
async function stubDesktopBridge(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    // @ts-expect-error demo stub
    window.buscaVagasDesktop = {
      isDesktop: true,
      setTrayBadge() {},
      linkedinLogin() {
        return Promise.resolve({ ok: false, cancelled: true })
      },
      linkedinLogout() {
        return Promise.resolve({ ok: true })
      },
    }
  })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.Notification, 'permission', {
      configurable: true,
      get: () => 'granted',
    })
    // @ts-expect-error demo stub
    window.Notification.requestPermission = async () => 'granted'
  })
  await stubDesktopBridge(page)
})

test('01 setup: opções LinkedIn + manual', async ({ page }) => {
  await resetFresh()
  const settingsRes = page.waitForResponse(
    (r) => r.url().includes('/settings') && r.request().method() === 'GET',
  )
  await page.goto('/')
  await settingsRes
  await expect(page.locator('.settings-panel')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Como conectar o LinkedIn')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Entrar com LinkedIn' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Configurar manualmente' }),
  ).toBeVisible()
  await shot(page, '01-conectar-opcoes.png')

  await page.getByRole('button', { name: 'Configurar manualmente' }).click()
  await expect(page.getByText('Como pegar os cookies')).toBeVisible()
  await shot(page, '01b-opcao-manual.png')

  await page.getByPlaceholder('Cole o li_at').fill('demo-li-at-for-screenshots')
  await page.getByPlaceholder('Cole o JSESSIONID').fill('ajax:demo-jsession')
  await shot(page, '01-configuracao.png')

  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.locator('.settings-panel__ok')).toBeVisible()
  await shot(page, '02-configuracao-salva.png')
})

test('03 criar pooling / monitor', async ({ page }) => {
  await importStore(demoStore({ pollingEnabled: false, withJobs: false }))
  await page.goto('/')
  await page.getByRole('tab', { name: /Monitor/i }).click()
  await expect(page.locator('.monitor-tabs')).toBeVisible()

  await page.getByRole('button', { name: 'Adicionar monitor' }).click()
  await expect(page.locator('.monitor-tabs__item').last()).toBeVisible()

  const queryField = page.getByPlaceholder('Ex: React TypeScript')
  await queryField.fill('Vue.js Senior')

  await page.waitForTimeout(600)
  await shot(page, '03-criar-monitor.png')
})

test('04 aba com pooling ativo', async ({ page }) => {
  await importStore(demoStore({ pollingEnabled: true, withJobs: true }))
  await page.goto('/')
  await page.getByRole('tab', { name: /Monitor/i }).click()
  await expect(
    page.locator('.monitor-tabs__item--pooling, .app-nav__tab--pooling').first(),
  ).toBeVisible({
    timeout: 10_000,
  })
  await shot(page, '04-pooling-ativo.png')
})

test('05 vagas / badge de novas', async ({ page }) => {
  await importStore(demoStore({ pollingEnabled: true, withJobs: true }))
  await page.goto('/')
  await page.getByRole('tab', { name: /Vagas|Jobs/i }).click()
  await expect(page.locator('.job-list, .jobs-panel, .app__main').first()).toBeVisible()
  await shot(page, '05-vagas-pendentes.png')
})

test('06 notificação', async ({ page }) => {
  await importStore(demoStore({ pollingEnabled: true, withJobs: true }))
  await page.goto('/')
  await page.getByRole('tab', { name: /Monitor/i }).click()
  await expect(page.locator('.monitor-tabs')).toBeVisible()
  await showNotificationDemo(page)
  await shot(page, '06-notificacao.png')
  await clearOsChrome(page)
})

test('07 bandeja', async ({ page }) => {
  await importStore(demoStore({ pollingEnabled: true, withJobs: true }))
  await page.goto('/')
  await page.getByRole('tab', { name: /Monitor/i }).click()
  await expect(
    page.locator('.app-nav__tab--pooling, .monitor-tabs__item--pooling').first(),
  ).toBeVisible()
  await showTaskbarDemo(page)
  await shot(page, '07-bandeja.png')
  await clearOsChrome(page)
})

test('sanity: cookie fake desbloqueia app', async () => {
  await resetFresh()
  await patchSettings({ linkedinLiAt: 'x' })
  const res = await fetch('http://127.0.0.1:8790/settings')
  const json = (await res.json()) as { ready: boolean }
  expect(json.ready).toBe(true)
})
