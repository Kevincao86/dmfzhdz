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
}

const SCORE_BLOCKS: ScoreBlock[] = [
  { name: '本地人群匹配', weight: 20 },
  { name: '内容产能稳定', weight: 15 },
  { name: '内容质量人设', weight: 15 },
  { name: '团购带货能力', weight: 25 },
  { name: '内容转化潜力', weight: 15 },
  { name: '口碑合规风险', weight: 10 },
]
const LEVEL_A_BLOCKS = ['内容产能稳定', '内容质量人设', '内容转化潜力']
const LEVEL_B_BLOCKS = ['团购带货能力', '本地人群匹配']
const SITUATION_BAN =
  /公网未检索到|未检索到|无公开账号记录|公开资料不足|无法验证|待补充|没有数据|无数据|查不到|仅供参考|弱预估|无公开|没有检索到|检索为空|暂未检索|没有找到|无法查询/g

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
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
    scene: '按抖音本地生活达人打分。看短视频、直播和团购挂车，用同一套六维。',
    blocks: SCORE_BLOCKS,
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
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
    scene: '按小红书本地生活达人打分。成交靠笔记被搜到、被相信，再引导到店。用同一套六维，直播不单列。',
    blocks: SCORE_BLOCKS,
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
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
    scene: '按大众点评到店口碑达人打分。核心是真实评价和探店图文。用同一套六维，不评直播。',
    blocks: SCORE_BLOCKS,
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
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
    scene: '按快手本地生活达人打分。老铁信任和直播成交看进团购带货能力。用同一套六维。',
    blocks: SCORE_BLOCKS,
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
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
    scene: '按微信视频号本地生活达人打分。成交靠朋友点赞转发，再进群、企微或小程序。用同一套六维。',
    blocks: SCORE_BLOCKS,
  },
}

const PLAN_MODULES = ['我的资料', '招募大厅', '培训课程', '商单日历']

const ADVICE_SYSTEM = [
  '你是豆包。这是达人自己看的体检，只按短板写给达人本人的改法，用「你」来写。',
  '不要用商家口吻，不要写合作、履约、核销、不建议合作。',
  '不要编造用户没填、现状里也没出现的粉丝数和 GMV。已经进入评估的粉丝、报价、带货等级按原数引用。',
  '不要写未检索到、无公开、无法验证、待补充、公开资料不足、仅供参考、无法判断。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：lift 为整改后综合分预计提升的百分比，整数，范围 5 到 35，不要写百分号。',
  '字段：sections 正好覆盖用户消息里点名的短板，一项对一个维度，不要另起维度。',
  '每项含 name、finding、adjust、soon、module。',
  'name 必须与短板维度名称一致。',
  'finding 是分析结果：这个短板卡在哪、为什么拉低总分，60 到 100 字。引用已经进来的平台资料。',
  'adjust 是怎么调整：必须落到 module 对应的功能里，写改什么、改完应看到什么，80 到 160 字。',
  'soon 是近期要做：近两周能直接执行的 3 件事，用「1.」「2.」「3.」分开，每件写清动作和频率，80 到 160 字。',
  `module 只能是：${PLAN_MODULES.join('、')}。`,
  '对照：本地人群匹配用我的资料补属地和标签，再用招募大厅只接同城单。内容产能稳定用商单日历排更新。内容质量人设用培训课程补出镜、剪辑和团购话术。团购带货能力用招募大厅接同品类团购单，把真实成交写回我的资料。内容转化潜力用培训课程改开头和收藏点，再用招募大厅对照同类任务。口碑合规风险用我的资料核对账号，用培训课程改合规话术。',
  '在「我的资料」启用平台后，粉丝、带货等级、报价、标签、主页链接会进入这次评估。缺的项写去「我的资料」补上后再重新评估。已经进来的数字直接用。',
  '不要写成已经读到官方后台。',
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
    `${spec.fansLabel}：${filledOr(row.followers, '未填写，按内容和同类达人预估，不要改已填数字')}`,
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
  return spec.blocks.map((block) => block.name)
}

