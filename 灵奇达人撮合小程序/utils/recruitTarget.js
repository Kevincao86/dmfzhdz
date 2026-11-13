/** 发单对象：达人 / 拍摄 / 剪辑（存于 mpPublishMeta.recruitTarget） */
function recruitTargetFromMp(mp) {
  if (!mp) return 'talent'
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const t = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

/** 分享文案 / 招募详情：talent/shoot/edit → 中文 */
function recruitTargetLabel(target) {
  const raw = String(target || '').trim()
  if (!raw) return '达人'
  const t = raw.toLowerCase()
  if (t === 'shoot' || raw === '拍摄') return '拍摄'
  if (t === 'edit' || raw === '剪辑') return '剪辑'
  if (t === 'talent' || raw === '达人') return '达人'
  return raw
}

module.exports = { recruitTargetFromMp, recruitTargetLabel }
