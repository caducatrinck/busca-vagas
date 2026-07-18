import type { Locale } from './types'

const pt = {
  'app.name': 'Busca Vagas',
  'nav.monitor': 'Monitor',
  'nav.jobs': 'Vagas',
  'nav.settings': 'Configurações',
  'nav.sections': 'Seções',
  'nav.theme.light': 'Modo claro',
  'nav.theme.dark': 'Modo escuro',
  'nav.theme.toLight': 'Ativar modo claro',
  'nav.theme.toDark': 'Ativar modo escuro',
  'nav.lang.toEn': 'Switch to English',
  'nav.lang.toPt': 'Mudar para português',
  'nav.poolingActive': 'Pooling ativo',
  'nav.searchingNow': 'Buscando vagas agora',
  'nav.newJobsPooling': 'Vagas novas no pooling',
  'nav.pending': 'Pendentes',
  'nav.lockCookie':
    'Informe o cookie li_at em Configurações para liberar o app.',
  'nav.monitorsActive': '{n} ativo(s)',
  'nav.monitorsNone': 'Nenhum ativo',
  'nav.jobsCount': '{n} salva(s)',
  'nav.jobsEmpty': 'Vazio',

  'jobs.lead': 'Histórico local: pendentes, aplicadas e descartadas.',
  'jobs.tabs': 'Status das vagas',
  'jobs.pending': 'Pendentes',
  'jobs.applied': 'Aplicadas',
  'jobs.discarded': 'Descartadas',
  'jobs.refresh': 'Atualizar',
  'jobs.clearApplied': 'Limpar aplicadas',
  'jobs.clearDiscarded': 'Limpar descartadas',
  'jobs.clearing': 'Limpando…',
  'jobs.clearConfirm':
    'Remover permanentemente {n} vaga(s) {label} do JSON local? Essa ação não pode ser desfeita.',
  'jobs.labelApplied': 'aplicadas',
  'jobs.labelDiscarded': 'descartadas',

  'jobsTitle.viewed': 'Vagas pendentes',
  'jobsEmpty.viewed': 'Nenhuma vaga pendente',
  'jobsHint.viewed':
    'Busque no Monitor. Use Descartar ou Já apliquei nos cards.',
  'jobsTitle.applied': 'Vagas aplicadas',
  'jobsEmpty.applied': 'Nenhuma vaga aplicada',
  'jobsHint.applied':
    'Marque “Já apliquei” em um card para movê-la para cá.',
  'jobsTitle.discarded': 'Vagas descartadas',
  'jobsEmpty.discarded': 'Nenhuma vaga descartada',
  'jobsHint.discarded':
    'Descartadas somem do Monitor. Você pode restaurá-las aqui.',

  'monitor.emptyTitle': 'Sem vagas neste monitor',
  'monitor.emptyHint':
    'Crie uma aba com +, configure a busca e clique em Buscar agora (o pooling liga sozinho).',
  'monitor.emptyFilteredTitle': 'Vagas ocultas pelo filtro de título',
  'monitor.emptySearchTitle': 'Nenhuma vaga nesta busca',
  'monitor.emptyFilteredHint':
    'Há {n} vaga(s) neste monitor, mas nenhuma tem todas as palavras “{q}” no título (e tags). Tente uma busca mais ampla ou revise os filtros.',
  'monitor.emptyFilteredHintNoQuery':
    'Há {n} vaga(s) ocultas pelos filtros deste monitor.',
  'monitor.title': 'Monitor: {name}',
  'monitor.lead':
    'Cada aba é um monitor. Buscar agora liga o pooling; Pausar desliga.',

  'search.query': 'Palavras de busca',
  'search.queryPh': 'Ex: React TypeScript',
  'search.location': 'Localização (opcional)',
  'search.locationPh': 'Ex: Remoto, São Paulo',
  'search.posted': 'Publicadas em',
  'search.postedPoolingHint':
    'Pooling automático usa só essa janela curta. Pause para buscar com 24h/semana/mês.',
  'search.postedPoolingAria': 'Publicadas em (definido pelo pooling)',
  'search.poolingWindow': 'Últimos {n} min',
  'search.searching': 'Buscando…',
  'search.pause': 'Pausar',
  'search.run': 'Buscar agora',
  'search.titleSearching': 'Busca em andamento',
  'search.titlePause': 'Pausa o pooling automático',
  'search.titleRun': 'Busca agora e ativa o pooling automático',
  'search.posted.30m': 'Últimos 30 minutos',
  'search.posted.1h': 'Última hora',
  'search.posted.10h': 'Últimas 10 horas',
  'search.posted.24h': 'Últimas 24 horas',
  'search.posted.week': 'Última semana',
  'search.posted.month': 'Último mês',

  'poll.interval': 'Intervalo (min)',
  'poll.intervalAria': 'Intervalo do pooling em minutos',

  'desc.title': 'Filtros da descrição',
  'desc.fetch': 'Buscar e filtrar pela descrição',
  'desc.include': 'Incluir (descrição)',
  'desc.exclude': 'Excluir (descrição)',
  'desc.language': 'Idioma da descrição',

  'list.loading': 'Carregando…',
  'list.filterTitle': 'Filtrar título…',
  'list.filterDesc': 'Filtrar descrição…',
  'list.language': 'Idioma',
  'list.discardAll': 'Descartar todas',
  'list.discarding': 'Descartando…',
  'list.noFilter': 'Nenhuma vaga neste filtro',
  'list.adjustFilters': 'Ajuste o título/descrição ou limpe os filtros acima.',
  'list.hiddenByFilters': '{n} vaga(s) ocultadas pelos filtros.',
  'list.jobs': '{n} vaga',
  'list.jobs_plural': '{n} vagas',
  'list.cancel': 'Cancelar busca',

  'card.discard': 'Descartar',
  'card.apply': 'Já apliquei',
  'card.restore': 'Restaurar',
  'card.open': 'Abrir no LinkedIn',
  'card.new': 'Nova',

  'settings.title': 'Cookies e limites',
  'settings.setupTitle': 'Configure para continuar',
  'settings.setupLead':
    'Cole o cookie li_at do LinkedIn para liberar buscas e o monitor.',
  'settings.howto':
    'No Chrome: F12 → Application → Cookies → selecione https://www.linkedin.com.',
  'settings.liAt': 'Cookie li_at',
  'settings.jsession': 'Cookie JSESSIONID',
  'settings.maxPages': 'Máx. páginas por busca',
  'settings.cooldown': 'Pausa entre buscas (s)',
  'settings.maxHour': 'Máx. buscas / hora',
  'settings.maxDay': 'Máx. buscas / dia',
  'settings.concurrency': 'Detalhes em paralelo',
  'settings.save': 'Salvar',
  'settings.saving': 'Salvando…',

  'session.expired': 'Sessão LinkedIn expirada',
  'session.incomplete': 'Cookie LinkedIn incompleto',
  'session.missing': 'LinkedIn não configurado',
  'session.unknown': 'Problema na sessão LinkedIn',
  'session.openSettings': 'Abrir Configurações',
  'session.recheck': 'Verificar de novo',
  'session.checking': 'Verificando…',

  'data.export': 'Exportar',
  'data.import': 'Importar',
  'data.exported': 'Baixado',
  'data.imported': 'Importado',
  'data.failed': 'Falhou',
  'data.importConfirm':
    'Importar vai substituir vagas e monitores atuais pelos do arquivo. Continuar?',
  'data.linkedinTitle': 'Cuidado com o LinkedIn',
  'data.linkedinBody':
    'Use com moderação. Intervalos curtos e muitas buscas aumentam o risco de bloqueio.',

  'notify.one': '1 vaga nova no pooling',
  'notify.many': '{n} vagas novas no pooling',
  'notify.body': '{name} — clique para abrir Pendentes',

  'update.availableTitle': 'Nova versão {version}',
  'update.availableBody':
    'Você tem {current}. Há um download novo. Quer atualizar agora?',
  'update.yes': 'Sim, atualizar',
  'update.no': 'Agora não',
  'update.downloading': 'Baixando atualização…',
  'update.progress': '{n}%',
  'update.cancel': 'Cancelar',
  'update.readyTitle': 'Download concluído',
  'update.readyBody':
    'Feche e abra o arquivo novo, ou reinicie pelo botão abaixo.',
  'update.relaunch': 'Abrir nova versão',
  'update.openFolder': 'Abrir pasta',
  'update.later': 'Depois',
  'update.errorTitle': 'Falha na atualização',
  'update.errorBody': 'Não foi possível baixar a nova versão.',
  'update.retry': 'Tentar de novo',
  'update.dismiss': 'Fechar',

  'lang.any': 'Qualquer',
  'lang.pt': 'Português',
  'lang.en': 'Inglês',
} as const