function scoreSystem(spec: PlatformSpec) {
  const weights = spec.blocks.map((block) => `${block.name}满分 ${block.weight}`).join('，')
  return [
    '你是豆包。按 6 维本地生活达人模型打分，满分 100。',
    spec.scene,
    `六维及满分：${weights}。团购带货能力权重最高。口碑合规风险是得分，不是另外扣分，越好越高。`,
    '各维看这些信号：本地人群匹配看属地、同城粉丝、年龄性别、本地深耕、是否跨城。内容产能稳定看近 90 天更新、断更、持续时长、垂类是否漂移。内容质量人设看真人出镜、人设是否统一、画质剪辑话术、团购话术。团购带货能力看挂车或带货案例、价格带、预估单量或稿均单量、同品类经验，没有同品类挂车时这项要明显低于有同品类案例的达人。内容转化潜力看稿均播放点赞收藏评论、到店或商品点击、爆款占比、是否像投流刷量。口碑合规风险看违规限流、刷量、负面口碑、评论区、平台认证。',
    '这不是平台官方接口，不要声称读到了官方后台或官方等级。',
    '用户填了的粉丝、报价按原数使用，不要改成另一个数。同名但账号对不上的人不要写进来。',
    '公开检索里对得上这个账号的说法可以引用。检索里没有的画像、完播、单量、认证，按账号资料和同类本地生活达人做预估，写成确定判断。',
    '不要写「公网未检索到」「未检索到」「无公开」「公开资料不足」「无法验证」「待补充」「没有数据」「查不到」「仅供参考」「弱预估」「无公开账号记录」。',
    '不要写成平台上没有这个人。',
    '用户自填的带货等级或达人等级只是用户自己填的，用来对照，不能当成官方读数。',
    '只输出一个 JSON 对象，不要 Markdown，不要额外说明。键名必须用英文双引号，最后一项后面不要逗号。',
    `blocks 为数组，顺序与六维一致，每项含 name、points。points 是该维得分，整数，0 到该维满分，不要写成 0 到 100 的强弱分。name 必须是：${blockNames(spec).join('、')}。`,
    '不要输出 risk。score 为六维得分相加，0 到 100 的整数。系统会按满分重算，重算成功时以系统结果为准。',
    'situations 必须正好 6 项，顺序与六维一致。每项含 name、now。now 不超过 72 字，只写这项现在怎么样，带上具体依据或预估，不要写建议。',
    'exposureLift 为按整改后预计多出来的曝光百分比，整数 8 到 60，不要写百分号。',
    'salesLift 为按整改后预计每月多带来的带货金额，单位元的整数。按已填粉丝、报价和预估增量来写，不要写成当前已经成交的金额。',
    '同一份账号资料每次必须给出相同 blocks 和现状。',
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

function canonBlockName(name: string) {
  return String(name || '').replace(/\s+/g, '')
}

function pointsFor(byName: Record<string, number>, name: string) {
  const key = canonBlockName(name)
  if (Number.isFinite(byName[key])) return byName[key]
  for (const hit of Object.keys(byName)) {
    if (hit && key && (hit.includes(key) || key.includes(hit))) return byName[hit]
  }
  return undefined
}

function averagePoints(byName: Record<string, number>, names: string[]) {
  const vals = names.map((name) => pointsFor(byName, name)).filter((n): n is number => Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((sum, n) => sum + n, 0) / vals.length
}

function dimensionPoints(raw: number, weight: number) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= weight) return n
  if (n >= 30) return Math.max(0, Math.min(weight, Math.round((Math.min(n, 100) / 100) * weight)))
  return weight
}

function scoreFromBlocks(spec: PlatformSpec, blocks: { name: string; points: number }[]) {
  const byName: Record<string, number> = {}
  for (const block of blocks) {
    const key = canonBlockName(block.name)
    if (key) byName[key] = block.points
  }
  let sum = 0
  const norm: Record<string, number> = {}
  const dimensions: { name: string; points: number; max: number }[] = []
  for (const block of spec.blocks) {
    const raw = pointsFor(byName, block.name)
    if (!Number.isFinite(raw)) return null
    const points = dimensionPoints(raw!, block.weight)
    if (points == null) return null
    sum += points
    norm[canonBlockName(block.name)] = (points / block.weight) * 100
    dimensions.push({ name: block.name, points, max: block.weight })
  }
  const levelAPoints = averagePoints(norm, spec.levelABlocks)
  const levelBPoints = averagePoints(norm, spec.levelBBlocks)
  return {
    score: clampScore(sum),
    videoLevel: levelAPoints == null ? '' : levelFromPoints(levelAPoints),
    liveLevel: levelBPoints == null ? '' : levelFromPoints(levelBPoints),
    dimensions,
  }
}

export const DOUYIN_SCORE_GRADES = [
  { key: 'excellent', range: '85~100', label: '优秀', note: '内容和带货都比较稳，按现在的节奏继续发' },
  { key: 'good', range: '70~84', label: '可用', note: 'A 级可用达人，内容和带货能看，短板补上会更稳' },
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
  if (row.nickname || row.accountId) bits.push('联网检索公开主页')
  return bits.join(' · ')
}

export type LocalLifeSituation = {
  name: string
  now: string
  points?: number
  max?: number
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
  finding: string
  adjust: string
  soon: string
  module: string
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

async function askDoubao(system: string, user: string, opts?: { webSearch?: boolean }): Promise<string> {
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
          ...(opts?.webSearch ? { webSearch: true } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(opts?.webSearch ? 120000 : 60000),
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

async function doubaoPublicAccount(spec: PlatformSpec, row: ReturnType<typeof normalizeInput>['row']) {
  try {
    const text = await askDoubao(
      [
        '你在用方舟联网检索这一个达人账号。只写检索结果里明确属于这个昵称或这个账号 ID 的公开信息。',
        '可写公开主页上的粉丝数、近期作品标题、带货或团购的公开说法。每条一行，最多 8 行。',
        '同名但账号对不上的人不要写。没出现的数字不要编进检索结果，留给打分时预估。',
        '一条都没有时只输出：无公开账号记录。',
      ].join(''),
      [
        `平台：${spec.name}`,
        `${spec.nickLabel}：${row.nickname || '未填写'}`,
        `${spec.accountLabel}：${row.accountId || '未填写'}`,
        `主页链接：${row.profileLink || '未填写'}`,
        '请联网检索这一个账号的公开主页、近期内容和带货相关公开说法。',
      ].join('\n'),
      { webSearch: true },
    )
    const lines = String(text || '')
      .split('\n')
      .map((line) => line.replace(/^\d+[.、]\s*/, '').trim())
      .filter((line) => line.length >= 6 && !/暂未检索|未检索到|没有找到|无法查询|公开渠道/.test(line))
    if (/无公开账号记录/.test(text) && !lines.length) return '无公开账号记录'
    if (!lines.length) return '无公开账号记录'
    return lines.slice(0, 8).map((line, index) => `${index + 1}. ${line}`).join('\n')
  } catch {
    return ''
  }
}

const EVAL_SYNC_KEY = 'lq_talent_eval_sync_v2'

function readEvalSyncMap(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(EVAL_SYNC_KEY)
    const j = raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {}
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function writeEvalSyncMap(map: Record<string, Record<string, unknown>>) {
  localStorage.setItem(EVAL_SYNC_KEY, JSON.stringify(map || {}))
}

function rememberEvalSync(platformId: string, payload: Record<string, unknown>) {
  const id = String(platformId || '').trim()
  if (!id || typeof payload.score !== 'number') return
  const map = readEvalSyncMap()
  map[id] = payload
  writeEvalSyncMap(map)
}

function cacheKey(row: ReturnType<typeof normalizeInput>['row']) {
  return [
    'lq_local_life_eval_v6',
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

function cleanSituationNow(text: unknown, points: number, max: number) {
  const now = String(text || '')
    .replace(SITUATION_BAN, '')
    .replace(/[✓⚠️]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，。；、\s]+|[，。；、\s]+$/g, '')
    .trim()
  if (now.length >= 8) return now.slice(0, 72)
  return `按账号现有内容预估，这项大约 ${points}/${max}。`
}

function mapSituations(rows: unknown): LocalLifeSituation[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const points = Number(item.points)
      const max = Number(item.max)
      return {
        name: String(item.name || '').trim().slice(0, 12),
        now: String(item.now || '').replace(SITUATION_BAN, '').trim().slice(0, 72),
        ...(Number.isFinite(points) ? { points } : {}),
        ...(Number.isFinite(max) ? { max } : {}),
      }
    })
    .filter((row) => row.name && row.now)
    .slice(0, 6)
}

function usesSixModel(rows: LocalLifeSituation[]) {
  const text = rows.map((row) => row.name).join(' ')
  return text.includes('团购带货') && text.includes('口碑合规')
}

function alignSituations(
  rows: LocalLifeSituation[],
  dimensions: { name: string; points: number; max: number }[] | undefined,
): LocalLifeSituation[] {
  if (!dimensions?.length) return mapSituations(rows)
  return dimensions.map((dim) => {
    const hit = rows.find((row) => {
      const left = canonBlockName(row.name)
      const right = canonBlockName(dim.name)
      return left === right || left.includes(right) || right.includes(left)
    })
    return {
      name: dim.name,
      now: cleanSituationNow(hit?.now, dim.points, dim.max),
      points: dim.points,
      max: dim.max,
    }
  })
}

function clipPlan(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max)
}

function mapSuggestions(rows: unknown): LocalLifeSuggestion[] {
  const allowed = new Set(PLAN_MODULES)
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const adjust = clipPlan(item.adjust, 200) || clipPlan(item.next, 200)
      const moduleName = String(item.module || '').trim()
      return {
        name: clipPlan(item.name, 12),
        finding: clipPlan(item.finding, 160),
        adjust,
        soon: clipPlan(item.soon, 200),
        module: moduleName,
        next: adjust,
      }
    })
    .filter((row) => row.name && row.finding && row.adjust && allowed.has(row.module))
    .slice(0, 4)
}

function defectBrief(score: LocalLifeScore) {
  return [...score.situations]
    .map((item) => ({
      name: item.name,
      points: item.points || 0,
      max: item.max || 0,
      ratio: item.max ? (item.points || 0) / item.max : 1,
    }))
    .sort((a, b) => a.ratio - b.ratio || a.points - b.points)
    .slice(0, 4)
    .map((item) => `${item.name} ${item.points}/${item.max}`)
    .join('、')
}

function enteredProfile(row: ReturnType<typeof normalizeInput>['row']) {
  const pairs: Array<[string, string]> = [
    ['粉丝', row.followers],
    ['报价', row.quotePrice],
    ['标签', row.tags.join('、')],
    ['主页链接', row.profileLink],
  ]
  if (row.platformId === 'douyin') pairs.push(['带货等级', row.salesLevel])
  if (row.platformId === 'kuaishou') pairs.push(['达人等级', row.talentGrade])
  const entered = pairs.filter(([, value]) => value).map(([label, value]) => `${label} ${value}`)
  const missing = pairs.filter(([, value]) => !value).map(([label]) => label)
  return [
    entered.length ? `已进入评估的平台资料：${entered.join('，')}。` : '已进入评估的平台资料：还没有粉丝、报价、标签或主页链接。',
    missing.length ? `还没进来的资料：${missing.join('、')}。这些要写去「我的资料」补上。` : '平台资料已经进来，方案直接用这些数字。',
  ].join('')
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
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() }
  localStorage.setItem(key, JSON.stringify(next))
  const parts = String(key || '').split('|')
  rememberEvalSync(parts[1] || '', next)
  void import('./mpAccountClientSync').then((mod) => mod.scheduleClientStatePush(800)).catch(() => {})
}

