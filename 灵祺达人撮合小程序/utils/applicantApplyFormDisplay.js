const applyTemplates = require('./applyFormTemplates.js')

/** 报名管理卡片固定格已展示的字段，动态区不再重复 */
const SKIP_GRID_ROLES = new Set([
  'platformNickname',
  'platformAccount',
  'followers',
  'douyinSalesLevel',
  'quotePrice',
  'wechatId',
  'contact',
])

function formatFollowers(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n == null ? '' : n).trim()
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return String(num)
}

function resolveApplicantFieldValue(applicant, row) {
  const a = applicant || {}
  const bindKey = String(row.bindKey || '').trim()
  if (bindKey.startsWith('custom_')) {
    const cf = a.customFields && typeof a.customFields === 'object' ? a.customFields : {}
    for (const key of [row.displayLabel, bindKey, row.id]) {
      const s = String(cf[key] == null ? '' : cf[key]).trim()
      if (s) return s
    }
    return ''
  }
  switch (row.role) {
    case 'visitDate':
    case 'visitTimeStart':
    case 'visitTimeEnd':
      return String(a.visitTimeSlot || '').trim()
    case 'followers':
      if (a.followers == null || a.followers === '') return ''
      return formatFollowers(a.followers)
    case 'likesCollects':
      if (a.likesCollects == null || a.likesCollects === '') return ''
      return String(a.likesCollects)
    case 'douyinSalesLevel':
      return String(a.douyinSalesLevel || '').trim()
    case 'profileLink':
      return String(a.profileLink || a.portfolioLink || '').trim()
    case 'alipayAccount': {
      const direct = String(a.alipayAccount || '').trim()
      if (direct) return direct
      const pm = String(a.paymentMethod || '').trim()
      if (pm.startsWith('支付宝')) return pm.replace(/^支付宝[：:]\s*/, '')
      return ''
    }
    default: {
      const key = bindKey || row.role
      if (!key) return ''
      const val = a[key]
      if (val == null) return ''
      return String(val).trim()
    }
  }
}

function resolveApplyFormConfig(mpOrder) {
  if (!mpOrder) return null
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object' ? mpOrder.mpPublishMeta : mpOrder
  const templateId = meta.applyFormTemplateId || mpOrder.applyFormTemplateId || ''
  return applyTemplates.getApplyConfigForMpOrder(mpOrder.id, templateId, meta)
}

function buildApplicantApplyFormDisplayRows(applicant, mpOrder) {
  const cfg = resolveApplyFormConfig(mpOrder)
  const platform = String((applicant && applicant.platform) || (mpOrder && mpOrder.platform) || '抖音')
  const rows = []

  if (cfg && Array.isArray(cfg.fields) && cfg.fields.length) {
    const editorRows = applyTemplates.buildEditorRows(cfg.fields, platform, cfg.kind)
    let visitShown = false
    for (const row of editorRows) {
      if (row.role && SKIP_GRID_ROLES.has(row.role)) continue
      if (row.role === 'visitTimeStart' || row.role === 'visitTimeEnd') continue
      if (row.role === 'visitDate') {
        if (visitShown) continue
        const value = resolveApplicantFieldValue(applicant, row)
        if (!value) continue
        visitShown = true
        rows.push({ label: '探店时间', value })
        continue
      }
      const value = resolveApplicantFieldValue(applicant, row)
      if (!value) continue
      rows.push({ label: row.displayLabel || row.label || '报名项', value })
    }
    return rows
  }

  const cf = applicant && applicant.customFields && typeof applicant.customFields === 'object'
    ? applicant.customFields
    : {}
  for (const [label, value] of Object.entries(cf)) {
    const s = String(value == null ? '' : value).trim()
    if (s) rows.push({ label: String(label), value: s })
  }
  return rows
}

function formatApplyFormDisplayLines(rows) {
  return (rows || [])
    .map((r) => `${r.label}：${r.value}`)
    .filter(Boolean)
}

module.exports = {
  buildApplicantApplyFormDisplayRows,
  formatApplyFormDisplayLines,
  resolveApplicantFieldValue,
}
