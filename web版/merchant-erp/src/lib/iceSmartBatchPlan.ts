/** IMS 智能一键成片 — 前端/服务端共用的素材与分镜抽取 */

import { spreadMixMaterialIndex } from './iceMixPlan.js'
import {
  segmentCountFromTargetTotalSec,
  scriptTimeRangesFromDurationPlan,
  planLongformAllFiveSecondDurations,
} from './shortVideoScriptTable.js'

export type IceSmartBatchMaterial = {
  kind: 'video' | 'image'
  mediaUrl: string
  label?: string
}

export type IceSmartBatchScriptRow = {
  timeRange?: string
  visual?: string
  dialogue?: string
}

/** 段数须覆盖用户目标时长（30 秒 → 6×5 秒），不得仅按已有分镜行数缩水 */
export function pickSmartBatchSegmentCount(
  scriptRows: IceSmartBatchScriptRow[],
  materialCount: number,
  targetTotalSec: number,
): number {
  const planned = segmentCountFromTargetTotalSec(targetTotalSec, 5)
  const filledRows = scriptRows.filter(
    (r) =>
      String(r.visual ?? '').trim().length >= 4 ||
      String(r.dialogue ?? '').trim().length >= 2,
  ).length
  const rowBased = filledRows >= 2 ? Math.max(filledRows, 2) : scriptRows.filter((r) => String(r.dialogue ?? '').trim().length >= 2).length
  const want = Math.max(planned, rowBased >= 2 ? rowBased : 2)
  /** 全片每条素材最多用一次：段数不超过可用素材条数（≥2 条时） */
  const capByMaterials = materialCount >= 2 ? materialCount : want
  return Math.max(2, Math.min(want, capByMaterials))
}

/** 第 i 段分镜 → 素材下标（每条素材全片最多出现一次） */
export function pickSmartBatchMaterialIndices(
  materialCount: number,
  slots: number[],
  segmentCount: number,
): number[] {
  if (materialCount <= 0 || segmentCount <= 0) return []
  const effectiveCount = Math.min(segmentCount, materialCount)
  const used = new Set<number>()
  const out: number[] = []
  for (let i = 0; i < effectiveCount; i++) {
    const raw = slots[i]
    if (Number.isFinite(raw) && raw! >= 0 && raw! < materialCount && !used.has(raw!)) {
      used.add(raw!)
      out.push(raw!)
      continue
    }
    let mi = spreadMixMaterialIndex(i, effectiveCount, materialCount)
    let guard = 0
    while (used.has(mi) && guard++ < materialCount) {
      mi = (mi + 1) % materialCount
    }
    used.add(mi)
    out.push(mi)
  }
  return out
}

function padSmartBatchScriptRows(
  rows: IceSmartBatchScriptRow[],
  segmentCount: number,
  targetTotalSec: number,
): IceSmartBatchScriptRow[] {
  const plan = planLongformAllFiveSecondDurations(targetTotalSec)
  const ranges = scriptTimeRangesFromDurationPlan(plan.slice(0, segmentCount))
  const base = rows.slice(0, segmentCount)
  while (base.length < segmentCount) {
    const prev = base[base.length - 1] ?? rows[rows.length - 1]
    base.push({
      timeRange: ranges[base.length] ?? '',
      visual: prev?.visual?.trim() || '延续上一镜头，平滑过渡',
      dialogue: prev?.dialogue?.trim() || '',
    })
  }
  return base.slice(0, segmentCount).map((r, i) => ({
    ...r,
    timeRange: r.timeRange?.trim() ? r.timeRange : (ranges[i] ?? ''),
  }))
}

function smartBatchMaterialUrlKey(url: string): string {
  return String(url ?? '').trim().toLowerCase().replace(/\/+$/, '')
}

/** 按 URL 去重素材池；旧版前端展开重复项时 remap 回池内下标 */
export function dedupeSmartBatchMaterialPool(materials: IceSmartBatchMaterial[]): {
  pool: IceSmartBatchMaterial[]
  remapMaterialIndex: (index: number) => number
} {
  const pool: IceSmartBatchMaterial[] = []
  const urlToIndex = new Map<string, number>()
  for (const m of materials) {
    const key = smartBatchMaterialUrlKey(m.mediaUrl)
    if (!urlToIndex.has(key)) {
      urlToIndex.set(key, pool.length)
      pool.push(m)
    }
  }
  const remapMaterialIndex = (index: number): number => {
    const m = materials[index]
    if (!m) return 0
    return urlToIndex.get(smartBatchMaterialUrlKey(m.mediaUrl)) ?? 0
  }
  return { pool, remapMaterialIndex }
}

/** 网关/服务端：去重 + 规划，兼容旧版前端展开的 materials 列表 */
export function prepareSmartBatchSubmitPayload(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  materialSlots?: number[]
  targetTotalSec: number
}) {
  const { pool, remapMaterialIndex } = dedupeSmartBatchMaterialPool(input.materials)
  const baseMaterials = pool.length >= 2 ? pool : input.materials
  const rawSlots = input.materialSlots ?? []
  const remappedSlots =
    rawSlots.length > 0
      ? rawSlots
          .filter((n) => Number.isFinite(n) && n >= 0 && n < input.materials.length)
          .map((n) => remapMaterialIndex(Math.floor(n)))
      : undefined
  return buildSmartBatchSubmitPayload({
    materials: baseMaterials,
    scriptRows: input.scriptRows,
    materialSlots: remappedSlots,
    targetTotalSec: input.targetTotalSec,
  })
}

/** AI 规划后：按叙事顺序抽取 K 条素材，供 IMS 脚本化自动成片 */
export function buildSmartBatchSubmitPayload(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  materialSlots?: number[]
  targetTotalSec: number
}): {
  materials: IceSmartBatchMaterial[]
  materialSlots: number[]
  scriptRows: IceSmartBatchScriptRow[]
  segmentCount: number
} {
  const segmentCount = pickSmartBatchSegmentCount(
    input.scriptRows,
    input.materials.length,
    input.targetTotalSec,
  )
  const slots = (input.materialSlots ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0 && n < input.materials.length,
  )
  const pickedIndices = pickSmartBatchMaterialIndices(
    input.materials.length,
    slots,
    segmentCount,
  )
  const rows = padSmartBatchScriptRows(input.scriptRows, segmentCount, input.targetTotalSec)
  return {
    materials: input.materials,
    materialSlots: pickedIndices,
    scriptRows: rows,
    segmentCount,
  }
}
