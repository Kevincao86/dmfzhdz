/** 与 Web `geoModuleSpec` / `geoScoresFromDouyinRows` 对齐的精简版（小程序门店字段较少时仍可估算） */

const HEALTHY_DAYS = 7
const GEO_WEIGHT = { info: 0.4, query: 0.35, fresh: 0.25 }

function clampPercent(n) {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, Math.round(x)))
}

function contentFreshnessPercentFromLastUpdate(lastUpdateMs) {
  const ageMs = Date.now() - lastUpdateMs
  if (ageMs <= 0) return 100
  const days = ageMs / (24 * 60 * 60 * 1000)
  if (days <= HEALTHY_DAYS) return 100
  const over = days - HEALTHY_DAYS
  return Math.max(0, Math.round(100 - over * 12))
}

function computeFromSimpleStores(rows) {
  /** @type {{id:string,name:string,address?:string}[]} */
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    return {
      inputs: { infoCompletenessPercent: 0, questionCoveragePercent: 0, contentFreshnessPercent: 0 },
      querySamples: [
        { q: '这家店营业到几点', covered: false },
        { q: '地址在哪里', covered: false },
      ],
      lastStructuredContentUpdateMs: Date.now(),
    }
  }

  function infoOne(s) {
    const checks = [Boolean(s.name?.trim()), Boolean(s.address?.trim())]
    return Math.round((checks.filter(Boolean).length / 2) * 100)
  }

  const infoCompletenessPercent = clampPercent(
    list.reduce((sum, s) => sum + infoOne(s), 0) / list.length,
  )

  const qChecks = [
    { q: '地址在哪里', covered: list.some((s) => Boolean(s.address?.trim())) },
    { q: '店名叫什么', covered: list.some((s) => Boolean(s.name?.trim())) },
  ]
  const covered = qChecks.filter((x) => x.covered).length
  const questionCoveragePercent = Math.round((covered / qChecks.length) * 100)

  const lastStructuredContentUpdateMs = Date.now()
  const contentFreshnessPercent = contentFreshnessPercentFromLastUpdate(lastStructuredContentUpdateMs)

  return {
    inputs: { infoCompletenessPercent, questionCoveragePercent, contentFreshnessPercent },
    querySamples: qChecks,
    lastStructuredContentUpdateMs,
  }
}

function computeGeoHealthScore(input) {
  const raw =
    clampPercent(input.infoCompletenessPercent) * GEO_WEIGHT.info +
    clampPercent(input.questionCoveragePercent) * GEO_WEIGHT.query +
    clampPercent(input.contentFreshnessPercent) * GEO_WEIGHT.fresh
  return Math.min(100, Math.max(0, Math.round(raw)))
}

module.exports = {
  computeFromSimpleStores,
  computeGeoHealthScore,
  contentFreshnessPercentFromLastUpdate,
  HEALTHY_DAYS,
}
