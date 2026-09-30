const EVAL_BLOCK_NAMES = ['商品信息', '运营节奏', '品牌视觉', '流量分布', 'GEO 投喂', '财务明晰']
const LEVEL_A_BLOCKS = ['品牌视觉', '流量分布', 'GEO 投喂']
const LEVEL_B_BLOCKS = ['商品信息', '运营节奏', '财务明晰']

function evalBlocks(weights) {
  return EVAL_BLOCK_NAMES.map((name, index) => ({ name, weight: weights[index] }))
}

const PLATFORM_SPECS = {
  douyin: {
    id: 'douyin',
    name: '抖音来客',
    scope: 'single',
    scene: '按抖音来客打分。六项都是商家 ERP 里的功能：商品信息、运营节奏、品牌视觉、流量分布、GEO 投喂、财务明晰。',
    blocks: evalBlocks([20, 15, 15, 15, 15, 20]),
    risk: 20,
    riskNote: '套餐价格和核销对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  meituan: {
    id: 'meituan',
    name: '美团点评',
    scope: 'single',
    scene: '按美团点评打分。商品信息和财务明晰权重大于视觉和 GEO。六项名称不变。',
    blocks: evalBlocks([25, 15, 10, 15, 10, 25]),
    risk: 20,
    riskNote: '套餐价格和核销对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    scope: 'single',
    scene: '按小红书打分。品牌视觉和运营节奏权重大于商品信息和财务。六项名称不变。',
    blocks: evalBlocks([15, 20, 20, 15, 15, 15]),
    risk: 20,
    riskNote: '视觉和门店对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  kuaishou: {
    id: 'kuaishou',
    name: '快手团购',
    scope: 'single',
    scene: '按快手团购打分。六项都是商家 ERP 里的功能，权重与抖音来客相同。',
    blocks: evalBlocks([20, 15, 15, 15, 15, 20]),
    risk: 20,
    riskNote: '挂载和门店无关、价格和核销不符、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
}

const CHAIN_OVERLAYS = {
  douyin: {
    scene: '按抖音来客连锁品牌打分。六项名称与单店相同，多看各店商品、视觉、流量和财务是否统一。看不出统一的项记为未完善。',
    riskNote: '各店套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  meituan: {
    scene: '按美团点评连锁品牌打分。六项名称与单店相同，商品和财务权重更高，并看各店是否统一。',
    riskNote: '各店套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  xiaohongshu: {
    scene: '按小红书连锁品牌打分。六项名称与单店相同，视觉和运营权重更高，并看各店是否统一。',
    riskNote: '各店视觉口径打架、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  kuaishou: {
    scene: '按快手团购连锁品牌打分。六项名称与单店相同，多看各店是否统一。',
    riskNote: '挂载和分店无关、同套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
}

const SHOP_EVAL_PLATFORMS = [
  { id: 'douyin', name: '抖音来客' },
  { id: 'meituan', name: '美团点评' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手团购' },
]

const SHOP_EVAL_GRADES_SINGLE = [
  { key: 'ready', range: '85~100', label: '经营稳健', note: '六项功能里，商品和已经接上的经营动作比较齐' },
  { key: 'tune', range: '70~84', label: '转化偏弱', note: '店能被看见，运营、流量或财务还没接上' },
  { key: 'fill', range: '55~69', label: '资料偏薄', note: '多项功能还是未完善，获客动作有限' },
  { key: 'build', range: '＜55', label: '形象未立', note: '功能大多未完善，还没形成可经营的闭环' },
]

const SHOP_EVAL_GRADES_CHAIN = [
  { key: 'ready', range: '85~100', label: '品牌成型', note: '六项功能在各店比较统一，分店能被看见、能核销' },
  { key: 'tune', range: '70~84', label: '协同不足', note: '品牌能见客，分店之间功能还没对齐' },
  { key: 'fill', range: '55~69', label: '分店偏散', note: '多家店的商品、视觉或财务还没统一' },
  { key: 'build', range: '＜55', label: '品牌未立', note: '连锁功能大多未完善，还没形成统一形象' },
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
    functionCoverage(row),
  ].join('\n')
}

function functionCoverage(row) {
  const offer = [row.offerName, row.offerPrice].filter(Boolean).join(' ')
  const product = offer
    ? `商品信息：已有套餐 ${offer}。商品库和菜单图文本次未接入，不要写成图文已齐。`
    : '商品信息：未完善。没有套餐名称和价格。'
  return [
    product,
    '运营节奏：未完善。活动中心、达人招募、AI 运营方案、评价管理本次未接入。',
    '品牌视觉：未完善。店铺装修和 AI 视觉工坊本次未接入。',
    '流量分布：未完善。店铺分析、投流、线索本次未接入。',
    'GEO 投喂：未完善。GEO 运营优化和知识库本次未接入。',
    '财务明晰：未完善。财务对账和报税管理本次未接入。',
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
    '只根据下面列出的功能完成度打分。标成「未完善」的功能，points 必须在 0 到 20，不要编造成已经在用。',
    '商品信息如果只有套餐名称或价格，points 不要超过 55。',
    '不要写「公开资料不足」「仅供参考」「不是官方」「弱预估」这类提示句。',
    '只输出一个 JSON 对象，不要 Markdown。键名必须用英文双引号，最后一项后面不要逗号。',
    `blocks 为数组，必须正好 6 项，每项含 name、points。points 为 0 到 100 的整数。name 必须是：${names}。`,
    `risk 为 0 到 ${spec.risk} 的整数，表示风险扣分。扣分依据：${spec.riskNote}。没有实锤不要乱扣。`,
    `同时输出 score，为 0 到 100 的整数，按这些权重合成后再扣 risk：${weights}。`,
    `situations 必须正好 6 项，顺序与 blocks 一致。每项含 name、now。now 不超过 40 字，只写现状。未完善的项，now 以「未完善」开头。`,
    'exposureLift 为整改后预计多出来的被搜到/展示百分比，整数 8 到 60，不要写百分号。',
    'verifyLift 为整改后预计每月多带来的核销金额，单位元的整数。按已填套餐价格估算增量，没有价格不要编造当前已成交额。',
  ].join('')
}

function adviceSystem(spec) {
  return [
    '你是豆包。这是商家自己看的门店体检，按现状写给商家的改法，用「你」来写。',
    spec.scope === 'chain'
      ? '对象是连锁品牌。建议要落到各店把同一项功能补齐、对齐，不要把未完善写成已经统一。'
      : '对象是单门店。建议要落到这家店对应的 ERP 功能，未完善的项写去哪里补。',
    '不要编造销量、核销额、GMV。未在资料里出现的数字不要写进来。',
    '不要写「公开资料不足」「仅供参考」「无法判断」这类提示句。',
    '只输出一个 JSON 对象，不要 Markdown。',
    '字段：lift 为整改后综合分预计提升的百分比，整数，范围 5 到 35，不要写百分号。',
    '字段：sections 必须正好 6 项。每项含 name、finding、adjust、soon。',
    'name 必须与六项打分完全一致：商品信息、运营节奏、品牌视觉、流量分布、GEO 投喂、财务明晰。',
    'finding 是分析结果：这个板块现在卡在哪里、原因是什么，60 到 100 字。',
    'adjust 是怎么调整：去对应的 ERP 功能里补哪一项，改完应看到什么，80 到 160 字。',
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
    .slice(0, 6)
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
    .slice(0, 6)
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