type MessageKey = keyof typeof pt

const en: Record<MessageKey, string> = {
  'app.name': 'Busca Vagas',
  'nav.monitor': 'Monitor',
  'nav.jobs': 'Jobs',
  'nav.settings': 'Settings',
  'nav.sections': 'Sections',
  'nav.theme.light': 'Light mode',
  'nav.theme.dark': 'Dark mode',
  'nav.theme.toLight': 'Switch to light mode',
  'nav.theme.toDark': 'Switch to dark mode',
  'nav.lang.toEn': 'Switch to English',
  'nav.lang.toPt': 'Switch to Portuguese',
  'nav.poolingActive': 'Pooling active',
  'nav.searchingNow': 'Searching jobs now',
  'nav.newJobsPooling': 'New jobs from pooling',
  'nav.pending': 'Pending',
  'nav.lockCookie':
    'Add the li_at cookie in Settings to unlock the app.',
  'nav.monitorsActive': '{n} active',
  'nav.monitorsNone': 'None active',
  'nav.jobsCount': '{n} saved',
  'nav.jobsEmpty': 'Empty',

  'jobs.lead': 'Local history: pending, applied, and discarded.',
  'jobs.tabs': 'Job status',
  'jobs.pending': 'Pending',
  'jobs.applied': 'Applied',
  'jobs.discarded': 'Discarded',
  'jobs.refresh': 'Refresh',
  'jobs.clearApplied': 'Clear applied',
  'jobs.clearDiscarded': 'Clear discarded',
  'jobs.clearing': 'Clearing…',
  'jobs.clearConfirm':
    'Permanently remove {n} {label} job(s) from local JSON? This cannot be undone.',
  'jobs.labelApplied': 'applied',
  'jobs.labelDiscarded': 'discarded',

  'jobsTitle.viewed': 'Pending jobs',
  'jobsEmpty.viewed': 'No pending jobs',
  'jobsHint.viewed':
    'Search in Monitor. Use Discard or Applied on cards.',
  'jobsTitle.applied': 'Applied jobs',
  'jobsEmpty.applied': 'No applied jobs',
  'jobsHint.applied': 'Mark “Applied” on a card to move it here.',
  'jobsTitle.discarded': 'Discarded jobs',
  'jobsEmpty.discarded': 'No discarded jobs',
  'jobsHint.discarded':
    'Discarded jobs leave Monitor. You can restore them here.',

  'monitor.emptyTitle': 'No jobs in this monitor',
  'monitor.emptyHint':
    'Create a tab with +, set up the search, and click Search now (pooling turns on automatically).',
  'monitor.emptyFilteredTitle': 'Jobs hidden by title filter',
  'monitor.emptySearchTitle': 'No jobs in this search',
  'monitor.emptyFilteredHint':
    'There are {n} job(s) in this monitor, but none have all words “{q}” in the title (and tags). Try a broader query or review filters.',
  'monitor.emptyFilteredHintNoQuery':
    'There are {n} job(s) hidden by this monitor’s filters.',
  'monitor.title': 'Monitor: {name}',
  'monitor.lead':
    'Each tab is a monitor. Search now enables pooling; Pause disables it.',

  'search.query': 'Search keywords',
  'search.queryPh': 'E.g. React TypeScript',
  'search.location': 'Location (optional)',
  'search.locationPh': 'E.g. Remote, São Paulo',
  'search.posted': 'Posted within',
  'search.postedPoolingHint':
    'Auto pooling uses only this short window. Pause to search with 24h/week/month.',
  'search.postedPoolingAria': 'Posted within (set by pooling)',
  'search.poolingWindow': 'Last {n} min',
  'search.searching': 'Searching…',
  'search.pause': 'Pause',
  'search.run': 'Search now',
  'search.titleSearching': 'Search in progress',
  'search.titlePause': 'Pause automatic pooling',
  'search.titleRun': 'Search now and enable automatic pooling',
  'search.posted.30m': 'Last 30 minutes',
  'search.posted.1h': 'Last hour',
  'search.posted.10h': 'Last 10 hours',
  'search.posted.24h': 'Last 24 hours',
  'search.posted.week': 'Last week',
  'search.posted.month': 'Last month',

  'poll.interval': 'Interval (min)',
  'poll.intervalAria': 'Pooling interval in minutes',

  'desc.title': 'Description filters',
  'desc.fetch': 'Fetch and filter by description',
  'desc.include': 'Include (description)',
  'desc.exclude': 'Exclude (description)',
  'desc.language': 'Description language',

  'list.loading': 'Loading…',
  'list.filterTitle': 'Filter title…',
  'list.filterDesc': 'Filter description…',
  'list.language': 'Language',
  'list.discardAll': 'Discard all',
  'list.discarding': 'Discarding…',
  'list.noFilter': 'No jobs in this filter',
  'list.adjustFilters': 'Adjust title/description or clear filters above.',
  'list.hiddenByFilters': '{n} job(s) hidden by filters.',
  'list.jobs': '{n} job',
  'list.jobs_plural': '{n} jobs',
  'list.cancel': 'Cancel search',

  'card.discard': 'Discard',
  'card.apply': 'Applied',
  'card.restore': 'Restore',
  'card.open': 'Open on LinkedIn',
  'card.new': 'New',

  'settings.title': 'Cookies and limits',
  'settings.setupTitle': 'Configure to continue',
  'settings.setupLead':
    'Paste the LinkedIn li_at cookie to unlock searches and the monitor.',
  'settings.howto':
    'In Chrome: F12 → Application → Cookies → select https://www.linkedin.com.',
  'settings.liAt': 'li_at cookie',
  'settings.jsession': 'JSESSIONID cookie',
  'settings.maxPages': 'Max pages per search',
  'settings.cooldown': 'Pause between searches (s)',
  'settings.maxHour': 'Max searches / hour',
  'settings.maxDay': 'Max searches / day',
  'settings.concurrency': 'Parallel details',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',

  'session.expired': 'LinkedIn session expired',
  'session.incomplete': 'Incomplete LinkedIn cookie',
  'session.missing': 'LinkedIn not configured',
  'session.unknown': 'LinkedIn session issue',
  'session.openSettings': 'Open Settings',
  'session.recheck': 'Check again',
  'session.checking': 'Checking…',

  'data.export': 'Export',
  'data.import': 'Import',
  'data.exported': 'Downloaded',
  'data.imported': 'Imported',
  'data.failed': 'Failed',
  'data.importConfirm':
    'Import will replace current jobs and monitors with the file. Continue?',
  'data.linkedinTitle': 'Be careful with LinkedIn',
  'data.linkedinBody':
    'Use moderately. Short intervals and many searches increase block risk.',

  'notify.one': '1 new job from pooling',
  'notify.many': '{n} new jobs from pooling',
  'notify.body': '{name} — click to open Pending',

  'update.availableTitle': 'New version {version}',
  'update.availableBody':
    'You have {current}. A new download is available. Update now?',
  'update.yes': 'Yes, update',
  'update.no': 'Not now',
  'update.downloading': 'Downloading update…',
  'update.progress': '{n}%',
  'update.cancel': 'Cancel',
  'update.readyTitle': 'Download complete',
  'update.readyBody':
    'Close and open the new file, or relaunch with the button below.',
  'update.relaunch': 'Open new version',
  'update.openFolder': 'Open folder',
  'update.later': 'Later',
  'update.errorTitle': 'Update failed',
  'update.errorBody': 'Could not download the new version.',
  'update.retry': 'Try again',
  'update.dismiss': 'Dismiss',

  'lang.any': 'Any',
  'lang.pt': 'Portuguese',
  'lang.en': 'English',
}

const tables: Record<Locale, Record<MessageKey, string>> = { pt, en }

export type { MessageKey }

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = tables[locale][key] ?? tables.pt[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}
