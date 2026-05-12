/**
 * POST /api/ops-sync/vendor-keys — 独立入口，不经过含 node:crypto 的 dispatch，降低 FUNCTION_INVOCATION_FAILED。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from '../opsSyncRegistryLitePost.js'
import { opsRegistrySupabaseSaveVendorKeys } from '../../src/ops/opsRegistrySupabaseAiWrites.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, opsRegistrySupabaseSaveVendorKeys)
}
