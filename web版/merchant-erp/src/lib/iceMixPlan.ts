/**
 * AI混剪：将分镜表 + 素材池映射为 ICE 时间线段（浏览器端与服务端共用）。
 */
import {
  maxScriptTimeRangeEndSec,
  parseScriptTimeRangeSeconds,
  dialogueLinesFromGuidance,
  pickMixDialogueHook,
  purifyMixScriptRowsDialogue,
  sanitizeMixDialogueText,
  isMixDialogueMetaInstruction,
  buildMixSpeakableNarration,
  planLongformAllFiveSecondDurations,
  scriptTimeRangesFromDurationPlan,
  segmentCountFromTargetTotalSec,
  type ShortVideoScriptRow,
} from './shortVideoScriptTable'

export type IceMixMaterialSlot = {
  kind: 'video' | 'image'
  mediaUrl: string
  signedMediaUrl?: string
  label: string
}

/** 单条主推商品（口播规划用） */
export type MixPromoItem = {
  mainProduct: string
  originalPrice: string
  salePrice: string
}

/** 混剪主推商品与价格（用户手填，供 AI 规划口播） */
export type MixPromoContext = {
  mainProduct?: string
  originalPrice?: string
  salePrice?: string
  /** 多条主推品；规划口播时首条用于报价，其余可在中段口播点名 */
  items?: MixPromoItem[]
}

function trimMixPromoItem(item: MixPromoItem): MixPromoItem {
  return {
    mainProduct: item.mainProduct.trim(),
    originalPrice: item.originalPrice.trim(),
    salePrice: item.salePrice.trim(),
  }
}

function isMixPromoItemFilled(item: MixPromoItem): boolean {
  const t = trimMixPromoItem(item)
  return Boolean(t.mainProduct || t.originalPrice || t.salePrice)
}

/** 从面板多条主推品归一化为规划上下文（首条为主报价品） */
export function mixPromoContextFromItems(items: MixPromoItem[]): MixPromoContext {
  const filled = items.map(trimMixPromoItem).filter(isMixPromoItemFilled)
  if (filled.length === 0) return {}
  const first = filled[0]!
  return {
    mainProduct: first.mainProduct || undefined,
    originalPrice: first.originalPrice || undefined,
    salePrice: first.salePrice || undefined,
    items: filled,
  }
}

export function isMixPromoFilled(promo?: MixPromoContext): boolean {
  if (!promo) return false
  if (promo.items?.some(isMixPromoItemFilled)) return true
  return Boolean(
    promo.mainProduct?.trim() || promo.originalPrice?.trim() || promo.salePrice?.trim(),
  )
}

export function formatMixPromoPlanningBlock(promo?: MixPromoContext): string {
  if (!isMixPromoFilled(promo)) return ''
  const items =
    promo!.items?.filter(isMixPromoItemFilled) ??
    (promo!.mainProduct?.trim() || promo!.originalPrice?.trim() || promo!.salePrice?.trim()
      ? [
          {
            mainProduct: promo!.mainProduct?.trim() ?? '',
            originalPrice: promo!.originalPrice?.trim() ?? '',
            salePrice: promo!.salePrice?.trim() ?? '',
          },
        ]
      : [])
  const productLines =
    items.length > 1
      ? items
          .map((it, i) => {
            const product = it.mainProduct || '（未填）'
            const orig = it.originalPrice || '（未填）'
            const sale = it.salePrice || '（未填）'
            return `${i + 1}. ${product} — 原价 ${orig} 元，优惠价 ${sale} 元`
          })
          .join('\n')
      : null
  const first = items[0]!
  const product = first.mainProduct || '（未填）'
  const orig = first.originalPrice || '（未填）'
  const sale = first.salePrice || '（未填）'
  return `【主推商品与价格（须写入口播）】
${productLines ?? `主推商品：${product}\n原价：${orig} 元\n优惠价：${sale} 元`}
口播要求（写死，禁止违反）：
- 中段恰好 1 段口播自然带出主推商品名（不含原价/优惠价数字）${items.length > 1 ? '；若有多个主推品可分散在不同中段，但每个品只提 1 次' : ''}
- 最后 1 段口播强调「原价 vs 优惠价」划算（全片仅此 1 段报价，以首条主推品价格为准）
- 禁止相邻两段或任意两段口播重复同一报价句；禁止多段复读「原价…优惠价…」`
}

function pickVariant(lines: string[], lineIndex = 0): string {
  const pool = lines.filter((l) => l.trim().length >= 4)
  if (pool.length === 0) return ''
  return pool[lineIndex % pool.length]!
}

function formatMixPriceYuan(raw?: string): string {
  const t = String(raw ?? '').trim().replace(/[元￥¥\s]/g, '')
  if (!t) return ''
  const n = Number(t)
  if (Number.isFinite(n) && n > 0) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
  }
  return t.slice(0, 8)
}

const PRODUCT_VISUAL_RE =
  /套餐|团购|产品|成品|摆盘|出货|菜品|牛排|肉|铁板|原切|食材|配菜|铁盘|意面/

function mixDialogueContainsPrice(promo: MixPromoContext, dialogue: string): boolean {
  const orig = formatMixPriceYuan(promo.originalPrice)
  const sale = formatMixPriceYuan(promo.salePrice)
  const d = dialogue.trim()
  if (!d) return false
  if (orig && sale && d.includes(orig) && d.includes(sale)) return true
  if (/原价|优惠价|活动价|日常价|现在\d|仅需\d/.test(d) && /\d/.test(d)) return true
  return false
}

function mixDialogueContainsProductName(product: string, dialogue: string): boolean {
  const name = product.trim()
  if (!name || name.length < 2) return false
  return dialogue.includes(name.slice(0, Math.min(name.length, 6)))
}

export type MixPromoDialogueSlot = 'product' | 'price'

/** 按段位生成商品/价格口播（须与画面大致匹配；全片商品名 1 次、报价 1 次） */
export function mixPromoDialogueForSegment(
  visual: string,
  segmentIndex: number,
  totalSegments: number,
  promo?: MixPromoContext,
  slot?: MixPromoDialogueSlot,
): string | null {
  if (!isMixPromoFilled(promo)) return null
  const product = promo!.mainProduct?.trim()
  const orig = formatMixPriceYuan(promo!.originalPrice)
  const sale = formatMixPriceYuan(promo!.salePrice)
  const v = visual.trim()
  const isLast = segmentIndex === totalSegments - 1

  if (slot === 'price' || (!slot && isLast)) {
    if (!orig || !sale) return null
    const name =
      product && (PRODUCT_VISUAL_RE.test(v) || isLast) ? `${product.slice(0, 12)}，` : ''
    return pickVariant(
      [
        `${name}原价${orig}，现在${sale}，太划算了！`,
        `${name}日常${orig}，活动价${sale}，赶紧冲！`,
      ],
      segmentIndex,
    ).slice(0, 28)
  }

  if (slot === 'product') {
    if (!product || !PRODUCT_VISUAL_RE.test(v)) return null
    return pickVariant(
      [
        `这款${product.slice(0, 10)}，到店必点！`,
        `${product.slice(0, 10)}品质在线，值得一试！`,
        `招牌${product.slice(0, 10)}，分量也很实在！`,
      ],
      segmentIndex,
    ).slice(0, 28)
  }

  if (!slot && !isLast && product && PRODUCT_VISUAL_RE.test(v)) {
    return pickVariant(
      [
        `这款${product.slice(0, 10)}，到店必点！`,
        `${product.slice(0, 10)}品质在线，值得一试！`,
      ],
      segmentIndex,
    ).slice(0, 28)
  }

  return null
}

export type IceMixSegmentPlan = {
  kind: 'video' | 'image'
  mediaUrl: string
  signedMediaUrl?: string
  materialIndex: number
  timelineStartSec: number
  timelineEndSec: number
  /** 源素材内截取起点（秒），混剪非从 0 秒硬切 */
  sourceInSec?: number
  /** 源素材内截取终点（秒） */
  sourceOutSec?: number
  caption?: string
}

