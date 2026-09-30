const PLATFORM_SPECS = {
  douyin: {
    id: 'douyin',
    name: '抖音来客',
    scene: '按抖音来客本地生活门店打分。看资料能不能被搜到、套餐能不能挂到店、内容能不能带到核销。',
    blocks: [
      { name: '资料可信', weight: 20 },
      { name: '套餐竞争力', weight: 25 },
      { name: '内容种草', weight: 20 },
      { name: '到店路径', weight: 20 },
      { name: '履约口碑', weight: 15 },
    ],
    risk: 20,
    riskNote: '虚假营业时间、价格和核销不符、套图冒充实拍',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: ['资料可信', '内容种草'],
    levelBBlocks: ['套餐竞争力', '到店路径'],
  },
  meituan: {
    id: 'meituan',
    name: '美团点评',
    scene: '按美团点评到店门店打分。资料和套餐权重大于内容，核心是能被搜到、能核销。',
    blocks: [
      { name: '资料可信', weight: 25 },
      { name: '套餐竞争力', weight: 25 },
      { name: '内容种草', weight: 15 },
      { name: '到店路径', weight: 20 },
      { name: '履约口碑', weight: 15 },
    ],
    risk: 20,
    riskNote: '刷评、水军、营业时间与真实不符',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: ['资料可信', '内容种草'],
    levelBBlocks: ['套餐竞争力', '到店路径'],
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    scene: '按小红书本地生活门店打分。笔记能不能被搜到、被相信，再引导到店或团购。',
    blocks: [
      { name: '资料可信', weight: 15 },
      { name: '套餐竞争力', weight: 15 },
      { name: '内容种草', weight: 35 },
      { name: '到店路径', weight: 20 },
      { name: '履约口碑', weight: 15 },
    ],
    risk: 20,
    riskNote: '营销号感、虚假种草、地址对不上 POI',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: ['资料可信', '内容种草'],
    levelBBlocks: ['套餐竞争力', '到店路径'],
  },
  kuaishou: {
    id: 'kuaishou',
    name: '快手团购',
    scene: '按快手团购门店打分。老铁信任和直播/短视频挂载要能落到核销。',
    blocks: [
      { name: '资料可信', weight: 20 },
      { name: '套餐竞争力', weight: 25 },
      { name: '内容种草', weight: 20 },
      { name: '到店路径', weight: 20 },
      { name: '履约口碑', weight: 15 },
    ],
    risk: 20,
    riskNote: '标题党、挂车和门店无关、价格与核销不符',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: ['资料可信', '内容种草'],
    levelBBlocks: ['套餐竞争力', '到店路径'],
  },
}

