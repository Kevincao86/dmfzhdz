const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')

const SCORE_SYSTEM = [
  '你是豆包。按抖音本地生活达人（团购短视频带货）场景做预估。',
  '这不是抖音来客官方接口，不要声称读到了来客后台、团购分或当月官方带货力等级。',
  '不要编造粉丝数、核销额、GMV 或具体成交数字。',
  '只输出一个 JSON 对象，不要 Markdown，不要额外说明。',
  '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。',
  '字段：score 为 0 到 100 的整数；videoLevel 为 Lv0 到 Lv8，表示预估下月视频带货力；liveLevel 为 Lv0 到 Lv8，表示预估下月直播带货力。',
].join('')

const ADVICE_SYSTEM = [
  '你是豆包。按抖音本地生活达人场景写现状和整改，不是来客官方诊断。',
  '不要编造粉丝数、核销额、GMV。不要写「公开资料不足」「仅供参考」「无法判断」这类提示句，直接写现状和可执行动作。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：status 为不超过 80 字的现状；sections 为 3 到 5 项，每项含 name、now、next。',
  'name 从这些板块里选：内容种草、探店转化、粉丝匹配、直播带货、账号风险。',
].join('')

function authHeaders() {
  const token = sessionStore.readSessionToken()
  if (!token) return {}
  return { 'X-Mp-Session': token, Authorization: `Bearer ${token}` }
}

function parseJsonObject(text) {
  const raw = String(text || '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('豆包没有返回可读取的评估')
  return JSON.parse(body.slice(start, end + 1))
}

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function levelText(v) {
  const s = String(v || '').trim()
  const m = /Lv\s*([0-8])/i.exec(s)
  return m ? `Lv${m[1]}` : 'Lv0'
}

async function askDoubao(system, user) {
  const data = await ecs.post(
    '/api/meoo-ai-chat',
    {
      provider: 'doubao',
      stream: false,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    authHeaders(),
  )
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.detail || data.error)) || '豆包评估失败'))
  }
  if (String(data.provider || '') !== 'doubao') {
    throw new Error('豆包暂不可用，请稍后再试')
  }
  const content = String(data.content || data.text || '').trim()
  if (!content) throw new Error('豆包未返回内容')
  return parseJsonObject(content)
}

function identityLine(nickname, douyinId) {
  return `昵称：${nickname || '未填写'}\n抖音号：${douyinId || '未填写'}`
}

async function evaluateTalent(nickname, douyinId) {
  const j = await askDoubao(
    SCORE_SYSTEM,
    `${identityLine(nickname, douyinId)}\n请给出本地生活达人 0-100 预估分，以及预估下月视频带货力和直播带货力。`,
  )
  return {
    score: clampScore(j.score),
    videoLevel: levelText(j.videoLevel),
    liveLevel: levelText(j.liveLevel),
  }
}

async function adviseTalent(nickname, douyinId, score) {
  const extra = score
    ? `\n已有豆包预估分：${score.score}/100，预估下月视频带货力 ${score.videoLevel}，直播带货力 ${score.liveLevel}。`
    : ''
  const j = await askDoubao(
    ADVICE_SYSTEM,
    `${identityLine(nickname, douyinId)}${extra}\n请分析现状，并列出接下来要优化的板块。`,
  )
  const sections = Array.isArray(j.sections) ? j.sections : []
  return {
    status: String(j.status || '').trim().slice(0, 80),
    sections: sections
      .map((row) => ({
        name: String(row && row.name ? row.name : '').trim().slice(0, 12),
        now: String(row && row.now ? row.now : '').trim().slice(0, 80),
        next: String(row && row.next ? row.next : '').trim().slice(0, 80),
      }))
      .filter((row) => row.name && (row.now || row.next))
      .slice(0, 5),
  }
}

module.exports = {
  evaluateTalent,
  adviseTalent,
}
