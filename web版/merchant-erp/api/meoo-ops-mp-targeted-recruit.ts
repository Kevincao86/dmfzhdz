/**
 * POST /api/meoo-ops-mp-targeted-recruit — 定向邀约招募
 * body: { action, mpOrderId, talentMemberIds?, inviteId?, response?, rejectReason?, talentMemberId?, inviteResponseHours? }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  cancelTargetedInviteInSnapshot,
  confirmTargetedInvitePhaseInSnapshot,
  expirePendingInvites,
  listTargetedInvitesForTalent,
  maybeFinalizeTargetedInvitePhaseInSnapshot,
  pushSubscribeForTargetedInvites,
  readTargetedMeta,
  respondTargetedInviteInSnapshot,
  sendTargetedInvitesInSnapshot,
  targetedInviteStats,
} from '../src/lib/mpTargetedRecruitCore.js'

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

    const action = String(body.action || '').trim()
    const mpOrderId = String(body.mpOrderId || '').trim()
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (action === 'list_for_talent') {
      const talentMemberId = String(body.talentMemberId || '').trim()
      if (!talentMemberId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_talent_member_id' })
        return
      }
      const invites = listTargetedInvitesForTalent(data, talentMemberId)
      sendOpsJson(res, 200, { ok: true, invites })
      return
    }

    if (action === 'order_summary') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const mp = (data.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      if (!mp) {
        sendOpsJson(res, 404, { ok: false, error: 'not_found' })
        return
      }
      let working = data
      const fin = maybeFinalizeTargetedInvitePhaseInSnapshot(working, mpOrderId)
      working = fin.data
      if (fin.changed) await io.save(working)
      const mpAfter = (working.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId) || mp
      const meta = readTargetedMeta(mpAfter)
      const invites = expirePendingInvites(meta.targetedInvites || [], meta.inviteDeadline)
      sendOpsJson(res, 200, {
        ok: true,
        stats: targetedInviteStats(invites),
        meta,
        invites,
        finalized: fin.finalized,
      })
      return
    }

    if (action === 'send_invites') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const talentMemberIds = Array.isArray(body.talentMemberIds)
        ? body.talentMemberIds.map(String)
        : []
      const inviteResponseHours = body.inviteResponseHours != null ? Number(body.inviteResponseHours) : undefined
      const result = sendTargetedInvitesInSnapshot(data, mpOrderId, talentMemberIds, { inviteResponseHours })
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      let working = result.data
      const fin = maybeFinalizeTargetedInvitePhaseInSnapshot(working, mpOrderId)
      working = fin.data
      const mp = (working.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      const newInvites = (result.body.newInvites as { id: string }[]) || []
      let subscribe = { sent: 0, failed: [] as string[] }
      if (mp && newInvites.length) {
        subscribe = await pushSubscribeForTargetedInvites(working, mp, newInvites as never)
      }
      await io.save(working)
      sendOpsJson(res, 200, { ...result.body, subscribe, finalized: fin.finalized })
      return
    }

    if (action === 'respond') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const talentMemberId = String(body.talentMemberId || '').trim()
      const response = body.response === 'reject' ? 'reject' : 'accept'
      const rejectReason = String(body.rejectReason || '').trim()
      if (!talentMemberId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_talent_member_id' })
        return
      }
      const result = respondTargetedInviteInSnapshot(data, mpOrderId, talentMemberId, response, rejectReason)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      let working = result.data
      const fin = maybeFinalizeTargetedInvitePhaseInSnapshot(working, mpOrderId)
      working = fin.data
      await io.save(working)
      sendOpsJson(res, 200, { ...result.body, finalized: fin.finalized })
      return
    }

    if (action === 'cancel_invite') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const inviteId = String(body.inviteId || '').trim()
      if (!inviteId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_invite_id' })
        return
      }
      const result = cancelTargetedInviteInSnapshot(data, mpOrderId, inviteId)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      let working = result.data
      const fin = maybeFinalizeTargetedInvitePhaseInSnapshot(working, mpOrderId)
      working = fin.data
      await io.save(working)
      sendOpsJson(res, 200, { ...result.body, finalized: fin.finalized })
      return
    }

    if (action === 'finalize_if_needed') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const fin = maybeFinalizeTargetedInvitePhaseInSnapshot(data, mpOrderId)
      if (fin.changed) await io.save(fin.data)
      sendOpsJson(res, 200, { ok: true, finalized: fin.finalized, changed: fin.changed })
      return
    }

    if (action === 'confirm_invite_phase') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const result = confirmTargetedInvitePhaseInSnapshot(data, mpOrderId)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      await io.save(result.data)
      sendOpsJson(res, 200, result.body)
      return
    }

    sendOpsJson(res, 400, { ok: false, error: 'unknown_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, error: 'internal_error', message: msg.slice(0, 200) })
  }
}
