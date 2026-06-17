#!/usr/bin/env npx tsx
/** 校验多图时间线使用 RegisterMediaInfo 后的 MediaId，无需 ICE 凭证 */
import { buildTimelineFromImages } from '../vite-plugins/aliyunIceCore.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const plan = parseIceEditBriefPlan('自检', { clipEndSec: 6, imageCount: 2, effectId: 'none' })
const timeline = buildTimelineFromImages(
  ['mid-a', 'mid-b'],
  plan,
  1080,
  1920,
  'mediaId',
) as {
  VideoTracks: Array<{ VideoTrackClips: Array<Record<string, unknown>> }>
}

const clips = timeline.VideoTracks[0]?.VideoTrackClips ?? []
if (clips.length !== 2) {
  console.error('FAIL: expected 2 clips, got', clips.length)
  process.exit(1)
}
for (let i = 0; i < clips.length; i++) {
  const c = clips[i]!
  if (!c.MediaId || c.MediaURL) {
    console.error(`FAIL: clip ${i + 1} must use MediaId only`, c)
    process.exit(1)
  }
  if (c.In !== 0 || typeof c.Out !== 'number' || typeof c.Duration !== 'number') {
    console.error(`FAIL: clip ${i + 1} missing In/Out/Duration`)
    process.exit(1)
  }
}
console.log('OK: timeline uses IMS MediaId for image clips')
