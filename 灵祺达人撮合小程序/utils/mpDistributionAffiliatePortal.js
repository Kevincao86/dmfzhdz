const ecs = require('./ecs.js')
const auth = require('./auth.js')

function sessionHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function formatYuan(cents) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2)
}

function settlementStatusLabel(status) {
  const map = {
    draft: '待确认',
    confirmed: '已确认',
    paid: '已打款',
  }
  return map[status] || status
}

async function fetchPortal() {
  const data = await ecs.get('/api/meoo-distribution-affiliate-portal', sessionHeaders())
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.error)) || 'load_failed'))
  }
  return {
    affiliate: data.affiliate || null,
    wallet: data.wallet || null,
    stats: data.stats || null,
    settlements: data.settlements || [],
    promoLinks: data.promoLinks || null,
  }
}

module.exports = {
  formatYuan,
  settlementStatusLabel,
  fetchPortal,
}
