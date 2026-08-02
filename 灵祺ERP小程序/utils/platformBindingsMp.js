/**
 * 平台绑定展示（读取 merchantSessionSyncMp 同步后的本地凭证）。
 * 云端可同步：抖音来客 / 快手团购 / 巨量本地推 / 小红书聚光。
 * 仅 Web 浏览器会话：美团团购、小红书商家开放平台等。
 */
const sessionSync = require('./merchantSessionSyncMp.js')

const { platformIconUri } = require('./platformIconAssetsMp.js')

const CLOUD_PLATFORMS = [
  { id: 'douyin', label: '抖音来客', key: 'douyin' },
  { id: 'kuaishou', label: '快手团购', key: 'kuaishou' },
  { id: 'local_promotion', label: '巨量本地推', key: 'localPromotion' },
  { id: 'xhs_commercial', label: '小红书聚光', key: 'xhsCommercial' },
]

const WEB_ONLY_PLATFORMS = [
  { id: 'meituan', label: '美团团购', key: 'meituan' },
  { id: 'xiaohongshu', label: '小红书商家', key: 'xiaohongshu' },
]

function rowFromBinding(platform, item, cloudSynced) {
  const bound = Boolean(item && item.bound)
  const accountName = item && item.accountName ? String(item.accountName) : ''
  let statusText = '未绑定'
  let statusClass = 'off'
  if (bound) {
    statusText = accountName || '已绑定'
    statusClass = 'on'
  } else if (!cloudSynced) {
    statusText = '仅电脑端'
    statusClass = 'web'
  }
  return {
    id: platform.id,
    label: platform.label,
    iconSrc: platformIconUri(platform.id),
    bound,
    accountName,
    statusText,
    statusClass,
    cloudSynced,
  }
}

function loadPlatformBindingRows() {
  const snap = sessionSync.readBindingSnapshotFromStorage()
  const cloudRows = CLOUD_PLATFORMS.map((p) => rowFromBinding(p, snap[p.key], true))
  const webRows = WEB_ONLY_PLATFORMS.map((p) => rowFromBinding(p, snap[p.key], false))
  const boundCloud = cloudRows.filter((r) => r.bound).length
  return {
    cloudRows,
    webRows,
    boundCloudCount: boundCloud,
    syncHint:
      boundCloud > 0
        ? '已与电脑端同账号云端绑定同步'
        : sessionSync.getLastSyncError()
          ? `同步异常：${sessionSync.getLastSyncError()}`
          : '在电脑端「设置 → 系统设置」完成绑定后，下拉刷新本页',
  }
}

function formatAgentBindingContext() {
  const snap = sessionSync.readBindingSnapshotFromStorage()
  const all = [
    { key: 'douyin', label: '抖音来客' },
    { key: 'kuaishou', label: '快手团购' },
    { key: 'localPromotion', label: '巨量本地推' },
    { key: 'xhsCommercial', label: '小红书聚光' },
  ]
  const bound = []
  const unbound = []
  for (const p of all) {
    const item = snap[p.key]
    if (item && item.bound) {
      bound.push(item.accountName ? `${p.label}：${item.accountName}` : p.label)
    } else {
      unbound.push(p.label)
    }
  }
  if (!bound.length) {
    return (
      '已绑定平台：无。未绑定（跳过分析）：' +
      unbound.join('、') +
      '。分析异常时不得对未绑定平台下结论；请在电脑端「设置 → 系统设置」完成授权后下拉刷新。'
    )
  }
  const skip = unbound.length ? `未绑定（跳过分析）：${unbound.join('、')}。` : ''
  return `已绑定平台（可分析）：${bound.join('；')}。${skip}`
}

module.exports = {
  loadPlatformBindingRows,
  formatAgentBindingContext,
}
