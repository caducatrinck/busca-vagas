# How to download and use

<p>
  <a href="./README.md"><strong>🇧🇷 Português</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="./README.en.md"><strong>🇺🇸 English</strong></a>
</p>

## Why Busca Vagas?

LinkedIn does not reliably notify you when a new job matches the search you care about. This app:

1. **Pooling** — repeats your search on the interval you set (e.g. every 20 minutes), with a short window aligned to pooling
2. **Tray** — closing the window does not quit; the app stays in the system tray
3. **Notification** — when a new job appears, the OS can notify you (even with the window closed)

The screenshot below is the everyday outcome that matters:

![New job notification](./screenshots/06-notificacao.png)

---

## 1. Download

1. Open [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest)
2. Download for your platform:
   - Windows: `BuscaVagas-*-win-x64-portable.exe`
   - Linux: `BuscaVagas-*-linux-x64.AppImage`
3. Open the file (on Linux, allow execution if the OS asks)

## 2. Configure

On first launch, open **Settings** and follow the in-app guide (LinkedIn `li_at` cookie).

![Settings](./screenshots/01-configuracao.png)

![Saved](./screenshots/02-configuracao-salva.png)

## 3. Create a monitor

**Monitor** → **+** → fill in the search (keywords, location, posted window).

![Create monitor](./screenshots/03-criar-monitor.png)

## 4. Pooling

**Search now** enables pooling. **Pause** turns it off. While active, the tab shows the countdown to the next round.

![Pooling active](./screenshots/04-pooling-ativo.png)

## 5. Jobs

**Jobs** → Pending (then applied / discarded). Filter by title/description and bulk-discard if you want.

![Jobs](./screenshots/05-vagas-pendentes.png)

## 6. Notification and tray

With pooling on, the app can notify new jobs. Closing the window keeps the app in the tray — pooling continues.

![Notification](./screenshots/06-notificacao.png)

![Tray](./screenshots/07-bandeja.png)

## Updates

On launch, if a newer GitHub release exists, the app asks whether you want to download it (release pipeline via `v*` tags).

## Common issues

| Situation | What to do |
|-----------|------------|
| Search fails / 401 | Refresh the cookie in Settings |
| Linux won’t open | `chmod +x` on the AppImage |
| Backup | **Export / Import** at the top of the app |

Contributors: [dev.md](../dev.md)
