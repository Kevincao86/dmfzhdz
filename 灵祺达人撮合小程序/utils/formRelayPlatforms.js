const formRelaySourceMpLink = require('./formRelaySourceMpLink.js')

const FORM_RELAY_PLATFORMS = [
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
    id: 'other',
    label: '其他平台',
    hint: '未识别时手动选择',
    urlPatterns: [],
  },
]

function detectFormRelayPlatform(url) {
  const u = String(url || '').trim()
  if (!u) return 'other'
  for (const p of FORM_RELAY_PLATFORMS) {
    if (p.id === 'other') continue
    if (p.urlPatterns.some((re) => re.test(u))) return p.id
  }
  return 'other'
}

function formRelayPlatformLabel(id) {
  const p = FORM_RELAY_PLATFORMS.find((x) => x.id === id)
  return p ? p.label : '其他平台'
}

function resolveFormRelayPlatformLabel(relay) {
  if (!relay) return '其他平台'
  const fromUrl = detectFormRelayPlatform(relay.sourceUrl)
  const platformId = fromUrl !== 'other' ? fromUrl : String(relay.sourcePlatform || 'other').trim()
  return formRelayPlatformLabel(platformId)
}

function formatFormRelayRecruitmentLine(line) {
  const trimmed = String(line || '').trim()
  const m = trimmed.match(/^原表平台[:：]\s*(.+)$/i)
  if (!m || !m[1]) return line
  const raw = String(m[1]).trim()
  const byId = FORM_RELAY_PLATFORMS.find((x) => x.id === raw)
  if (byId) return `原表平台：${byId.label}`
  const byLabel = FORM_RELAY_PLATFORMS.find((x) => x.label === raw)
  if (byLabel) return `原表平台：${byLabel.label}`
  return `原表平台：${formRelayPlatformLabel(raw)}`
}

function formatFormRelayRecruitmentText(text, relay) {
  const resolved = relay ? resolveFormRelayPlatformLabel(relay) : null
  const mpLink =
    relay && relay.sourceUrl
      ? formRelaySourceMpLink.resolveFormRelaySourceMpLink(
          String(relay.sourceUrl),
          relay.sourcePlatform,
          formRelaySourceMpLink.pickFormRelaySourceMpCache(relay),
        )
      : null
  return String(text || '')
    .split('\n')
    .map((line) => {
      const trimmed = String(line || '').trim()
      if (resolved && /^原表平台[:：]/.test(trimmed)) return `原表平台：${resolved}`
      if (mpLink && mpLink.displayLink && /^原表链接[:：]/.test(trimmed)) {
        return `原表链接：${mpLink.displayLink}`
      }
      return formatFormRelayRecruitmentLine(line)
    })
    .join('\n')
}

function readExternalFormRelay(mp) {
  if (!mp || typeof mp !== 'object') return null
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const relay = meta && meta.externalFormRelay
  if (!relay || typeof relay !== 'object') return null
  return {
    sourcePlatform: String(relay.sourcePlatform || 'other'),
    sourceUrl: String(relay.sourceUrl || '').trim(),
    createdAt: String(relay.createdAt || '').trim(),
    titleNote: String(relay.titleNote || '').trim(),
    sourceMpDisplayLink: String(relay.sourceMpDisplayLink || '').trim(),
    sourceMpAppId: String(relay.sourceMpAppId || '').trim(),
    sourceMpPath: String(relay.sourceMpPath || '').trim(),
  }
}

function isFormRelayOrder(mp) {
  return !!readExternalFormRelay(mp)
}

function isValidFormRelayLink(raw) {
  const u = String(raw || '').trim()
  if (!u || u.length < 4) return false
  if (/^https?:\/\//i.test(u)) return true
  if (/^#小程序:\/\//.test(u)) return true
  if (/^weixin:\/\//i.test(u)) return true
  if (/^\/pages\//i.test(u)) return true
  return false
}

function canFetchFormRelaySource(raw) {
  return /^https?:\/\//i.test(String(raw || '').trim())
}

function formRelayLinkTypeLabel(raw) {
  const u = String(raw || '').trim()
  if (/^#小程序:\/\//.test(u)) return '小程序链接'
  if (/^weixin:\/\//i.test(u)) return '微信链接'
  if (/^https?:\/\//i.test(u)) return 'H5/网站链接'
  if (/^\/pages\//i.test(u)) return '小程序路径'
  return '链接'
}

module.exports = {
  FORM_RELAY_PLATFORMS,
  detectFormRelayPlatform,
  formRelayPlatformLabel,
  resolveFormRelayPlatformLabel,
  formatFormRelayRecruitmentLine,
  formatFormRelayRecruitmentText,
  readExternalFormRelay,
  isFormRelayOrder,
  isValidFormRelayLink,
  canFetchFormRelaySource,
  formRelayLinkTypeLabel,
}
