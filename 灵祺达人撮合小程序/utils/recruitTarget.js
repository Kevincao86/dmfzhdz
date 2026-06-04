/** 发单对象：达人 / 拍摄 / 剪辑（存于 mpPublishMeta.recruitTarget） */
function recruitTargetFromMp(mp) {
  if (!mp) return 'talent'
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const t = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

module.exports = { recruitTargetFromMp }
