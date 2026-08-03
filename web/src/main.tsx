import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LocaleProvider } from './LocaleProvider'
import './index.css'
import { applyTheme, readTheme } from './theme'

// Antes del primer render, para que no haya un parpadeo en claro.
applyTheme(readTheme())

const container = document.getElementById('root')
if (!container) throw new Error('Falta #root en index.html')

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
)
