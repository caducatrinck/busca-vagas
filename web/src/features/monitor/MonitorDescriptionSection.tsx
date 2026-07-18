import { FilterTags } from '../../components/FilterTags'
import { LanguageDropdown } from '../../components/LanguageDropdown'
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
  return (
    <div className="search-panel__description">
      <div className="search-panel__form">
        <Field label="Idioma">
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
        <span>Buscar e filtrar pela descrição</span>
      </label>

      {filters.language && !draft.fetchDescriptions ? (
        <Alert>
          Para filtrar por idioma com precisão, ative a busca pela descrição.
        </Alert>
      ) : null}

      {draft.fetchDescriptions ? (
        <>
          <Alert>
            Ativado: primeiro lista todas as vagas; depois só busca descrição
            das que ainda não têm no banco (as já lidas são reaproveitadas).
          </Alert>
          <FilterTags
            label="Excluir na descrição"
            hint="Se a descrição tiver uma destas palavras, some."
            words={filters.excludeDescription}
            filterKey="excludeDescription"
            onAdd={onAddWord}
            onRemove={onRemoveWord}
            tone="exclude"
          />
          <FilterTags
            label="Exigir na descrição"
            hint="Se preencher, a descrição precisa conter ao menos uma."
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
