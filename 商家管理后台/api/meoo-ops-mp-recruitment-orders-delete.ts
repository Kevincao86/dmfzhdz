/**
 * POST /api/meoo-ops-mp-recruitment-orders-delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRegistrySyncLitePost, opsRegistrySyncLiteFnConfig } from './opsSyncRegistryLitePost.js'

export const config = opsRegistrySyncLiteFnConfig

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleRegistrySyncLitePost(req, res, async (io, bodyRaw) => {
    const { dispatchOpsRegistrySupabase } = await import('../src/ops/opsRegistrySupabaseDispatch.js')
    return dispatchOpsRegistrySupabase({
      method: 'POST',
      urlPath: '/api/ops-sync/mp-recruitment-orders/delete',
      bodyRaw,
      io,
    })
  })
}
