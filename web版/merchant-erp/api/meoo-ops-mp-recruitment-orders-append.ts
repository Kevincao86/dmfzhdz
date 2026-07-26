/**
 * POST /api/meoo-ops-mp-recruitment-orders-append — 达人招募小程序/运营台创建小程序招募单。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryMpRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'
import { MAX_GROUP_QR_PERSIST_LEN, normalizeMpRecruitmentOrderForRegistryPersist, sanitizeValueForPostgresJson, stripOrderInlineImagesForPersist } from '../src/lib/mpRecruitmentRegistryPersist.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  appendMpRecruitmentOrderViaPg,
  readRegistryPgConnectionString,
} from '../src/lib/registrySnapshotPgAppend.js'
import { isFormRelayGroupQrRelay, readExternalFormRelay } from '../src/lib/formRelayPlatforms.js'
import { isFormRelayGroupQrFeatureEnabled } from '../src/lib/formRelayGroupQrFeature.js'
import { notifySubscribersForNewOrder } from '../src/lib/mpSubscribeMessageSend.js'
import { isTargetedRecruitOrder } from '../src/lib/mpTargetedRecruitCore.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

async function appendViaRegistryIo(
  supabaseUrl: string,
  serviceRole: string,
  order: RegistryMpRecruitmentOrder,
): Promise<void> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const list = [...(data.mpRecruitmentOrders ?? [])]
  const sid = String(order.sourceMerchantOrderId || '').trim()
  const dup = list.find((o) => o && String(o.sourceMerchantOrderId || '').trim() === sid)
  if (dup) {
    const err = new Error('duplicate_merchant_order')
    ;(err as Error & { existingId?: string; status?: number }).existingId = dup.id
    ;(err as Error & { status?: number }).status = 409
    throw err
  }
  list.unshift(stripOrderInlineImagesForPersist(normalizeMpRecruitmentOrderForRegistryPersist(order)))
  data.mpRecruitmentOrders = list
  await io.save(data)
}

async function fireOrderSubscriptionPush(
  supabaseUrl: string,
  serviceRole: string,
  order: RegistryMpRecruitmentOrder,
): Promise<{ sent: number; skipped: number; failed: string[] }> {
  if (isTargetedRecruitOrder(order)) {
    return { sent: 0, skipped: 0, failed: [] }
  }
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  return notifySubscribersForNewOrder(data, order)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    let body: { order?: RegistryMpRecruitmentOrder }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { order?: RegistryMpRecruitmentOrder }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const order = sanitizeValueForPostgresJson(body.order) as RegistryMpRecruitmentOrder
    if (!order || !order.id || !order.sourceMerchantOrderId) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_mp_order' })
      return
    }
    const meta =
      order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
        ? (order.mpPublishMeta as Record<string, unknown>)
        : null
    const groupQrLen = Math.max(
      String(order.groupQrImage || '').length,
      String(meta?.groupQrImage || '').length,
    )
    if (groupQrLen > MAX_GROUP_QR_PERSIST_LEN) {
      sendOpsJson(res, 400, {
        ok: false,
        error: 'group_qr_too_large',
        hint: '群二维码图片过大，请换一张更小的截图后重试',
      })
      return
    }

    const relayEarly = readExternalFormRelay(order as unknown as Record<string, unknown>)
    if (relayEarly && isFormRelayGroupQrRelay(relayEarly) && !isFormRelayGroupQrFeatureEnabled()) {
      sendOpsJson(res, 503, { ok: false, error: 'group_qr_coming_soon' })
      return
    }

    if (readRegistryPgConnectionString()) {
      const pgResult = await appendMpRecruitmentOrderViaPg(order)
      if (pgResult.ok) {
        const relay = readExternalFormRelay(order as unknown as Record<string, unknown>)
        const needsGroupQr = !!relay && isFormRelayGroupQrRelay(relay)
        const hasGroupQrInRequest = groupQrLen > 0
        if (needsGroupQr && hasGroupQrInRequest && !pgResult.groupQrSaved) {
          sendOpsJson(res, 500, {
            ok: false,
            error: 'group_qr_not_persisted',
            hint: '群二维码未写入服务器，请重新上传群码后发布',
          })
          return
        }
        sendOpsJson(res, 200, {
          ok: true,
          id: order.id,
          via: 'pg',
          groupQrSaved: pgResult.groupQrSaved,
          subscribe: await fireOrderSubscriptionPush(supabaseUrl, serviceRole, order).catch((e) => {
            const msg = e instanceof Error ? e.message : String(e)
            console.warn('[append] order subscription push failed', msg)
            return { sent: 0, skipped: 0, failed: [msg.slice(0, 120)] }
          }),
        })
        return
      }
      if (pgResult.error === 'duplicate_merchant_order') {
        sendOpsJson(res, 409, {
          ok: false,
          error: 'duplicate_merchant_order',
          existingId: pgResult.existingId,
        })
        return
      }
      if (pgResult.error === 'group_qr_too_large') {
        sendOpsJson(res, 400, {
          ok: false,
          error: 'group_qr_too_large',
          hint: '群二维码图片过大，请换一张更小的截图后重试',
        })
        return
      }
    }

    await appendViaRegistryIo(supabaseUrl, serviceRole, order)
    sendOpsJson(res, 200, {
      ok: true,
      id: order.id,
      via: 'registry_io',
      subscribe: await fireOrderSubscriptionPush(supabaseUrl, serviceRole, order).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn('[append] order subscription push failed', msg)
        return { sent: 0, skipped: 0, failed: [msg.slice(0, 120)] }
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = (e as Error & { status?: number }).status
    const existingId = (e as Error & { existingId?: string }).existingId
    if (status === 409 || msg === 'duplicate_merchant_order') {
      sendOpsJson(res, 409, {
        ok: false,
        error: 'duplicate_merchant_order',
        existingId,
      })
      return
    }
    const tooLarge = /413|Request Entity Too Large|entity too large|PGRST102|Empty or invalid json|registry_patch_too_large/i.test(
      msg,
    )
    if (msg === 'group_qr_not_persisted') {
      sendOpsJson(res, 500, {
        ok: false,
        error: 'group_qr_not_persisted',
        hint: '群二维码未写入服务器，请重新上传群码后发布',
      })
      return
    }
    sendOpsJson(res, tooLarge ? 413 : 500, {
      ok: false,
      error: 'meoo_ops_mp_recruitment_orders_append_failed',
      code: tooLarge ? 'request_entity_too_large' : 'append_failed',
      hint: tooLarge
        ? '注册表整表保存失败。请确认 ECS auth-api 已部署 registry-pg-append 并含 POSTGRES_PASSWORD'
        : undefined,
      detail: msg.slice(0, 800),
    })
  }
}
