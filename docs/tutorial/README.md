# Como baixar e usar

<p>
  <a href="./README.md"><strong>🇧🇷 Português</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="./README.en.md"><strong>🇺🇸 English</strong></a>
</p>

## Por quê usar o Busca Vagas?

O LinkedIn não avisa com confiabilidade quando entra uma vaga nova na busca que você montou. O app:

1. **Pooling** — repete a busca no intervalo que você definir (ex.: a cada 20 min), com janela curta alinhada ao pooling
2. **Bandeja** — fechar a janela não mata o app; ele continua na bandeja do sistema
3. **Notificação** — quando aparece vaga nova, o SO pode avisar (mesmo com a janela fechada)

O print abaixo é o resultado que importa no dia a dia:

![Notificação de vaga nova](./screenshots/06-notificacao.png)

---

## 1. Baixar

1. Abra [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest)
2. Baixe o arquivo da sua plataforma:
   - Windows: `BuscaVagas-*-win-x64-portable.exe`
   - Linux: `BuscaVagas-*-linux-x64.AppImage`
3. Abra o arquivo (no Linux, permita execução se o sistema pedir)

## 2. Configurar o LinkedIn

Na primeira abertura o app pede para conectar o LinkedIn. Escolha uma opção (os dados ficam só neste PC):

1. **Logar com LinkedIn** — abre o LinkedIn no app; você entra (e-mail, Google, etc.) e os cookies são capturados
2. **Configurar manualmente** — cola `li_at` e `JSESSIONID` do navegador

![Escolher como conectar](./screenshots/01-conectar-opcoes.png)

### Opção A — Logar no app

Em **Logar com LinkedIn**, use o botão para abrir a janela de login. Depois de entrar, as janelas de login devem fechar sozinhas e você volta para **Configurações** com a sessão salva.

### Opção B — Manual

![Configurar manualmente](./screenshots/01b-opcao-manual.png)

Siga o guia no app (F12 → Application → Cookies) e cole `li_at` e `JSESSIONID`.

![Campos de cookie](./screenshots/01-configuracao.png)

![Salvo](./screenshots/02-configuracao-salva.png)

## 3. Criar um monitor

**Monitor** → **+** → preencha a busca (palavras, local, janela de publicação).

![Criar monitor](./screenshots/03-criar-monitor.png)

## 4. Pooling

**Buscar agora** liga o pooling. **Pausar** desliga. Enquanto ativo, a aba mostra a contagem para a próxima rodada.

![Pooling ativo](./screenshots/04-pooling-ativo.png)

## 5. Vagas

**Vagas** → Pendentes (depois aplicadas / descartadas). Filtre por título/descrição e descarte em lote se quiser.

![Vagas](./screenshots/05-vagas-pendentes.png)

## 6. Notificação e bandeja

Com pooling ativo o app pode notificar vagas novas. Fechar a janela mantém o app na bandeja — o pooling segue.

![Notificação](./screenshots/06-notificacao.png)

![Bandeja](./screenshots/07-bandeja.png)

## Atualizar

Ao abrir, se houver versão nova no GitHub, o app pergunta se você quer baixar (pipeline de release por tag `v*`).

## Problemas comuns

| Situação | O que fazer |
|----------|-------------|
| Busca falha / 401 | Atualize o cookie em Configurações |
| Linux não abre | `chmod +x` no AppImage |
| Backup | **Exportar / Importar** no topo do app |

Contribuidores: [dev.md](../dev.md)
