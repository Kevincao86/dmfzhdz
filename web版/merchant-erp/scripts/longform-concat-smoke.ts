#!/usr/bin/env npx tsx
/** 模拟 5s×12 长视频：服务端 ffmpeg 拼接 12 段远程 MP4（需本机 ffmpeg） */
import { concatRemoteMp4Urls } from '../vite-plugins/videoConcatServer.ts'

const sample =
  process.env.VIDEO_CONCAT_SAMPLE_URL?.trim() ||
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/meoo-out/meoo-img-1780793419325-1jsur0.mp4'

const SEGMENTS = Number(process.env.LONGFORM_SMOKE_SEGMENTS || 12)

async function main(): Promise<void> {
  const urls = Array.from({ length: SEGMENTS }, () => sample)
  console.log(`concat ${urls.length} segments…`)
  const t0 = Date.now()
  const out = await concatRemoteMp4Urls(urls)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  if (!out.ok) {
    console.error('FAIL:', out.message)
    process.exit(1)
  }
  console.log(`OK: merged ${out.buffer.length} bytes in ${elapsed}s (${SEGMENTS} segments)`)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
