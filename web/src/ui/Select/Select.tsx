import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import './Select.css'

export type SelectOption<T extends string = string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  value: T
  options: Array<SelectOption<T>>
  onChange: (value: T) => void
  fullWidth?: boolean
  id?: string
  'aria-label'?: string
  disabled?: boolean

  placeholder?: string
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  id,
  'aria-label': ariaLabel = 'Selecionar',
  disabled = false,
  placeholder,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const isPlaceholder = Boolean(placeholder) && value === ('' as T)

  const selectedLabel = useMemo(() => {
    if (isPlaceholder) return placeholder!
    return options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ''
  }, [options, value, placeholder, isPlaceholder])

  useEffect(() => {
    if (!open) return

    function updatePos() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({
        top: r.bottom + 6,
        left: r.left,
        width: r.width,
      })
    }

    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)

    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={cx('ui-select', fullWidth && 'ui-select--full')}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={cx(
          'ui-select__trigger',
          isPlaceholder && 'ui-select__trigger--placeholder',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-select__trigger-text">{selectedLabel}</span>
        <span className="ui-select__caret" aria-hidden />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="ui-select__menu"
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              }}
            >
              {options.map((opt) => {
                const selected = opt.value === value
                return (
                  <button
                    key={opt.value || 'empty'}
                    type="button"
                    className={cx(
                      'ui-select__option',
                      selected && 'ui-select__option--selected',
                    )}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
