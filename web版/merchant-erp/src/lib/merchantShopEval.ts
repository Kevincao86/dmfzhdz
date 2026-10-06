export type ShopEvalPlatformId = 'douyin' | 'meituan' | 'xiaohongshu' | 'kuaishou'
export type ShopEvalScope = 'single' | 'chain'

export type ShopEvalInput = {
  platformId?: string
  storeName?: string
  address?: string
  phone?: string
  businessHours?: string
  city?: string
  offerName?: string
  offerPrice?: string
  category?: string
  mapNote?: string
  publicNote?: string
  scope?: ShopEvalScope
  storeCount?: number
  brandName?: string
  storeNames?: string
  /** brand：按绑定账号总品牌；store：只评其中一家绑定门店 */
  evalFocus?: 'brand' | 'store' | ''
  storeId?: string
  signals?: ShopEvalSignals
}

export type ShopEvalBoundStore = {
  id: string
  name: string
  address?: string
  city?: string
  phone?: string
  businessHours?: string
  brandName?: string
}

export type ShopEvalSignals = {
  productTotal: number
  productPriced: number
  productWithImage: number
  reviewTotal: number
  reviewReplied: number
  activityTotal: number
  decorationTotal: number
  decorationWithCover: number
  payAmount: number
  verifyAmount: number
  orderCount: number
  otherPlatformPay: number
  clueCount: number
  adShow: number
  kbTotal: number
  kbFeeding: number
  financeVerify: number
  financeRefund: number
  financeRows: number
}

export type ShopEvalSituation = { name: string; now: string }

export type ShopEvalIndicator = { name: string; score: number; weight: number; pct: number; comment: string }

/** 版本 A：单门店公网相对竞争力。预估下单不是核销。 */
export const PUBLIC_EVAL_SINGLE = [
  { name: '套餐预估下单与竞争力', weight: 35 },
  { name: '公域流量与内容转化', weight: 30 },
  { name: '门店口碑与舆情风险', weight: 25 },
  { name: '线上运营能力', weight: 10 },
] as const

/** 版本 B：连锁品牌公网相对竞争力。口碑离散度权重大于单店预估销量。 */
export const PUBLIC_EVAL_CHAIN = [
  { name: '全品牌套餐规模与价格', weight: 25 },
  { name: '品牌内容与流量矩阵', weight: 25 },
  { name: '品牌口碑与舆情风险', weight: 30 },
  { name: '品牌标准化与一致性', weight: 20 },
] as const

export const PUBLIC_EVAL_INDICATORS = PUBLIC_EVAL_SINGLE

export function publicEvalIndicators(scope?: ShopEvalScope) {
  return scope === 'chain' ? PUBLIC_EVAL_CHAIN : PUBLIC_EVAL_SINGLE
}

export const SHOP_EVAL_DISCLAIMER = {
  single:
    '本结果只依据公网前台和检索到的公开说法，没有商家后台授权，不能核验真实核销、营收和利润。预估下单含退款、过期未核销等噪声，不是到店收入，只适合同商圈横向对比，不能用于财务结算或业绩考核。',
  chain:
    '本结果只依据公网前台和检索到的公开说法，没有商家后台授权，不能核验真实核销、营收和利润。品牌分看各店公开口碑是否一致、套餐价格是否一套、内容是否覆盖到店。一家店的公开差评会拉低品牌分。不能用于财务结算或业绩考核。',
} as const

const ERP_SOLUTION_MODULES = [
  '商品与套餐',
  '评价管理',
  '店铺装修',
  '活动中心',
  '达人招募',
  '店铺分析与投流',
  '知识库与GEO投喂',
  '财务对账',
  '线索跟进',
] as const

export type ShopEvalSuggestion = {
  name: string
  finding: string
  adjust: string
  soon: string
  next: string
  module?: string
}

export type ShopEvalScore = {
  score: number
  searchLevel: string
  verifyLevel: string
  situations: ShopEvalSituation[]
  exposureLift: number
  verifyLift: number
  positioning?: string
  indicators?: ShopEvalIndicator[]
  highlights?: string[]
  gaps?: string[]
  summary?: string
  sources?: string[]
  disclaimer?: string
}

export type ShopEvalAdvice = {
  lift: number
  sections: ShopEvalSuggestion[]
}

type ScoreBlock = { name: string; weight: number }

type PlatformSpec = {
  id: ShopEvalPlatformId
  name: string
  scope: ShopEvalScope
  scene: string
  blocks: ScoreBlock[]
  risk: number
  riskNote: string
  levelA: string
  levelB: string
  levelABlocks: string[]
  levelBBlocks: string[]
}

const EVAL_BLOCK_NAMES = ['商品信息', '运营节奏', '品牌视觉', '流量分布', 'GEO 投喂', '财务明晰'] as const
const LEVEL_A_BLOCKS = ['品牌视觉', '流量分布', 'GEO 投喂']
const LEVEL_B_BLOCKS = ['商品信息', '运营节奏', '财务明晰']

function evalBlocks(weights: readonly number[]): ScoreBlock[] {
  return EVAL_BLOCK_NAMES.map((name, index) => ({ name, weight: weights[index] }))
}

