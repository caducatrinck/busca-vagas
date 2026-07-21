import { LanguageDropdown } from '../../components/LanguageDropdown'
import { TagMultiSelect } from '../../components/TagMultiSelect'
import { useI18n } from '../../i18n'
import type { AppTag, DescriptionLanguage, JobFilters } from '../../lib/types'
import { Field } from '../../ui'

type Props = {
  filters: JobFilters
  catalog: AppTag[]
  onLanguageChange: (value: DescriptionLanguage) => void
  onTagsChange: (ids: string[]) => void
  onExcludedTagsChange: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<AppTag>
  onDeleteTag?: (id: string) => Promise<void>
}

export function MonitorDescriptionSection({
  filters,
  catalog,
  onLanguageChange,
  onTagsChange,
  onExcludedTagsChange,
  onCreateTag,
  onDeleteTag,
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

      <div className="search-panel__tags-row">
        <TagMultiSelect
          compact
          tone="include"
          catalog={catalog}
          selectedIds={filters.selectedTagIds ?? []}
          onChange={onTagsChange}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
          placeholder={t('tags.searchIncludePlaceholder')}
        />
        <TagMultiSelect
          compact
          tone="exclude"
          catalog={catalog}
          selectedIds={filters.excludedTagIds ?? []}
          onChange={onExcludedTagsChange}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
          placeholder={t('tags.searchExcludePlaceholder')}
        />
      </div>
    </div>
  )
}
