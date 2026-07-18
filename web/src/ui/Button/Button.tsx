import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import './Button.css'

export type ButtonVariant = 'primary' | 'danger' | 'soft' | 'ghost'
export type ButtonSize = 'md' | 'sm'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cx(
        'ui-btn',
        `ui-btn--${variant}`,
        `ui-btn--${size}`,
        fullWidth && 'ui-btn--full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
