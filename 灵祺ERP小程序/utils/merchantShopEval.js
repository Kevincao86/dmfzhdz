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
  { key: 'ready', range: '80~100', label: '商圈头部', note: '套餐、内容和口碑在同商圈公开渠道上比较稳' },
  { key: 'tune', range: '70~79', label: '优质门店', note: '有线上获客能力，套餐结构、自有内容或口碑还有短板' },
  { key: 'fill', range: '55~69', label: '竞争力偏弱', note: '公网上能看见店，但下单规模、内容或口碑还没站住' },
  { key: 'build', range: '＜55', label: '公域尚未成型', note: '套餐、内容、口碑里多项在公开渠道上还看不清' },
]

const SHOP_EVAL_GRADES_CHAIN = [
  { key: 'ready', range: '80~100', label: '品牌口碑稳', note: '各店公开口碑比较齐，内容和套餐没有明显打架' },
  { key: 'tune', range: '70~79', label: '品牌能被看见', note: '品牌有内容或套餐，但舆情离散或标准化还没齐' },
  { key: 'fill', range: '55~69', label: '分店口碑不齐', note: '有门店的公开差评或价格带在拖品牌' },
  { key: 'build', range: '＜55', label: '品牌尚未成型', note: '公开渠道上还看不出统一的套餐、内容和口碑' },
]

const PUBLIC_EVAL_SINGLE = [
  { name: '套餐预估下单规模', weight: 20 },
  { name: '套餐结构与价格竞争力', weight: 15 },
  { name: '公域流量与内容供给', weight: 20 },
  { name: '线上运营执行力', weight: 15 },
  { name: '门店口碑与舆情风险', weight: 20 },
  { name: '门店基础与可信度', weight: 10 },
]

const PUBLIC_EVAL_CHAIN = [
  { name: '品牌全域套餐预估下单规模', weight: 15 },
  { name: '价格体系与内卷控制', weight: 15 },
  { name: '品牌内容与达人矩阵', weight: 20 },
  { name: '标准化与运营一致性', weight: 15 },
  { name: '品牌口碑与跨店舆情风险', weight: 25 },
  { name: '品牌基础与规模可信度', weight: 10 },
]

const SHOP_EVAL_DISCLAIMER = {
  single:
    '六维打分只依据公网前台，预估下单不是核销、营收或利润，只适合同商圈对比。绑定商家后台后的提升方案另读订单、套餐和退款，不能用于财务结算或业绩考核。',
  chain:
    '六维打分只依据公网前台。连锁看各店口碑是否被某一家拖累、价格是否内卷、内容是否覆盖到店。绑定商家后台后的提升方案另读订单、套餐和退款，不能用于财务结算或业绩考核。',
}

function publicEvalIndicators(scope) {
  return scope === 'chain' ? PUBLIC_EVAL_CHAIN : PUBLIC_EVAL_SINGLE
}

const SHOP_EVAL_GRADES = SHOP_EVAL_GRADES_SINGLE

function shopEvalScopeOf(raw) {
  if (raw && raw.evalFocus === 'store') return 'single'
  if (raw && (raw.evalFocus === 'brand' || raw.scope === 'chain' || Number(raw.storeCount) >= 2)) return 'chain'
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

function lineText(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text.indexOf('[object Object]') >= 0 ? '' : text
  }
  if (Array.isArray(value)) return value.map(lineText).filter(Boolean).join('，')
  if (!value || typeof value !== 'object') return ''
  const keys = ['text', 'content', 'comment', 'point', 'title', 'desc', 'description', 'finding', 'summary', 'now', 'detail', 'value', 'highlight', 'gap']
  for (const key of keys) {
    const hit = lineText(value[key])
    if (hit) return hit
  }
  return Object.keys(value)
    .map((key) => lineText(value[key]))
    .filter(Boolean)
    .join('，')
}

function clipText(value, max) {
  return lineText(value).slice(0, max)
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
      category: String((raw && raw.category) || '').trim(),
      mapNote: String((raw && raw.mapNote) || '').trim(),
      publicNote: String((raw && raw.publicNote) || '').trim(),
      evalFocus: raw && (raw.evalFocus === 'brand' || raw.evalFocus === 'store') ? raw.evalFocus : '',
      storeId: String((raw && raw.storeId) || '').trim(),
      signals: raw && raw.signals,
      backendFacts: String((raw && raw.backendFacts) || '').trim(),
    },
  }
}

function filledOr(value, empty) {
  return value || empty
}

