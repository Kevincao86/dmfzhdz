#!/usr/bin/env npx tsx
/**
 * AI混剪：顺序时间轴 + 素材轮询 + 口播合并
 */
import {
  assignMixMaterialSlots,
  buildIceMixSegmentsFromScript,
  collectMixNarrationText,
  composeMixEditBrief,
  ensureSequentialMixScriptRows,
  normalizeMixMaterialSlots,
} from '../src/lib/iceMixPlan.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'
import type { ShortVideoScriptRow } from '../src/lib/shortVideoScriptTable.ts'

const overlappingRows: ShortVideoScriptRow[] = [
  { timeRange: '0-4秒', visual: '门店', dialogue: '欢迎来到我们的店' },
  { timeRange: '0-4秒', visual: '产品', dialogue: '这是招牌产品' },
  { timeRange: '0-4秒', visual: '后厨', dialogue: '新鲜现做' },
  { timeRange: '0-4秒', visual: '顾客', dialogue: '体验很好' },
]
const fixed = ensureSequentialMixScriptRows(overlappingRows, 20)
const starts = fixed.map((r) => r.timeRange)
if (starts[0] !== '0-5秒' || starts[1] !== '5-10秒' || starts[3] !== '15-20秒') {
  console.error('FAIL: ensureSequentialMixScriptRows', starts)
  process.exit(1)
}

const materials = [
  { kind: 'video' as const, mediaUrl: 'oss://a/v1.mp4', label: '素材1' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v2.mp4', label: '素材2' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v3.mp4', label: '素材3' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v4.mp4', label: '素材4' },
]

const stuckSlots = [0, 0, 0, 0]
const segments = buildIceMixSegmentsFromScript(overlappingRows, stuckSlots, materials, 20)
const idxs = segments.map((s) => s.materialIndex)
if (idxs.join(',') !== '0,1,2,3') {
  console.error('FAIL: material round-robin', idxs)
  process.exit(1)
}
const timelineStarts = segments.map((s) => s.timelineStartSec)
if (new Set(timelineStarts).size !== 4) {
  console.error('FAIL: timeline overlap', segments.map((s) => [s.timelineStartSec, s.timelineEndSec]))
  process.exit(1)
}

const narration = collectMixNarrationText(fixed)
if (!narration.includes('欢迎') || !narration.includes('体验')) {
  console.error('FAIL: collectMixNarrationText', narration)
  process.exit(1)
}

const brief = composeMixEditBrief('探店混剪', fixed)
const mixPlan = parseIceEditBriefPlan(brief, {
  clipEndSec: 20,
  effectId: 'trans_fade',
  mixMode: true,
})
if (mixPlan.bgmClip || mixPlan.sfxClips.length > 0) {
  console.error('FAIL: mixMode should not auto-add audio', mixPlan)
  process.exit(1)
}

if (assignMixMaterialSlots(5, 4).join(',') !== '0,1,2,3,0') {
  console.error('FAIL: assignMixMaterialSlots')
  process.exit(1)
}
if (normalizeMixMaterialSlots([0, 0, 0, 0, 0], 5, 4).join(',') !== '0,1,2,3,0') {
  console.error('FAIL: normalizeMixMaterialSlots')
  process.exit(1)
}

console.log('OK: ice mix sequential timeline + round-robin materials + narration')
