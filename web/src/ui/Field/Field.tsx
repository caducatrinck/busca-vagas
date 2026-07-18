import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import './Field.css'

type Props = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  inline?: boolean
}

export function Field({
  label,
  hint,
  children,
  inline = false,
  className,
  ...rest
}: Props) {
  return (
    <label
      className={cx('ui-field', inline && 'ui-field--inline', className)}
      {...rest}
    >
      <span className="ui-field__label">{label}</span>
      {children}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  )
}
