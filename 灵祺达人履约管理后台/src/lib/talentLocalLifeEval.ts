import { getToken } from './mpSession'
import { mpApiFetchCandidates } from './mpApiBase'

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

export type LocalLifeScore = {
  score: number
  videoLevel: string
  liveLevel: string
}

export type LocalLifeSection = {
  name: string
  now: string
  next: string
}

export type LocalLifeAdvice = {
  status: string
  sections: LocalLifeSection[]
}

function parseJsonObject(text: string): Record<string, unknown> {
  const raw = text.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1]! : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('豆包没有返回可读取的评估')
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function levelText(v: unknown): string {
  const s = String(v || '').trim()
  const m = /Lv\s*([0-8])/i.exec(s)
  return m ? `Lv${m[1]}` : 'Lv0'
}

async function askDoubao(system: string, user: string): Promise<Record<string, unknown>> {
  const candidates = mpApiFetchCandidates('/api/meoo-ai-chat')
  if (!candidates.length) throw new Error('未配置评估接口')
  const token = getToken()
  let lastErr = '豆包评估失败'
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]!
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Mp-Session': token, Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          provider: 'doubao',
          stream: false,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        const msg = String(data.message || data.detail || data.error || `http_${res.status}`)
        if ((res.status === 404 || msg === 'not_found') && i < candidates.length - 1) {
          lastErr = msg
          continue
        }
        throw new Error(msg)
      }
      if (String(data.provider || '') !== 'doubao') {
        throw new Error('豆包暂不可用，请稍后再试')
      }
      const content = String(data.content || data.text || '').trim()
      if (!content) throw new Error('豆包未返回内容')
      return parseJsonObject(content)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1 && /not_found|404/i.test(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

function identityLine(nickname: string, douyinId: string) {
  return `昵称：${nickname || '未填写'}\n抖音号：${douyinId || '未填写'}`
}

function cacheKey(nickname: string, douyinId: string) {
  return `lq_local_life_eval_v1:${nickname.trim()}|${douyinId.trim()}`
}

function readCache(nickname: string, douyinId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(cacheKey(nickname, douyinId))
    if (!raw) return null
    const j = JSON.parse(raw) as Record<string, unknown>
    if (typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(nickname: string, douyinId: string, patch: Record<string, unknown>) {
  const prev = readCache(nickname, douyinId) || {}
  localStorage.setItem(cacheKey(nickname, douyinId), JSON.stringify({ ...prev, ...patch }))
}

export async function evaluateTalent(nickname: string, douyinId: string): Promise<LocalLifeScore> {
  const cached = readCache(nickname, douyinId)
  if (cached && cached.videoLevel && cached.liveLevel) {
    return {
      score: clampScore(cached.score),
      videoLevel: levelText(cached.videoLevel),
      liveLevel: levelText(cached.liveLevel),
    }
  }
  const j = await askDoubao(
    SCORE_SYSTEM,
    `${identityLine(nickname, douyinId)}\n请给出本地生活达人 0-100 预估分，以及预估下月视频带货力和直播带货力。同一昵称和抖音号每次必须给出相同分数和相同等级。`,
  )
  const score = {
    score: clampScore(j.score),
    videoLevel: levelText(j.videoLevel),
    liveLevel: levelText(j.liveLevel),
  }
  writeCache(nickname, douyinId, score)
  return score
}

export async function adviseTalent(
  nickname: string,
  douyinId: string,
  score: LocalLifeScore | null,
): Promise<LocalLifeAdvice> {
  const cached = readCache(nickname, douyinId)
  const cachedAdvice = cached?.advice
  if (cachedAdvice && typeof cachedAdvice === 'object') {
    const advice = cachedAdvice as LocalLifeAdvice
    if (advice.status) return advice
  }
  const extra = score
    ? `\n已有评分：${score.score}/100，预估下月视频带货力 ${score.videoLevel}，直播带货力 ${score.liveLevel}。`
    : ''
  const j = await askDoubao(
    ADVICE_SYSTEM,
    `${identityLine(nickname, douyinId)}${extra}\n请分析现状，并列出接下来要优化的板块。`,
  )
  const sections = Array.isArray(j.sections) ? j.sections : []
  const advice: LocalLifeAdvice = {
    status: String(j.status || '').trim().slice(0, 80),
    sections: sections
      .map((row) => {
        const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
        return {
          name: String(item.name || '').trim().slice(0, 12),
          now: String(item.now || '').trim().slice(0, 80),
          next: String(item.next || '').trim().slice(0, 80),
        }
      })
      .filter((row) => row.name && (row.now || row.next))
      .slice(0, 5),
  }
  writeCache(nickname, douyinId, { advice })
  return advice
}
