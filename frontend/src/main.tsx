import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './supportnova.css'
import './supportnova-ai-theme.css'
import './supportnova-light-theme.css'
import SupportNovaApp from './SupportNovaApp'

const initialTheme = (typeof window !== 'undefined' && localStorage.getItem('supportnova_theme')) || 'light'
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
  document.body.setAttribute('data-theme', initialTheme)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SupportNovaApp />
    </BrowserRouter>
  </StrictMode>,
)
