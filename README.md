# Busca Vagas

App local (React + Fastify) para buscar vagas no LinkedIn e filtrar por palavras no título/descrição. Usa apenas `fetch` + `cheerio` — sem browser, sem dependências do sistema operacional.

## Cookie do LinkedIn (obrigatório)

Na primeira abertura, o app fica bloqueado até você configurar o cookie `li_at` em **Configurações** (ícone de engrenagem).

Como obter: LinkedIn logado → DevTools (`F12`) → Application / Armazenamento → Cookies → `https://www.linkedin.com` → copiar `li_at` (e opcionalmente `JSESSIONID`).

## Como rodar

### Docker (recomendado)

```bash
cp .env.example .env
docker compose up -d --build
```

- UI: http://localhost:5173  
- API: http://localhost:8787  

Abra a UI e configure o `li_at` em Configurações.

Com o compose padrão (`development`), **mudanças no código reiniciam sozinhas** (`tsx watch` + Vite HMR).

Parar: `docker compose down`

Produção (imagem otimizada, sem hot reload):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Local (npm)

```bash
cp .env.example .env
npm install

# terminal 1
npm run dev:api

# terminal 2
npm run dev:web
```

- UI: http://localhost:5173  
- API: http://127.0.0.1:8787  

## Persistência local

As vagas e configurações ficam em `api/data/store.json` (criado automaticamente, ignorado no git):

- histórico de buscas
- cookies / rate limit (Configurações)
- flag **Já apliquei**
- config do monitor (polling)

O `.env` só precisa de `API_PORT` / `API_HOST` (e opcionalmente `CORS_ORIGINS`).

## Abas

| Aba | Função |
|-----|--------|
| Monitor | Buscas (`+`), **Buscar agora** e pooling opcional por intervalo |
| Vagas | Banco local: pendentes, aplicadas e descartadas |
| Configurações | Cookies LinkedIn e limites de busca |

| Filtro | Efeito |
|--------|--------|
| Excluir no título | some a vaga se o título contém a palavra |
| Exigir no título | se a lista não estiver vazia, título precisa ter ao menos uma |
| Excluir na descrição | idem na descrição |
| Exigir na descrição | idem na descrição |

Os filtros ficam salvos no `localStorage` do browser.

## Rate limit (LinkedIn)

O LinkedIn **não publica limites fixos** — ele monitora padrão de uso (velocidade, volume, horário, repetição). Referências da comunidade para uso com conta pessoal:

| Sinal de risco | Orientação prática |
|----------------|-------------------|
| Muitas ações seguidas | ~150 ações/dia no total (visitas, buscas, cliques) |
| Abrir muitas páginas em sequência | Delays de 2,5–6s entre vagas |
| Buscas em rajada | Espaçar buscas (padrão: 30s entre cada) |
| Horários estranhos | Preferir uso em horário “normal” |

Limites configuráveis na UI (Configurações), com padrões:

| Opção | Padrão | Função |
|-------|--------|--------|
| Intervalo mínimo | 30000 ms | Espera entre buscas |
| Máx. por hora | 6 | Teto por hora |
| Máx. por dia | 30 | Teto por dia |
| Concorrência de descrições | 5 | Quantas descrições em paralelo |
| Máx. páginas | 1000 | Teto de páginas (~10 vagas cada) |

Consulte o status: `GET http://127.0.0.1:8787/rate-limit`

Se receber HTTP **429**, aguarde o tempo indicado antes de buscar de novo.

## Aviso

Scraping do LinkedIn pode violar os Termos de Uso e quebrar se a página mudar. Uso pessoal/local apenas — não publique como serviço.
