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
  /** 段数按目标时长铺满（30s→6 段），不得因素材条数少而缩水 */
  return Math.max(2, want)
}

/** 第 i 段分镜 → 素材下标（materialSlots[i] 语义，禁止把 slots 当成无序集合再均匀补位） */
export function pickSmartBatchMaterialIndices(
  materialCount: number,
  slots: number[],
  segmentCount: number,
): number[] {
  if (materialCount <= 0 || segmentCount <= 0) return []
  if (materialCount <= segmentCount) {
    return Array.from({ length: segmentCount }, (_, i) => i % materialCount)
  }
  const used = new Set<number>()
  const out: number[] = []
  for (let i = 0; i < segmentCount; i++) {
    const raw = slots[i]
    if (Number.isFinite(raw) && raw! >= 0 && raw! < materialCount && !used.has(raw!)) {
      used.add(raw!)
      out.push(raw!)
      continue
    }
    let mi = spreadMixMaterialIndex(i, segmentCount, materialCount)
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
