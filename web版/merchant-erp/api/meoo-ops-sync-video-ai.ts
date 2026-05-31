/**
 * POST /api/ops-sync/video-ai — ECS erp-api 与运营台保存短视频网关绑定。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from './opsSyncRegistryLitePost.js'
import { opsRegistrySupabaseSaveVideoAi } from '../vite-plugins/opsRegistrySupabaseAiWrites.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, opsRegistrySupabaseSaveVideoAi)
}
