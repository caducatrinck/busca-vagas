import type { Page } from '@playwright/test'

export async function showTaskbarDemo(page: Page) {
  await page.evaluate(() => {
    document.getElementById('e2e-os-chrome')?.remove()
    const root = document.createElement('div')
    root.id = 'e2e-os-chrome'
    root.innerHTML = `
      <style>
        #e2e-os-chrome { pointer-events: none; position: fixed; inset: 0; z-index: 99999; font-family: "Segoe UI", system-ui, sans-serif; }
        #e2e-os-chrome .taskbar {
          position: absolute; left: 0; right: 0; bottom: 0; height: 48px;
          background: rgba(32,32,32,.92); display: flex; align-items: center;
          gap: 8px; padding: 0 12px; box-shadow: 0 -1px 0 rgba(255,255,255,.08);
        }
        #e2e-os-chrome .pill {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,.12); color: #fff;
          border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 600;
        }
        #e2e-os-chrome .icon {
          width: 22px; height: 22px; border-radius: 6px;
          background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
          color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 800;
        }
        #e2e-os-chrome .badge {
          min-width: 18px; height: 18px; border-radius: 999px;
          background: #ef4444; color: #fff; font-size: 11px;
          display: grid; place-items: center; padding: 0 5px;
        }
      </style>
      <div class="taskbar">
        <div class="pill">
          <span class="icon">BV</span>
          <span>Busca Vagas</span>
          <span class="badge">2</span>
        </div>
      </div>
    `
    document.body.appendChild(root)
  })
}

export async function showNotificationDemo(page: Page) {
  await page.evaluate(() => {
    document.getElementById('e2e-os-chrome')?.remove()
    const root = document.createElement('div')
    root.id = 'e2e-os-chrome'
    root.innerHTML = `
      <style>
        #e2e-os-chrome { pointer-events: none; position: fixed; inset: 0; z-index: 99999; font-family: "Segoe UI", system-ui, sans-serif; }
        #e2e-os-chrome .toast {
          position: absolute; right: 24px; top: 24px; width: 360px;
          background: #2b2b2b; color: #f3f3f3; border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,.35); overflow: hidden;
        }
        #e2e-os-chrome .head {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px 0; font-size: 12px; opacity: .85;
        }
        #e2e-os-chrome .icon {
          width: 18px; height: 18px; border-radius: 4px;
          background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
          color: #fff; display: grid; place-items: center; font-size: 8px; font-weight: 800;
        }
        #e2e-os-chrome .body { display: flex; gap: 12px; padding: 10px 14px 14px; }
        #e2e-os-chrome .big {
          width: 44px; height: 44px; border-radius: 10px; flex: none;
          background: linear-gradient(135deg, #1d4ed8, #0ea5e9);
          color: #fff; display: grid; place-items: center; font-size: 14px; font-weight: 800;
        }
        #e2e-os-chrome .title { margin: 0; font-size: 14px; font-weight: 700; }
        #e2e-os-chrome .msg { margin: 4px 0 0; font-size: 13px; line-height: 1.35; opacity: .9; }
      </style>
      <div class="toast">
        <div class="head"><span class="icon">BV</span><span>Busca Vagas</span></div>
        <div class="body">
          <div class="big">BV</div>
          <div>
            <p class="title">2 vagas novas no pooling</p>
            <p class="msg">Front-end Senior — clique para abrir Pendentes</p>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(root)
  })
}

export async function clearOsChrome(page: Page) {
  await page.evaluate(() => document.getElementById('e2e-os-chrome')?.remove())
}