const PLATFORM_SPECS: Record<ShopEvalPlatformId, PlatformSpec> = {
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

const CHAIN_OVERLAYS: Record<ShopEvalPlatformId, Pick<PlatformSpec, 'scene' | 'riskNote' | 'levelA' | 'levelB'>> = {
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

export const SHOP_EVAL_PLATFORMS: { id: ShopEvalPlatformId; name: string }[] = [
  { id: 'douyin', name: '抖音来客' },
  { id: 'meituan', name: '美团点评' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手团购' },
]

export const SHOP_EVAL_GRADES_SINGLE = [
  { key: 'ready', range: '80~100', label: '商圈头部', note: '套餐、内容和口碑在同商圈公开渠道上比较稳' },
  { key: 'tune', range: '70~79', label: '优质门店', note: '有线上获客能力，套餐结构、自有内容或口碑还有短板' },
  { key: 'fill', range: '55~69', label: '竞争力偏弱', note: '公网上能看见店，但下单规模、内容或口碑还没站住' },
  { key: 'build', range: '＜55', label: '公域尚未成型', note: '套餐、内容、口碑里多项在公开渠道上还看不清' },
] as const

export const SHOP_EVAL_GRADES_CHAIN = [
  { key: 'ready', range: '80~100', label: '品牌口碑稳', note: '各店公开口碑比较齐，内容和套餐没有明显打架' },
  { key: 'tune', range: '70~79', label: '品牌能被看见', note: '品牌有内容或套餐，但舆情离散或标准化还没齐' },
  { key: 'fill', range: '55~69', label: '分店口碑不齐', note: '有门店的公开差评或价格带在拖品牌' },
  { key: 'build', range: '＜55', label: '品牌尚未成型', note: '公开渠道上还看不出统一的套餐、内容和口碑' },
] as const

export const SHOP_EVAL_GRADES = SHOP_EVAL_GRADES_SINGLE

export function shopEvalScopeOf(raw?: Pick<ShopEvalInput, 'scope' | 'storeCount' | 'evalFocus'> | null): ShopEvalScope {
  if (raw?.evalFocus === 'store') return 'single'
  if (raw?.evalFocus === 'brand' || raw?.scope === 'chain' || Number(raw?.storeCount) >= 2) return 'chain'
  return 'single'
}

export function shopEvalGrades(scope?: ShopEvalScope) {
  return scope === 'chain' ? SHOP_EVAL_GRADES_CHAIN : SHOP_EVAL_GRADES_SINGLE
}

type AskText = (system: string, user: string, opts?: { webSearch?: boolean }) => Promise<string>
type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function specOf(platformId: string, scope?: ShopEvalScope): PlatformSpec {
  const id = platformId as ShopEvalPlatformId
  const base = PLATFORM_SPECS[id] || PLATFORM_SPECS.douyin
  if (scope !== 'chain') return base
  return { ...base, scope: 'chain', ...CHAIN_OVERLAYS[base.id] }
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function clampLift(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(35, Math.max(5, v))
}

function clampExposure(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(60, Math.max(8, v))
}

function clampYuan(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(5_000_000, v)
}

function lineText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text.includes('[object Object]') ? '' : text
  }
  if (Array.isArray(value)) return value.map(lineText).filter(Boolean).join('，')
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const keys = ['text', 'content', 'comment', 'point', 'title', 'desc', 'description', 'finding', 'summary', 'now', 'detail', 'value', 'highlight', 'gap']
  for (const key of keys) {
    const hit = lineText(item[key])
    if (hit) return hit
  }
  return Object.values(item).map(lineText).filter(Boolean).join('，')
}

function clipText(value: unknown, max: number): string {
  return lineText(value).slice(0, max)
}

function normalizeInput(raw: ShopEvalInput) {
  const scope = shopEvalScopeOf(raw)
  const spec = specOf(String(raw?.platformId || 'douyin'), scope)
  return {
    spec,
    row: {
      platformId: spec.id,
      scope,
      storeCount: Math.max(0, Math.round(Number(raw?.storeCount) || 0)),
      brandName: String(raw?.brandName || '').trim(),
      storeNames: String(raw?.storeNames || '').trim(),
      storeName: String(raw?.storeName || '').trim(),
      address: String(raw?.address || '').trim(),
      phone: String(raw?.phone || '').trim(),
      businessHours: String(raw?.businessHours || '').trim(),
      city: String(raw?.city || '').trim(),
      offerName: String(raw?.offerName || '').trim(),
      offerPrice: String(raw?.offerPrice || '').trim(),
      category: String(raw?.category || '').trim(),
      mapNote: String(raw?.mapNote || '').trim(),
      publicNote: String(raw?.publicNote || '').trim(),
      evalFocus: raw?.evalFocus === 'brand' || raw?.evalFocus === 'store' ? raw.evalFocus : '',
      storeId: String(raw?.storeId || '').trim(),
      signals: raw?.signals,
    },
  }
}

function filledOr(value: string, empty: string) {
  return value || empty
}

function shopFacts(spec: PlatformSpec, row: ReturnType<typeof normalizeInput>['row']) {
  const lines = [
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
    `套餐价格：${filledOr(row.offerPrice, /\d+\s*元|套餐/.test(row.publicNote) ? '公开检索里已经有团购价格，写进套餐竞争力，禁止写成未上架' : '未填写，不要编造')}`,
    `经营分类：${filledOr(row.category, '未填写')}`,
    `评估范围：${row.evalFocus === 'brand' ? '用户指定按总品牌' : row.evalFocus === 'store' ? '用户指定只分析这一家绑定门店' : '未指定'}`,
    `高德定位：${filledOr(row.mapNote, '未返回')}`,
    `公开检索：${filledOr(row.publicNote, '未返回')}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function loosenJson(slice: string) {
  return String(slice || '')
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

export function parseShopEvalJson(text: string): Record<string, unknown> {
  const raw = String(text || '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1] : raw
  const start = body.indexOf('{')
  if (start < 0) throw new Error('评估结果暂时读不出来，请再点一次')
  const candidates: string[] = []
  const balanced = takeBalancedObject(body.slice(start))
  if (balanced) candidates.push(balanced)
  const end = body.lastIndexOf('}')
  if (end > start) candidates.push(body.slice(start, end + 1))
  for (const item of candidates) {
    try {
      return JSON.parse(escapeNewlinesInStrings(loosenJson(item))) as Record<string, unknown>
    } catch {
      /* next */
    }
  }
  throw new Error('评估结果暂时读不出来，请再点一次')
}


function mapSuggestions(rows: unknown): ShopEvalSuggestion[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const next = clipText(item.next, 80)
      const adjust = clipText(item.adjust, 180) || next
      return {
        name: clipText(item.name, 12),
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

function ownerId() {
  try {
    return sessionStorage.getItem('meoo_active_tenant_id')?.trim() || ''
  } catch {
    return ''
  }
}

function slotId(row: ReturnType<typeof normalizeInput>['row']) {
  const base = [row.platformId, row.storeName, row.address, row.category].join('|')
  if (row.evalFocus === 'brand') return ['brand', row.brandName, base].join('|')
  if (row.evalFocus === 'store') return ['store', row.storeId || row.storeName, base].join('|')
  return base
}

function cacheKey(row: ReturnType<typeof normalizeInput>['row']) {
  return ['lq_merchant_shop_eval_v7', ownerId(), slotId(row)].join('|')
}

function loadCache(storage: StorageLike, row: ReturnType<typeof normalizeInput>['row']) {
  const key = cacheKey(row)
  return { key, data: readCache(storage, key) }
}

function readCache(storage: StorageLike, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const j = JSON.parse(raw) as Record<string, unknown>
    if (typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(storage: StorageLike, key: string, patch: Record<string, unknown>, replace = false) {
  const prev = replace ? {} : readCache(storage, key) || {}
  storage.setItem(key, JSON.stringify({ ...prev, ...patch }))
}

type ShopEvalProfile = {
  storeCount: number
  scope: ShopEvalScope
  storeNames: string
  brandName: string
  storeName: string
  address: string
  category: string
  evalFocus?: 'brand' | 'store' | ''
  storeId?: string
}

function profileFromRow(row: ReturnType<typeof normalizeInput>['row']): ShopEvalProfile {
  const focus = row.evalFocus === 'brand' || row.evalFocus === 'store' ? row.evalFocus : ''
  const storeCount = focus === 'store' ? 1 : Math.max(0, Math.round(Number(row.storeCount) || 0))
  const scope: ShopEvalScope = focus === 'store' ? 'single' : focus === 'brand' || row.scope === 'chain' || storeCount >= 2 ? 'chain' : 'single'
  return {
    storeCount,
    scope,
    storeNames: String(row.storeNames || ''),
    brandName: String(row.brandName || ''),
    storeName: String(row.storeName || ''),
    address: String(row.address || ''),
    category: String(row.category || ''),
    evalFocus: focus,
    storeId: String(row.storeId || ''),
  }
}

function savedFromCache(cached: Record<string, unknown> | null): {
  score: ShopEvalScore
  advice: ShopEvalAdvice | null
  profile: ShopEvalProfile | null
} | null {
  if (!cached || cached.sourcesSearch !== 'store-search-v7') return null
  const blocks = publicEvalIndicators(scopeFromCached(cached))
  const indicators = mapIndicators(cached.indicators, blocks)
  if (indicators.length !== blocks.length) return null
  const adviceRaw = cached.advice
  let advice: ShopEvalAdvice | null = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray((adviceRaw as ShopEvalAdvice).sections)) {
    const sections = mapSuggestions((adviceRaw as ShopEvalAdvice).sections)
    if (sections.length) advice = { lift: clampLift((adviceRaw as ShopEvalAdvice).lift), sections }
  }
  const rawProfile = cached.profile
  const profile = rawProfile && typeof rawProfile === 'object' ? profileFromRow(rawProfile as ReturnType<typeof normalizeInput>['row']) : null
  return {
    score: scoreFromPublic(cached, indicators, blocks, scopeFromCached(cached)),
    advice,
    profile,
  }
}

export function shopEvalGrade(score: number, scope?: ShopEvalScope) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  const grades = shopEvalGrades(scope)
  if (n >= 80) return grades[0]
  if (n >= 70) return grades[1]
  if (n >= 55) return grades[2]
  return grades[3]
}

export function platformShopEvalMeta(platformId: string, scope?: ShopEvalScope) {
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

export function describeShopEvalBasis(raw: ShopEvalInput) {
  const { row, spec } = normalizeInput(raw)
  const bits: string[] = []
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

function parseCount(text: string) {
  const raw = String(text || '').replace(/,/g, '').trim()
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return 0
  return m[2] ? Math.round(n * 10000) : Math.round(n)
}

export function previewShopGains(score: number, offerPrice: string) {
  const exposurePct = clampExposure(Math.round((100 - Math.min(92, score)) * 1.5))
  const price = parseCount(offerPrice) || 80
  const orders = Math.max(1, Math.round(exposurePct * 1.6))
  return { exposurePct, verifyYuan: clampYuan(Math.max(500, orders * price)) }
}

export function formatVerifyYuan(yuan: number) {
  const n = Math.round(Number(yuan) || 0)
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `¥${text}万`
  }
  return `¥${n.toLocaleString('zh-CN')}`
}

export function resolveShopEvalFromStores(
  platformId: ShopEvalPlatformId,
  stores: Array<{
    name?: string
    address?: string
    phone?: string
    businessHours?: string
    city?: string
    brandName?: string
  }>,
  total?: number,
): ShopEvalInput {
  const list = Array.isArray(stores) ? stores : []
  const count = Math.max(list.length, Math.round(Number(total) || 0))
  const first = list[0]
  const scope: ShopEvalScope = count >= 2 ? 'chain' : 'single'
  const brandName = String(first?.brandName || list.find((row) => String(row.brandName || '').trim())?.brandName || '').trim()
  return {
    platformId,
    scope,
    storeCount: count,
    brandName,
    storeNames: list
      .slice(0, 8)
      .map((row) => String(row.name || '').trim())
      .filter(Boolean)
      .join('、'),
    storeName: String(first?.name || '').trim(),
    evalFocus: count >= 2 ? '' : undefined,
    address: String(first?.address || '').trim(),
    phone: String(first?.phone || '').trim(),
    businessHours: String(first?.businessHours || '').trim(),
    city: String(first?.city || '').trim(),
  }
}

function stripStoreSuffix(title: string) {
  const text = String(title || '').trim()
  const paren = text.match(/^(.+?)[（(]([^)）]{1,24}店)[)）]\s*$/)
  if (paren?.[1]?.trim()) return paren[1].trim()
  const dot = text.match(/^(.+?)[·•—－-]([^·•—－-]{1,24}店)\s*$/)
  if (dot?.[1]?.trim() && dot[1].trim().length >= 2) return dot[1].trim()
  return text
}

function inferBoundBrandLabel(store: ShopEvalBoundStore) {
  const fromName = stripStoreSuffix(store.name)
  const fromApi = stripStoreSuffix(store.brandName || '')
  if (fromApi && fromName && fromApi !== fromName && fromName.startsWith(fromApi)) return fromApi
  return fromName || fromApi
}

/** 绑定账号里多家门店时，归出总品牌名称和门店数 */
export function boundEvalBrandTarget(stores: ShopEvalBoundStore[]) {
  const list = (Array.isArray(stores) ? stores : []).filter((store) => String(store?.name || '').trim())
  const groups = new Map<string, ShopEvalBoundStore[]>()
  const labels = new Map<string, string>()
  for (const store of list) {
    const label = inferBoundBrandLabel(store)
    const key = label.toLowerCase().replace(/\s+/g, '')
    const bucket = groups.get(key) || []
    bucket.push(store)
    groups.set(key, bucket)
    labels.set(key, label)
  }
  let bestKey = ''
  let best: ShopEvalBoundStore[] = []
  for (const [key, bucket] of groups) {
    if (bucket.length > best.length) {
      best = bucket
      bestKey = key
    }
  }
  const members = best.length >= 2 ? best : list
  const brandName = String((best.length >= 2 ? labels.get(bestKey) : '') || labels.get(bestKey) || list[0]?.name || '').trim()
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

export function splitCnRegion(address: string, cityHint?: string) {
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

export function readSavedShopEval(raw: ShopEvalInput, storage: StorageLike) {
  const { row } = normalizeInput(raw)
  return savedFromCache(loadCache(storage, row).data)
}

async function askJson(askText: AskText, system: string, user: string) {
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

function pointsOf(value: unknown, weight: number) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > weight) return Math.round((Math.min(100, n) / 100) * weight)
  return Math.min(weight, n)
}

function scopeFromCached(cached: Record<string, unknown> | null): ShopEvalScope {
  const profile = cached?.profile
  if (profile && typeof profile === 'object') {
    const row = profile as { evalFocus?: string; scope?: string; storeCount?: number }
    if (row.evalFocus === 'store') return 'single'
    if (row.evalFocus === 'brand' || row.scope === 'chain' || Number(row.storeCount) >= 2) return 'chain'
  }
  const names = new Set(
    (Array.isArray(cached?.indicators) ? cached.indicators : []).map((row) =>
      String(row && typeof row === 'object' ? (row as { name?: string }).name || '' : ''),
    ),
  )
  if (PUBLIC_EVAL_CHAIN.some((block) => names.has(block.name))) return 'chain'
  return 'single'
}

function normIndicatorName(value: string) {
  return value.replace(/（\s*满分\s*\d+\s*）/g, '').replace(/[（）()\s&＆:：]/g, '')
}

function indicatorRows(rows: unknown): Record<string, unknown>[] {
  if (Array.isArray(rows)) {
    return rows.filter((row) => row && typeof row === 'object').map((row) => row as Record<string, unknown>)
  }
  if (rows && typeof rows === 'object') {
    return Object.entries(rows as Record<string, unknown>).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return { name: key, ...(value as Record<string, unknown>) }
      return { name: key, points: value }
    })
  }
  return []
}

function mapIndicators(rows: unknown, blocks: readonly { name: string; weight: number }[]): ShopEvalIndicator[] {
  const parsed = indicatorRows(rows)
  const used = new Set<string>()
  const hits = new Map<string, { points: number; comment: string }>()
  const takeBlock = (name: string) => {
    const text = normIndicatorName(name)
    const pool = blocks.filter((block) => !used.has(block.name))
    const exact = pool.find((block) => normIndicatorName(block.name) === text)
    if (exact) return exact
    const ranked = pool
      .map((block) => ({ block, key: normIndicatorName(block.name) }))
      .filter((item) => item.key.length >= 4 && (text.includes(item.key) || item.key.includes(text)))
      .sort((a, b) => b.key.length - a.key.length)
    return ranked[0]?.block
  }
  parsed.forEach((item, index) => {
    const rawName = clipText(item.name, 80)
    const block = (rawName && takeBlock(rawName)) || (parsed.length === blocks.length ? blocks[index] : undefined)
    if (!block || used.has(block.name)) return
    used.add(block.name)
    const comment =
      clipText(item.comment || item.now || item.reason || item.detail || item['点评'], 220) || '这项按公开检索打分。'
    hits.set(block.name, { points: pointsOf(item.points ?? item.score, block.weight), comment })
  })
  return blocks
    .map((block) => {
      const hit = hits.get(block.name)
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
    .filter((row): row is ShopEvalIndicator => Boolean(row))
}

function textList(rows: unknown, limit: number, maxLen: number) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => clipText(row, maxLen))
    .filter(Boolean)
    .slice(0, limit)
}

function collapsedChainText(text: string, storeCount: number) {
  if (storeCount < 2) return false
  return /单门店|完全空白|形象未立|基本空白/.test(text)
}

function brandScoreLow(raw: Record<string, unknown>) {
  const rows = Array.isArray(raw.indicators) ? raw.indicators : []
  for (const row of rows) {
    const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    if (String(item.name || '') !== '品牌口碑与舆情风险') continue
    return pointsOf(item.points ?? item.score, 30) < 12
  }
  return false
}

function speakEstimate(text: string) {
  return text
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

function scoreFromPublic(
  raw: Record<string, unknown>,
  indicators: ShopEvalIndicator[],
  blocks: readonly { name: string; weight: number }[],
  scope: ShopEvalScope,
): ShopEvalScore {
  const byName = new Map(indicators.map((row) => [row.name, row.score]))
  let sum = 0
  for (const block of blocks) sum += byName.get(block.name) || 0
  const highlights = textList(raw.highlights, 3, 140).map(speakEstimate)
  const gaps = textList(raw.gaps, 4, 160).map(speakEstimate)
  const shown = indicators.map((row) => ({ ...row, comment: speakEstimate(row.comment) }))
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
    disclaimer: SHOP_EVAL_DISCLAIMER[scope],
  }
}

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSogouTitles(html: string) {
  const out: string[] = []
  const re = /<h3 class="vr-title[\s\S]*?<\/h3>/gi
  for (const block of html.matchAll(re)) {
    const title = stripTags(block[0] || '')
    if (title.length < 6 || out.includes(title)) continue
    out.push(title.slice(0, 80))
    if (out.length >= 6) break
  }
  return out
}

async function readPublicHtml(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

async function briefSearchTitles(query: string) {
  const body = JSON.stringify({
    platform: 'douyin',
    queries: [query],
    limit: 4,
    briefContent: { requirementSummary: query, topics: [query] },
  })
  let urls: string[] = [`/api/meoo-brief-reference-search`]
  try {
    const mod = await import('./merchantErpApiBase')
    urls = mod.merchantApiFetchUrls('/api/meoo-brief-reference-search')
  } catch {
    /* 同源路径 */
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { hits?: Array<{ title?: string; originalVideoUrl?: string }> }
      const titles = (data.hits || [])
        .map((hit) => clipText(hit.title || hit.originalVideoUrl, 80))
        .filter(Boolean)
      if (titles.length) return titles
    } catch {
      /* 下一条 */
    }
  }
  return [] as string[]
}

function keepNoteLine(line: string) {
  if (line.length < 6) return false
  if (/\d+\s*元|套餐|评价|探店|团购|人均|已售|月售|点评/.test(line)) return true
  return !/暂未检索|未检索到|没有找到|无法查询|无公开/.test(line)
}

async function doubaoPublicNotes(
  askText: AskText,
  row: { brandName: string; storeName: string; city: string; address: string; category: string; storeCount: number },
) {
  const name = row.brandName || row.storeName
  const core = brandCoreName(name)
  const rounds = [
    {
      system: [
        '你在用方舟联网检索这个品牌。每条一行，最多 12 行。',
        '要写套餐名、价格、已售或月售、评价说法、探店或短视频。数字按检索原文写。',
        '店名里的「24时」不要当成全天营业。其他分店的电话不要安到被点名的这一家。',
      ].join(''),
      user: `品牌：${name}\n城市：${row.city || ''}\n地址：${row.address || ''}\n分类：${row.category || ''}\n同城同名：${row.storeCount || 0}家\n请检索团购、美团、大众点评、抖音探店和评价。`,
    },
    {
      system: [
        '上一轮材料还不够。继续检索品牌简称、抖音团购、美团、大众点评，以及同城同品类的套餐价格和评价。',
        '每条开头标明「本店」或「同城同品类」。最多 12 行。有价格和评价就写上。',
      ].join(''),
      user: `品牌简称：${core || name}\n城市：${row.city || ''}\n分类：${row.category || ''}\n请把能对上这个品牌的套餐、评价、探店，以及同城同品类可对照的价格带都写出来。`,
    },
  ]
  const lines: string[] = []
  for (const round of rounds) {
    if (lines.length >= 8) break
    try {
      const text = await askText(round.system, round.user, { webSearch: true })
      for (const line of String(text || '').split('\n')) {
        const clean = line.replace(/^\d+[.、]\s*/, '').trim()
        if (!keepNoteLine(clean) || lines.includes(clean)) continue
        lines.push(clean)
        if (lines.length >= 16) break
      }
    } catch {
      /* 下一轮 */
    }
  }
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
}

function brandCoreName(name: string) {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(南湖店|旗舰店|总店|分店)$/u, '')
    .replace(/店$/u, '')
    .replace(/[·•\s]/g, '')
    .trim()
}

function keepStoreTitle(title: string, core: string) {
  const text = title.trim()
  if (text.length < 8 || text.length > 140) return false
  if (/汉语词语|近义词|反义词|造句|百度百科|安全验证|搜狗搜索/.test(text)) return false
  if (core.length >= 2 && !text.includes(core)) return false
  return true
}

async function searchPublicBrand(row: { brandName: string; storeName: string; city: string; category: string; publicNote?: string }) {
  const core = brandCoreName(row.brandName || row.storeName)
  const name = row.brandName || row.storeName
  const city = row.city || ''
  const category = row.category || ''
  const preset = String(row.publicNote || '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => keepStoreTitle(line, core))
  const titles = preset.slice(0, 8)
  const brandQueries = [
    `${name} ${city} 团购`,
    `${name} 抖音 探店`,
    `${row.storeName} 点评`,
    `${core} ${city} 美团 套餐`,
    `${core} ${city} 评价`,
    `${name} 抖音 已售`,
  ]
  const peerQueries = [`${category} ${city} 团购 套餐`, `${category} ${city} 点评 人均`]
  const pull = async (query: string) => {
    const q = query.replace(/\s+/g, ' ').trim()
    if (q.length < 2) return [] as string[]
    const [html, brief] = await Promise.all([
      readPublicHtml(`https://www.sogou.com/web?query=${encodeURIComponent(q)}`),
      briefSearchTitles(q),
    ])
    return [...parseSogouTitles(html), ...brief]
  }
  const pushBrand = (list: string[]) => {
    for (const title of list) {
      if (!title || !keepStoreTitle(title, core) || titles.includes(title)) continue
      titles.push(title)
    }
  }
  for (const batch of await Promise.all(brandQueries.map(pull))) pushBrand(batch)
  if (titles.length < 4) {
    for (const batch of await Promise.all(peerQueries.map(pull))) {
      for (const title of batch) {
        const line = `同城同品类：${title}`
        if (!title || title.length < 8 || titles.includes(line)) continue
        titles.push(line)
        if (titles.length >= 16) break
      }
    }
  }
  return titles.slice(0, 16)
}

