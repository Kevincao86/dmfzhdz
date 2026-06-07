#!/usr/bin/env npx tsx
/** 本地验证 videoConcatServer（需本机已安装 ffmpeg） */
import { concatRemoteMp4Urls } from '../vite-plugins/videoConcatServer.ts'

const sample =
  process.env.VIDEO_CONCAT_SAMPLE_URL?.trim() ||
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/meoo-out/meoo-img-1780793419325-1jsur0.mp4'

async function main(): Promise<void> {
  const out = await concatRemoteMp4Urls([sample, sample])
  if (!out.ok) {
    console.error('FAIL:', out.message)
    process.exit(1)
  }
  console.log('OK: merged bytes', out.buffer.length)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