/** 手机实拍短片默认时长（秒），用于规划截取点上限 */
export const MIX_DEFAULT_SOURCE_DURATION_SEC = 6

/** 将源片入点限制在 [0, 源时长 - 片段长] 内，避免 ICE Video.In > duration */
export function clampMixSourceInSec(
  sourceInSec: number,
  clipDurSec: number,
  sourceDurationSec?: number,
): number {
  const clipDur = Math.max(0.35, clipDurSec)
  let inSec = Math.max(0, sourceInSec)
  if (sourceDurationSec != null && sourceDurationSec > 0) {
    const maxIn = Math.max(0, sourceDurationSec - clipDur)
    inSec = Math.min(inSec, maxIn)
  }
  return inSec
}

export function resolveMixTotalDurationSec(rows: ShortVideoScriptRow[], fallbackSec: number): number {
  const target = Math.min(120, Math.max(1, Math.ceil(fallbackSec)))
  const maxEnd = maxScriptTimeRangeEndSec(rows)
  // 混剪：用户选择的目标时长为准，分镜 timeRange 不足时拉伸至目标，不因段数少压短成片
  if (target >= 5) return target
  if (maxEnd > 0) return Math.min(120, Math.max(1, maxEnd))
  return target
}

/** 分镜段数/时间轴不足时补齐至目标成片时长（如 20 秒 → 4×5 秒） */
export function ensureMixScriptRowsCoverTarget(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
  segmentSec = 5,
): ShortVideoScriptRow[] {
  const total = Math.min(120, Math.max(5, Math.ceil(targetTotalSec)))
  const plan = planLongformAllFiveSecondDurations(total)
  const targetCount = plan.length
  const ranges = scriptTimeRangesFromDurationPlan(plan)
  if (targetCount <= 0) return rows

  const base = rows.slice(0, targetCount)
  while (base.length < targetCount) {
    const prev = base[base.length - 1] ?? rows[rows.length - 1]
    base.push({
      timeRange: ranges[base.length] ?? `${base.length * segmentSec}-${(base.length + 1) * segmentSec}秒`,
      visual: prev?.visual?.trim() || '延续上一镜头，平滑过渡',
      dialogue: prev?.dialogue?.trim() || '',
    })
  }

  return finalizeMixScriptRows(
    base.slice(0, targetCount).map((r, i) => ({
      ...r,
      timeRange: ranges[i]!,
      visual: r.visual.trim() || '展示实拍画面',
      dialogue: r.dialogue.trim(),
    })),
  )
}

/** 去掉签名参数，用于判断是否为同一条 OSS 素材 */
export function canonicalMixMediaKey(url: string): string {
  const raw = url.trim()
  if (!raw) return ''
  if (raw.startsWith('oss://')) return raw.split('?')[0]!
  try {
    const u = new URL(raw)
    return `${u.hostname}${u.pathname}`
  } catch {
    return raw.split('?')[0]!
  }
}

/**
 * 混剪时间轴须首尾相接、无重叠（否则 ICE 只显示第一条）。
 * AI 分镜若返回重复「0-4秒」等，在此强制按段均分 0→total。
 */
export function ensureSequentialMixScriptRows(
  rows: ShortVideoScriptRow[],
  totalSec: number,
): ShortVideoScriptRow[] {
  if (rows.length === 0) return rows
  const total = Math.min(120, Math.max(1, totalSec))
  let lastEnd = 0
  let sequential = true
  for (const row of rows) {
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    if (!tr || tr.start + 0.05 < lastEnd) {
      sequential = false
      break
    }
    lastEnd = tr.end
  }
  if (sequential && lastEnd >= total - 0.5) return rows

  const each = total / rows.length
  return rows.map((row, i) => ({
    ...row,
    timeRange: `${formatMixSec(i * each)}-${formatMixSec((i + 1) * each)}秒`,
  }))
}

function formatMixSec(n: number): string {
  const v = Math.round(n * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** 各段口播合并为 TTS 全文（混剪讲解轨） */
export function collectMixNarrationText(
  rows: ShortVideoScriptRow[],
  targetSec?: number,
): string {
  return buildMixSpeakableNarration(
    rows.map((r) => r.dialogue),
    targetSec != null ? { targetSec } : undefined,
  )
}

/** 素材池裁剪后：按分镜行下标重映射 materialSlots，被剔除的位用均匀抽样补位（禁止 filter 丢段） */
export function remapMixMaterialSlotsForSubset(
  slots: number[],
  rowCount: number,
  poolLen: number,
  remapIndex: (oldIndex: number) => number,
): number[] {
  const count = Math.max(rowCount, slots.length)
  if (count <= 0 || poolLen <= 0) return []
  return Array.from({ length: count }, (_, i) => {
    const raw = slots[i]
    if (raw != null && raw >= 0) {
      const remapped = remapIndex(raw)
      if (remapped >= 0 && remapped < poolLen) return remapped
    }
    return spreadMixMaterialIndex(i, count, poolLen)
  })
}

/** 在素材池中均匀取第 i 段应对应的下标（段数少于素材数时避免总用前几条） */
export function spreadMixMaterialIndex(
  segmentIndex: number,
  segmentCount: number,
  poolLen: number,
): number {
  if (poolLen <= 0) return 0
  if (poolLen === 1) return 0
  if (segmentCount <= 1) return Math.min(segmentIndex, poolLen - 1)
  if (segmentCount >= poolLen) return segmentIndex % poolLen
  return Math.round((segmentIndex * (poolLen - 1)) / (segmentCount - 1))
}

/** 从素材池均匀抽样（用于视觉分析 / 截帧，覆盖首尾与中间） */
export function sampleMixMaterialsEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return [...items]
  if (max <= 1) return [items[0]!]
  const out: T[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (items.length - 1)) / (max - 1))
    out.push(items[idx]!)
  }
  return out
}

/** 混剪单段最短时长（秒）；为覆盖全部素材可短于 1 秒 */
export const MIX_MIN_CLIP_SEC = 0.75
/** 分镜/时间线最多段数（与 IMS 批量成片上限对齐） */
export const MIX_MAX_STORYBOARD_SEGMENTS = 48

/** 多素材混剪：段数 = 素材数，每条素材必须有一段（上限 48） */
export function resolveMixStoryboardSegmentCount(
  _targetTotalSec: number,
  _segmentSec: number,
  materialCount: number,
): number {
  if (materialCount <= 2) {
    return Math.max(2, materialCount)
  }
  return Math.min(materialCount, MIX_MAX_STORYBOARD_SEGMENTS)
}

/** 混剪 AI 规划失败时：从指导文案机械拆 6～12 段代表性分镜 */
export function buildMixPlannerFallbackRows(
  guidance: string,
  targetTotalSec: number,
): ShortVideoScriptRow[] {
  const total = Math.min(120, Math.max(5, Math.ceil(targetTotalSec)))
  const lines = dialogueLinesFromGuidance(guidance).filter((l) => !isMixDialogueMetaInstruction(l))
  const segmentCount = Math.min(
    12,
    Math.max(6, lines.length >= 6 ? Math.min(lines.length, 12) : Math.ceil(total / 3)),
  )
  const each = total / segmentCount
  const hook = pickMixDialogueHook(guidance, '精彩片段')

  const rows = Array.from({ length: segmentCount }, (_, i) => {
    const start = Math.round(i * each * 10) / 10
    const end = i === segmentCount - 1 ? total : Math.round((i + 1) * each * 10) / 10
    const line = lines[i % Math.max(1, lines.length)] || hook
    const visual = line.length >= 8 ? line.slice(0, 72) : `镜头${i + 1}：展示实拍画面`
    const dialogue = resolveMixSegmentDialogue({
      rawDialogue: line,
      visual,
      guidanceLines: lines,
      lineIndex: i,
      hook,
    })
    return {
      timeRange: `${start}-${end}秒`,
      visual,
      dialogue,
    }
  })
  return finalizeMixScriptRows(ensureSequentialMixScriptRows(rows, total))
}