function publicScoreSystem(scope: ShopEvalScope) {
  const blocks = publicEvalIndicators(scope)
  const names = blocks.map((item) => `${item.name}（满分 ${item.weight}）`).join('、')
  const mode =
    scope === 'chain'
      ? [
          '这次用连锁品牌公网模型。弱化单店预估销量，重点看品牌覆盖、各店口碑是否一致、内容矩阵、套餐是否一套价。',
          '全品牌套餐规模与价格：各店套餐是否同一套、同名套餐是否同价。看见门店之间低价互踩，这项要扣。只看到一家有价，不能写成全品牌都在售。',
          '品牌内容与流量矩阵：品牌账号、分店账号、达人探店是否都出现，内容有没有落到具体门店。',
          '品牌口碑与舆情风险是最高权重。一家店出现卫生、服务类重大差评，或差评集中在某一家，这项要大幅扣分。',
          '品牌标准化与一致性：店名规则、主页信息、套餐和内容素材是否像同一品牌。高德同城同名家数可以写。',
          '禁止写成单门店、形象未立、线上完全空白。',
        ]
      : [
          '这次用单门店公网模型。只评这一家，即使同城还有同名分店，也不要改成连锁品牌。',
          '套餐预估下单与竞争力权重最高：看这一家的套餐价格带、引流款占比、套餐是否丰富、有没有上新。低价引流占比过高要扣分。检索原文里的已售、月售可以引用，并写明是公网前台数字、不是核销。',
          '公域流量与内容转化：看指向这一家的探店、短视频、达人内容和直播挂载。这是内容供给，不是商家后台 ROI。',
          '门店口碑与舆情风险：有评价原文就按原文。没有原文时按同品类口碑档位估算，不写具体条数。卫生、服务类重大差评要大幅扣分。',
          '线上运营能力：主页信息、套餐迭代、差评有没有公开回复、商家自己的账号有没有更新。',
        ]
  return [
    '你在用公网前台资料给商家打相对竞争力分，用「你」来写。没有商家后台授权。',
    '分数是同商圈横向对比，不是真实核销、营收或利润。预估下单不能写成到店收入。',
    '检索原文里的套餐价、已售、月售、评价按原文写。原文没有这些数字时，用同城、同品类、连锁家数和同城同品类标题做档位估算，直接写出估算结论。',
    '估算用上游、中上、中游、偏弱，不要编造精确到个位的核销量，也不要写假的评价条数。',
    '点评、定位、优势、短板、总结里禁止出现：未检索到、没有检索到、公开渠道未、无公开、查不到、检索不到、线上空白、几乎空白。',
    '周边同类店用来对照价格带和内容档位，不能写成这家没有客流。不要编造距离。',
    ...mode,
    '只输出一个 JSON 对象，不要 Markdown。',
    'positioning：一句定位，40 到 90 字，写公开渠道上的位置和最明显的短板。',
    `indicators 必须是数组，正好 ${blocks.length} 项。name 只能逐字是：${blocks.map((item) => item.name).join('、')}。不要把「满分」写进 name。每项含 points（0 到该项满分的整数）和 comment（40 到 90 字，先写亮点，再写扣分）。参考满分：${names}。`,
    'highlights 正好 3 条，每一条都是字符串。每条 40 到 80 字。',
    'gaps 正好 4 条，每一条都是字符串。每条 40 到 90 字。',
    'summary：一句话总结，30 到 60 字。不要把预估下单写成盈利。',
  ].join('')
}

