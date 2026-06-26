import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { MERCHANT_ERP_ROOT, MERCHANT_ERP_SRC } from './vite.merchantErpRoot'
import { merchantPublicAssetsPlugin } from './vite.merchantPublicAssets'
import { merchantApiMockPlugin } from '../web版/merchant-erp/vite-plugins/merchantApiMock'
import { authSmsGatewayPlugin } from '../web版/merchant-erp/vite-plugins/authSmsGateway'
import { mpAuthGatewayPlugin } from '../web版/merchant-erp/vite-plugins/mpAuthGateway'
import { mpHallRegistryGatewayPlugin } from '../web版/merchant-erp/vite-plugins/mpHallRegistryGateway'
import { opsErpSyncGatewayPlugin } from '../web版/merchant-erp/vite-plugins/opsErpSyncGateway'

/** 嵌入 @merchant 页面时强制共用本项目的 React，避免 useState 读 null 导致整页黑屏 */
function singleReactResolve(fulfillmentRoot: string) {
  const nm = (pkg: string) => path.resolve(fulfillmentRoot, 'node_modules', pkg)
  return {
    alias: {
      '@merchant': MERCHANT_ERP_SRC,
      react: nm('react'),
      'react-dom': nm('react-dom'),
      'react/jsx-runtime': nm('react/jsx-runtime'),
      'react/jsx-dev-runtime': nm('react/jsx-dev-runtime'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'] as string[],
  }
}

export default defineConfig(({ mode, command }) => {
  const fulfillmentRoot = path.dirname(fileURLToPath(import.meta.url))
  const reactResolve = singleReactResolve(fulfillmentRoot)
  const env = {
    ...loadEnv(mode, MERCHANT_ERP_ROOT, ''),
    ...loadEnv(mode, fulfillmentRoot, ''),
  }
  const devOnlyPlugins: Plugin[] =
    command === 'serve'
      ? [
          merchantApiMockPlugin(),
          opsErpSyncGatewayPlugin(),
          mpAuthGatewayPlugin({ extraEnvDirs: [MERCHANT_ERP_ROOT] }),
          authSmsGatewayPlugin({ extraEnvDirs: [MERCHANT_ERP_ROOT] }),
          mpHallRegistryGatewayPlugin(),
        ]
      : []

  return {
    envDir: MERCHANT_ERP_ROOT,
    plugins: [react(), tailwindcss(), merchantPublicAssetsPlugin(), ...devOnlyPlugins],
    resolve: reactResolve,
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'qrcode'],
    },
    server: {
      port: 5176,
      strictPort: true,
      host: '127.0.0.1',
      fs: {
        allow: [MERCHANT_ERP_ROOT, path.resolve(fulfillmentRoot, '..')],
      },
      proxy: {
        '/erp-api': {
          target: env.VITE_MP_ERP_API || 'https://mofangdianai.com',
          changeOrigin: true,
          secure: true,
        },
        '/api/meoo-ops-mp-hall-registry': {
          target: env.VITE_MP_ERP_API || 'https://mofangdianai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\//, '/erp-api/'),
        },
        '/api/meoo-ops-mp-talent-pr-quotes': {
          target: env.VITE_MP_AUTH_API_LOCAL || 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/api/meoo-ops-mp-talent-cooperation-stats': {
          target: env.VITE_MP_AUTH_API_LOCAL || 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/api/meoo-ops-mp-pr-user-search': {
          target: env.VITE_MP_AUTH_API_LOCAL || 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
