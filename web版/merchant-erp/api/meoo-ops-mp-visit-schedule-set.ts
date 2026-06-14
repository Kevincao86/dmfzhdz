/**
 * POST /api/meoo-ops-mp-visit-schedule-set — PR 手动/AI 探店排期并下发达人。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  assignVisitSchedulesOnMp,
  buildVisitScheduleAiContext,
  generateRuleBasedVisitSchedule,
  mapAssignRowsByApplicantName,
  findMpOrderIndex,
  type VisitScheduleAssignRow,
} from '../src/lib/mpRecruitmentVisitScheduleCore.js'
import { resolveTalentMemberIdForApplicant } from '../src/lib/merchantRecruitmentInbox.js'
import type { RegistryMpTalentInboxItem, RegistrySnapshot } from '../src/lib/opsRegistryTypes.js'

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

function appendInboxForSchedule(
  data: RegistrySnapshot,
  mpOrderId: string,
  applied: VisitScheduleAssignRow[],
  reg: RegistrySnapshot,
) {
  const mp = data.mpRecruitmentOrders?.find((o) => o && o.id === mpOrderId)
  if (!mp) return
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const list = data.mpTalentInbox ?? []
  for (const row of applied) {
    const applicant = (mp.applicants || []).find((a) => a && String(a.id) === row.applicantId)
    if (!applicant) continue
    const talentMemberId = resolveTalentMemberIdForApplicant(applicant, reg)
    list.unshift({
      id: `inbox-sched-${Date.now()}-${row.applicantId}`,
      talentMemberId,
      title: '探店排期已确认',
      body: `${row.time} · ${row.storeName || mp.storeName}\n${row.tableNote || '请按时到店探店'}`,
      category: 'order',
      mpOrderId,
      applicantId: row.applicantId,
      contact: applicant.contact,
      platformAccount: applicant.platformAccount,
      noticeType: 'general',
      createdAt: now,
      read: false,
    } as RegistryMpTalentInboxItem)
  }
  data.mpTalentInbox = list.slice(0, 500)
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

    let body: {
      mpOrderId?: string
      mode?: 'manual' | 'ai'
      rows?: VisitScheduleAssignRow[]
      aiRows?: { time: string; talentName: string; storeName?: string; tableNote?: string }[]
      visitSlots?: string[]
      category?: string
      shareTable?: boolean
      mealCount?: number
      tableSize?: number
      storeName?: string
      notify?: boolean
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_order' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const idx = findMpOrderIndex(data, mpOrderId)
    if (!data.mpRecruitmentOrders || idx < 0) {
      sendOpsJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const cur = data.mpRecruitmentOrders[idx]!

    let rows: VisitScheduleAssignRow[] = []
    const mode = body.mode === 'ai' ? 'ai' : 'manual'
    const scheduleOpts = {
      visitSlots: Array.isArray(body.visitSlots) ? body.visitSlots : [],
      category: body.category,
      shareTable: body.shareTable,
      mealCount: body.mealCount,
      tableSize: body.tableSize,
      storeName: body.storeName,
    }
    if (mode === 'ai') {
      if (Array.isArray(body.aiRows) && body.aiRows.length) {
        rows = mapAssignRowsByApplicantName(cur, body.aiRows)
      }
      if (!rows.length) {
        try {
          const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
            '../vite-plugins/merchantRegistryVendorEnv.js'
          )
          const env = await mergeMerchantAiEnvWithRegistrySnapshot(
            process.cwd(),
            process.env as Record<string, string>,
          )
          const { runMpRecruitmentAiCore } = await import('../vite-plugins/mpRecruitmentAiCore.js')
          const aiOut = await runMpRecruitmentAiCore(
            JSON.stringify({
              mode: 'visit_schedule',
              context: buildVisitScheduleAiContext(cur, scheduleOpts),
            }),
            env,
          )
          if (aiOut.status === 200 && Array.isArray(aiOut.body.rows) && aiOut.body.rows.length) {
            rows = mapAssignRowsByApplicantName(
              cur,
              aiOut.body.rows as { time: string; talentName: string; storeName?: string; tableNote?: string }[],
            )
          }
        } catch {
          /* LLM 失败时回退规则引擎 */
        }
      }
      if (!rows.length) {
        rows = generateRuleBasedVisitSchedule(cur, scheduleOpts)
      }
    } else {
      rows = Array.isArray(body.rows) ? body.rows : []
    }

    const result = assignVisitSchedulesOnMp(cur, rows, mode)
    if (!result.ok) {
      sendOpsJson(res, 409, { ok: false, error: result.code || 'assign_failed', message: result.error })
      return
    }
    data.mpRecruitmentOrders![idx] = result.mp
    if (body.notify !== false) {
      appendInboxForSchedule(data, mpOrderId, result.applied, data)
    }
    await io.save(data)
    sendOpsJson(res, 200, {
      ok: true,
      applied: result.applied.length,
      rows: result.applied,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'visit_schedule_set_failed',
      detail: msg.slice(0, 800),
    })
  }
}
