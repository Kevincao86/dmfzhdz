const ecs = require('./ecs.js')
const auth = require('./auth.js')
const mpApiErrors = require('./mpApiErrors.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

const BRIEF_POINTS_PER_USE = 8
/** 与服务端 mpPointsEconomics 对齐：成片检核 2 积分/秒 */
const VIDEO_POINTS_PER_SEC = 2
const VISUAL_STUDIO_COPY_POINTS = 3
const VISUAL_STUDIO_IMAGE_POINTS = 8

function authHeaders() {
  const token = auth.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function estimateVideoPoints(durationSec) {
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 0))
  return sec * VIDEO_POINTS_PER_SEC
}

/** 本地先算 remaining = 余额 - 预估；负值直接拦（与充值页双桶合计对齐） */
function readLocalPointsBalance() {
  const account = (auth.readAccount && auth.readAccount()) || {}
  const pkg = Math.max(0, Math.floor(Number(account.mpAiPointsPackageBalance) || 0))
  const rech = Math.max(0, Math.floor(Number(account.mpAiPointsRechargeBalance) || 0))
  if (pkg > 0 || rech > 0) return { balance: pkg + rech, known: true }
  if (account.mpAiPointsBalance != null || account.pointsBalance != null) {
    return {
      balance: Math.max(
        0,
        Math.floor(Number(account.mpAiPointsBalance != null ? account.mpAiPointsBalance : account.pointsBalance) || 0),
      ),
      known: true,
    }
  }
  return { balance: 0, known: false }
}

function estimatePointsForKind(kind, durationSec) {
  if (kind === 'video') return estimateVideoPoints(durationSec)
  if (kind === 'article' || kind === 'brief' || kind === 'mix_material_analyze') {
    if (kind === 'article') return 2
    if (kind === 'brief') return BRIEF_POINTS_PER_USE
    return 8
  }
  if (kind === 'shortvideo') {
    const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
    return Math.max(80, sec * 80)
  }
  if (kind === 'cloud_edit') return 80
  if (kind === 'cloud_edit_smart') {
    const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
    return Math.max(80, sec * 5)
  }
  if (kind === 'digital_human') {
    const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
    return Math.max(80, sec * 28)
  }
  if (kind === 'visual_studio_copy') return VISUAL_STUDIO_COPY_POINTS
  if (kind === 'visual_studio_image') return VISUAL_STUDIO_IMAGE_POINTS
  return 0
}

function assertLocalPointsEnough(required) {
  const need = Math.max(0, Math.floor(Number(required) || 0))
  if (need <= 0) {
    const err = new Error('无效扣费金额')
    err.code = 'invalid_amount'
    throw err
  }
  const local = readLocalPointsBalance()
  // 本地尚无双桶缓存时，不误拦，交给服务端
  if (!local.known) return { balance: local.balance, required: need, remaining: null, skipped: true }
  if (local.balance - need < 0) {
    const err = new Error(
      `积分不足（当前 ${local.balance.toLocaleString('zh-CN')}，需要 ${need.toLocaleString('zh-CN')}），请充值积分或升级套餐后再试`,
    )
    err.code = 'insufficient_points'
    err.balance = local.balance
    err.required = need
    throw err
  }
  return { balance: local.balance, required: need, remaining: local.balance - need, skipped: false }
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
    if (data && data.balance != null) err.balance = Number(data.balance)
    if (data && data.required != null) err.required = Number(data.required)
    throw err
  }
  return data
}

