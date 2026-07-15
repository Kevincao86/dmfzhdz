/** IMS 智能一键成片 — 前端/服务端共用的素材与分镜抽取 */

import { spreadMixMaterialIndex } from './iceMixPlan.js'
import {
  segmentCountFromTargetTotalSec,
} from './shortVideoScriptTable.js'

/** 单段视频最长占用（秒）；超出时 IMS 会循环同一镜头导致末段画面重复 */
export const SMART_BATCH_MAX_VIDEO_SEGMENT_SEC = 4

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

/** 各段时长（秒）之和 = 目标总时长，避免 27s 目标却按 6×5s 提交导致末段循环补时 */
export function distributeSmartBatchSegmentDurations(
  segmentCount: number,
  targetTotalSec: number,
): number[] {
  const n = Math.max(2, segmentCount)
  const target = Math.min(120, Math.max(5, Math.ceil(targetTotalSec)))
  const each = target / n
  const out: number[] = []
  let used = 0
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(Math.max(2, Math.round((target - used) * 100) / 100))
      continue
    }
    const d = Math.max(2, Math.min(SMART_BATCH_MAX_VIDEO_SEGMENT_SEC, Math.round(each * 100) / 100))
    out.push(d)
    used += d
  }
  return out
}

export function scriptTimeRangesFromSegmentDurations(durations: number[]): string[] {
  let t = 0
  return durations.map((d) => {
    const start = Math.round(t * 100) / 100
    t = Math.round((t + d) * 100) / 100
    return `${start}-${t}秒`
  })
}

/** 段数须覆盖用户目标时长，且单段不宜过长以免 IMS 循环短视频素材 */
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
  const minNoLoop = Math.ceil(
    Math.min(120, Math.max(5, Math.ceil(targetTotalSec))) / SMART_BATCH_MAX_VIDEO_SEGMENT_SEC,
  )
  const want = Math.max(planned, rowBased >= 2 ? rowBased : 2, minNoLoop)
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
  const durations = distributeSmartBatchSegmentDurations(segmentCount, targetTotalSec)
  const ranges = scriptTimeRangesFromSegmentDurations(durations)
  const base = rows.slice(0, segmentCount)
  while (base.length < segmentCount) {
    base.push({
      timeRange: ranges[base.length] ?? '',
      visual: '',
      dialogue: '',
    })
  }
  return base.slice(0, segmentCount).map((r, i) => ({
    ...r,
    timeRange: ranges[i] ?? '',
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