function readEvalCache(row: ReturnType<typeof normalizeInput>['row']) {
  const key = cacheKey(row)
  const local = readCache(key)
  const synced = readEvalSyncMap()[row.platformId]
  const localAt = Date.parse(String(local?.updatedAt || '')) || 0
  const syncAt = Date.parse(String(synced?.updatedAt || '')) || 0
  if (synced && typeof synced.score === 'number' && syncAt >= localAt) {
    localStorage.setItem(key, JSON.stringify(synced))
    return synced
  }
  return local
}

export function exportTalentEvalsForSync() {
  return readEvalSyncMap()
}

export function applyTalentEvalsFromSync(remote: Record<string, Record<string, unknown>> | null | undefined) {
  if (!remote || typeof remote !== 'object') return
  const map = readEvalSyncMap()
  for (const id of Object.keys(remote)) {
    const row = remote[id]
    if (!row || typeof row.score !== 'number') continue
    const prevAt = Date.parse(String(map[id]?.updatedAt || '')) || 0
    const nextAt = Date.parse(String(row.updatedAt || '')) || 0
    if (!map[id] || nextAt >= prevAt) map[id] = row
  }
  writeEvalSyncMap(map)
}

function namedLevel(value: unknown) {
  const s = String(value || '').trim()
  const m = /Lv\s*([0-8])/i.exec(s)
  return m ? `Lv${m[1]}` : ''
}

