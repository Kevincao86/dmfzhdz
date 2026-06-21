const api = require('./api.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const accountMemberSync = require('./accountMemberSync.js')
const applicationsStore = require('./applicationsStore.js')
const registryCache = require('./registryCache.js')
const { normalizeHallPayload } = require('./hallRegistryParse.js')

function isRetryableRegistryErr(e) {
  const msg = String((e && e.message) || e || '')
  return /超时|timeout|reset|errcode:-101|cronet|cloud:callFunction|request:fail|cloud_proxy/i.test(msg)
}

function hasMpOrders(data) {
  const mp = data && data.mpRecruitmentOrders
  return Array.isArray(mp) && mp.length > 0
}

function findMpOrderInRegistry(reg, mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id || !reg) return null
  const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  return list.find((o) => o && String(o.id) === id) || null
}

function resolveIncludeMpOrderIds(opts) {
  const explicit = []
  for (const id of (opts && opts.includeMpOrderIds) || []) {
    const s = String(id || '').trim()
    if (s) explicit.push(s)
  }
  if (opts && (opts.includeLocalContext || opts.includePrOwned)) {
    return collectIncludeMpOrderIds(explicit)
  }
  return [...new Set(explicit)].slice(0, 120)
}

function registryRequestKey(opts) {
  const ids = resolveIncludeMpOrderIds(opts)
  const prOwned = opts && opts.includePrOwned ? 'pr' : ''
  const ctx = opts && opts.includeLocalContext ? 'ctx' : ''
  const recommend = opts && opts.includeRecommendPool ? 'recommend' : ''
  if (ids.length) return `inc:${ids.slice().sort().join(',')}${ctx ? ':ctx' : ''}`
  if (prOwned) return 'pr-owned'
  if (recommend) return 'recommend-pool'
  return ctx ? 'hall-ctx' : 'hall'
}

/** 仅合并同一时刻的并行请求，不跳过轻量拉取 */
const inflightByKey = new Map()

const HALL_GET = '/api/meoo-ops-mp-hall-registry'
const HALL_POST = '/api/meoo-ops-mp-auth'
const SYNC_REGISTRY_PATHS = ['/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
const PUBLISHER_DISPLAY_GET = '/api/meoo-ops-mp-publisher-display'
const FORM_RELAY_GROUP_QR_GET = '/api/meoo-ops-mp-form-relay-group-qr'

function parsePublisherDisplayPayload(raw, mpOrderId, mpOrder) {
  if (!raw || typeof raw !== 'object') return null
  let body = raw
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    const nested = body.data
    if (nested.displayName || nested.prUser || nested.ok === true || nested.ok === false) {
      body = nested
    }
  }
  if (body.ok === false && !body.displayName && !body.prUser) return null
  let displayName = String(body.displayName || '').trim()
  const prUser = body.prUser && typeof body.prUser === 'object' ? body.prUser : null
  if (!displayName && prUser) {
    const prPubName = require('./prRegistryPublisherName.js')
    displayName =
      prPubName.prUserRegistryDisplayNameForPoster(prUser) ||
      prPubName.resolvePublisherDisplayNameForPoster(prUser, mpOrder || { id: mpOrderId })
  }
  if (!displayName) return null
  return { displayName, prUser }
}

function mergeRegWithPrUsers(reg) {
  if (!reg || typeof reg !== 'object') return reg
  const own = Array.isArray(reg.mpPrUsers) ? reg.mpPrUsers : []
  if (own.length) return reg
  try {
    const cached = readRegistryCache()
    const fromCache = cached && Array.isArray(cached.mpPrUsers) ? cached.mpPrUsers : []
    if (fromCache.length) return { ...reg, mpPrUsers: fromCache }
  } catch (_) {}
  return reg
}

function collectIncludeMpOrderIds(extraIds) {
  const ids = new Set()
  for (const a of applicationsStore.readApplications()) {
    const id = String(a && a.mpOrderId ? a.mpOrderId : '').trim()
    if (id) ids.add(id)
  }
  for (const p of applicationsStore.readPublishedOrders()) {
    const id = String(p && p.mpOrderId ? p.mpOrderId : '').trim()
    if (id) ids.add(id)
  }
  for (const id of extraIds || []) {
    const s = String(id || '').trim()
    if (s) ids.add(s)
  }
  return [...ids].slice(0, 120)
}

