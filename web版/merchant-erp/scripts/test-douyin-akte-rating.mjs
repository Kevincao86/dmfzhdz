/**
 * 抖音餐饮评价星级/档位映射冒烟（与 douyinMerchantGateway 逻辑对齐）
 * node scripts/test-douyin-akte-rating.mjs
 */

function sentimentFromAkteRateLevel(level) {
  const n = Number(String(level ?? '').trim())
  if (!Number.isFinite(n)) return null
  if (n === 1) return 'good'
  if (n === 2) return 'neutral'
  if (n === 3) return 'bad'
  return null
}

function sentimentFromAkteScoreTier(level) {
  const n = Number(String(level ?? '').trim())
  if (!Number.isFinite(n)) return null
  if (n === 1) return 'bad'
  if (n === 2) return 'neutral'
  if (n === 3) return 'good'
  return null
}

function starsFromAkteRateLevel(level) {
  const tier = sentimentFromAkteRateLevel(level)
  if (tier === 'good') return 5
  if (tier === 'neutral') return 3
  if (tier === 'bad') return 1
  return 0
}

function starsFromAkteScoreTier(level) {
  const tier = sentimentFromAkteScoreTier(level)
  if (tier === 'good') return 5
  if (tier === 'neutral') return 3
  if (tier === 'bad') return 1
  return 0
}

function akteRateScoreToStars(rateScore) {
  const raw = String(rateScore ?? '').trim()
  if (!raw) return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > 100) return 0
  if (n >= 1 && n <= 3) return 0
  if (n >= 4 && n <= 5) return Math.round(n)
  if (n >= 11 && n <= 55 && n % 10 >= 1 && n % 10 <= 5) return n % 10
  if (n >= 10 && n <= 50 && n % 10 === 0) return Math.min(5, Math.round(n / 10))
  if (n >= 20 && n <= 100 && n % 20 === 0) return Math.min(5, Math.round(n / 20))
  return 0
}

function explicitStarLevelToStars(value) {
  const n = Number(String(value ?? '').trim())
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n)
  return 0
}

function pickAkteCommentStars(info, row = {}) {
  for (const c of [info.star_level, info.star, info.overall_score, row.star_level]) {
    const stars = explicitStarLevelToStars(c)
    if (stars > 0) return stars
  }
  for (const c of [info.rate_score, row.rate_score]) {
    const stars = akteRateScoreToStars(c)
    if (stars > 0) return stars
  }
  const tierStars =
    starsFromAkteRateLevel(info.rate_level ?? row.rate_level) ||
    starsFromAkteRateLevel(info.score_level ?? row.score_level)
  if (tierStars > 0) return tierStars
  const scoreTierOnly = starsFromAkteScoreTier(info.rate_score ?? row.rate_score)
  if (scoreTierOnly > 0) return scoreTierOnly
  return 0
}

function sentimentFromStars(stars) {
  if (stars >= 4) return 'good'
  if (stars >= 3) return 'neutral'
  return 'bad'
}

function mapRow(info, row = {}) {
  const stars = pickAkteCommentStars(info, row)
  const finalStars = stars > 0 ? stars : 3
  return {
    stars: finalStars,
    sentiment: sentimentFromStars(finalStars),
  }
}

function isEmptyMerchantProductListResponse(bodyText) {
  try {
    const data = JSON.parse(bodyText || '{}')
    if (data.ok === false) return false
    const raw = data.data?.items
    return Array.isArray(raw) && raw.length === 0
  } catch {
    return false
  }
}

function merchantApiFetchUrlCandidates(origin, path) {
  const out = []
  const add = (u) => {
    if (u && !out.includes(u)) out.push(u)
  }
  const rel = path.replace(/^\/api\//, '')
  add(`${origin}/erp-api/${rel}`)
  add(`${origin}${path}`)
  return out
}

const cases = [
  {
    name: '截图场景：rate_level=1 + rate_score=5 → 5星好评',
    info: { rate_level: 1, rate_score: 5, rate_text: '环境优雅服务热情' },
    want: { stars: 5, sentiment: 'good' },
  },
  {
    name: '截图场景：rate_level=1 + rate_score=100 → 5星好评',
    info: { rate_level: 1, rate_score: 100, rate_text: '技师很好' },
    want: { stars: 5, sentiment: 'good' },
  },
  {
    name: 'rate_level=3 无星级 → 1星差评',
    info: { rate_level: 3, rate_text: '非常差' },
    want: { stars: 1, sentiment: 'bad' },
  },
  {
    name: 'rate_score=1 差评档（仅档位）',
    info: { rate_score: 1, rate_text: '很差' },
    want: { stars: 1, sentiment: 'bad' },
  },
  {
    name: 'rate_score=3 好评档（仅档位）',
    info: { rate_score: 3, rate_text: '很好' },
    want: { stars: 5, sentiment: 'good' },
  },
  {
    name: 'rate_level=2 中评',
    info: { rate_level: 2 },
    want: { stars: 3, sentiment: 'neutral' },
  },
  {
    name: 'rate_score=60 三星(20分制)',
    info: { rate_score: 60 },
    want: { stars: 3, sentiment: 'neutral' },
  },
  {
    name: 'star_level=5 明确五星',
    info: { star_level: 5, rate_level: 3 },
    want: { stars: 5, sentiment: 'good' },
  },
  {
    name: 'star_level=1 明确一星',
    info: { star_level: 1, rate_level: 1 },
    want: { stars: 1, sentiment: 'bad' },
  },
  {
    name: '无字段默认中评',
    info: {},
    want: { stars: 3, sentiment: 'neutral' },
  },
]

let failed = 0
for (const c of cases) {
  const got = mapRow(c.info)
  const ok = got.stars === c.want.stars && got.sentiment === c.want.sentiment
  if (!ok) {
    failed += 1
    console.error('FAIL', c.name, 'want', c.want, 'got', got)
  } else {
    console.log('OK', c.name)
  }
}

const urls = merchantApiFetchUrlCandidates('https://cs.mofangdianai.com', '/api/meoo-douyin-goods-products')
if (urls[0] !== 'https://cs.mofangdianai.com/erp-api/meoo-douyin-goods-products') {
  failed += 1
  console.error('FAIL erp-api 应优先于 /api', urls)
} else {
  console.log('OK 商品 API erp-api 优先')
}

if (!isEmptyMerchantProductListResponse(JSON.stringify({ ok: true, data: { items: [] } }))) {
  failed += 1
  console.error('FAIL 空列表检测')
} else {
  console.log('OK 空列表检测')
}

if (isEmptyMerchantProductListResponse(JSON.stringify({ ok: true, data: { items: [{ id: '1' }] } }))) {
  failed += 1
  console.error('FAIL 非空列表误判')
} else {
  console.log('OK 非空列表不误判')
}

if (failed) {
  console.error(`\n${failed} case(s) failed`)
  process.exit(1)
}
console.log('\nAll 10+ akte/product smoke cases passed.')