function levelsFromScore(videoLevel: unknown, liveLevel: unknown, score: unknown) {
  const video = namedLevel(videoLevel)
  const live = namedLevel(liveLevel)
  const n = clampScore(score)
  if ((!video || video === 'Lv0') && (!live || live === 'Lv0') && n >= 15) {
    const fixed = levelFromPoints(n)
    return { videoLevel: fixed, liveLevel: fixed }
  }
  return { videoLevel: video || 'Lv0', liveLevel: live || 'Lv0' }
}

function savedFromCache(cached: Record<string, unknown> | null): { score: LocalLifeScore; advice: LocalLifeAdvice | null } | null {
  if (!cached?.videoLevel || !cached.liveLevel || !Array.isArray(cached.situations) || !cached.situations.length) {
    return null
  }
  const situations = mapSituations(cached.situations)
  if (!usesSixModel(situations)) return null
  const adviceRaw = cached.advice
  let advice: LocalLifeAdvice | null = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray((adviceRaw as LocalLifeAdvice).sections)) {
    const sections = mapSuggestions((adviceRaw as LocalLifeAdvice).sections)
    if (sections.length) advice = { lift: clampLift((adviceRaw as LocalLifeAdvice).lift), sections }
  }
  const levels = levelsFromScore(cached.videoLevel, cached.liveLevel, cached.score)
  return {
    score: {
      score: clampScore(cached.score),
      videoLevel: levels.videoLevel,
      liveLevel: levels.liveLevel,
      situations,
      exposureLift: clampExposure(cached.exposureLift),
      salesLift: clampSalesYuan(cached.salesLift),
    },
    advice,
  }
}

