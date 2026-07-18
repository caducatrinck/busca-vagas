# Desenvolvimento local

Para clonar, rodar e abrir PR. Usuário final: [README](../README.md) e [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest).

## Setup

- Node 22+ (ou Docker)
- Do zero: [INSTALACAO-DO-ZERO.md](../INSTALACAO-DO-ZERO.md)

```bash
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
npm run up
```

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

```bash
npm run dev          # já instalou antes
npm run dev:api      # terminal 1
npm run dev:web      # terminal 2
npm test
npm run build
```

Dados: `api/data/store.json`

### Docker

```bash
docker compose up -d --build
docker compose down
```

Volume: `api-data`.

## Desktop

```bash
npm run desktop:dev
npm run desktop:dist:win
npm run desktop:dist:linux
```

Release: [DESKTOP.md](../DESKTOP.md)

## Screenshots do tutorial

```bash
npm run screenshots:install
npm run screenshots
```

Saída em `docs/tutorial/screenshots/`. O workflow `tutorial-screenshots` atualiza esses PNGs na `main`.
