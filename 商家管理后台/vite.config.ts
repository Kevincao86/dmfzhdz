import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createOpsRegistryGatewayPlugin } from '../web版/merchant-erp/vite-plugins/opsRegistryGatewayShared'
import { opsSupabaseAdminPlugin } from './vite-plugins/opsSupabaseAdminPlugin'
import { provisionTenantProxyPlugin } from './vite-plugins/provisionTenantProxy'
import { supportOnlineWsPlugin } from './vite-plugins/supportOnlineWs'

/**
 * `/api/ops-sync` 由本机插件直接读写「项目根/.meoo-dev-sync」，与 ERP 共用，无需再代理到 5173。
 */
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [
      createOpsRegistryGatewayPlugin({
        registryDir: (viteRoot) => path.resolve(viteRoot, '..', '.meoo-dev-sync'),
      }),
      opsSupabaseAdminPlugin(),
      provisionTenantProxyPlugin(),
      react(),
      tailwindcss(),
      supportOnlineWsPlugin(),
    ],
    /** 与 ERP 一致绑定 127.0.0.1，避免仅 [::1] 监听导致 IPv4 访问被拒绝 */
    server: {
      port: 5174,
      strictPort: true,
      host: '127.0.0.1',
    },
    preview: { port: 5174, strictPort: true, host: '127.0.0.1' },
  }
})
