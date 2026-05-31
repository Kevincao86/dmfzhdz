/**
 * POST /api/ops-sync/vendor-keys — ECS erp-api 与运营台保存各厂商 Key。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from './opsSyncRegistryLitePost.js'
import { opsRegistrySupabaseSaveVendorKeys } from '../vite-plugins/opsRegistrySupabaseAiWrites.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, opsRegistrySupabaseSaveVendorKeys)
}