/**
 * 拉取大厅注册表。
 * 优先 GET：mpErpProxy 对 GET 有多路上游重试；POST 为单次（避免 wx code 重试），不宜放首位。
 * 超时仅由 cloudEcs（50s）一层控制，避免双层 withTimeout 误杀。
 */
async function fetchRegistryOnce(opts) {
  const includeMpOrderIds = resolveIncludeMpOrderIds(opts)
  const includePrOwned = !!(opts && opts.includePrOwned)
  const includeRecommendPool = !!(opts && opts.includeRecommendPool)
  let lastErr
  if (!includePrOwned && !includeMpOrderIds.length && !(opts && opts.includeLocalContext)) {
    try {
      const hallPath = includeRecommendPool ? `${HALL_GET}?includeRecommendPool=1` : HALL_GET
      const raw = await api.get(hallPath)
      return normalizeHallPayload(raw)
    } catch (e) {
      lastErr = e
      console.warn('[mp] hall_registry GET failed', String(e.message || e).slice(0, 200))
    }
  }
  try {
    const body = { action: 'hall_registry', includeMpOrderIds }
    if (includePrOwned) {
      body.includePrOwned = true
      const acc = auth.readAccount()
      const pr = userProfile.readPrProfile()
      body.lingqiPrId = String((acc && acc.lingqiPrId) || (pr && pr.lingqiPrId) || '').trim()
      body.registryPrId = String(
        (acc && (acc.registryPrId || acc.registryMemberId)) || (pr && pr.id) || '',
      ).trim()
    }
    if (includeRecommendPool) body.includeRecommendPool = true
    const raw = await api.post(HALL_POST, body, registerAuthHeaders())
    return normalizeHallPayload(raw)
  } catch (e2) {
    const msg = String(e2 && e2.message ? e2.message : e2)
    console.warn('[mp] hall_registry POST failed', msg.slice(0, 200))
    throw lastErr || e2 || new Error(msg || 'hall_fetch_failed')
  }
}

async function fetchRegistryViaErpApi(opts) {
  const includeRecommendPool = !!(opts && opts.includeRecommendPool)
  let lastErr
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await fetchRegistryOnce(opts)
      registryCache.save(data, attempt === 0 ? HALL_GET : `${HALL_POST}:retry`, {
        recommendPool: includeRecommendPool,
      })
      return data
    } catch (e) {
      lastErr = e
      if (attempt === 0 && isRetryableRegistryErr(e)) {
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
      break
    }
  }
  throw lastErr || new Error('hall_fetch_failed')
}

function hasRecommendPool(data) {
  if (!data || typeof data !== 'object') return false
  const lib = Array.isArray(data.talentLibraryEntries) ? data.talentLibraryEntries.length : 0
  // 推荐池须含达人库切片（粉丝数来源），仅有 mpTalentMembers 的旧缓存不可用
  return lib > 0
}

function readRegistryCache(opts) {
  const recommendPool = !!(opts && opts.recommendPool)
  const cached = registryCache.load({ allowStale: true, recommendPool })
  return cached && cached.data ? cached.data : null
}

async function fetchRegistryFromServer(opts) {
  const data = await fetchRegistryViaErpApi(opts)
  if (!opts || !opts.skipCache) {
    registryCache.save(data, 'erp-api:hall-registry', {
      recommendPool: !!(opts && opts.includeRecommendPool),
    })
  }
  return data
}

/** 分享海报：强制网络拉取发单方 PR，不用本地 registry 缓存 */
async function fetchRegistryForPoster(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  return fetchRegistryFromServer({
    includeMpOrderIds: [id],
    includeLocalContext: true,
    skipCache: true,
  })
}

