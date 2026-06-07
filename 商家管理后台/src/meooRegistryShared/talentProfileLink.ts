import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'

const URL_IN_TEXT_RE = /https?:\/\/[^\s\u4e00-\u9fff，。；！？、「」""''()（）【】]+/i

/** 从分享口令或纯链接中提取可跳转 URL */
export function extractProfileLinkUrl(raw: unknown): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  const m = text.match(URL_IN_TEXT_RE)
  if (m?.[0]) return m[0].replace(/[.,;:!?)、】]+$/, '')
  const first = text.split(/\s+/)[0] || ''
  if (/^https?:\/\//i.test(first)) return first
  if (/^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}/i.test(first)) return `https://${first}`
  return ''
}

export function resolveTalentProfileHref(platform: string, rawLink: unknown): string {
  const url = extractProfileLinkUrl(rawLink)
  if (!url) return ''
  const plat = normalizeRecruitmentPlatform(platform)
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (plat === '抖音' && (host.includes('douyin') || host.includes('iesdouyin'))) return url
    if (plat === '小红书' && (host.includes('xiaohongshu') || host.includes('xhslink'))) return url
    if (plat === '大众点评' && host.includes('dianping')) return url
    if (plat === '快手' && (host.includes('kuaishou') || host.includes('chenzhongtech'))) return url
    if (
      plat === '微信视频号' &&
      (host.includes('channels.weixin') || host.includes('weixin.qq.com'))
    ) {
      return url
    }
    return url
  } catch {
    return url
  }
}

export function profileLinkLabel(platform: string, rawLink: unknown): string {
  const url = extractProfileLinkUrl(rawLink)
  if (!url) return String(rawLink || '').trim() || '—'
  const plat = normalizeRecruitmentPlatform(platform)
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (plat === '抖音') return host.includes('douyin') ? '打开抖音主页' : url
    if (plat === '小红书') return host.includes('xhs') || host.includes('xiaohongshu') ? '打开小红书主页' : url
    if (plat === '大众点评') return host.includes('dianping') ? '打开大众点评主页' : url
    if (plat === '快手') return host.includes('kuaishou') || host.includes('chenzhong') ? '打开快手主页' : url
    if (plat === '微信视频号') return host.includes('weixin') || host.includes('channels') ? '打开视频号主页' : url
    return url.length > 40 ? `${url.slice(0, 38)}…` : url
  } catch {
    return url.length > 40 ? `${url.slice(0, 38)}…` : url
  }
}
