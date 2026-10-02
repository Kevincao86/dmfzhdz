import { getToken } from './mpSession'
import { mpApiFetchCandidates } from './mpApiBase'
import { getWorkIdentity } from './mpWorkIdentity'

type ScoreBlock = { name: string; weight: number }

type PlatformSpec = {
  id: string
  name: string
  nickLabel: string
  accountLabel: string
  fansLabel: string
  levelTitle: string
  levelA: string
  levelB: string
  levelABlocks: string[]
  levelBBlocks: string[]
  scene: string
  blocks: ScoreBlock[]
  risk: number
  riskNote: string
}

const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  douyin: {
    id: 'douyin',
    name: '抖音',
    nickLabel: '抖音昵称',
    accountLabel: '抖音号',
    fansLabel: '粉丝数',
    levelTitle: '预估下月带货等级',
    levelA: '视频带货力',
    levelB: '直播带货力',
    levelABlocks: ['内容种草', '探店转化'],
    levelBBlocks: ['直播带货'],
    scene: '按抖音本地生活达人（团购短视频和直播带货）场景打分。',
    blocks: [
      { name: '内容种草', weight: 25 },
      { name: '探店转化', weight: 25 },
      { name: '粉丝匹配', weight: 20 },
      { name: '直播带货', weight: 30 },
    ],
    risk: 15,
    riskNote: '搬运、硬广、挂车和内容无关',
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    nickLabel: '小红书昵称',
    accountLabel: '小红书号',
    fansLabel: '粉丝数',
    levelTitle: '预估等级',
    levelA: '笔记种草力',
    levelB: '到店转化力',
    levelABlocks: ['笔记种草', '搜索匹配', '互动可信'],
    levelBBlocks: ['到店转化'],
    scene: '按小红书本地生活达人打分。成交靠笔记被搜到、被相信，再引导到店。直播不作为等级。',
    blocks: [
      { name: '笔记种草', weight: 30 },
      { name: '搜索匹配', weight: 25 },
      { name: '互动可信', weight: 20 },
      { name: '到店转化', weight: 15 },
      { name: '粉丝垂类', weight: 10 },
    ],
    risk: 20,
    riskNote: '营销号感、虚假种草、明显限流',
  },
  dianping: {
    id: 'dianping',
    name: '大众点评',
    nickLabel: '达人昵称',
    accountLabel: '大众点评账号',
    fansLabel: '粉丝或评价数',
    levelTitle: '预估等级',
    levelA: '笔记口碑力',
    levelB: '到店引导力',
    levelABlocks: ['评价真实', '探店图文', '同城口碑'],
    levelBBlocks: ['到店引导'],
    scene: '按大众点评到店口碑达人打分。核心是真实评价和探店图文，不评直播带货。',
    blocks: [
      { name: '评价真实', weight: 35 },
      { name: '探店图文', weight: 25 },
      { name: '同城口碑', weight: 20 },
      { name: '到店引导', weight: 20 },
    ],
    risk: 25,
    riskNote: '刷评、水军、同文案批量铺店',
  },
  kuaishou: {
    id: 'kuaishou',
    name: '快手',
    nickLabel: '快手昵称',
    accountLabel: '快手号',
    fansLabel: '粉丝数',
    levelTitle: '预估下月带货等级',
    levelA: '短视频带货力',
    levelB: '直播带货力',
    levelABlocks: ['短视频挂载'],
    levelBBlocks: ['直播带货'],
    scene: '按快手本地生活达人打分。老铁信任和直播成交权重大于短视频。',
    blocks: [
      { name: '直播带货', weight: 35 },
      { name: '短视频挂载', weight: 25 },
      { name: '老铁信任', weight: 20 },
      { name: '同城转化', weight: 20 },
    ],
    risk: 15,
    riskNote: '搬运、标题党、挂车和内容无关',
  },
  weixin_video: {
    id: 'weixin_video',
    name: '微信视频号',
    nickLabel: '视频号昵称',
    accountLabel: '视频号 ID',
    fansLabel: '关注数',
    levelTitle: '预估等级',
    levelA: '社交传播力',
    levelB: '直播转化力',
    levelABlocks: ['社交传播', '内容信任'],
    levelBBlocks: ['直播转化'],
    scene: '按微信视频号本地生活达人打分。成交靠朋友点赞转发，再进群、企微或小程序。',
    blocks: [
      { name: '社交传播', weight: 30 },
      { name: '私域承接', weight: 25 },
      { name: '内容信任', weight: 25 },
      { name: '直播转化', weight: 20 },
    ],
    risk: 15,
    riskNote: '诱导分享、营销感过重、和门店无关的泛内容',
  },
}