/** 分享海报：从已有 registry 同步解析（详情页 _orderReg，零网络） */
function publisherDisplayFromRegistry(reg, mpOrderId, mpOrderHint) {
  const prPubName = require('./prRegistryPublisherName.js')
  const id = String(mpOrderId || '').trim()
  if (!id || !reg) return null
  const mp = findMpOrderInRegistry(reg, id) || mpOrderHint || null
  if (!mp) return null
  const users = Array.isArray(reg.mpPrUsers) ? reg.mpPrUsers : []
  if (!users.length) return null

  let user = prPubName.matchRegistryPrUserForOrder(mp, users)
  if (!user) {
    const keys = prPubName.orderPublisherMetaKeys(mp)
    const regId = String(keys.registryPrId || '').trim()
    const lqId = String(keys.lingqiPrId || '').trim()
    if (regId) {
      user =
        users.find((u) => String(u && u.id || '').trim() === regId) ||
        users.find((u) => String(u && u.lingqiPrId || '').trim() === regId) ||
        null
    }
    if (!user && lqId) {
      user =
        users.find((u) => String(u && u.lingqiPrId || '').trim() === lqId) ||
        users.find((u) => String(u && u.id || '').trim() === lqId) ||
        null
    }
  }

  if (!user) return null
  let displayName = prPubName.prUserRegistryDisplayNameForPoster(user)
  if (!displayName) displayName = prPubName.resolvePublisherDisplayNameForPoster(user, mp)
  if (!displayName) return null
  return { displayName, prUser: user }
}

/** 分享海报：按招商单 ID 实时读 PR 用户库名称（商家后台「名称」列） */
function publisherDisplayFromHallRegistry(mpOrderId, mpOrderHint) {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  return fetchRegistryForPoster(id).then((reg) => publisherDisplayFromRegistry(reg, id, mpOrderHint))
}

async function fetchPublisherDisplayFreshByOrderId(mpOrderId, mpOrder) {
  const id = String(mpOrderId || '').trim()
  if (!id || !api.hasApi()) return null
  const mpCtx = mpOrder && typeof mpOrder === 'object' ? mpOrder : { id }
  const tryParse = (raw) => parsePublisherDisplayPayload(raw, id, mpCtx)
  const postBody = { action: 'publisher_display_for_order', mpOrderId: id }

  try {
    const raw = await api.get(`${PUBLISHER_DISPLAY_GET}?mpOrderId=${encodeURIComponent(id)}`)
    const hit = tryParse(raw)
    if (hit) return hit
  } catch (e) {
    console.warn('[poster] GET by orderId', String(e && e.message ? e.message : e).slice(0, 100))
  }

  try {
    const raw = await api.post(HALL_POST, postBody)
    const hit = tryParse(raw)
    if (hit) return hit
  } catch (e) {
    console.warn('[poster] POST by orderId (public)', String(e && e.message ? e.message : e).slice(0, 100))
  }

  try {
    const raw = await api.post(HALL_POST, postBody, registerAuthHeaders())
    const hit = tryParse(raw)
    if (hit) return hit
  } catch (e) {
    console.warn('[poster] POST by orderId (auth)', String(e && e.message ? e.message : e).slice(0, 100))
  }
  return null
}

async function fetchPublisherDisplayForOrder(mpOrderId, mpOrder, regHint) {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  const mpCtx = mpOrder && typeof mpOrder === 'object' ? mpOrder : { id }

  const tryParse = (raw) => parsePublisherDisplayPayload(raw, id, mpCtx)

  if (regHint) {
    const fromReg = publisherDisplayFromRegistry(regHint, id, mpCtx)
    if (fromReg && fromReg.displayName) return fromReg
  }

  let raw = null
  try {
    raw = await api.get(`${PUBLISHER_DISPLAY_GET}?mpOrderId=${encodeURIComponent(id)}`)
    const hit = tryParse(raw)
    if (hit) return hit
  } catch (e) {
    console.warn(
      '[poster] publisher_display GET',
      String(e && e.message ? e.message : e).slice(0, 80),
    )
  }

  try {
    raw = await api.post(
      HALL_POST,
      { action: 'publisher_display_for_order', mpOrderId: id },
      registerAuthHeaders(),
    )
    const hit = tryParse(raw)
    if (hit) return hit
  } catch (e) {
    console.warn(
      '[poster] publisher_display POST',
      String(e && e.message ? e.message : e).slice(0, 80),
    )
  }

  try {
    const cached = readRegistryCache()
    const fromCache = publisherDisplayFromRegistry(cached, id, mpCtx)
    if (fromCache && fromCache.displayName) return fromCache
  } catch (_) {}

  return publisherDisplayFromHallRegistry(id, mpCtx)
}

