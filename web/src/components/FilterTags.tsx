import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import type { WordFilterKey } from '../lib/types'
import { Button, TextInput } from '../ui'
import './FilterTags.css'

type Props = {
  label: string
  hint: string
  words: string[]
  filterKey: WordFilterKey
  onAdd: (key: WordFilterKey, word: string) => void
  onRemove: (key: WordFilterKey, word: string) => void
  tone: 'include' | 'exclude'
}

export function FilterTags({
  label,
  hint,
  words,
  filterKey,
  onAdd,
  onRemove,
  tone,
}: Props) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')

  function commit() {
    if (!draft.trim()) return
    onAdd(filterKey, draft)
    setDraft('')
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    commit()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  return (
    <div className={`filter-tags filter-tags--${tone}`}>
      <div className="filter-tags__head">
        <h3>{label}</h3>
        <p>{hint}</p>
      </div>
      <form className="filter-tags__form" onSubmit={onSubmit}>
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('filter.placeholder')}
          aria-label={label}
        />
        <Button
          type="submit"
          className="filter-tags__add"
          aria-label={t('filter.addAria', { label })}
        >
          +
        </Button>
      </form>
      <ul className="filter-tags__list">
        {words.map((word) => (
          <li key={word}>
            <button type="button" onClick={() => onRemove(filterKey, word)}>
              {word}
              <span aria-hidden>×</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
