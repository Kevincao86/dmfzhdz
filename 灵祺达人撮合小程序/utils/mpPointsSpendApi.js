const ecs = require('./ecs.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

const BRIEF_POINTS_PER_USE = 8

function authHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

async function postAuthAction(body) {
  const token = auth.readSessionToken()
  const data = await ecs.post(
    '/api/meoo-ops-mp-auth',
    {
      ...body,
      sessionToken: token,
      token,
    },
    authHeaders(),
  )
  if (!data || data.ok === false) {
    const err = new Error(String((data && (data.message || data.error)) || 'request_failed'))
    if (data && data.error) err.code = String(data.error)
    throw err
  }
  return data
}

async function checkPointsAffordable(kind, opts) {
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_afford',
      kind,
      durationSec: opts && opts.durationSec != null ? opts.durationSec : undefined,
      ...mpBillingRoleHint.billingRolePayload(),
    })
    return {
      ok: true,
      balance: Number(data.mpAiPointsBalance || 0),
      required: Number(data.pointsRequired || 0),
    }
  } catch (e) {
    const code = e && e.code ? String(e.code) : ''
    const message = mpApiErrors.formatMpApiErr(e, '积分校验失败')
    return {
      ok: false,
      error: code || 'afford_failed',
      message,
      balance: e && e.balance != null ? Number(e.balance) : undefined,
      required: e && e.required != null ? Number(e.required) : undefined,
    }
  }
}

async function assertBriefAffordable() {
  const result = await checkPointsAffordable('brief')
  if (!result.ok) {
    const err = new Error(result.message || '积分不足')
    err.code = result.error
    throw err
  }
  return result
}

async function spendBriefPoints(opts) {
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_spend',
      kind: 'brief',
      idempotencyKey: opts && opts.idempotencyKey ? String(opts.idempotencyKey) : undefined,
      note: opts && opts.note ? String(opts.note) : undefined,
      ...mpBillingRoleHint.billingRolePayload(),
    })
    return {
      pointsCharged: Number(data.pointsCharged || 0),
      balance: Number(data.mpAiPointsBalance || 0),
      already: data.already === true,
    }
  } catch (e) {
    throw new Error(mpApiErrors.formatMpApiErr(e, '积分扣减失败'))
  }
}

function affordActionFromError(err) {
  const code = err && err.code ? String(err.code) : ''
  const msg = err && err.message ? String(err.message) : ''
  if (/未开通|升级会员/.test(msg)) return 'membership'
  if (code === 'insufficient_points' || /积分不足/.test(msg)) return 'recharge'
  return 'none'
}

module.exports = {
  BRIEF_POINTS_PER_USE,
  checkPointsAffordable,
  assertBriefAffordable,
  spendBriefPoints,
  affordActionFromError,
}
