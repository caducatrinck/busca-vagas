import type { DescriptionLanguage } from '../lib/types'
import { Select } from '../ui'

const LANGUAGE_OPTIONS: Array<{ value: DescriptionLanguage; label: string }> =
  [
    { value: '', label: 'Qualquer' },
    { value: 'pt', label: 'Português' },
    { value: 'en', label: 'Inglês' },
  ]

type Props = {
  value: DescriptionLanguage
  onChange: (value: DescriptionLanguage) => void
  fullWidth?: boolean
  id?: string
  'aria-label'?: string
}

export function LanguageDropdown({
  value,
  onChange,
  fullWidth = false,
  id,
  'aria-label': ariaLabel = 'Filtrar por idioma',
}: Props) {
  return (
    <Select
      value={value}
      options={LANGUAGE_OPTIONS}
      onChange={onChange}
      fullWidth={fullWidth}
      id={id}
      aria-label={ariaLabel}
    />
  )
}
