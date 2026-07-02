const ecs = require('./ecs.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')

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
    throw new Error(String((data && (data.message || data.error)) || 'request_failed'))
  }
  return data
}

async function spendBriefPoints(opts) {
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_spend',
      kind: 'brief',
      idempotencyKey: opts && opts.idempotencyKey ? String(opts.idempotencyKey) : undefined,
      note: opts && opts.note ? String(opts.note) : undefined,
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

module.exports = {
  spendBriefPoints,
}
