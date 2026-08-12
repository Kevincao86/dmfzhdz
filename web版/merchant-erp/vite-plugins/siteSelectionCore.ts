/**
 * 选址参考：品牌属性理解 → 预想点位评估 → 地图热力 → 图文综合分 → 附近 2–3 点推荐
 */
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import {
  baiduFetchSiteAmenityContext,
  baiduOffsetLatLng,
  baiduPlaceNearby,
  baiduReverseGeocode,
  isBaiduMapConfigured,
  baiduQueryForIndustry,
  type BaiduLatLng,
  type BaiduNearbyPoi,
} from './baiduMapClient.js'
import {
  buildFootTrafficHeat7d,
  buildHeatMapGrid,
  type FootTrafficHeatReport,
  type HeatMapCell,
} from './siteSelectionHeat.js'
import { merchantAgentChatFromMessages } from './merchantAiUpstream.js'

async function mergeStoreIntelAiEnv(env: Record<string, string>): Promise<Record<string, string>> {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('./merchantRegistryVendorEnv.js')
  return mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), env)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function scoreDimensions(input: {
  competitorCount: number
  transit: number
  office: number
  residential: number
  mall: number
  school: number
  industry: string
}): {
  overall: number
  dimensions: Array<{ key: string; label: string; score: number; note: string }>
  verdict: string
} {
  const { competitorCount, transit, office, residential, mall, school, industry } = input

  let competition = 72
  if (competitorCount <= 1) competition = 58
  else if (competitorCount <= 4) competition = 82
  else if (competitorCount <= 10) competition = 70
  else if (competitorCount <= 16) competition = 52
  else competition = 38

  const traffic = clamp(35 + transit * 9 + mall * 4, 20, 95)
  const catchment = clamp(30 + residential * 5 + office * 4 + school * 3 + mall * 5, 20, 95)

  let match = 68
  if (/足疗|美发|美容|餐饮|饮品|便利|数码/.test(industry)) match = 78
  if (mall >= 2 && /餐饮|饮品|美发|美容/.test(industry)) match += 6
  if (office >= 4 && /餐饮|饮品|便利|数码/.test(industry)) match += 5
  if (residential >= 5 && /便利|足疗|美发/.test(industry)) match += 5
  match = clamp(match, 30, 95)

  const risk = clamp(100 - Math.abs(competitorCount - 6) * 4 - (transit < 1 ? 12 : 0), 25, 92)

  const dimensions = [
    {
      key: 'competition',
      label: '竞争格局',
      score: Math.round(competition),
      note:
        competitorCount >= 12
          ? '同业密度偏高，需更强差异化与获客'
          : competitorCount <= 1
            ? '同业稀少，需验证需求是否真实存在'
            : '同业密度适中，利于对标与分流',
    },
    {
      key: 'traffic',
      label: '交通可达',
      score: Math.round(traffic),
      note: transit >= 3 ? '站点较密，路过客流潜力更好' : '公共交通偏弱，更依赖社区/目的性到店',
    },
    {
      key: 'catchment',
      label: '聚客配套',
      score: Math.round(catchment),
      note: '综合住宅、写字楼、商场、学校等配套密度',
    },
    {
      key: 'industryFit',
      label: '业态匹配',
      score: Math.round(match),
      note: industry ? `按「${industry}」与周边配套匹配估算` : '未指定类目，按通用零售服务估算',
    },
    {
      key: 'risk',
      label: '选址风险（展示分越高风险越高）',
      score: Math.round(100 - risk),
      note: '综合饱和度与可达性的风险代理分',
    },
  ]

  const overall = Math.round(
    competition * 0.22 + traffic * 0.22 + catchment * 0.28 + match * 0.2 + risk * 0.08,
  )

  let verdict = '谨慎观察'
  if (overall >= 78) verdict = '优先考虑'
  else if (overall >= 65) verdict = '可深入测算'
  else if (overall >= 50) verdict = '需条件改善'
  else verdict = '暂不建议'

  return { overall: clamp(overall, 1, 99), dimensions, verdict }
}

function topNames(pois: BaiduNearbyPoi[], n = 6): string[] {
  return pois
    .slice(0, n)
    .map((p) => {
      const dist =
        p.distanceM != null
          ? p.distanceM >= 1000
            ? `${(p.distanceM / 1000).toFixed(1)}km`
            : `${Math.round(p.distanceM)}m`
          : ''
      return dist ? `${p.name}（${dist}）` : p.name
    })
}

