import { readMpSessionToken } from '../lib/merchantApiAuth'
import { readMpBillingRoleHint } from '../lib/mpBillingRoleHint'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type MpBriefPointsSpendResult = {
  pointsCharged: number
  balance: number
  already: boolean
}

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = readMpSessionToken()
  if (!token) {
    throw new Error('请先登录后再使用 AI 功能')
  }
  let lastErr = '积分接口不可达'
  for (const url of merchantApiFetchUrls('/api/meoo-ops-mp-auth')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Mp-Session': token,
        },
        body: JSON.stringify({ ...body, sessionToken: token, token }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && data.ok !== false) return data
      lastErr = String(data.message || data.error || `HTTP ${res.status}`)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export type MpBriefAffordResult =
  | { ok: true; balance: number; required: number }
  | { ok: false; message: string; error?: string; balance?: number; required?: number }

async function postMpAuthActionRaw(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const token = readMpSessionToken()
  if (!token) {
    throw new Error('请先登录后再使用 AI 功能')
  }
  let lastData: Record<string, unknown> = { message: '积分接口不可达' }
  let lastStatus = 0
  for (const url of merchantApiFetchUrls('/api/meoo-ops-mp-auth')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Mp-Session': token,
        },
        body: JSON.stringify({ ...body, sessionToken: token, token }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && data.ok !== false) {
        return { ok: true, data, status: res.status }
      }
      lastData = data
      lastStatus = res.status
    } catch (e) {
      lastData = { message: e instanceof Error ? e.message : String(e) }
    }
  }
  return { ok: false, data: lastData, status: lastStatus }
}

/** 生成 Brief 前校验积分 / 会员档位 */
export async function checkMpBriefPointsAffordable(): Promise<MpBriefAffordResult> {
  const token = readMpSessionToken()
  if (!token) {
    return { ok: false, message: '请先登录后再使用 Brief 功能', error: 'login_required' }
  }
  const billingRole = readMpBillingRoleHint()
  const res = await postMpAuthActionRaw({
    action: 'mp_ai_points_afford',
    kind: 'brief',
    ...(billingRole ? { billingRole } : {}),
  })
  if (res.ok) {
    return {
      ok: true,
      balance: Math.max(0, Math.floor(Number(res.data.mpAiPointsBalance) || 0)),
      required: Math.max(0, Math.floor(Number(res.data.pointsRequired) || 0)),
    }
  }
  return {
    ok: false,
    message: String(res.data.message || res.data.error || '积分不足'),
    error: String(res.data.error || ''),
    balance: res.data.balance != null ? Math.floor(Number(res.data.balance)) : undefined,
    required: res.data.required != null ? Math.floor(Number(res.data.required)) : undefined,
  }
}

/** 爆款 Brief / 文稿生成成功后扣减积分（8 积分/篇） */
export async function spendMpBriefPoints(opts?: {
  idempotencyKey?: string
  note?: string
}): Promise<MpBriefPointsSpendResult | null> {
  const token = readMpSessionToken()
  if (!token) return null
  const billingRole = readMpBillingRoleHint()
  const data = await postMpAuthAction({
    action: 'mp_ai_points_spend',
    kind: 'brief',
    idempotencyKey: opts?.idempotencyKey?.trim() || undefined,
    note: opts?.note?.trim() || undefined,
    ...(billingRole ? { billingRole } : {}),
  })
  return {
    pointsCharged: Math.max(0, Math.floor(Number(data.pointsCharged) || 0)),
    balance: Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0)),
    already: data.already === true,
  }
}

/** 混剪「AI 分析素材」前校验积分（15 积分/次） */
export async function checkMpMixMaterialAnalyzeAffordable(): Promise<MpBriefAffordResult> {
  const token = readMpSessionToken()
  if (!token) {
    return { ok: false, message: '请先登录后再使用 AI 分析素材', error: 'login_required' }
  }
  const billingRole = readMpBillingRoleHint()
  const res = await postMpAuthActionRaw({
    action: 'mp_ai_points_afford',
    kind: 'mix_material_analyze',
    ...(billingRole ? { billingRole } : {}),
  })
  if (res.ok) {
    return {
      ok: true,
      balance: Math.max(0, Math.floor(Number(res.data.mpAiPointsBalance) || 0)),
      required: Math.max(0, Math.floor(Number(res.data.pointsRequired) || 0)),
    }
  }
  return {
    ok: false,
    message: String(res.data.message || res.data.error || '积分不足'),
    error: String(res.data.error || ''),
    balance: res.data.balance != null ? Math.floor(Number(res.data.balance)) : undefined,
    required: res.data.required != null ? Math.floor(Number(res.data.required)) : undefined,
  }
}

/** 混剪「AI 分析素材」成功后扣减积分（15 积分/次） */
export async function spendMpMixMaterialAnalyzePoints(opts?: {
  idempotencyKey?: string
  note?: string
}): Promise<MpBriefPointsSpendResult | null> {
  const token = readMpSessionToken()
  if (!token) return null
  const billingRole = readMpBillingRoleHint()
  const data = await postMpAuthAction({
    action: 'mp_ai_points_spend',
    kind: 'mix_material_analyze',
    idempotencyKey: opts?.idempotencyKey?.trim() || undefined,
    note: opts?.note?.trim() || undefined,
    ...(billingRole ? { billingRole } : {}),
  })
  return {
    pointsCharged: Math.max(0, Math.floor(Number(data.pointsCharged) || 0)),
    balance: Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0)),
    already: data.already === true,
  }
}