/**
 * 始终优先请求轻量 ECS；仅当云函数/接口彻底失败时才回退本地缓存。
 * 并行重复请求合并为一次，避免打爆云函数。
 */
async function fetchRegistry(opts) {
  if (opts && opts.skipCache) {
    return fetchRegistryFromServer(opts)
  }
  const key = registryRequestKey(opts)
  const pending = inflightByKey.get(key)
  if (pending) return pending

  const task = (async () => {
    try {
      return await fetchRegistryFromServer(opts)
    } catch (e) {
      console.warn('[mp] fetchRegistry server failed', String(e && e.message ? e.message : e).slice(0, 240))
      const includeRecommendPool = !!(opts && opts.includeRecommendPool)
      const cached = readRegistryCache({ recommendPool: includeRecommendPool })
      if (cached && hasMpOrders(cached)) {
        if (!includeRecommendPool || hasRecommendPool(cached)) {
          console.warn('[mp] fetchRegistry use cache after server fail')
          return cached
        }
      }
      throw e
    }
  })().finally(() => {
    if (inflightByKey.get(key) === task) inflightByKey.delete(key)
  })
  inflightByKey.set(key, task)
  return task
}

async function bumpMpRecruitmentEngagement(mpOrderId, action) {
  const id = String(mpOrderId || '').trim()
  const act = String(action || '').trim()
  if (!id || (act !== 'detail_view' && act !== 'form_relay_click')) {
    throw new Error('invalid_engagement_bump')
  }
  return api.post('/api/meoo-ops-mp-recruitment-engagement-bump', { mpOrderId: id, action: act })
}

async function applyToMpOrder(mpOrderId, applicant, workIdentity, claimSlotCount) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-apply',
    '/api/ops-sync/mp-recruitment-orders/apply',
  ]
  const body = { mpOrderId, applicant }
  const wid = String(workIdentity || '').trim()
  if (wid) body.workIdentity = wid
  if (claimSlotCount != null) {
    const n = Number.parseInt(String(claimSlotCount), 10)
    if (Number.isFinite(n) && n > 0) body.claimSlotCount = n
  }
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, body)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('报名接口不可用')
}

async function submitEditDeliverLinks(mpOrderId, applicantId, deliverText) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-edit-deliver-submit',
    '/api/ops-sync/mp-recruitment-edit-deliver-submit',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, deliverText })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('成片回传接口不可用')
}

function registerAuthHeaders() {
  try {
    return auth.authHeaders()
  } catch (_) {
    return {}
  }
}

async function registerTalentMember(member) {
  const headers = registerAuthHeaders()
  const account = auth.readAccount()
  const payload = accountMemberSync.mergeMemberForCloudRegister(member, account)
  const paths = [
    '/api/meoo-ops-mp-talent-member-register',
    '/api/ops-sync/mp-talent-members/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { member: payload }, headers)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('会员注册接口不可用')
}

async function registerPrUser(prUser) {
  const headers = registerAuthHeaders()
  const paths = [
    '/api/meoo-ops-mp-pr-user-register',
    '/api/ops-sync/mp-pr-users/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { prUser }, headers)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('PR 注册接口不可用')
}

async function submitVisitPublishLink(mpOrderId, applicantId, publishUrl) {
  const paths = ['/api/meoo-ops-mp-recruitment-publish-link-submit']
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, publishUrl, douyinPublishUrl: publishUrl })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('发布链接回传接口不可用')
}

async function submitIceDouyin(mpOrderId, applicantId, douyinPublishUrl) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-ice-submit',
    '/api/ops-sync/mp-recruitment-orders/ice-submit',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, douyinPublishUrl })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('云剪回传接口不可用')
}

async function confirmIceTask(mpOrderId, applicantId, action) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-ice-confirm',
    '/api/ops-sync/mp-recruitment-orders/ice-confirm',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, action })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('云剪确认接口不可用')
}