/** 按目标时长 + 叙事逻辑生成 K 段分镜（K=时长/每段秒数，从素材池语义挑选，非每条素材一段） */
export function buildNarrativeMatchedMixCoverage(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[] = [],
  guidance = '',
  segmentSec = 5,
  profiles: MixNarrativeProfileInput[] = [],
): { rows: ShortVideoScriptRow[]; slots: number[] } {
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  const n = Math.max(2, Math.min(targetCount, materials.length))
  const profileList: MixNarrativeProfileInput[] =
    profiles.length >= materials.length
      ? profiles
      : materials.map((m, i) => ({
          index: i,
          label: m.label,
          description: m.label,
        }))
  const pattern = inferMixNarrativePattern(guidance, profileList)
  const slots = pickMaterialsForNarrativeSlots(n, materials, profileList, guidance)
  const total = Math.max(5, Math.ceil(targetTotalSec))
  const each = total / n
  const guidanceLines = dialogueLinesFromGuidance(guidance).filter(
    (l) => !isMixDialogueMetaInstruction(l),
  )
  const hook = pickMixDialogueHook(guidance, '精彩片段')
  const dialogues = sourceRows
    .map((r) => r.dialogue.trim())
    .filter((d) => d.length >= 2 && !/^（无口播）$/i.test(d))
  const visuals = sourceRows.map((r) => r.visual.trim()).filter((v) => v.length >= 2)

  const rows = Array.from({ length: n }, (_, i) => {
    const start = Math.round(i * each * 10) / 10
    const end = i === n - 1 ? total : Math.round((i + 1) * each * 10) / 10
    const mi = slots[i]!
    const matLabel = materials[mi]?.label || `素材${mi + 1}`
    const prof = profileList[mi]!
    const slotRole = segmentRoleForIndex(i, n, pattern)

    let visual =
      visuals[i % Math.max(1, visuals.length)] ||
      (slotRole === 'storefront' ? `门店门头/环境：${matLabel}` : `${matLabel}：展示实拍画面`)
    if (slotRole === 'storefront') {
      const storefrontVisual = visuals.find((v) => STOREFRONT_RE.test(v))
      if (storefrontVisual) visual = storefrontVisual
      else if (prof.description.trim().length >= 8) {
        visual = `门店门头/环境：${prof.description.slice(0, 72)}`
      }
    }

    let dialogue = ''
    if (slotRole === 'closing') {
      dialogue =
        guidanceLines.find((l) => CLOSING_RE.test(l)) ||
        guidanceLines[guidanceLines.length - 1] ||
        dialogues[dialogues.length - 1] ||
        `${hook}，欢迎到店体验！`
    } else if (slotRole === 'storefront') {
      dialogue =
        guidanceLines.find((l) => STOREFRONT_RE.test(l)) ||
        dialogues.find((d) => STOREFRONT_RE.test(d)) ||
        mixStorefrontGuideDialogue(hook)
    } else if (i === 0 && pattern === 'hook_opening') {
      dialogue = dialogues[0] || guidanceLines[0] || hook
    } else {
      const mid = guidanceLines.slice(1, Math.max(1, guidanceLines.length - 1))
      dialogue =
        dialogues[i % Math.max(1, dialogues.length)] ||
        mid[i % Math.max(1, mid.length)] ||
        guidanceLines[i % Math.max(1, guidanceLines.length)] ||
        hook
    }

    dialogue = resolveMixSegmentDialogue({
      rawDialogue: dialogue,
      visual,
      guidanceLines,
      lineIndex: i,
      hook,
    })

    return {
      timeRange: `${start}-${end}秒`,
      visual: visual.slice(0, 120),
      dialogue: dialogue.slice(0, 120),
    }
  })

  return {
    rows: finalizeMixScriptRows(ensureSequentialMixScriptRows(rows, total)),
    slots,
  }
}

/** 为每条素材生成一段分镜（时间均分，口播/画面从已有分镜轮询） */
export function buildAllMaterialCoverageRows(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[],
  guidance = '',
): ShortVideoScriptRow[] {
  const n = Math.max(2, materials.length)
  const total = Math.max(5, Math.ceil(targetTotalSec))
  const clipSec = total / n
  const dialogues = sourceRows
    .map((r) => r.dialogue.trim())
    .filter((d) => d.length >= 2 && !/^（无口播）$/i.test(d))
  const guidanceLines = dialogueLinesFromGuidance(guidance)
  const visuals = sourceRows.map((r) => r.visual.trim()).filter((v) => v.length >= 2)
  const hook = guidanceLines.find((l) => !isMixDialogueMetaInstruction(l)) || '精彩片段'

  const rows = Array.from({ length: n }, (_, i) => {
    const start = Math.round(i * clipSec * 10) / 10
    const end = i === n - 1 ? total : Math.round((i + 1) * clipSec * 10) / 10
    const matLabel = materials[i]?.label || `素材${i + 1}`
    return {
      timeRange: `${start}-${end}秒`,
      visual:
        visuals[i % Math.max(1, visuals.length)] ||
        `${matLabel}：展示本条实拍画面`,
      dialogue:
        dialogues[i % Math.max(1, dialogues.length)] ||
        guidanceLines[i % Math.max(1, guidanceLines.length)] ||
        hook,
    }
  })
  return ensureSequentialMixScriptRows(rows, total)
}

/** 每条素材至少出现一次的映射：段 i → 素材 i（段数须 ≥ 素材数） */
export function assignFullMaterialCoverageSlots(materialCount: number): number[] {
  return Array.from({ length: materialCount }, (_, i) => i)
}

/** 分镜段数不足时按目标时长扩展（素材多时语义挑选 K 段，非每条素材一段） */
export function expandMixRowsForMaterialPool(
  rows: ShortVideoScriptRow[],
  targetTotalSec: number,
  materialCount: number,
  segmentSec: number,
  materialLabels: Array<{ label: string }> = [],
  guidance = '',
  profiles: MixNarrativeProfileInput[] = [],
): ShortVideoScriptRow[] {
  if (materialCount <= 0) return rows
  const mats =
    materialLabels.length >= materialCount
      ? materialLabels
      : Array.from({ length: materialCount }, (_, i) => ({ label: `素材${i + 1}` }))
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  if (materialCount > targetCount) {
    return buildNarrativeMatchedMixCoverage(
      mats,
      targetTotalSec,
      rows,
      guidance,
      segmentSec,
      profiles,
    ).rows
  }
  if (rows.length >= materialCount) {
    return ensureSequentialMixScriptRows(rows, Math.max(5, Math.ceil(targetTotalSec)))
  }
  return buildAllMaterialCoverageRows(mats, targetTotalSec, rows, guidance)
}

/** 混剪提交前：按目标时长生成叙事分镜 + 素材映射 */
export function syncMixCoverageForAllMaterials(
  materials: Array<{ label: string }>,
  targetTotalSec: number,
  sourceRows: ShortVideoScriptRow[],
  guidance = '',
  profiles: MixNarrativeProfileInput[] = [],
  segmentSec = 5,
): { rows: ShortVideoScriptRow[]; slots: number[] } {
  const targetCount = mixTargetSegmentCount(targetTotalSec, segmentSec)
  if (materials.length > targetCount) {
    return buildNarrativeMatchedMixCoverage(
      materials,
      targetTotalSec,
      sourceRows,
      guidance,
      segmentSec,
      profiles,
    )
  }
  const rows = buildAllMaterialCoverageRows(materials, targetTotalSec, sourceRows, guidance)
  const slots = assignFullMaterialCoverageSlots(materials.length)
  return { rows, slots }
}

/** 混剪默认映射：段数 = 素材数时 0,1,…,N-1；否则均匀抽样 */
export function assignMixMaterialSlots(rowCount: number, poolLen: number): number[] {
  if (rowCount <= 0 || poolLen <= 0) return []
  if (rowCount === poolLen) return assignFullMaterialCoverageSlots(poolLen)
  return Array.from({ length: rowCount }, (_, i) => spreadMixMaterialIndex(i, rowCount, poolLen))
}

