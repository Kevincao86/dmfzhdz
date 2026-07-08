const config = require('./config.js')
const api = require('./api.js')
const supabaseCfg = require('./supabaseClientConfigMp.js')
const { decodeJwtSub } = require('./jwtDecode.js')

function rejectWxFail(reject, err) {
  const em =
    err && typeof err.errMsg === 'string'
      ? err.errMsg
      : err && typeof err.message === 'string'
        ? err.message
        : ''
  const hint =
    /127\.0\.0\.1|localhost/i.test(supabaseCfg.resolveSupabaseUrl() || '') &&
    /fail connect|timeout|CONNECTION_REFUSED|无法连接|domain/i.test(em)
      ? '（真机请改用电脑局域网 IP：utils/config.js 的 LAN_API_HOST 或 config.local.js）'
      : ''
  reject(new Error(em ? `${em}${hint}` : `网络异常${hint}`))
}

function baseUrl() {
  return supabaseCfg.resolveSupabaseUrl()
}

function headers(token, extra) {
  return Object.assign(
    {
      apikey: supabaseCfg.resolveSupabaseAnonKey(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    extra || {},
  )
}

function httpError(res, fallbackMsg) {
  const msg =
    (res.data &&
      (res.data.message || res.data.error_description || res.data.hint || res.data.error)) ||
    fallbackMsg
  const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  err.statusCode = res.statusCode
  return err
}

function shouldRetryAuth(err) {
  const code = err && err.statusCode
  const msg = String((err && err.message) || '').toLowerCase()
  if (code === 401) return true
  return /jwt expired|invalid jwt|token expired|exp claim/.test(msg)
}

async function withAuthRetry(run) {
  try {
    return await run(false)
  } catch (e) {
    if (!shouldRetryAuth(e)) throw e
    try {
      await api.refreshAccessToken()
    } catch (_) {
      throw e
    }
    return await run(true)
  }
}

function rawRequest(method, pathAndQuery, tokenUse, body) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl()}${pathAndQuery}`,
      method,
      header: headers(tokenUse),
      data: body,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject(httpError(res, `请求失败 ${res.statusCode}`))
      },
      fail(err) {
        rejectWxFail(reject, err)
      },
    })
  })
}

function request(method, pathAndQuery, token, body) {
  return withAuthRetry(async (afterRefresh) => {
    const tokenUse = afterRefresh ? api.getAccessToken() : token || api.getAccessToken()
    return rawRequest(method, pathAndQuery, tokenUse, body)
  })
}

async function fetchAuthUserId() {
  const token = api.getAccessToken()
  if (!token) return null
  let sub = decodeJwtSub(token)
  if (sub) return sub
  try {
    const user = await rawRequest('GET', '/auth/v1/user', token)
    return user && typeof user.id === 'string' ? user.id : null
  } catch (_) {
    return null
  }
}

async function fetchPrimaryTenantId() {
  const token = api.getAccessToken()
  const sub = await fetchAuthUserId()
  if (!sub) throw new Error('登录状态异常，请重新登录')
  const rows = await request(
    'GET',
    `/rest/v1/tenant_members?select=tenant_id&user_id=eq.${encodeURIComponent(sub)}&limit=1`,
    token,
  )
  const tid = rows && rows[0] && rows[0].tenant_id
  if (!tid) throw new Error('当前账号未关联门店，请联系管理员')
  return tid
}

/** tenants.name，用于招募单 customerName 与列表筛选（与 Web 展示一致） */
async function fetchTenantMerchantName(tenantId) {
  const token = api.getAccessToken()
  const rows = await request(
    'GET',
    `/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=name`,
    token,
  )
  const n = rows && rows[0] && typeof rows[0].name === 'string' ? rows[0].name.trim() : ''
  return n
}

async function fetchTenantWalletSummary(tenantId) {
  const token = api.getAccessToken()
  const trows = await request(
    'GET',
    `/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=wallet_balance_cents,service_expire_at`,
    token,
  )
  const t = trows && trows[0]
  const balance = t && typeof t.wallet_balance_cents === 'number' ? t.wallet_balance_cents : 0
  const expire = t && t.service_expire_at ? t.service_expire_at : null
  const ledger = await request(
    'GET',
    `/rest/v1/tenant_wallet_ledger?tenant_id=eq.${encodeURIComponent(
      tenantId,
    )}&select=id,delta_cents,balance_after_cents,reason,created_at&order=created_at.desc&limit=60`,
    token,
  )
  return { balanceCents: balance, serviceExpireAt: expire, ledger: Array.isArray(ledger) ? ledger : [] }
}

async function fetchTenantMembershipRow(tenantId) {
  const token = api.getAccessToken()
  const tid = encodeURIComponent(String(tenantId || '').trim())
  const rows = await request(
    'GET',
    `/rest/v1/tenants?id=eq.${tid}` +
      '&select=membership_plan,direct_ai_calls_used,service_expire_at,subscription_days,ops_gift_days,official_days',
    token,
  )
  return rows && rows[0] ? rows[0] : null
}

async function fetchTenantStoreIntel(tenantId) {
  const token = api.getAccessToken()
  const tid = encodeURIComponent(String(tenantId || '').trim())
  const rows = await request(
    'GET',
    `/rest/v1/tenant_store_intel?tenant_id=eq.${tid}` +
      '&select=margin_config,menu_items,menu_store_name,menu_item_count,updated_at&limit=1',
    token,
  )
  return rows && rows[0] ? rows[0] : null
}

async function fetchSupportRelayMessages(sessionId) {
  const token = api.getAccessToken()
  const sid = encodeURIComponent(String(sessionId || '').trim())
  const rows = await request(
    'GET',
    `/rest/v1/support_relay_messages?session_id=eq.${sid}` +
      '&select=from_role,text,ts,client_msg_id&order=ts.asc&limit=200',
    token,
  )
  return Array.isArray(rows) ? rows : []
}

function insertSupportRelayMessage(row) {
  return withAuthRetry(async () => {
    const token = api.getAccessToken()
    const sub = decodeJwtSub(token)
    const body = Object.assign({}, row, { author_user_id: sub || null })
    await new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl()}/rest/v1/support_relay_messages`,
        method: 'POST',
        header: Object.assign(headers(token), { Prefer: 'return=minimal' }),
        data: body,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
            return
          }
          reject(httpError(res, `发送失败 ${res.statusCode}`))
        },
        fail(err) {
          rejectWxFail(reject, err)
        },
      })
    })
  })
}

