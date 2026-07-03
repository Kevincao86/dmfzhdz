import { buildEditorRows, getApplyConfigForMpOrder, normalizeTemplateKind } from './applyFormTemplates'

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

export type ApplyFormDisplayRow = { label: string; value: string }

function formatFollowers(n: unknown): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n ?? '').trim()
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return String(num)
}

function resolveApplicantFieldValue(applicant: Record<string, unknown>, row: Record<string, unknown>): string {
  const bindKey = String(row.bindKey || '').trim()
  if (bindKey.startsWith('custom_')) {
    const cf = (applicant.customFields || {}) as Record<string, unknown>
    for (const key of [row.displayLabel, bindKey, row.id]) {
      const s = String(cf[String(key)] ?? '').trim()
      if (s) return s
    }
    return ''
  }
  switch (row.role) {
    case 'visitDate':
    case 'visitTimeStart':
    case 'visitTimeEnd':
      return String(applicant.visitTimeSlot || '').trim()
    case 'followers':
      if (applicant.followers == null || applicant.followers === '') return ''
      return formatFollowers(applicant.followers)
    case 'likesCollects':
      if (applicant.likesCollects == null || applicant.likesCollects === '') return ''
      return String(applicant.likesCollects)
    case 'douyinSalesLevel':
      return String(applicant.douyinSalesLevel || '').trim()
    case 'profileLink':
      return String(applicant.profileLink || applicant.portfolioLink || '').trim()
    case 'alipayAccount': {
      const direct = String(applicant.alipayAccount || '').trim()
      if (direct) return direct
      const pm = String(applicant.paymentMethod || '').trim()
      if (pm.startsWith('支付宝')) return pm.replace(/^支付宝[：:]\s*/, '')
      return ''
    }
    default: {
      const key = bindKey || String(row.role || '')
      if (!key) return ''
      const val = applicant[key]
      if (val == null) return ''
      return String(val).trim()
    }
  }
}

function resolveApplyFormConfig(mpOrder: Record<string, unknown> | null | undefined) {
  if (!mpOrder) return null
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object'
      ? (mpOrder.mpPublishMeta as Record<string, unknown>)
      : mpOrder
  const templateId = String(meta.applyFormTemplateId || mpOrder.applyFormTemplateId || '')
  return getApplyConfigForMpOrder(String(mpOrder.id || ''), templateId, meta)
}

export function buildApplicantApplyFormDisplayRows(
  applicant: Record<string, unknown>,
  mpOrder: Record<string, unknown> | null | undefined,
): ApplyFormDisplayRow[] {
  const cfg = resolveApplyFormConfig(mpOrder)
  const platform = String(applicant.platform || mpOrder?.platform || '抖音')
  const rows: ApplyFormDisplayRow[] = []

  if (cfg?.fields?.length) {
    const editorRows = buildEditorRows(cfg.fields, platform, normalizeTemplateKind(cfg.kind))
    let visitShown = false
    for (const row of editorRows) {
      if (row.role && SKIP_GRID_ROLES.has(row.role)) continue
      if (row.role === 'visitTimeStart' || row.role === 'visitTimeEnd') continue
      if (row.role === 'visitDate') {
        if (visitShown) continue
        const value = resolveApplicantFieldValue(applicant, row as Record<string, unknown>)
        if (!value) continue
        visitShown = true
        rows.push({ label: '探店时间', value })
        continue
      }
      const value = resolveApplicantFieldValue(applicant, row as Record<string, unknown>)
      if (!value) continue
      rows.push({ label: String(row.displayLabel || row.label || '报名项'), value })
    }
    return rows
  }

  const cf = (applicant.customFields || {}) as Record<string, unknown>
  for (const [label, value] of Object.entries(cf)) {
    const s = String(value ?? '').trim()
    if (s) rows.push({ label: String(label), value: s })
  }
  return rows
}

export function formatApplyFormDisplayLines(rows: ApplyFormDisplayRow[]): string[] {
  return (rows || []).map((r) => `${r.label}：${r.value}`).filter(Boolean)
}