function describeShopBackend(summary, adviceFacts, range) {
  const s = summary && typeof summary === 'object' ? summary : {}
  const num = (key) => {
    const n = Number(s[key])
    return Number.isFinite(n) ? n : 0
  }
  const pct = (key) => {
    const n = num(key)
    return n > 0 && n <= 1 ? Math.round(n * 100) + '%' : String(n)
  }
  const rowsOf = (key) => (Array.isArray(s[key]) ? s[key] : [])
  const sales = rowsOf('topBySales')
    .slice(0, 5)
    .map((row) => String((row && row.name) || '套餐') + ' ' + Math.round(Number(row && row.salesYuan) || 0) + '元/' + Math.round(Number(row && row.couponCount) || 0) + '份')
  const refunds = rowsOf('topByRefund')
    .slice(0, 3)
    .map((row) => String((row && row.name) || '套餐') + ' 退款' + Math.round(Number(row && row.refundYuan) || 0) + '元')
  return [
    range ? '统计区间：' + range : '',
    '订单 ' + num('orderCount') + '，券 ' + num('couponCount') + '，成交 ' + Math.round(num('salesAmountYuan')) + ' 元，退款 ' + Math.round(num('refundAmountYuan')) + ' 元，退款率 ' + pct('refundRate') + '，购买人数 ' + num('buyerCount') + '，新客 ' + num('newBuyerCount') + '，老客 ' + num('oldBuyerCount') + '，复购率 ' + pct('repurchaseRate') + '。',
    sales.length ? '成交靠前套餐：' + sales.join('；') : '成交靠前套餐：这段时间没有套餐成交排名。',
    refunds.length ? '退款靠前套餐：' + refunds.join('；') : '',
    String(adviceFacts || '').trim().slice(0, 1600),
  ]
    .filter(Boolean)
    .join('\n')
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
    `电话：${filledOr(row.phone, '商家档案未填。公开检索里有这一家的号码就写入线上运营')}`,
    `营业时间：${filledOr(row.businessHours, '商家档案未填。公开检索里有这一家的钟点就写入线上运营。不要把店名里的24时当成营业时间')}`,
    `主推套餐：${filledOr(row.offerName, '未填写')}`,
    `套餐价格：${filledOr(row.offerPrice, /\d+\s*元|套餐/.test(String(row.publicNote || '')) ? '公开检索里已经有团购价格，写进套餐竞争力，禁止写成未上架' : '未填写，不要编造')}`,
    `经营分类：${filledOr(row.category, '未填写')}`,
    `评估范围：${row.evalFocus === 'brand' ? '用户指定按总品牌' : row.evalFocus === 'store' ? '用户指定只分析这一家绑定门店' : '未指定'}`,
    `高德定位：${filledOr(row.mapNote, '未返回')}`,
    `公开检索：${filledOr(row.publicNote, '未返回')}`,
    functionCoverage(row),
    row.signals ? signalFacts(row.signals) : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function signalFacts(s) {
  return [
    `商品接口：共 ${s.productTotal} 个，有价格 ${s.productPriced} 个，有头图 ${s.productWithImage} 个。`,
    `评价接口：${s.reviewTotal} 条，已回复 ${s.reviewReplied} 条。活动接口：${s.activityTotal} 个。`,
    `装修接口：${s.decorationTotal} 家，有封面 ${s.decorationWithCover} 家。`,
    `经营接口：本平台成交 ${Math.round(s.payAmount)} 元，核销 ${Math.round(s.verifyAmount)} 元，订单 ${s.orderCount}。其他平台成交 ${Math.round(s.otherPlatformPay)} 元。投流展示 ${s.adShow}，线索 ${s.clueCount}。`,
    `知识库接口：${s.kbTotal} 份，已开启投喂 ${s.kbFeeding} 份。`,
    `财务接口：对账 ${s.financeRows} 条，核销 ${Math.round(s.financeVerify)} 元，退款 ${Math.round(s.financeRefund)} 元。`,
    '以上数字来自接口。为 0 的项写成未完善。有数字的项按数字写现状，不要改成未完善。',
  ].join('\n')
}

function functionCoverage(row) {
  if (row.signals) return ''
  const offer = [row.offerName, row.offerPrice].filter(Boolean).join(' ')
  const publicOffer = /\d+\s*元|套餐/.test(String(row.publicNote || ''))
  const product = offer
    ? `商品信息：已有套餐 ${offer}。商品库和菜单图文本次未接入，不要写成图文已齐。`
    : publicOffer
      ? '套餐竞争力：公开检索里已经有团购套餐和价格。必须写出套餐和价格，禁止写成未上架、暂未上架、没有套餐。'
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
        name: clipText(item.name, 24),
        finding: clipText(item.finding, 140),
        adjust,
        soon: clipText(item.soon, 180),
        next: adjust,
        module: clipText(item.module, 16),
      }
    })
    .filter((row) => row.name && (row.finding || row.adjust || row.soon))
    .slice(0, 6)
}

function alignAdviceSections(sections, names) {
  const used = {}
  const aligned = []
  for (let n = 0; n < names.length; n += 1) {
    const name = names[n]
    let idx = -1
    for (let i = 0; i < sections.length; i += 1) {
      if (used[i]) continue
      const got = sections[i].name
      if (got === name || name.indexOf(got) === 0) {
        idx = i
        break
      }
    }
    if (idx < 0) return []
    used[idx] = true
    aligned.push(Object.assign({}, sections[idx], { name }))
  }
  return aligned
}

function ownerId() {
  try {
    return String(wx.getStorageSync('meoo_active_tenant_id') || '').trim()
  } catch (e) {
    return ''
  }
}

function slotId(row) {
  const base = [row.platformId, row.storeName, row.address, row.category].join('|')
  if (row.evalFocus === 'brand') return ['brand', row.brandName, base].join('|')
  if (row.evalFocus === 'store') return ['store', row.storeId || row.storeName, base].join('|')
  return base
}

function cacheKey(row) {
  return ['lq_merchant_shop_eval_v8', ownerId(), slotId(row)].join('|')
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
  return { key, data: readCache(storage, key) }
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

function namedInOrder(rows) {
  if (!Array.isArray(rows) || rows.length !== EVAL_BLOCK_NAMES.length) return false
  return EVAL_BLOCK_NAMES.every((name, index) => {
    const item = rows[index]
    return item && String(item.name || '').trim() === name
  })
}

function blankSignals() {
  return {
    productTotal: 0,
    productPriced: 0,
    productWithImage: 0,
    reviewTotal: 0,
    reviewReplied: 0,
    activityTotal: 0,
    decorationTotal: 0,
    decorationWithCover: 0,
    payAmount: 0,
    verifyAmount: 0,
    orderCount: 0,
    otherPlatformPay: 0,
    clueCount: 0,
    adShow: 0,
    kbTotal: 0,
    kbFeeding: 0,
    financeVerify: 0,
    financeRefund: 0,
    financeRows: 0,
  }
}

function pointsOf(value, weight) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > weight) return Math.round((Math.min(100, n) / 100) * weight)
  return Math.min(weight, n)
}

function scopeFromCached(cached) {
  const profile = cached && cached.profile
  if (profile && typeof profile === 'object') {
    if (profile.evalFocus === 'store') return 'single'
    if (profile.evalFocus === 'brand' || profile.scope === 'chain' || Number(profile.storeCount) >= 2) return 'chain'
  }
  const names = {}
  const rows = cached && Array.isArray(cached.indicators) ? cached.indicators : []
  for (const row of rows) names[String((row && row.name) || '')] = true
  if (PUBLIC_EVAL_CHAIN.some((block) => names[block.name])) return 'chain'
  return 'single'
}

function normIndicatorName(value) {
  return String(value || '').replace(/（\s*满分\s*\d+\s*）/g, '').replace(/[（）()\s&＆:：]/g, '')
}