const SHOP_EVAL_PLATFORMS = [
  { id: 'douyin', name: '抖音来客' },
  { id: 'meituan', name: '美团点评' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手团购' },
]

const SHOP_EVAL_GRADES = [
  { key: 'ready', range: '85~100', label: '可投放', note: '资料和套餐齐，适合加探店和投流' },
  { key: 'tune', range: '70~84', label: '可优化', note: '能发单，内容和转化路径还要补' },
  { key: 'fill', range: '55~69', label: '先补资料', note: '先把地址、套餐、挂载补齐再加大投放' },
  { key: 'build', range: '＜55', label: '先建档', note: '门店还没形成可核销的对外形象' },
]

function specOf(platformId) {
  const id = platformId
  return PLATFORM_SPECS[id] || PLATFORM_SPECS.douyin
}

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function clampLift(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(35, Math.max(5, v))
}

function clampExposure(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(60, Math.max(8, v))
}

function clampYuan(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(5_000_000, v)
}

function clipText(value, max) {
  return String(value || '').trim().slice(0, max)
}

function normalizeInput(raw) {
  const spec = specOf(String(raw?.platformId || 'douyin'))
  return {
    spec,
    row: {
      platformId: spec.id,
      storeName: String(raw?.storeName || '').trim(),
      address: String(raw?.address || '').trim(),
      phone: String(raw?.phone || '').trim(),
      businessHours: String(raw?.businessHours || '').trim(),
      city: String(raw?.city || '').trim(),
      offerName: String(raw?.offerName || '').trim(),
      offerPrice: String(raw?.offerPrice || '').trim(),
    },
  }
}

function filledOr(value, empty) {
  return value || empty
}

function shopFacts(spec, row) {
  return [
    `平台：${spec.name}`,
    `门店名称：${filledOr(row.storeName, '未填写')}`,
    `城市：${filledOr(row.city, '未填写')}`,
    `地址：${filledOr(row.address, '未填写')}`,
    `电话：${filledOr(row.phone, '未填写')}`,
    `营业时间：${filledOr(row.businessHours, '未填写')}`,
    `主推套餐：${filledOr(row.offerName, '未填写')}`,
    `套餐价格：${filledOr(row.offerPrice, '未填写，不要编造')}`,
  ].join('\n')
}

function scoreSystem(spec) {
  const weights = spec.blocks.map((block) => `${block.name}占 ${block.weight} 分`).join('，')
  const names = spec.blocks.map((block) => block.name).join('、')
  return [
    '你是豆包。',
    spec.scene,
    '这是给商家看的门店体检，用「你」来写。不要声称读到了平台官方后台或官方等级。',
    '只根据已填写的门店资料分析。未填写的销量、核销额、GMV、评价数不要编造。',
    '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。没填的项写成未填写即可。',
    '只输出一个 JSON 对象，不要 Markdown。键名必须用英文双引号，最后一项后面不要逗号。',
    `blocks 为数组，每项含 name、points。points 为 0 到 100 的整数。name 必须是：${names}。`,
    `risk 为 0 到 ${spec.risk} 的整数，表示风险扣分。扣分依据：${spec.riskNote}。没有实锤不要乱扣。`,
    `同时输出 score，为 0 到 100 的整数，按这些权重合成后再扣 risk：${weights}。`,
    `situations 为 4 到 5 项，每项含 name、now。now 不超过 40 字，只写现状不要写建议。name 只能从这些板块里选：${names}。`,
    'exposureLift 为整改后预计多出来的被搜到/展示百分比，整数 8 到 60，不要写百分号。',
    'verifyLift 为整改后预计每月多带来的核销金额，单位元的整数。按已填套餐价格估算增量，没有价格不要编造当前已成交额。',
  ].join('')
}

const ADVICE_SYSTEM = [
  '你是豆包。这是商家自己看的门店体检，按现状写给商家的改法，用「你」来写。',
  '不要编造销量、核销额、GMV。未在资料里出现的数字不要写进来。',
  '不要写「公开资料不足」「仅供参考」「无法判断」这类提示句。',
  '只输出一个 JSON 对象，不要 Markdown。',
  '字段：lift 为整改后综合分预计提升的百分比，整数，范围 5 到 35，不要写百分号。',
  '字段：sections 为 4 到 5 项。每项含 name、finding、adjust、soon。',
  'name 与现状里的板块一致，不超过 8 个字。',
  'finding 是分析结果：这个板块现在卡在哪里、原因是什么，60 到 100 字。',
  'adjust 是怎么调整：改店铺、套餐、内容或挂载里的哪一项，改完应看到什么，80 到 160 字。',
  'soon 是近期要做：近两周能直接执行的 3 件事，用「1.」「2.」「3.」分开，80 到 160 字。',
].join('')

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

function parseShopEvalJson(text) {
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
  for (const item of candidates) {
    try {
      return JSON.parse(escapeNewlinesInStrings(loosenJson(item)))
    } catch {
      /* next */
    }
  }
  throw new Error('评估结果暂时读不出来，请再点一次')
}

function levelFromPoints(points) {
  const steps = [15, 28, 40, 52, 64, 76, 86, 94]
  let lv = 0
  for (const step of steps) {
    if (points >= step) lv += 1
  }
  return `Lv${lv}`
}

function averagePoints(byName, names) {
  const vals = names.map((name) => byName[name]).filter((n) => Number.isFinite(n))
  if (!vals.length) return null
  return vals.reduce((sum, n) => sum + n, 0) / vals.length
}

function scoreFromBlocks(spec, blocks, risk) {
  const byName = {}
  for (const block of blocks) byName[block.name] = block.points
  let sum = 0
  for (const block of spec.blocks) {
    const points = byName[block.name]
    if (!Number.isFinite(points)) return null
    sum += (points / 100) * block.weight
  }
  const deduct = Math.max(0, Math.min(spec.risk, Math.round(Number(risk) || 0)))
  const searchPoints = averagePoints(byName, spec.levelABlocks)
  const verifyPoints = averagePoints(byName, spec.levelBBlocks)
  return {
    score: clampScore(sum - deduct),
    searchLevel: searchPoints == null ? '' : levelFromPoints(searchPoints),
    verifyLevel: verifyPoints == null ? '' : levelFromPoints(verifyPoints),
  }
}

function mapSituations(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? row : {}
      return {
        name: clipText(item.name, 12),
        now: clipText(item.now, 40),
      }
    })
    .filter((row) => row.name && row.now)
    .slice(0, 5)
}