export function readSavedTalentEval(raw: EvalAccountInput) {
  const { row } = normalizeInput(raw)
  if (!row.nickname && !row.accountId) return null
  return savedFromCache(readEvalCache(row))
}

function buildScore(spec: PlatformSpec, j: Record<string, unknown>): LocalLifeScore {
  const computed = scoreFromBlocks(spec, mapBlockPoints(j.blocks))
  const score = computed ? computed.score : clampScore(j.score)
  const levels = levelsFromScore(
    computed?.videoLevel || namedLevel(j.videoLevel),
    computed?.liveLevel || namedLevel(j.liveLevel),
    score,
  )
  return {
    score,
    videoLevel: levels.videoLevel,
    liveLevel: levels.liveLevel,
    situations: alignSituations(mapSituations(j.situations), computed?.dimensions),
    exposureLift: clampExposure(j.exposureLift),
    salesLift: clampSalesYuan(j.salesLift),
  }
}

export async function evaluateTalent(raw: EvalAccountInput, opts?: { force?: boolean }): Promise<LocalLifeScore> {
  const { spec, row } = normalizeInput(raw)
  if (!row.nickname && !row.accountId) throw new Error(`请先填写${spec.nickLabel}或${spec.accountLabel}`)
  const key = cacheKey(row)
  if (!opts?.force) {
    const saved = savedFromCache(readEvalCache(row))
    if (saved) return saved.score
  }
  const gate = await readTalentEvalQuota()
  if (!gate.ok) throw new Error(gate.message || '本月评估次数已用完')
  const notes = await doubaoPublicAccount(spec, row)
  const publicBlock = notes && !/无公开账号记录/.test(notes)
    ? `公开检索：\n${notes}\n检索里没有的指标用预估写进现状，不要写未检索到或无数据。`
    : '公开检索没有可用条目。按用户填写和同类本地生活达人预估打分。正文不要写未检索到、无公开、无法验证、待补充。'
  const j = await askDoubaoJson(
    scoreSystem(spec),
    `${accountFacts(spec, row)}\n${publicBlock}\n请按六维满分给 points，并按同样顺序写 6 条现状。现状用达人自己能看懂的话，不要写给商家的合作判断。`,
  )
  const score = buildScore(spec, j)
  writeCache(key, { ...score, publicNotes: notes || '' }, true)
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
    const cachedAdvice = readEvalCache(row)?.advice
    if (cachedAdvice && typeof cachedAdvice === 'object') {
      const advice = cachedAdvice as LocalLifeAdvice
      if (Array.isArray(advice.sections) && advice.sections.length) {
        const sections = mapSuggestions(advice.sections)
        if (sections.length) return { lift: clampLift(advice.lift), sections }
      }
    }
  }
  await assertTalentPoints('talent_advice')
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const notes = String(readEvalCache(row)?.publicNotes || '')
  const publicBlock = notes && !/无公开账号记录/.test(notes)
    ? `公开检索：\n${notes}`
    : '公开检索没有可用条目。按现状里的预估来写改法，不要写未检索到或无数据。'
  const j = await askDoubaoJson(
    ADVICE_SYSTEM,
    `${accountFacts(spec, row)}\n${enteredProfile(row)}\n${publicBlock}\n评分：${score.score}/100，${spec.levelA} ${score.videoLevel}，${spec.levelB} ${score.liveLevel}。\n现状：\n${lines}\n只为这些短板各写一套方案：${defectBrief(score)}。`,
  )
  const advice: LocalLifeAdvice = {
    lift: clampLift(j.lift),
    sections: mapSuggestions(j.sections),
  }
  if (!advice.sections.length) throw new Error('提升方案不完整，请再点一次')
  await spendTalentPoints('talent_advice', '达人账号分析提升')
  writeCache(key, { advice })
  return advice
}
