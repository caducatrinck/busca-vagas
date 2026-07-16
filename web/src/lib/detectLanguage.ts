export type DetectedLanguage = 'pt' | 'en' | 'unknown'

const PT_MARKERS = [
  'ã',
  'õ',
  'ç',
  'á',
  'é',
  'í',
  'ó',
  'ú',
  'â',
  'ê',
  'ô',
  'você',
  'voce',
  'experiência',
  'experiencia',
  'requisitos',
  'benefício',
  'beneficio',
  'oportunidade',
  'trabalho',
  'vaga',
  'empresa',
  'conhecimentos',
  'atividades',
  'responsabilidades',
  'desejável',
  'desejavel',
  'obrigatório',
  'obrigatorio',
  'anos de',
  'formação',
  'formacao',
  'salário',
  'salario',
  'contratação',
  'contratacao',
  'para a',
  'para o',
  'com a',
  'nossas',
  'nossa',
  'estamos',
  'buscamos',
  'atuação',
  'atuacao',
]

const EN_MARKERS = [
  ' the ',
  ' and ',
  ' with ',
  ' you ',
  ' your ',
  ' we ',
  ' our ',
  ' experience',
  ' requirements',
  ' responsibility',
  ' responsibilities',
  ' looking for',
  'Join ',
  'join ',
  'years of',
  'bachelor',
  'degree',
  'salary',
  'benefits',
  'remote',
  'hybrid',
  'full-time',
  'full time',
  'must have',
  'nice to have',
  'we are',
  'you will',
  'ability to',
  'strong ',
  'preferred',
]

function scoreMarkers(text: string, markers: string[]): number {
  let score = 0
  for (const marker of markers) {
    if (marker.length <= 2) {

      let idx = 0
      while ((idx = text.indexOf(marker, idx)) !== -1) {
        score += 1.5
        idx += marker.length
      }
    } else if (text.includes(marker)) {
      score += 2
    }
  }
  return score
}

export function detectLanguage(raw: string): DetectedLanguage {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length < 24) return 'unknown'

  const lower = ` ${text.toLowerCase()} `
  const pt = scoreMarkers(lower, PT_MARKERS)
  const en = scoreMarkers(lower, EN_MARKERS)

  if (pt === 0 && en === 0) return 'unknown'
  if (pt >= en * 1.15) return 'pt'
  if (en >= pt * 1.15) return 'en'

  if (pt > en) return 'pt'
  if (en > pt) return 'en'
  return 'unknown'
}
