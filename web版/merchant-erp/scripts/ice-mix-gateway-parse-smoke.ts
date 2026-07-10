#!/usr/bin/env npx tsx
/** 混剪 pipeline 解析：本地上传 timeline + signedMediaUrl 不应被整段丢弃 */
import { parseIceMixPipelineSegments } from '../vite-plugins/aliyunOssIceParse.ts'

const timeline =
  'https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/source/2026-07-10/smoke-a.mp4'
const signed = `${timeline}?OSSAccessKeyId=TEST&Expires=9999999999&Signature=abc123`

const parsed = parseIceMixPipelineSegments([
  {
    kind: 'video',
    mediaUrl: timeline,
    signedMediaUrl: signed,
    timelineStartSec: 0,
    timelineEndSec: 4,
    materialIndex: 0,
    sourceInSec: 0,
  },
  {
    kind: 'video',
    mediaUrl: timeline.replace('smoke-a', 'smoke-b'),
    signedMediaUrl: signed.replace('smoke-a', 'smoke-b'),
    timelineStartSec: 4,
    timelineEndSec: 8,
    materialIndex: 1,
    sourceInSec: 1.2,
  },
])

if (parsed.length !== 2) {
  console.error('FAIL: expected 2 segments, got', parsed.length, parsed)
  process.exit(1)
}
if (parsed.some((s) => s.signedMediaUrl)) {
  console.error('FAIL: clean timeline should drop signedMediaUrl', parsed)
  process.exit(1)
}
if (parsed.some((s) => s.mediaUrl.includes('?'))) {
  console.error('FAIL: mediaUrl must be unsigned OSS', parsed)
  process.exit(1)
}

console.log('OK: parseIceMixPipelineSegments keeps clean timeline with signed fallback stripped')
