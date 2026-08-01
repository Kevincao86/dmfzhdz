/**
 * 商家平台逐单落库 / 查询 / 店铺分析聚合（Postgres）
 */
import pg from 'pg'
import { readRegistryPgConnectionString } from '../src/lib/registrySnapshotPgAppend.js'
import type { DouyinTradeOrderDetail } from './douyinMerchantGateway.js'

const { Client } = pg

function requirePgCs(): string {
  const cs = readRegistryPgConnectionString()
  if (!cs) throw new Error('postgres_not_configured')
  return cs
}

async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requirePgCs() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

export type MerchantOrderRow = {
  id: string
  tenantId: string
  platform: string
  orderId: string
  skuId: string
  skuName: string
  productId: string
  categoryL1: string
  categoryL2: string
  categoryL3: string
  payAmountFen: number
  refundAmountFen: number
  couponCount: number
  orderStatus: number | null
  payTime: string | null
  verifyTime: string | null
  openId: string
  syncedAt: string
}

function mapRow(r: Record<string, unknown>): MerchantOrderRow {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id),
    platform: String(r.platform),
    orderId: String(r.order_id),
    skuId: String(r.sku_id ?? ''),
    skuName: String(r.sku_name ?? ''),
    productId: String(r.product_id ?? ''),
    categoryL1: String(r.category_l1 ?? ''),
    categoryL2: String(r.category_l2 ?? ''),
    categoryL3: String(r.category_l3 ?? ''),
    payAmountFen: Number(r.pay_amount_fen) || 0,
    refundAmountFen: Number(r.refund_amount_fen) || 0,
    couponCount: Number(r.coupon_count) || 1,
    orderStatus: r.order_status == null ? null : Number(r.order_status),
    payTime: r.pay_time ? String(r.pay_time) : null,
    verifyTime: r.verify_time ? String(r.verify_time) : null,
    openId: String(r.open_id ?? ''),
    syncedAt: String(r.synced_at ?? ''),
  }
}

export async function upsertDouyinOrders(
  tenantId: string,
  orders: DouyinTradeOrderDetail[],
): Promise<{ upserted: number }> {
  if (!orders.length) return { upserted: 0 }
  return withClient(async (c) => {
    let upserted = 0
    for (const o of orders) {
      await c.query(
        `insert into public.merchant_platform_orders (
           tenant_id, platform, order_id, sku_id, sku_name, product_id,
           category_l1, category_l2, category_l3,
           pay_amount_fen, refund_amount_fen, coupon_count, order_status,
           pay_time, verify_time, open_id, raw_json, synced_at
         ) values (
           $1::uuid, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12, $13,
           $14::timestamptz, $15::timestamptz, $16, $17::jsonb, now()
         )
         on conflict (tenant_id, platform, order_id) do update set
           sku_id = excluded.sku_id,
           sku_name = excluded.sku_name,
           product_id = excluded.product_id,
           category_l1 = excluded.category_l1,
           category_l2 = excluded.category_l2,
           category_l3 = excluded.category_l3,
           pay_amount_fen = excluded.pay_amount_fen,
           refund_amount_fen = excluded.refund_amount_fen,
           coupon_count = excluded.coupon_count,
           order_status = excluded.order_status,
           pay_time = excluded.pay_time,
           verify_time = excluded.verify_time,
           open_id = excluded.open_id,
           raw_json = excluded.raw_json,
           synced_at = now()`,
        [
          tenantId,
          o.platform,
          o.orderId,
          o.skuId,
          o.skuName.slice(0, 500),
          o.productId,
          o.categoryL1.slice(0, 120),
          o.categoryL2.slice(0, 120),
          o.categoryL3.slice(0, 120),
          o.payAmountFen,
          o.refundAmountFen,
          o.couponCount,
          o.orderStatus,
          o.payTimeIso,
          o.verifyTimeIso,
          o.openId,
          JSON.stringify(o.raw).slice(0, 200_000),
        ],
      )
      upserted += 1
    }
    return { upserted }
  })
}

