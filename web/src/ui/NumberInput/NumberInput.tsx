import { useEffect, useRef, useState } from 'react'
import { cx } from '../cx'
import '../TextInput/TextInput.css'
import { parseNumberInput } from './numberInputMath'

type Props = {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string

  emptyValue?: number
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  disabled,
  id,
  'aria-label': ariaLabel,
  className,
  emptyValue,
}: Props) {
  const [text, setText] = useState(() => String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(String(value))
  }, [value])

  function commit(raw: string) {
    const fallback = emptyValue ?? min ?? 0
    const next = parseNumberInput(raw, fallback, min, max)
    setText(String(next))
    if (next !== value) onValueChange(next)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className={cx('ui-input', 'ui-number-input', className)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      value={text}
      onFocus={() => {
        focusedRef.current = true
      }}
      onChange={(e) => {
        const next = e.target.value
        if (next === '' || /^\d+$/.test(next)) setText(next)
      }}
      onBlur={(e) => {
        focusedRef.current = false
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
