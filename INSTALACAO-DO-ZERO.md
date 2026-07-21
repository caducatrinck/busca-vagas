# Instalação do zero / Setup from scratch

<p>
  <a href="#português"><strong>🇧🇷 Português</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#english"><strong>🇺🇸 English</strong></a>
</p>

Guia para quem **nunca instalou Git nem Node** e quer rodar o código (contribuição / desenvolvimento).  

Só quer **baixar o .exe / AppImage**? Use o [README](./README.md) e os [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest) — não precisa deste guia.

**macOS:** não há instalável nos Releases ainda — use o guia dedicado **[INSTALACAO-MAC.md](./INSTALACAO-MAC.md)**.

---

<a id="português"></a>

# Português

## O que você vai instalar

| Programa | Para quê |
|----------|----------|
| **Git** | Baixar o código deste projeto |
| **Node.js 22+** (vem com **npm**) | Rodar o app |

Não precisa de Docker neste guia.  
Você também precisa de uma **conta no LinkedIn** (para o cookie `li_at` no primeiro uso).

---

## 1) Abrir o terminal

### Windows

1. Pressione `Win` e digite **PowerShell**  
2. Abra **Windows PowerShell** (ou **Terminal**)

### macOS

1. `Cmd + Espaço`, digite **Terminal**, Enter

### Linux

1. Abra o app **Terminal** (Ctrl+Alt+T em muitos sistemas)

---

## 2) Instalar o Git

### Windows

1. Abra: https://git-scm.com/download/win  
2. Baixe e execute o instalador  
3. Pode deixar as opções padrão e clicar **Next** até o fim  
4. Feche e **abra de novo** o PowerShell  
5. Confira:

```bash
git --version
```

Deve aparecer algo como `git version 2.x.x`.

### macOS

```bash
xcode-select --install
```

Ou baixe em https://git-scm.com/download/mac  

Confira: `git --version`

### Linux (Debian/Ubuntu/Mint)

```bash
sudo apt update
sudo apt install -y git
git --version
```

---

## 3) Instalar o Node.js (versão 20 ou mais nova)

### Windows / macOS (mais fácil)

1. Abra: https://nodejs.org/  
2. Baixe a versão **LTS** (recomendada)  
3. Execute o instalador (padrão está ok)  
4. **Feche e abra de novo** o terminal  
5. Confira:

```bash
node --version
npm --version
```

- `node` deve ser **v20** ou superior (ex.: `v22.x.x`)  
- `npm` deve mostrar um número (ex.: `10.x.x`)

### Linux (Debian/Ubuntu) — Node 22 via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

---

## 4) Baixar o projeto

No terminal, vá para uma pasta fácil (ex.: Documentos) e clone:

### Windows (PowerShell)

```powershell
cd $HOME\Documents
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

### macOS / Linux

```bash
cd ~
mkdir -p projetos
cd projetos
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

---

## 5) Subir o app (primeira vez)

Ainda dentro da pasta `busca-vagas`:

```bash
npm run up
```

Isso:

1. Instala as dependências (pode demorar alguns minutos)  
2. Sobe a **API** e a **interface**

Deixe o terminal **aberto**. Se fechar, o app para.

| O quê | Endereço |
|-------|----------|
| Tela do app | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

Abra o endereço da tela no **Chrome**, **Edge** ou **Firefox**.

### Próximas vezes (já instalado)

```bash
cd caminho/para/busca-vagas
npm run dev
```

---

## 6) Primeiro uso — cookie do LinkedIn (obrigatório)

O app fica bloqueado até você colar o cookie.

1. Entre em https://www.linkedin.com e faça login  
2. Pressione `F12` (ou clique direito → **Inspecionar**)  
3. Aba **Application** (Chrome/Edge) ou **Armazenamento** (Firefox)  
4. **Cookies** → `https://www.linkedin.com`  
5. Copie o valor de **`li_at`** (obrigatório)  
6. Se existir **`JSESSIONID`**, copie **sem as aspas**  
7. No app: engrenagem (**Configurações**) → cole → **Salvar**

