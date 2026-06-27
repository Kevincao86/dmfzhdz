/**
 * POST /api/meoo-ops-recruitment-orders-append
 * 与 `/api/ops-sync/recruitment-orders/append` 一致；供 ERP 推达人招募单至运营域名。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from '../opsSyncRegistryLitePost.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, async (io, bodyRaw) => {
    const { dispatchOpsRegistrySupabase } = await import('../src/ops/opsRegistrySupabaseDispatch.js')
    return dispatchOpsRegistrySupabase({
      method: 'POST',
      urlPath: '/api/ops-sync/recruitment-orders/append',
      bodyRaw,
      io,
    })
  })
}