const ADVICE_SYSTEM = [
  '你是豆包。这是达人自己看的体检，按现状写给达人本人的改法，用「你」来写。',
  '不要用商家口吻，不要写合作、履约、核销、不建议合作。',
  '不要编造粉丝数、GMV。未在资料里出现的数字不要写进来。',
  '不要写「公开资料不足」「仅供参考」「无法判断」这类提示句。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：lift 为整改后综合分预计提升的百分比，整数，范围 5 到 35，不要写百分号。',
  '字段：sections 为 3 到 5 项，每项只含 name、next。next 不超过 40 字，只写你接下来怎么改。',
  'name 与现状里的板块一致。',
].join('')

export type EvalAccountInput = {
  platformId?: string
  nickname?: string
  accountId?: string
  followers?: string
  profileLink?: string
  tags?: string[]
  salesLevel?: string
  talentGrade?: string
  quotePrice?: string
}

function specOf(platformId: string): PlatformSpec {
  return PLATFORM_SPECS[platformId] || PLATFORM_SPECS.douyin!
}

function cleanTags(tags: unknown): string[] {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeInput(raw: EvalAccountInput) {
  const spec = specOf(String(raw?.platformId || 'douyin'))
  return {
    spec,
    row: {
      platformId: spec.id,
      nickname: String(raw?.nickname || '').trim(),
      accountId: String(raw?.accountId || '').trim(),
      followers: String(raw?.followers || '').trim(),
      profileLink: String(raw?.profileLink || '').trim(),
      tags: cleanTags(raw?.tags),
      salesLevel: String(raw?.salesLevel || '').trim(),
      talentGrade: String(raw?.talentGrade || '').trim(),
      quotePrice: String(raw?.quotePrice || '').trim(),
    },
  }
}

function filledOr(value: string, empty: string) {
  return value || empty
}

function accountFacts(spec: PlatformSpec, row: ReturnType<typeof normalizeInput>['row']) {
  const lines = [
    `平台：${spec.name}`,
    `${spec.nickLabel}：${filledOr(row.nickname, '未填写')}`,
    `${spec.accountLabel}：${filledOr(row.accountId, '未填写')}`,
    `${spec.fansLabel}：${filledOr(row.followers, '未填写，不要编造')}`,
    `主页链接：${filledOr(row.profileLink, '未填写')}`,
    `账号标签：${row.tags.length ? row.tags.join('、') : '未填写'}`,
    `默认报价：${filledOr(row.quotePrice, '未填写')}`,
  ]
  if (spec.id === 'douyin') {
    lines.push(row.salesLevel ? `用户自填带货等级：${row.salesLevel}` : '用户自填带货等级：未填写')
  }
  if (spec.id === 'kuaishou') {
    lines.push(row.talentGrade ? `用户自填达人等级：${row.talentGrade}` : '用户自填达人等级：未填写')
  }
  return lines.join('\n')
}

function blockNames(spec: PlatformSpec) {
  return spec.blocks.map((block) => block.name).concat(['账号风险'])
}

function scoreSystem(spec: PlatformSpec) {
  const weights = spec.blocks.map((block) => `${block.name}占 ${block.weight} 分`).join('，')
  return [
    '你是豆包。',
    spec.scene,
    '这不是平台官方接口，不要声称读到了官方后台或官方等级。',
    '只根据用户填写的账号资料分析。未填写的粉丝数、核销额、GMV、播放量不要编造。用户填了的数字按原数使用，不要改成另一个数。',
    '用户自填的带货等级或达人等级只是用户自己填的，用来对照，不能当成官方读数。',
    '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。',
    '只输出一个 JSON 对象，不要 Markdown，不要额外说明。键名必须用英文双引号，最后一项后面不要逗号。',
    `blocks 为数组，每项含 name、points。points 为 0 到 100 的整数，表示该板块强弱。name 必须是：${spec.blocks.map((block) => block.name).join('、')}。`,
    `risk 为 0 到 ${spec.risk} 的整数，表示账号风险扣分。扣分依据：${spec.riskNote}。`,
    `同时输出 score，为 0 到 100 的整数，按这些权重合成后再扣 risk：${weights}。系统会按同样权重重算，重算成功时以系统结果为准。`,
    `situations 为 3 到 5 项，每项含 name、now。now 不超过 40 字，只写该板块现状，不要写建议。现状要扣住用户填了的昵称、账号、粉丝、标签、报价或等级；没填的项不要写成具体数字。name 只能从这些板块里选：${blockNames(spec).join('、')}。`,
    'exposureLift 为按整改后预计多出来的曝光百分比，整数 8 到 60，不要写百分号。',
    'salesLift 为按整改后预计每月多带来的带货金额，单位元的整数。按已填粉丝和报价估算增量，不要写成当前已经成交的金额。',
    '同一份账号资料每次必须给出相同 blocks、risk 和现状。',
  ].join('')
}

function levelFromPoints(points: number) {
  const steps = [15, 28, 40, 52, 64, 76, 86, 94]
  let lv = 0
  for (const step of steps) {
    if (points >= step) lv += 1
  }
  return `Lv${lv}`
}

function averagePoints(byName: Record<string, number>, names: string[]) {
  const vals = names.map((name) => byName[name]).filter((n) => Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((sum, n) => sum + n, 0) / vals.length
}

function scoreFromBlocks(spec: PlatformSpec, blocks: { name: string; points: number }[], risk: unknown) {
  const byName: Record<string, number> = {}
  for (const block of blocks) byName[block.name] = block.points
  let sum = 0
  for (const block of spec.blocks) {
    const points = byName[block.name]
    if (!Number.isFinite(points)) return null
    sum += (points / 100) * block.weight
  }
  const deduct = Math.max(0, Math.min(spec.risk, Math.round(Number(risk) || 0)))
  const levelAPoints = averagePoints(byName, spec.levelABlocks)
  const levelBPoints = averagePoints(byName, spec.levelBBlocks)
  return {
    score: clampScore(sum - deduct),
    videoLevel: levelAPoints == null ? '' : levelFromPoints(levelAPoints),
    liveLevel: levelBPoints == null ? '' : levelFromPoints(levelBPoints),
  }
}

export const DOUYIN_SCORE_GRADES = [
  { key: 'excellent', range: '85~100', label: '优秀', note: '内容和带货都比较稳，按现在的节奏继续发' },
  { key: 'good', range: '70~84', label: '良好', note: '整体能看，把报告里标出的短板补一补会更稳' },
  { key: 'fix', range: '60~69', label: '待整改', note: '短板比较明显，先按报告把内容改到位' },
  { key: 'risk', range: '＜60', label: '高危', note: '现在接单容易吃力，先把内容和账号基础补上' },
] as const

export function douyinScoreGrade(score: number) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  if (n >= 85) return DOUYIN_SCORE_GRADES[0]
  if (n >= 70) return DOUYIN_SCORE_GRADES[1]
  if (n >= 60) return DOUYIN_SCORE_GRADES[2]
  return DOUYIN_SCORE_GRADES[3]
}

export function platformEvalMeta(platformId: string) {
  const spec = specOf(platformId)
  return {
    id: spec.id,
    name: spec.name,
    nickLabel: spec.nickLabel,
    accountLabel: spec.accountLabel,
    fansLabel: spec.fansLabel,
    levelTitle: spec.levelTitle,
    levelA: spec.levelA,
    levelB: spec.levelB,
  }
}

export function describeEvalBasis(raw: EvalAccountInput) {
  const { spec, row } = normalizeInput(raw)
  const bits: string[] = []
  if (row.followers) bits.push(`${spec.fansLabel} ${row.followers}`)
  if (row.tags.length) bits.push(`标签 ${row.tags.join('、')}`)
  if (row.profileLink) bits.push('已填主页链接')
  if (spec.id === 'douyin' && row.salesLevel) bits.push(`带货等级 ${row.salesLevel}`)
  if (spec.id === 'kuaishou' && row.talentGrade) bits.push(`达人等级 ${row.talentGrade}`)
  if (row.quotePrice) bits.push(`报价 ${row.quotePrice}`)
  return bits.join(' · ')
}

export type LocalLifeSituation = {
  name: string
  now: string
}

export type LocalLifeScore = {
  score: number
  videoLevel: string
  liveLevel: string
  situations: LocalLifeSituation[]
  exposureLift: number
  salesLift: number
}

export type LocalLifeSuggestion = {
  name: string
  next: string
}

export type LocalLifeAdvice = {
  lift: number
  sections: LocalLifeSuggestion[]
}

function clampLift(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(35, Math.max(5, n))
}

function clampExposure(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(60, Math.max(8, n))
}

function clampSalesYuan(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(5000000, n)
}

function parseCount(text: unknown): number {
  const raw = String(text || '').replace(/,/g, '').trim()
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return 0
  return m[2] ? Math.round(n * 10000) : Math.round(n)
}

/** 评估结果还没有模型给出的增量时，按分数缺口和已填粉丝、报价估一个展示值 */
export function previewTalentGains(score: number, followers: string, quote: string): { exposurePct: number; salesYuan: number } {
  const exposurePct = clampExposure(Math.round((100 - Math.min(92, score)) * 1.5))
  const fans = parseCount(followers)
  const price = parseCount(quote) || 80
  const orders = Math.max(1, Math.round((fans || 10000) * (exposurePct / 100) * 0.002))
  return { exposurePct, salesYuan: clampSalesYuan(Math.max(500, orders * price)) }
}

export function formatSalesYuan(yuan: number): string {
  const n = Math.round(Number(yuan) || 0)
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `¥${text}万`
  }
  return `¥${n.toLocaleString('zh-CN')}`
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

export const TALENT_EVAL_POINTS = 0
export const TALENT_ADVICE_POINTS = 5

export type TalentEvalQuota = {
  ok: boolean
  message: string
  remaining: number
  limit: number
  paid: boolean
}

function quotaFrom(data: Record<string, unknown>): TalentEvalQuota {
  const remaining = Number(data.quotaRemaining)
  return {
    ok: data.ok !== false,
    message: String(data.message || ''),
    remaining: Number.isFinite(remaining) ? remaining : -1,
    limit: Number(data.quotaLimit) || 1,
    paid: data.quotaPaid === true,
  }
}

async function postAuth(body: Record<string, unknown>, allowFail = false): Promise<Record<string, unknown>> {
  const candidates = mpApiFetchCandidates('/api/meoo-ops-mp-auth')
  if (!candidates.length) throw new Error('未配置评估接口')
  const token = getToken()
  let lastErr = '积分校验失败'
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
          ...body,
          sessionToken: token,
          token,
          billingRole: getWorkIdentity(),
        }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        if (allowFail && res.ok) return data
        const msg = String(data.message || data.detail || data.error || `http_${res.status}`)
        if ((res.status === 404 || msg === 'not_found') && i < candidates.length - 1) {
          lastErr = msg
          continue
        }
        throw new Error(msg === 'not_found' ? '请先开通会员后再使用达人账号分析' : msg)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1 && /not_found|404/i.test(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

export async function readTalentEvalQuota(): Promise<TalentEvalQuota> {
  const data = await postAuth({ action: 'mp_ai_points_afford', kind: 'talent_eval' }, true)
  return quotaFrom(data)
}

async function consumeTalentEvalQuota() {
  const data = await postAuth(
    {
      action: 'mp_ai_points_spend',
      kind: 'talent_eval',
      idempotencyKey: `talent-eval-${Date.now()}`,
      note: '达人账号评估',
    },
    true,
  )
  return quotaFrom(data)
}

async function assertTalentPoints(kind: 'talent_eval' | 'talent_advice') {
  await postAuth({ action: 'mp_ai_points_afford', kind })
}

async function spendTalentPoints(kind: 'talent_eval' | 'talent_advice', note: string) {
  await postAuth({
    action: 'mp_ai_points_spend',
    kind,
    idempotencyKey: `${kind}-${Date.now()}`,
    note,
  })
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

function cacheKey(row: ReturnType<typeof normalizeInput>['row']) {
  return [
    'lq_local_life_eval_v3',
    row.platformId,
    row.nickname,
    row.accountId,
    row.followers,
    row.profileLink,
    row.tags.join(','),
    row.salesLevel,
    row.talentGrade,
    row.quotePrice,
  ].join('|')
}

function mapBlockPoints(rows: unknown) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        name: String(item.name || '').trim(),
        points: clampScore(item.points),
      }
    })
    .filter((row) => row.name)
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

