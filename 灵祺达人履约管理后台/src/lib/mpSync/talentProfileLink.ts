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

export function resolveTalentProfileHref(_platform: string, rawLink: unknown): string {
  const url = extractProfileLinkUrl(rawLink)
  if (!url) return ''
  return url
}

export function profileLinkLabel(platform: string, rawLink: unknown): string {
  const url = extractProfileLinkUrl(rawLink)
  if (!url) return String(rawLink || '').trim() || '—'
  const plat = String(platform || '抖音').trim()
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (plat.includes('抖音') || plat === 'douyin') {
      return host.includes('douyin') ? '打开抖音主页' : url
    }
    if (plat.includes('红') || plat === 'xiaohongshu') {
      return host.includes('xhs') || host.includes('xiaohongshu') ? '打开小红书主页' : url
    }
    if (plat.includes('点评') || plat.includes('大众')) {
      return host.includes('dianping') ? '打开大众点评主页' : url
    }
    if (plat.includes('快手') || plat === 'kuaishou') {
      return host.includes('kuaishou') || host.includes('chenzhong') ? '打开快手主页' : url
    }
    if (plat.includes('视频号') || plat === 'weixin_video') {
      return host.includes('weixin') || host.includes('channels') ? '打开视频号主页' : url
    }
    return url.length > 40 ? `${url.slice(0, 38)}…` : url
  } catch {
    return url.length > 40 ? `${url.slice(0, 38)}…` : url
  }
}

/** 卡片按钮短文案 */
export function shortProfileLinkButtonLabel(platform: string): string {
  const plat = String(platform || '抖音').trim()
  if (plat.includes('抖音')) return '抖音主页'
  if (plat.includes('红')) return '小红书'
  if (plat.includes('快手')) return '快手主页'
  if (plat.includes('点评') || plat.includes('大众')) return '大众点评'
  if (plat.includes('视频号')) return '视频号'
  return '平台主页'
}

export function openTalentProfileHref(href: string): void {
  const url = String(href || '').trim()
  if (!url) {
    window.alert('暂无平台主页链接')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 抖音/小红书等禁止 iframe 内嵌，只能新窗口或 App 打开 */
export function profileLinkOpensExternally(platform: string): boolean {
  const plat = String(platform || '').trim()
  return (
    plat.includes('抖音') ||
    plat.includes('红') ||
    plat.includes('快手') ||
    plat.includes('点评') ||
    plat.includes('大众') ||
    plat.includes('视频号')
  )
}
