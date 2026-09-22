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

const STORE_FETCH_TIMEOUT_MS = 45000

function isLikelyHtmlPayload(data) {
  if (typeof data !== 'string') return false
  const s = data.trim().slice(0, 200).toLowerCase()
  return s.startsWith('<!doctype') || s.startsWith('<html') || s.includes('<head')
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
  const id = pickStr(src.poi_id, src.poiId, src.id, src.store_id, src.shopId, x.poi_id, x.id)
  const name = pickStr(src.poi_name, src.poiName, src.name, src.store_name, src.shopName, x.name)
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

function storeQueryString(keyword) {
  const parts = ['page=1', 'pageSize=50', 'relationType=all']
  const kw = keyword && String(keyword).trim()
  if (kw) parts.push(`keyword=${encodeURIComponent(kw)}`)
  return `?${parts.join('&')}`
}

function errMessage(e) {
  if (e && typeof e.message === 'string' && e.message.trim()) return e.message
  return String(e || '拉取失败')
}

async function tryOneStorePath(path, token) {
  try {
    const data = await merchantApi.merchantRequestAuth('GET', path, {
      bearerToken: token,
      timeoutMs: STORE_FETCH_TIMEOUT_MS,
    })
    if (isLikelyHtmlPayload(data)) {
      return { ok: false, message: '门店接口返回了网页而非数据' }
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, message: '门店接口返回无法解析' }
    }
    const raw = extractStoreRows(data)
    const items = []
    for (let i = 0; i < raw.length; i++) {
      const row = normalizeStoreItem(raw[i])
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
    const message = errMessage(e)
    return { ok: false, message }
  }
}

async function fetchStoresForPlatform(platformId, keyword) {
  const token = readPlatformToken(platformId)
  if (!token) {
    const label = PLATFORM_TABS.find((p) => p.id === platformId)
    return { ok: false, message: `尚未绑定${label ? label.label : platformId}` }
  }
  const paths = storePathCandidates(platformId, storeQueryString(keyword))
  if (!paths.length) {
    return { ok: false, message: '该平台门店接口尚未接入' }
  }
  let lastMsg = '拉取失败'
  for (let i = 0; i < paths.length; i++) {
    const result = await tryOneStorePath(paths[i], token)
    if (result.ok) return { ok: true, items: result.items, total: result.total }
    lastMsg = result.message || lastMsg
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
  return readBindCreds('meoo_local_promotion_bind')
}

function readQianchuanCreds() {
  return readBindCreds('meoo_qianchuan_bind')
}

function readXhsCommercialCreds() {
  return readBindCreds('meoo_xhs_commercial_bind')
}

function readBindCreds(storageKey) {
  try {
    let raw = wx.getStorageSync(storageKey)
    if (typeof raw === 'string' && raw.trim()) {
      try {
        raw = JSON.parse(raw)
      } catch (_) {
        return null
      }
    }
    if (!raw || typeof raw !== 'object') return null
    const access_token = String(raw.accessToken || raw.access_token || '').trim()
    const local_account_id = String(
      raw.localAccountId || raw.local_account_id || raw.advertiserId || raw.advertiser_id || '',
    ).trim()
    const app_id = String(raw.appId || raw.app_id || '').trim()
    if (!access_token || !local_account_id) return null
    return { access_token, local_account_id, app_id }
  } catch (_) {
    return null
  }
}

function adsCredsPayload(creds) {
  return {
    access_token: creds.access_token,
    accessToken: creds.access_token,
    local_account_id: creds.local_account_id,
    advertiser_id: creds.local_account_id,
    advertiserId: creds.local_account_id,
    app_id: creds.app_id || '',
    appId: creds.app_id || '',
  }
}

function adsChannelSpec(channel) {
  if (channel === 'qianchuan') {
    return {
      label: '巨量千川',
      creds: readQianchuanCreds,
      promotionsPath: '/api/merchant/qianchuan/promotions',
      statusPath: '/api/merchant/qianchuan/promotions/status',
      reportPath: '/api/merchant/qianchuan/report/summary',
      cluesPath: '/api/merchant/qianchuan/clues/list',
      callbackPath: '/api/merchant/qianchuan/clues/callback',
      accountQuery: 'advertiser_id',
      unbound: '尚未绑定巨量千川。请在电脑端「系统 → 投流」绑定千川账号后下拉刷新。',
      tag: '千川',
      projectsPath: '/api/merchant/qianchuan/projects',
      createPath: '/api/merchant/qianchuan/promotions/create',
    }
  }
  if (channel === 'xhs_juguang') {
    return {
      label: '小红书聚光',
      creds: readXhsCommercialCreds,
      promotionsPath: '/api/merchant/xhs-juguang/promotions',
      statusPath: '/api/merchant/xhs-juguang/promotions/status',
      reportPath: '/api/merchant/xhs-juguang/report/summary',
      cluesPath: '/api/merchant/xhs-zhongxiaocao/clues/list',
      callbackPath: '/api/merchant/xhs-zhongxiaocao/clues/callback',
      accountQuery: 'advertiser_id',
      unbound: '尚未绑定小红书聚光 / 种小草。请在电脑端「系统设置」完成绑定后下拉刷新。',
      tag: '聚光',
      projectsPath: '/api/merchant/xhs-juguang/projects',
      createPath: '/api/merchant/xhs-juguang/promotions/create',
    }
  }
  return {
    label: '本地推',
    creds: readLocalPromotionCreds,
    promotionsPath: '/api/merchant/local-promotion/promotions',
    statusPath: '/api/merchant/local-promotion/promotions/status',
    reportPath: '/api/merchant/local-promotion/report/summary',
    cluesPath: '/api/merchant/local-promotion/clues/list',
    callbackPath: '/api/merchant/local-promotion/clues/callback',
    accountQuery: 'local_account_id',
    unbound: '尚未绑定巨量本地推。请在电脑端「系统设置」完成绑定后下拉刷新。',
    tag: '本地推',
    projectsPath: '/api/merchant/local-promotion/projects',
    createPath: '/api/merchant/local-promotion/promotions/create',
  }
}

function mapPromotionRow(x, tag) {
  const id = String(x.promotionId || x.promotion_id || x.id || '')
  const name = String(x.promotionName || x.promotion_name || x.name || '计划')
  const status = String(x.statusLabel || x.status || x.opt_status || x.statusFirst || '—')
  const budget = x.budgetYuan != null ? String(x.budgetYuan) : x.budget != null ? String(x.budget) : ''
  const spend = x.statCost != null ? String(x.statCost) : x.spend != null ? String(x.spend) : ''
  const exposure = x.showCnt != null ? String(x.showCnt) : x.exposure != null ? String(x.exposure) : ''
  const click = x.clickCnt != null ? String(x.clickCnt) : ''
  const convert = x.convertCnt != null ? String(x.convertCnt) : ''
  return {
    id,
    name,
    status,
    budget,
    spend,
    exposure,
    click,
    convert,
    projectId: String(x.projectId || x.project_id || ''),
    tags: [tag],
  }
}

async function fetchAdsPromotions(channel) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  const qs = `?access_token=${encodeURIComponent(creds.access_token)}&${spec.accountQuery}=${encodeURIComponent(creds.local_account_id)}`
  try {
    const data = await merchantApi.merchantRequest('GET', `${spec.promotionsPath}${qs}`)
    const list = Array.isArray(data.list) ? data.list : []
    return {
      ok: true,
      items: list.map((x) => mapPromotionRow(x, spec.tag)),
      demoMode: Boolean(data.demoMode),
      apiError: data.apiError || data.message || '',
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchAdsReport(channel) {
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  const qs = `?access_token=${encodeURIComponent(creds.access_token)}&${spec.accountQuery}=${encodeURIComponent(creds.local_account_id)}`
  try {
    const data = await merchantApi.merchantRequest('GET', `${spec.reportPath}${qs}`)
    return { ok: true, summary: data.summary || null, demoMode: Boolean(data.demoMode) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function updateAdsStatus(channel, promotionIds, optStatus) {
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  try {
    await merchantApi.merchantRequest('POST', spec.statusPath, {
      ...adsCredsPayload(creds),
      promotion_ids: promotionIds,
      opt_status: optStatus,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchAdsProjects(channel) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址', items: [] }
  }
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound, items: [] }
  const qs = `?access_token=${encodeURIComponent(creds.access_token)}&${spec.accountQuery}=${encodeURIComponent(creds.local_account_id)}`
  try {
    const data = await merchantApi.merchantRequest('GET', `${spec.projectsPath}${qs}`)
    const list = Array.isArray(data.list) ? data.list : []
    const items = list.map((x) => ({
      id: String(x.projectId || x.campaign_id || x.id || ''),
      name: String(x.projectName || x.campaign_name || x.name || '计划'),
    })).filter((x) => x.id)
    return { ok: true, items }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), items: [] }
  }
}

async function createAdsPromotion(channel, input) {
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  const name = String((input && input.name) || '').trim()
  const budgetYuan = Number((input && input.budgetYuan) || 0)
  const goal = String((input && input.goal) || 'video')
  const marketingGoal =
    goal === 'live' ? 'LIVE' : goal === 'clue' ? 'CLUE' : 'VIDEO_PROM_GOODS'
  if (!name) return { ok: false, message: '请填写计划名称' }
  if (!Number.isFinite(budgetYuan) || budgetYuan < 100) return { ok: false, message: '日预算至少 100 元' }
  try {
    const data = await merchantApi.merchantRequestAuth('POST', spec.createPath, {
      data: {
        ...adsCredsPayload(creds),
        name,
        campaign_name: name,
        project_name: name,
        budget_yuan: budgetYuan,
        budgetYuan,
        marketing_goal: marketingGoal,
        goal,
      },
      timeoutMs: 60000,
    })
    if (data && data.ok === false) {
      return { ok: false, message: String(data.message || '创建失败') }
    }
    return {
      ok: true,
      projectId: String((data && (data.projectId || data.campaign_id)) || ''),
      message: String((data && data.message) || '已创建'),
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchLocalPromotions() {
  return fetchAdsPromotions('local_promotion')
}

async function fetchAdsClues(channel, page) {
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址' }
  }
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  try {
    const data = await merchantApi.merchantRequest('POST', spec.cluesPath, {
      ...adsCredsPayload(creds),
      page: page || 1,
      page_size: 50,
    })
    const list = Array.isArray(data.list) ? data.list : []
    const items = list.map((x) => ({
      id: String(x.clue_id || x.id || ''),
      name: String(x.name || x.user_name || '线索'),
      phone: String(x.telephone || x.phone || ''),
      state: String(x.convert_state || x.state || '—'),
      createdAt: String(x.create_time || x.created_at || ''),
      source: spec.label,
    }))
    return { ok: true, items, demoMode: Boolean(data.demoMode) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchLocalClues(page) {
  return fetchAdsClues('local_promotion', page)
}

async function postClueCallback(channel, clueId, convertState) {
  const spec = adsChannelSpec(channel)
  const creds = spec.creds()
  if (!creds) return { ok: false, message: spec.unbound }
  try {
    await merchantApi.merchantRequest('POST', spec.callbackPath, {
      ...adsCredsPayload(creds),
      clue_id: clueId,
      clue_convert_state: convertState,
      convert_state: convertState,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchStoreDecorations(platformId, keyword) {
  const token = readPlatformToken(platformId)
  if (!token) {
    const label = PLATFORM_TABS.find((p) => p.id === platformId)
    return { ok: false, message: `尚未绑定${label ? label.label : platformId}` }
  }
  const qs = storeQueryString(keyword)
  const seg = apiSegment(platformId)
  const paths =
    platformId === 'douyin'
      ? [`/api/meoo-douyin-store-decoration${qs}`, `/api/merchant/douyin/store-decoration${qs}`]
      : seg
        ? [`/api/merchant/${seg}/store-decoration${qs}`]
        : []
  if (!paths.length) return { ok: false, message: '该平台装修接口尚未接入' }
  let lastMsg = '拉取失败'
  for (let i = 0; i < paths.length; i++) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', paths[i], {
        bearerToken: token,
        timeoutMs: STORE_FETCH_TIMEOUT_MS,
      })
      if (isLikelyHtmlPayload(data)) continue
      const raw = extractStoreRows(data)
      const items = []
      for (let j = 0; j < raw.length; j++) {
        const x = raw[j]
        if (!x || typeof x !== 'object') continue
        const id = pickStr(x.id, x.poiId, x.poi_id, x.shopId, x.storeId)
        const name = pickStr(x.name, x.shopName, x.storeName, x.poi_name)
        if (!id && !name) continue
        items.push({
          id: id || name,
          name: name || '未命名门店',
          address: pickStr(x.address, x.announcement, x.notice),
          auditStatus: pickStr(x.auditStatus, x.audit_status),
          coverImageUrl: pickStr(x.coverImageUrl, x.cover_url, x.thumb_url),
          announcement: pickStr(x.announcement, x.notice),
          albumCount: x.albumCount || x.album_count || '',
        })
      }
      return { ok: true, items }
    } catch (e) {
      lastMsg = errMessage(e)
    }
  }
  return { ok: false, message: lastMsg }
}

async function postDouyinPoiDecorate(poiId, headImages) {
  const token = readPlatformToken('douyin')
  if (!token) return { ok: false, message: '尚未绑定抖音来客' }
  const images = (headImages || []).map((u) => String(u || '').trim()).filter((u) => /^https:\/\//i.test(u))
  if (!poiId || images.length === 0) return { ok: false, message: '请选择门店并上传头图' }
  const body = { poiId, thirdId: poiId, headImages: images, waitTask: true }
  const paths = ['/api/meoo-douyin-poi-decorate', '/api/merchant/douyin/store-decoration/decorate']
  let lastMsg = '装修提交失败'
  for (let i = 0; i < paths.length; i++) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', paths[i], {
        bearerToken: token,
        data: body,
      })
      if (data && data.ok === false) {
        lastMsg = String(data.message || lastMsg)
        continue
      }
      return { ok: true, message: String((data && data.message) || '已提交抖音门店装修任务') }
    } catch (e) {
      lastMsg = errMessage(e)
    }
  }
  return { ok: false, message: lastMsg }
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
  fetchStoreDecorations,
  postDouyinPoiDecorate,
  fetchMarketingActivities,
  fetchLocalPromotions,
  fetchAdsPromotions,
  fetchAdsProjects,
  createAdsPromotion,
  fetchAdsReport,
  updateAdsStatus,
  fetchLocalClues,
  fetchAdsClues,
  postClueCallback,
  postAiAssist,
  loadNotifications,
  pushNotification,
  ACTIVITY_STATUS,
}
