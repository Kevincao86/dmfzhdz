#!/usr/bin/env npx tsx
/**
 * 数字人口播成片下载代理自检（无需方舟 Key）。
 * 用法：npx tsx scripts/digital-human-video-download-smoke.ts
 */
import { bufferLooksLikeVideo } from '../vite-plugins/videoConcatServer.ts'
import { fetchRemoteVideoBuffer } from '../vite-plugins/videoDownloadProxyCore.ts'

const SAMPLE_MP4 =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/meoo-out/meoo-img-1780793419325-1jsur0.mp4'

async function main(): Promise<void> {
  const out = await fetchRemoteVideoBuffer(SAMPLE_MP4)
  if (!out.ok) {
    console.error('FAIL:', out.message)
    process.exit(1)
  }
  if (out.buffer.length < 1024) {
    console.error('FAIL: empty body', out.buffer.length)
    process.exit(1)
  }
  if (!bufferLooksLikeVideo(out.buffer)) {
    console.error('FAIL: not video bytes')
    process.exit(1)
  }
  console.log('OK: fetchRemoteVideoBuffer', out.buffer.length, 'bytes', SAMPLE_MP4)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
