const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const ops = require('./opsRegistryTalentMp.js')

const PRO_TIERS = { pro: true, flagship: true, enterprise: true }

function canUse(plan, expiresAt) {
  const tier = String(plan || 'basic').trim().toLowerCase()
  if (!PRO_TIERS[tier]) return false
  const raw = String(expiresAt || '').trim()
  if (!raw) return true
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return true
  return t > Date.now()
}

function readOpen() {
  const account = auth.readAccount() || {}
  const pr = userProfile.readPrProfile() || {}
  const plan = String(pr.mpMembershipPlan || account.mpMembershipPlan || 'basic')
  const expires = String(pr.mpMembershipExpiresAt || account.mpMembershipExpiresAt || '')
  return canUse(plan, expires)
}

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function textOf(value, max) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

function orderBrief(order) {
  return [
    `标题：${textOf(order.title || order.customerName, 80) || '未填写'}`,
    `平台：${textOf(order.platform, 40) || '未填写'}`,
    `品类：${textOf(order.category, 40) || '未填写'}`,
    `地区：${textOf(order.region || order.storeName || order.city, 40) || '未填写'}`,
    `粉丝要求：${textOf(order.fansRequirement, 80) || '未填写'}`,
    `招募说明：${textOf(order.recruitmentInfo || order.taskDetail, 240) || '未填写'}`,
    `商家要求：${textOf(order.merchantRequirements, 240) || '未填写'}`,
  ].join('\n')
}

function talentLine(raw, index) {
  const name = textOf(raw.name || raw.nickname, 40) || `达人${index + 1}`
  const bits = [
    name,
    textOf(raw.platform, 20),
    textOf(raw.followers || raw.fans, 24) ? `粉丝${textOf(raw.followers || raw.fans, 24)}` : '',
    textOf(raw.city || raw.region, 20),
    textOf(raw.tags || raw.accountTags, 40),
  ].filter(Boolean)
  return `${index + 1}. ${bits.join('，')}`
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('分析结果暂时读不出来，请再点一次')
  return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'))
}

function authHeaders() {
  const token = sessionStore.readSessionToken()
  if (!token) return {}
  return { 'X-Mp-Session': token, Authorization: `Bearer ${token}` }
}

async function askDoubao(system, user) {
  const data = await ecs.post(
    '/api/meoo-ai-chat',
    {
      provider: 'doubao',
      stream: false,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    authHeaders(),
  )
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.detail || data.error)) || '分析失败'))
  }
  if (String(data.provider || '') !== 'doubao') throw new Error('分析暂时不可用，请稍后再试')
  const content = String(data.content || data.text || '').trim()
  if (!content) throw new Error('未返回分析结果')
  return content
}

async function analyzePrOrderTalents(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('缺少招募单')
  if (!readOpen()) throw new Error('一键分析达人数据需开通专业版会员')
  const reg = await ops.fetchRegistry({ includeMpOrderIds: [id], includeOnly: true, skipCache: true })
  const list = (reg && reg.mpRecruitmentOrders) || []
  const order = list.find((row) => row && row.id === id)
  if (!order) throw new Error('没有读到这张招募单')
  const applicants = (Array.isArray(order.applicants) ? order.applicants : []).filter((row) => row && typeof row === 'object')
  if (!applicants.length) throw new Error('这张招募单还没有报名达人')
  const picked = applicants.slice(0, 30)
  const system = [
    '你在帮 PR 看报名达人是否适合这张招募单。',
    '先读懂招募单的平台、品类、地区、粉丝要求和任务说明，再给每位达人打分。',
    'score 是 0 到 100 的达人账号分，只根据下面给出的达人资料，不要编造粉丝、播放或成交。',
    'fit 是 0 到 100 的关联程度，看达人平台、地区、粉丝、标签和报价与这张招募单有多贴。',
    '不要写公开资料不足、仅供参考、不是官方这类句子。',
    '只输出一个 JSON 对象。orderRead 不超过 40 字。talents 与给出的达人顺序一致，每项含 name、score、fit、reason。reason 不超过 28 字。',
  ].join('')
  const user = `${orderBrief(order)}\n报名达人：\n${picked.map(talentLine).join('\n')}`
  let parsed
  try {
    parsed = parseJsonObject(await askDoubao(system, user))
  } catch (e) {
    parsed = parseJsonObject(await askDoubao(system, `${user}\n上次不是合法 JSON。只输出一行 JSON，最后一项后面不要逗号。`))
  }
  const rows = Array.isArray(parsed.talents) ? parsed.talents : []
  const talents = picked.map((raw, index) => {
    const item = rows[index] && typeof rows[index] === 'object' ? rows[index] : {}
    return {
      name: textOf(item.name || raw.name || raw.nickname, 40) || `达人${index + 1}`,
      score: clampScore(item.score),
      fit: clampScore(item.fit),
      reason: textOf(item.reason, 40),
    }
  })
  return {
    orderRead: textOf(parsed.orderRead, 60),
    talents,
  }
}

module.exports = {
  analyzePrOrderTalents,
}
