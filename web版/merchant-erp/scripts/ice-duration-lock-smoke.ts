#!/usr/bin/env npx tsx
/** UI 设 10 秒时，指令框「单张 3-5 秒」不得把成片总长压到 4 秒 */
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const brief =
  '【剪辑指令】\n单张停留3-5秒；BGM轻快\n\n【字幕文案】\n「招牌面」'

const plan = parseIceEditBriefPlan(brief, { clipEndSec: 10, imageCount: 4, effectId: 'none' })
const sum = plan.imageDurations.reduce((a, b) => a + b, 0)

if (plan.totalDurationSec !== 10) {
  console.error('FAIL: totalDurationSec expected 10 got', plan.totalDurationSec)
  process.exit(1)
}
if (Math.abs(sum - 10) > 0.05) {
  console.error('FAIL: image duration sum expected ~10 got', sum)
  process.exit(1)
}

console.log('OK: clipEndSec locks total duration despite per-image hints in brief')
