import path from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { MERCHANT_ERP_PUBLIC, MERCHANT_ERP_ROOT, MERCHANT_ERP_SRC } from './vite.merchantErpRoot'
import { merchantApiMockPlugin } from '../web版/merchant-erp/vite-plugins/merchantApiMock'
import { authSmsGatewayPlugin } from '../web版/merchant-erp/vite-plugins/authSmsGateway'
import { mpAuthGatewayPlugin } from '../web版/merchant-erp/vite-plugins/mpAuthGateway'
import { mpHallRegistryGatewayPlugin } from '../web版/merchant-erp/vite-plugins/mpHallRegistryGateway'
import { opsErpSyncGatewayPlugin } from '../web版/merchant-erp/vite-plugins/opsErpSyncGateway'

function merchantPublicAssetsPlugin(): Plugin {
  return {
    name: 'merchant-public-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? ''
        if (
          !raw.startsWith('/digital-human') &&
          !raw.startsWith('/ai-vendors') &&
          !raw.startsWith('/platforms/') &&
          !raw.startsWith('/douyin-bind-guide/')
        ) {
          return next()
        }
        const filePath = path.join(MERCHANT_ERP_PUBLIC, raw)
        if (!filePath.startsWith(MERCHANT_ERP_PUBLIC) || !existsSync(filePath)) return next()
        try {
          const buf = readFileSync(filePath)
          if (raw.endsWith('.jpg') || raw.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg')
          else if (raw.endsWith('.png')) res.setHeader('Content-Type', 'image/png')
          else if (raw.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml')
          res.end(buf)
        } catch {
          next()
        }
      })
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const fulfillmentRoot = path.dirname(fileURLToPath(import.meta.url))
  const env = {
    ...loadEnv(mode, MERCHANT_ERP_ROOT, ''),
    ...loadEnv(mode, fulfillmentRoot, ''),
  }
  const devOnlyPlugins =
    command === 'serve'
      ? [
          merchantPublicAssetsPlugin(),
          merchantApiMockPlugin(),
          opsErpSyncGatewayPlugin(),
          mpAuthGatewayPlugin({ extraEnvDirs: [MERCHANT_ERP_ROOT] }),
          authSmsGatewayPlugin({ extraEnvDirs: [MERCHANT_ERP_ROOT] }),
          mpHallRegistryGatewayPlugin(),
        ]
      : []

  return {
    envDir: MERCHANT_ERP_ROOT,
    plugins: [react(), tailwindcss(), ...devOnlyPlugins],
    resolve: {
      alias: {
        '@merchant': MERCHANT_ERP_SRC,
      },
    },
    server: {
      port: 5176,
      strictPort: true,
      host: '127.0.0.1',
      fs: {
        allow: [MERCHANT_ERP_ROOT, path.resolve(fulfillmentRoot, '..')],
      },
      proxy: {
        '/api/meoo-ops-mp-hall-registry': {
          target: env.VITE_MP_ERP_API || 'https://mofangdianai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\//, '/erp-api/'),
        },
      },
    },
  }
})
