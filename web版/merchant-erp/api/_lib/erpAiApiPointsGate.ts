/**
 * 商家 / 服务商 ERP AI API：JWT 租户积分预检与成功后扣减。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { verifyBearerJwt } from '../../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../../vite-plugins/tenantMembershipCore.js'
import { nodeSupabaseClientOptions } from '../../src/lib/nodeSupabaseClientOptions.js'
import {
  assertErpAiPointsAffordable,
  spendErpAiPoints,
  type ErpAiUsageKind,
} from '../../src/lib/erpAiPointsSpendCore.js'

function supabaseBase(env: Record<string, string>): string {
  return (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
}

function serviceRoleKey(env: Record<string, string>): string {
  return (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim()
}

function bearerFromAuth(authHeader: string | undefined): string {
  const a = String(authHeader || '').trim()
  if (a.startsWith('Bearer ')) return a.slice('Bearer '.length).trim()
  return a
}

export type ErpAiApiPointsGateOk = { ok: true; tenantId: string; userId: string }
export type ErpAiApiPointsGateFail = {
  ok: false
  status: number
  error: string
  message: string
  required?: number
  balance?: number
}

/** 生成前校验：余额不足返回 402 */
export async function requireErpAiPointsAffordable(
  authHeader: string | undefined,
  kind: ErpAiUsageKind,
  env: Record<string, string>,
  opts?: { durationSec?: number; pointsOverride?: number; tenantIdHint?: string },
): Promise<ErpAiApiPointsGateOk | ErpAiApiPointsGateFail> {
  const user = await verifyBearerJwt(authHeader, env)
  if (!user) {
    return { ok: false, status: 401, error: 'unauthorized', message: '请先登录' }
  }
  const jwt = bearerFromAuth(authHeader)
  const ctx = await loadTenantAiContextForUser(user.id, env, jwt || undefined, opts?.tenantIdHint)
  if (!ctx) {
    return {
      ok: false,
      status: 403,
      error: 'tenant_not_found',
      message: '未找到租户，无法扣减积分',
    }
  }
  const base = supabaseBase(env)
  const serviceRole = serviceRoleKey(env)
  if (!base || !serviceRole) {
    return {
      ok: false,
      status: 503,
      error: 'points_billing_unavailable',
      message: '积分计费服务未配置',
    }
  }
  const admin = createClient(base, serviceRole, nodeSupabaseClientOptions())
  const result = await assertErpAiPointsAffordable(admin, ctx.tenantId, kind, {
    durationSec: opts?.durationSec,
    pointsOverride: opts?.pointsOverride,
  })
  if (!result.ok) {
    return {
      ok: false,
      status: result.error === 'insufficient_points' ? 402 : 400,
      error: result.error,
      message: result.message,
      required: result.required,
      balance: result.balance,
    }
  }
  return { ok: true, tenantId: ctx.tenantId, userId: user.id }
}

/** 成功后扣减（幂等）；失败不抛，由调用方决定是否提示 */
export async function chargeErpAiPointsAfterSuccess(
  authHeader: string | undefined,
  kind: ErpAiUsageKind,
  env: Record<string, string>,
  opts?: {
    durationSec?: number
    pointsOverride?: number
    tenantIdHint?: string
    idempotencyKey?: string
    note?: string
    tenantId?: string
  },
): Promise<{ pointsCharged: number; balance: number; already?: boolean } | null> {
  const base = supabaseBase(env)
  const serviceRole = serviceRoleKey(env)
  if (!base || !serviceRole) return null

  let tenantId = String(opts?.tenantId || '').trim()
  if (!tenantId) {
    const user = await verifyBearerJwt(authHeader, env)
    if (!user) return null
    const jwt = bearerFromAuth(authHeader)
    const ctx = await loadTenantAiContextForUser(user.id, env, jwt || undefined, opts?.tenantIdHint)
    if (!ctx) return null
    tenantId = ctx.tenantId
  }

  const admin = createClient(base, serviceRole, nodeSupabaseClientOptions())
  const result = await spendErpAiPoints(admin, tenantId, {
    kind,
    durationSec: opts?.durationSec,
    pointsOverride: opts?.pointsOverride,
    idempotencyKey: opts?.idempotencyKey,
    note: opts?.note,
  })
  if (!result.ok) return null
  return {
    pointsCharged: result.pointsCharged,
    balance: result.balance,
    already: result.already,
  }
}

export function sendErpAiPointsGateError(
  res: VercelResponse,
  sendJson: (res: VercelResponse, status: number, body: Record<string, unknown>) => void,
  gate: ErpAiApiPointsGateFail,
): void {
  sendJson(res, gate.status, {
    ok: false,
    error: gate.error,
    message: gate.message,
    required: gate.required,
    balance: gate.balance,
  })
}

export function authHeaderFromRequest(req: VercelRequest): string | undefined {
  return typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
}

/** Node Gateway：从 IncomingMessage 风格 headers 取 Bearer */
export function authHeaderFromNodeHeaders(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined
  const raw = headers.authorization ?? headers.Authorization
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim()
  return undefined
}

/**
 * 商家网关 AI：先校验积分 → 执行 → 成功后扣减。
 * run 返回 ok:false 不扣费；blocked 时调用方应直接写 HTTP 响应。
 */
export async function runErpAiWithPointsBilling<T extends { ok: boolean }>(
  authHeader: string | undefined,
  kind: ErpAiUsageKind,
  env: Record<string, string>,
  opts: { note: string; idempotencyKey?: string; pointsOverride?: number },
  run: () => Promise<T>,
): Promise<
  | { blocked: true; status: number; error: string; message: string; required?: number; balance?: number }
  | { blocked: false; result: T & { pointsCharged?: number; pointsBalance?: number } }
> {
  const gate = await requireErpAiPointsAffordable(authHeader, kind, env, {
    pointsOverride: opts.pointsOverride,
  })
  if (!gate.ok) {
    return {
      blocked: true,
      status: gate.status,
      error: gate.error,
      message: gate.message,
      required: gate.required,
      balance: gate.balance,
    }
  }
  const result = await run()
  if (!result || result.ok === false) {
    return { blocked: false, result }
  }
  const charge = await chargeErpAiPointsAfterSuccess(authHeader, kind, env, {
    tenantId: gate.tenantId,
    pointsOverride: opts.pointsOverride,
    idempotencyKey:
      opts.idempotencyKey ||
      `${kind}:${gate.userId}:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    note: opts.note,
  })
  if (!charge) return { blocked: false, result }
  return {
    blocked: false,
    result: {
      ...result,
      pointsCharged: charge.pointsCharged,
      pointsBalance: charge.balance,
    },
  }
}
