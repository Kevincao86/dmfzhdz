import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { isIceMpOrder } from './mpRecruitmentIceCore.js'

export type VisitScheduleAssignRow = {
  applicantId: string
  time: string
  storeName?: string
  tableNote?: string
  tableGroupId?: string
}

export type VisitScheduleAiOpts = {
  visitSlots: string[]
  category?: string
  shareTable?: boolean
  mealCount?: number
  tableSize?: number
  storeName?: string
}

function nowStr(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function applicantDisplayName(a: RegistryMpRecruitmentApplicant): string {
  return String(a.platformNickname || a.name || a.platformAccount || a.id || '').trim()
}

function selectedApplicants(mp: RegistryMpRecruitmentOrder): RegistryMpRecruitmentApplicant[] {
  const ids = new Set((mp.selectedApplicantIds || []).map(String))
  const list = Array.isArray(mp.applicants) ? mp.applicants : []
  return list.filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

function sortApplicantsForSchedule(list: RegistryMpRecruitmentApplicant[]): RegistryMpRecruitmentApplicant[] {
  return [...list].sort((a, b) => {
    const fa = Number(a.followers) || 0
    const fb = Number(b.followers) || 0
    if (fb !== fa) return fb - fa
    const ta = String(a.visitTimeSlot || '')
    const tb = String(b.visitTimeSlot || '')
    return ta.localeCompare(tb, 'zh-CN')
  })
}

export function buildVisitScheduleAiContext(
  mp: RegistryMpRecruitmentOrder,
  opts: VisitScheduleAiOpts,
): {
  title: string
  storeName: string
  category: string
  visitSlots: string[]
  shareTable: boolean
  mealCount: number
  tableSize: number
  talents: { id: string; nickname: string; followers: number | string; visitTimeSlot: string; scheduleConfirmedAt: string }[]
} {
  const pool = sortApplicantsForSchedule(selectedApplicants(mp))
  const visitSlots =
    (opts.visitSlots || []).map((s) => String(s || '').trim()).filter(Boolean) ||
    (['09:00-12:00', '14:00-17:00'] as string[])
  return {
    title: String(mp.title || '').trim(),
    storeName: String(opts.storeName || mp.storeName || '门店').trim() || '门店',
    category: String(opts.category || mp.category || '').trim(),
    visitSlots,
    shareTable: opts.shareTable !== false,
    mealCount: Math.max(1, Number(opts.mealCount) || 1),
    tableSize: Math.max(2, Number(opts.tableSize) || 4),
    talents: pool.map((a) => ({
      id: String(a.id),
      nickname: applicantDisplayName(a),
      followers: a.followers ?? '',
      visitTimeSlot: String(a.visitTimeSlot || '').trim(),
      scheduleConfirmedAt: String(a.scheduleConfirmedAt || '').trim(),
    })),
  }
}

/** 规则智能排期：按粉丝量、报名偏好时段、拼桌参数生成排期 */
export function generateRuleBasedVisitSchedule(
  mp: RegistryMpRecruitmentOrder,
  opts: VisitScheduleAiOpts,
): VisitScheduleAssignRow[] {
  const pool = sortApplicantsForSchedule(selectedApplicants(mp))
  if (!pool.length) return []
  const slots =
    (opts.visitSlots || []).map((s) => String(s || '').trim()).filter(Boolean) ||
    (['09:00-12:00', '14:00-17:00'] as string[])
  const storeName = String(opts.storeName || mp.storeName || '门店').trim() || '门店'
  const mealCount = Math.max(1, Number(opts.mealCount) || 1)
  const tableSize = Math.max(2, Number(opts.tableSize) || 4)
  const shareTable = opts.shareTable !== false
  const category = String(opts.category || mp.category || '').trim()
  const base = new Date()
  base.setDate(base.getDate() + 1)
  const rows: VisitScheduleAssignRow[] = []
  let tableGroup = 0
  pool.forEach((a, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + Math.floor(i / Math.max(1, slots.length)))
    const slot = slots[i % slots.length]!
    const datePart = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
    const time = `${datePart} ${slot}`
    let tableNote = shareTable
      ? `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份`
      : `单独探店 · 餐食 ${mealCount} 份`
    if (category.includes('餐饮') || category.includes('美食')) {
      tableNote += shareTable ? ' · 餐饮拼桌' : ' · 餐饮单独'
    }
    if (shareTable && i % tableSize === 0) tableGroup += 1
    rows.push({
      applicantId: String(a.id),
      time,
      storeName,
      tableNote,
      tableGroupId: shareTable ? `table-${tableGroup}` : `solo-${a.id}`,
    })
  })
  return rows
}

function patchApplicant(
  applicants: RegistryMpRecruitmentApplicant[],
  applicantId: string,
  patch: Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>,
): RegistryMpRecruitmentApplicant[] {
  const id = String(applicantId || '').trim()
  return applicants.map((a) => (a && String(a.id) === id ? { ...a, ...patch } : a))
}

export function assignVisitSchedulesOnMp(
  mp: RegistryMpRecruitmentOrder,
  rows: VisitScheduleAssignRow[],
  assignedBy: 'manual' | 'ai' = 'manual',
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; applied: VisitScheduleAssignRow[] }
  | { ok: false; error: string; code?: string } {
  if (isIceMpOrder(mp)) return { ok: false, error: '云剪任务无需探店排期', code: 'not_visit_order' }
  const valid = (rows || [])
    .map((r) => ({
      applicantId: String(r.applicantId || '').trim(),
      time: String(r.time || '').trim(),
      storeName: String(r.storeName || mp.storeName || '').trim(),
      tableNote: String(r.tableNote || '').trim(),
      tableGroupId: String(r.tableGroupId || '').trim(),
    }))
    .filter((r) => r.applicantId && r.time)
  if (!valid.length) return { ok: false, error: '无有效排期行', code: 'empty_schedule' }

  const now = nowStr()
  let applicants = Array.isArray(mp.applicants) ? [...mp.applicants] : []
  const applied: VisitScheduleAssignRow[] = []
  for (const row of valid) {
    const hit = applicants.find((a) => a && String(a.id) === row.applicantId)
    if (!hit) continue
    applicants = patchApplicant(applicants, row.applicantId, {
      assignedVisitAt: row.time,
      assignedVisitStore: row.storeName || mp.storeName,
      tableNote: row.tableNote,
      tableGroupId: row.tableGroupId,
      scheduleAssignedAt: now,
      scheduleAssignedBy: assignedBy,
      visitAssignmentStatus: 'pending_talent_confirm',
      visitStatus: 'scheduled',
      groupJoinStatus: 'pending',
    } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
    applied.push(row)
  }
  if (!applied.length) return { ok: false, error: '未匹配到已选达人', code: 'no_match' }

  const prevMeta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>).visitScheduleMeta
      : null
  const prevMetaObj =
    prevMeta && typeof prevMeta === 'object' && !Array.isArray(prevMeta)
      ? (prevMeta as Record<string, unknown>)
      : {}

  const scheduleMeta = {
    ...prevMetaObj,
    visitSlots: valid.map((r) => r.time),
    scheduleSentAt: now,
    assignedBy,
  }

  const next: RegistryMpRecruitmentOrder = {
    ...mp,
    applicants,
    updatedAt: now,
    mpPublishMeta: {
      ...(mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}),
      visitScheduleMeta: scheduleMeta,
    },
  }
  return { ok: true, mp: next, applied }
}