async function llmText(
  env: Record<string, string>,
  system: string,
  user: string,
): Promise<string | undefined> {
  try {
    const { text } = await merchantAgentChatFromMessages(env, 'qwen', undefined, system, user)
    const t = String(text ?? '').trim()
    if (t) return t
  } catch {
    /* fall through */
  }
  try {
    const { text } = await merchantAgentChatFromMessages(env, 'doubao', undefined, system, user)
    return String(text ?? '').trim() || undefined
  } catch {
    return undefined
  }
}

export async function buildFootTrafficHeatForAddress(
  env: Record<string, string>,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | { ok: true; heat: FootTrafficHeatReport }
  | { ok: false; message: string }
> {
  if (!isBaiduMapConfigured(env)) {
    return { ok: false, message: '未配置 BAIDU_MAP_AK' }
  }
  const ctx = await baiduFetchSiteAmenityContext(env, {
    address: opts.address,
    city: opts.city,
    industryPathOrName: opts.industryPathOrName,
    radiusM: opts.radiusM ?? 1500,
  })
  if (!ctx.ok) return ctx
  const heat = buildFootTrafficHeat7d({
    location: ctx.location,
    industryPathOrName: opts.industryPathOrName,
    competitorPois: ctx.competitorPois,
    amenityCounts: {
      transit: ctx.counts.transit,
      office: ctx.counts.office,
      residential: ctx.counts.residential,
      mall: ctx.counts.mall,
      school: ctx.counts.school,
    },
    radiusM: ctx.radiusM,
  })
  return { ok: true, heat }
}

async function scoreCandidateAtLocation(
  env: Record<string, string>,
  location: BaiduLatLng,
  industry: string,
  radiusM: number,
): Promise<{
  overall: number
  counts: { competitor: number; transit: number; mall: number; residential: number; office: number }
  scored: ReturnType<typeof scoreDimensions>
}> {
  const query = baiduQueryForIndustry(industry)
  const [comp, transit, mall, residential, office] = await Promise.all([
    baiduPlaceNearby(env, { location, query, radiusM, pageSize: 12 }),
    baiduPlaceNearby(env, { location, query: '地铁站$公交站', radiusM, pageSize: 10 }),
    baiduPlaceNearby(env, { location, query: '购物中心$商场', radiusM, pageSize: 8 }),
    baiduPlaceNearby(env, { location, query: '住宅区$小区', radiusM, pageSize: 10 }),
    baiduPlaceNearby(env, { location, query: '写字楼$办公楼', radiusM, pageSize: 10 }),
  ])
  const counts = {
    competitor: comp.ok ? comp.pois.length : 0,
    transit: transit.ok ? transit.pois.length : 0,
    mall: mall.ok ? mall.pois.length : 0,
    residential: residential.ok ? residential.pois.length : 0,
    office: office.ok ? office.pois.length : 0,
  }
  const scored = scoreDimensions({
    competitorCount: counts.competitor,
    transit: counts.transit,
    office: counts.office,
    residential: counts.residential,
    mall: counts.mall,
    school: 0,
    industry,
  })
  return { overall: scored.overall, counts, scored }
}

type RecommendSpot = {
  rank: number
  label: string
  address: string
  city?: string
  location: BaiduLatLng
  distanceM: number
  direction: string
  score: number
  verdict: string
  reason: string
  counts: { competitor: number; transit: number; mall: number }
}

async function findNearbyRecommendations(
  env: Record<string, string>,
  center: BaiduLatLng,
  industry: string,
  radiusM: number,
): Promise<RecommendSpot[]> {
  const dirs: Array<{ name: string; n: number; e: number }> = [
    { name: '东北', n: 480, e: 480 },
    { name: '东南', n: -520, e: 560 },
    { name: '西南', n: -500, e: -520 },
    { name: '西北', n: 560, e: -480 },
  ]

  const scored = (
    await Promise.all(
      dirs.map(async (d) => {
        const loc = baiduOffsetLatLng(center, d.n, d.e)
        const distanceM = Math.round(Math.hypot(d.n, d.e))
        const rev = await baiduReverseGeocode(env, loc)
        if (!rev.ok) return null
        const hit = await scoreCandidateAtLocation(env, loc, industry, radiusM)
        const reasonBits = [
          hit.counts.transit >= 2 ? '交通配套更好' : '',
          hit.counts.competitor <= 6 ? '竞争压力可控' : '同业偏密需差异化',
          hit.counts.mall >= 1 ? '靠近商场聚客' : '',
          hit.counts.residential >= 3 ? '社区到店潜力' : '',
        ].filter(Boolean)
        const labelBase = [rev.district, rev.street].filter(Boolean).join('') || `${d.name}方向`
        const spot: RecommendSpot = {
          rank: 0,
          label: `${labelBase}候选`,
          address: rev.address,
          city: rev.city,
          location: loc,
          distanceM,
          direction: d.name,
          score: hit.overall,
          verdict: hit.scored.verdict,
          reason: reasonBits.join('；') || '综合区位可作备选对比',
          counts: {
            competitor: hit.counts.competitor,
            transit: hit.counts.transit,
            mall: hit.counts.mall,
          },
        }
        return spot
      }),
    )
  ).filter((x): x is RecommendSpot => Boolean(x))

  scored.sort((a, b) => b.score - a.score)
  const picked: RecommendSpot[] = []
  for (const row of scored) {
    if (picked.length >= 3) break
    const tooClose = picked.some(
      (p) =>
        Math.hypot(
          (p.location.lat - row.location.lat) * 111_320,
          (p.location.lng - row.location.lng) * 111_320,
        ) < 350,
    )
    if (tooClose) continue
    picked.push({ ...row, rank: picked.length + 1 })
  }
  return picked
}

export async function runSiteSelectionCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }
  const aiEnv = await mergeStoreIntelAiEnv(env)

  let body: {
    address?: string
    city?: string
    /** 预想点位备注名 */
    spotLabel?: string
    brandName?: string
    brandStoreCount?: number
    industryPath?: string
    industryName?: string
    industryHint?: string
    margins?: { douyin?: number; meituan?: number; xhs?: number }
    brandNotes?: string
    radiusM?: number
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }

  const address = String(body.address ?? '').trim()
  if (!address) return { status: 400, body: { ok: false, error: 'address_required' } }
  const city = String(body.city ?? '').trim()
  const spotLabel = String(body.spotLabel ?? '').trim()
  const brandName = String(body.brandName ?? '').trim()
  const brandStoreCount = Number(body.brandStoreCount ?? 0)
  const industry =
    String(body.industryPath ?? body.industryHint ?? body.industryName ?? '').trim()
  const brandNotes = String(body.brandNotes ?? '').trim()
  const margins = body.margins
  const radiusM = Math.min(Math.max(Math.floor(Number(body.radiusM) || 1500), 500), 3000)

  if (!isBaiduMapConfigured(aiEnv)) {
    return {
      status: 503,
      body: { ok: false, error: 'baidu_map_not_configured', detail: '服务端未配置 BAIDU_MAP_AK' },
    }
  }

  const brandProfileLines = [
    brandName ? `品牌：${brandName}${brandStoreCount > 0 ? `（在营约 ${brandStoreCount} 家）` : ''}` : '品牌：未命名（以经营类目为准）',
    industry ? `经营类目：${industry}` : '',
    margins &&
    typeof margins.douyin === 'number' &&
    typeof margins.meituan === 'number' &&
    typeof margins.xhs === 'number'
      ? `毛利目标：抖音 ${margins.douyin}% / 美团 ${margins.meituan}% / 小红书 ${margins.xhs}%`
      : '',
    brandNotes ? `补充：${brandNotes.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const brandUnderstanding =
    (await llmText(
      aiEnv,
      '你是本地生活选址顾问。根据商家已绑定的品牌/类目/毛利信息，用 3–5 句中文概括「该品牌适合什么样的点位」（客群、商圈类型、时段、应避开什么）。不要编造未给出的门店地址。',
      brandProfileLines || `经营类目：${industry || '未配置'}`,
    )) ||
    `该品牌以「${industry || '本地生活服务'}」为主营，选址应优先匹配目标客群可达性与合理同业密度，避开过度饱和红海并兼顾租金回收周期。`

  const ctx = await baiduFetchSiteAmenityContext(aiEnv, {
    address,
    city: city || undefined,
    industryPathOrName: industry || brandName,
    radiusM,
  })
  if (!ctx.ok) {
    return { status: 502, body: { ok: false, error: 'baidu_site_fetch_failed', detail: ctx.message } }
  }

  const scored = scoreDimensions({
    competitorCount: ctx.counts.competitor,
    transit: ctx.counts.transit,
    office: ctx.counts.office,
    residential: ctx.counts.residential,
    mall: ctx.counts.mall,
    school: ctx.counts.school,
    industry: industry || brandName,
  })

  const heat = buildFootTrafficHeat7d({
    location: ctx.location,
    industryPathOrName: industry || brandName,
    competitorPois: ctx.competitorPois,
    amenityCounts: {
      transit: ctx.counts.transit,
      office: ctx.counts.office,
      residential: ctx.counts.residential,
      mall: ctx.counts.mall,
      school: ctx.counts.school,
    },
    radiusM: ctx.radiusM,
  })

  const amenityPois = [
    ...ctx.buckets.transit,
    ...ctx.buckets.mall,
    ...ctx.buckets.office,
    ...ctx.buckets.residential,
  ]
  const heatMapGrid: HeatMapCell[] = buildHeatMapGrid({
    center: ctx.location,
    pois: ctx.competitorPois,
    amenityPois,
    radiusM: Math.min(radiusM, 1200),
    gridHalf: 5,
  })

  const recommendations = await findNearbyRecommendations(
    aiEnv,
    ctx.location,
    industry || brandName || '休闲娱乐',
    radiusM,
  )

  const scoreStory =
    (await llmText(
      aiEnv,
      '你是选址报告撰稿人。根据品牌理解、点位得分与周边事实，用「图文报告」口吻写 4 段短文（每段 1–2 句）：①总评 ②优势 ③风险 ④落地建议。不要编造未出现的店名。',
      [
        `【品牌理解】\n${brandUnderstanding}`,
        `预想点位：${spotLabel || address}`,
        `地址：${address}${city ? `（${city}）` : ''}`,
        `综合分 ${scored.overall}（${scored.verdict}）`,
        `维度：${scored.dimensions.map((d) => `${d.label}${d.score}`).join('；')}`,
        `同业 ${ctx.counts.competitor}：${topNames(ctx.competitorPois, 5).join('、') || '无'}`,
        `交通 ${ctx.counts.transit}、商场 ${ctx.counts.mall}、写字楼 ${ctx.counts.office}、住宅 ${ctx.counts.residential}`,
        heat.insight,
        recommendations.length
          ? `备选推荐：${recommendations.map((r) => `${r.label}${r.score}分`).join('；')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )) ||
    [
      `总评：该预想点位综合分 ${scored.overall}/100，结论「${scored.verdict}」。`,
      `优势：交通站点约 ${ctx.counts.transit}、聚客配套（商场 ${ctx.counts.mall} / 住宅 ${ctx.counts.residential}）可支撑到店。`,
      `风险：同业约 ${ctx.counts.competitor} 家，需对照品牌定位做差异化与租金测算。`,
      `建议：结合下方热力图高峰区与备选点位，工作日/周末各蹲点验证门前流。`,
    ].join('\n')

  const checklist = [
    '对照品牌客群，确认该点位是否匹配（社区/办公/商圈）',
    '工作日与周末各蹲点 1–2 个高峰时段，校验门前过人流',
    '对比推荐备选点的可视性、停车与招牌政策',
    '用毛利目标反推盈亏平衡客单与日租上限',
  ]

  return {
    status: 200,
    body: {
      ok: true,
      address,
      city: city || undefined,
      spotLabel: spotLabel || undefined,
      brandName: brandName || undefined,
      industryHint: industry || undefined,
      brandUnderstanding,
      scoreStory,
      location: ctx.location,
      radiusM: ctx.radiusM,
      competitorQuery: ctx.competitorQuery,
      counts: ctx.counts,
      competitors: ctx.competitorPois.slice(0, 15).map((p) => ({
        name: p.name,
        address: p.address,
        distanceM: p.distanceM,
        tag: p.tag,
        overallRating: p.overallRating,
        location: p.location,
      })),
      amenities: {
        transit: topNames(ctx.buckets.transit),
        office: topNames(ctx.buckets.office),
        residential: topNames(ctx.buckets.residential),
        mall: topNames(ctx.buckets.mall),
        school: topNames(ctx.buckets.school),
      },
      score: scored,
      footTrafficHeat: heat,
      heatMapGrid,
      recommendations,
      checklist,
      summary: `【${brandName || '品牌'}】预想点位综合分 ${scored.overall}/100（${scored.verdict}）。${heat.insight}`,
    },
  }
}