function indicatorRows(rows) {
  if (Array.isArray(rows)) return rows.filter((row) => row && typeof row === 'object')
  if (rows && typeof rows === 'object') {
    return Object.keys(rows).map((key) => {
      const value = rows[key]
      if (value && typeof value === 'object' && !Array.isArray(value)) return Object.assign({ name: key }, value)
      return { name: key, points: value }
    })
  }
  return []
}

function mapIndicators(rows, blocks) {
  const parsed = indicatorRows(rows)
  const list = blocks || []
  const used = {}
  const hits = {}
  const takeBlock = (name) => {
    const text = normIndicatorName(name)
    const pool = list.filter((block) => !used[block.name])
    const exact = pool.find((block) => normIndicatorName(block.name) === text)
    if (exact) return exact
    const ranked = pool
      .map((block) => ({ block, key: normIndicatorName(block.name) }))
      .filter((item) => item.key.length >= 4 && (text.indexOf(item.key) >= 0 || item.key.indexOf(text) >= 0))
      .sort((a, b) => b.key.length - a.key.length)
    return ranked[0] && ranked[0].block
  }
  parsed.forEach((item, index) => {
    const rawName = clipText(item.name, 80)
    const block = (rawName && takeBlock(rawName)) || (parsed.length === list.length ? list[index] : null)
    if (!block || used[block.name]) return
    used[block.name] = true
    hits[block.name] = {
      points: pointsOf(item.points != null ? item.points : item.score, block.weight),
      comment: clipText(item.comment || item.now || item.reason || item.detail || item['点评'], 220) || '这项按公开检索打分。',
    }
  })
  return list
    .map((block) => {
      const hit = hits[block.name]
      if (!hit) return null
      const score = Math.min(block.weight, hit.points)
      return {
        name: block.name,
        score,
        weight: block.weight,
        pct: Math.round((score / block.weight) * 100),
        comment: hit.comment,
      }
    })
    .filter(Boolean)
}

function textList(rows, limit, maxLen) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => clipText(row, maxLen))
    .filter(Boolean)
    .slice(0, limit)
}

function collapsedChainText(text, storeCount) {
  if (storeCount < 2) return false
  return /单门店|完全空白|形象未立|基本空白/.test(String(text || ''))
}

function brandScoreLow(raw) {
  const rows = Array.isArray(raw && raw.indicators) ? raw.indicators : []
  for (const row of rows) {
    if (!row || String(row.name || '') !== '品牌口碑与跨店舆情风险') continue
    return pointsOf(row.points != null ? row.points : row.score, 30) < 12
  }
  return false
}

function speakEstimate(text) {
  return String(text || '')
    .replace(/公开渠道未[^，。；]*/g, '按同城同品类估算')
    .replace(/公网未[^，。；]*/g, '按同城同品类估算')
    .replace(/没有检索到[^，。；]*/g, '按同城同品类估算')
    .replace(/未检索到[^，。；]*/g, '按同城同品类估算')
    .replace(/没有找到[^，。；]*/g, '按同城同品类估算')
    .replace(/检索不到[^，。；]*/g, '按同城同品类估算')
    .replace(/查不到[^，。；]*/g, '按同城同品类估算')
    .replace(/没查到[^，。；]*/g, '按同城同品类估算')
    .replace(/无公开团购或探店记录/g, '按同城同品类和门店规模估算')
    .replace(/线上经营几乎空白|线上完全空白|线上空白/g, '线上内容仍有提升空间')
}

function scoreFromPublic(raw, indicators, blocks, scope) {
  const byName = {}
  for (const row of indicators) byName[row.name] = row.score
  let sum = 0
  for (const block of blocks) sum += byName[block.name] || 0
  const highlights = textList(raw.highlights, 3, 140).map(speakEstimate)
  const gaps = textList(raw.gaps, 4, 160).map(speakEstimate)
  const shown = indicators.map((row) => Object.assign({}, row, { comment: speakEstimate(row.comment) }))
  return {
    score: clampScore(sum),
    searchLevel: '',
    verifyLevel: '',
    situations: shown.map((row) => ({ name: row.name, now: row.comment })),
    exposureLift: 0,
    verifyLift: 0,
    positioning: speakEstimate(clipText(raw.positioning, 180)),
    indicators: shown,
    highlights,
    gaps,
    summary: speakEstimate(clipText(raw.summary, 100)),
    sources: textList(raw.sources, 8, 80),
    disclaimer: SHOP_EVAL_DISCLAIMER[scope] || SHOP_EVAL_DISCLAIMER.single,
  }
}

function profileFromRow(row) {
  const focus = row && (row.evalFocus === 'brand' || row.evalFocus === 'store') ? row.evalFocus : ''
  const storeCount = focus === 'store' ? 1 : Math.max(0, Math.round(Number(row && row.storeCount) || 0))
  return {
    storeCount,
    scope: focus === 'store' ? 'single' : focus === 'brand' || (row && row.scope) === 'chain' || storeCount >= 2 ? 'chain' : 'single',
    storeNames: String((row && row.storeNames) || ''),
    brandName: String((row && row.brandName) || ''),
    storeName: String((row && row.storeName) || ''),
    address: String((row && row.address) || ''),
    category: String((row && row.category) || ''),
    evalFocus: focus,
    storeId: String((row && row.storeId) || ''),
  }
}

function savedFromCache(cached) {
  if (!cached || cached.sourcesSearch !== 'store-search-v8') return null
  const blocks = publicEvalIndicators(scopeFromCached(cached))
  const indicators = mapIndicators(cached.indicators, blocks)
  if (indicators.length !== blocks.length) return null
  const adviceRaw = cached.advice
  let advice = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray(adviceRaw.sections)) {
    const sections = alignAdviceSections(
      mapSuggestions(adviceRaw.sections),
      indicators.map((item) => item.name),
    )
    if (sections.length === indicators.length) advice = { lift: clampLift(adviceRaw.lift), sections }
  }
  const rawProfile = cached.profile && typeof cached.profile === 'object' ? cached.profile : null
  return {
    score: scoreFromPublic(cached, indicators, blocks, scopeFromCached(cached)),
    advice,
    profile: rawProfile ? profileFromRow(rawProfile) : null,
  }
}

function shopEvalGrade(score, scope) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  const grades = shopEvalGrades(scope)
  if (n >= 80) return grades[0]
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
  if (row.category) bits.push(row.category)
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