export async function listMerchantOrders(params: {
  tenantId: string
  platform?: string
  startYmd?: string
  endYmd?: string
  q?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: MerchantOrderRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30))
  const offset = (page - 1) * pageSize
  return withClient(async (c) => {
    const where: string[] = ['tenant_id = $1::uuid']
    const args: unknown[] = [params.tenantId]
    let i = 2
    if (params.platform && params.platform !== 'all') {
      where.push(`platform = $${i++}`)
      args.push(params.platform)
    }
    if (params.startYmd) {
      where.push(`pay_time >= ($${i++}::date)::timestamptz`)
      args.push(params.startYmd)
    }
    if (params.endYmd) {
      where.push(`pay_time < (($${i++}::date) + interval '1 day')::timestamptz`)
      args.push(params.endYmd)
    }
    if (params.q?.trim()) {
      where.push(`(order_id ilike $${i} or sku_name ilike $${i} or product_id ilike $${i})`)
      args.push(`%${params.q.trim().slice(0, 80)}%`)
      i += 1
    }
    const w = where.join(' and ')
    const countR = await c.query(`select count(*)::int as n from public.merchant_platform_orders where ${w}`, args)
    const total = Number(countR.rows[0]?.n) || 0
    const listR = await c.query(
      `select id, tenant_id, platform, order_id, sku_id, sku_name, product_id,
              category_l1, category_l2, category_l3,
              pay_amount_fen, refund_amount_fen, coupon_count, order_status,
              pay_time, verify_time, open_id, synced_at
         from public.merchant_platform_orders
        where ${w}
        order by pay_time desc nulls last, synced_at desc
        limit $${i} offset $${i + 1}`,
      [...args, pageSize, offset],
    )
    return { rows: listR.rows.map((r) => mapRow(r as Record<string, unknown>)), total }
  })
}

export type ShopAnalysisSummary = {
  orderCount: number
  couponCount: number
  salesAmountYuan: number
  refundAmountYuan: number
  refundRate: number
  buyerCount: number
  openIdCoverage: number
  newBuyerCount: number
  newBuyerSalesYuan: number
  newBuyerShare: number
  repurchaseRate: number
  estimatedGrossYuan: number
  categories: { name: string; level: 1 | 2 | 3; orderCount: number; salesYuan: number; share: number }[]
  topBySales: { name: string; productId: string; salesYuan: number; couponCount: number; share: number }[]
  topByRefund: { name: string; productId: string; refundYuan: number; refundRate: number }[]
}

