import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { AppTag } from '../lib/types'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import { normalizeTagLabel } from '../shared/tags'
import { useI18n } from '../i18n'
import './TagMultiSelect.css'

type Props = {
  catalog: AppTag[]
  selectedIds: string[]
  disabled?: boolean
  compact?: boolean
  tone?: 'include' | 'exclude'
  placeholder?: string
  onChange: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<AppTag>
  onDeleteTag?: (id: string) => Promise<void>
  label?: string
  hint?: string
}

const MENU_MAX_PX = 220

export function TagMultiSelect({
  catalog,
  selectedIds,
  disabled = false,
  compact = false,
  tone = 'include',
  placeholder,
  onChange,
  onCreateTag,
  onDeleteTag,
  label,
  hint,
}: Props) {
  const { t } = useI18n()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const controlRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  const selected = useMemo(() => {
    const byId = new Map(catalog.map((tag) => [tag.id, tag]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter((tag): tag is AppTag => Boolean(tag))
  }, [catalog, selectedIds])

  const normalizedQuery = normalizeTagLabel(query)
  const filtered = useMemo(() => {
    if (!normalizedQuery) return catalog
    return catalog.filter((tag) =>
      normalizeTagLabel(tag.label).includes(normalizedQuery),
    )
  }, [catalog, normalizedQuery])

  const exactMatch = useMemo(
    () =>
      catalog.find(
        (tag) => normalizeTagLabel(tag.label) === normalizedQuery,
      ) ?? null,
    [catalog, normalizedQuery],
  )

  const canCreate =
    Boolean(normalizedQuery) && !exactMatch && !busy

  function updateMenuPosition() {
    const el = controlRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow
    const maxHeight = Math.min(
      MENU_MAX_PX,
      Math.max(120, openUp ? spaceAbove : spaceBelow),
    )
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      width: Math.max(r.width, 180),
      maxHeight,
      zIndex: 1200,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 8, top: 'auto' }
        : { top: r.bottom + 8, bottom: 'auto' }),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open, filtered.length, canCreate])

  useEffect(() => {
    if (!open) return
    function onReposition() {
      updateMenuPosition()
    }
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  useEffect(() => {
    function onDoc(e: globalThis.MouseEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      const menu = document.getElementById(listId)
      if (menu?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [listId])

  function toggle(id: string) {
    if (disabled) return
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  async function handleCreate() {
    if (!canCreate || !query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const tag = await onCreateTag(query.trim())
      if (!selectedIds.includes(tag.id)) {
        onChange([...selectedIds, tag.id])
      }
      setQuery('')
      setOpen(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'err:tag_create'
      setError(localizeVisibleError(raw, t))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!onDeleteTag || disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      await onDeleteTag(id)
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((x) => x !== id))
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'err:tag_delete'
      setError(localizeVisibleError(raw, t))
    } finally {
      setBusy(false)
    }
  }

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <ul
            id={listId}
            className="tag-multi__menu"
            role="listbox"
            style={menuStyle}
          >
            {filtered.map((tag) => {
              const active = selectedIds.includes(tag.id)
              return (
                <li key={tag.id} className="tag-multi__menu-row">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={active ? 'is-active' : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(tag.id)}
                  >
                    <span>{tag.label}</span>
                    {tag.builtin ? <em>{t('tags.builtin')}</em> : null}
                    {active ? <strong>✓</strong> : null}
                  </button>
                  {onDeleteTag ? (
                    <button
                      type="button"
                      className="tag-multi__menu-delete"
                      title={t('tags.delete')}
                      aria-label={t('tags.deleteAria', { label: tag.label })}
                      disabled={busy}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => void handleDelete(tag.id, e)}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              )
            })}
            {canCreate ? (
              <li>
                <button
                  type="button"
                  className="tag-multi__create"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleCreate()}
                >
                  {t('tags.create', { label: query.trim() })}
                </button>
              </li>
            ) : null}
            {!canCreate && filtered.length === 0 ? (
              <li className="tag-multi__menu-empty">{t('tags.noResults')}</li>
            ) : null}
          </ul>,
          document.body,
        )
      : null

  const control = (
    <div className="tag-multi__control" ref={controlRef}>
      <input
        type="search"
        value={query}
        disabled={disabled || busy}
        placeholder={
          placeholder ??
          (tone === 'exclude'
            ? t('tags.searchExcludePlaceholder')
            : t('tags.searchPlaceholder'))
        }
        aria-label={
          label ??
          (tone === 'exclude'
            ? t('tags.searchExcludePlaceholder')
            : t('tags.searchIncludePlaceholder'))
        }
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (canCreate) void handleCreate()
            else if (exactMatch) toggle(exactMatch.id)
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
    </div>
  )

  return (
    <div
      className={`tag-multi tag-multi--${tone}${disabled ? ' tag-multi--disabled' : ''}${open ? ' tag-multi--open' : ''}${compact ? ' tag-multi--compact' : ''}`}
      ref={rootRef}
    >
      {!compact ? (
        <div className="tag-multi__head">
          <h3>{label ?? t('tags.label')}</h3>
          <p>{hint ?? t('tags.hint')}</p>
        </div>
      ) : null}

      {compact ? control : null}

      <div
        className={`tag-multi__selected${selected.length === 0 ? ' tag-multi__selected--empty' : ''}`}
      >
        {selected.length === 0 ? (
          compact ? null : (
            <span className="tag-multi__empty">{t('tags.noneSelected')}</span>
          )
        ) : (
          selected.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="tag-multi__chip"
              disabled={disabled}
              onClick={() => toggle(tag.id)}
              title={t('tags.remove')}
            >
              {tag.label}
              <span aria-hidden>×</span>
            </button>
          ))
        )}
      </div>

      {!compact ? control : null}

      {menu}

      {compact && !error ? null : (
        <p
          className={`tag-multi__error${error ? '' : ' tag-multi__error--empty'}`}
          role={error ? 'alert' : undefined}
        >
          {error ?? '\u00a0'}
        </p>
      )}
    </div>
  )
}
