/** 财务对账 — 展示字段与预览数据 */
const devAuth = require('./devAuth.js')

const QUICK_ENTRIES = [
  { id: 'statement', label: '对账单', icon: '📋' },
  { id: 'settlement', label: '结款记录', icon: '👛' },
  { id: 'talent', label: '达人对账', icon: '👥' },
  { id: 'help', label: '帮助中心', icon: '❓' },
]

function enrichReconcileRow(row, idx) {
  const isPending = /待核|pending|diff/i.test(String(row.tag || row.status || ''))
  return {
    id: String(row.id || row.idx || idx),
    title: row.title || `${row.platformLabel || '平台'} ${row.date || ''} 对账`,
    sub: row.sub || `订单 ${row.orderCount || 0} · 核销 ${row.verifyOrderCount || 0}`,
    tag: row.tag || (isPending ? '待核对' : '已核销'),
    tagClass: isPending ? 'pending' : 'done',
    period: row.period || (row.date ? `对账周期：${row.date}` : ''),
    payable: row.payable || row.salesAmountYuan || '—',
    actual: row.actual || row.verifyAmountYuan || '—',
    diff: row.diff || '—',
    actionLabel: isPending ? '去核对' : '查看详情',
    actionGhost: !isPending,
    settlementAmount: row.settlementAmount || row.verifyAmountYuan || '—',
    talentCount: row.talentCount || '—',
    orderCount: row.orderCount || '—',
    statusText: row.statusText || (isPending ? '待核对' : '已核销'),
    settleTime: row.settleTime || '',
    cardType: row.cardType || (isPending ? 'weekly' : 'batch'),
  }
}

function previewReconcileCards() {
  return [
    enrichReconcileRow(
      {
        id: 'w1',
        title: '7月第1周对账单',
        period: '对账周期：07.01 - 07.07',
        tag: '待核对',
        payable: '128,760.00',
        actual: '122,560.00',
        diff: '6,200.00',
        cardType: 'weekly',
      },
      0,
    ),
    enrichReconcileRow(
      {
        id: 'b12',
        title: '达人结款批次 #12',
        settleTime: '结款时间：2024.07.05 10:30',
        tag: '已核销',
        settlementAmount: '96,320.00',
        talentCount: '152',
        orderCount: '245',
        statusText: '已核销',
        cardType: 'batch',
      },
      1,
    ),
  ]
}

function mapApiRows(rows) {
  return (rows || []).map((row, idx) =>
    enrichReconcileRow(
      {
        idx,
        platformLabel: row.platformLabel || row.platform,
        date: row.date,
        orderCount: row.orderCount,
        verifyOrderCount: row.verifyOrderCount,
        salesAmountYuan: row.salesAmountYuan,
        verifyAmountYuan: row.verifyAmountYuan,
        title: `${row.platformLabel || row.platform || '平台'} ${row.date || ''}`,
        sub: `销售 ¥${row.salesAmountYuan || 0} · 核销 ¥${row.verifyAmountYuan || 0}`,
        tag: Math.abs(Number(row.salesAmountYuan) - Number(row.verifyAmountYuan)) > 0.01 ? '待核对' : '已核销',
        payable: row.salesAmountYuan,
        actual: row.verifyAmountYuan,
        diff:
          row.salesAmountYuan != null && row.verifyAmountYuan != null
            ? (Number(row.salesAmountYuan) - Number(row.verifyAmountYuan)).toFixed(2)
            : '—',
      },
      idx,
    ),
  )
}

function shouldUsePreview() {
  return devAuth.isDevSkipLogin()
}

module.exports = {
  QUICK_ENTRIES,
  enrichReconcileRow,
  previewReconcileCards,
  mapApiRows,
  shouldUsePreview,
}
