# Busca Vagas

<p>
  <a href="#português"><strong>🇧🇷 Português</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#english"><strong>🇺🇸 English</strong></a>
</p>

Nunca instalou Git/Node? Comece pelo guia **[Instalação do zero](./INSTALACAO-DO-ZERO.md)**.  
Never installed Git/Node? Start with **[Setup from scratch](./INSTALACAO-DO-ZERO.md)**.

Quer um **.exe** / AppImage sem instalar Node? Veja **[DESKTOP.md](./DESKTOP.md)** (branch desktop).  
Want a portable desktop app? See **[DESKTOP.md](./DESKTOP.md)**.

---

<a id="português"></a>

# Português

App **local** (React + Fastify) para buscar vagas no LinkedIn, filtrar por título/descrição e acompanhar com pooling opcional.

- Sem banco externo: tudo em JSON na sua máquina  
- Sem Chromium / Puppeteer: só `fetch` + `cheerio`  
- O clone do repositório **não traz dados de ninguém** — cada instalação começa vazia  

**Não é necessário criar `.env`.** Porta e host já têm padrão (`8787` / `127.0.0.1`).

Em ambos os casos você precisa de:

1. Conta no LinkedIn  
2. Cookie de sessão `li_at` ([como pegar](#como-pegar-o-li_at))  

```bash
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

Depois escolha **sem Docker** ou **com Docker** (abra a seção):

<details>
<summary><strong>Sem Docker (npm)</strong> — Node.js 20+</summary>

<br>

```bash
npm run up
```

Isso instala as dependências e sobe **API + Web**.

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

Já instalou antes? Use só `npm run dev`.

Terminais separados (opcional):

```bash
npm run dev:api   # terminal 1
npm run dev:web   # terminal 2
```

Outros scripts:

```bash
npm run build   # build web + api
npm test        # testes
```

**Dados:** `api/data/store.json` e backups em `api/data/backups/` (na pasta do projeto).

</details>

<details>
<summary><strong>Com Docker</strong> — Docker + Compose</summary>

<br>

```bash
docker compose up -d --build
```

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://localhost:8787 |

Parar:

```bash
docker compose down
```

**Dados:** volume Docker `api-data` (não é a pasta `api/data` do host).

</details>

## Primeiro uso (obrigatório)

1. Abra a UI. O app fica **bloqueado** até configurar o cookie.  
2. Clique na engrenagem (**Configurações**).  
3. Cole o cookie `li_at` (e, se existir, o `JSESSIONID`).  
4. Salve.  

### Como pegar o `li_at`

1. Entre no [LinkedIn](https://www.linkedin.com) no navegador  
2. Abra o DevTools (`F12`)  
3. **Application** / **Storage** → **Cookies** → `https://www.linkedin.com`  
4. Copie o valor de `li_at` (obrigatório)  
5. Se existir `JSESSIONID`, copie **sem as aspas**  

Se as buscas falharem com 401/403, o cookie expirou — atualize em Configurações.

## Fluxo básico

1. Aba **Monitor** → `+` para criar uma busca  
2. Preencha a query (ex.: `Java remoto`)  
3. **Buscar agora** ou ative **pooling**  
4. Aba **Vagas** → pendentes / aplicadas / descartadas  

Filtros de **descrição e idioma** são **por aba** do Monitor.

## Persistência e backup

| Sem Docker | Com Docker |
|------------|------------|
| `api/data/store.json` | volume `api-data` |
| `api/data/backups/` (máx. 10) | backups dentro do volume |

Nome dos backups: `DIA-3-MES-5-HORA15-43.json`  
Use **Exportar / Importar** no banner do topo para backup manual.

## Rate limit

1. Intervalo mínimo entre buscas (padrão 30s; `0` = off)  
2. Pausas reais do LinkedIn (**HTTP 429** / **999** + `Retry-After`)  
3. Tetos por hora/dia (padrão `30` / `500`; `0` = off)  

Status: `GET http://127.0.0.1:8787/rate-limit`

## Aviso

Scraping do LinkedIn pode violar os [Termos de Uso](https://www.linkedin.com/legal/user-agreement). Uso **pessoal / local**. Cada pessoa usa o **próprio** cookie e assume o risco da própria conta.

[↑ Voltar ao topo](#busca-vagas) · [English ↓](#english)

---

<a id="english"></a>

# English

**Busca Vagas** is a **local-only** LinkedIn job search helper (React + Fastify).

- No external database — everything is JSON on your machine  
- No Chromium / Puppeteer — just `fetch` + `cheerio`  
- An empty clone — **no one else’s data** in the repo  

**No `.env` required.** Defaults: port `8787`, host `127.0.0.1`.

You always need:

1. A LinkedIn account  
2. Session cookie `li_at` ([how to get it](#how-to-get-li_at))  

```bash
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

Then pick **without Docker** or **with Docker** (expand a section):

<details>
<summary><strong>Without Docker (npm)</strong> — Node.js 20+</summary>

<br>

```bash
npm run up
```

Installs dependencies and starts **API + Web**.

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

Already installed? Use `npm run dev` only.

Separate terminals (optional):

```bash
npm run dev:api   # terminal 1
npm run dev:web   # terminal 2
```

Other scripts:

```bash
npm run build   # build web + api
npm test        # tests
```

**Data:** `api/data/store.json` and backups under `api/data/backups/` (in the project folder).

</details>

<details>
<summary><strong>With Docker</strong> — Docker + Compose</summary>

<br>

```bash
docker compose up -d --build
```

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://localhost:8787 |

Stop:

```bash
docker compose down
```

**Data:** Docker volume `api-data` (not the host `api/data` folder).

</details>

## First run (required)

1. Open the UI — the app stays **locked** until the cookie is set.  
2. Click the gear (**Settings**).  
3. Paste `li_at` (and `JSESSIONID` if present).  
4. Save.  

### How to get `li_at`

1. Sign in to [LinkedIn](https://www.linkedin.com)  
2. Open DevTools (`F12`)  
3. **Application** / **Storage** → **Cookies** → `https://www.linkedin.com`  
4. Copy `li_at` (required)  
5. If `JSESSIONID` exists, copy it **without quotes**  

If searches fail with 401/403, the cookie expired — update it in Settings.

## Basic flow

1. **Monitor** tab → `+` to create a search  
2. Fill the query (e.g. `Java remote`)  
3. **Search now** or enable **pooling**  
4. **Jobs** tab → pending / applied / discarded  

**Description and language** filters are **per Monitor tab**.

## Persistence and backups

| Without Docker | With Docker |
|----------------|-------------|
| `api/data/store.json` | volume `api-data` |
| `api/data/backups/` (max 10) | backups inside the volume |

Backup names: `DIA-3-MES-5-HORA15-43.json`  
Use **Export / Import** in the top banner for manual backups.

## Rate limit

1. Minimum interval between searches (default 30s; `0` = off)  
2. Real LinkedIn pauses (**HTTP 429** / **999** + `Retry-After`)  
3. Hourly/daily caps (default `30` / `500`; `0` = off)  

Status: `GET http://127.0.0.1:8787/rate-limit`

## Disclaimer

Scraping LinkedIn may violate the [User Agreement](https://www.linkedin.com/legal/user-agreement). **Personal / local use only.** Everyone uses their **own** cookie and account at their own risk.

[↑ Back to top](#busca-vagas) · [Português ↑](#português)
