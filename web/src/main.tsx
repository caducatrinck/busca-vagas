import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

try {
  const stored = localStorage.getItem('busca-vagas-theme')
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.dataset.theme = stored
  }
} catch {
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
