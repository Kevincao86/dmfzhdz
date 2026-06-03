import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { authRegisterGatewayPlugin } from './vite-plugins/authRegisterGateway'
import { merchantApiMockPlugin } from './vite-plugins/merchantApiMock'
import { mpTalentChatGatewayPlugin } from './vite-plugins/mpTalentChatGateway'
import { mpAuthGatewayPlugin } from './vite-plugins/mpAuthGateway'
import { mpRecruitApplyLandingPlugin } from './vite-plugins/mpRecruitApplyLandingPlugin'
import { opsErpSyncGatewayPlugin } from './vite-plugins/opsErpSyncGateway'
import { supportWsProxyToAdminPlugin } from './vite-plugins/supportWsProxyToAdmin'

/**
 * 在线客服：浏览器连 ERP 同源 /__meoo_support_online，由 supportWsProxyToAdmin 转发到管理后台（不依赖 server.proxy 的 ws）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adminOrigin =
    (env.VITE_MERCHANT_ADMIN_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'http://127.0.0.1:5174'

  return {
    define: {
      'import.meta.env.VITE_APP_EDITION': JSON.stringify(
        env.VITE_APP_EDITION ?? (mode === 'partner' ? 'partner' : 'merchant'),
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      merchantApiMockPlugin(),
      authRegisterGatewayPlugin(),
      mpRecruitApplyLandingPlugin(),
      opsErpSyncGatewayPlugin(),
      mpTalentChatGatewayPlugin(),
      mpAuthGatewayPlugin(),
      supportWsProxyToAdminPlugin({ adminHttpOrigin: adminOrigin }),
    ],
    /**
     * 使用 IPv4 环回：`localhost` 在部分 macOS/Node 下只监听 [::1]，浏览器访问 http://127.0.0.1 会「拒绝连接」。
     * 勿用 `host: true`：在 Cursor 内置终端等环境可能触发 networkInterfaces 崩溃；局域网用：`npm run dev -- --host 0.0.0.0`
     */
    server: {
      port: mode === 'partner' ? 5175 : 5173,
      strictPort: true,
      host: '127.0.0.1',
    },
  }
})
