import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import { supabaseConfigured } from './lib/supabaseClient'
import { fetchAndApplyEcsClientConfig } from './lib/supabaseClientConfig'
import './index.css'

async function bootstrap() {
  if (!supabaseConfigured) {
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML =
        '<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;font:14px/1.5 system-ui,sans-serif;color:#64748b">正在加载登录配置…</div>'
    }
    const ok = await fetchAndApplyEcsClientConfig()
    if (ok) {
      window.location.reload()
      return
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void bootstrap()