/**
 * 纠正「全部指向素材 0」：常见于先有空池再批量上传，或混剪成片误入素材池。
 * 当素材数 ≥ 2 且段数 ≥ 2 时，若映射全相同则自动轮询。
 */
export function normalizeMixMaterialSlots(
  slots: number[],
  rowCount: number,
  poolLen: number,
): number[] {
  const roundRobin = assignMixMaterialSlots(rowCount, poolLen)
  if (rowCount <= 0 || poolLen <= 0) return roundRobin
  const effective = Array.from({ length: rowCount }, (_, i) => {
    const raw = slots[i]
    const idx = raw == null ? roundRobin[i]! : Math.max(0, raw) % poolLen
    return idx
  })
  if (poolLen < 2 || rowCount < 2) return effective
  const uniq = new Set(effective)
  if (uniq.size === 1) return roundRobin
  return effective
}

/** @deprecated 轮播式映射，仅作兜底；一键混剪请用 buildIceMixSegmentsFromEditPlan */
export function buildIceMixSegmentsFromScript(
  rows: ShortVideoScriptRow[],
  _materialSlots: number[],
  materials: IceMixMaterialSlot[],
  fallbackTotalSec: number,
): IceMixSegmentPlan[] {
  if (!rows.length || !materials.length) return []
  const total = resolveMixTotalDurationSec(rows, fallbackTotalSec)
  const orderedRows = ensureSequentialMixScriptRows(rows, total)
  const slots = normalizeMixMaterialSlots(_materialSlots, orderedRows.length, materials.length)
  const segments: IceMixSegmentPlan[] = []
  let cursor = 0

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i]!
    const tr = parseScriptTimeRangeSeconds(row.timeRange)
    let start: number
    let end: number
    if (tr) {
      start = tr.start
      end = Math.min(total, tr.end)
    } else {
      const each = total / orderedRows.length
      start = cursor
      end = Math.min(total, cursor + each)
      cursor = end
    }
    if (end <= start) continue

    const matIdx = slots[i]!
    const mat = materials[matIdx]
    if (!mat) continue

    segments.push({
      kind: mat.kind,
      mediaUrl: mat.mediaUrl,
      signedMediaUrl: mat.signedMediaUrl,
      materialIndex: matIdx,
      timelineStartSec: start,
      timelineEndSec: end,
      caption: row.dialogue.trim() || undefined,
    })
  }
  return segments
}

/** 目标成片时长选项（秒） */
export const MIX_TARGET_TOTAL_OPTIONS = [10, 20, 30, 45, 60] as const

/** 从剪辑指令 + 分镜「画面/指令」列推断 ICE 转场（智能推断：按场景切换，默认硬切非叠化） */
export function inferIceEffectIdFromMixContent(
  instruction: string,
  rows: Array<{ visual: string }>,
): string {
  const blob = [instruction, ...rows.map((r) => r.visual)].join('\n')
  if (/随机转场/.test(blob)) return 'trans_random'
  if (/放大切换|放大转场|simplezoom/i.test(blob)) return 'trans_zoom'
  if (/向上擦除|上擦|wipeup/i.test(blob)) return 'trans_wipe_up'
  if (/向右擦除|擦除|wiperight/i.test(blob)) return 'trans_wipe'
  if (/方向推移|directional/i.test(blob)) return 'trans_directional'
  if (/蔓延溶解|perlin/i.test(blob)) return 'trans_perlin'
  if (/叠化|溶解/.test(blob) && /淡入淡出/.test(blob)) return 'fade_trans_fade'
  if (/叠化|溶解/.test(blob)) return 'trans_fade'
  if (/淡入淡出|柔和过渡/.test(blob)) return 'fade'

  const bucket = (visual: string): string => {
    const v = visual.trim()
    if (/门头|店招|门店|门面|外景/.test(v)) return 'storefront'
    if (/厨房|制作|烹饪|后厨|操作|加工/.test(v)) return 'process'
    if (/成品|菜品|特写|摆盘|牛排|酱汁|美食/.test(v)) return 'product'
    if (/试吃|品尝|顾客|体验/.test(v)) return 'experience'
    return 'other'
  }
  const buckets = rows.map((r) => bucket(r.visual)).filter((b) => b !== 'other')
  const unique = new Set(buckets)
  if (unique.size <= 1) return 'none'
  if (unique.has('storefront') && (unique.has('product') || unique.has('process'))) {
    return 'trans_directional'
  }
  if (unique.has('process') && unique.has('product')) return 'trans_wipe'
  if (unique.has('experience') && unique.has('product')) return 'trans_wipe_up'
  return 'none'
}

/** 由指导文案 + 分镜表合成 ICE editBrief（字幕、画面指令；BGM 仅写在剪辑指令段） */
export function composeMixEditBrief(instruction: string, rows: ShortVideoScriptRow[]): string {
  const inst = String(instruction || '').trim()
  const visualLines = rows.map((r) => r.visual.trim()).filter(Boolean)
  const copyLines = rows
    .map((r) => r.dialogue.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('「') ? t : `「${t.replace(/^["「]|["」]$/g, '')}」`))
  const copy = copyLines.join('\n')
  const visualBlock =
    visualLines.length > 0
      ? `【画面指令】\n${visualLines.map((v, i) => `段${i + 1}：${v}`).join('\n')}`
      : ''

  const parts: string[] = []
  if (inst) parts.push(`【剪辑指令】\n${inst}`)
  if (visualBlock) parts.push(visualBlock)
  if (copy) parts.push(`【字幕文案】\n${copy}`)
  return parts.join('\n\n')
}

/** 分镜是否具备可提交混剪的文案/指令 */
export function mixStoryboardBriefReady(
  guidance: string,
  rows: Array<{ visual: string; dialogue: string }>,
): boolean {
  if (guidance.trim().length >= 4) return true
  if (rows.some((r) => r.dialogue.trim().length >= 2)) return true
  if (rows.some((r) => r.visual.trim().length >= 4)) return true
  return false
}

/** 分镜表每段画面与口播均已填写（无空格） */
export function mixStoryboardRowsComplete(
  rows: Array<{ visual: string; dialogue: string }>,
): boolean {
  if (rows.length < 2) return false
  return rows.every((r) => r.visual.trim().length > 0 && r.dialogue.trim().length > 0)
}

/** 分镜表未填完整时的提示文案 */
export function mixStoryboardIncompleteHint(
  rows: Array<{ visual: string; dialogue: string }>,
): string | null {
  if (rows.length < 2) return '分镜至少 2 段（点「AI 规划分镜」）'
  const gaps = rows
    .map((r, i) => {
      const missing: string[] = []
      if (!r.visual.trim()) missing.push('画面')
      if (!r.dialogue.trim()) missing.push('口播')
      return missing.length ? `第 ${i + 1} 段缺${missing.join('、')}` : null
    })
    .filter((x): x is string => Boolean(x))
  if (gaps.length === 0) return null
  const shown = gaps.slice(0, 3).join('；')
  return `分镜表须逐格填写完整${gaps.length > 3 ? `（${shown}…）` : `（${shown}）`}`
}

/** 混剪素材画面叙事角色（探店/本地生活） */
export type MixMaterialNarrativeRole =
  | 'storefront'
  | 'product'
  | 'process'
  | 'experience'
  | 'ambience'
  | 'other'

/** 成片叙事结构：门头开场 或 卖点钩子开场 */
export type MixNarrativePattern = 'store_opening' | 'hook_opening'

export type MixNarrativeProfileInput = {
  index: number
  label: string
  description: string
  frameTimeline?: Array<{ atSec: number; description: string }>
}

export type MixSegmentNarrativeSlot = MixMaterialNarrativeRole | 'closing'

const STOREFRONT_RE =
  /门头|店招|招牌|门店外观|门面|入口处|店铺外观|外景|全景.*店|招牌字|店名|导航|地址|欢迎光临|进店/
