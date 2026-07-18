# App desktop (Electron)

Pacote Windows/Linux **sem instalar Git nem Node** no PC do usuário.

Usuário final: baixe em [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest) e veja o [tutorial](./docs/tutorial/README.md).  
Este arquivo é para **manter / publicar** o desktop.

## O que o usuário final faz

1. Baixa o executável no [GitHub Releases](https://github.com/caducatrinck/busca-vagas/releases)  
   - Windows: `BuscaVagas-{versão}-win-x64-portable.exe`  
   - Linux: `BuscaVagas-{versão}-linux-x64.AppImage`
2. Abre o arquivo
3. Configura o cookie **pelo guia dentro do app**

Ao abrir de novo, o app consulta o Release mais recente. Se houver versão maior, pergunta se quer baixar (com barra de progresso).

Dados ficam em:
- Windows: `%AppData%/Busca Vagas/data/`
- Linux: `~/.config/Busca Vagas/data/`

## Padrões de versão e release

| Item | Padrão |
|------|--------|
| Repositório | `caducatrinck/busca-vagas` |
| Binários | GitHub Releases (não no git) |
| Versão do app | SemVer em `desktop/package.json` |
| Tag | `v{MAJOR}.{MINOR}.{PATCH}` (ex.: `v1.0.1`) |
| Windows | `BuscaVagas-{version}-win-x64-portable.exe` |
| Linux | `BuscaVagas-{version}-linux-x64.AppImage` |

### Publicar uma versão

1. Suba a versão em `desktop/package.json` (ex.: `1.0.0` → `1.0.1`)
2. Commit na branch desejada
3. Crie e envie a tag **igual** à versão:

```bash
git tag v1.0.1
git push origin v1.0.1
```

4. O workflow **Desktop Release** (GitHub Actions) gera Win + Linux e publica o Release

A tag deve bater com `desktop/package.json` — o CI falha se divergirem.

## Desenvolvimento (esta máquina)

```bash
npm install
npm run desktop:dev
```

Gera `desktop/resources/` e tenta abrir o Electron.  
No **WSL** (sem libs gráficas), sobe o mesmo bundle no navegador em http://127.0.0.1:8787 — sem precisar do `.exe`.

## Gerar instalável / portable (local)

```bash
# Windows (portable .exe)
npm run desktop:dist:win

# Linux AppImage
npm run desktop:dist:linux

# Alvo da plataforma atual
npm run desktop:dist
```

Artefatos em `desktop/release/`.

> No WSL/Linux, o build **Windows** pode exigir Wine ou uma máquina Windows. Em produção, use o GitHub Actions.

## Arquitetura

```
Electron (janela)
   └─ sobe API (server.cjs) na porta 8787
         ├─ rotas JSON (jobs, search, …)
         └─ serve web/dist (mesma origem → VITE_API_URL="")
```

No WSL, o binário do Electron pode falhar por libs gráficas (`libnspr4.so`, etc.).  
`npm run desktop:dev` já cai no modo navegador automaticamente.

## Scripts

| Script | Função |
|--------|--------|
| `desktop:prepare` | Build web + bundle da API |
| `desktop:dev` | Prepare + abre Electron |
| `desktop:dist:win` | Portable `.exe` |
| `desktop:dist:linux` | AppImage |
