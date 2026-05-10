import path from 'node:path'
import type { Plugin } from 'vite'
import { createOpsRegistryGatewayPlugin } from './opsRegistryGatewayShared'

/** 注册表落在「项目根/.meoo-dev-sync」，与管理后台共用 */
export function opsErpSyncGatewayPlugin(): Plugin {
  return createOpsRegistryGatewayPlugin({
    registryDir: (viteRoot) => path.resolve(viteRoot, '..', '..', '.meoo-dev-sync'),
    legacyRegistryFile: (viteRoot) => path.join(viteRoot, '.meoo-dev-sync', 'registry.json'),
  })
}