const PRODUCT_RE =
  /套餐|团购|优惠|价格|菜品|产品|成品|摆盘|特写|出货|商品|卖点|分量|食材|出锅/
const PROCESS_RE = /制作|烹饪|后厨|操作|翻炒|下锅|加工|过程|熬制|装盘/
const EXPERIENCE_RE = /试吃|品尝|顾客|体验|人物.*吃|互动|推荐/
const CLOSING_RE = /下单|团购|赶紧|快来|收藏|关注|就在|欢迎.*到店|点击|马上/

/** 门头/到店指引口播（写死：仅用于门头镜头段） */
export function mixStorefrontGuideDialogue(storeHint = ''): string {
  const hint = sanitizeMixDialogueText(storeHint).slice(0, 16)
  if (
    hint.length >= 2 &&
    !isMixDialogueMetaInstruction(hint) &&
    !isMixDialogueMetaInstruction(storeHint)
  ) {
    return `认准${hint}这门头，导航直达不迷路，欢迎进店！`
  }
  return '认准门店门头，导航直达不迷路，欢迎进店体验！'
}

export type DeriveMixDialogueOpts = {
  lineIndex?: number
  totalRows?: number
  promo?: MixPromoContext
  /** 全片已出现过报价口播时跳过再生成报价 */
  skipPromoPrice?: boolean
  /** 全片已出现过商品名时跳过再生成商品口播 */
  skipPromoProduct?: boolean
}

/** 根据画面描述生成短口播（指导文案无法拆出可读句时的回退） */
export function deriveMixDialogueFromVisual(
  visual: string,
  fallback = '值得一看',
  opts?: DeriveMixDialogueOpts,
): string {
  const v = visual.trim()
  const idx = opts?.lineIndex ?? 0
  const total = opts?.totalRows ?? 1
  const isLast = idx === total - 1
  if (opts?.promo && isMixPromoFilled(opts.promo)) {
    if (!opts.skipPromoProduct && !isLast) {
      const productLine = mixPromoDialogueForSegment(v, idx, total, opts.promo, 'product')
      if (productLine && isMixDialogueAlignedWithVisual(v, productLine)) return productLine
    }
    if (!opts.skipPromoPrice && isLast) {
      const priceLine = mixPromoDialogueForSegment(v, idx, total, opts.promo, 'price')
      if (priceLine) return priceLine
    }
  }

  if (/行走|走路|脚步|人行道|腿部|石板路|走向|徒步|迈步/.test(v)) {
    return pickVariant(['走，咱们进店看看！', '就在前面，进店瞧瞧！', '脚步带路，马上到店！'], idx)
  }
  if (STOREFRONT_RE.test(v)) return mixStorefrontGuideDialogue(fallback)
  if (/厨师|大厨|手法|娴熟|透明手套|操作台/.test(v)) {
    return pickVariant(
      ['师傅手法娴熟，火候拿捏到位！', '后厨现做，看着就放心！', '专业操作，讲究每一个步骤！'],
      idx,
    )
  }
  if (/生肉|原切|未烹饪|拿起.*肉|红色.*肉|带骨/.test(v) && !/熟|焦|出锅|成品/.test(v)) {
    return pickVariant(
      ['看这原切品质，新鲜度拉满！', '食材新鲜，纹理一眼能打！', '这块肉成色真好，放心点！'],
      idx,
    )
  }
  if (/滋滋|冒热气|铁板|焦香|出锅/.test(v)) {
    return pickVariant(
      ['铁板滋滋作响，肉香扑鼻！', '现煎出炉，香气挡不住！', '热气腾腾，看着就饿了！'],
      idx,
    )
  }
  if (/配菜|煎蛋|意面|玉米|西兰花|副食/.test(v)) {
    return pickVariant(
      ['配菜丰富，玉米蛋面样样有！', '副食搭配讲究，吃得过瘾！', '一案好料，一口超满足！'],
      idx,
    )
  }
  if (PROCESS_RE.test(v)) {
    return pickVariant(
      ['后厨现做，新鲜靠谱看得见。', '现点现做，每一步都讲究！', '制作全程透明，吃得安心！'],
      idx,
    )
  }
  if (PRODUCT_RE.test(v)) {
    return pickVariant(
      ['这一口鲜嫩多汁，太满足了！', '摆盘精致，分量也很实在！', '出货瞬间，香味直接上头！'],
      idx,
    )
  }
  if (EXPERIENCE_RE.test(v)) {
    return pickVariant(['试吃一口，真的停不下来。', '入口惊艳，回味很足！', '吃过就懂，值得再来！'], idx)
  }
  if (/环境|氛围|装修|餐桌|用餐|全景/.test(v)) {
    return pickVariant(['环境氛围拉满，适合来打卡。', '用餐氛围很舒服，拍照也好看！', '店里格调在线，坐着很惬意！'], idx)
  }
  if (CLOSING_RE.test(v) || /结束|号召/.test(v)) {
    return pickVariant(
      ['心动就行动起来，欢迎到店体验！', '喜欢就别犹豫，赶紧来试试！', '就在附近，随时欢迎到店！'],
      idx,
    )
  }
  const short = sanitizeMixDialogueText(v)
  if (short.length >= 6 && short.length <= 32 && !isMixDialogueMetaInstruction(short)) {
    if (!/展示|镜头|画面|素材|段\d/.test(short)) return short.slice(0, 28)
  }
  return sanitizeMixDialogueText(fallback).slice(0, 28) || '值得一看'
}

function dialogueDedupeKey(dialogue: string): string {
  return dialogue.trim().replace(/\s+/g, '')
}

/** 口播是否语义相近（含重复报价、高重叠短句） */
export function isMixDialogueNearDuplicate(a: string, b: string, promo?: MixPromoContext): boolean {
  const ka = dialogueDedupeKey(a)
  const kb = dialogueDedupeKey(b)
  if (ka.length < 4 || kb.length < 4) return false
  if (ka === kb) return true
  if (promo && isMixPromoFilled(promo)) {
    if (mixDialogueContainsPrice(promo, a) && mixDialogueContainsPrice(promo, b)) return true
  }
  const shorter = ka.length <= kb.length ? ka : kb
  const longer = ka.length <= kb.length ? kb : ka
  if (shorter.length >= 10 && longer.includes(shorter.slice(0, Math.min(12, shorter.length)))) {
    return true
  }
  return false
}

/** 禁止多段口播重复或相近（尤其报价句） */
export function dedupeMixScriptDialogues(
  rows: ShortVideoScriptRow[],
  hook = '值得一看',
  promo?: MixPromoContext,
): ShortVideoScriptRow[] {
  const prior: string[] = []
  return rows.map((r, i) => {
    let dialogue = String(r.dialogue ?? '').trim()
    let guard = 0
    while (
      prior.some((p) => isMixDialogueNearDuplicate(p, dialogue, promo)) &&
      guard < 8
    ) {
      guard += 1
      dialogue = deriveMixDialogueFromVisual(r.visual, hook, {
        lineIndex: i + guard + prior.length,
        totalRows: rows.length,
        promo,
        skipPromoPrice: prior.some((p) => promo && mixDialogueContainsPrice(promo, p)),
        skipPromoProduct:
          Boolean(promo?.mainProduct?.trim()) &&
          prior.some((p) => mixDialogueContainsProductName(promo!.mainProduct!, p)),
      })
    }
    if (dialogue.trim().length >= 4) prior.push(dialogue.trim())
    return { ...r, dialogue: dialogue.slice(0, 120) }
  })
}

function findMixPromoProductSlotIndex(rows: ShortVideoScriptRow[]): number {
  for (let i = 0; i < rows.length - 1; i++) {
    if (PRODUCT_VISUAL_RE.test(String(rows[i]!.visual ?? ''))) return i
  }
  return rows.length >= 3 ? Math.floor(rows.length / 2) : 0
}