type ShopEvalCloudSlot = { savedAt?: string; payload?: Record<string, unknown> }
type ShopEvalCloudFile = { updatedAt?: string; platforms?: Record<string, ShopEvalCloudSlot> }

function readShopEvalCloud(habits: unknown): ShopEvalCloudFile | null {
  if (!habits || typeof habits !== 'object') return null
  const shopEval = (habits as Record<string, unknown>).shopEval
  if (!shopEval || typeof shopEval !== 'object') return null
  return shopEval as ShopEvalCloudFile
}

async function requestShopEvalCloud(method: 'GET' | 'POST', body?: unknown): Promise<{ habits?: unknown } | null> {
  try {
    const [{ merchantApiFetchUrls }, { merchantApiAuthHeaders, resolveMerchantApiBearer }] = await Promise.all([
      import('./merchantErpApiBase'),
      import('./merchantApiAuth'),
    ])
    const auth = await resolveMerchantApiBearer()
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...merchantApiAuthHeaders(auth.token, auth.source),
    }
    if (!auth.token) return null
    for (const url of merchantApiFetchUrls('/api/meoo-agent-user-state')) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const data = (await res.json()) as { ok?: boolean; habits?: unknown }
        if (data && data.ok !== false) return data
      } catch {
        /* 下一条地址 */
      }
    }
  } catch {
    /* 云端不可用时保留本机结果 */
  }
  return null
}

