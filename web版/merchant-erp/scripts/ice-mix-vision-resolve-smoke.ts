#!/usr/bin/env npx tsx
/**
 * 混剪视觉描述解析回归（无需 AI 鉴权）
 */
import { resolveMixVisionNotes } from '../src/services/iceMixGuidanceAi.ts'
import type { IceMixMaterialProfile } from '../src/services/iceMixEditPlanAi.ts'

const stubs: IceMixMaterialProfile[] = [
  { index: 0, label: 'IMG_2071', kind: 'video', description: 'IMG_2071' },
  { index: 1, label: 'IMG_2074', kind: 'video', description: 'IMG_2074' },
]

const batchText =
  '素材1：门店外观，暖色灯光，可见招牌与玻璃门，适合探店开场。\n\n素材2：后厨操作台，厨师正在摆盘，食材新鲜，色调明亮。'

const notes = resolveMixVisionNotes(stubs, batchText)
if (!notes || notes.length < 24) {
  console.error('FAIL: should use batchVisionText when profiles are stubs', notes)
  process.exit(1)
}
if (/IMG_2071/.test(notes)) {
  console.error('FAIL: should not use filename-only stubs', notes)
  process.exit(1)
}

const goodProfiles: IceMixMaterialProfile[] = [
  {
    index: 0,
    label: 'a',
    kind: 'video',
    description: '门店外观，暖色灯光，可见招牌与玻璃门，适合探店开场。',
  },
]
const fromProfiles = resolveMixVisionNotes(goodProfiles, '')
if (!fromProfiles.includes('门店外观')) {
  console.error('FAIL: should prefer profile descriptions', fromProfiles)
  process.exit(1)
}

console.log('OK: resolveMixVisionNotes batch fallback + profile priority')
