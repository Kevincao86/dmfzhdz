/**
 * POST /api/meoo-digital-human-tts — 数字人口播云端试听（MiniMax 神经语音）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDigitalHumanTtsCore } from '../src/lib/digitalHumanTtsCore.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  let body: {
    text?: string
    voicePresetId?: string
    speechRate?: number
    speechPitch?: number
    tenantId?: string
    referenceAudioBase64?: string
  }
  try {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : ''
    body = JSON.parse(raw || '{}') as typeof body
  } catch {
    sendJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
    '../vite-plugins/merchantRegistryVendorEnv.js'
  )
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(
    process.cwd(),
    process.env as Record<string, string>,
  )
  const out = await runDigitalHumanTtsCore(
    {
      text: String(body.text ?? ''),
      voicePresetId: String(body.voicePresetId ?? ''),
      speechRate: typeof body.speechRate === 'number' ? body.speechRate : undefined,
      speechPitch: typeof body.speechPitch === 'number' ? body.speechPitch : undefined,
      tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
      referenceAudioBase64:
        typeof body.referenceAudioBase64 === 'string' ? body.referenceAudioBase64 : undefined,
    },
    env,
    auth,
  )
  if (!out.ok) {
    sendJson(res, 422, { ok: false, message: out.message })
    return
  }

  void (async () => {
    try {
      const { verifyBearerJwt } = await import('../vite-plugins/aiGateway/authSupabase.js')
      const { loadTenantAiContextForUser } = await import('../vite-plugins/tenantMembershipCore.js')
      const { recordAiTokenUsageAfterSuccess, estimateTtsCharacterTokens } = await import(
        '../vite-plugins/aiTokenUsageCore.js'
      )
      const user = await verifyBearerJwt(auth, env)
      if (!user) return
      const bearer =
        typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : undefined
      const ctx = await loadTenantAiContextForUser(
        user.id,
        env,
        bearer,
        typeof body.tenantId === 'string' ? body.tenantId : undefined,
      )
      await recordAiTokenUsageAfterSuccess({
        userId: user.id,
        usageCtx: ctx,
        tenantIdHint: typeof body.tenantId === 'string' ? body.tenantId : undefined,
        provider: out.provider,
        model: out.model,
        usage: estimateTtsCharacterTokens(String(body.text ?? '')),
        env,
      })
    } catch {
      /* 用量记账失败不影响试听 */
    }
  })()

  sendJson(res, 200, { ...out })
}