async function publishShopEval(storage: StorageLike, key: string, slot: string) {
  const data = readCache(storage, key)
  if (!data) return
  const savedAt = String(data.savedAt || new Date().toISOString())
  const remote = await requestShopEvalCloud('GET')
  const prev = readShopEvalCloud(remote?.habits)
  const platforms = { ...(prev?.platforms || {}) }
  platforms[slot] = { savedAt, payload: data }
  await requestShopEvalCloud('POST', {
    habits: {
      shopEval: { updatedAt: savedAt, platforms },
      updatedAt: savedAt,
    },
  })
}

export async function hydrateShopEval(raw: ShopEvalInput, storage: StorageLike) {
  const { row } = normalizeInput(raw)
  const remote = await requestShopEvalCloud('GET')
  const fresh = loadCache(storage, row)
  const localAt = Date.parse(String(fresh.data?.savedAt || '')) || 0
  const slot = readShopEvalCloud(remote?.habits)?.platforms?.[slotId(row)]
  const remoteAt = Date.parse(String(slot?.savedAt || '')) || 0
  if (slot?.payload && remoteAt > localAt && savedFromCache(slot.payload)) {
    storage.setItem(fresh.key, JSON.stringify(slot.payload))
    return savedFromCache(slot.payload)
  }
  if (fresh.data && savedFromCache(fresh.data) && localAt >= remoteAt && (localAt > remoteAt || remoteAt === 0)) {
    if (!localAt) writeCache(storage, fresh.key, { savedAt: new Date().toISOString() })
    void publishShopEval(storage, fresh.key, slotId(row))
  }
  return savedFromCache(fresh.data)
}

