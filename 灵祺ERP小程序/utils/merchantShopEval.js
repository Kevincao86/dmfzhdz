const PLATFORM_SPECS = {
  douyin: {
    id: 'douyin',
    name: '抖音来客',
    scope: 'single',
    scene: '按抖音来客单门店打分。看这家店资料能不能被搜到、套餐能不能挂到店、内容能不能带到核销。',
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
    scope: 'single',
    scene: '按美团点评单门店打分。资料和套餐权重大于内容，核心是这家店能被搜到、能核销。',
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
    scope: 'single',
    scene: '按小红书单门店打分。笔记能不能被搜到、被相信，再引导到这家店或团购。',
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
    scope: 'single',
    scene: '按快手团购单门店打分。老铁信任和直播/短视频挂载要能落到这家店核销。',
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

const CHAIN_OVERLAYS = {
  douyin: {
    scene: '按抖音来客连锁品牌打分。看各店资料是否统一、套餐能否统筹挂载、内容能否带到各店核销。',
    blocks: [
      { name: '品牌一致性', weight: 25 },
      { name: '套餐统筹', weight: 20 },
      { name: '内容种草', weight: 15 },
      { name: '分店覆盖', weight: 25 },
      { name: '履约口碑', weight: 15 },
    ],
    riskNote: '各店资料互相打架、同套餐不同价、分店漏挂载、套图冒充实拍',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
    levelABlocks: ['品牌一致性', '内容种草'],
    levelBBlocks: ['套餐统筹', '分店覆盖'],
  },
  meituan: {
    scene: '按美团点评连锁品牌打分。资料和套餐在各店是否统一，分店是否都能被搜到、能核销。',
    blocks: [
      { name: '品牌一致性', weight: 25 },
      { name: '套餐统筹', weight: 25 },
      { name: '内容种草', weight: 10 },
      { name: '分店覆盖', weight: 25 },
      { name: '履约口碑', weight: 15 },
    ],
    riskNote: '各店评分口径不一、刷评、分店营业时间与真实不符',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
    levelABlocks: ['品牌一致性', '内容种草'],
    levelBBlocks: ['套餐统筹', '分店覆盖'],
  },
  xiaohongshu: {
    scene: '按小红书连锁品牌打分。笔记是不是品牌一致、能不能被相信，再引导到各店或团购。',
    blocks: [
      { name: '品牌一致性', weight: 20 },
      { name: '套餐统筹', weight: 15 },
      { name: '内容种草', weight: 30 },
      { name: '分店覆盖', weight: 20 },
      { name: '履约口碑', weight: 15 },
    ],
    riskNote: '营销号感、虚假种草、分店 POI 对不上、各店笔记口径打架',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
    levelABlocks: ['品牌一致性', '内容种草'],
    levelBBlocks: ['套餐统筹', '分店覆盖'],
  },
  kuaishou: {
    scene: '按快手团购连锁品牌打分。老铁信任和直播/短视频挂载要能落到各店核销。',
    blocks: [
      { name: '品牌一致性', weight: 25 },
      { name: '套餐统筹', weight: 20 },
      { name: '内容种草', weight: 15 },
      { name: '分店覆盖', weight: 25 },
      { name: '履约口碑', weight: 15 },
    ],
    riskNote: '标题党、挂车和分店无关、同套餐不同价、分店漏挂',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
    levelABlocks: ['品牌一致性', '内容种草'],
    levelBBlocks: ['套餐统筹', '分店覆盖'],
  },
}

const SHOP_EVAL_PLATFORMS = [
  { id: 'douyin', name: '抖音来客' },
  { id: 'meituan', name: '美团点评' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手团购' },
]

const SHOP_EVAL_GRADES_SINGLE = [
  { key: 'ready', range: '85~100', label: '经营稳健', note: '资料和套餐齐，顾客能搜到、能到店核销' },
  { key: 'tune', range: '70~84', label: '转化偏弱', note: '店能被看见，内容和到店转化还不够稳' },
  { key: 'fill', range: '55~69', label: '资料偏薄', note: '地址、套餐或挂载还不齐，获客能力有限' },
  { key: 'build', range: '＜55', label: '形象未立', note: '还没形成能被搜到、能核销的对外形象' },
]

const SHOP_EVAL_GRADES_CHAIN = [
  { key: 'ready', range: '85~100', label: '品牌成型', note: '各店资料和套餐统一，品牌能被搜到、分店能核销' },
  { key: 'tune', range: '70~84', label: '协同不足', note: '品牌能见客，分店之间资料或转化还不齐' },
  { key: 'fill', range: '55~69', label: '分店偏散', note: '多家店还没统一资料、套餐或挂载' },
  { key: 'build', range: '＜55', label: '品牌未立', note: '连锁还没形成统一可核销的对外形象' },
]

const SHOP_EVAL_GRADES = SHOP_EVAL_GRADES_SINGLE

function shopEvalScopeOf(raw) {
  if (raw && (raw.scope === 'chain' || Number(raw.storeCount) >= 2)) return 'chain'
  return 'single'
}

function shopEvalGrades(scope) {
  return scope === 'chain' ? SHOP_EVAL_GRADES_CHAIN : SHOP_EVAL_GRADES_SINGLE
}

function specOf(platformId, scope) {
  const id = platformId
  const base = PLATFORM_SPECS[id] || PLATFORM_SPECS.douyin
  if (scope !== 'chain') return base
  const overlay = CHAIN_OVERLAYS[base.id] || CHAIN_OVERLAYS.douyin
  return Object.assign({}, base, overlay, { scope: 'chain' })
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
  const scope = shopEvalScopeOf(raw)
  const spec = specOf(String(raw && raw.platformId ? raw.platformId : 'douyin'), scope)
  return {
    spec,
    row: {
      platformId: spec.id,
      scope,
      storeCount: Math.max(0, Math.round(Number(raw && raw.storeCount) || 0)),
      brandName: String((raw && raw.brandName) || '').trim(),
      storeNames: String((raw && raw.storeNames) || '').trim(),
      storeName: String((raw && raw.storeName) || '').trim(),
      address: String((raw && raw.address) || '').trim(),
      phone: String((raw && raw.phone) || '').trim(),
      businessHours: String((raw && raw.businessHours) || '').trim(),
      city: String((raw && raw.city) || '').trim(),
      offerName: String((raw && raw.offerName) || '').trim(),
      offerPrice: String((raw && raw.offerPrice) || '').trim(),
    },
  }
}

function filledOr(value, empty) {
  return value || empty
}

function shopFacts(spec, row) {
  return [
    `平台：${spec.name}`,
    `经营形态：${spec.scope === 'chain' ? `连锁品牌（${row.storeCount || '多家'}）` : '单门店'}`,
    `品牌：${filledOr(row.brandName, spec.scope === 'chain' ? '未填写' : '无')}`,
    `门店名称：${filledOr(row.storeName, '未填写')}`,
    `分店示例：${filledOr(row.storeNames, spec.scope === 'chain' ? '未列出' : '无')}`,
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
    spec.scope === 'chain'
      ? '这是给商家看的连锁品牌体检，用「你」来写。不要声称读到了平台官方后台或官方等级。'
      : '这是给商家看的单门店体检，用「你」来写。不要声称读到了平台官方后台或官方等级。',
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

function adviceSystem(spec) {
  return [
    '你是豆包。这是商家自己看的门店体检，按现状写给商家的改法，用「你」来写。',
    spec.scope === 'chain'
      ? '对象是连锁品牌。建议要能落到各店统一资料、统一套餐、补齐漏挂分店，不要只写一家店。'
      : '对象是单门店。建议要落到这家店的资料、套餐、内容和挂载。',
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

function ownerId() {
  try {
    return String(wx.getStorageSync('meoo_active_tenant_id') || '').trim()
  } catch (e) {
    return ''
  }
}

function cacheKey(row) {
  return ['lq_merchant_shop_eval_v3', ownerId(), row.platformId].join('|')
}

function legacyCacheKey(row) {
  return [
    'lq_merchant_shop_eval_v2',
    row.platformId,
    row.scope,
    String(row.storeCount || 0),
    row.brandName,
    row.storeName,
    row.address,
    row.phone,
    row.businessHours,
    row.offerName,
    row.offerPrice,
  ].join('|')
}

function loadCache(storage, row) {
  const key = cacheKey(row)
  const hit = readCache(storage, key)
  if (hit) return { key, data: hit }
  const old = readCache(storage, legacyCacheKey(row))
  if (!old) return { key, data: null }
  writeCache(storage, key, old, true)
  return { key, data: readCache(storage, key) || old }
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

function shopEvalGrade(score, scope) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  const grades = shopEvalGrades(scope)
  if (n >= 85) return grades[0]
  if (n >= 70) return grades[1]
  if (n >= 55) return grades[2]
  return grades[3]
}

function platformShopEvalMeta(platformId, scope) {
  const spec = specOf(platformId, scope)
  return {
    id: spec.id,
    name: spec.name,
    scope: spec.scope,
    levelA: spec.levelA,
    levelB: spec.levelB,
    title: spec.scope === 'chain' ? '品牌智能分析' : '门店智能分析',
    statusTitle: spec.scope === 'chain' ? '品牌现状' : '门店现状',
  }
}

function describeShopEvalBasis(raw) {
  const parsed = normalizeInput(raw)
  const row = parsed.row
  const spec = parsed.spec
  const bits = []
  bits.push(spec.scope === 'chain' ? `连锁品牌 · ${row.storeCount || '多'}家` : '单门店')
  if (row.brandName) bits.push(row.brandName)
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

function resolveShopEvalFromStores(platformId, stores, total) {
  const list = Array.isArray(stores) ? stores : []
  const count = Math.max(list.length, Math.round(Number(total) || 0))
  const first = list[0] || {}
  const scope = count >= 2 ? 'chain' : 'single'
  let brandName = String(first.brandName || '').trim()
  if (!brandName) {
    for (let i = 0; i < list.length; i += 1) {
      const name = String(list[i] && list[i].brandName ? list[i].brandName : '').trim()
      if (name) {
        brandName = name
        break
      }
    }
  }
  const storeNames = list
    .slice(0, 8)
    .map((row) => String(row && row.name ? row.name : '').trim())
    .filter(Boolean)
    .join('、')
  return {
    platformId,
    scope,
    storeCount: count,
    brandName,
    storeNames,
    storeName: String(first.name || '').trim(),
    address: String(first.address || '').trim(),
    phone: String(first.phone || '').trim(),
    businessHours: String(first.businessHours || '').trim(),
    city: String(first.city || '').trim(),
  }
}

function readSavedShopEval(raw, storage) {
  const { row } = normalizeInput(raw)
  return savedFromCache(loadCache(storage, row).data)
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
  const loaded = loadCache(opts.storage, row)
  const key = loaded.key
  if (!opts.force) {
    const saved = savedFromCache(loaded.data)
    if (saved) return saved.score
  }
  const j = await askJson(
    opts.askText,
    scoreSystem(spec),
    `${shopFacts(spec, row)}\n请按权重给各板块 points，并给出 risk 和各板块现状。现状用商家自己能看懂的话来写。`,
  )
  const score = buildScore(spec, j)
  writeCache(opts.storage, key, score)
  return score
}

async function adviseShop(raw, score, opts) {
  if (!score || !score.situations || !score.situations.length) throw new Error('请先完成门店评估')
  const { spec, row } = normalizeInput(raw)
  const loaded = loadCache(opts.storage, row)
  const key = loaded.key
  if (!opts.force) {
    const cached = loaded.data
    const adviceRaw = cached?.advice
    if (adviceRaw && typeof adviceRaw === 'object') {
      const sections = mapSuggestions((adviceRaw).sections)
      if (sections.length) return { lift: clampLift((adviceRaw).lift), sections }
    }
  }
  const lines = score.situations.map((item) => `${item.name}：${item.now}`).join('\n')
  const j = await askJson(
    opts.askText,
    adviceSystem(spec),
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
  shopEvalScopeOf,
  shopEvalGrades,
  parseShopEvalJson,
  shopEvalGrade,
  platformShopEvalMeta,
  describeShopEvalBasis,
  previewShopGains,
  formatVerifyYuan,
  resolveShopEvalFromStores,
  readSavedShopEval,
  evaluateShop,
  adviseShop,
  shopEvalGainTargets,
}
