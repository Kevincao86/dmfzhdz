export type MarketingActivityPlatform = 'douyin' | 'meituan' | 'xiaohongshu'

/** ERP 统一活动状态（用于筛选 Tab） */
export type MarketingActivityUiStatus = 'ongoing' | 'enrollable' | 'ended' | 'unknown'

export type MarketingActivityItem = {
  id: string
  platform: MarketingActivityPlatform
  title: string
  summary?: string
  uiStatus: MarketingActivityUiStatus
  startAt?: string
  endAt?: string
  enrollDeadline?: string
  enrollUrl?: string
  rawStatus?: string | number
}

export type MarketingActivityListResult =
  | {
      ok: true
      items: MarketingActivityItem[]
      total: number
      platform: MarketingActivityPlatform
      syncedAt: string
      upstreamNote?: string
    }
  | { ok: false; message: string; platform: MarketingActivityPlatform }
