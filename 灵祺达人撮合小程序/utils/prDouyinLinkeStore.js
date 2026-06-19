const scope = require('./mpAccountLocalScope.js')

const STORAGE_KEY = 'meoo_pr_douyin_linke_v1'

function storageKey() {
  return scope.scopedStorageKey(STORAGE_KEY)
}

function emptyPrDouyinLinkeBindings() {
  return { serviceProvider: null, clients: [] }
}

function readPrDouyinLinkeBindings() {
  try {
    const raw = wx.getStorageSync(storageKey())
    if (!raw) return emptyPrDouyinLinkeBindings()
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      serviceProvider: parsed.serviceProvider || null,
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    }
  } catch (_) {
    return emptyPrDouyinLinkeBindings()
  }
}

function writePrDouyinLinkeBindings(bindings) {
  wx.setStorageSync(storageKey(), JSON.stringify(bindings))
}

function upsertPrDouyinServiceProvider(sp) {
  const cur = readPrDouyinLinkeBindings()
  writePrDouyinLinkeBindings({ ...cur, serviceProvider: sp })
}

function upsertPrDouyinLinkeClient(client) {
  const cur = readPrDouyinLinkeBindings()
  const idx = cur.clients.findIndex((c) => c.id === client.id)
  const clients = [...cur.clients]
  if (idx >= 0) clients[idx] = client
  else clients.push(client)
  writePrDouyinLinkeBindings({ ...cur, clients })
}

function deletePrDouyinLinkeClient(clientId) {
  const cur = readPrDouyinLinkeBindings()
  writePrDouyinLinkeBindings({
    ...cur,
    clients: cur.clients.filter((c) => c.id !== clientId),
  })
}

function findPrDouyinLinkeClient(clientId) {
  return readPrDouyinLinkeBindings().clients.find((c) => c.id === clientId) || null
}

function hasPrDouyinLinkeServiceProvider() {
  const sp = readPrDouyinLinkeBindings().serviceProvider
  return !!(sp && sp.sealedToken && sp.merchantAccountId)
}

function listPrDouyinLinkeClients() {
  return readPrDouyinLinkeBindings().clients
}

function applyPrDouyinClientSession(client) {
  try {
    wx.setStorageSync('meoo_pr_douyin_merchant_token', client.sealedToken)
    wx.setStorageSync('meoo_pr_douyin_merchant_id', client.merchantAccountId)
    if (client.clientKey) wx.setStorageSync('meoo_pr_douyin_app_id', client.clientKey)
    wx.setStorageSync('meoo_pr_douyin_account_name', client.accountDisplayName)
  } catch (_) {
    /* ignore */
  }
}

function readPrDouyinClientSessionToken() {
  try {
    return String(wx.getStorageSync('meoo_pr_douyin_merchant_token') || '').trim()
  } catch (_) {
    return ''
  }
}

module.exports = {
  emptyPrDouyinLinkeBindings,
  readPrDouyinLinkeBindings,
  writePrDouyinLinkeBindings,
  upsertPrDouyinServiceProvider,
  upsertPrDouyinLinkeClient,
  deletePrDouyinLinkeClient,
  findPrDouyinLinkeClient,
  hasPrDouyinLinkeServiceProvider,
  listPrDouyinLinkeClients,
  applyPrDouyinClientSession,
  readPrDouyinClientSessionToken,
}
