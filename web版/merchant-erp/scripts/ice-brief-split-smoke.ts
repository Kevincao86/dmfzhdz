#!/usr/bin/env npx tsx
import {
  composeIceEditBrief,
  sanitizeIceEditBriefBrandNoise,
  splitIceEditBrief,
} from '../src/lib/iceEditBriefCompose.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const copy = '「招牌牛肉面」\n「传承三十年」'
const instruction = '整体轻快；前 3 秒快切；BGM 轻快；淡入淡出转场'
const brief = composeIceEditBrief(copy, instruction)
const split = splitIceEditBrief(brief)

if (split.copy !== copy) {
  console.error('FAIL: split copy mismatch', split.copy)
  process.exit(1)
}
if (split.instruction !== instruction) {
  console.error('FAIL: split instruction mismatch', split.instruction)
  process.exit(1)
}

const plan = parseIceEditBriefPlan(brief, { clipEndSec: 10, imageCount: 3, effectId: 'none' })
if (!plan.segmentCaptions?.length) {
  console.error('FAIL: plan should include segment captions from copy box')
  process.exit(1)
}
if (!plan.bgmClip?.mediaUrl?.includes('ice-document-materials.oss-cn-shanghai.aliyuncs.com')) {
  console.error('FAIL: BGM should use IMS public audio', plan.bgmClip?.mediaUrl)
  process.exit(1)
}

const noisy = sanitizeIceEditBriefBrandNoise('灵祺AI云剪推荐「招牌面」')
if (noisy.includes('灵祺') || noisy.includes('云剪')) {
  console.error('FAIL: brand noise sanitize', noisy)
  process.exit(1)
}

console.log('OK: ice brief copy/instruction split + public BGM + brand sanitize')
