#!/usr/bin/env npx tsx
import {
  clampMixSourceInSec,
  ensureSequentialMixScriptRows,
  type IceMixMaterialSlot,
} from '../src/lib/iceMixPlan.ts'
import {
  buildIceMixSegmentsFromEditPlan,
  buildStructuralMixDecisions,
  enforceDiverseEditDecisions,
  fallbackMixEditDecisions,
  type IceMixMaterialProfile,
} from '../src/services/iceMixEditPlanAi.ts'
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
const profiles: IceMixMaterialProfile[] = [
  { index: 0, label: '门店', kind: 'video', description: '门店外观与招牌', estimatedDurationSec: 12 },
  { index: 1, label: '后厨', kind: 'video', description: '后厨烹饪操作过程', estimatedDurationSec: 12 },
  { index: 2, label: '成品', kind: 'video', description: '成品摆盘特写', estimatedDurationSec: 12 },
]

const structural = buildStructuralMixDecisions(fixed, materials, profiles)
if (new Set(structural.map((d) => d.materialIndex)).size < 2) {
  console.error('FAIL: structural should use multiple materials', structural)
  process.exit(1)
}

const decisions = fallbackMixEditDecisions(fixed, profiles, materials)
const allSameMat = new Set(decisions.map((d) => d.materialIndex)).size < 2
if (allSameMat && materials.length >= 2) {
  const enforced = enforceDiverseEditDecisions(decisions, fixed, materials, profiles)
  if (new Set(enforced.map((d) => d.materialIndex)).size < 2) {
    console.error('FAIL: enforce diversity', enforced)
    process.exit(1)
  }
}
const seg0 = decisions[0]!
const seg1 = decisions[1]!
if (seg0.materialIndex === seg1.materialIndex && seg0.sourceInSec === seg1.sourceInSec) {
  console.error('FAIL: should pick different clips', decisions)
  process.exit(1)
}
if (seg1.materialIndex !== 1) {
  console.error('FAIL: kitchen segment should map to material 1', seg1)
  process.exit(1)
}

const segments = buildIceMixSegmentsFromEditPlan(fixed, materials, decisions, 12)
if (segments.some((s) => s.sourceInSec == null || s.sourceInSec < 0)) {
  console.error('FAIL: missing sourceInSec', segments)
  process.exit(1)
}
if (segments[0]!.timelineStartSec !== 0 || segments[1]!.timelineStartSec > segments[0]!.timelineEndSec) {
  console.error('FAIL: timeline overlap', segments)
  process.exit(1)
}

const shortClipProfiles: IceMixMaterialProfile[] = [
  { index: 0, label: '短', kind: 'video', description: '门店', estimatedDurationSec: 4 },
]
const shortDecisions = fallbackMixEditDecisions(
  [{ timeRange: '0-4秒', visual: '成品特写', dialogue: 'test' }],
  shortClipProfiles,
)
const clampedIn = shortDecisions[0]!.sourceInSec
if (clampedIn > 1) {
  console.error('FAIL: sourceIn should clamp for 4s clip', clampedIn)
  process.exit(1)
}
if (clampMixSourceInSec(8, 4, 5) !== 1) {
  console.error('FAIL: clampMixSourceInSec', clampMixSourceInSec(8, 4, 5))
  process.exit(1)
}

console.log('OK: instruction-driven mix edit plan (semantic match + sourceInSec + clamp)')
