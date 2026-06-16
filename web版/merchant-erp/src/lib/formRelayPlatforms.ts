import { resolveFormRelaySourceMpLink, pickFormRelaySourceMpCache } from './formRelaySourceMpLink.js'

export type FormRelayPlatformId =
  | 'tencent_doc'
  | 'wps'
  | 'signup_tool'
  | 'dispatch_tool'
  | 'tanjing'
  | 'qunbaoshu'
  | 'other'

export type FormRelayRelayMode = 'link' | 'group_qr'

export type FormRelayPlatform = {
  id: FormRelayPlatformId
  label: string
  hint: string
  urlPatterns: RegExp[]
}

export type ExternalFormRelay = {
  sourcePlatform: FormRelayPlatformId
  sourceUrl: string
  /** link=原表链接代收；group_qr=创建时直接上传群二维码 */
  relayMode?: FormRelayRelayMode
  createdAt: string
  titleNote?: string
  scrapedTaskDetail?: string
  scrapedRequirements?: string
  scrapedCity?: string
  scrapedRegion?: string
  scrapedTitleHint?: string
  scrapedAt?: string
  sourceMpDisplayLink?: string
  sourceMpAppId?: string
  sourceMpPath?: string
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
    urlPatterns: [
      /baominggongju\.com/i,
      /weiyoubot\.cn/i,
      /jinshuju\.net/i,
      /wjx\.cn/i,
      /问卷星/i,
      /报名/i,
      /signup/i,
      /\/apply/i,
    ],
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
    urlPatterns: [/tanjing/i, /探鲸/i, /tanjingdata/i, /tungea\.com/i],
  },
  {
    id: 'qunbaoshu',
    label: '群报数',
    hint: 's.qun100.com 群报数分享链接',
    urlPatterns: [/qun100\.com/i, /群报数/i],
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

/** 展示用：优先从原表链接识别平台，避免存成 other 后显示「其他平台」 */
export function resolveFormRelayPlatformLabel(relay: ExternalFormRelay | null | undefined): string {
  if (!relay) return '其他平台'
  const fromUrl = detectFormRelayPlatform(relay.sourceUrl)
  const platformId =
    fromUrl !== 'other' ? fromUrl : (String(relay.sourcePlatform || 'other').trim() as FormRelayPlatformId)
  return formRelayPlatformLabel(platformId)
}

/** 将招募说明中的「原表平台：signup_tool」转为可读平台名 */
export function formatFormRelayRecruitmentLine(line: string): string {
  const trimmed = String(line || '').trim()
  const m = trimmed.match(/^原表平台[:：]\s*(.+)$/i)
  if (!m?.[1]) return line
  const raw = m[1].trim()
  const byId = FORM_RELAY_PLATFORMS.find((x) => x.id === raw)
  if (byId) return `原表平台：${byId.label}`
  const byLabel = FORM_RELAY_PLATFORMS.find((x) => x.label === raw)
  if (byLabel) return `原表平台：${byLabel.label}`
  return `原表平台：${formRelayPlatformLabel(raw)}`
}

/** 任务详情展示用：原表链接仅通过「前往原表报名」打开，不在正文露出 */
export function isFormRelaySourceLinkLine(line: string): boolean {
  return /^原表链接[:：]/.test(String(line || '').trim())
}

export function formatFormRelayRecruitmentText(
  text: string,
  relay?: ExternalFormRelay | null,
): string {
  const resolved = relay ? resolveFormRelayPlatformLabel(relay) : null
  const mpLink = relay?.sourceUrl
    ? resolveFormRelaySourceMpLink(
        relay.sourceUrl,
        relay.sourcePlatform,
        pickFormRelaySourceMpCache(relay),
      )
    : null
  return String(text || '')
    .split('\n')
    .map((line) => {
      const trimmed = String(line || '').trim()
      if (resolved && /^原表平台[:：]/.test(trimmed)) return `原表平台：${resolved}`
      if (mpLink?.displayLink && /^原表链接[:：]/.test(trimmed)) {
        return `原表链接：${mpLink.displayLink}`
      }
      return formatFormRelayRecruitmentLine(line)
    })
    .join('\n')
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
  const relayModeRaw = String(r.relayMode || '').trim()
  return {
    sourcePlatform: (String(r.sourcePlatform || 'other') as FormRelayPlatformId) || 'other',
    sourceUrl: String(r.sourceUrl || '').trim(),
    relayMode: relayModeRaw === 'group_qr' ? 'group_qr' : relayModeRaw === 'link' ? 'link' : undefined,
    createdAt: String(r.createdAt || '').trim(),
    titleNote: String(r.titleNote || '').trim() || undefined,
    sourceMpDisplayLink: String(r.sourceMpDisplayLink || '').trim() || undefined,
    sourceMpAppId: String(r.sourceMpAppId || '').trim() || undefined,
    sourceMpPath: String(r.sourceMpPath || '').trim() || undefined,
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
