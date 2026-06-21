import { readExternalFormRelay } from './formRelayPlatforms.js'
import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

export type MpRecruitmentEngagementAction = 'detail_view' | 'form_relay_click'

export function chinaDateKey(d = new Date()): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

type HallViewStats = {
  byDay?: Record<string, number>
  todayDate?: string
  today?: number
}

function readHallViewStats(mp: Record<string, unknown> | null | undefined): HallViewStats {
  const meta =
    mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const raw =
    meta?.hallViewStats && typeof meta.hallViewStats === 'object'
      ? (meta.hallViewStats as HallViewStats)
      : {}
  return raw
}

/** 当日查看热度（大厅排序用） */
export function resolveTodayViewCount(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || typeof mp !== 'object') return 0
  const key = chinaDateKey()
  const stats = readHallViewStats(mp)
  const byDay = stats.byDay
  if (byDay && typeof byDay[key] === 'number') return Math.max(0, byDay[key]!)
  const today = Number(stats.today ?? mp.viewsToday ?? 0)
  const todayDate = String(stats.todayDate ?? mp.viewsTodayDate ?? '').trim()
  if (todayDate === key && Number.isFinite(today)) return Math.max(0, today)
  return 0
}

export function bumpMpRecruitmentEngagement(
  order: RegistryMpRecruitmentOrder,
  action: MpRecruitmentEngagementAction,
): RegistryMpRecruitmentOrder {
  const dayKey = chinaDateKey()
  const metaRaw =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? { ...(order.mpPublishMeta as Record<string, unknown>) }
      : {}
  const statsRaw = readHallViewStats(order as unknown as Record<string, unknown>)
  const byDay: Record<string, number> = { ...(statsRaw.byDay || {}) }
  byDay[dayKey] = Math.max(0, Number(byDay[dayKey] || 0)) + 1
  const keys = Object.keys(byDay).sort()
  while (keys.length > 14) {
    delete byDay[keys.shift()!]
  }
  metaRaw.hallViewStats = {
    byDay,
    todayDate: dayKey,
    today: byDay[dayKey],
  }

  const viewCount = Math.max(0, Number(order.viewCount ?? 0)) + 1
  let applicantCount = Math.max(0, Number(order.applicantCount ?? 0))
  if (action === 'form_relay_click' && readExternalFormRelay(order as unknown as Record<string, unknown>)) {
    applicantCount += 1
  }

  return {
    ...order,
    viewCount,
    applicantCount,
    mpPublishMeta: metaRaw,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}
