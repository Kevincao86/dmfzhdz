/** 当日查看热度（对齐 web版/merchant-erp/src/lib/mpRecruitmentEngagement.ts） */

function chinaDateKey(d) {
  const date = d instanceof Date ? d : new Date()
  try {
    return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  } catch {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

function readHallViewStats(mp) {
  if (!mp || typeof mp !== 'object') return {}
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const raw =
    meta && meta.hallViewStats && typeof meta.hallViewStats === 'object' ? meta.hallViewStats : {}
  return raw
}

function resolveTodayViewCount(mp) {
  if (!mp || typeof mp !== 'object') return 0
  const key = chinaDateKey()
  const stats = readHallViewStats(mp)
  const byDay = stats.byDay
  if (byDay && typeof byDay[key] === 'number') return Math.max(0, byDay[key])
  const today = Number(stats.today != null ? stats.today : mp.viewsToday != null ? mp.viewsToday : 0)
  const todayDate = String(stats.todayDate || mp.viewsTodayDate || '').trim()
  if (todayDate === key && Number.isFinite(today)) return Math.max(0, today)
  return 0
}

module.exports = {
  chinaDateKey,
  resolveTodayViewCount,
}
