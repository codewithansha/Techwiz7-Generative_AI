import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './supportnova.css'
import './supportnova-ai-theme.css'
import SupportNovaApp from './SupportNovaApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SupportNovaApp />
    </BrowserRouter>
  </StrictMode>,
)
