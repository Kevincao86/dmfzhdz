const userProfile = require('./userProfile.js')
const config = require('./config.js')

const GUIDE_DIVIDER = '—— 报名指引 ——'

/** 分享文案标题：公司/机构用 PR 填写名称，个人用「灵祺撮合平台」 */
function shareCopyHeader(prProfile) {
  const pr = prProfile || userProfile.readPrProfile()
  if (pr && pr.accountType === 'company') {
    const name = userProfile.prDisplayName(pr)
    if (name) return `【${name}】`
  }
  return '【灵祺撮合平台】'
}

/**
 * 报名链接：优先 config.MP_SHARE_APPLY_BASE_URL（完整 URL Link 或 H5 落地页），
 * 否则用商家 API 根地址 + /mp-recruit/apply?mpId=
 */
function buildRecruitmentApplyLink(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return ''
  const custom = String(config.MP_SHARE_APPLY_BASE_URL || '').trim().replace(/\/$/, '')
  if (custom) {
    if (custom.includes('{mpId}')) return custom.replace(/\{mpId\}/g, encodeURIComponent(id))
    const sep = custom.includes('?') ? '&' : '?'
    return `${custom}${sep}mpId=${encodeURIComponent(id)}`
  }
  const api = String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
  if (api) {
    return `${api}/mp-recruit/apply?mpId=${encodeURIComponent(id)}`
  }
  return `pages/detail/detail?id=${encodeURIComponent(id)}`
}

/** 分享正文：去掉与费用模式/CPS 重复的「酬劳」「酬劳摘要」等行 */
function formatShareRecruitmentInfo(info) {
  const lines = String(info || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!lines.length) return ''

  let feeMode = ''
  for (const line of lines) {
    const m = line.match(/^费用模式[:：]\s*(.+)$/)
    if (m) feeMode = m[1].trim()
  }

  const out = []
  for (const line of lines) {
    if (/^酬劳摘要[:：]/.test(line)) continue
    if (/^佣金CPS[:：]\s*未设置/.test(line)) continue
    if (/^酬劳[:：]/.test(line)) {
      if (feeMode === '纯置换' && /纯置换/.test(line)) continue
      if (feeMode === '一口价' && /一口价|¥/.test(line)) continue
    }
    const detailMatch = line.match(/^招募详情[:：]\s*(.*)$/)
    if (detailMatch) {
      out.push('招募详情：')
      const body = String(detailMatch[1] || '').trim()
      if (body) out.push(body)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function buildShareGuideBlock(orderId) {
  const applyLink = buildRecruitmentApplyLink(orderId)
  const openHint =
    '请打开「灵祺撮合平台」小程序，在招募大厅找到本单或联系发布者获取详情页报名。'
  const parts = [GUIDE_DIVIDER, '']
  if (applyLink) {
    parts.push(`报名地址：${applyLink}`, openHint)
  } else {
    parts.push(openHint)
  }
  parts.push(`招募单号：${orderId}`)
  return parts.join('\n')
}

function buildGroupCopyText(order, prProfile) {
  const raw =
    order.recruitmentInfo || order.taskDetail || order.merchantRequirements || ''
  const info = formatShareRecruitmentInfo(raw)
  const guide = buildShareGuideBlock(order.id)
  const parts = [shareCopyHeader(prProfile), '']
  if (info) parts.push(info, '')
  parts.push(guide)
  return parts.join('\n')
}

function buildShareTitle(order) {
  return `${order.title} · ${order.region || '全国'}招募`
}

module.exports = {
  shareCopyHeader,
  buildRecruitmentApplyLink,
  formatShareRecruitmentInfo,
  buildShareGuideBlock,
  buildGroupCopyText,
  buildShareTitle,
  GUIDE_DIVIDER,
}
