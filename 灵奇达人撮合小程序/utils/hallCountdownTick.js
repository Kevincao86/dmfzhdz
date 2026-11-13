const listFilters = require('./recruitmentListFilters.js')

function startHallCountdownTick(page, dataKey) {
  stopHallCountdownTick(page)
  const key = dataKey || 'displayRows'
  const tick = () => {
    const rows = page.data[key]
    if (!Array.isArray(rows) || !rows.length) return
    page.setData({ [key]: listFilters.attachHallSignupCountdowns(rows) })
  }
  tick()
  page._hallCountdownTimer = setInterval(tick, 1000)
}

function stopHallCountdownTick(page) {
  if (page._hallCountdownTimer) {
    clearInterval(page._hallCountdownTimer)
    page._hallCountdownTimer = null
  }
}

module.exports = {
  startHallCountdownTick,
  stopHallCountdownTick,
}