function stripStoreSuffix(title) {
  const text = String(title || '').trim()
  const paren = text.match(/^(.+?)[（(]([^)）]{1,24}店)[)）]\s*$/)
  if (paren && paren[1] && paren[1].trim()) return paren[1].trim()
  const dot = text.match(/^(.+?)[·•—－-]([^·•—－-]{1,24}店)\s*$/)
  if (dot && dot[1] && dot[1].trim() && dot[1].trim().length >= 2) return dot[1].trim()
  return text
}

function inferBoundBrandLabel(store) {
  const fromName = stripStoreSuffix(store && store.name)
  const fromApi = stripStoreSuffix(store && store.brandName)
  if (fromApi && fromName && fromApi !== fromName && fromName.indexOf(fromApi) === 0) return fromApi
  return fromName || fromApi
}

function boundEvalBrandTarget(stores) {
  const list = (Array.isArray(stores) ? stores : []).filter((store) => String(store && store.name ? store.name : '').trim())
  const groups = {}
  const labels = {}
  list.forEach((store) => {
    const label = inferBoundBrandLabel(store)
    const key = label.toLowerCase().replace(/\s+/g, '')
    if (!groups[key]) groups[key] = []
    groups[key].push(store)
    labels[key] = label
  })
  let bestKey = ''
  let best = []
  Object.keys(groups).forEach((key) => {
    if (groups[key].length > best.length) {
      best = groups[key]
      bestKey = key
    }
  })
  const members = best.length >= 2 ? best : list
  const brandName = String((best.length >= 2 ? labels[bestKey] : '') || labels[bestKey] || (list[0] && list[0].name) || '').trim()
  return {
    brandName,
    storeCount: members.length,
    storeNames: members
      .slice(0, 8)
      .map((store) => String(store.name || '').trim())
      .filter(Boolean)
      .join('、'),
    anchor: members[0] || null,
  }
}

function splitCnRegion(address, cityHint) {
  let rest = String(address || '').replace(/\s+/g, '')
  let province = ''
  let city = ''
  let district = ''
  const provinceMatch = rest.match(/^(.+?(?:省|自治区|特别行政区))/)
  if (provinceMatch) {
    province = provinceMatch[1]
    rest = rest.slice(province.length)
  }
  const cityMatch = rest.match(/^(.+?(?:市|自治州|地区|盟))/)
  if (cityMatch) {
    city = cityMatch[1]
    rest = rest.slice(city.length)
  }
  const districtMatch = rest.match(/^(.+?(?:区|县|旗))/)
  if (districtMatch) {
    district = districtMatch[1]
    rest = rest.slice(district.length)
  }
  if (!province && /^(北京市|上海市|天津市|重庆市)/.test(city)) province = city
  if (!city && cityHint) city = String(cityHint).trim()
  return { province, city, district, detail: rest }
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

function yuanBrief(n) {
  const v = Math.round(Number(n) || 0)
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return String(v)
}

function productPoints(s) {
  if (s.productTotal <= 0) return 12
  const priceRate = s.productPriced / s.productTotal
  const imageRate = s.productWithImage / s.productTotal
  if (priceRate >= 0.5 && imageRate >= 0.4) return 88
  if (priceRate >= 0.5) return 72
  if (s.productPriced > 0) return 55
  return 32
}

function rhythmPoints(s) {
  if (s.reviewTotal <= 0 && s.activityTotal <= 0) return 12
  let points = s.reviewTotal > 0 ? 58 : 36
  if (s.reviewReplied > 0) points += 12
  if (s.activityTotal > 0) points += 18
  return Math.min(92, points)
}

function visualPoints(s) {
  if (s.decorationTotal <= 0) return 12
  const rate = s.decorationWithCover / s.decorationTotal
  if (rate >= 0.6) return 88
  if (s.decorationWithCover > 0) return 62
  return 28
}

function trafficPoints(s) {
  const hasTrade = s.payAmount > 0 || s.orderCount > 0 || s.verifyAmount > 0
  if (!hasTrade && s.otherPlatformPay <= 0 && s.clueCount <= 0 && s.adShow <= 0) return 12
  if (!hasTrade) return 48
  let points = 60
  if (s.verifyAmount > 0) points += 15
  if (s.otherPlatformPay > 0 && s.payAmount > 0) points += 10
  return Math.min(92, points)
}

function geoPoints(s) {
  if (s.kbTotal <= 0) return 12
  if (s.kbFeeding <= 0) return 42
  return Math.min(90, 70 + Math.min(20, s.kbFeeding * 4))
}

function financePoints(s) {
  const verify = Math.max(s.financeVerify, s.verifyAmount)
  if (s.financeRows <= 0 && verify <= 0 && s.financeRefund <= 0) return 12
  if (verify > 0 && (s.financeRefund > 0 || s.financeRows > 0)) return 86
  if (verify > 0) return 68
  return 40
}

function scoreFromSignals(spec, signals, offerPrice) {
  const blocks = [
    { name: '商品信息', points: productPoints(signals) },
    { name: '运营节奏', points: rhythmPoints(signals) },
    { name: '品牌视觉', points: visualPoints(signals) },
    { name: '流量分布', points: trafficPoints(signals) },
    { name: 'GEO 投喂', points: geoPoints(signals) },
    { name: '财务明晰', points: financePoints(signals) },
  ]
  const computed = scoreFromBlocks(spec, blocks, 0)
  const nowOf = {
    商品信息:
      signals.productTotal > 0
        ? `商品 ${signals.productTotal} 个，${signals.productPriced} 个有价格，${signals.productWithImage} 个有头图`
        : '未完善，商品列表没有套餐',
    运营节奏:
      signals.reviewTotal > 0 || signals.activityTotal > 0
        ? `评价 ${signals.reviewTotal} 条，已回复 ${signals.reviewReplied} 条，活动 ${signals.activityTotal} 个`
        : '未完善，评价和活动都没有读到',
    品牌视觉:
      signals.decorationTotal > 0
        ? `装修 ${signals.decorationTotal} 家，${signals.decorationWithCover} 家有封面`
        : '未完善，装修列表没有门店封面',
    流量分布:
      signals.payAmount > 0 || signals.orderCount > 0
        ? `本平台成交 ${yuanBrief(signals.payAmount)} 元，其他平台 ${yuanBrief(signals.otherPlatformPay)} 元`
        : signals.clueCount > 0 || signals.adShow > 0
          ? `投流展示 ${signals.adShow}，线索 ${signals.clueCount}，成交还没读到`
          : '未完善，店铺分析没有成交',
    'GEO 投喂':
      signals.kbTotal > 0
        ? signals.kbFeeding > 0
          ? `知识库 ${signals.kbTotal} 份，${signals.kbFeeding} 份已开启投喂`
          : `知识库 ${signals.kbTotal} 份，还没开启投喂`
        : '未完善，知识库没有可投喂资料',
    财务明晰:
      Math.max(signals.financeVerify, signals.verifyAmount) > 0 || signals.financeRows > 0
        ? `核销 ${yuanBrief(Math.max(signals.financeVerify, signals.verifyAmount))} 元，退款 ${yuanBrief(signals.financeRefund)} 元`
        : '未完善，对账没有核销和退款',
  }
  const situations = blocks.map((block) => ({
    name: block.name,
    now: String(nowOf[block.name] || '').slice(0, 40),
  }))
  const preview = previewShopGains((computed && computed.score) || 0, offerPrice)
  return {
    score: (computed && computed.score) || 0,
    searchLevel: (computed && computed.searchLevel) || '',
    verifyLevel: (computed && computed.verifyLevel) || '',
    situations,
    exposureLift: preview.exposurePct,
    verifyLift: preview.verifyYuan,
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSogouTitles(html) {
  const out = []
  const re = /<h3 class="vr-title[\s\S]*?<\/h3>/gi
  let block = re.exec(html)
  while (block) {
    const title = stripTags(block[0]).slice(0, 80)
    if (title.length >= 6 && out.indexOf(title) < 0) out.push(title)
    if (out.length >= 6) break
    block = re.exec(html)
  }
  return out
}

function httpGet(url) {
  return new Promise((resolve) => {
    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url,
        timeout: 12000,
        header: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        },
        success(res) {
          resolve(typeof res.data === 'string' ? res.data : '')
        },
        fail() {
          resolve('')
        },
      })
      return
    }
    if (typeof fetch === 'function') {
      fetch(url)
        .then((res) => res.text())
        .then(resolve)
        .catch(() => resolve(''))
      return
    }
    resolve('')
  })
}

