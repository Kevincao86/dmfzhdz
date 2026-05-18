import type {
  RegistryFile,
  RegistryMpRecruitmentApplicant,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'

export function talentLibraryDedupeKey(platform: string, platformAccount: string): string {
  const plat = normalizeRecruitmentPlatform(platform)
  return `${plat}::${platformAccount.trim().toLowerCase()}`
}

/** 报名成功后写入/更新墨典达人库（按平台+达人ID去重，报价取最新） */
export function upsertTalentLibraryFromApplicant(
  data: RegistryFile,
  opts: {
    platform: string
    applicant: RegistryMpRecruitmentApplicant
    mpOrderId: string
    merchantOrderNo: string
  },
): void {
  const account = String(opts.applicant.platformAccount || '').trim()
  if (!account) return
  const plat = normalizeRecruitmentPlatform(opts.platform)
  const key = talentLibraryDedupeKey(plat, account)
  const list = [...(data.talentLibraryEntries ?? [])]
  const idx = list.findIndex((e) => talentLibraryDedupeKey(e.platform, e.platformAccount) === key)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const alipay = String(opts.applicant.alipayAccount || '').trim()
  const paymentMethod = alipay ? `支付宝：${alipay}` : '支付宝'

  const next: RegistryTalentLibraryEntry = {
    id: idx >= 0 ? list[idx]!.id : `TL-${Date.now()}`,
    platform: plat,
    platformAccount: account,
    platformNickname: opts.applicant.platformNickname || opts.applicant.name,
    profileLink: String(opts.applicant.profileLink || (idx >= 0 ? list[idx]!.profileLink : '') || '').trim(),
    followers: Math.max(0, opts.applicant.followers || 0),
    douyinSalesLevel:
      plat === '抖音' ? String(opts.applicant.douyinSalesLevel || '').trim() || undefined : undefined,
    contact: String(opts.applicant.contact || '').trim(),
    wechatId: String(opts.applicant.wechatId || '').trim(),
    quotePrice: String(opts.applicant.quotePrice || '').trim(),
    paymentMethod,
    alipayAccount: alipay || undefined,
    visitTimeSlot: String(opts.applicant.visitTimeSlot || '').trim() || undefined,
    updatedAt: now,
    lastMpOrderId: opts.mpOrderId,
    lastMerchantOrderNo: opts.merchantOrderNo,
  }

  if (idx >= 0) {
    list[idx] = { ...list[idx]!, ...next }
  } else {
    list.unshift(next)
  }
  data.talentLibraryEntries = list.slice(0, 5000)
}
