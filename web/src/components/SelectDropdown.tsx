import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './SelectDropdown.css'

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
}

export function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
  id,
  'aria-label': ariaLabel = 'Selecionar',
  disabled = false,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ''
  }, [options, value])

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
    <div
      className={`select-dropdown${fullWidth ? ' select-dropdown--full' : ''}`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="select-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="select-dropdown__trigger-text">{selectedLabel}</span>
        <span className="select-dropdown__caret" aria-hidden />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="select-dropdown__menu"
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
                    className={`select-dropdown__option${
                      selected ? ' select-dropdown__option--selected' : ''
                    }`}
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
