import { readMpSessionToken } from '../lib/merchantApiAuth'
import { readMpBillingRoleHint } from '../lib/mpBillingRoleHint'
import {
  mpPointsCostForUsage,
  type MpPointsUsageKind,
} from '../lib/mpPointsEconomics'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { checkErpPointsAffordable, spendErpPointsForUsage } from './tenantBillingClient'

export type MpAddonGenerationKind = 'shortvideo' | 'cloud_edit' | 'cloud_edit_smart' | 'digital_human'

export type MpAddonPointsSpendResult = {
  pointsCharged: number
  balance: number
  already: boolean
  skipped?: boolean
}

export type MpAddonPointsAffordResult =
  | { ok: true; balance: number; required: number; skipped?: boolean }
  | { ok: false; message: string; error?: string; balance?: number; required?: number }

async function postMpAuthActionRaw(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const token = readMpSessionToken()
  if (!token) {
    return { ok: false, data: { error: 'login_required', message: '未绑定星选会话' }, status: 401 }
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

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await postMpAuthActionRaw(body)
  if (res.ok) return res.data
  throw new Error(String(res.data.message || res.data.error || '积分接口失败'))
}

export function estimateMpAddonPointsCharge(kind: MpAddonGenerationKind, durationSec: number): number {
  return mpPointsCostForUsage(kind, { durationSec })
}

/** 生成前校验积分：星选 mp 会话优先；否则走 ERP 租户 billing */
export async function checkMpAddonPointsAffordable(
  kind: MpAddonGenerationKind,
  durationSec: number,
): Promise<MpAddonPointsAffordResult> {
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const required = estimateMpAddonPointsCharge(kind, sec)
  if (readMpSessionToken()) {
    const billingRole = readMpBillingRoleHint()
    const res = await postMpAuthActionRaw({
      action: 'mp_ai_points_afford',
      kind,
      durationSec: sec,
      ...(billingRole ? { billingRole } : {}),
    })
    if (res.ok) {
      return {
        ok: true,
        balance: Math.max(0, Math.floor(Number(res.data.mpAiPointsBalance) || 0)),
        required: Math.max(0, Math.floor(Number(res.data.pointsRequired) || required)),
      }
    }
    const err = String(res.data.error || '')
    if (err === 'login_required') {
      return { ok: true, balance: 0, required: 0, skipped: true }
    }
    return {
      ok: false,
      message: String(res.data.message || res.data.error || '积分不足'),
      error: err,
      balance: res.data.balance != null ? Math.floor(Number(res.data.balance)) : undefined,
      required: res.data.required != null ? Math.floor(Number(res.data.required)) : required,
    }
  }
  try {
    const r = await checkErpPointsAffordable({ kind, durationSec: sec })
    const balance = Math.max(
      0,
      Math.floor(Number(r.balance) || Number(r.packageBalance) + Number(r.rechargeBalance) || 0),
    )
    if (balance < required) {
      return {
        ok: false,
        message: mpAddonPointsInsufficientMessage(kind, required, balance),
        error: 'insufficient_points',
        balance,
        required,
      }
    }
    return { ok: true, balance, required }
  } catch (e) {
    const errObj = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    const status = Number(errObj.status) || 0
    if (status === 402) {
      return {
        ok: false,
        message: String(errObj.message || '积分不足'),
        error: 'insufficient_points',
      }
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      error: 'billing_unavailable',
    }
  }
}

/** 成片成功后扣减积分：星选 mp 会话优先；否则走 ERP 租户 billing */
export async function spendMpAddonPoints(opts: {
  kind: MpAddonGenerationKind
  durationSec: number
  idempotencyKey?: string
  note?: string
}): Promise<MpAddonPointsSpendResult | null> {
  const sec = Math.max(1, Math.ceil(Number(opts.durationSec) || 1))
  if (readMpSessionToken()) {
    const billingRole = readMpBillingRoleHint()
    const data = await postMpAuthAction({
      action: 'mp_ai_points_spend',
      kind: opts.kind,
      durationSec: sec,
      idempotencyKey: opts.idempotencyKey?.trim() || undefined,
      note: opts.note?.trim() || undefined,
      ...(billingRole ? { billingRole } : {}),
    })
    return {
      pointsCharged: Math.max(0, Math.floor(Number(data.pointsCharged) || 0)),
      balance: Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0)),
      already: data.already === true,
    }
  }
  const r = await spendErpPointsForUsage({
    kind: opts.kind,
    durationSec: sec,
    idempotencyKey: opts.idempotencyKey?.trim() || undefined,
    note: opts.note?.trim() || undefined,
  })
  return {
    pointsCharged: Math.max(0, Math.floor(Number(r.pointsCharged) || 0)),
    balance: Math.max(0, Math.floor(Number(r.balance) || 0)),
    already: r.already === true,
  }
}

export function formatMpAddonPointsSpendHint(
  kind: MpAddonGenerationKind,
  result: MpAddonPointsSpendResult,
  durationSec?: number,
): string {
  if (result.skipped) return ''
  if (result.pointsCharged <= 0 && !result.already) {
    return ' · 已消耗套餐额度 1 次'
  }
  const sec =
    kind !== 'cloud_edit' &&
    durationSec != null &&
    Number.isFinite(durationSec) &&
    durationSec > 0
      ? `（${Math.ceil(durationSec)} 秒）`
      : ''
  const labels: Record<MpAddonGenerationKind, string> = {
    shortvideo: '短视频 AI',
    cloud_edit: '云剪',
    cloud_edit_smart: '智能一键成片',
    digital_human: '数字人口播',
  }
  const pts = result.pointsCharged.toLocaleString('zh-CN')
  const bal = result.balance.toLocaleString('zh-CN')
  return ` · ${labels[kind]}${sec} 消耗 ${pts} 积分，余额 ${bal}`
}

export function mpAddonPointsInsufficientMessage(
  kind: MpPointsUsageKind,
  required: number,
  balance: number,
): string {
  return `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${required.toLocaleString('zh-CN')}），请先充值或等待会员赠送积分到账后再使用${
    kind === 'shortvideo'
      ? '短视频 AI'
      : kind === 'cloud_edit'
        ? '云剪'
        : kind === 'cloud_edit_smart'
          ? '智能一键成片'
          : '数字人口播'
  }`
}
