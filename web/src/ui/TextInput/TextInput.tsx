import type { InputHTMLAttributes } from 'react'
import { cx } from '../cx'
import './TextInput.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  fullWidth?: boolean
}

export function TextInput({
  className,
  fullWidth = true,
  type = 'text',
  ...rest
}: Props) {
  return (
    <input
      type={type}
      className={cx('ui-input', fullWidth && 'ui-input--full', className)}
      {...rest}
    />
  )
}