function erpAdviceSystem(focus?: string) {
  const modules = ERP_SOLUTION_MODULES.join('、')
  const rangeRule =
    focus === 'store'
      ? '用户这次只提升这一家绑定门店。方案只写这一家，不要要求全品牌各店统一。'
      : focus === 'brand'
        ? '用户这次按总品牌提升。多家门店不统一时，写各店如何对齐。'
        : ''
  return [
    '你在给商家写灵祺 ERP 里能直接去做的改法，用「你」来写。',
    rangeRule,
    '前面的打分来自公开渠道。这里不要再复述网评，要落到系统功能。',
    `只能使用这些功能：${modules}。不要写系统里没有的会员储值、社群积分商城。`,
    '套餐结构写到商品与套餐、活动中心。内容和达人写到达人招募、店铺装修。口碑写到评价管理。多店价格或视觉不统一写到商品与套餐、店铺装修。',
    '不要编造销量、核销额、GMV。',
    '不要写「公开资料不足」「仅供参考」「无法判断」。',
    '只输出一个 JSON 对象。',
    'sections 正好 4 项，对应四条短板。每项含 name、module、finding、adjust、soon。',
    'name 是短板标题，12 字以内。module 必须是上面列出的功能名。',
    'finding 说明这条短板现在卡在哪，40 到 80 字。',
    'adjust 写去哪个功能里改什么，改完应看到什么，60 到 140 字。',
    'soon 是近两周的 3 件事，用「1.」「2.」「3.」分开。',
  ].join('')
}

