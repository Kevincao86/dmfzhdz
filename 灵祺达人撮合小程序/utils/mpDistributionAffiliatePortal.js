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

function dataUrlToTempFile(dataUrl) {
  return new Promise((resolve, reject) => {
    const m = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/i)
    if (!m) {
      reject(new Error('invalid_wxacode_data'))
      return
    }
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
    const dest = `${wx.env.USER_DATA_PATH}/affiliate-wxacode-${Date.now()}.${ext}`
    const fs = wx.getFileSystemManager()
    fs.writeFile({
      filePath: dest,
      data: m[2],
      encoding: 'base64',
      success: () => resolve(dest),
      fail: (err) => reject(err || new Error('wxacode_write_fail')),
    })
  })
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

async function fetchWxacodeImagePath() {
  const data = await ecs.post(
    '/api/meoo-distribution-affiliate-portal',
    { action: 'wxacode' },
    sessionHeaders(),
  )
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.error)) || 'wxacode_unavailable'))
  }
  const dataUrl = data.dataUrl ? String(data.dataUrl).trim() : ''
  if (!dataUrl) throw new Error('wxacode_unavailable')
  return dataUrlToTempFile(dataUrl)
}

module.exports = {
  formatYuan,
  settlementStatusLabel,
  fetchPortal,
  fetchWxacodeImagePath,
}
