# Busca Vagas

App **local** (React + Fastify) para buscar vagas no LinkedIn, filtrar por título/descrição e acompanhar com pooling opcional.

- Sem banco externo: tudo em JSON na sua máquina  
- Sem Chromium / Puppeteer: só `fetch` + `cheerio`  
- O clone do repositório **não traz dados de ninguém** — cada instalação começa vazia  

## Requisitos

Escolha **uma** forma de rodar:

| Forma | Precisa |
|-------|---------|
| **Docker** (mais simples) | [Docker](https://docs.docker.com/get-docker/) + Docker Compose |
| **npm local** | [Node.js](https://nodejs.org/) **20+** e npm 10+ |

Também precisa de:

1. Conta no LinkedIn  
2. Cookie de sessão `li_at` (ver abaixo)  

**Não é necessário criar `.env`.** Porta e host já têm padrão (`8787` / `127.0.0.1`). Só use `.env` se quiser sobrescrever (ex.: `CORS_ORIGINS`).

## Começando do zero

```bash
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

### Opção A — Docker

```bash
docker compose up -d --build
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

Parar: `docker compose down`  
(Os dados ficam no volume Docker `api-data`.)

Produção (imagem otimizada, sem hot reload):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Opção B — npm (sem Docker)

```bash
npm run up
```

Isso instala as dependências e sobe **API + Web** juntos.

- UI: http://localhost:5173  
- API: http://127.0.0.1:8787  

Só o front/API (se já instalou antes): `npm run dev`  

Terminais separados (opcional):

```bash
npm run dev:api   # terminal 1
npm run dev:web   # terminal 2
```

## Primeiro uso (obrigatório)

1. Abra a UI. O app fica **bloqueado** até configurar o cookie.  
2. Clique na engrenagem (**Configurações**).  
3. Cole o cookie `li_at` (e, se existir, o `JSESSIONID`).  
4. Salve.  

### Como pegar o `li_at`

1. Entre no [LinkedIn](https://www.linkedin.com) no navegador  
2. Abra o DevTools (`F12`)  
3. **Application** / **Armazenamento** → **Cookies** → `https://www.linkedin.com`  
4. Copie o valor de `li_at` (obrigatório)  
5. Se existir `JSESSIONID`, copie **sem as aspas**  

Se as buscas começarem a falhar com 401/403, o cookie expirou — atualize em Configurações.

## Fluxo básico

1. Aba **Monitor** → `+` para criar uma busca  
2. Preencha a query (ex.: `Java remoto`)  
3. **Buscar agora** ou ative **pooling** (busca automática em intervalo)  
4. Aba **Vagas** → pendentes / aplicadas / descartadas  

Filtros de **descrição e idioma** são **por aba** do Monitor.  
Filtros rápidos na lista de **Vagas** (título/descrição/idioma da UI) são daquela tela.

## Persistência e backup

Tudo fica em JSON local (criado automaticamente, **não** vai para o git):

| Onde | Conteúdo |
|------|----------|
| `api/data/store.json` (npm) | Vagas, monitores, cookies, filtros, tema, rate limit |
| Volume `api-data` (Docker) | O mesmo, dentro do container |
| `api/data/backups/` | Até **10** cópias automáticas a cada alteração |

Nome dos backups: `DIA-3-MES-5-HORA15-43.json`  
Se o `store.json` corromper, a API tenta recuperar sozinha do backup mais recente.

Use **Exportar / Importar** no banner do topo para backup manual (recomendado).

Cookie fica só na UI / `store.json` — **não** use `.env` para isso.

## Rate limit

O LinkedIn **não publica** um limite fixo de buscas de vagas. O app:

1. Respeita um **intervalo mínimo** entre buscas (anti-spam local; padrão 5s; `0` = off)  
2. Se o LinkedIn responder **HTTP 429** / **999**, pausa usando o `Retry-After` quando existir  
3. Tetos **por hora/dia** são **opcionais** (padrão `0` = desligado)  

Status: `GET http://127.0.0.1:8787/rate-limit`

## Scripts úteis

```bash
npm run up           # install + sobe API e Web (primeira vez / dia a dia)
npm run dev          # sobe API + Web (sem reinstalar)
npm run build        # build web + api
npm test             # testes
npm run start:api    # API compilada (após build)
npm run preview:web  # preview do front (após build)
```

## Aviso

Scraping do LinkedIn pode violar os [Termos de Uso](https://www.linkedin.com/legal/user-agreement) e quebrar se a página mudar. Uso **pessoal / local**. Não publique como serviço compartilhado. Cada pessoa usa o **próprio** cookie e assume o risco da própria conta.
