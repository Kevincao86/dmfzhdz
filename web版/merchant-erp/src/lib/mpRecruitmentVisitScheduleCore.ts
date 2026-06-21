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
      visitTimeSlot: String(
        (a as Record<string, unknown>).talentPreferredVisitAt || a.visitTimeSlot || '',
      ).trim(),
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
    const preferred = String(
      (a as Record<string, unknown>).talentPreferredVisitAt || a.visitTimeSlot || '',
    ).trim()
    const d = new Date(base)
    d.setDate(d.getDate() + Math.floor(i / Math.max(1, slots.length)))
    const slot = slots[i % slots.length]!
    const datePart = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
    const time = preferred || `${datePart} ${slot}`
    let tableNote = shareTable
      ? `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份`
      : '单独探店'
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
  effective = false,
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
  const assignStatus = effective ? 'confirmed' : 'pr_draft'
  for (const row of valid) {
    const hit = applicants.find((a) => a && String(a.id) === row.applicantId)
    if (!hit) continue
    const patch: Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown> = {
      assignedVisitAt: row.time,
      assignedVisitStore: row.storeName || mp.storeName,
      tableNote: row.tableNote,
      tableGroupId: row.tableGroupId,
      scheduleAssignedAt: now,
      scheduleAssignedBy: assignedBy,
      visitAssignmentStatus: assignStatus,
      visitStatus: effective ? 'scheduled' : 'pending_assign',
      groupJoinStatus: effective ? 'confirmed' : hit.groupJoinStatus || 'pending',
    }
    if (effective) patch.visitAssignmentConfirmedAt = now
    applicants = patchApplicant(applicants, row.applicantId, patch)
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

  const sortedSlots = [...valid]
    .map((r) => r.time)
    .sort((a, b) => parseVisitDayMs(a) - parseVisitDayMs(b) || a.localeCompare(b))

  const scheduleMeta = {
    ...prevMetaObj,
    visitSlots: sortedSlots,
    scheduleSentAt: effective ? now : prevMetaObj.scheduleSentAt || now,
    scheduleDraftAt: now,
    scheduleEffectiveAt: effective ? now : prevMetaObj.scheduleEffectiveAt,
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
  const s = String(input || '').trim().replace(/\s+/g, ' ')
  if (s.length < 2 || s.length > 48) return null
  return s
}

function normalizeVisitDateKey(raw: string): string | null {
  const fromPlan = normalizePlanDate(raw)
  if (fromPlan) return fromPlan
  const fromTalent = normalizeTalentVisitDate(raw)
  if (!fromTalent) return null
  const m = fromTalent.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

function normalizeSlotCompareKey(raw: string): string | null {
  const s = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!s) return null
  const m = s.match(/^(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})$/)
  if (m) {
    const pad = (t: string) => {
      const p = t.split(':')
      return `${String(Number(p[0])).padStart(2, '0')}:${p[1]}`
    }
    return `${pad(m[1])}-${pad(m[2])}`
  }
  return s
}

