/**
 * POST /api/ops-sync/ai — 独立入口，不经过含 node:crypto 的 dispatch。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from '../opsSyncRegistryLitePost'
import { opsRegistrySupabaseSaveAiModels } from '../../src/ops/opsRegistrySupabaseAiWrites.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, opsRegistrySupabaseSaveAiModels)
}