function injectMixPromoDialogues(
  rows: ShortVideoScriptRow[],
  promo?: MixPromoContext,
): ShortVideoScriptRow[] {
  if (!isMixPromoFilled(promo) || rows.length === 0) return rows
  const product = promo!.mainProduct?.trim()
  const orig = formatMixPriceYuan(promo!.originalPrice)
  const sale = formatMixPriceYuan(promo!.salePrice)
  const productSlot = product ? findMixPromoProductSlotIndex(rows) : -1
  const priceSlot = orig && sale ? rows.length - 1 : -1
  let productInjected = rows.some(
    (r) => product && mixDialogueContainsProductName(product, String(r.dialogue ?? '')),
  )
  let priceInjected = rows.some((r) => mixDialogueContainsPrice(promo!, String(r.dialogue ?? '')))

  return rows.map((r, i) => {
    const dialogue = String(r.dialogue ?? '').trim()
    if (
      i === productSlot &&
      product &&
      !productInjected &&
      !mixDialogueContainsProductName(product, dialogue) &&
      !mixDialogueContainsPrice(promo!, dialogue)
    ) {
      const promoLine = mixPromoDialogueForSegment(r.visual, i, rows.length, promo, 'product')
      if (promoLine) {
        productInjected = true
        return { ...r, dialogue: promoLine.slice(0, 120) }
      }
    }
    if (
      i === priceSlot &&
      !priceInjected &&
      !mixDialogueContainsPrice(promo!, dialogue)
    ) {
      const promoLine = mixPromoDialogueForSegment(r.visual, i, rows.length, promo, 'price')
      if (promoLine) {
        priceInjected = true
        return { ...r, dialogue: promoLine.slice(0, 120) }
      }
    }
    return r
  })
}

type MixSceneTag =
  | 'storefront'
  | 'process'
  | 'product_raw'
  | 'product_cooked'
  | 'side_dish'
  | 'dining'
  | 'walking'
  | 'experience'
  | 'closing'
  | 'other'

function tagVisualScene(visual: string): MixSceneTag[] {
  const v = visual.trim()
  const tags = new Set<MixSceneTag>()
  if (/行走|走路|脚步|人行道|腿部|石板路|走向|徒步|迈步/.test(v)) tags.add('walking')
  if (STOREFRONT_RE.test(v)) tags.add('storefront')
  if (/生肉|原切|未烹饪|拿起.*肉|带骨红|红色.*肉/.test(v) && !/熟|焦|出锅|成品/.test(v)) {
    tags.add('product_raw')
  }
  if (/配菜|煎蛋|意面|玉米|西兰花|副食/.test(v)) tags.add('side_dish')
  if (PROCESS_RE.test(v)) tags.add('process')
  if (PRODUCT_RE.test(v) && !tags.has('product_raw')) tags.add('product_cooked')
  if (/环境|氛围|装修|餐桌|用餐|全景|内景/.test(v)) tags.add('dining')
  if (EXPERIENCE_RE.test(v)) tags.add('experience')
  if (CLOSING_RE.test(v)) tags.add('closing')
  if (tags.size === 0) tags.add('other')
  return [...tags]
}

function tagDialogueScene(dialogue: string): MixSceneTag[] {
  const d = dialogue.trim()
  const tags = new Set<MixSceneTag>()
  if (/认准|门头|导航|进店|门店|店招/.test(d)) tags.add('storefront')
  if (/现做|后厨|制作|烹饪|煎|炒|铁板|滋滋|淋酱/.test(d)) tags.add('process')
  if (/原切|生肉|新鲜|食材|这块肉/.test(d)) tags.add('product_raw')
  if (/配菜|煎蛋|意面|玉米|西兰花/.test(d)) tags.add('side_dish')
  if (/鲜嫩|多汁|这一口|出货|摆盘|套餐|菜品|牛排/.test(d)) tags.add('product_cooked')
  if (/环境|氛围|打卡|用餐|全景|装修/.test(d)) tags.add('dining')
  if (/试吃|品尝|停不下来/.test(d)) tags.add('experience')
  if (/下单|团购|欢迎到店|行动起来|体验/.test(d)) tags.add('closing')
  if (/走.*进店|咱们进店/.test(d)) tags.add('walking')
  if (tags.size === 0) tags.add('other')
  return [...tags]
}

/** 口播是否与当前段画面语义一致 */
export function isMixDialogueAlignedWithVisual(visual: string, dialogue: string): boolean {
  const d = String(dialogue ?? '').trim()
  if (d.length < 4 || isMixDialogueMetaInstruction(d)) return false

  const vTags = tagVisualScene(visual)
  const dTags = tagDialogueScene(d)
  const vSet = new Set(vTags.filter((t) => t !== 'other'))
  const dSet = new Set(dTags.filter((t) => t !== 'other'))

  if (vSet.has('walking') && (dSet.has('dining') || dSet.has('side_dish') || dSet.has('closing'))) {
    return false
  }
  if (vSet.has('product_raw') && dSet.has('side_dish') && !dSet.has('product_raw')) return false
  if (vSet.has('process') && dSet.has('side_dish') && !vSet.has('side_dish')) return false
  if (vSet.has('walking') && dSet.has('product_cooked') && !dSet.has('walking')) return false
  if (vSet.has('product_raw') && dSet.has('dining') && !dSet.has('product_raw')) return false

  if (vSet.size === 0 || dSet.size === 0) return true

  for (const t of vSet) {
    if (dSet.has(t)) return true
  }

  const related: Partial<Record<MixSceneTag, MixSceneTag[]>> = {
    process: ['product_cooked', 'product_raw'],
    product_raw: ['process', 'product_cooked'],
    product_cooked: ['process', 'product_raw', 'experience'],
    storefront: ['walking', 'closing'],
    walking: ['storefront'],
    dining: ['experience', 'closing'],
    experience: ['product_cooked', 'dining'],
    closing: ['dining', 'storefront', 'experience'],
  }
  for (const vt of vSet) {
    const rel = related[vt] ?? []
    for (const dt of dSet) {
      if (rel.includes(dt)) return true
    }
  }
  return false
}

export type AlignMixDialogueOpts = {
  lineIndex?: number
  totalRows?: number
  promo?: MixPromoContext
}

/** 强制将单行口播与画面对齐 */
export function alignMixScriptRowDialogueToVisual(
  row: ShortVideoScriptRow,
  hook = '值得一看',
  opts?: AlignMixDialogueOpts,
): ShortVideoScriptRow {
  const visual = String(row.visual ?? '').trim()
  const dialogue = String(row.dialogue ?? '').trim()
  const cleaned = sanitizeMixDialogueText(dialogue)
  const speakable =
    cleaned.length >= 4 &&
    !isMixDialogueMetaInstruction(cleaned) &&
    !isMixDialogueMetaInstruction(dialogue)
  if (speakable && isMixDialogueAlignedWithVisual(visual, cleaned)) {
    return { ...row, dialogue: cleaned.slice(0, 120) }
  }
  const idx = opts?.lineIndex ?? 0
  const total = opts?.totalRows ?? 1
  const promoLine = mixPromoDialogueForSegment(visual, idx, total, opts?.promo)
  if (promoLine && (idx >= total - 1 || isMixDialogueAlignedWithVisual(visual, promoLine))) {
    return { ...row, dialogue: promoLine.slice(0, 120) }
  }
  return {
    ...row,
    dialogue: deriveMixDialogueFromVisual(visual, hook, {
      lineIndex: idx,
      totalRows: total,
      promo: opts?.promo,
    }).slice(0, 120),
  }
}

/** 分镜表口播终检：剔除提示语 + 强制与画面对齐 */
export function alignMixScriptRowsToVisual(
  rows: ShortVideoScriptRow[],
  hook = '探店实拍，值得期待',
  promo?: MixPromoContext,
): ShortVideoScriptRow[] {
  const total = rows.length
  return rows.map((r, i) =>
    alignMixScriptRowDialogueToVisual(r, hook, { lineIndex: i, totalRows: total, promo }),
  )
}