function readCache(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const j = JSON.parse(raw) as Record<string, unknown>
    if (typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(key: string, patch: Record<string, unknown>, replace = false) {
  const prev = replace ? {} : readCache(key) || {}
  localStorage.setItem(key, JSON.stringify({ ...prev, ...patch }))
}

function savedFromCache(cached: Record<string, unknown> | null): { score: LocalLifeScore; advice: LocalLifeAdvice | null } | null {
  if (!cached?.videoLevel || !cached.liveLevel || !Array.isArray(cached.situations) || !cached.situations.length) {
    return null
  }
  const adviceRaw = cached.advice
  let advice: LocalLifeAdvice | null = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray((adviceRaw as LocalLifeAdvice).sections)) {
    const sections = mapSuggestions((adviceRaw as LocalLifeAdvice).sections)
    if (sections.length) advice = { lift: clampLift((adviceRaw as LocalLifeAdvice).lift), sections }
  }
  return {
    score: {
      score: clampScore(cached.score),
      videoLevel: levelText(cached.videoLevel),
      liveLevel: levelText(cached.liveLevel),
      situations: mapSituations(cached.situations),
      exposureLift: clampExposure(cached.exposureLift),
      salesLift: clampSalesYuan(cached.salesLift),
    },
    advice,
  }
}

export function readSavedTalentEval(raw: EvalAccountInput) {
  const { row } = normalizeInput(raw)
  if (!row.nickname && !row.accountId) return null
  return savedFromCache(readCache(cacheKey(row)))
}

function buildScore(spec: PlatformSpec, j: Record<string, unknown>): LocalLifeScore {
  const computed = scoreFromBlocks(spec, mapBlockPoints(j.blocks), j.risk)
  return {
    score: computed ? computed.score : clampScore(j.score),
    videoLevel: computed?.videoLevel || levelText(j.videoLevel),
    liveLevel: computed?.liveLevel || levelText(j.liveLevel),
    situations: mapSituations(j.situations),
    exposureLift: clampExposure(j.exposureLift),
    salesLift: clampSalesYuan(j.salesLift),
  }
}

export async function evaluateTalent(raw: EvalAccountInput, opts?: { force?: boolean }): Promise<LocalLifeScore> {
  const { spec, row } = normalizeInput(raw)
  if (!row.nickname && !row.accountId) throw new Error(`请先填写${spec.nickLabel}或${spec.accountLabel}`)
  const key = cacheKey(row)
  if (!opts?.force) {
    const saved = savedFromCache(readCache(key))
    if (saved) return saved.score
  }
  const gate = await readTalentEvalQuota()
  if (!gate.ok) throw new Error(gate.message || '本月评估次数已用完')
  const j = await askDoubaoJson(
    scoreSystem(spec),
    `${accountFacts(spec, row)}\n请按权重给各板块 points，并给出 risk 和各板块现状。现状用达人自己能看懂的话来写，不要写给商家的合作判断。`,
  )
  const score = buildScore(spec, j)
  writeCache(key, score, true)
  try {
    await consumeTalentEvalQuota()
  } catch {
    /* 次数没记上时仍保留这次结果 */
  }
  return score
}

export async function adviseTalent(
  raw: EvalAccountInput,
  score: LocalLifeScore | null,
  opts?: { force?: boolean },
): Promise<LocalLifeAdvice> {
  if (!score?.situations?.length) throw new Error('请先完成达人信息评估')
  const { spec, row } = normalizeInput(raw)
  const key = cacheKey(row)
  if (!opts?.force) {
    const cachedAdvice = readCache(key)?.advice
    if (cachedAdvice && typeof cachedAdvice === 'object') {
      const advice = cachedAdvice as LocalLifeAdvice
      if (Array.isArray(advice.sections) && advice.sections.length) {
        return { lift: clampLift(advice.lift), sections: mapSuggestions(advice.sections) }
      }
    }
  }
  await assertTalentPoints('talent_advice')
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const j = await askDoubaoJson(
    ADVICE_SYSTEM,
    `${accountFacts(spec, row)}\n评分：${score.score}/100，${spec.levelA} ${score.videoLevel}，${spec.levelB} ${score.liveLevel}。\n现状：\n${lines}\n请只写给达人本人的改法。`,
  )
  const advice: LocalLifeAdvice = {
    lift: clampLift(j.lift),
    sections: mapSuggestions(j.sections),
  }
  await spendTalentPoints('talent_advice', '达人账号分析提升')
  writeCache(key, { advice })
  return advice
}