function keepNoteLine(line) {
  if (line.length < 6) return false
  if (/\d+\s*元|套餐|评价|探店|团购|人均|已售|月售|点评/.test(line)) return true
  return !/暂未检索|未检索到|没有找到|无法查询|无公开/.test(line)
}

async function doubaoPublicNotes(askText, row) {
  const name = row.brandName || row.storeName
  const core = brandCore(name)
  const rounds = [
    {
      system: [
        '你在用方舟联网检索这个品牌。每条一行，最多 12 行。',
        '要写套餐名、价格、已售或月售、评价说法、探店或短视频。数字按检索原文写。',
        '店名里的「24时」不要当成全天营业。其他分店的电话不要安到被点名的这一家。',
      ].join(''),
      user:
        '品牌：' +
        name +
        '\n城市：' +
        (row.city || '') +
        '\n地址：' +
        (row.address || '') +
        '\n分类：' +
        (row.category || '') +
        '\n同城同名：' +
        (row.storeCount || 0) +
        '家\n请检索团购、美团、大众点评、抖音探店和评价。',
    },
    {
      system: [
        '上一轮材料还不够。继续检索品牌简称、抖音团购、美团、大众点评，以及同城同品类的套餐价格和评价。',
        '每条开头标明「本店」或「同城同品类」。最多 12 行。有价格和评价就写上。',
      ].join(''),
      user:
        '品牌简称：' +
        (core || name) +
        '\n城市：' +
        (row.city || '') +
        '\n分类：' +
        (row.category || '') +
        '\n请把能对上这个品牌的套餐、评价、探店，以及同城同品类可对照的价格带都写出来。',
    },
  ]
  const lines = []
  for (const round of rounds) {
    if (lines.length >= 8) break
    try {
      const text = await askText(round.system, round.user, { webSearch: true })
      const parts = String(text || '').split('\n')
      for (const line of parts) {
        const clean = line.replace(/^\d+[.、]\s*/, '').trim()
        if (!keepNoteLine(clean) || lines.indexOf(clean) >= 0) continue
        lines.push(clean)
        if (lines.length >= 16) break
      }
    } catch (e) {
      /* 下一轮 */
    }
  }
  return lines.map((line, index) => index + 1 + '. ' + line).join('\n')
}

function brandCore(name) {
  return String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(南湖店|旗舰店|总店|分店)$/g, '')
    .replace(/店$/g, '')
    .replace(/[·•\s]/g, '')
    .trim()
}

function keepStoreTitle(title, core) {
  const text = String(title || '').trim()
  if (text.length < 8 || text.length > 140) return false
  if (/汉语词语|近义词|反义词|造句|百度百科|安全验证|搜狗搜索/.test(text)) return false
  if (core && core.length >= 2 && text.indexOf(core) < 0) return false
  return true
}

