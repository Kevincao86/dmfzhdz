/**
 * 选址参考：对齐市面选址工具常见能力（点位打分 / 竞品密度 / 交通与聚客配套 / 7 日热度 / 建议）
 */
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import {
  baiduFetchSiteAmenityContext,
  isBaiduMapConfigured,
  type BaiduNearbyPoi,
} from './baiduMapClient.js'
import { buildFootTrafficHeat7d, type FootTrafficHeatReport } from './siteSelectionHeat.js'
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

  // 竞品：过少缺验证、过多红海；甜区约 3–10
  let competition = 72
  if (competitorCount <= 1) {
    competition = 58
  } else if (competitorCount <= 4) {
    competition = 82
  } else if (competitorCount <= 10) {
    competition = 70
  } else if (competitorCount <= 16) {
    competition = 52
  } else {
    competition = 38
  }

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
      label: '选址风险（越低越好）',
      score: Math.round(100 - risk),
      note: '综合饱和度与可达性的风险代理分（展示分越高风险越高）',
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

async function llmSiteAdvice(
  env: Record<string, string>,
  prompt: string,
): Promise<string | undefined> {
  const system =
    '你是本地生活选址顾问。根据给定的点位打分与周边 POI 事实，用中文给出 4–6 条可执行选址建议，简洁分点，不要编造未给出的店名或数据。'
  try {
    const { text } = await merchantAgentChatFromMessages(env, 'qwen', undefined, system, prompt)
    const t = String(text ?? '').trim()
    if (t) return t
  } catch {
    /* fall through */
  }
  try {
    const { text } = await merchantAgentChatFromMessages(env, 'doubao', undefined, system, prompt)
    const t = String(text ?? '').trim()
    return t || undefined
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
  | { ok: true; heat: FootTrafficHeatReport; mapError?: undefined }
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
    storeName?: string
    industryPath?: string
    industryName?: string
    industryHint?: string
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
  const storeName = String(body.storeName ?? '').trim()
  const industry =
    String(body.industryPath ?? body.industryHint ?? body.industryName ?? '').trim()
  const radiusM = Math.min(Math.max(Math.floor(Number(body.radiusM) || 1500), 500), 3000)

  if (!isBaiduMapConfigured(aiEnv)) {
    return {
      status: 503,
      body: { ok: false, error: 'baidu_map_not_configured', detail: '服务端未配置 BAIDU_MAP_AK' },
    }
  }

  const ctx = await baiduFetchSiteAmenityContext(aiEnv, {
    address,
    city: city || undefined,
    industryPathOrName: industry || storeName,
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
    industry: industry || storeName,
  })

  const heat = buildFootTrafficHeat7d({
    location: ctx.location,
    industryPathOrName: industry || storeName,
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

  const checklist = [
    '核对日租/转让费与预估客单能否覆盖盈亏平衡',
    '工作日与周末各蹲点 1–2 个高峰时段，校验门前过人流',
    '对比同商圈 2–3 个备选点的可视性、停车与快递可达',
    '确认物业用途、消防与招牌政策是否匹配业态',
  ]

  const marketFeatures = [
    { name: '点位综合打分', desc: '竞争/交通/聚客/业态匹配多维评分（对齐经营通/慧眼类选址产品）' },
    { name: '竞品密度', desc: '百度周边同业 POI 实查与距离分布' },
    { name: '交通与聚客配套', desc: '地铁公交、写字楼、住宅、商场、学校密度' },
    { name: '近 7 日热度', desc: '区位代理热度指数（非信令客流）；可后续替换慧眼' },
    { name: '选址建议', desc: '结合打分与 POI 的可执行建议清单' },
  ]

  const advicePrompt = [
    storeName ? `候选店名/品牌：${storeName}` : '',
    `地址：${address}${city ? `（${city}）` : ''}`,
    industry ? `经营类目：${industry}` : '',
    `综合分 ${scored.overall}，结论：${scored.verdict}`,
    `维度：${scored.dimensions.map((d) => `${d.label}${d.score}`).join('；')}`,
    `同业 ${ctx.counts.competitor}：${topNames(ctx.competitorPois).join('、') || '无'}`,
    `交通 ${ctx.counts.transit}、写字楼 ${ctx.counts.office}、住宅 ${ctx.counts.residential}、商场 ${ctx.counts.mall}、学校 ${ctx.counts.school}`,
    heat.insight,
  ]
    .filter(Boolean)
    .join('\n')

  const aiAdvice = await llmSiteAdvice(aiEnv, advicePrompt)

  return {
    status: 200,
    body: {
      ok: true,
      address,
      city: city || undefined,
      storeName: storeName || undefined,
      industryHint: industry || undefined,
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
      checklist,
      marketFeatures,
      aiAdvice,
      summary: `点位综合分 ${scored.overall}/100（${scored.verdict}）。半径 ${Math.round(radiusM / 1000)}km 内同业约 ${ctx.counts.competitor} 家，交通站点 ${ctx.counts.transit}，商场 ${ctx.counts.mall}。${heat.insight}`,
    },
  }
}