async function appendMpRecruitmentOrder(order) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-append',
    '/api/ops-sync/mp-recruitment-orders/append',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { order })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('发单接口不可用')
}

/** 转发代收·群码模式：轻量 append + patch side map + 校验可读 */
async function publishFormRelayWithGroupQr(order, groupQrImage) {
  const formRelayGroupQrFeature = require('./formRelayGroupQrFeature.js')
  if (!formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()) {
    throw new Error(formRelayGroupQrFeature.FORM_RELAY_GROUP_QR_COMING_SOON_MSG)
  }
  const mpGroupQr = require('./mpGroupQr.js')
  const formRelayOrder = require('./formRelayOrder.js')
  const id = String(order && order.id || '').trim()
  const qr = String(groupQrImage || '').trim()
  if (!id) throw new Error('订单号无效')
  if (!qr) throw new Error('请先上传群二维码')
  const slim = formRelayOrder.stripInlineGroupQrFromOrder(order)
  await appendMpRecruitmentOrder(slim)
  await mpGroupQr.patchGroupQrImage(id, qr)
  const verify = await fetchFormRelayGroupQr(id)
  if (!verify || !verify.groupQrImage) {
    throw new Error('群二维码未写入服务器，请检查网络后重试')
  }
  return { id, groupQrImage: verify.groupQrImage }
}

async function appendTalentInbox(entries) {
  const paths = [
    '/api/meoo-ops-mp-talent-inbox-append',
    '/api/ops-sync/mp-talent-inbox/append',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { entries })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('站内信接口不可用')
}

function mergeRegistryInboxSlice(reg, slice) {
  if (!reg || typeof reg !== 'object') return reg || { mpRecruitmentOrders: [] }
  if (!Array.isArray(slice) || !slice.length) return reg
  const hallInbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const byId = new Map()
  for (let i = 0; i < slice.length; i++) {
    const row = slice[i]
    if (row && row.id) byId.set(String(row.id), row)
  }
  for (let j = 0; j < hallInbox.length; j++) {
    const row = hallInbox[j]
    if (row && row.id && !byId.has(String(row.id))) byId.set(String(row.id), row)
  }
  return { ...reg, mpTalentInbox: [...byId.values()] }
}

/** 与星选 Web 对齐：客户端过滤 inbox（sync-registry 全量路径） */
function filterInboxForCurrentTalent(inbox) {
  const talentMember = require('./talentMember.js')
  const talentInboxMatch = require('./talentInboxMatch.js')
  const member = talentMember.readMember()
  if (!member || (!member.id && !member.contact)) return []
  const keys = talentInboxMatch.talentMatchKeys(member)
  return (Array.isArray(inbox) ? inbox : [])
    .filter((row) => talentInboxMatch.inboxRowMatchesTalent(row, keys, member))
    .slice(0, 80)
}

async function fetchTalentInboxFromSyncRegistry() {
  let lastErr
  for (let i = 0; i < SYNC_REGISTRY_PATHS.length; i++) {
    try {
      const raw = await api.get(SYNC_REGISTRY_PATHS[i])
      if (!raw || raw.ok === false) {
        lastErr = new Error(String((raw && raw.error) || 'sync_registry_failed'))
        continue
      }
      return filterInboxForCurrentTalent(raw.mpTalentInbox)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) break
    }
  }
  throw lastErr || new Error('sync_registry_inbox_failed')
}

/** 优先 talent_inbox；ECS 未部署时回退 sync-registry（与星选 Web 一致） */
async function fetchTalentInboxSlice() {
  try {
    const raw = await api.post(HALL_POST, { action: 'talent_inbox' }, registerAuthHeaders())
    if (raw && raw.ok !== false && Array.isArray(raw.mpTalentInbox)) {
      return raw.mpTalentInbox
    }
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    if (!/unknown_action|http_400|404|not_found|暂未|未更新/i.test(msg)) {
      console.warn('[mp] talent_inbox', msg.slice(0, 160))
    }
  }
  try {
    return await fetchTalentInboxFromSyncRegistry()
  } catch (e2) {
    console.warn('[mp] inbox_sync', String(e2 && e2.message ? e2.message : e2).slice(0, 160))
    return []
  }
}

