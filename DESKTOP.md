# App desktop (Electron)

Branch: `feat/desktop-bundle`

Pacote Windows/Linux/macOS **sem instalar Git nem Node** no PC do usuário.  
O modo `npm run up` / Docker **continua existindo** — isto é só mais uma forma de distribuir.

## O que o usuário final faz

1. Baixa o executável (ex.: `BuscaVagas-*-portable.exe` no Windows)
2. Abre o arquivo
3. Cola o cookie `li_at` nas Configurações (igual ao app web)

Dados ficam em:
- Windows: `%AppData%/Busca Vagas/data/`
- Linux: `~/.config/Busca Vagas/data/`
- macOS: `~/Library/Application Support/Busca Vagas/data/`

## Desenvolvimento (esta máquina)

```bash
npm install
npm run desktop:dev
```

Gera `desktop/resources/` e tenta abrir o Electron.  
No **WSL** (sem libs gráficas), sobe o mesmo bundle no navegador em http://127.0.0.1:8787 — sem precisar do `.exe`.

## Gerar instalável / portable

```bash
# Windows (portable .exe) — ideal gerar no Windows
npm run desktop:dist:win

# Linux AppImage
npm run desktop:dist:linux

# Alvo da plataforma atual
npm run desktop:dist
```

Artefatos em `desktop/release/`.

> No WSL/Linux, o build **Windows** pode exigir Wine ou uma máquina Windows. Use `desktop:dist:linux` localmente e `desktop:dist:win` no Windows.

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
