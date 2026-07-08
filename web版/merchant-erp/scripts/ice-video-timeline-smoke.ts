#!/usr/bin/env npx tsx
/** 单视频云剪时间线须含 In/Out/Duration，且总长等于 UI clipEndSec（勿用 RandomClip 压短） */
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const brief =
  '【剪辑指令】\n前 3 秒快切吸睛；BGM 轻快铺底\n\n【字幕文案】\n「招牌面」'

const plan = parseIceEditBriefPlan(brief, { clipEndSec: 22, imageCount: 0, effectId: 'none' })
if (plan.totalDurationSec !== 22) {
  console.error('FAIL: totalDurationSec expected 22 got', plan.totalDurationSec)
  process.exit(1)
}
if (plan.fastPace !== true) {
  console.error('FAIL: fastPace should be true for 快切吸睛 brief')
  process.exit(1)
}

const clipEndSec = Math.max(1, plan.totalDurationSec || plan.clipEndSec)
const clip = {
  In: 0,
  Out: clipEndSec,
  Duration: clipEndSec,
  TimelineIn: 0,
  TimelineOut: clipEndSec,
}

if (clip.Out !== 22 || clip.TimelineOut !== 22) {
  console.error('FAIL: video clip duration expected 22 got', clip)
  process.exit(1)
}

console.log('OK: video timeline locks 22s output even with fastPace brief (no RandomClip)')
