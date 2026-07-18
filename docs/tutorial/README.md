# Como baixar e usar

## 1. Baixar

1. Abra [Releases](https://github.com/caducatrinck/busca-vagas/releases/latest)
2. Baixe o arquivo da sua plataforma:
   - Windows: `BuscaVagas-*-win-x64-portable.exe`
   - Linux: `BuscaVagas-*-linux-x64.AppImage`
3. Abra o arquivo (no Linux, permita execução se o sistema pedir)

## 2. Configurar

Na primeira abertura, use **Configurações** e siga o que o próprio app mostrar.

![Configuração](./screenshots/01-configuracao.png)

![Salvo](./screenshots/02-configuracao-salva.png)

## 3. Criar um monitor

**Monitor** → **+** → preencha a busca.

![Criar monitor](./screenshots/03-criar-monitor.png)

## 4. Pooling

**Buscar agora** liga o pooling. **Pausar** desliga.

![Pooling ativo](./screenshots/04-pooling-ativo.png)

## 5. Vagas

**Vagas** → Pendentes (depois aplicadas / descartadas).

![Vagas](./screenshots/05-vagas-pendentes.png)

## 6. Notificação e bandeja

Com pooling ativo o app pode notificar vagas novas. Fechar a janela mantém o app na bandeja.

![Notificação](./screenshots/06-notificacao.png)

![Bandeja](./screenshots/07-bandeja.png)

## Atualizar

Ao abrir, se houver versão nova no GitHub, o app pergunta se você quer baixar.

## Problemas comuns

| Situação | O que fazer |
|----------|-------------|
| Busca falha / 401 | Atualize o cookie em Configurações |
| Linux não abre | `chmod +x` no AppImage |
| Backup | **Exportar / Importar** no topo do app |

Contribuidores: [dev.md](../dev.md)
