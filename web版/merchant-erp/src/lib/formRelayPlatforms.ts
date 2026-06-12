export type FormRelayPlatformId =
  | 'tencent_doc'
  | 'wps'
  | 'signup_tool'
  | 'dispatch_tool'
  | 'tanjing'
  | 'other'

export type FormRelayPlatform = {
  id: FormRelayPlatformId
  label: string
  hint: string
  urlPatterns: RegExp[]
}

export type ExternalFormRelay = {
  sourcePlatform: FormRelayPlatformId
  sourceUrl: string
  createdAt: string
  titleNote?: string
  scrapedTaskDetail?: string
  scrapedRequirements?: string
  scrapedCity?: string
  scrapedRegion?: string
  scrapedTitleHint?: string
  scrapedAt?: string
}

export const FORM_RELAY_PLATFORMS: FormRelayPlatform[] = [
  {
    id: 'tencent_doc',
    label: '腾讯文档',
    hint: 'docs.qq.com / 腾讯收集表',
    urlPatterns: [/docs\.qq\.com/i, /doc\.weixin\.qq\.com/i, /forms\.tencent\.com/i, /form\.tencent\.com/i],
  },
  {
    id: 'wps',
    label: 'WPS',
    hint: 'kdocs.cn / wps.cn',
    urlPatterns: [/kdocs\.cn/i, /wps\.cn/i, /f\.wps\.cn/i, /wpsplus\.com/i],
  },
  {
    id: 'signup_tool',
    label: '报名工具',
    hint: '第三方报名表单 / 收集链接',
    urlPatterns: [/jinshuju\.net/i, /wjx\.cn/i, /问卷星/i, /报名/i, /signup/i, /\/apply/i],
  },
  {
    id: 'dispatch_tool',
    label: '派单工具',
    hint: '派单类表单分享链接',
    urlPatterns: [/paidan/i, /dispatch/i, /派单/i],
  },
  {
    id: 'tanjing',
    label: '探鲸',
    hint: '探鲸平台分享链接',
    urlPatterns: [/tanjing/i, /探鲸/i, /tanjingdata/i],
  },
  {
    id: 'other',
    label: '其他平台',
    hint: '未识别时手动选择',
    urlPatterns: [],
  },
]

export function detectFormRelayPlatform(url: string): FormRelayPlatformId {
  const u = String(url || '').trim()
  if (!u) return 'other'
  for (const p of FORM_RELAY_PLATFORMS) {
    if (p.id === 'other') continue
    if (p.urlPatterns.some((re) => re.test(u))) return p.id
  }
  return 'other'
}

export function formRelayPlatformLabel(id: string): string {
  const p = FORM_RELAY_PLATFORMS.find((x) => x.id === id)
  return p?.label || '其他平台'
}

export function readExternalFormRelay(mp: Record<string, unknown> | null | undefined): ExternalFormRelay | null {
  if (!mp || typeof mp !== 'object') return null
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const relay = meta?.externalFormRelay
  if (!relay || typeof relay !== 'object') return null
  const r = relay as Record<string, unknown>
  return {
    sourcePlatform: (String(r.sourcePlatform || 'other') as FormRelayPlatformId) || 'other',
    sourceUrl: String(r.sourceUrl || '').trim(),
    createdAt: String(r.createdAt || '').trim(),
    titleNote: String(r.titleNote || '').trim() || undefined,
  }
}

export function isFormRelayOrder(mp: Record<string, unknown> | null | undefined): boolean {
  return !!readExternalFormRelay(mp)
}

/** 小程序 / H5 / 网站链接均视为有效原表链接 */
export function isValidFormRelayLink(raw: string): boolean {
  const u = String(raw || '').trim()
  if (!u || u.length < 4) return false
  if (/^https?:\/\//i.test(u)) return true
  if (/^#小程序:\/\//.test(u)) return true
  if (/^weixin:\/\//i.test(u)) return true
  if (/^\/pages\//i.test(u)) return true
  return false
}

/** 仅 http(s) 可在服务端抓取页面内容；小程序 scheme 仅保存链接 */
export function canFetchFormRelaySource(raw: string): boolean {
  return /^https?:\/\//i.test(String(raw || '').trim())
}

export function formRelayLinkTypeLabel(raw: string): string {
  const u = String(raw || '').trim()
  if (/^#小程序:\/\//.test(u)) return '小程序链接'
  if (/^weixin:\/\//i.test(u)) return '微信链接'
  if (/^https?:\/\//i.test(u)) return 'H5/网站链接'
  if (/^\/pages\//i.test(u)) return '小程序路径'
  return '链接'
}