export async function computeShopAnalysisSummary(params: {
  tenantId: string
  platform?: string
  startYmd: string
  endYmd: string
  marginPercent?: number
}): Promise<ShopAnalysisSummary> {
  return withClient(async (c) => {
    const where: string[] = [
      'tenant_id = $1::uuid',
      `pay_time >= ($2::date)::timestamptz`,
      `pay_time < (($3::date) + interval '1 day')::timestamptz`,
    ]
    const args: unknown[] = [params.tenantId, params.startYmd, params.endYmd]
    if (params.platform && params.platform !== 'all') {
      where.push('platform = $4')
      args.push(params.platform)
    }
    const w = where.join(' and ')
    const { rows } = await c.query(
      `select order_id, product_id, sku_name, category_l1, category_l2, category_l3,
              pay_amount_fen, refund_amount_fen, coupon_count, open_id, pay_time
         from public.merchant_platform_orders where ${w}`,
      args,
    )

    let salesFen = 0
    let refundFen = 0
    let couponCount = 0
    const buyers = new Map<string, number>()
    const withOpenId: string[] = []
    const byProduct = new Map<
      string,
      { name: string; productId: string; salesFen: number; refundFen: number; coupons: number }
    >()
    const byCat = new Map<string, { name: string; level: 1 | 2 | 3; salesFen: number; orders: number }>()

    for (const raw of rows) {
      const r = raw as Record<string, unknown>
      const pay = Number(r.pay_amount_fen) || 0
      const refund = Number(r.refund_amount_fen) || 0
      const coupons = Number(r.coupon_count) || 1
      salesFen += pay
      refundFen += refund
      couponCount += coupons
      const oid = String(r.open_id || '').trim()
      if (oid) {
        withOpenId.push(oid)
        buyers.set(oid, (buyers.get(oid) || 0) + 1)
      }
      const pid = String(r.product_id || r.order_id)
      const name = String(r.sku_name || '未命名')
      const cur = byProduct.get(pid) ?? { name, productId: pid, salesFen: 0, refundFen: 0, coupons: 0 }
      cur.salesFen += pay
      cur.refundFen += refund
      cur.coupons += coupons
      byProduct.set(pid, cur)

      const l2 = String(r.category_l2 || '').trim() || '未分类'
      const ck = `2:${l2}`
      const cat = byCat.get(ck) ?? { name: l2, level: 2 as const, salesFen: 0, orders: 0 }
      cat.salesFen += pay
      cat.orders += 1
      byCat.set(ck, cat)
    }

    const orderCount = rows.length
    const salesYuan = Math.round(salesFen) / 100
    const refundYuan = Math.round(refundFen) / 100
    const refundRate = salesYuan > 0 ? Math.round((refundYuan / salesYuan) * 10000) / 100 : 0

    // 新客：窗口内首次出现的 open_id（相对本租户历史）
    let newBuyerCount = 0
    let newBuyerSalesFen = 0
    if (withOpenId.length) {
      const unique = [...new Set(withOpenId)]
      const hist = await c.query(
        `select open_id, min(pay_time) as first_pay
           from public.merchant_platform_orders
          where tenant_id = $1::uuid and open_id = any($2::text[])
            and open_id <> ''
          group by open_id`,
        [params.tenantId, unique],
      )
      const firstMap = new Map<string, string>()
      for (const h of hist.rows) {
        firstMap.set(String(h.open_id), String(h.first_pay))
      }
      const startMs = new Date(`${params.startYmd}T00:00:00+08:00`).getTime()
      const endMs = new Date(`${params.endYmd}T23:59:59+08:00`).getTime()
      for (const raw of rows) {
        const r = raw as Record<string, unknown>
        const oid = String(r.open_id || '').trim()
        if (!oid) continue
        const first = firstMap.get(oid)
        if (!first) continue
        const t = new Date(first).getTime()
        if (t >= startMs && t <= endMs) {
          // 该买家窗口内算新客：仅计其在窗口内的销售额一次标记人数
        }
      }
      const newSet = new Set<string>()
      for (const oid of unique) {
        const first = firstMap.get(oid)
        if (!first) continue
        const t = new Date(first).getTime()
        if (t >= startMs && t <= endMs) newSet.add(oid)
      }
      newBuyerCount = newSet.size
      for (const raw of rows) {
        const r = raw as Record<string, unknown>
        const oid = String(r.open_id || '').trim()
        if (oid && newSet.has(oid)) newBuyerSalesFen += Number(r.pay_amount_fen) || 0
      }
    }

    const buyerCount = buyers.size
    const repurchaseBuyers = [...buyers.values()].filter((n) => n >= 2).length
    const repurchaseRate = buyerCount > 0 ? Math.round((repurchaseBuyers / buyerCount) * 10000) / 100 : 0
    const openIdCoverage = orderCount > 0 ? Math.round((withOpenId.length / orderCount) * 10000) / 100 : 0
    const newBuyerSalesYuan = Math.round(newBuyerSalesFen) / 100
    const newBuyerShare = salesYuan > 0 ? Math.round((newBuyerSalesYuan / salesYuan) * 10000) / 100 : 0
    const margin = Math.min(95, Math.max(0, Number(params.marginPercent) || 0))
    const estimatedGrossYuan = Math.round(salesYuan * (margin / 100) * 100) / 100

    const categories = [...byCat.values()]
      .map((c) => ({
        name: c.name,
        level: c.level,
        orderCount: c.orders,
        salesYuan: Math.round(c.salesFen) / 100,
        share: salesYuan > 0 ? Math.round((c.salesFen / 100 / salesYuan) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.salesYuan - a.salesYuan)
      .slice(0, 20)

    const topBySales = [...byProduct.values()]
      .map((p) => ({
        name: p.name,
        productId: p.productId,
        salesYuan: Math.round(p.salesFen) / 100,
        couponCount: p.coupons,
        share: salesYuan > 0 ? Math.round((p.salesFen / 100 / salesYuan) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.salesYuan - a.salesYuan)
      .slice(0, 10)

    const topByRefund = [...byProduct.values()]
      .filter((p) => p.refundFen > 0)
      .map((p) => ({
        name: p.name,
        productId: p.productId,
        refundYuan: Math.round(p.refundFen) / 100,
        refundRate: p.salesFen > 0 ? Math.round((p.refundFen / p.salesFen) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.refundYuan - a.refundYuan)
      .slice(0, 10)

    return {
      orderCount,
      couponCount,
      salesAmountYuan: salesYuan,
      refundAmountYuan: refundYuan,
      refundRate,
      buyerCount,
      openIdCoverage,
      newBuyerCount,
      newBuyerSalesYuan,
      newBuyerShare,
      repurchaseRate,
      estimatedGrossYuan,
      categories,
      topBySales,
      topByRefund,
    }
  })
}

function buildOptimizationSuggestions(summary: ShopAnalysisSummary): string[] {
  const tips: string[] = []
  const head = summary.topBySales[0]
  const refundHead = summary.topByRefund[0]
  const topCat = summary.categories[0]
  const top3Share = summary.topBySales.slice(0, 3).reduce((s, x) => s + x.share, 0)

  if (summary.refundRate >= 25) {
    tips.push(
      `退款率 ${summary.refundRate}% 明显偏高：优先核查核销规则、库存与客诉话术；对退款 TOP 商品做「下架/改规则/加说明」三选一。`,
    )
  } else if (summary.refundRate >= 15) {
    tips.push(
      `退款率 ${summary.refundRate}% 高于稳健区间：建议在商品页补充适用人群/预约须知，并跟踪退款原因标签。`,
    )
  } else {
    tips.push(`退款率 ${summary.refundRate}% 整体可控，维持现有履约标准，并定期抽检差评关联商品。`)
  }

  if (refundHead && refundHead.refundRate >= 20) {
    tips.push(
      `「${refundHead.name}」退款率 ${refundHead.refundRate}%、退款额 ¥${refundHead.refundYuan.toLocaleString('zh-CN')}：优先优化该套餐（降价档/拆 SKU/加不可退说明）或暂停投放。`,
    )
  }

  if (head && head.share >= 25) {
    tips.push(
      `成交高度集中在「${head.name}」（${head.share}%）：可衍生 2～3 个连带套餐做连带销售，降低单品依赖风险。`,
    )
  } else if (top3Share >= 55) {
    tips.push(`TOP3 商品合计占比约 ${Math.round(top3Share)}%，结构偏集中：中腰部商品可做限时加码提升曝光。`)
  }

  if (topCat && (topCat.name === '未分类' || topCat.share >= 90)) {
    tips.push(
      `品类几乎全部归入「未分类」：请在商品同步后补齐一/二/三级类目，便于后续按品类做补货与投放。`,
    )
  } else if (topCat && topCat.share >= 70) {
    tips.push(
      `品类「${topCat.name}」贡献 ${topCat.share}%：可围绕该品类做系列套餐与套餐组合，同时测试 1 个跨品类引流款。`,
    )
  }

  if (summary.newBuyerShare >= 55 && summary.repurchaseRate < 20) {
    tips.push(
      `新客成交占比高（${summary.newBuyerShare}%）但复购率仅 ${summary.repurchaseRate}%：建议配「到店后复购券/会员价」，把新客沉淀为老客。`,
    )
  } else if (summary.repurchaseRate >= 30) {
    tips.push(`复购率 ${summary.repurchaseRate}% 表现不错：可对老客推专属加购礼或升杯套餐，抬升客单价。`)
  } else if (summary.buyerCount > 0) {
    tips.push(`复购率 ${summary.repurchaseRate}% 仍有提升空间：短信/私域对 7～14 天未复购客户做一次召回。`)
  }

  if (summary.openIdCoverage > 0 && summary.openIdCoverage < 40) {
    tips.push(
      `买家识别覆盖率仅 ${summary.openIdCoverage}%：部分订单无 open_id，客群指标仅供参考；以成交与退款榜为主做决策。`,
    )
  }

  if (summary.estimatedGrossYuan > 0 && summary.salesAmountYuan > 0) {
    const gm = Math.round((summary.estimatedGrossYuan / summary.salesAmountYuan) * 10000) / 100
    if (gm < 25) {
      tips.push(`按配置估算毛利率约 ${gm}% 偏低：复核门店毛利配置，并审视低毛利引流款是否拖累整体。`)
    }
  }

  if (!tips.length) {
    tips.push('数据量有限：先完成抖音订单同步，再结合门店实情调整套餐与投放。')
  }
  return tips.slice(0, 8)
}

export function buildShopAdviceFacts(summary: ShopAnalysisSummary, rangeLabel: string): string {
  const head = summary.topBySales[0]
  const topCat = summary.categories[0]
  const lowCat = [...summary.categories].sort((a, b) => a.salesYuan - b.salesYuan)[0]
  const suggestions = buildOptimizationSuggestions(summary)
  const lines = [
    `【生意经商品列表数据分析报告与优化建议】`,
    `统计区间：${rangeLabel}`,
    ``,
    `一、整体运营概况`,
    `· 共 ${summary.orderCount} 笔订单、成交券 ${summary.couponCount} 张，成交额 ¥${summary.salesAmountYuan.toLocaleString('zh-CN')}。`,
    `· 退款额 ¥${summary.refundAmountYuan.toLocaleString('zh-CN')}，退款率 ${summary.refundRate}%${summary.refundRate >= 20 ? '（偏高，核心风险）' : ''}。`,
    `· 可识别买家 ${summary.buyerCount} 人（open_id 覆盖率 ${summary.openIdCoverage}%）；新客 ${summary.newBuyerCount} 人，新客成交占比 ${summary.newBuyerShare}%；复购率 ${summary.repurchaseRate}%。`,
    `· 按商家配置毛利率估算毛利约 ¥${summary.estimatedGrossYuan.toLocaleString('zh-CN')}（非平台真实成本）。`,
    ``,
    `二、品类结构洞察`,
    topCat
      ? `· 核心品类「${topCat.name}」贡献成交 ¥${topCat.salesYuan.toLocaleString('zh-CN')}（${topCat.share}%），订单 ${topCat.orderCount} 笔。`
      : `· 品类数据不足（商品类目未回传时归入「未分类」）。`,
    lowCat && topCat && lowCat.name !== topCat.name
      ? `· 低贡献品类「${lowCat.name}」成交仅 ¥${lowCat.salesYuan.toLocaleString('zh-CN')}（${lowCat.share}%），需评估是否保留。`
      : ``,
    ``,
    `三、商品表现洞察`,
    head
      ? `· 成交 TOP1「${head.name}」成交 ¥${head.salesYuan.toLocaleString('zh-CN')}，占总成交 ${head.share}%。`
      : `· 暂无商品成交明细。`,
    summary.topBySales.length
      ? `· 成交额 TOP10：${summary.topBySales
          .slice(0, 10)
          .map((x, i) => `${i + 1}.${x.name.slice(0, 24)}`)
          .join('；')}`
      : ``,
    summary.topByRefund[0]
      ? `· 退款集中：TOP1「${summary.topByRefund[0].name}」退款 ¥${summary.topByRefund[0].refundYuan}，退款率 ${summary.topByRefund[0].refundRate}%。`
      : `· 区间内退款明细较少。`,
    ``,
    `四、针对性优化建议`,
    ...suggestions.map((t, i) => `${i + 1}. ${t}`),
  ]
  return lines.filter((x) => x !== undefined && x !== '').join('\n')
}
