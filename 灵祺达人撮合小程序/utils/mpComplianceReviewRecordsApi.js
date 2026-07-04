const ecs = require('./ecs.js')
const auth = require('./auth.js')

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

async function fetchComplianceReviewRecords() {
  const data = await postAuthAction({ action: 'mp_compliance_review_records_list' })
  return {
    records: Array.isArray(data.records) ? data.records : [],
    retentionDays: Math.max(1, Math.floor(Number(data.retentionDays) || 7)),
  }
}

async function saveComplianceReviewRecord(opts) {
  await postAuthAction({
    action: 'mp_compliance_review_record_save',
    mode: opts.mode === 'video' ? 'video' : 'script',
    label: String(opts.label || '').trim(),
    platform: String(opts.platform || '').trim(),
    verdict: String(opts.verdict || 'normal').trim(),
    statusText: String(opts.statusText || '').trim(),
    statusTone: String(opts.statusTone || '').trim(),
    detail: String(opts.detail || '').trim(),
    resultJson: String(opts.resultJson || ''),
    pointsCharged: opts.pointsCharged != null ? Number(opts.pointsCharged) : undefined,
    idempotencyKey: opts.idempotencyKey ? String(opts.idempotencyKey) : undefined,
  })
}

module.exports = {
  fetchComplianceReviewRecords,
  saveComplianceReviewRecord,
}