/** 规划出口统一终检（purify + 画面对齐 + 商品价 + 去重） */
export function finalizeMixScriptRows(
  rows: ShortVideoScriptRow[],
  hook = '探店实拍，值得期待',
  promo?: MixPromoContext,
): ShortVideoScriptRow[] {
  const purified = purifyMixScriptRowsDialogue(rows)
  const aligned = alignMixScriptRowsToVisual(purified, hook, promo)
  const withPromo = injectMixPromoDialogues(aligned, promo)
  return dedupeMixScriptDialogues(withPromo, hook, promo)
}

/** 将 AI/回退口播规范为可 TTS 朗读的短句 */
export function resolveMixSegmentDialogue(opts: {
  rawDialogue: string
  visual: string
  guidanceLines: string[]
  lineIndex: number
  hook: string
  totalRows?: number
  promo?: MixPromoContext
}): string {
  const raw = String(opts.rawDialogue ?? '').trim()
  if (raw && isMixDialogueMetaInstruction(raw)) {
    /* 指导文案摘要/提示语，不得进入口播列 */
  } else {
    const cleaned = sanitizeMixDialogueText(raw)
    if (
      cleaned.length >= 4 &&
      !isMixDialogueMetaInstruction(cleaned) &&
      isMixDialogueAlignedWithVisual(opts.visual, cleaned)
    ) {
      return cleaned.slice(0, 120)
    }
  }

  const speakable = opts.guidanceLines
    .filter((l) => !isMixDialogueMetaInstruction(l))
    .map((l) => sanitizeMixDialogueText(l))
    .filter((l) => l.length >= 4 && !isMixDialogueMetaInstruction(l))
  const fromGuidance = speakable[opts.lineIndex % Math.max(1, speakable.length)]
  if (fromGuidance && isMixDialogueAlignedWithVisual(opts.visual, fromGuidance)) {
    return fromGuidance.slice(0, 120)
  }

  const promoLine = mixPromoDialogueForSegment(
    opts.visual,
    opts.lineIndex,
    opts.totalRows ?? Math.max(1, opts.lineIndex + 1),
    opts.promo,
  )
  if (promoLine && isMixDialogueAlignedWithVisual(opts.visual, promoLine)) {
    return promoLine.slice(0, 120)
  }

  return deriveMixDialogueFromVisual(opts.visual, opts.hook, {
    lineIndex: opts.lineIndex,
    totalRows: opts.totalRows,
    promo: opts.promo,
  }).slice(0, 120)
}

function narrativeTextBlob(
  description: string,
  label?: string,
  frameTimeline?: Array<{ atSec: number; description: string }>,
): string {
  const beats = frameTimeline?.map((b) => b.description).join(' ') ?? ''
  return `${description} ${label ?? ''} ${beats}`.toLowerCase()
}

/** 根据 AI 画面描述判断素材叙事角色 */
export function classifyMixMaterialRole(
  description: string,
  label?: string,
  frameTimeline?: Array<{ atSec: number; description: string }>,
): MixMaterialNarrativeRole {
  const t = narrativeTextBlob(description, label, frameTimeline)
  if (STOREFRONT_RE.test(t)) return 'storefront'
  if (PRODUCT_RE.test(t)) return 'product'
  if (PROCESS_RE.test(t)) return 'process'
  if (EXPERIENCE_RE.test(t)) return 'experience'
  if (/环境|氛围|内景|装修|座位|大堂/.test(t)) return 'ambience'
  return 'other'
}

/** 与推广/产品明显无关的素材画面特征 */
const MIX_IRRELEVANT_RE =
  /截帧失败|无法识别|分析失败|画面模糊|纯风景|天空|云彩|马路|街景|车流|道路|绿化带|无关路人|随手拍|黑屏|测试画面|路面特写|窗外|阴天空|自拍|镜子|洗手台|停车场|电梯间|走廊空镜|与.*无关|无关内容|广告贴纸|水印满屏|聊天截图|手机界面|锁屏|桌面录屏/

const MIX_PROMOTION_HINT_RE =
  /套餐|团购|优惠|菜品|产品|门店|门头|制作|烹饪|试吃|体验|摆盘|食材|招牌|探店|美食|服务|环境|内景|装修|出货|后厨|分量|品牌/

/** 素材是否与推广/产品/门店相关（无关素材直接跳过，不进入成片） */
export function isMixMaterialPromotionRelevant(
  prof: MixNarrativeProfileInput,
  guidance = '',
): boolean {
  const desc = narrativeTextBlob(prof.description, prof.label, prof.frameTimeline)
  if (desc.length < 8) return false
  if (/截帧失败|无法识别|分析失败|画面模糊/i.test(desc)) return false

  const role = classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline)
  if (role === 'storefront' || role === 'product' || role === 'process' || role === 'experience') {
    return true
  }
  if (role === 'ambience' && MIX_PROMOTION_HINT_RE.test(desc)) return true
  if (MIX_IRRELEVANT_RE.test(desc) && !MIX_PROMOTION_HINT_RE.test(desc)) return false

  if (MIX_PROMOTION_HINT_RE.test(desc)) return true
  const g = guidance.trim().slice(0, 400)
  if (g.length >= 4) {
    const label = (prof.label || '').trim()
    if (label.length >= 2 && g.includes(label.slice(0, Math.min(6, label.length)))) return true
  }

  if (role === 'other') return false
  return false
}

/** 可参与混剪的素材下标（至少保留 2 条，避免无法成片） */
export function filterMixPromotionRelevantIndices(
  materials: Array<{ label: string }>,
  profiles: MixNarrativeProfileInput[],
  guidance = '',
): number[] {
  const relevant: number[] = []
  const scored: Array<{ idx: number; score: number }> = []
  for (let i = 0; i < materials.length; i++) {
    const prof = profiles[i] ?? {
      index: i,
      label: materials[i]!.label,
      description: materials[i]!.label,
    }
    const role = classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline)
    const roleScore =
      role === 'product'
        ? 5
        : role === 'storefront'
          ? 5
          : role === 'process' || role === 'experience'
            ? 4
            : role === 'ambience'
              ? 3
              : 1
    scored.push({ idx: i, score: roleScore })
    if (isMixMaterialPromotionRelevant(prof, guidance)) relevant.push(i)
  }
  if (relevant.length >= 2) return relevant
  if (relevant.length === 1 && materials.length >= 2) {
    const extra = scored.find((s) => s.idx !== relevant[0] && isMixMaterialPromotionRelevant(
      profiles[s.idx] ?? { index: s.idx, label: materials[s.idx]!.label, description: materials[s.idx]!.label },
      guidance,
    ))
    if (extra) return [relevant[0]!, extra.idx]
  }
  scored.sort((a, b) => b.score - a.score)
  const strict = scored
    .filter((s) =>
      isMixMaterialPromotionRelevant(
        profiles[s.idx] ?? { index: s.idx, label: materials[s.idx]!.label, description: materials[s.idx]!.label },
        guidance,
      ),
    )
    .map((s) => s.idx)
  if (strict.length >= 2) return strict.slice(0, Math.min(materials.length, strict.length))
  return scored.slice(0, Math.max(2, Math.min(materials.length, 2))).map((s) => s.idx)
}

/** 按有效下标裁剪素材池（剔除马路/截帧失败等无效镜头） */
export function subsetMixMaterialPoolByIndices(
  materials: IceMixMaterialSlot[],
  profiles: MixNarrativeProfileInput[],
  keepIndices: number[],
): {
  materials: IceMixMaterialSlot[]
  profiles: MixNarrativeProfileInput[]
  remapIndex: (oldIndex: number) => number
} {
  const uniq = [...new Set(keepIndices.filter((i) => i >= 0 && i < materials.length))]
  if (uniq.length < 2) {
    return {
      materials,
      profiles,
      remapIndex: (oldIndex) => oldIndex,
    }
  }
  const oldToNew = new Map<number, number>()
  uniq.forEach((old, ni) => oldToNew.set(old, ni))
  return {
    materials: uniq.map((i) => materials[i]!),
    profiles: uniq.map((i) => {
      const p = profiles.find((x) => x.index === i) ?? profiles[i]
      const ni = oldToNew.get(i)!
      return p
        ? { ...p, index: ni }
        : {
            index: ni,
            label: materials[i]!.label,
            kind: materials[i]!.kind,
            description: materials[i]!.label,
          }
    }),
    remapIndex: (oldIndex) => oldToNew.get(oldIndex) ?? -1,
  }
}

