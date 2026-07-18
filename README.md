# Busca Vagas

<p>
  <a href="#português"><strong>🇧🇷 Português</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#english"><strong>🇺🇸 English</strong></a>
</p>

App **local** para monitorar vagas no LinkedIn (pooling, filtros, notificações).  
Roda no seu PC — sem instalar Git nem Node.

---

<a id="português"></a>

## Português

### Baixar e abrir

1. Abra a página de [**Releases**](https://github.com/caducatrinck/busca-vagas/releases/latest)
2. Baixe o arquivo da sua plataforma:
   - **Windows:** `BuscaVagas-*-win-x64-portable.exe`
   - **Linux:** `BuscaVagas-*-linux-x64.AppImage`
3. Abra o arquivo  
   - No Linux: `chmod +x BuscaVagas-*-linux-x64.AppImage` e depois execute
4. Siga as instruções **dentro do app** (Configurações → cookie do LinkedIn)

Não precisa de instalação: o Windows é portable; o Linux é AppImage.

### Como usar (resumo)

| Passo | O que fazer |
|-------|-------------|
| 1 | Configure o cookie nas **Configurações** (o app explica na tela) |
| 2 | Aba **Monitor** → `+` → monte a busca |
| 3 | **Buscar agora** (liga o pooling) |
| 4 | Veja vagas em **Vagas**; o app pode notificar e ficar na bandeja |

Tutorial com prints: **[docs/tutorial](./docs/tutorial/README.md)**

![Configuração](./docs/tutorial/screenshots/01-configuracao.png)

![Pooling ativo](./docs/tutorial/screenshots/04-pooling-ativo.png)

### Atualização

Ao abrir, o app avisa se existir versão nova no GitHub. Você escolhe se quer baixar.

### Dados

Ficam só na sua máquina:
- Windows: `%AppData%/Busca Vagas/data/`
- Linux: `~/.config/Busca Vagas/data/`

Use **Exportar / Importar** no topo do app para backup.

### Aviso

Uso pessoal/local. Scraping do LinkedIn pode conflitar com os [Termos de Uso](https://www.linkedin.com/legal/user-agreement). Use o **seu** cookie e a **sua** conta.

### Para quem desenvolve / faz PR

Guia de rodar com Node/Docker: **[docs/dev.md](./docs/dev.md)**  
Instalação do zero (Git/Node): **[INSTALACAO-DO-ZERO.md](./INSTALACAO-DO-ZERO.md)**  
Empacotar desktop / releases: **[DESKTOP.md](./DESKTOP.md)**

[↑ Topo](#busca-vagas) · [English ↓](#english)

---

<a id="english"></a>

## English

Local LinkedIn job monitor (pooling, filters, notifications).  
Runs on your PC — no Git or Node required.

### Download and open

1. Open **[Releases](https://github.com/caducatrinck/busca-vagas/releases/latest)**
2. Download for your OS:
   - **Windows:** `BuscaVagas-*-win-x64-portable.exe`
   - **Linux:** `BuscaVagas-*-linux-x64.AppImage`
3. Open the file  
   - On Linux: `chmod +x BuscaVagas-*-linux-x64.AppImage`, then run it
4. Follow the steps **inside the app** (Settings → LinkedIn cookie)

No installer needed: Windows portable / Linux AppImage.

### How to use (short)

| Step | What to do |
|------|------------|
| 1 | Set the cookie in **Settings** (the app explains on screen) |
| 2 | **Monitor** tab → `+` → set up the search |
| 3 | **Search now** (enables pooling) |
| 4 | Check **Jobs**; the app can notify and stay in the tray |

Illustrated guide: **[docs/tutorial](./docs/tutorial/README.md)** (PT screenshots)

### Updates

On launch, the app can offer a newer GitHub release. You choose whether to download.

### Data

Stored only on your machine (`%AppData%/Busca Vagas/data/` on Windows, `~/.config/Busca Vagas/data/` on Linux). Use **Export / Import** in the app for backups.

### Disclaimer

Personal/local use. Scraping may conflict with LinkedIn’s [User Agreement](https://www.linkedin.com/legal/user-agreement). Use **your** cookie and account.

### For contributors

Local Node/Docker: **[docs/dev.md](./docs/dev.md)** · From-scratch setup: **[INSTALACAO-DO-ZERO.md](./INSTALACAO-DO-ZERO.md)** · Desktop packaging: **[DESKTOP.md](./DESKTOP.md)**

[↑ Top](#busca-vagas) · [Português ↑](#português)
