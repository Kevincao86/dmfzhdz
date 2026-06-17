#!/usr/bin/env npx tsx
/** 校验多图时间线使用 MediaURL（非 MediaId），无需 ICE 凭证 */
import { buildTimelineFromImages } from '../vite-plugins/aliyunIceCore.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const plan = parseIceEditBriefPlan('自检', { clipEndSec: 6, imageCount: 2, effectId: 'none' })
const timeline = buildTimelineFromImages(
  [
    'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/test-a.png',
    'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/test-b.png',
  ],
  plan,
  1080,
  1920,
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
  if (c.MediaId) {
    console.error(`FAIL: clip ${i + 1} must not use MediaId`)
    process.exit(1)
  }
  const url = String(c.MediaURL ?? '')
  if (!url.startsWith('https://') || url.includes('?')) {
    console.error(`FAIL: clip ${i + 1} bad MediaURL`, url)
    process.exit(1)
  }
  if (c.In !== 0 || typeof c.Out !== 'number' || typeof c.Duration !== 'number') {
    console.error(`FAIL: clip ${i + 1} missing In/Out/Duration`)
    process.exit(1)
  }
}
console.log('OK: timeline uses unsigned OSS MediaURL with In/Out/Duration')
