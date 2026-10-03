const ecs = require('./ecs.js')
const auth = require('./auth.js')
const billing = require('./mpBillingRoleHint.js')
const sessionStore = require('./mpSessionStore.js')
const pointsSpend = require('./mpPointsSpendApi.js')

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
  '不要编造粉丝数、GMV。未在用户填写或公开检索里出现的数字不要写进来。同名但账号对不上的人不要写。',
  '不要写「公开资料不足」「仅供参考」「无法判断」这类提示句。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：lift 为整改后综合分预计提升的百分比，整数，范围 5 到 35，不要写百分号。',
  '字段：sections 为 4 到 5 项。每项含 name、finding、adjust、soon。',
  'name 与现状里的板块一致，不超过 8 个字。',
  'finding 是分析结果：写出这个板块现在卡在哪里、原因是什么，不要复述现状原句，60 到 100 字。',
  'adjust 是怎么调整：写出改哪一类内容、具体怎么改、改完应看到什么变化，至少两句，80 到 160 字。',
  'soon 是近期要做：写出近两周能直接执行的 3 件事，用「1.」「2.」「3.」分开，每件写清动作和频率，80 到 160 字。',
  '不要一句口号带过，不要编造未提供的播放量、GMV 或粉丝数。',
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

function blockNames(spec) {
  return spec.blocks.map((block) => block.name).concat(['账号风险'])
}

function scoreSystem(spec) {
  const weights = spec.blocks.map((block) => `${block.name}占 ${block.weight} 分`).join('，')
  return [
    '你是豆包。',
    spec.scene,
    '这不是平台官方接口，不要声称读到了官方后台或官方等级。',
    '根据用户填写的账号资料，以及附上的公开检索打分。用户填了的数字按原数使用，不要改成另一个数。',
    '公开检索里明确属于这个账号的粉丝、作品标题、带货说法可以引用。检索里没有的粉丝数、播放量、GMV、官方带货等级不要编造。同名但账号对不上的人不要写进来。',
    '公开检索为空或写着无公开账号记录时，按用户填写的资料打分，不要写成平台上没有这个人。',
    '用户自填的带货等级或达人等级只是用户自己填的，用来对照，不能当成官方读数。',
    '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。',
    '只输出一个 JSON 对象，不要 Markdown，不要额外说明。键名必须用英文双引号，最后一项后面不要逗号。',
    `blocks 为数组，每项含 name、points。points 为 0 到 100 的整数，表示该板块强弱。name 必须是：${spec.blocks.map((block) => block.name).join('、')}。`,
    `risk 为 0 到 ${spec.risk} 的整数，表示账号风险扣分。扣分依据：${spec.riskNote}。`,
    `同时输出 score，为 0 到 100 的整数，按这些权重合成后再扣 risk：${weights}。系统会按同样权重重算，重算成功时以系统结果为准。`,
    `situations 为 3 到 5 项，每项含 name、now。now 不超过 40 字，只写该板块现状，不要写建议。现状要扣住用户填了的昵称、账号、粉丝、标签、报价或等级，以及公开检索里属于这个账号的句子；没填也没检索到的项不要写成具体数字。name 只能从这些板块里选：${blockNames(spec).join('、')}。`,
    'exposureLift 为按整改后预计多出来的曝光百分比，整数 8 到 60，不要写百分号。',
    'salesLift 为按整改后预计每月多带来的带货金额，单位元的整数。按已填粉丝和报价估算增量，不要写成当前已经成交的金额。',
    '同一份账号资料每次必须给出相同 blocks、risk 和现状。',
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

function scoreFromBlocks(spec, blocks, risk) {
  const byName = {}
  for (let i = 0; i < blocks.length; i += 1) {
    const key = canonBlockName(blocks[i].name)
    if (key) byName[key] = blocks[i].points
  }
  let sum = 0
  for (let i = 0; i < spec.blocks.length; i += 1) {
    const block = spec.blocks[i]
    const points = pointsFor(byName, block.name)
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

const DOUYIN_SCORE_GRADES = [
  { key: 'excellent', range: '85~100', label: '优秀', note: '内容和带货都比较稳，按现在的节奏继续发' },
  { key: 'good', range: '70~84', label: '良好', note: '整体能看，把报告里标出的短板补一补会更稳' },
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
  bits.push('联网检索公开主页')
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
  return ['lq_local_life_eval_v5', accountScope(), row.platformId].join('|')
}

const EVAL_SYNC_KEY = 'lq_talent_eval_sync_v1'

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
        '同名但账号对不上的人不要写。没出现的粉丝数、播放量、GMV、带货等级不要编造。',
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

function mapSituations(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      name: String(row && row.name ? row.name : '').trim().slice(0, 12),
      now: String(row && row.now ? row.now : '').trim().slice(0, 40),
    }))
    .filter((row) => row.name && row.now)
    .slice(0, 5)
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
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const next = clipText(row && row.next, 80)
      const adjust = clipText(row && row.adjust, 180) || next
      return {
        name: clipText(row && row.name, 12),
        finding: clipText(row && row.finding, 140),
        adjust,
        soon: clipText(row && row.soon, 180),
        next: adjust,
      }
    })
    .filter((row) => row.name && (row.finding || row.adjust || row.soon))
    .slice(0, 5)
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
      situations: mapSituations(cached.situations),
      exposureLift: clampExposure(cached.exposureLift),
      salesLift: clampSalesYuan(cached.salesLift),
    },
    advice,
  }
}

function readSavedTalentEval(raw) {
  const row = normalizeInput(raw).row
  return savedFromCache(loadCache(row).data)
}

function buildScore(spec, j) {
  const computed = scoreFromBlocks(spec, mapBlockPoints(j && j.blocks), j && j.risk)
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
    situations: mapSituations(j && j.situations),
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
  const publicBlock = notes ? `公开检索：\n${notes}` : '公开检索：这次没有检索到。按用户填写的资料打分，不要编造粉丝、播放和带货数字。'
  const j = await askDoubaoJson(
    scoreSystem(spec),
    `${accountFacts(spec, row)}\n${publicBlock}\n请按权重给各板块 points，并给出 risk 和各板块现状。现状用达人自己能看懂的话来写，不要写给商家的合作判断。`,
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
      return { lift: clampLift(cached.advice.lift), sections: mapSuggestions(cached.advice.sections) }
    }
  }
  await pointsSpend.assertTalentEvalAffordable('talent_advice')
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const notes = String((loaded.data && loaded.data.publicNotes) || '')
  const publicBlock = notes ? `公开检索：\n${notes}` : '公开检索：这次没有检索到。'
  const j = await askDoubaoJson(
    ADVICE_SYSTEM,
    `${accountFacts(spec, row)}\n${publicBlock}\n评分：${score.score}/100，${spec.levelA} ${score.videoLevel}，${spec.levelB} ${score.liveLevel}。\n现状：\n${lines}\n请按每个板块写出分析结果、怎么调整、近两周要做的三件事。写具体动作，不要一句带过。`,
  )
  const advice = { lift: clampLift(j.lift), sections: mapSuggestions(j.sections) }
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
