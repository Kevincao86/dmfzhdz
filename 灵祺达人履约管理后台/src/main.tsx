import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initTheme } from './lib/theme'
import './lib/mpAccountClientSync'
import { bootstrapFwsEmbedSessionFromUrl } from './lib/fwsEmbedSessionBootstrap'

initTheme()

void bootstrapFwsEmbedSessionFromUrl().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})