async function searchPublicBrand(row) {
  const core = brandCore(row.brandName || row.storeName)
  const name = row.brandName || row.storeName
  const city = row.city || ''
  const category = row.category || ''
  const preset = String(row.publicNote || '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => keepStoreTitle(line, core))
  const titles = preset.slice(0, 8)
  const brandQueries = [
    name + ' ' + city + ' 团购',
    name + ' 抖音 探店',
    row.storeName + ' 点评',
    core + ' ' + city + ' 美团 套餐',
    core + ' ' + city + ' 评价',
    name + ' 抖音 已售',
  ]
  const peerQueries = [category + ' ' + city + ' 团购 套餐', category + ' ' + city + ' 点评 人均']
  for (const query of brandQueries) {
    const q = query.replace(/\s+/g, ' ').trim()
    if (q.length < 2) continue
    const html = await httpGet('https://www.sogou.com/web?query=' + encodeURIComponent(q))
    for (const title of parseSogouTitles(html)) {
      if (!keepStoreTitle(title, core) || titles.indexOf(title) >= 0) continue
      titles.push(title)
    }
  }
  if (titles.length < 4) {
    for (const query of peerQueries) {
      const q = query.replace(/\s+/g, ' ').trim()
      if (q.length < 2) continue
      const html = await httpGet('https://www.sogou.com/web?query=' + encodeURIComponent(q))
      for (const title of parseSogouTitles(html)) {
        const line = '同城同品类：' + title
        if (!title || title.length < 8 || titles.indexOf(line) >= 0) continue
        titles.push(line)
        if (titles.length >= 16) return titles.slice(0, 16)
      }
    }
  }
  return titles.slice(0, 16)
}

function publicScoreSystem(scope) {
  const blocks = publicEvalIndicators(scope)
  const names = blocks.map((item) => `${item.name}（满分 ${item.weight}）`).join('、')
  const mode =
    scope === 'chain'
      ? [
          '这次用连锁品牌公网六维。口碑权重最高。不看单店多猛，看总量、单店均值和能不能复制。',
          '品牌全域套餐预估下单规模：看全部店的预估下单总量和单店均值，一家独大不能代表全品牌。',
          '价格体系与内卷控制：看各店套餐是否同价。门店之间低价互踩要重点扣分。',
          '品牌内容与达人矩阵：看品牌号、门店号、达人是否都有，内容有没有落到具体门店。单个账号爆款不等于矩阵。',
          '标准化与运营一致性：套餐能否跨店复用、主页信息是否统一、新店能不能按同一套上线。',
          '品牌口碑与跨店舆情风险是最高权重。一家店的卫生、安全类重大差评要大幅扣分，并写成会连累全品牌。',
          '品牌基础与规模可信度：高德同城同名家数、经营时长、资质和认证。这是抗风险底盘，不是销量。',
          '禁止写成单门店、形象未立、线上完全空白。',
        ]
      : [
          '这次用单门店公网六维。只评这一家。预估下单、内容供给、口碑各 20 分，运营和基础做支撑。',
          '套餐预估下单规模：按同商圈同品类给档位。主力套餐权重大于引流款。已售、月售按公网前台写，不是核销。',
          '套餐结构与价格竞争力：看价格带、引流款占比、套餐是否丰富、有没有上新。低价引流占比过高要扣分。只有一两个套餐且长期不更新要扣分。',
          '公域流量与内容供给：看探店达人、挂载短视频和直播。阶段性爆款不等于持续供给。',
          '线上运营执行力：看主页信息、套餐上下架、商家账号更新、差评有没有公开回复。',
          '门店口碑与舆情风险：卫生、安全类重大差评重扣。评价长期不动，按同品类口碑档位写，不写假条数。',
          '门店基础与可信度：资质、开业时长、定位是否对得上这家店、有没有品牌背书。新店信息少就按档位写，不要写成没有这家店。',
        ]
  return [
    '你在用公网前台资料给商家打相对竞争力分，用「你」来写。没有商家后台授权。',
    '分数是同商圈横向对比，不是真实核销、营收或利润。预估下单不能写成到店收入。',
    '检索原文里的套餐价、已售、月售、评价按原文写。原文没有这些数字时，用同城、同品类、连锁家数和同城同品类标题做档位估算，直接写出估算结论。',
    '估算用上游、中上、中游、偏弱，不要编造精确到个位的核销量，也不要写假的评价条数。',
    '点评、定位、优势、短板、总结里禁止出现：未检索到、没有检索到、公开渠道未、无公开、查不到、检索不到、线上空白、几乎空白。',
    '周边同类店用来对照价格带和内容档位，不能写成这家没有客流。不要编造距离。',
  ]
    .concat(mode)
    .concat([
      '只输出一个 JSON 对象，不要 Markdown。',
      'positioning：一句定位，40 到 90 字，写公开渠道上的位置和最明显的短板。',
      `indicators 必须是数组，正好 ${blocks.length} 项。name 只能逐字是：${blocks.map((item) => item.name).join('、')}。不要把「满分」写进 name。每项含 points（0 到该项满分的整数）和 comment（40 到 90 字，先写亮点，再写扣分）。参考满分：${names}。`,
      'highlights 正好 3 条，每一条都是字符串。每条 40 到 80 字。',
      'gaps 正好 4 条，每一条都是字符串。每条 40 到 90 字。',
      'summary：一句话总结，30 到 60 字。不要把预估下单写成盈利。',
    ])
    .join('')
}

function readShopEvalCloud(habits) {
  if (!habits || typeof habits !== 'object') return null
  const shopEval = habits.shopEval
  if (!shopEval || typeof shopEval !== 'object') return null
  return shopEval
}

function requestShopEvalCloud(method, data) {
  let merchant
  try {
    merchant = require('./merchantApi.js')
  } catch (e) {
    return Promise.resolve(null)
  }
  if (!merchant || !merchant.merchantRequestAuth) return Promise.resolve(null)
  return merchant
    .merchantRequestAuth(method, '/api/meoo-agent-user-state', { data, timeoutMs: 15000 })
    .then((body) => (body && body.ok !== false ? body : null))
    .catch(() => null)
}

async function publishShopEval(storage, key, slot) {
  const data = readCache(storage, key)
  if (!data) return
  const savedAt = String(data.savedAt || new Date().toISOString())
  const remote = await requestShopEvalCloud('GET')
  const prev = readShopEvalCloud(remote && remote.habits) || {}
  const platforms = Object.assign({}, prev.platforms || {})
  platforms[slot] = { savedAt, payload: data }
  await requestShopEvalCloud('POST', {
    habits: {
      shopEval: { updatedAt: savedAt, platforms },
      updatedAt: savedAt,
    },
  })
}

async function hydrateShopEval(raw, storage) {
  const { row } = normalizeInput(raw)
  const remote = await requestShopEvalCloud('GET')
  const fresh = loadCache(storage, row)
  const localAt = Date.parse(String((fresh.data && fresh.data.savedAt) || '')) || 0
  const cloud = readShopEvalCloud(remote && remote.habits)
  const slot = cloud && cloud.platforms ? cloud.platforms[slotId(row)] : null
  const remoteAt = Date.parse(String((slot && slot.savedAt) || '')) || 0
  if (slot && slot.payload && remoteAt > localAt && savedFromCache(slot.payload)) {
    storage.setItem(fresh.key, JSON.stringify(slot.payload))
    return savedFromCache(slot.payload)
  }
  if (fresh.data && savedFromCache(fresh.data) && localAt >= remoteAt && (localAt > remoteAt || remoteAt === 0)) {
    if (!localAt) writeCache(storage, fresh.key, { savedAt: new Date().toISOString() })
    void publishShopEval(storage, fresh.key, slotId(row))
  }
  return savedFromCache(fresh.data)
}

function erpAdviceSystem(focus) {
  const rangeRule =
    focus === 'store'
      ? '用户这次只提升这一家绑定门店。方案只写这一家，不要要求全品牌各店统一。'
      : focus === 'brand'
        ? '用户这次按总品牌提升。多家门店不统一时，写各店如何对齐。'
        : ''
  return [
    '你在给商家写灵祺 ERP 里能直接去做的改法，用「你」来写。',
    rangeRule,
    '六维分数来自公网，只用来指出短板。提升方案必须解读用户消息里的商家后台数据。',
    '后台里的订单、成交、退款、复购、套餐排名按原文引用。某项为 0 就写后台这段时间还没有这笔数，不要改成另一个数，也不要编造 GMV。',
    '不要把后台核销写成公网预估下单，也不要把公网预估写成已经核销。',
    '只能使用这些功能：商品与套餐、评价管理、店铺装修、活动中心、达人招募、店铺分析与投流、知识库与GEO投喂、财务对账、线索跟进。不要写系统里没有的会员储值、社群积分商城。',
    '套餐结构和价格写到商品与套餐、活动中心。内容和达人写到达人招募、店铺装修。口碑和差评回复写到评价管理。成交、退款、复购写到店铺分析与投流、财务对账。多店价格不统一写到商品与套餐。',
    '不要写「公开资料不足」「仅供参考」「无法判断」。',
    '只输出一个 JSON 对象。',
    'sections 必须正好 6 项，顺序与用户给出的六维一致，一项一个维度，不能只写分数低的。每项含 name、module、finding、adjust、soon。',
    'name 必须与六维名称逐字一致，不要另起标题。module 必须是上面列出的功能名。',
    'finding 先写后台读到的数字，再写它和这项短板的关系，60 到 120 字。',
    'adjust 写去哪个功能里改什么，改完应看到什么，80 到 160 字。',
    'soon 是近两周的 3 件事，用「1.」「2.」「3.」分开。',
  ].join('')
}

async function evaluateShop(raw, opts) {
  const { spec, row } = normalizeInput(raw)
  if (!row.storeName) throw new Error('请先完善门店名称')
  const loaded = loadCache(opts.storage, row)
  if (!opts.force) {
    const saved = savedFromCache(loaded.data)
    if (saved) return saved.score
  }
  const sources = await searchPublicBrand(row)
  const webNotes = await doubaoPublicNotes(opts.askText, row)
  const listed = sources.length ? sources.map((title, index) => `${index + 1}. ${title}`).join('\n') : ''
  const peerHint = '对照：城市 ' + (row.city || '未填') + '，品类 ' + (row.category || '未填') + '，同城同名 ' + (row.storeCount || 0) + ' 家。材料里没有套餐价或评价时，按这些做档位估算。'
  const material = [webNotes, listed, peerHint].filter(Boolean).join('\n')
  const blocks = publicEvalIndicators(spec.scope)
  const user = `${shopFacts(spec, row)}\n公开检索标题：\n${material}\n请按${spec.scope === 'chain' ? '连锁品牌' : '单门店'}六维模型给出定位、六项 points 和点评、三条优势、四条短板、一句话总结。`
  let j = await askJson(opts.askText, publicScoreSystem(spec.scope), user)
  if (spec.scope === 'chain' && (collapsedChainText(JSON.stringify(j), row.storeCount) || (row.storeCount >= 3 && brandScoreLow(j)))) {
    j = await askJson(
      opts.askText,
      publicScoreSystem('chain'),
      `${user}\n纠正：高德已给出同城同名门店 ${row.storeCount} 家，这是连锁品牌。重写定位、品牌口碑和套餐价格是否统一。禁止出现单门店、形象未立、线上完全空白。一家店的公开差评要体现在品牌口碑里，不要为了家数把口碑打高。`,
    )
  }
  if (spec.scope === 'chain' && row.storeCount >= 2 && collapsedChainText(`${j.positioning || ''}${j.summary || ''}`, row.storeCount)) {
    j.positioning = `高德在同城检索到 ${row.storeCount} 家同名门店。品牌已经被叫得上名，短板看各店套餐是否同价、公开口碑是否被某一家拖累。`
    j.summary = `同城已有 ${row.storeCount} 家同名门店，先核对套餐价格和各店公开口碑是否一致。`
  }
  let indicators = mapIndicators(j.indicators, blocks)
  if (indicators.length !== blocks.length) {
    j = await askJson(
      opts.askText,
      publicScoreSystem(spec.scope),
      `${user}\n上次指标名称不对。请重出 JSON。indicators 为数组，name 只能逐字是：${blocks.map((item) => item.name).join('、')}。不要把满分写进 name。每项都要有 points 和 comment。`,
    )
    indicators = mapIndicators(j.indicators, blocks)
  }
  if (indicators.length !== blocks.length) throw new Error('评估结果不完整，请再点一次')
  const score = scoreFromPublic(Object.assign({}, j, { sources }), indicators, blocks, spec.scope)
  writeCache(opts.storage, loaded.key, Object.assign({}, score, { sourcesSearch: 'store-search-v8', profile: profileFromRow(row), savedAt: new Date().toISOString() }))
  void publishShopEval(opts.storage, loaded.key, slotId(row))
  return score
}

async function adviseShop(raw, score, opts) {
  if (!score || !score.indicators || !score.indicators.length) throw new Error('请先完成门店评估')
  const { spec, row } = normalizeInput(raw)
  const loaded = loadCache(opts.storage, row)
  const key = loaded.key
  if (!opts.force) {
    const cached = loaded.data
    const adviceRaw = cached && cached.advice
    if (adviceRaw && typeof adviceRaw === 'object') {
      const names = score.indicators.map((item) => item.name)
      const sections = alignAdviceSections(mapSuggestions(adviceRaw.sections), names)
      if (sections.length === names.length) return { lift: clampLift(adviceRaw.lift), sections }
    }
  }
  const backend = row.backendFacts
  if (!backend) throw new Error('请先绑定门店并同步商家后台，再生成提升方案')
  const names = score.indicators.map((item) => item.name)
  const listed = score.indicators.map((item) => item.name + ' ' + item.score + '/' + item.weight).join('、')
  const lines = score.indicators.map((item) => `${item.name} ${item.score}/${item.weight}：${item.comment}`).join('\n')
  const user = `${shopFacts(spec, row)}\n综合得分：${score.score}/100。\n定位：${score.positioning || ''}\n公网六维：\n${lines}\n商家后台：\n${backend}\n六维都要各写一套方案，顺序不能变，一项都不能少：${listed}。`
  let j = await askJson(opts.askText, erpAdviceSystem(row.evalFocus), user)
  let sections = alignAdviceSections(mapSuggestions(j.sections), names)
  if (sections.length !== names.length) {
    j = await askJson(
      opts.askText,
      erpAdviceSystem(row.evalFocus),
      `${user}\n上次没有覆盖全部六维。sections 必须正好 6 项，name 逐字是：${names.join('、')}。`,
    )
    sections = alignAdviceSections(mapSuggestions(j.sections), names)
  }
  const advice = {
    lift: clampLift(j.lift),
    sections,
  }
  if (advice.sections.length !== names.length) throw new Error('提升方案不完整，请再点一次')
  writeCache(opts.storage, key, { advice, savedAt: new Date().toISOString() })
  void publishShopEval(opts.storage, key, slotId(row))
  return advice
}

function shopEvalGainTargets(score, input) {
  const preview = previewShopGains(score.score, String(input.offerPrice || ''))
  return {
    exposure: score.exposureLift > 0 ? score.exposureLift : preview.exposurePct,
    verify: score.verifyLift > 0 ? score.verifyLift : preview.verifyYuan,
  }
}

const SHOP_EVAL_CATEGORIES = {
  餐饮: ['火锅/汤锅', '烧烤/烤肉', '自助餐', '小吃快餐', '地方小吃', '饮品店', '面包蛋糕甜品', '早餐', '食堂/团餐', '日本料理', '韩国料理', '东南亚菜', '西餐', '中东菜', '川菜', '湘菜', '粤菜', '本帮江浙菜', '东北菜', '云贵菜', '西北菜', '新疆菜', '海鲜水产', '烤鱼', '小龙虾', '地锅鸡/鸡煲', '素食', '创意/融合菜', '私厨到家', '咖啡厅', '茶馆', '夜宵大排档', '其他中餐'],
  丽人: ['美发', '美甲', '美睫', '美容美体', '祛痘/皮肤管理', '半永久纹绣', '纹身刺青', '养发护发', '美体塑形', '产后恢复', '男士美容', '舞蹈塑形', '瑜伽普拉提', 'SPA按摩', '其他丽人'],
  休闲娱乐: ['KTV', '酒吧', '电影院', '剧本杀', '密室逃脱', '棋牌室', '网吧电竞', '游戏厅', '桌游馆', '轰趴馆', '农家乐', '真人CS', '温泉洗浴', '汗蒸桑拿', '其他玩乐'],
  运动健身: ['健身房', '私教工作室', '瑜伽馆', '舞蹈培训', '格斗搏击', '游泳馆', '羽毛球馆', '篮球场馆', '网球场地', '滑雪户外', '马术俱乐部', '攀岩馆', '团操课', '其他运动'],
  亲子: ['儿童乐园', '亲子餐厅', '婴儿游泳', '早教中心', '托育托管', '亲子摄影', '儿童理发', '绘本馆', '手工DIY', '亲子酒店', '动物园门票', '科技馆', '营地研学', '其他亲子'],
  生活服务: ['家政保洁', '家电清洗', '搬家货运', '开锁换锁', '维修到家', '洗衣洗鞋', '月嫂保姆', '婚庆摄影', '法律咨询', '财务代办', '装修设计', '甲醛检测', '绿植养护', '其他生活'],
  爱车: ['洗车美容', '保养维修', '轮胎服务', '贴膜改色', '钣金喷漆', '道路救援', '年检代办', '二手车服务', '充电桩', '加油优惠', '驾校培训', '租车服务', '车内消毒', '其他汽车'],
  购物: ['商超便利', '百货零售', '服饰鞋包', '美妆集合', '数码家电', '母婴用品', '礼品鲜花', '图书文具', '进口商品', '农副产品', '茶叶酒水', '珠宝首饰', '眼镜钟表', '其他购物'],
  学习培训: ['语言培训', '职业技能', '学历教育', '考研公考', '艺术培训', '体育培训', 'IT编程', '财会金融', '企业管理', '心理咨询', '书法绘画', '音乐乐器', '早幼教', '其他教育'],
  宠物: ['宠物医疗', '宠物美容', '宠物寄养', '宠物训练', '宠物食品', '宠物用品', '宠物摄影', '异宠服务', '宠物殡葬', '宠物保险', '宠物出行', '水族造景', '爬宠服务', '其他宠物'],
  医疗医美: ['口腔齿科', '眼科视光', '体检中心', '中医理疗', '轻医美', '植发养发', '医学美容', '疫苗接种', '康复护理', '心理咨询', '基因检测', '孕产服务', '专科门诊', '其他医疗'],
}

module.exports = {
  SHOP_EVAL_PLATFORMS,
  SHOP_EVAL_GRADES,
  SHOP_EVAL_CATEGORIES,
  shopEvalScopeOf,
  shopEvalGrades,
  parseShopEvalJson,
  shopEvalGrade,
  platformShopEvalMeta,
  describeShopEvalBasis,
  previewShopGains,
  formatVerifyYuan,
  resolveShopEvalFromStores,
  boundEvalBrandTarget,
  splitCnRegion,
  readSavedShopEval,
  hydrateShopEval,
  evaluateShop,
  adviseShop,
  describeShopBackend,
  publicEvalIndicators,
  shopEvalGainTargets,
}
