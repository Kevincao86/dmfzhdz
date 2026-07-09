#!/usr/bin/env npx tsx
import {
  clampMixSourceInSec,
  ensureSequentialMixScriptRows,
  type IceMixMaterialSlot,
} from '../src/lib/iceMixPlan.ts'
import {
  buildIceMixSegmentsFromSlots,
  produceIceMixPackage,
  resolveMixMaterialSlotMapping,
  validateMixSegmentDiversity,
} from '../src/services/iceMixProduceEngine.ts'
import type { ShortVideoScriptRow } from '../src/lib/shortVideoScriptTable.ts'

const rows: ShortVideoScriptRow[] = [
  { timeRange: '0-4秒', visual: '门店外观招牌', dialogue: '走进这家藏在巷子里的小店' },
  { timeRange: '0-4秒', visual: '后厨制作过程', dialogue: '师傅现做现卖' },
  { timeRange: '0-4秒', visual: '成品特写摆盘', dialogue: '这一口真的绝了' },
]
const fixed = ensureSequentialMixScriptRows(rows, 12)
if (fixed[1]?.timeRange !== '4-8秒') {
  console.error('FAIL: sequential rows', fixed.map((r) => r.timeRange))
  process.exit(1)
}

const materials: IceMixMaterialSlot[] = [
  { kind: 'video', mediaUrl: 'oss://a/v1.mp4', label: '门店' },
  { kind: 'video', mediaUrl: 'oss://a/v2.mp4', label: '后厨' },
  { kind: 'video', mediaUrl: 'oss://a/v3.mp4', label: '成品' },
]

const slots = resolveMixMaterialSlotMapping(fixed.length, materials, [0, 0, 0])
if (new Set(slots).size < 2) {
  console.error('FAIL: slot mapping must spread materials', slots)
  process.exit(1)
}

const segments = buildIceMixSegmentsFromSlots(fixed, materials, slots, 12)
const divErr = validateMixSegmentDiversity(segments, materials)
if (divErr) {
  console.error('FAIL: diversity', divErr, segments)
  process.exit(1)
}

const matIndices = segments.map((s) => s.materialIndex)
if (new Set(matIndices).size < 2) {
  console.error('FAIL: segments must use multiple materials', matIndices)
  process.exit(1)
}

if (segments[0]!.timelineStartSec !== 0 || segments[1]!.timelineStartSec < segments[0]!.timelineEndSec - 0.01) {
  console.error('FAIL: timeline overlap', segments)
  process.exit(1)
}

const produced = await produceIceMixPackage({
  rows: fixed,
  materials,
  materialSlots: slots,
  targetTotalSec: 12,
  effectId: 'trans_fade',
  subtitleStyleId: 'viral-white-pop',
})
if (!produced.ok) {
  console.error('FAIL: produceIceMixPackage', produced.message)
  process.exit(1)
}
if (produced.output.segments.length < 2) {
  console.error('FAIL: produce output segments')
  process.exit(1)
}

if (clampMixSourceInSec(8, 4, 5) !== 1) {
  console.error('FAIL: clampMixSourceInSec', clampMixSourceInSec(8, 4, 5))
  process.exit(1)
}

console.log('OK: ICE mix produce engine (forced multi-material + timeline + clamp)')
