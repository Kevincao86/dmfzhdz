const ecs = require('./ecs.js')
const auth = require('./auth.js')
const billing = require('./mpBillingRoleHint.js')
const sessionStore = require('./mpSessionStore.js')
const pointsSpend = require('./mpPointsSpendApi.js')

const SCORE_BLOCKS = [
  { name: '本地人群匹配', weight: 20 },
  { name: '内容产能稳定', weight: 15 },
  { name: '内容质量人设', weight: 15 },
  { name: '团购带货能力', weight: 25 },
  { name: '内容转化潜力', weight: 15 },
  { name: '口碑合规风险', weight: 10 },
]
const LEVEL_A_BLOCKS = ['内容产能稳定', '内容质量人设', '内容转化潜力']
const LEVEL_B_BLOCKS = ['团购带货能力', '本地人群匹配']
const SITUATION_BAN = /公网未检索到|未检索到|无公开账号记录|公开资料不足|无法验证|待补充|没有数据|无数据|查不到|仅供参考|弱预估|无公开|没有检索到|检索为空|暂未检索|没有找到|无法查询/g

const PLATFORM_SPECS = {
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
  'module 只能是：' + PLAN_MODULES.join('、') + '。',
  '对照：本地人群匹配用我的资料补属地和标签，再用招募大厅只接同城单。内容产能稳定用商单日历排更新。内容质量人设用培训课程补出镜、剪辑和团购话术。团购带货能力用招募大厅接同品类团购单，把真实成交写回我的资料。内容转化潜力用培训课程改开头和收藏点，再用招募大厅对照同类任务。口碑合规风险用我的资料核对账号，用培训课程改合规话术。',
  '在「我的资料」启用平台后，粉丝、带货等级、报价、标签、主页链接会进入这次评估。缺的项写去「我的资料」补上后再重新评估。已经进来的数字直接用。',
  '不要写成已经读到官方后台。',
].join('')

function specOf(platformId) {
  return PLATFORM_SPECS[platformId] || PLATFORM_SPECS.douyin
}

function cleanTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeInput(raw) {
  const spec = specOf(String((raw && raw.platformId) || 'douyin'))
  return {
    spec,
    row: {
      platformId: spec.id,
      nickname: String((raw && raw.nickname) || '').trim(),
      accountId: String((raw && raw.accountId) || '').trim(),
      followers: String((raw && raw.followers) || '').trim(),
      profileLink: String((raw && raw.profileLink) || '').trim(),
      tags: cleanTags(raw && raw.tags),
      salesLevel: String((raw && raw.salesLevel) || '').trim(),
      talentGrade: String((raw && raw.talentGrade) || '').trim(),
      quotePrice: String((raw && raw.quotePrice) || '').trim(),
    },
  }
}

function filledOr(value, empty) {
  return value || empty
}

