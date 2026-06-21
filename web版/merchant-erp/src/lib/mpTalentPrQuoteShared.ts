/** 达人 → 指定 PR 的专属报价（注册表 mpTalentMembers） */
export type MpTalentPrExclusiveQuote = {
  prLingqiId: string
  prRegistryId?: string
  prDisplayName?: string
  /** douyin | xiaohongshu | … 或中文平台名 */
  platform: string
  quoteYuan: number
  note?: string
  updatedAt: string
}

/** 平台参考价（来客/林客/手动），暂以手动为主 */
export type MpTalentPlatformReferenceQuote = {
  platform: string
  source: 'manual' | 'laike' | 'linke'
  quoteYuan?: number
  quoteText?: string
  syncedAt?: string
}

const PLATFORM_ALIASES: Record<string, string> = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
  douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
  kuaishou: 'kuaishou',
  dianping: 'dianping',
  weixin_video: 'weixin_video',
  半天: 'half_day',
  全天: 'full_day',
  单条剪辑: 'per_clip',
  单条: 'per_clip',
  half_day: 'half_day',
  full_day: 'full_day',
  per_clip: 'per_clip',
}

export function normalizeQuotePlatform(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return 'douyin'
  return PLATFORM_ALIASES[s] || PLATFORM_ALIASES[s.toLowerCase()] || s.toLowerCase()
}

export function parseQuoteYuan(raw: unknown): number {
  const s = String(raw ?? '')
    .replace(/[,，¥￥/条]/g, '')
    .trim()
  if (!s) return 0
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map((x) => Number(x)) ?? []
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0)
  if (!valid.length) return 0
  if (valid.length === 1) return Math.round(valid[0]!)
  return Math.round((valid[0]! + valid[valid.length - 1]!) / 2)
}

export function readMpPublishPrKeys(meta: Record<string, unknown> | null | undefined): {
  prLingqiId: string
  prRegistryId: string
} {
  const m = meta && typeof meta === 'object' ? meta : {}
  return {
    prLingqiId: String(m.lingqiPrId || '').trim(),
    prRegistryId: String(m.registryPrId || '').trim(),
  }
}

/** 报名预填：有专属价则优先，否则用平台资料默认价 */
export function resolveExclusiveQuoteYuan(
  quotes: MpTalentPrExclusiveQuote[] | undefined,
  opts: { prLingqiId?: string; prRegistryId?: string; platform: string },
): number | null {
  const list = Array.isArray(quotes) ? quotes : []
  if (!list.length) return null
  const plat = normalizeQuotePlatform(opts.platform)
  const prLq = String(opts.prLingqiId || '').trim()
  const prReg = String(opts.prRegistryId || '').trim()
  for (const q of list) {
    if (normalizeQuotePlatform(q.platform) !== plat) continue
    if (prLq && String(q.prLingqiId || '').trim() === prLq) return q.quoteYuan
    if (prReg && String(q.prRegistryId || '').trim() === prReg) return q.quoteYuan
  }
  return null
}

export function sanitizeExclusiveQuotes(raw: unknown): MpTalentPrExclusiveQuote[] {
  if (!Array.isArray(raw)) return []
  const out: MpTalentPrExclusiveQuote[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const prLingqiId = String((item as MpTalentPrExclusiveQuote).prLingqiId || '').trim()
    const platform = String((item as MpTalentPrExclusiveQuote).platform || '').trim()
    const quoteYuan = parseQuoteYuan((item as MpTalentPrExclusiveQuote).quoteYuan)
    if (!prLingqiId || !platform || quoteYuan <= 0) continue
    out.push({
      prLingqiId,
      prRegistryId: String((item as MpTalentPrExclusiveQuote).prRegistryId || '').trim() || undefined,
      prDisplayName: String((item as MpTalentPrExclusiveQuote).prDisplayName || '').trim() || undefined,
      platform,
      quoteYuan,
      note: String((item as MpTalentPrExclusiveQuote).note || '').trim() || undefined,
      updatedAt:
        String((item as MpTalentPrExclusiveQuote).updatedAt || '').trim() ||
        new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }
  return out.slice(0, 200)
}