/** PR 已确认可探店日期后，达人意向须落在锁定日期/时段内 */
export function validateTalentVisitAgainstLockedPlan(
  mp: RegistryMpRecruitmentOrder,
  visitDate: string,
  visitTimeSlot: string,
): { ok: true } | { ok: false; error: string; code?: string } {
  if (!isVisitPlanDatesConfirmed(mp)) return { ok: true }
  const planRows = readVisitPlanDates(mp)
  if (!planRows.length) {
    return { ok: false, error: 'PR 尚未开放可探店日期', code: 'plan_not_ready' }
  }
  const dateKey = normalizeVisitDateKey(visitDate)
  if (!dateKey) return { ok: false, error: '探店日期无效', code: 'invalid_date' }
  const slotKey = normalizeSlotCompareKey(visitTimeSlot)
  if (!slotKey) return { ok: false, error: '探店时段无效', code: 'invalid_slot' }
  const day = planRows.find((row) => normalizeVisitDateKey(row.date) === dateKey)
  if (!day) {
    return { ok: false, error: '所选日期不在 PR 开放的可探店日期内', code: 'date_not_in_plan' }
  }
  const allowed = day.slots.some((slot) => normalizeSlotCompareKey(slot) === slotKey)
  if (!allowed) {
    return { ok: false, error: '所选时段不在 PR 开放的可探店时段内', code: 'slot_not_in_plan' }
  }
  return { ok: true }
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
  const existingPreferred = String(me.talentPreferredVisitAt || '').trim()
  const existingConfirmed = String(me.scheduleConfirmedAt || '').trim()
  const assignSt = String(me.visitAssignmentStatus || '').trim()
  const isEffective = assignSt === 'confirmed' && !!String(me.assignedVisitAt || '').trim()
  if (existingConfirmed && existingPreferred && isEffective) {
    return { ok: true, mp }
  }
  const visitDate = normalizeTalentVisitDate(String(input?.visitDate || ''))
  const visitTimeSlot = normalizeTalentVisitTimeSlot(String(input?.visitTimeSlot || ''))
  if (!visitDate) {
    return { ok: false, error: '请选择探店日期', code: 'visit_date_required' }
  }
  if (!visitTimeSlot) {
    return { ok: false, error: '请填写探店时间段', code: 'visit_slot_required' }
  }
  const planCheck = validateTalentVisitAgainstLockedPlan(mp, visitDate, visitTimeSlot)
  if (!planCheck.ok) return planCheck
  const talentPreferredVisitAt = `${visitDate} ${visitTimeSlot}`
  const now = nowStr()
  const nextApplicants = patchApplicant(applicants, id, {
    scheduleConfirmedAt: existingConfirmed || now,
    visitTimeSlot,
    talentPreferredVisitAt,
    visitAssignmentStatus: 'talent_preferred',
    groupJoinStatus: me.groupJoinStatus || 'pending',
    visitStatus: 'pending_assign',
    talentVisitPlanAt: existingConfirmed ? me.talentVisitPlanAt || now : now,
    talentVisitUpdatedAt: existingPreferred ? now : undefined,
  } as Partial<RegistryMpRecruitmentApplicant> & Record<string, unknown>)
  return {
    ok: true,
    mp: { ...mp, applicants: nextApplicants, updatedAt: now },
  }
}

/** 达人待探店阶段修改已生效排期 — PR 确认后锁定，仅招募方后台可改 */
export function talentUpdateVisitPlanOnMp(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  _input?: TalentAcceptSelectionInput,
):
  | { ok: true; mp: RegistryMpRecruitmentOrder; assignedVisitAt: string }
  | { ok: false; error: string; code?: string } {
  const id = String(applicantId || '').trim()
  const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
  const me = applicants.find((a) => a && String(a.id) === id) as
    | (RegistryMpRecruitmentApplicant & Record<string, unknown>)
    | undefined
  if (!me) return { ok: false, error: '报名记录不存在', code: 'not_found' }
  if (String(me.visitCheckInAt || '').trim()) {
    return { ok: false, error: '已签到不可修改排期', code: 'already_checked_in' }
  }
  const st = String(me.visitAssignmentStatus || '').trim()
  if (st === 'confirmed' && String(me.assignedVisitAt || '').trim()) {
    return {
      ok: false,
      error: '排期已由招募方确认，如需调整请联系招募方',
      code: 'schedule_locked',
    }
  }
  return { ok: false, error: '排期尚未生效，请等待 PR 确认', code: 'not_effective' }
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
  rows: { time: string; talentName: string; talentId?: string; id?: string; storeName?: string; tableNote?: string }[],
): VisitScheduleAssignRow[] {
  const pool = selectedApplicants(mp)
  const out: VisitScheduleAssignRow[] = []
  const used = new Set<string>()
  for (const row of rows) {
    const talentId = String(row.talentId || row.id || '').trim()
    const name = String(row.talentName || '').trim()
    let hit = talentId ? pool.find((a) => String(a.id) === talentId) : undefined
    if (!hit && name) {
      hit =
        pool.find((a) => applicantDisplayName(a) === name) ||
        pool.find((a) => applicantDisplayName(a).includes(name) || name.includes(applicantDisplayName(a)))
    }
    if (!hit || used.has(String(hit.id))) continue
    used.add(String(hit.id))
    out.push({
      applicantId: String(hit.id),
      time: String(row.time || '').trim(),
      storeName: String(row.storeName || '').trim(),
      tableNote: String(row.tableNote || '').trim(),
    })
  }
  if (!out.length && rows.length === pool.length) {
    return pool.map((a, i) => ({
      applicantId: String(a.id),
      time: String(rows[i]?.time || '').trim(),
      storeName: String(rows[i]?.storeName || '').trim(),
      tableNote: String(rows[i]?.tableNote || '').trim(),
    }))
  }
  return out
}

export type VisitPlanDateRow = { date: string; slots: string[] }

