/**
 * 投流 / 线索 AI：统一积分预检与成功扣减。
 */
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { generateAdvertisingAiText } from './merchantAiUpstream.js'

export type AdAiBillingOpts = {
  authHeader?: string
  env?: Record<string, string>
}

export async function generateAdvertisingAiTextBilled(
  aiEnv: MerchantAiEnv,
  ctx: { system: string; user: string },
  billing: AdAiBillingOpts | undefined,
  note: string,
): Promise<
  | {
      blocked: true
      status: number
      body: {
        ok: false
        error: string
        message: string
        required?: number
        balance?: number
      }
    }
  | {
      blocked: false
      result:
        | {
            ok: true
            text: string
            modelUsed: string
            pointsCharged?: number
            pointsBalance?: number
          }
        | { ok: false; message: string }
    }
> {
  const { runErpAiWithPointsBilling } = await import('../api/_lib/erpAiApiPointsGate.js')
  const billed = await runErpAiWithPointsBilling(
    billing?.authHeader,
    'ad_ai',
    (billing?.env || (process.env as Record<string, string>)) as Record<string, string>,
    { note },
    () => generateAdvertisingAiText(aiEnv, ctx),
  )
  if (billed.blocked) {
    return {
      blocked: true,
      status: billed.status,
      body: {
        ok: false,
        error: billed.error,
        message: billed.message,
        required: billed.required,
        balance: billed.balance,
      },
    }
  }
  return { blocked: false, result: billed.result }
}