function accountFacts(spec, row) {
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

function blockNames(spec) {
  return spec.blocks.map((block) => block.name)
}

function scoreSystem(spec) {
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

function levelFromPoints(points) {
  const steps = [15, 28, 40, 52, 64, 76, 86, 94]
  let lv = 0
  for (let i = 0; i < steps.length; i += 1) {
    if (points >= steps[i]) lv += 1
  }
  return `Lv${lv}`
}

function averagePoints(byName, names) {
  const vals = names.map((name) => pointsFor(byName, name)).filter((n) => Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((sum, n) => sum + n, 0) / vals.length
}

function canonBlockName(name) {
  return String(name || '').replace(/\s+/g, '')
}

function pointsFor(byName, name) {
  const key = canonBlockName(name)
  if (Number.isFinite(byName[key])) return byName[key]
  const keys = Object.keys(byName)
  for (let i = 0; i < keys.length; i += 1) {
    const hit = keys[i]
    if (hit && key && (hit.includes(key) || key.includes(hit))) return byName[hit]
  }
  return undefined
}

function dimensionPoints(raw, weight) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= weight) return n
  if (n >= 30) return Math.max(0, Math.min(weight, Math.round((Math.min(n, 100) / 100) * weight)))
  return weight
}

function scoreFromBlocks(spec, blocks) {
  const byName = {}
  for (let i = 0; i < blocks.length; i += 1) {
    const key = canonBlockName(blocks[i].name)
    if (key) byName[key] = blocks[i].points
  }
  let sum = 0
  const norm = {}
  const dimensions = []
  for (let i = 0; i < spec.blocks.length; i += 1) {
    const block = spec.blocks[i]
    const raw = pointsFor(byName, block.name)
    if (!Number.isFinite(raw)) return null
    const points = dimensionPoints(raw, block.weight)
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

const DOUYIN_SCORE_GRADES = [
  { key: 'excellent', range: '85~100', label: '优秀', note: '内容和带货都比较稳，按现在的节奏继续发' },
  { key: 'good', range: '70~84', label: '可用', note: 'A 级可用达人，内容和带货能看，短板补上会更稳' },
  { key: 'fix', range: '60~69', label: '待整改', note: '短板比较明显，先按报告把内容改到位' },
  { key: 'risk', range: '＜60', label: '高危', note: '现在接单容易吃力，先把内容和账号基础补上' },
]

function douyinScoreGrade(score) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  if (n >= 85) return DOUYIN_SCORE_GRADES[0]
  if (n >= 70) return DOUYIN_SCORE_GRADES[1]
  if (n >= 60) return DOUYIN_SCORE_GRADES[2]
  return DOUYIN_SCORE_GRADES[3]
}

function platformEvalMeta(platformId) {
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

function describeEvalBasis(raw) {
  const packed = normalizeInput(raw)
  const spec = packed.spec
  const row = packed.row
  const bits = []
  if (row.followers) bits.push(`${spec.fansLabel} ${row.followers}`)
  if (row.tags.length) bits.push(`标签 ${row.tags.join('、')}`)
  if (row.profileLink) bits.push('已填主页链接')
  if (spec.id === 'douyin' && row.salesLevel) bits.push(`带货等级 ${row.salesLevel}`)
  if (spec.id === 'kuaishou' && row.talentGrade) bits.push(`达人等级 ${row.talentGrade}`)
  if (row.quotePrice) bits.push(`报价 ${row.quotePrice}`)
  if (row.nickname || row.accountId) bits.push('联网检索公开主页')
  return bits.join(' · ')
}

function authHeaders() {
  const token = sessionStore.readSessionToken()
  if (!token) return {}
  return { 'X-Mp-Session': token, Authorization: `Bearer ${token}` }
}

function loosenJson(slice) {
  return String(slice || '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
}

function escapeNewlinesInStrings(slice) {
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

function takeBalancedObject(s) {
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

function parseJsonObject(text) {
  const raw = String(text || '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1] : raw
  const start = body.indexOf('{')
  if (start < 0) throw new Error('评估结果暂时读不出来，请再点一次')
  const candidates = []
  const balanced = takeBalancedObject(body.slice(start))
  if (balanced) candidates.push(balanced)
  const end = body.lastIndexOf('}')
  if (end > start) candidates.push(body.slice(start, end + 1))
  for (let i = 0; i < candidates.length; i += 1) {
    const fixed = escapeNewlinesInStrings(loosenJson(candidates[i]))
    try {
      return JSON.parse(fixed)
    } catch {
      /* 下一种切法 */
    }
  }
  throw new Error('评估结果暂时读不出来，请再点一次')
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

async function askDoubao(system, user, opts) {
  const data = await ecs.post(
    '/api/meoo-ai-chat',
    {
      provider: 'doubao',
      stream: false,
      temperature: 0,
      ...(opts && opts.webSearch ? { webSearch: true } : {}),
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
  return content
}

async function askDoubaoJson(system, user) {
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

function accountScope() {
  try {
    return String(require('./mpAccountLocalScope.js').currentScopeId() || '').trim()
  } catch (e) {
    return ''
  }
}

function cacheKey(row) {
  return ['lq_local_life_eval_v6', accountScope(), row.platformId].join('|')
}

const EVAL_SYNC_KEY = 'lq_talent_eval_sync_v2'

function readEvalSyncMap() {
  try {
    const raw = wx.getStorageSync(EVAL_SYNC_KEY)
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return j && typeof j === 'object' ? j : {}
  } catch (e) {
    return {}
  }
}

function writeEvalSyncMap(map) {
  wx.setStorageSync(EVAL_SYNC_KEY, JSON.stringify(map || {}))
}

function rememberEvalSync(platformId, payload) {
  const id = String(platformId || '').trim()
  if (!id || !payload || typeof payload.score !== 'number') return
  const map = readEvalSyncMap()
  map[id] = payload
  writeEvalSyncMap(map)
}

function loadCache(row) {
  const key = cacheKey(row)
  if (!auth.isLoggedIn() || (!row.nickname && !row.accountId)) return { key, data: null }
  const local = readCache(key)
  const synced = readEvalSyncMap()[row.platformId]
  const localAt = Date.parse(local && local.updatedAt) || 0
  const syncAt = Date.parse(synced && synced.updatedAt) || 0
  if (synced && typeof synced.score === 'number' && syncAt >= localAt) {
    wx.setStorageSync(key, JSON.stringify(synced))
    return { key, data: synced }
  }
  return { key, data: local }
}

async function doubaoPublicAccount(spec, row) {
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

function mapBlockPoints(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: String(row && row.name ? row.name : '').trim(),
      points: clampScore(row && row.points),
    }))
    .filter((row) => row.name)
}

function cleanSituationNow(text, points, max) {
  const now = String(text || '')
    .replace(SITUATION_BAN, '')
    .replace(/[✓⚠️]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，。；、\s]+|[，。；、\s]+$/g, '')
    .trim()
  if (now.length >= 8) return now.slice(0, 72)
  return '按账号现有内容预估，这项大约 ' + points + '/' + max + '。'
}

function mapSituations(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const points = Number(row && row.points)
      const max = Number(row && row.max)
      const item = {
        name: String(row && row.name ? row.name : '').trim().slice(0, 12),
        now: String(row && row.now ? row.now : '').replace(SITUATION_BAN, '').trim().slice(0, 72),
      }
      if (Number.isFinite(points)) item.points = points
      if (Number.isFinite(max)) item.max = max
      return item
    })
    .filter((row) => row.name && row.now)
    .slice(0, 6)
}

function usesSixModel(rows) {
  const text = (rows || []).map((row) => row.name).join(' ')
  return text.indexOf('团购带货') >= 0 && text.indexOf('口碑合规') >= 0
}

function alignSituations(rows, dimensions) {
  if (!dimensions || !dimensions.length) return mapSituations(rows)
  return dimensions.map((dim) => {
    let hit = null
    for (let i = 0; i < rows.length; i += 1) {
      const left = canonBlockName(rows[i].name)
      const right = canonBlockName(dim.name)
      if (left === right || left.indexOf(right) >= 0 || right.indexOf(left) >= 0) {
        hit = rows[i]
        break
      }
    }
    return {
      name: dim.name,
      now: cleanSituationNow(hit && hit.now, dim.points, dim.max),
      points: dim.points,
      max: dim.max,
    }
  })
}

function clampLift(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(35, Math.max(5, n))
}

function clampExposure(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(60, Math.max(8, n))
}

function clampSalesYuan(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(5000000, n)
}

function parseCount(text) {
  const raw = String(text || '').replace(/,/g, '').trim()
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return 0
  return m[2] ? Math.round(n * 10000) : Math.round(n)
}

function previewTalentGains(score, followers, quote) {
  const exposurePct = clampExposure(Math.round((100 - Math.min(92, score)) * 1.5))
  const fans = parseCount(followers)
  const price = parseCount(quote) || 80
  const orders = Math.max(1, Math.round((fans || 10000) * (exposurePct / 100) * 0.002))
  return { exposurePct, salesYuan: clampSalesYuan(Math.max(500, orders * price)) }
}

function formatSalesYuan(yuan) {
  const n = Math.round(Number(yuan) || 0)
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return '¥' + text + '万'
  }
  return '¥' + n.toLocaleString('zh-CN')
}

function clipText(value, max) {
  return String(value || '').trim().slice(0, max)
}

function mapSuggestions(rows) {
  const allowed = {}
  PLAN_MODULES.forEach((name) => {
    allowed[name] = true
  })
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const adjust = clipText(row && row.adjust, 200) || clipText(row && row.next, 200)
      const moduleName = clipText(row && row.module, 8)
      return {
        name: clipText(row && row.name, 12),
        finding: clipText(row && row.finding, 160),
        adjust,
        soon: clipText(row && row.soon, 200),
        module: moduleName,
        next: adjust,
      }
    })
    .filter((row) => row.name && row.finding && row.adjust && allowed[row.module])
    .slice(0, 4)
}

function defectBrief(score) {
  const rows = (score && score.situations ? score.situations : [])
    .map((item) => ({
      name: item.name,
      points: item.points || 0,
      max: item.max || 0,
      ratio: item.max ? (item.points || 0) / item.max : 1,
    }))
    .sort((a, b) => a.ratio - b.ratio || a.points - b.points)
    .slice(0, 4)
  return rows.map((item) => item.name + ' ' + item.points + '/' + item.max).join('、')
}

function enteredProfile(row) {
  const pairs = [
    ['粉丝', row.followers],
    ['报价', row.quotePrice],
    ['标签', row.tags.join('、')],
    ['主页链接', row.profileLink],
  ]
  if (row.platformId === 'douyin') pairs.push(['带货等级', row.salesLevel])
  if (row.platformId === 'kuaishou') pairs.push(['达人等级', row.talentGrade])
  const entered = pairs.filter((pair) => pair[1]).map((pair) => pair[0] + ' ' + pair[1])
  const missing = pairs.filter((pair) => !pair[1]).map((pair) => pair[0])
  return (
    (entered.length ? '已进入评估的平台资料：' + entered.join('，') + '。' : '已进入评估的平台资料：还没有粉丝、报价、标签或主页链接。') +
    (missing.length ? '还没进来的资料：' + missing.join('、') + '。这些要写去「我的资料」补上。' : '平台资料已经进来，方案直接用这些数字。')
  )
}

function readCache(key) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return null
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!j || typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(key, patch, replace) {
  const prev = replace ? {} : readCache(key) || {}
  const next = Object.assign({}, prev, patch, { updatedAt: new Date().toISOString() })
  wx.setStorageSync(key, JSON.stringify(next))
  const platformId = String(key || '').split('|').pop()
  rememberEvalSync(platformId, next)
  try {
    require('./mpAccountClientSync.js').schedulePush(800)
  } catch (e) {}
}

function exportTalentEvalsForSync() {
  return readEvalSyncMap()
}

function applyTalentEvalsFromSync(remote) {
  if (!remote || typeof remote !== 'object') return
  const map = readEvalSyncMap()
  const ids = Object.keys(remote)
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]
    const row = remote[id]
    if (!row || typeof row.score !== 'number') continue
    const prevAt = Date.parse(map[id] && map[id].updatedAt) || 0
    const nextAt = Date.parse(row.updatedAt) || 0
    if (!map[id] || nextAt >= prevAt) map[id] = row
  }
  writeEvalSyncMap(map)
}

function namedLevel(value) {
  const s = String(value || '').trim()
  const m = /Lv\s*([0-8])/i.exec(s)
  return m ? `Lv${m[1]}` : ''
}

function levelsFromScore(videoLevel, liveLevel, score) {
  const video = namedLevel(videoLevel)
  const live = namedLevel(liveLevel)
  const n = clampScore(score)
  if ((!video || video === 'Lv0') && (!live || live === 'Lv0') && n >= 15) {
    const fixed = levelFromPoints(n)
    return { videoLevel: fixed, liveLevel: fixed }
  }
  return { videoLevel: video || 'Lv0', liveLevel: live || 'Lv0' }
}

function savedFromCache(cached) {
  if (!cached || !cached.videoLevel || !cached.liveLevel || !Array.isArray(cached.situations) || !cached.situations.length) {
    return null
  }
  const situations = mapSituations(cached.situations)
  if (!usesSixModel(situations)) return null
  const adviceRaw = cached.advice
  let advice = null
  if (adviceRaw && Array.isArray(adviceRaw.sections)) {
    const sections = mapSuggestions(adviceRaw.sections)
    if (sections.length) advice = { lift: clampLift(adviceRaw.lift), sections }
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

function readSavedTalentEval(raw) {
  const row = normalizeInput(raw).row
  if (!auth.isLoggedIn() || (!row.nickname && !row.accountId)) return null
  return savedFromCache(loadCache(row).data)
}

function buildScore(spec, j) {
  const computed = scoreFromBlocks(spec, mapBlockPoints(j && j.blocks))
  const score = computed ? computed.score : clampScore(j && j.score)
  const levels = levelsFromScore(
    (computed && computed.videoLevel) || namedLevel(j && j.videoLevel),
    (computed && computed.liveLevel) || namedLevel(j && j.liveLevel),
    score,
  )
  return {
    score,
    videoLevel: levels.videoLevel,
    liveLevel: levels.liveLevel,
    situations: alignSituations(mapSituations(j && j.situations), computed && computed.dimensions),
    exposureLift: clampExposure(j && j.exposureLift),
    salesLift: clampSalesYuan(j && j.salesLift),
  }
}

function quotaFrom(data) {
  const remaining = Number(data && data.quotaRemaining)
  return {
    ok: !data || data.ok !== false,
    message: String((data && data.message) || ''),
    remaining: Number.isFinite(remaining) ? remaining : -1,
    limit: Number(data && data.quotaLimit) || 1,
    paid: !!(data && data.quotaPaid),
  }
}

async function postTalentQuota(action, extra) {
  const token = auth.readSessionToken()
  const data = await ecs.post(
    '/api/meoo-ops-mp-auth',
    Object.assign(
      {
        action,
        kind: 'talent_eval',
        sessionToken: token,
        token,
      },
      billing.billingRolePayload(),
      extra || {},
    ),
    token ? { 'X-Mp-Session': token } : {},
  )
  return quotaFrom(data)
}

async function readTalentEvalQuota() {
  return postTalentQuota('mp_ai_points_afford')
}

async function evaluateTalent(raw, opts) {
  const packed = normalizeInput(raw)
  const spec = packed.spec
  const row = packed.row
  if (!row.nickname && !row.accountId) throw new Error(`请先填写${spec.nickLabel}或${spec.accountLabel}`)
  const loaded = loadCache(row)
  const key = loaded.key
  if (!(opts && opts.force)) {
    const saved = savedFromCache(loaded.data)
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
  writeCache(key, Object.assign({}, score, { publicNotes: notes || '' }))
  try {
    await postTalentQuota('mp_ai_points_spend', {
      idempotencyKey: 'talent-eval-' + Date.now(),
      note: '达人账号评估',
    })
  } catch (e) {}
  return score
}

async function adviseTalent(raw, score, opts) {
  if (!score || !Array.isArray(score.situations) || !score.situations.length) {
    throw new Error('请先完成达人信息评估')
  }
  const packed = normalizeInput(raw)
  const spec = packed.spec
  const row = packed.row
  const loaded = loadCache(row)
  const key = loaded.key
  if (!(opts && opts.force)) {
    const cached = loaded.data
    if (cached && cached.advice && Array.isArray(cached.advice.sections) && cached.advice.sections.length) {
      const sections = mapSuggestions(cached.advice.sections)
      if (sections.length) return { lift: clampLift(cached.advice.lift), sections }
    }
  }
  await pointsSpend.assertTalentEvalAffordable('talent_advice')
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const notes = String((loaded.data && loaded.data.publicNotes) || '')
  const publicBlock = notes && !/无公开账号记录/.test(notes)
    ? `公开检索：\n${notes}`
    : '公开检索没有可用条目。按现状里的预估来写改法，不要写未检索到或无数据。'
  const j = await askDoubaoJson(
    ADVICE_SYSTEM,
    `${accountFacts(spec, row)}\n${enteredProfile(row)}\n${publicBlock}\n评分：${score.score}/100，${spec.levelA} ${score.videoLevel}，${spec.levelB} ${score.liveLevel}。\n现状：\n${lines}\n只为这些短板各写一套方案：${defectBrief(score)}。`,
  )
  const advice = { lift: clampLift(j.lift), sections: mapSuggestions(j.sections) }
  if (!advice.sections.length) throw new Error('提升方案不完整，请再点一次')
  await pointsSpend.spendTalentEvalPoints('talent_advice', '达人账号分析提升')
  writeCache(key, { advice })
  return advice
}

module.exports = {
  evaluateTalent,
  adviseTalent,
  platformEvalMeta,
  describeEvalBasis,
  DOUYIN_SCORE_GRADES,
  douyinScoreGrade,
  readSavedTalentEval,
  previewTalentGains,
  formatSalesYuan,
  TALENT_EVAL_POINTS: pointsSpend.TALENT_EVAL_POINTS,
  TALENT_ADVICE_POINTS: pointsSpend.TALENT_ADVICE_POINTS,
  readTalentEvalQuota,
  exportTalentEvalsForSync,
  applyTalentEvalsFromSync,
}
