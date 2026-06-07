#!/usr/bin/env npx tsx
/**
 * 数字人口播成片下载代理自检（无需方舟 Key）。
 * 用法：npx tsx scripts/digital-human-video-download-smoke.ts
 */
import { IncomingMessage, ServerResponse } from 'node:http'
import { bufferLooksLikeVideo } from '../vite-plugins/videoConcatServer.ts'
import { handleMerchantAiVideoRoutes } from '../vite-plugins/merchantVideoAiGateway.ts'

const SAMPLE_MP4 =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/meoo-out/meoo-img-1780793419325-1jsur0.mp4'

function mockRes(): { res: ServerResponse; body: Buffer; status: number; headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  let status = 200
  const chunks: Buffer[] = []
  const res = {
    statusCode: 200,
    setHeader(k: string, v: string | number) {
      headers[k.toLowerCase()] = String(v)
    },
    end(data?: string | Buffer) {
      if (typeof data === 'string') chunks.push(Buffer.from(data))
      else if (data) chunks.push(data)
    },
  } as unknown as ServerResponse
  return {
    res,
    get body() {
      return Buffer.concat(chunks)
    },
    get status() {
      return status
    },
    get headers() {
      return headers
    },
    set status(v: number) {
      status = v
      res.statusCode = v
    },
  }
}

async function runDownloadProxy(url: string): Promise<{ status: number; body: Buffer; headers: Record<string, string> }> {
  const holder = mockRes()
  const req = { method: 'POST' } as IncomingMessage
  const handled = await handleMerchantAiVideoRoutes({
    method: 'POST',
    pathname: '/api/merchant/ai/video/download-url',
    searchParams: new URLSearchParams(),
    res: holder.res,
    bodyRaw: JSON.stringify({ url }),
    req,
    env: process.env as Record<string, string | undefined>,
  })
  if (!handled) throw new Error('download-url route not handled')
  return { status: holder.status, body: holder.body, headers: holder.headers }
}

async function main(): Promise<void> {
  const out = await runDownloadProxy(SAMPLE_MP4)
  if (out.status !== 200) {
    console.error('FAIL: HTTP', out.status, out.body.toString('utf8').slice(0, 400))
    process.exit(1)
  }
  if (out.body.length < 1024) {
    console.error('FAIL: empty body', out.body.length)
    process.exit(1)
  }
  if (!bufferLooksLikeVideo(out.body)) {
    console.error('FAIL: not video bytes')
    process.exit(1)
  }
  console.log('OK: download-url proxy', out.body.length, 'bytes', SAMPLE_MP4)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
