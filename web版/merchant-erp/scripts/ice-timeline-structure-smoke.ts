#!/usr/bin/env npx tsx
/** 校验多图时间线：公网 OSS 用 MediaURL，私有 Bucket 用 MediaId，无需 ICE 凭证 */
import { buildTimelineFromImages } from '../vite-plugins/aliyunIceCore.ts'
import { parseIceEditBriefPlan } from '../vite-plugins/iceBriefTimelinePlan.ts'

const plan = parseIceEditBriefPlan('自检', { clipEndSec: 6, imageCount: 2, effectId: 'none' })

const publicTimeline = buildTimelineFromImages(
  [
    {
      mediaId: 'mid-public-a',
      mediaUrl: 'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/test-a.png',
      useMediaId: false,
    },
    {
      mediaId: 'mid-public-b',
      mediaUrl: 'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/test-b.png',
      useMediaId: false,
    },
  ],
  plan,
  1080,
  1920,
) as {
  VideoTracks: Array<{ VideoTrackClips: Array<Record<string, unknown>> }>
}

const privateTimeline = buildTimelineFromImages(
  [
    {
      mediaId: 'mid-private-a',
      mediaUrl: 'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/test-a.png',
      useMediaId: true,
    },
  ],
  { ...plan, imageDurations: [6] },
  1080,
  1920,
) as {
  VideoTracks: Array<{ VideoTrackClips: Array<Record<string, unknown>> }>
}

const pubClips = publicTimeline.VideoTracks[0]?.VideoTrackClips ?? []
if (pubClips.length !== 2) {
  console.error('FAIL: expected 2 public clips, got', pubClips.length)
  process.exit(1)
}
for (let i = 0; i < pubClips.length; i++) {
  const c = pubClips[i]!
  if (c.MediaId) {
    console.error(`FAIL: public clip ${i + 1} must use MediaURL not MediaId`)
    process.exit(1)
  }
  const url = String(c.MediaURL ?? '')
  if (!url.startsWith('https://') || url.includes('?')) {
    console.error(`FAIL: public clip ${i + 1} bad MediaURL`, url)
    process.exit(1)
  }
}

const privClip = privateTimeline.VideoTracks[0]?.VideoTrackClips?.[0]
if (!privClip?.MediaId || privClip.MediaURL) {
  console.error('FAIL: private clip must use MediaId only', privClip)
  process.exit(1)
}
if (privClip.In !== undefined || privClip.Width !== undefined) {
  console.error('FAIL: private MediaId clip should not set In/Width', privClip)
  process.exit(1)
}

console.log('OK: hybrid timeline — public OSS uses MediaURL, private bucket uses MediaId')