Se as buscas falharem com 401/403, o cookie expirou — repita esses passos.

---

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| `git` / `node` / `npm` não é reconhecido | Feche o terminal, abra de novo; confira se a instalação terminou |
| `node` menor que v20 | Reinstale o **LTS** em https://nodejs.org/ |
| Porta em uso / página não abre | Feche outros apps na 5173/8787 ou reinicie o PC e rode `npm run up` de novo |
| Erro de permissão no Linux | Evite `sudo npm`; use Node instalado para o seu usuário |
| Clone falhou (rede) | Confira internet; tente o clone de novo |

---

## Aviso

Scraping do LinkedIn pode violar os [Termos de Uso](https://www.linkedin.com/legal/user-agreement). Uso **pessoal / local**. Use só o **seu** cookie.

[↑ Topo](#instalação-do-zero--setup-from-scratch) · [English ↓](#english) · [README](./README.md)

---

<a id="english"></a>

# English

Guide for people who have **never installed Git or Node** — as if the computer was just set up.  
For the short technical overview, see the [README](./README.md).

## What you will install

| Tool | Why |
|------|-----|
| **Git** | Download this project |
| **Node.js 22+** (includes **npm**) | Run the app |

No Docker in this guide.  
You also need a **LinkedIn account** (for the `li_at` cookie on first use).

---

## 1) Open a terminal

### Windows

1. Press `Win`, type **PowerShell**  
2. Open **Windows PowerShell** (or **Terminal**)

### macOS

1. `Cmd + Space`, type **Terminal**, Enter

### Linux

1. Open **Terminal** (often Ctrl+Alt+T)

---

## 2) Install Git

### Windows

1. Go to https://git-scm.com/download/win  
2. Download and run the installer  
3. Keep defaults, click **Next** to the end  
4. **Close and reopen** PowerShell  
5. Check:

```bash
git --version
```

### macOS

```bash
xcode-select --install
```

Or https://git-scm.com/download/mac — then `git --version`

### Linux (Debian/Ubuntu/Mint)

```bash
sudo apt update
sudo apt install -y git
git --version
```

---

## 3) Install Node.js (20+)

### Windows / macOS (easiest)

1. https://nodejs.org/  
2. Download **LTS**  
3. Run the installer (defaults are fine)  
4. **Close and reopen** the terminal  
5. Check:

```bash
node --version
npm --version
```

`node` must be **v20+**.

### Linux (Debian/Ubuntu) — Node 22 via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

---

## 4) Download the project

### Windows (PowerShell)

```powershell
cd $HOME\Documents
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

### macOS / Linux

```bash
cd ~
mkdir -p projects
cd projects
git clone https://github.com/caducatrinck/busca-vagas.git
cd busca-vagas
```

---

## 5) Start the app (first time)

```bash
npm run up
```

Keep the terminal **open**.

| | URL |
|--|-----|
| UI | http://localhost:5173 |
| API | http://127.0.0.1:8787 |

### Next times

```bash
cd path/to/busca-vagas
npm run dev
```

---

## 6) First run — LinkedIn cookie (required)

1. Sign in at https://www.linkedin.com  
2. `F12` → **Application** / **Storage** → **Cookies** → `https://www.linkedin.com`  
3. Copy **`li_at`** (required)  
4. If **`JSESSIONID`** exists, copy it **without quotes**  
5. In the app: gear (**Settings**) → paste → **Save**

---

## Common issues

| Symptom | Fix |
|---------|-----|
| `git` / `node` / `npm` not found | Reopen the terminal; finish the installer |
| Node &lt; 20 | Reinstall **LTS** from https://nodejs.org/ |
| Page won’t load | Free ports 5173/8787 or rerun `npm run up` |
| Clone failed | Check network and try again |

## Disclaimer

Scraping LinkedIn may violate the [User Agreement](https://www.linkedin.com/legal/user-agreement). **Personal / local use only.** Use your **own** cookie.

[↑ Top](#instalação-do-zero--setup-from-scratch) · [Português ↑](#português) · [README](./README.md)