/** 达人 Step A：确认入选后填写探店日期与时段 */
export type TalentAcceptSelectionInput = {
  visitDate?: string
  visitTimeSlot?: string
}

function normalizeTalentVisitDate(input: string): string | null {
  const s = String(input || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}/${mo}/${d}`
}

function normalizeTalentVisitTimeSlot(input: string): string | null {
  const s = String(input || '').trim().replace(/\s+/g, '')
  if (!/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(s)) return null
  return s
}

export function talentAcceptSelectionOnMp(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  input?: TalentAcceptSelectionInput,
):
  | { ok: true; mp: RegistryMpRecruitmentOrder }
  | { ok: false; error: string; code?: string } {
  if (isIceMpOrder(mp)) return { ok: false, error: '请使用云剪确认流程', code: 'ice_order' }
  const id = String(applicantId || '').trim()
  const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
  const me = applicants.find((a) => a && String(a.id) === id)
  if (!me) return { ok: false, error: '报名记录不存在', code: 'not_found' }
  const selected =
    me.prSelected ||
    me.merchantSelected ||
    (mp.selectedApplicantIds || []).map(String).includes(id)
  if (!selected) return { ok: false, error: '尚未通过 PR 审核', code: 'not_selected' }
  if (String(me.scheduleConfirmedAt || '').trim() && String(me.assignedVisitAt || '').trim()) {
    return { ok: true, mp }
  }
  const visitDate = normalizeTalentVisitDate(String(input?.visitDate || ''))
  const visitTimeSlot = normalizeTalentVisitTimeSlot(String(input?.visitTimeSlot || ''))
  if (!visitDate) {
    return { ok: false, error: '请选择探店日期', code: 'visit_date_required' }
  }
  if (!visitTimeSlot) {
    return { ok: false, error: '请选择探店时间段', code: 'visit_slot_required' }
  }
  const assignedVisitAt = `${visitDate} ${visitTimeSlot}`
  const storeName = String(mp.storeName || '').trim()
  const now = nowStr()
  const nextApplicants = patchApplicant(applicants, id, {
    scheduleConfirmedAt: now,
    visitTimeSlot,
    assignedVisitAt,
    assignedVisitStore: String((me as Record<string, unknown>).assignedVisitStore || storeName || '门店').trim(),
    visitAssignmentStatus: 'confirmed',
    groupJoinStatus: me.groupJoinStatus || 'pending',
    visitStatus: 'scheduled',
    talentVisitPlanAt: now,
  } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
  return {
    ok: true,
    mp: { ...mp, applicants: nextApplicants, updatedAt: now },
  }
}

/** 达人 Step C：确认/拒绝 PR 下发的探店时间 */
export function talentConfirmAssignmentOnMp(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: 'confirm' | 'decline',
  reason?: string,
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; visitStatus: string }
  | { ok: false; error: string; code?: string } {
  const id = String(applicantId || '').trim()
  const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
  const me = applicants.find((a) => a && String(a.id) === id)
  if (!me) return { ok: false, error: '报名记录不存在', code: 'not_found' }
  const assigned = String((me as Record<string, unknown>).assignedVisitAt || '').trim()
  if (!assigned) return { ok: false, error: 'PR 尚未安排探店时间', code: 'no_assignment' }
  const now = nowStr()
  if (action === 'decline') {
    const nextApplicants = patchApplicant(applicants, id, {
      visitAssignmentStatus: 'declined',
      visitAssignmentDeclineReason: String(reason || '').trim().slice(0, 200),
      visitStatus: 'pending_assign',
    } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
    return {
      ok: true,
      mp: { ...mp, applicants: nextApplicants, updatedAt: now },
      visitStatus: 'declined',
    }
  }
  const nextApplicants = patchApplicant(applicants, id, {
    visitAssignmentStatus: 'confirmed',
    groupJoinStatus: 'confirmed',
    visitStatus: 'scheduled',
    visitAssignmentConfirmedAt: now,
  } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
  return {
    ok: true,
    mp: { ...mp, applicants: nextApplicants, updatedAt: now },
    visitStatus: 'scheduled',
  }
}

export function parseVisitDayMs(timeStr: string): number {
  const s = String(timeStr || '').trim()
  if (!s) return 0
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const t = new Date(y, mo, d).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

export function isVisitCheckInDay(assignedVisitAt: string, nowMs = Date.now()): boolean {
  const dayMs = parseVisitDayMs(assignedVisitAt)
  if (!dayMs) return false
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dayMs)
  end.setHours(23, 59, 59, 999)
  return nowMs >= start.getTime() && nowMs <= end.getTime()
}

export function talentVisitCheckInOnMp(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  method = 'manual',
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; checkInAt: string }
  | { ok: false; error: string; code?: string } {
  const id = String(applicantId || '').trim()
  const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
  const me = applicants.find((a) => a && String(a.id) === id) as
    | (RegistryMpRecruitmentApplicant & Record<string, unknown>)
    | undefined
  if (!me) return { ok: false, error: '报名记录不存在', code: 'not_found' }
  const assigned = String(me.assignedVisitAt || '').trim()
  if (!assigned) return { ok: false, error: '尚未安排探店时间', code: 'no_assignment' }
  if (me.visitAssignmentStatus === 'pending_talent_confirm') {
    return { ok: false, error: '请先确认探店排期', code: 'assignment_pending' }
  }
  if (me.visitAssignmentStatus === 'declined') {
    return { ok: false, error: '您已反馈档期冲突，请联系 PR', code: 'assignment_declined' }
  }
  if (!isVisitCheckInDay(assigned)) {
    return { ok: false, error: '仅探店当天可签到', code: 'not_visit_day' }
  }
  if (String(me.visitCheckInAt || '').trim()) {
    return { ok: true, mp, checkInAt: String(me.visitCheckInAt) }
  }
  const now = nowStr()
  const nextApplicants = patchApplicant(applicants, id, {
    visitCheckInAt: now,
    visitCheckInMethod: method,
    visitStatus: 'checked_in',
    groupJoinStatus: 'joined',
  } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
  return {
    ok: true,
    mp: { ...mp, applicants: nextApplicants, updatedAt: now },
    checkInAt: now,
  }
}

export function findMpOrderIndex(data: RegistrySnapshot, mpOrderId: string): number {
  return data.mpRecruitmentOrders?.findIndex((o) => o && o.id === mpOrderId) ?? -1
}

export function mapAssignRowsByApplicantName(
  mp: RegistryMpRecruitmentOrder,
  rows: { time: string; talentName: string; storeName?: string; tableNote?: string }[],
): VisitScheduleAssignRow[] {
  const pool = selectedApplicants(mp)
  const out: VisitScheduleAssignRow[] = []
  for (const row of rows) {
    const name = String(row.talentName || '').trim()
    if (!name) continue
    const hit =
      pool.find((a) => applicantDisplayName(a) === name) ||
      pool.find((a) => applicantDisplayName(a).includes(name) || name.includes(applicantDisplayName(a)))
    if (!hit) continue
    out.push({
      applicantId: String(hit.id),
      time: String(row.time || '').trim(),
      storeName: String(row.storeName || '').trim(),
      tableNote: String(row.tableNote || '').trim(),
    })
  }
  return out
}