function normalizePlanDate(raw: string): string | null {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${pad(mo)}-${pad(d)}`
}

function normalizePlanSlot(raw: string): string | null {
  const s = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!s || s.length > 48) return null
  return s
}

/** PR 确认可探店日期与时段（进入拖拽排期前的第一步） */
export function saveVisitPlanDatesOnMp(
  mp: RegistryMpRecruitmentOrder,
  input: {
    visitPlanDates: VisitPlanDateRow[]
    category?: string
    shareTable?: boolean
    mealCount?: number
    tableSize?: number
  },
):
  | { ok: true; mp: RegistryMpRecruitmentOrder }
  | { ok: false; error: string; code?: string } {
  if (isIceMpOrder(mp)) return { ok: false, error: '云剪任务无需探店排期', code: 'not_visit_order' }
  if (isVisitPlanDatesConfirmed(mp)) {
    return { ok: false, error: '可探店日期与时段已锁定，不可修改', code: 'dates_locked' }
  }
  const visitPlanDates = (input.visitPlanDates || [])
    .map((row) => {
      const date = normalizePlanDate(row.date)
      const slots = (Array.isArray(row.slots) ? row.slots : [])
        .map((s) => normalizePlanSlot(String(s || '')))
        .filter(Boolean) as string[]
      return date && slots.length ? { date, slots: [...new Set(slots)] } : null
    })
    .filter(Boolean) as VisitPlanDateRow[]
  if (!visitPlanDates.length) {
    return { ok: false, error: '请至少设置一天可探店时段', code: 'empty_plan' }
  }

  const flatSlots: string[] = []
  for (const day of visitPlanDates) {
    const datePart = day.date.replace(/-/g, '/')
    for (const slot of day.slots) {
      flatSlots.push(`${datePart} ${slot}`)
    }
  }

  const now = nowStr()
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
    visitPlanDates,
    visitSlots: flatSlots,
    scheduleDatesConfirmedAt: now,
    category: String(input.category || prevMetaObj.category || mp.category || '').trim() || undefined,
    ...(input.shareTable !== undefined
      ? { shareTable: input.shareTable !== false }
      : prevMetaObj.shareTable !== undefined
        ? { shareTable: prevMetaObj.shareTable !== false }
        : {}),
    ...(input.mealCount !== undefined
      ? { mealCount: Math.max(1, Number(input.mealCount) || 1) }
      : prevMetaObj.mealCount !== undefined
        ? { mealCount: Math.max(1, Number(prevMetaObj.mealCount) || 1) }
        : {}),
    ...(input.tableSize !== undefined
      ? { tableSize: Math.max(2, Number(input.tableSize) || 4) }
      : prevMetaObj.tableSize !== undefined
        ? { tableSize: Math.max(2, Number(prevMetaObj.tableSize) || 4) }
        : {}),
  }

  return {
    ok: true,
    mp: {
      ...mp,
      updatedAt: now,
      mpPublishMeta: {
        ...(mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}),
        visitScheduleMeta: scheduleMeta,
      },
    },
  }
}

export function readVisitPlanDates(
  mp: RegistryMpRecruitmentOrder | Record<string, unknown> | null | undefined,
): VisitPlanDateRow[] {
  if (!mp || typeof mp !== 'object') return []
  const meta = (mp as RegistryMpRecruitmentOrder).mpPublishMeta
  if (!meta || typeof meta !== 'object') return []
  const sm = (meta as Record<string, unknown>).visitScheduleMeta
  if (!sm || typeof sm !== 'object' || Array.isArray(sm)) return []
  const rows = (sm as Record<string, unknown>).visitPlanDates
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const date = normalizePlanDate(String((row as Record<string, unknown>).date || ''))
      const slots = (Array.isArray((row as Record<string, unknown>).slots)
        ? ((row as Record<string, unknown>).slots as unknown[])
        : []
      )
        .map((s) => normalizePlanSlot(String(s || '')))
        .filter(Boolean) as string[]
      return date && slots.length ? { date, slots } : null
    })
    .filter(Boolean) as VisitPlanDateRow[]
}

export function isVisitPlanDatesConfirmed(
  mp: RegistryMpRecruitmentOrder | Record<string, unknown> | null | undefined,
): boolean {
  if (!mp || typeof mp !== 'object') return false
  const meta = (mp as RegistryMpRecruitmentOrder).mpPublishMeta
  if (!meta || typeof meta !== 'object') return false
  const sm = (meta as Record<string, unknown>).visitScheduleMeta
  if (!sm || typeof sm !== 'object' || Array.isArray(sm)) return false
  return Boolean(String((sm as Record<string, unknown>).scheduleDatesConfirmedAt || '').trim())
}
