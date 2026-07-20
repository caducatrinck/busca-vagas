import type { ReactNode } from 'react'
import './LinkedInSignInButton.css'

function LinkedInMark() {
  return (
    <svg
      className="linkedin-signin__mark"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden
    >
      <rect width="24" height="24" rx="2" fill="#fff" />
      <path
        fill="#0A66C2"
        d="M19.7 19.7h-3.2v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7v5.2H9.5V9.3h3.1v1.4h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5v5.7zM6.3 7.9a1.85 1.85 0 1 1 0-3.7 1.85 1.85 0 0 1 0 3.7zM7.9 19.7H4.7V9.3h3.2v10.4z"
      />
    </svg>
  )
}

type Props = {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}

/** Botão no estilo oficial “Sign in with LinkedIn”. */
export function LinkedInSignInButton({ children, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className="linkedin-signin"
      disabled={disabled}
      onClick={onClick}
    >
      <LinkedInMark />
      <span>{children}</span>
    </button>
  )
}
