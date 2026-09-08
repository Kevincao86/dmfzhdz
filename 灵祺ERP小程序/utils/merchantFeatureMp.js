const merchantApi = require('./merchantApi.js')
const { readPlatformToken, apiSegment, PLATFORM_TABS } = require('./platformTokensMp.js')

function financeHeaders() {
  const h = { Accept: 'application/json' }
  const pairs = [
    ['douyin', 'X-Meoo-Douyin-Token'],
    ['meituan', 'X-Meoo-Meituan-Token'],
    ['xiaohongshu', 'X-Meoo-Xhs-Token'],
  ]
  let primary = ''
  for (const [plat, hdr] of pairs) {
    const t = readPlatformToken(plat)
    if (t) {
      if (!primary) primary = t
      h[hdr] = t
    }
  }
  if (primary) h.Authorization = `Bearer ${primary}`
  return h
}

function financeRequestGet(path) {
  const b = merchantApi.baseUrl()
  if (!b) return Promise.reject(new Error('请配置商家后台 API 地址'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${b}${path}`,
      method: 'GET',
      header: financeHeaders(),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const msg =
          (res.data && (res.data.message || res.data.error)) || `请求失败 ${res.statusCode}`
        reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

async function fetchFinanceReconcile(days) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const d = Math.min(90, Math.max(1, days || 14))
  const paths = [`/api/meoo-finance-reconcile?days=${d}`, `/api/merchant/finance/reconcile?days=${d}`]
  let lastMsg = '拉取失败'
  for (const p of paths) {
    try {
      const data = await financeRequestGet(p)
      const rows = Array.isArray(data.rows) ? data.rows : []
      return { ok: true, rows, fetchedAt: data.fetchedAt || '' }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastMsg }
}

const FLAT_STORE_PATHS = {
  douyin: '/api/meoo-douyin-stores',
  kuaishou: '/api/meoo-kuaishou-stores',
  meituan: '/api/meoo-meituan-stores',
  xiaohongshu: '/api/meoo-xhs-stores',
}

const MERCHANT_ID_KEYS = {
  douyin: 'meoo_douyin_merchant_id',
  kuaishou: 'meoo_kuaishou_merchant_id',
  meituan: 'meoo_meituan_merchant_id',
  xiaohongshu: 'meoo_xhs_merchant_id',
}

function readMerchantId(platformId) {
  const k = MERCHANT_ID_KEYS[platformId]
  if (!k) return ''
  try {
    return String(wx.getStorageSync(k) || '').trim()
  } catch (_) {
    return ''
  }
}

function isLikelyHtmlPayload(data) {
  if (typeof data !== 'string') return false
  const s = data.trim().slice(0, 200).toLowerCase()
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.includes('<head')
}

function isRouteMiss(msg) {
  return /404|not found|could not be found|html 而非|非 json/i.test(String(msg || ''))
}

function pickStr() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function extractStoreRows(data) {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.stores)) return data.stores
  if (Array.isArray(data.list)) return data.list
  if (Array.isArray(data.pois)) return data.pois
  const inner = data.data
  if (inner && typeof inner === 'object') {
    if (Array.isArray(inner.pois)) return inner.pois
    if (Array.isArray(inner.items)) return inner.items
    if (Array.isArray(inner.stores)) return inner.stores
    if (Array.isArray(inner.list)) return inner.list
  }
  if (Array.isArray(data.data)) return data.data
  return []
}

function normalizeStoreItem(x) {
  if (!x || typeof x !== 'object') return null
  const poi = x.poi && typeof x.poi === 'object' ? x.poi : null
  const src = poi || x
  const id = pickStr(
    src.poi_id,
    src.poiId,
    src.id,
    src.store_id,
    src.shopId,
    x.poi_id,
    x.id,
  )
  const name = pickStr(
    src.poi_name,
    src.poiName,
    src.name,
    src.store_name,
    src.shopName,
    x.name,
  )
  const addr = pickStr(src.address, src.addr, src.full_address, src.address_all, x.address)
  if (!id && !name) return null
  return { id: id || name, name: name || '未命名门店', address: addr }
}

function storePathCandidates(platformId, qs) {
  const seg = apiSegment(platformId)
  const flat = FLAT_STORE_PATHS[platformId]
  const merchantPath = seg ? `/api/merchant/${seg}/stores${qs}` : null
  const out = []
  if (flat) out.push(`${flat}${qs}`)
  if (merchantPath) out.push(merchantPath)
  return out
}

async function fetchStoresForPlatform(platformId, keyword) {
  const token = readPlatformToken(platformId)
  if (!token) {
    const label = PLATFORM_TABS.find((p) => p.id === platformId)
    return { ok: false, message: `尚未绑定${label ? label.label : platformId}` }
  }
  const q = new URLSearchParams({ page: '1', pageSize: '50', relationType: 'all' })
  if (keyword && String(keyword).trim()) q.set('keyword', String(keyword).trim())
  const mid = readMerchantId(platformId)
  if (mid) q.set('merchantId', mid)
  const paths = storePathCandidates(platformId, `?${q}`)
  if (!paths.length) {
    return { ok: false, message: '该平台门店接口尚未接入' }
  }
  let lastMsg = '拉取失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', p, { bearerToken: token })
      if (isLikelyHtmlPayload(data)) {
        lastMsg = '门店接口返回了网页而非数据，已改试备用路径'
        continue
      }
      if (!data || typeof data !== 'object') {
        lastMsg = '门店接口返回无法解析'
        continue
      }
      const raw = extractStoreRows(data)
      const items = []
      for (const x of raw) {
        const row = normalizeStoreItem(x)
        if (row) items.push(row)
      }
      const inner = data.data && typeof data.data === 'object' ? data.data : data
      const total =
        typeof inner.total === 'number'
          ? inner.total
          : typeof data.total === 'number'
            ? data.total
            : items.length
      return { ok: true, items, total }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (isRouteMiss(lastMsg)) continue
    }
  }
  return { ok: false, message: lastMsg }
}

const ACTIVITY_STATUS = {
  all: '全部',
  ongoing: '进行中',
  enrollable: '可报名',
  ended: '已结束',
  unknown: '其他',
}

async function fetchMarketingActivities(platformId, status) {
  const token = readPlatformToken(platformId)
  if (!token) {
    const label = PLATFORM_TABS.find((p) => p.id === platformId)
    return { ok: false, message: `尚未绑定${label ? label.label : platformId}` }
  }
  const q = new URLSearchParams({
    platform: platformId === 'xiaohongshu' ? 'xiaohongshu' : platformId,
    page: '1',
    pageSize: '30',
  })
  if (status && status !== 'all') q.set('status', status)
  const paths = [`/api/meoo-marketing-activities?${q}`, `/api/merchant/marketing/activities?${q}`]
  let lastMsg = '拉取失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', p, { bearerToken: token })
      const raw = data.items || (data.data && data.data.items)
      const items = []
      if (Array.isArray(raw)) {
        for (const row of raw) {
          if (!row || typeof row !== 'object') continue
          const id = String(row.id || row.activity_id || '').trim()
          if (!id) continue
          const ui = row.uiStatus || row.ui_status || 'unknown'
          items.push({
            id,
            title: String(row.title || row.activity_name || '平台活动').trim(),
            summary: typeof row.summary === 'string' ? row.summary : '',
            uiStatus: ui,
            uiStatusLabel: ACTIVITY_STATUS[ui] || ui,
            startAt: row.startAt || row.start_at || '',
            endAt: row.endAt || row.end_at || '',
          })
        }
      }
      return { ok: true, items }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastMsg }
}

function readLocalPromotionCreds() {
  try {
    let raw = wx.getStorageSync('meoo_local_promotion_bind')
    if (typeof raw === 'string' && raw.trim()) {
      try {
        raw = JSON.parse(raw)
      } catch (_) {
        return null
      }
    }
    if (!raw || typeof raw !== 'object') return null
    const access_token = String(raw.accessToken || raw.access_token || '').trim()
    const local_account_id = String(raw.localAccountId || raw.local_account_id || '').trim()
    if (!access_token || !local_account_id) return null
    return { access_token, local_account_id }
  } catch (_) {
    return null
  }
}

async function fetchLocalPromotions() {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const creds = readLocalPromotionCreds()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  try {
    const data = await merchantApi.merchantRequest('GET', `/api/merchant/local-promotion/promotions${qs}`)
    const list = Array.isArray(data.list) ? data.list : []
    const items = list.map((x) => ({
      id: String(x.id || x.promotion_id || ''),
      name: String(x.name || x.promotion_name || '计划'),
      status: String(x.status || x.opt_status || '—'),
      budget: x.budget != null ? String(x.budget) : '',
    }))
    return { ok: true, items, demoMode: Boolean(data.demoMode) }
  } catch (e) {
    return {
      ok: false,
      message:
        (e instanceof Error ? e.message : String(e)) ||
        '尚未绑定巨量本地推，请在商家后台「设置 → 商业化后台」完成绑定后重新打开小程序',
    }
  }
}

async function fetchLocalClues(page) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const creds = readLocalPromotionCreds()
  if (!creds) {
    return { ok: false, message: '尚未绑定巨量本地推，线索需在设置页完成绑定后同步' }
  }
  try {
    const data = await merchantApi.merchantRequest(
      'POST',
      '/api/merchant/local-promotion/clues/list',
      {
        ...creds,
        page: page || 1,
        page_size: 50,
      },
    )
    const list = Array.isArray(data.list) ? data.list : []
    const items = list.map((x) => ({
      id: String(x.clue_id || x.id || ''),
      name: String(x.name || x.user_name || '线索'),
      phone: String(x.telephone || x.phone || ''),
      state: String(x.convert_state || x.state || '—'),
      createdAt: String(x.create_time || x.created_at || ''),
    }))
    return { ok: true, items, demoMode: Boolean(data.demoMode) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function postAiAssist(scene, brief) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const token = readPlatformToken('douyin')
  const paths = ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist']
  const body = { scene, brief, platform: 'douyin' }
  let lastMsg = '生成失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', p, {
        bearerToken: token || undefined,
        data: body,
      })
      const text = String(data.text || data.result || data.content || '').trim()
      if (text) return { ok: true, text }
      lastMsg = data.message || '未返回内容'
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastMsg }
}

function loadNotifications() {
  try {
    const raw = wx.getStorageSync('meoo_mp_notifications')
    return Array.isArray(raw) ? raw : []
  } catch (_) {
    return []
  }
}

function pushNotification(item) {
  const list = loadNotifications()
  list.unshift({
    id: `n-${Date.now()}`,
    title: item.title || '通知',
    body: item.body || '',
    time: new Date().toISOString(),
    read: false,
  })
  try {
    wx.setStorageSync('meoo_mp_notifications', list.slice(0, 80))
  } catch (_) {}
}

module.exports = {
  fetchFinanceReconcile,
  fetchStoresForPlatform,
  fetchMarketingActivities,
  fetchLocalPromotions,
  fetchLocalClues,
  postAiAssist,
  loadNotifications,
  pushNotification,
  ACTIVITY_STATUS,
}