async function fetchMerchantBindings(tenantId, provider) {
  const token = api.getAccessToken()
  const tid = encodeURIComponent(String(tenantId || '').trim())
  const prov = encodeURIComponent(String(provider || '').trim())
  const q =
    `/rest/v1/tenant_merchant_bindings?tenant_id=eq.${tid}` +
    `&provider=eq.${prov}` +
    '&select=id,provider,merchant_account_id,account_display_name,binding_label,client_key,sealed_credentials,demo_mode,updated_at' +
    '&order=updated_at.desc'
  const rows = await request('GET', q, token)
  return Array.isArray(rows) ? rows : []
}

async function insertPaymentOrder(payload) {
  await withAuthRetry(async () => {
    const token = api.getAccessToken()
    const sub = decodeJwtSub(token)
    const row = {
      tenant_id: payload.tenantId,
      created_by_user_id: sub || null,
      order_kind: payload.orderKind,
      amount_cents: payload.amountCents,
      status: 'pending',
    }
    if (payload.orderKind !== 'refund') {
      row.pay_channel = payload.payChannel || 'wechat'
    }
    await new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl()}/rest/v1/merchant_payment_orders`,
        method: 'POST',
        header: Object.assign(headers(token), { Prefer: 'return=minimal' }),
        data: row,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
            return
          }
          reject(httpError(res, `提交失败 ${res.statusCode}`))
        },
        fail(err) {
          rejectWxFail(reject, err)
        },
      })
    })
  })
}

module.exports = {
  fetchAuthUserId,
  fetchPrimaryTenantId,
  fetchTenantMerchantName,
  fetchTenantWalletSummary,
  fetchTenantMembershipRow,
  fetchTenantStoreIntel,
  fetchMerchantBindings,
  fetchSupportRelayMessages,
  insertSupportRelayMessage,
  insertPaymentOrder,
}
