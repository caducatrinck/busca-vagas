# Instalação no Mac (código-fonte)

Guia **só para macOS**: baixar o repositório, instalar Git/Node e rodar o Busca Vagas.

Hoje os [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest) têm instalável para **Windows** e **Linux**. No Mac, a forma suportada de usar o app é **rodar a partir do código** (este guia).

Windows / Linux / visão geral: [INSTALACAO-DO-ZERO.md](./INSTALACAO-DO-ZERO.md)  
Só quer contribuir / ver comandos de dev: [docs/dev.md](./docs/dev.md)

---

## O que você precisa

| Programa | Para quê |
|----------|----------|
| **Git** | Clonar o repositório |
| **Node.js 22+** (vem com **npm**) | Instalar e subir o app |
| Conta no **LinkedIn** | Cookie `li_at` no primeiro uso |

Não usa Docker neste guia.

---

## 1) Abrir o Terminal

`Cmd + Espaço` → digite **Terminal** → Enter.

---

## 2) Instalar Git e Node (Homebrew — recomendado)

Se ainda não tiver o [Homebrew](https://brew.sh):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Siga o que o instalador pedir (no Mac Apple Silicon ele costuma pedir para adicionar o `brew` ao `PATH`).

Depois:

```bash
brew install git node@22
```

Se o `brew` sugerir um `echo` / `PATH` para o `node@22`, execute esses comandos e **abra um Terminal novo**.

Confira:

```bash
git --version
node --version
npm --version
```

- `node` deve ser **v22** ou superior  
- Se `node` não for encontrado: feche o Terminal, abra de novo e teste outra vez

### Alternativa sem Homebrew

1. Git: `xcode-select --install` (ou https://git-scm.com/download/mac)  
2. Node LTS: https://nodejs.org/ → instalador `.pkg` → feche e abra o Terminal de novo

---

## 3) Clonar o projeto

```bash
cd ~
mkdir -p projetos
cd projetos
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

---

## 4) Subir o app

### Opção A — navegador (mais simples)

```bash
npm run up
```

Na primeira vez isso instala as dependências (pode demorar) e sobe API + interface.

| O quê | Endereço |
|-------|----------|
| App | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

Abra o endereço do app no **Safari**, **Chrome** ou **Firefox**.

> **Importante:** o Terminal precisa **ficar aberto** o tempo todo.  
> Se você fechar a janela do Terminal (ou apertar `Ctrl+C`), a API e a interface **param** e o app deixa de funcionar no navegador.

### Próximas vezes:

```bash
cd ~/projetos/busca-vagas
npm run dev
```

Mesma regra: Terminal aberto = app no ar; Terminal fechado = app desliga.

### Opção B — janela Electron (desktop)

```bash
cd ~/projetos/busca-vagas
npm install
npm run desktop:dev
```

Isso empacota a UI/API e tenta abrir o Electron.  
O Terminal também precisa **continuar aberto** enquanto o Electron estiver em uso — fechar o Terminal (ou `Ctrl+C`) encerra o processo.

Se o macOS bloquear a abertura (“não é possível verificar o desenvolvedor”):

1. **Ajustes do Sistema** → **Privacidade e Segurança**  
2. Em “foi bloqueado…”, clique **Abrir mesmo assim**  
   (ou clique com o botão direito no app → **Abrir**)

---

## 5) Primeiro uso — cookie LinkedIn

O app fica bloqueado até salvar o `li_at`:

1. Entre em https://www.linkedin.com e faça login  
2. `Cmd + Option + I` (DevTools) ou clique direito → **Inspecionar**  
3. Aba **Application** / **Storage** → **Cookies** → `https://www.linkedin.com`  
4. Copie **`li_at`** (obrigatório)  
5. Se existir **`JSESSIONID`**, copie **sem as aspas**  
6. No app: engrenagem (**Configurações**) → cole → **Salvar**

Detalhes e prints: [docs/tutorial](./docs/tutorial/README.md)

---

## 6) (Opcional) Gerar um `.dmg` local

Só se quiser um pacote desktop na sua máquina (não substitui um Release oficial):

```bash
cd ~/projetos/busca-vagas
npm install
npm run desktop:prepare
npm run dist -w desktop -- --mac dmg
```

O arquivo costuma sair em `desktop/release/` (ex.: `BuscaVagas-*-mac.dmg`).

> Assinatura / notarização da Apple **não** estão configuradas neste projeto. No seu Mac o `.dmg` pode pedir “Abrir mesmo assim” em Privacidade e Segurança.

---

## Problemas comuns

| Sintoma | O que tentar |
|---------|----------------|
| App “some” / não carrega mais | Você fechou o Terminal ou deu `Ctrl+C` — rode `npm run dev` de novo e deixe o Terminal aberto |
| `command not found: brew` / `node` | Feche o Terminal, abra de novo; confira o `PATH` que o Homebrew mostrou na instalação |
| `npm run up` falha em `engines` | Precisa de Node **≥ 22.12** (`node --version`) |
| Porta 5173 ou 8787 em uso | Feche outro `npm run dev` / Electron; ou reinicie o Mac |
| Electron não abre | Use a **Opção A** (navegador) — o app funciona igual em http://localhost:5173 |
| Cookie / LinkedIn | Atualize o `li_at` nas Configurações se as buscas falharem com 401/403 |

---

## Onde ficam os dados

Rodando pelo código (`npm run dev` / `desktop:dev`), os dados ficam em JSON local da API (`api/data/` no projeto, conforme o modo).  
Use **Exportar / Importar** no topo do app para backup.

No app desktop empacotado, o padrão do projeto é algo como:

`~/Library/Application Support/Busca Vagas/data/`

---

## Aviso

Uso **pessoal e local**. Automatizar consultas com a sua sessão LinkedIn conflita com o Contrato do Usuário do LinkedIn — leia o aviso no [README](./README.md).