export async function evaluateShop(
  raw: ShopEvalInput,
  opts: { force?: boolean; storage: StorageLike; askText: AskText },
): Promise<ShopEvalScore> {
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
  const peerHint = `对照：城市 ${row.city || '未填'}，品类 ${row.category || '未填'}，同城同名 ${row.storeCount || 0} 家。材料里没有套餐价或评价时，按这些做档位估算。`
  const material = [webNotes, listed, peerHint].filter(Boolean).join('\n')
  const blocks = publicEvalIndicators(spec.scope)
  const user = `${shopFacts(spec, row)}\n公开检索标题：\n${material}\n请按${spec.scope === 'chain' ? '连锁品牌' : '单门店'}模型给出定位、四项 points 和点评、三条优势、四条短板、一句话总结。`
  let j = await askJson(opts.askText, publicScoreSystem(spec.scope), user)
  if (spec.scope === 'chain' && (collapsedChainText(JSON.stringify(j), row.storeCount) || (row.storeCount >= 3 && brandScoreLow(j)))) {
    j = await askJson(
      opts.askText,
      publicScoreSystem('chain'),
      `${user}\n纠正：高德已给出同城同名门店 ${row.storeCount} 家，这是连锁品牌。重写定位、品牌口碑和套餐价格是否统一。禁止出现单门店、形象未立、线上完全空白。一家店的公开差评要体现在品牌口碑里，不要为了家数把口碑打高。`,
    )
  }
  if (spec.scope === 'chain' && row.storeCount >= 2 && collapsedChainText(`${j.positioning || ''}${j.summary || ''}`, row.storeCount)) {
    j = {
      ...j,
      positioning: `高德在同城检索到 ${row.storeCount} 家同名门店。品牌已经被叫得上名，短板看各店套餐是否同价、公开口碑是否被某一家拖累。`,
      summary: `同城已有 ${row.storeCount} 家同名门店，先核对套餐价格和各店公开口碑是否一致。`,
    }
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
  const score = scoreFromPublic({ ...j, sources }, indicators, blocks, spec.scope)
  writeCache(opts.storage, loaded.key, {
    ...score,
    sourcesSearch: 'store-search-v7',
    profile: profileFromRow(row),
    savedAt: new Date().toISOString(),
  })
  void publishShopEval(opts.storage, loaded.key, slotId(row))
  return score
}

export async function adviseShop(
  raw: ShopEvalInput,
  score: ShopEvalScore | null,
  opts: { force?: boolean; storage: StorageLike; askText: AskText },
): Promise<ShopEvalAdvice> {
  if (!score?.indicators?.length) throw new Error('请先完成门店评估')
  const { spec, row } = normalizeInput(raw)
  const loaded = loadCache(opts.storage, row)
  const key = loaded.key
  if (!opts.force) {
    const cached = loaded.data
    const adviceRaw = cached?.advice
    if (adviceRaw && typeof adviceRaw === 'object') {
      const sections = mapSuggestions((adviceRaw as ShopEvalAdvice).sections)
      if (sections.length) return { lift: clampLift((adviceRaw as ShopEvalAdvice).lift), sections }
    }
  }
  const lines = (score.indicators || []).map((item) => `${item.name} ${item.score}/${item.weight}：${item.comment}`).join('\n')
  const gaps = (score.gaps || []).map((item, index) => `${index + 1}. ${item}`).join('\n')
  const j = await askJson(
    opts.askText,
    erpAdviceSystem(row.evalFocus),
    `${shopFacts(spec, row)}\n综合得分：${score.score}/100。\n定位：${score.positioning || ''}\n分项：\n${lines}\n短板：\n${gaps}\n请按四条短板，给出灵祺 ERP 里对应功能的改法。`,
  )
  const advice: ShopEvalAdvice = {
    lift: clampLift(j.lift),
    sections: mapSuggestions(j.sections),
  }
  writeCache(opts.storage, key, { advice, savedAt: new Date().toISOString() })
  void publishShopEval(opts.storage, key, slotId(row))
  return advice
}

export function shopEvalGainTargets(score: ShopEvalScore, input: ShopEvalInput) {
  const preview = previewShopGains(score.score, String(input.offerPrice || ''))
  return {
    exposure: score.exposureLift > 0 ? score.exposureLift : preview.exposurePct,
    verify: score.verifyLift > 0 ? score.verifyLift : preview.verifyYuan,
  }
}
