import { FilterTags } from '../../components/FilterTags'
import { LanguageDropdown } from '../../components/LanguageDropdown'
import { useI18n } from '../../i18n'
import type {
  DescriptionLanguage,
  JobFilters,
  SearchForm,
  WordFilterKey,
} from '../../lib/types'
import { Alert, Field } from '../../ui'

type Props = {
  draft: SearchForm
  filters: JobFilters
  onDraftChange: (next: SearchForm) => void
  onLanguageChange: (value: DescriptionLanguage) => void
  onAddWord: (key: WordFilterKey, word: string) => void
  onRemoveWord: (key: WordFilterKey, word: string) => void
}

export function MonitorDescriptionSection({
  draft,
  filters,
  onDraftChange,
  onLanguageChange,
  onAddWord,
  onRemoveWord,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="search-panel__description">
      <div className="search-panel__form">
        <Field label={t('desc.language')}>
          <LanguageDropdown
            fullWidth
            value={filters.language}
            onChange={onLanguageChange}
          />
        </Field>
      </div>

      <label className="search-panel__check">
        <input
          type="checkbox"
          checked={draft.fetchDescriptions}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              fetchDescriptions: e.target.checked,
            })
          }
        />
        <span>{t('desc.fetch')}</span>
      </label>

      {filters.language && !draft.fetchDescriptions ? (
        <Alert>{t('desc.langAlert')}</Alert>
      ) : null}

      {draft.fetchDescriptions ? (
        <>
          <Alert>{t('desc.fetchAlert')}</Alert>
          <FilterTags
            label={t('desc.exclude')}
            hint={t('desc.excludeHint')}
            words={filters.excludeDescription}
            filterKey="excludeDescription"
            onAdd={onAddWord}
            onRemove={onRemoveWord}
            tone="exclude"
          />
          <FilterTags
            label={t('desc.include')}
            hint={t('desc.includeHint')}
            words={filters.includeDescription}
            filterKey="includeDescription"
            onAdd={onAddWord}
            onRemove={onRemoveWord}
            tone="include"
          />
        </>
      ) : null}
    </div>
  )
}
