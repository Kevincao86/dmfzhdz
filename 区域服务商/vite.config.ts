import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_ERP_AUTH_API_BASE || 'https://mofangdianai.com/erp-api'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5180,
      strictPort: true,
      host: '127.0.0.1',
      proxy: {
        '/erp-api': {
          target: apiTarget.replace(/\/erp-api\/?$/, '') || 'https://mofangdianai.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
    preview: { port: 5180, strictPort: true, host: '127.0.0.1' },
  }
})
