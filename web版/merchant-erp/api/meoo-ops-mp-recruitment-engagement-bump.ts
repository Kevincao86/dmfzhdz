/**
 * POST /api/meoo-ops-mp-recruitment-engagement-bump
 * - detail_view：详情页浏览 +1（当日查看热度）
 * - form_relay_click：转单原表跳转 +1 报名计数
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  bumpMpRecruitmentEngagement,
  type MpRecruitmentEngagementAction,
} from '../src/lib/mpRecruitmentEngagement.js'
import { resolveApplicantCountFromMp } from '../src/lib/mpRecruitCount.js'

export const config = { maxDuration: 30 }

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

function parseAction(raw: unknown): MpRecruitmentEngagementAction | null {
  const t = String(raw || '').trim()
  if (t === 'detail_view' || t === 'form_relay_click') return t
  return null
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

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId ?? body.id ?? '').trim()
    const action = parseAction(body.action)
    if (!mpOrderId) {
      sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
      return
    }
    if (!action) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_action' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)

    const applyOnce = async () => {
      const data = await io.load()
      const list = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders : []
      const idx = list.findIndex((o) => o && String(o.id) === mpOrderId)
      if (idx < 0) return null
      const bumped = bumpMpRecruitmentEngagement(list[idx]!, action)
      // 再读一次：浏览和跳转几乎同时写注册表，后写入的旧快照会把报名数盖回 0。
      const fresh = await io.load()
      const freshList = Array.isArray(fresh.mpRecruitmentOrders) ? fresh.mpRecruitmentOrders : []
      const freshIdx = freshList.findIndex((o) => o && String(o.id) === mpOrderId)
      if (freshIdx < 0) return null
      const disk = freshList[freshIdx]!
      const diskMeta =
        disk.mpPublishMeta && typeof disk.mpPublishMeta === 'object'
          ? { ...(disk.mpPublishMeta as Record<string, unknown>) }
          : {}
      const bumpMeta =
        bumped.mpPublishMeta && typeof bumped.mpPublishMeta === 'object'
          ? (bumped.mpPublishMeta as Record<string, unknown>)
          : {}
      const diskStats =
        diskMeta.hallViewStats && typeof diskMeta.hallViewStats === 'object'
          ? (diskMeta.hallViewStats as { byDay?: Record<string, number> })
          : {}
      const bumpStats =
        bumpMeta.hallViewStats && typeof bumpMeta.hallViewStats === 'object'
          ? (bumpMeta.hallViewStats as { byDay?: Record<string, number>; todayDate?: string })
          : {}
      const byDay: Record<string, number> = { ...(diskStats.byDay || {}) }
      for (const key of Object.keys(bumpStats.byDay || {})) {
        byDay[key] = Math.max(Number(byDay[key] || 0), Number(bumpStats.byDay?.[key] || 0))
      }
      const formRelayClickCount = Math.max(
        Number(disk.formRelayClickCount ?? 0),
        Number(bumped.formRelayClickCount ?? 0),
      )
      const applicantCount = Math.max(
        resolveApplicantCountFromMp(disk),
        resolveApplicantCountFromMp({ ...bumped, formRelayClickCount }),
      )
      fresh.mpRecruitmentOrders![freshIdx] = {
        ...disk,
        viewCount: Math.max(Number(disk.viewCount ?? 0), Number(bumped.viewCount ?? 0)),
        formRelayClickCount,
        applicantCount,
        mpPublishMeta: {
          ...diskMeta,
          hallViewStats: {
            byDay,
            todayDate: bumpStats.todayDate,
            today: bumpStats.todayDate ? byDay[bumpStats.todayDate] || 0 : 0,
          },
        },
        updatedAt: bumped.updatedAt,
      }
      await io.save(fresh)
      return fresh.mpRecruitmentOrders![freshIdx]!
    }

    let next = await applyOnce()
    if (!next) {
      sendOpsJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    if (action === 'form_relay_click') {
      const check = await io.load()
      const saved = (check.mpRecruitmentOrders || []).find((o) => o && String(o.id) === mpOrderId)
      const savedClicks = Number(saved?.formRelayClickCount ?? 0)
      const wantClicks = Number(next.formRelayClickCount ?? 0)
      if (saved && savedClicks < wantClicks) {
        const retried = await applyOnce()
        if (retried) next = retried
      }
    }

    sendOpsJson(res, 200, {
      ok: true,
      applicantCount: resolveApplicantCountFromMp(next),
      viewCount: Math.max(0, Number(next.viewCount ?? 0)),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'engagement_bump_failed',
      detail: msg.slice(0, 800),
    })
  }
}