async function checkPointsAffordable(kind, opts) {
  const durationSec = opts && opts.durationSec != null ? opts.durationSec : undefined
  // 本地预估：余额 - 消耗 < 0 则直接失败（不等服务端）
  const localNeed = estimatePointsForKind(kind, durationSec)
  if (localNeed > 0) {
    try {
      assertLocalPointsEnough(localNeed)
    } catch (e) {
      return {
        ok: false,
        error: e.code || 'insufficient_points',
        message: e.message || '积分不足',
        balance: e.balance,
        required: e.required,
      }
    }
  }
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_afford',
      kind,
      durationSec,
      ...mpBillingRoleHint.billingRolePayload(),
    })
    const required = Number(data.pointsRequired || 0)
    const balance = Number(data.mpAiPointsBalance || 0)
    const remaining = balance - required
    if (required > 0 && remaining < 0) {
      return {
        ok: false,
        error: 'insufficient_points',
        message: `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${required.toLocaleString('zh-CN')}），请充值积分或升级套餐后再试`,
        balance,
        required,
        remaining,
      }
    }
    return {
      ok: true,
      balance,
      required,
      remaining,
    }
  } catch (e) {
    const code = e && e.code ? String(e.code) : ''
    const message = mpApiErrors.formatMpApiErr(e, '积分校验失败')
    return {
      ok: false,
      error: code || (/积分不足/.test(message) ? 'insufficient_points' : 'afford_failed'),
      message,
      balance: e && e.balance != null ? Number(e.balance) : undefined,
      required: e && e.required != null ? Number(e.required) : undefined,
    }
  }
}

async function assertVideoComplianceAffordable(durationSec) {
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 0))
  if (!Number.isFinite(sec) || sec <= 0) {
    const err = new Error('无法获取视频时长，请重新选择视频后再检核')
    err.code = 'duration_required'
    throw err
  }
  assertLocalPointsEnough(estimateVideoPoints(sec))
  const result = await checkPointsAffordable('video', { durationSec: sec })
  if (!result.ok) {
    const err = new Error(result.message || '积分不足，请充值积分或升级套餐后再试')
    err.code = result.error
    err.balance = result.balance
    err.required = result.required
    throw err
  }
  return result
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

async function spendPointsKind(kind, opts) {
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_spend',
      kind,
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

async function assertVisualStudioCopyAffordable() {
  const result = await checkPointsAffordable('visual_studio_copy')
  if (!result.ok) {
    const err = new Error(result.message || '积分不足')
    err.code = result.error
    throw err
  }
  return result
}

async function assertVisualStudioImageAffordable(count) {
  const n = Math.max(1, Number(count) || 1)
  const result = await checkPointsAffordable('visual_studio_image', { count: n })
  if (!result.ok) {
    // 后端若未认 count，至少按单张校验；前端按张循环 spend
    const once = await checkPointsAffordable('visual_studio_image')
    if (!once.ok) {
      const err = new Error(once.message || result.message || '积分不足')
      err.code = once.error || result.error
      throw err
    }
    return once
  }
  return result
}

async function spendVisualStudioCopyPoints(opts) {
  return spendPointsKind('visual_studio_copy', opts)
}

async function spendVisualStudioImagePoints(opts) {
  return spendPointsKind('visual_studio_image', opts)
}

async function assertAddonAffordable(kind, durationSec) {
  const result = await checkPointsAffordable(kind, { durationSec })
  if (!result.ok) {
    const err = new Error(result.message || '积分不足')
    err.code = result.error
    err.balance = result.balance
    err.required = result.required
    throw err
  }
  return result
}

async function spendAddonPoints(kind, opts) {
  try {
    const data = await postAuthAction({
      action: 'mp_ai_points_spend',
      kind,
      durationSec: opts && opts.durationSec != null ? opts.durationSec : undefined,
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

module.exports = {
  BRIEF_POINTS_PER_USE,
  VIDEO_POINTS_PER_SEC,
  VISUAL_STUDIO_COPY_POINTS,
  VISUAL_STUDIO_IMAGE_POINTS,
  estimateVideoPoints,
  assertLocalPointsEnough,
  checkPointsAffordable,
  assertVideoComplianceAffordable,
  assertBriefAffordable,
  spendBriefPoints,
  assertVisualStudioCopyAffordable,
  assertVisualStudioImageAffordable,
  spendVisualStudioCopyPoints,
  spendVisualStudioImagePoints,
  assertAddonAffordable,
  spendAddonPoints,
  affordActionFromError,
}