function mapSuggestions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? row : {}
      const next = clipText(item.next, 80)
      const adjust = clipText(item.adjust, 180) || next
      return {
        name: clipText(item.name, 12),
        finding: clipText(item.finding, 140),
        adjust,
        soon: clipText(item.soon, 180),
        next: adjust,
      }
    })
    .filter((row) => row.name && (row.finding || row.adjust || row.soon))
    .slice(0, 5)
}

function cacheKey(row) {
  return [
    'lq_merchant_shop_eval_v1',
    row.platformId,
    row.storeName,
    row.address,
    row.phone,
    row.businessHours,
    row.offerName,
    row.offerPrice,
  ].join('|')
}

function readCache(storage, key) {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(storage, key, patch, replace = false) {
  const prev = replace ? {} : readCache(storage, key) || {}
  storage.setItem(key, JSON.stringify({ ...prev, ...patch }))
}

function buildScore(spec, j) {
  const blocks = (Array.isArray(j.blocks) ? j.blocks : []).map((row) => {
    const item = row && typeof row === 'object' ? row : {}
    return { name: clipText(item.name, 12), points: clampScore(item.points) }
  })
  const computed = scoreFromBlocks(spec, blocks, j.risk)
  return {
    score: computed ? computed.score : clampScore(j.score),
    searchLevel: (computed && computed.searchLevel) || clipText(j.searchLevel, 8),
    verifyLevel: (computed && computed.verifyLevel) || clipText(j.verifyLevel, 8),
    situations: mapSituations(j.situations),
    exposureLift: clampExposure(j.exposureLift),
    verifyLift: clampYuan(j.verifyLift),
  }
}

function savedFromCache(cached) {
  if (!cached || !Array.isArray(cached.situations) || !cached.situations.length) return null
  const adviceRaw = cached.advice
  let advice = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray((adviceRaw).sections)) {
    const sections = mapSuggestions((adviceRaw).sections)
    if (sections.length) advice = { lift: clampLift((adviceRaw).lift), sections }
  }
  return {
    score: {
      score: clampScore(cached.score),
      searchLevel: clipText(cached.searchLevel, 8),
      verifyLevel: clipText(cached.verifyLevel, 8),
      situations: mapSituations(cached.situations),
      exposureLift: clampExposure(cached.exposureLift),
      verifyLift: clampYuan(cached.verifyLift),
    },
    advice,
  }
}

function shopEvalGrade(score) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  if (n >= 85) return SHOP_EVAL_GRADES[0]
  if (n >= 70) return SHOP_EVAL_GRADES[1]
  if (n >= 55) return SHOP_EVAL_GRADES[2]
  return SHOP_EVAL_GRADES[3]
}

function platformShopEvalMeta(platformId) {
  const spec = specOf(platformId)
  return {
    id: spec.id,
    name: spec.name,
    levelA: spec.levelA,
    levelB: spec.levelB,
  }
}

