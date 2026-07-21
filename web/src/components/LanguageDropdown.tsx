import type { DescriptionLanguage } from '../lib/types'
import { useI18n } from '../i18n'
import { Select } from '../ui'

type Props = {
  value: DescriptionLanguage
  onChange: (value: DescriptionLanguage) => void
  fullWidth?: boolean
  id?: string
  'aria-label'?: string
  /** Texto no trigger quando value é vazio (ex.: "Idioma"). */
  placeholder?: string
}

export function LanguageDropdown({
  value,
  onChange,
  fullWidth = false,
  id,
  'aria-label': ariaLabel,
  placeholder,
}: Props) {
  const { t } = useI18n()
  const options = [
    { value: '' as const, label: t('lang.any') },
    { value: 'pt' as const, label: t('lang.pt') },
    { value: 'en' as const, label: t('lang.en') },
  ]

  return (
    <Select
      value={value}
      options={options}
      onChange={onChange}
      fullWidth={fullWidth}
      id={id}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder ?? t('list.language')}
    />
  )
}
