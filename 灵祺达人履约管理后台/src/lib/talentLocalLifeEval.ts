import { getToken } from './mpSession'
import { mpApiFetchCandidates } from './mpApiBase'

const SCORE_SYSTEM = [
  '你是豆包。按抖音本地生活达人（团购短视频带货）场景做预估。',
  '这不是抖音来客官方接口，不要声称读到了来客后台、团购分或当月官方带货力等级。',
  '不要编造粉丝数、核销额、GMV 或具体成交数字。',
  '只输出一个 JSON 对象，不要 Markdown，不要额外说明。键名必须用英文双引号，最后一项后面不要逗号。',
  '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。',
  '字段：score 为 0 到 100 的整数；videoLevel 为 Lv0 到 Lv8，表示预估下月视频带货力；liveLevel 为 Lv0 到 Lv8，表示预估下月直播带货力；situations 为 3 到 5 项，每项含 name、now。',
  'now 不超过 40 字，只写该板块现状，不要写建议。name 从这些板块里选：内容种草、探店转化、粉丝匹配、直播带货、账号风险。',
].join('')

const ADVICE_SYSTEM = [
  '你是豆包。按已给出的达人现状写整改建议，不要再复述现状。',
  '不要编造粉丝数、核销额、GMV。不要写「公开资料不足」「仅供参考」「无法判断」这类提示句。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：sections 为 3 到 5 项，每项只含 name、next。next 不超过 40 字，只写接下来怎么改。',
  'name 与现状里的板块一致。',
].join('')

export type LocalLifeSituation = {
  name: string
  now: string
}

export type LocalLifeScore = {
  score: number
  videoLevel: string
  liveLevel: string
  situations: LocalLifeSituation[]
}

export type LocalLifeSuggestion = {
  name: string
  next: string
}

export type LocalLifeAdvice = {
  sections: LocalLifeSuggestion[]
}

function loosenJson(slice: string) {
  return slice
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
}

function escapeNewlinesInStrings(slice: string) {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < slice.length; i += 1) {
    const c = slice[i]
    if (inStr) {
      if (esc) {
        out += c
        esc = false
        continue
      }
      if (c === '\\') {
        out += c
        esc = true
        continue
      }
      if (c === '"') {
        inStr = false
        out += c
        continue
      }
      if (c === '\n' || c === '\r') {
        out += '\\n'
        continue
      }
      out += c
      continue
    }
    if (c === '"') inStr = true
    out += c
  }
  return out
}

function takeBalancedObject(s: string) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return s.slice(0, i + 1)
    }
  }
  return ''
}

function parseJsonObject(text: string): Record<string, unknown> {
  const raw = text.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1]! : raw
  const start = body.indexOf('{')
  if (start < 0) throw new Error('评估结果暂时读不出来，请再点一次')
  const candidates: string[] = []
  const balanced = takeBalancedObject(body.slice(start))
  if (balanced) candidates.push(balanced)
  const end = body.lastIndexOf('}')
  if (end > start) candidates.push(body.slice(start, end + 1))
  for (const candidate of candidates) {
    const fixed = escapeNewlinesInStrings(loosenJson(candidate))
    try {
      return JSON.parse(fixed) as Record<string, unknown>
    } catch {
      /* 下一种切法 */
    }
  }
  throw new Error('评估结果暂时读不出来，请再点一次')
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

async function askDoubao(system: string, user: string): Promise<string> {
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
      return content
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1 && /not_found|404/i.test(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

async function askDoubaoJson(system: string, user: string): Promise<Record<string, unknown>> {
  const first = await askDoubao(system, user)
  try {
    return parseJsonObject(first)
  } catch {
    const second = await askDoubao(
      system,
      `${user}\n上次输出不是合法 JSON。只输出一行 JSON，键名用英文双引号，最后一项后面不要逗号。`,
    )
    return parseJsonObject(second)
  }
}

function identityLine(nickname: string, douyinId: string) {
  return `昵称：${nickname || '未填写'}\n抖音号：${douyinId || '未填写'}`
}

function cacheKey(nickname: string, douyinId: string) {
  return `lq_local_life_eval_v2:${nickname.trim()}|${douyinId.trim()}`
}

function mapSituations(rows: unknown): LocalLifeSituation[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        name: String(item.name || '').trim().slice(0, 12),
        now: String(item.now || '').trim().slice(0, 40),
      }
    })
    .filter((row) => row.name && row.now)
    .slice(0, 5)
}

function mapSuggestions(rows: unknown): LocalLifeSuggestion[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        name: String(item.name || '').trim().slice(0, 12),
        next: String(item.next || '').trim().slice(0, 40),
      }
    })
    .filter((row) => row.name && row.next)
    .slice(0, 5)
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
  if (
    cached &&
    cached.videoLevel &&
    cached.liveLevel &&
    Array.isArray(cached.situations) &&
    cached.situations.length
  ) {
    return {
      score: clampScore(cached.score),
      videoLevel: levelText(cached.videoLevel),
      liveLevel: levelText(cached.liveLevel),
      situations: mapSituations(cached.situations),
    }
  }
  const j = await askDoubaoJson(
    SCORE_SYSTEM,
    `${identityLine(nickname, douyinId)}\n请给出本地生活达人 0-100 预估分、预估下月视频带货力和直播带货力，并列出各板块现状。同一昵称和抖音号每次必须给出相同分数、等级和现状。`,
  )
  const score = {
    score: clampScore(j.score),
    videoLevel: levelText(j.videoLevel),
    liveLevel: levelText(j.liveLevel),
    situations: mapSituations(j.situations),
  }
  writeCache(nickname, douyinId, score)
  return score
}

export async function adviseTalent(
  nickname: string,
  douyinId: string,
  score: LocalLifeScore | null,
): Promise<LocalLifeAdvice> {
  if (!score?.situations?.length) throw new Error('请先完成达人信息评估')
  const cached = readCache(nickname, douyinId)
  const cachedAdvice = cached?.advice
  if (cachedAdvice && typeof cachedAdvice === 'object') {
    const advice = cachedAdvice as LocalLifeAdvice
    if (Array.isArray(advice.sections) && advice.sections.length) {
      return { sections: mapSuggestions(advice.sections) }
    }
  }
  const lines = score.situations.map((row) => `${row.name}：${row.now}`).join('\n')
  const j = await askDoubaoJson(
    ADVICE_SYSTEM,
    `${identityLine(nickname, douyinId)}\n评分：${score.score}/100，视频带货力 ${score.videoLevel}，直播带货力 ${score.liveLevel}。\n现状：\n${lines}\n请只给出整改建议。`,
  )
  const advice: LocalLifeAdvice = { sections: mapSuggestions(j.sections) }
  writeCache(nickname, douyinId, { advice })
  return advice
}