function describeShopEvalBasis(raw) {
  const { row } = normalizeInput(raw)
  const bits = []
  if (row.city) bits.push(row.city)
  if (row.address) bits.push('已填地址')
  if (row.phone) bits.push('已填电话')
  if (row.businessHours) bits.push('已填营业时间')
  if (row.offerName) bits.push(`套餐 ${row.offerName}`)
  if (row.offerPrice) bits.push(`价格 ${row.offerPrice}`)
  return bits.join(' · ')
}

function parseCount(text) {
  const raw = String(text || '').replace(/,/g, '').trim()
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return 0
  return m[2] ? Math.round(n * 10000) : Math.round(n)
}

function previewShopGains(score, offerPrice) {
  const exposurePct = clampExposure(Math.round((100 - Math.min(92, score)) * 1.5))
  const price = parseCount(offerPrice) || 80
  const orders = Math.max(1, Math.round(exposurePct * 1.6))
  return { exposurePct, verifyYuan: clampYuan(Math.max(500, orders * price)) }
}

function formatVerifyYuan(yuan) {
  const n = Math.round(Number(yuan) || 0)
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `¥${text}万`
  }
  return `¥${n.toLocaleString('zh-CN')}`
}

function readSavedShopEval(raw, storage) {
  const { row } = normalizeInput(raw)
  if (!row.storeName) return null
  return savedFromCache(readCache(storage, cacheKey(row)))
}

async function askJson(askText, system, user) {
  const first = await askText(system, user)
  try {
    return parseShopEvalJson(first)
  } catch {
    const second = await askText(
      system,
      `${user}\n上次输出不是合法 JSON。只输出一行 JSON，键名用英文双引号，最后一项后面不要逗号。`,
    )
    return parseShopEvalJson(second)
  }
}

async function evaluateShop(raw, opts) {
  const { spec, row } = normalizeInput(raw)
  if (!row.storeName) throw new Error('请先完善门店名称')
  const key = cacheKey(row)
  if (!opts.force) {
    const saved = savedFromCache(readCache(opts.storage, key))
    if (saved) return saved.score
  }
  const j = await askJson(
    opts.askText,
    scoreSystem(spec),
    `${shopFacts(spec, row)}\n请按权重给各板块 points，并给出 risk 和各板块现状。现状用商家自己能看懂的话来写。`,
  )
  const score = buildScore(spec, j)
  writeCache(opts.storage, key, score, true)
  return score
}

async function adviseShop(raw, score, opts) {
  if (!score || !score.situations || !score.situations.length) throw new Error('请先完成门店评估')
  const { spec, row } = normalizeInput(raw)
  const key = cacheKey(row)
  if (!opts.force) {
    const cached = readCache(opts.storage, key)
    const adviceRaw = cached?.advice
    if (adviceRaw && typeof adviceRaw === 'object') {
      const sections = mapSuggestions((adviceRaw).sections)
      if (sections.length) return { lift: clampLift((adviceRaw).lift), sections }
    }
  }
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const j = await askJson(
    opts.askText,
    ADVICE_SYSTEM,
    `${shopFacts(spec, row)}\n评分：${score.score}/100，${spec.levelA} ${score.searchLevel}，${spec.levelB} ${score.verifyLevel}。\n现状：\n${lines}\n请按每个板块写出分析结果、怎么调整、近两周要做的三件事。`,
  )
  const advice = {
    lift: clampLift(j.lift),
    sections: mapSuggestions(j.sections),
  }
  writeCache(opts.storage, key, { advice })
  return advice
}

function shopEvalGainTargets(score, input) {
  const preview = previewShopGains(score.score, String(input.offerPrice || ''))
  return {
    exposure: score.exposureLift > 0 ? score.exposureLift : preview.exposurePct,
    verify: score.verifyLift > 0 ? score.verifyLift : preview.verifyYuan,
  }
}

module.exports = {
  SHOP_EVAL_PLATFORMS,
  SHOP_EVAL_GRADES,
  parseShopEvalJson,
  shopEvalGrade,
  platformShopEvalMeta,
  describeShopEvalBasis,
  previewShopGains,
  formatVerifyYuan,
  readSavedShopEval,
  evaluateShop,
  adviseShop,
  shopEvalGainTargets,
}