/** 分镜行文案/画面推断叙事角色 */
export function classifyRowNarrativeRole(visual: string, dialogue: string): MixSegmentNarrativeSlot {
  const t = `${visual} ${dialogue}`
  if (CLOSING_RE.test(t) || /结束|收尾|行动号召/.test(t)) return 'closing'
  if (STOREFRONT_RE.test(t)) return 'storefront'
  if (PRODUCT_RE.test(t)) return 'product'
  if (PROCESS_RE.test(t)) return 'process'
  if (EXPERIENCE_RE.test(t)) return 'experience'
  return 'other'
}

/** 是否存在门头/门店类素材 */
export function hasStorefrontMixMaterials(profiles: MixNarrativeProfileInput[]): boolean {
  return profiles.some(
    (p) => classifyMixMaterialRole(p.description, p.label, p.frameTimeline) === 'storefront',
  )
}

/** 推断叙事结构：有门头素材时写死优先门头开场；仅当文案明确要求门头收尾时才用 hook 模式 */
export function inferMixNarrativePattern(
  guidance: string,
  profiles: MixNarrativeProfileInput[],
): MixNarrativePattern {
  const g = guidance.trim()
  if (hasStorefrontMixMaterials(profiles)) {
    if (/门头.*收尾|结尾.*门头|收尾.*门头|片尾.*门头|最后.*门头/.test(g)) return 'hook_opening'
    return 'store_opening'
  }
  if (/先卖点|先套餐|先产品|开头.*吸引|钩子|劲爆|开头.*产品/.test(g)) return 'hook_opening'
  if (/先.*门店|门头.*开场|开头.*环境|先氛围/.test(g)) return 'store_opening'
  if (/门店|地址|导航|怎么找|在哪里|欢迎来|到店/.test(g)) return 'store_opening'
  return 'hook_opening'
}

/**
 * 写死门头素材位置：store_opening → 第 1 段；hook_opening → 倒数第 2 段（收尾前到店指引）。
 */
export function enforceStorefrontMaterialPlacement(
  picks: number[],
  materials: Array<{ label: string }>,
  profiles: MixNarrativeProfileInput[],
  guidance: string,
): number[] {
  if (picks.length < 2) return picks
  const pattern = inferMixNarrativePattern(guidance, profiles)
  let storefrontIdx = -1
  for (let i = 0; i < profiles.length; i++) {
    const prof = profiles[i] ?? { index: i, label: materials[i]!.label, description: materials[i]!.label }
    if (!isMixMaterialPromotionRelevant(prof, guidance)) continue
    if (classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline) === 'storefront') {
      storefrontIdx = i
      break
    }
  }
  if (storefrontIdx < 0) return picks

  const targetPos = pattern === 'store_opening' ? 0 : Math.max(0, picks.length - 2)
  const out = [...picks]
  const currentPos = out.indexOf(storefrontIdx)
  if (currentPos === targetPos) return out

  if (currentPos >= 0) {
    const swap = out[targetPos]!
    out[targetPos] = storefrontIdx
    out[currentPos] = swap
    return out
  }

  const displaced = out[targetPos]!
  out[targetPos] = storefrontIdx
  const fallbackPos = out.findIndex((mi, idx) => idx !== targetPos && mi !== storefrontIdx)
  if (fallbackPos >= 0) out[fallbackPos] = displaced
  else out[out.length - 1] = displaced
  return out
}

/** 按段序与叙事模式分配该段期望画面角色 */
export function segmentRoleForIndex(
  segmentIndex: number,
  segmentCount: number,
  pattern: MixNarrativePattern,
): MixSegmentNarrativeSlot {
  if (segmentCount <= 1) return 'product'
  const isFirst = segmentIndex === 0
  const isLast = segmentIndex === segmentCount - 1
  const isSecondLast = segmentIndex === segmentCount - 2

  if (isLast) return 'closing'

  if (pattern === 'store_opening') {
    if (isFirst) return 'storefront'
    if (isSecondLast && segmentCount >= 4) return 'product'
    if (isSecondLast) return 'experience'
    return segmentIndex <= 1 ? 'product' : 'process'
  }

  // hook_opening：产品钩子 → 中段 → 门头指引 → 结束语
  if (isFirst) return 'product'
  if (isSecondLast) return 'storefront'
  return 'product'
}

/** 素材角色与分镜槽位匹配得分 */
export function scoreMaterialRoleForSegment(
  materialRole: MixMaterialNarrativeRole,
  slotRole: MixSegmentNarrativeSlot,
): number {
  if (slotRole === 'closing') {
    if (materialRole === 'experience') return 10
    if (materialRole === 'product') return 8
    if (materialRole === 'storefront') return 5
    return 3
  }
  if (materialRole === slotRole) return 14
  const adj: Partial<Record<MixMaterialNarrativeRole, Partial<Record<MixSegmentNarrativeSlot, number>>>> = {
    storefront: { product: 3, ambience: 6, experience: 2 },
    product: { process: 8, experience: 6, storefront: 2, ambience: 4 },
    process: { product: 8, experience: 5 },
    experience: { product: 6, storefront: 4 },
    ambience: { storefront: 7, product: 4 },
    other: { product: 4, process: 3 },
  }
  return adj[materialRole]?.[slotRole] ?? 1
}

/** 按叙事顺序为 K 段分镜挑选素材（每条素材最多用一次） */
export function pickMaterialsForNarrativeSlots(
  targetSegmentCount: number,
  materials: Array<{ label: string }>,
  profiles: MixNarrativeProfileInput[],
  guidance: string,
): number[] {
  const eligible = new Set(
    filterMixPromotionRelevantIndices(materials, profiles, guidance),
  )
  const poolLen = eligible.size > 0 ? eligible.size : materials.length
  const n = Math.max(2, Math.min(targetSegmentCount, poolLen))
  const pattern = inferMixNarrativePattern(guidance, profiles)
  const used = new Set<number>()
  const picks: number[] = []

  for (let seg = 0; seg < n; seg++) {
    const slotRole = segmentRoleForIndex(seg, n, pattern)
    let bestIdx = -1
    let bestScore = -1

    for (let mi = 0; mi < materials.length; mi++) {
      if (used.has(mi)) continue
      if (eligible.size > 0 && !eligible.has(mi)) continue
      const prof = profiles[mi] ?? {
        index: mi,
        label: materials[mi]!.label,
        description: materials[mi]!.label,
      }
      if (!isMixMaterialPromotionRelevant(prof, guidance)) continue
      const matRole = classifyMixMaterialRole(prof.description, prof.label, prof.frameTimeline)
      let score = scoreMaterialRoleForSegment(matRole, slotRole)
      if (prof.description.trim().length >= 24) score += 2
      if (score > bestScore) {
        bestScore = score
        bestIdx = mi
      }
    }

    if (bestIdx < 0) {
      const candidates = [...eligible].filter((mi) => !used.has(mi))
      bestIdx =
        candidates[seg % Math.max(1, candidates.length)] ??
        spreadMixMaterialIndex(seg, n, materials.length)
      let guard = 0
      while (used.has(bestIdx) && guard++ < materials.length) {
        bestIdx = (bestIdx + 1) % materials.length
      }
    }
    used.add(bestIdx)
    picks.push(bestIdx)
  }
  return enforceStorefrontMaterialPlacement(picks, materials, profiles, guidance)
}

/** 目标时长对应的分镜段数（默认每段 5 秒） */
export function mixTargetSegmentCount(targetTotalSec: number, segmentSec = 5): number {
  return segmentCountFromTargetTotalSec(targetTotalSec, segmentSec)
}
