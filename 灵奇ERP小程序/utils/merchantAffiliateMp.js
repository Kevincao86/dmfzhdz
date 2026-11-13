const api = require('./api.js')
const config = require('./config.js')

function apiBase() {
  return String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
}

function request(path, method, body) {
  const base = apiBase()
  const token = api.getBearerToken()
  if (!base) return Promise.reject(new Error('推广服务未配置'))
  if (!token) return Promise.reject(new Error('请先登录'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}/erp-api${path}`,
      method,
      timeout: 25000,
      data: body,
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      success(res) {
        const json = res.data && typeof res.data === 'object' ? res.data : {}
        if (res.statusCode >= 200 && res.statusCode < 300 && json.ok !== false) {
          resolve(json)
          return
        }
        const err = new Error(String(json.message || json.error || '请求失败'))
        err.code = json.error
        err.affiliate = json.affiliate
        reject(err)
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
}

function readLoginPhone() {
  try {
    return normalizePhone(wx.getStorageSync('meoo_login_name'))
  } catch (_) {
    return ''
  }
}

function applyErrorLabel(error) {
  switch (String(error || '')) {
    case 'already_active':
      return '您已是推广员'
    case 'affiliate_disabled':
      return '推广员已停用，请联系运营'
    case 'phone_taken':
      return '这个手机号已经用来申请过推广员'
    case 'distribution_disabled':
      return '推广员申请暂未开放'
    case 'invalid_fields':
      return '请填写真实姓名与有效大陆手机号'
    default:
      return ''
  }
}

function fetchMine() {
  return request('/meoo-distribution-affiliate-apply', 'GET')
}

function applyAffiliate({ realName, phone, note }) {
  const body = {
    realName: String(realName || '').trim(),
    phone: normalizePhone(phone),
    applySource: 'cs',
  }
  if (note) body.note = String(note).trim()
  return request('/meoo-distribution-affiliate-apply', 'POST', body).catch((e) => {
    const label = applyErrorLabel(e && e.code)
    if (label) e.message = label
    throw e
  })
}

function fetchPortal() {
  return request('/meoo-distribution-affiliate-portal', 'GET')
}

function dataUrlToTempFile(dataUrl) {
  return new Promise((resolve, reject) => {
    const m = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/i)
    if (!m) {
      reject(new Error('二维码数据无效'))
      return
    }
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
    const dest = `${wx.env.USER_DATA_PATH}/merchant-affiliate-wxacode-${Date.now()}.${ext}`
    wx.getFileSystemManager().writeFile({
      filePath: dest,
      data: m[2],
      encoding: 'base64',
      success: () => resolve(dest),
      fail: () => reject(new Error('二维码保存失败')),
    })
  })
}

async function fetchWxacodePath() {
  const data = await request('/meoo-distribution-affiliate-portal', 'POST', { action: 'wxacode' })
  const dataUrl = data && data.dataUrl ? String(data.dataUrl).trim() : ''
  if (!dataUrl) throw new Error(String((data && data.message) || '二维码生成失败'))
  return dataUrlToTempFile(dataUrl)
}

function savePromoImage(src) {
  const raw = String(src || '').trim()
  if (!raw) return Promise.reject(new Error('二维码还在生成'))
  const fileReady = raw.indexOf('data:image') === 0 ? dataUrlToTempFile(raw) : Promise.resolve(raw)
  return fileReady.then(
    (filePath) =>
      new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: resolve,
          fail: (err) => reject(err || new Error('save_fail')),
        })
      }),
  )
}

module.exports = {
  normalizePhone,
  readLoginPhone,
  fetchMine,
  applyAffiliate,
  fetchPortal,
  fetchWxacodePath,
  savePromoImage,
}