async function enrichRegistryWithTalentInbox(reg) {
  const slice = await fetchTalentInboxSlice()
  return mergeRegistryInboxSlice(reg, slice)
}

/** 转发代收·扫码进群：专用 GET（PG 直读 side map），404 时回退大厅 POST */
async function fetchFormRelayGroupQr(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id || !api.hasApi()) return null

  const parseHit = (raw) => {
    if (!raw || raw.ok !== true) return null
    const groupQrImage = String(raw.groupQrImage || '').trim()
    if (!groupQrImage) return null
    return {
      mpOrderId: String(raw.mpOrderId || id).trim(),
      title: String(raw.title || '').trim(),
      groupQrImage,
    }
  }

  try {
    const raw = await api.get(`${FORM_RELAY_GROUP_QR_GET}?mpOrderId=${encodeURIComponent(id)}`)
    const hit = parseHit(raw)
    if (hit) return hit
    if (raw && raw.error === 'group_qr_missing') {
      /* 订单存在但 side map 无码，继续走大厅/本地回退 */
    }
  } catch (e) {
    const msg = String(e && e.message ? e.message : e)
    if (!/404|not_found|group_qr_missing/i.test(msg)) {
      console.warn('[mp] form_relay_group_qr GET', msg.slice(0, 120))
    }
  }

  try {
    const mpGroupQr = require('./mpGroupQr.js')
    const raw = await api.post(HALL_POST, { action: 'hall_registry', includeMpOrderIds: [id] })
    const reg = normalizeHallPayload(raw)
    const groupQrImage = mpGroupQr.groupQrFromRegistry(reg, id)
    if (!groupQrImage) return null
    const mp = findMpOrderInRegistry(reg, id)
    return {
      mpOrderId: id,
      title: String((mp && mp.title) || '').trim(),
      groupQrImage,
    }
  } catch (e) {
    console.warn('[mp] form_relay_group_qr hall', String(e && e.message ? e.message : e).slice(0, 120))
    return null
  }
}

/** 我的报价页：尽量拉全量 mpPrUsers 供本地模糊搜索 */
async function fetchMpPrUsersForSearch() {
  const cached = readRegistryCache()
  const fromCache =
    cached && Array.isArray(cached.mpPrUsers) && cached.mpPrUsers.length ? cached.mpPrUsers : []
  if (fromCache.length >= 20) return fromCache

  let lastErr
  for (let i = 0; i < SYNC_REGISTRY_PATHS.length; i += 1) {
    try {
      const raw = await api.get(SYNC_REGISTRY_PATHS[i], registerAuthHeaders())
      const users = raw && Array.isArray(raw.mpPrUsers) ? raw.mpPrUsers : []
      if (users.length) return users
    } catch (e) {
      lastErr = e
    }
  }

  try {
    const reg = await fetchRegistry({ includeLocalContext: true })
    const users = reg && Array.isArray(reg.mpPrUsers) ? reg.mpPrUsers : []
    if (users.length) return users
  } catch (e) {
    lastErr = e
  }

  if (fromCache.length) return fromCache
  throw lastErr || new Error('pr_users_unavailable')
}

module.exports = {
  fetchRegistry,
  fetchMpPrUsersForSearch,
  fetchRegistryForPoster,
  fetchFormRelayGroupQr,
  fetchPublisherDisplayForOrder,
  fetchPublisherDisplayFreshByOrderId,
  mergeRegWithPrUsers,
  mergeRegistryInboxSlice,
  enrichRegistryWithTalentInbox,
  fetchTalentInboxSlice,
  publisherDisplayFromRegistry,
  findMpOrderInRegistry,
  readRegistryCache,
  bumpMpRecruitmentEngagement,
  applyToMpOrder,
  submitEditDeliverLinks,
  registerTalentMember,
  registerPrUser,
  submitIceDouyin,
  submitVisitPublishLink,
  confirmIceTask,
  appendMpRecruitmentOrder,
  publishFormRelayWithGroupQr,
  appendTalentInbox,
}
