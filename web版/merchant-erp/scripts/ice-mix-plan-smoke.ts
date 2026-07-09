#!/usr/bin/env npx tsx
/**
 * AI混剪：素材轮询映射 + 不误加诗词 BGM
 */
import {
  assignMixMaterialSlots,
  buildIceMixSegmentsFromScript,
  composeMixEditBrief,
  normalizeMixMaterialSlots,
} from '../src/lib/iceMixPlan.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'
import type { ShortVideoScriptRow } from '../src/lib/shortVideoScriptTable.ts'

const rows: ShortVideoScriptRow[] = [
  { timeRange: '0-4', visual: '门店外观，暖色氛围', dialogue: '第一句' },
  { timeRange: '4-8', visual: '产品特写', dialogue: '第二句' },
  { timeRange: '8-12', visual: '后厨制作', dialogue: '第三句' },
  { timeRange: '12-16', visual: '顾客体验', dialogue: '第四句' },
  { timeRange: '16-20', visual: '成品展示', dialogue: '第五句' },
]
const materials = [
  { kind: 'video' as const, mediaUrl: 'oss://a/v1.mp4', label: '素材1' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v2.mp4', label: '素材2' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v3.mp4', label: '素材3' },
  { kind: 'video' as const, mediaUrl: 'oss://a/v4.mp4', label: '素材4' },
]

const stuckSlots = [0, 0, 0, 0, 0]
const normalized = normalizeMixMaterialSlots(stuckSlots, rows.length, materials.length)
if (new Set(normalized).size < 4) {
  console.error('FAIL: normalize should spread materials', normalized)
  process.exit(1)
}

const segments = buildIceMixSegmentsFromScript(rows, stuckSlots, materials, 20)
const urls = segments.map((s) => s.mediaUrl)
if (new Set(urls).size < 4) {
  console.error('FAIL: segments should use different materials', urls)
  process.exit(1)
}

const brief = composeMixEditBrief('探店种草，叙事节奏先氛围后卖点', rows)
const mixPlan = parseIceEditBriefPlan(brief, {
  clipEndSec: 20,
  effectId: 'trans_fade',
  mixMode: true,
})
if (mixPlan.bgmClip || mixPlan.sfxClips.length > 0) {
  console.error('FAIL: mixMode should not auto-add audio for narrative-only guidance', mixPlan)
  process.exit(1)
}

const briefWithBgm = composeMixEditBrief('探店种草；BGM 轻快铺底', rows)
const mixPlanBgm = parseIceEditBriefPlan(briefWithBgm, {
  clipEndSec: 20,
  effectId: 'trans_fade',
  mixMode: true,
})
if (!mixPlanBgm.bgmClip?.mediaUrl?.includes('m1.wav')) {
  console.error('FAIL: explicit BGM should use instrumental m1.wav', mixPlanBgm.bgmClip)
  process.exit(1)
}
if (mixPlanBgm.bgmClip.mediaUrl.includes('speech.mp3')) {
  console.error('FAIL: must not use speech demo track')
  process.exit(1)
}

if (assignMixMaterialSlots(5, 4).join(',') !== '0,1,2,3,0') {
  console.error('FAIL: assignMixMaterialSlots round-robin')
  process.exit(1)
}

console.log('OK: ice mix material round-robin + mixMode audio guards')
