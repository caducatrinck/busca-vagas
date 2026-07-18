import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import './Alert.css'

type Props = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode
  tone?: 'info' | 'danger'
}

export function Alert({
  children,
  tone = 'info',
  className,
  role = 'status',
  ...rest
}: Props) {
  return (
    <p
      className={cx('ui-alert', `ui-alert--${tone}`, className)}
      role={role}
      {...rest}
    >
      {children}
    </p>
  )
}
