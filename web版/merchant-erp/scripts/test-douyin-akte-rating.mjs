/**
 * 抖音餐饮评价星级/档位映射冒烟（与 douyinMerchantGateway 逻辑对齐）
 * node scripts/test-douyin-akte-rating.mjs
 */

function sentimentFromAkteTier(level) {
  const n = Number(String(level ?? '').trim())
  if (!Number.isFinite(n)) return null
  if (n === 1) return 'good'
  if (n === 2) return 'neutral'
  if (n === 3) return 'bad'
  return null
}

function starsFromAkteTier(level) {
  const tier = sentimentFromAkteTier(level)
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

function pickAkteCommentStars(info, row = {}) {
  const tierStars =
    starsFromAkteTier(info.rate_level ?? row.rate_level) ||
    starsFromAkteTier(info.score_level ?? row.score_level) ||
    starsFromAkteTier(info.rate_score ?? row.rate_score)
  if (tierStars > 0) return tierStars
  for (const c of [info.star_level, info.rate_score, row.rate_score]) {
    const stars = akteRateScoreToStars(c)
    if (stars > 0) return stars
  }
  return 0
}

function sentimentFromStars(stars) {
  if (stars >= 4) return 'good'
  if (stars >= 3) return 'neutral'
  return 'bad'
}

function mapRow(info) {
  const stars = pickAkteCommentStars(info)
  const tierSentiment =
    sentimentFromAkteTier(info.rate_level) ??
    sentimentFromAkteTier(info.score_level) ??
    sentimentFromAkteTier(info.rate_score)
  return {
    stars: stars || (tierSentiment === 'good' ? 5 : tierSentiment === 'bad' ? 1 : 3),
    sentiment: tierSentiment ?? sentimentFromStars(stars || 3),
  }
}

const cases = [
  { name: 'rate_score=1 好评档', info: { rate_score: 1, rate_text: '非常好' }, want: { stars: 5, sentiment: 'good' } },
  { name: 'rate_level=1', info: { rate_level: 1 }, want: { stars: 5, sentiment: 'good' } },
  { name: 'rate_score=3 差评档', info: { rate_score: 3 }, want: { stars: 1, sentiment: 'bad' } },
  { name: 'rate_score=100 五星', info: { rate_score: 100 }, want: { stars: 5, sentiment: 'good' } },
  { name: 'rate_score=60 三星(20分制)', info: { rate_score: 60 }, want: { stars: 3, sentiment: 'neutral' } },
  { name: 'rate_score=5 五星', info: { rate_score: 5 }, want: { stars: 5, sentiment: 'good' } },
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
if (failed) {
  console.error(`\n${failed} case(s) failed`)
  process.exit(1)
}
console.log('\nAll akte rating cases passed.')
