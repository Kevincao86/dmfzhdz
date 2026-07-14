const ecs = require('./ecs.js')
const auth = require('./auth.js')
const ossTransport = require('./mpOssUploadTransport.js')

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

function wxacodeErrorLabel(raw) {
  const msg = String(raw || '').trim()
  if (!msg) return '太阳码生成失败，请稍后重试'
  if (/[\u4e00-\u9fa5]/.test(msg)) return msg
  if (msg === 'wxacode_unavailable' || msg === 'invalid_wxacode_data' || msg === 'wxacode_write_fail') {
    return '太阳码生成失败，请稍后重试'
  }
  if (msg === 'wx_not_configured') return '小程序码服务未配置，请联系管理员'
  if (msg === 'affiliate_not_active') return '推广员审核通过后才可生成太阳码'
  if (msg === 'unauthorized') return '请先登录后再查看推广中心'
  if (/invalid page|page not found|41030/i.test(msg)) return '小程序页面未发布，请稍后重试或联系管理员'
  if (/access_token|40001|42001/i.test(msg)) return '微信授权失效，请稍后重试'
  return '太阳码生成失败，请稍后重试'
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
    attributionStats: data.attributionStats || null,
    attributions: data.attributions || [],
  }
}

/**
 * 太阳码体积较大（~130KB base64），走 HTTPS 直连 erp-api，避免云函数回包截断/失败。
 */
async function fetchWxacodeImagePath() {
  let data
  try {
    data = await ossTransport.postOssUpload(
      '/api/meoo-distribution-affiliate-portal',
      { action: 'wxacode' },
      sessionHeaders(),
    )
  } catch (e) {
    throw new Error(wxacodeErrorLabel((e && e.message) || 'wxacode_unavailable'))
  }
  if (!data || data.ok === false) {
    throw new Error(
      wxacodeErrorLabel((data && (data.message || data.error)) || 'wxacode_unavailable'),
    )
  }
  const dataUrl = data.dataUrl ? String(data.dataUrl).trim() : ''
  if (!dataUrl) throw new Error('太阳码生成失败，请稍后重试')
  try {
    return await dataUrlToTempFile(dataUrl)
  } catch (e) {
    throw new Error(wxacodeErrorLabel((e && e.message) || 'wxacode_write_fail'))
  }
}

module.exports = {
  formatYuan,
  settlementStatusLabel,
  wxacodeErrorLabel,
  fetchPortal,
  fetchWxacodeImagePath,
}
