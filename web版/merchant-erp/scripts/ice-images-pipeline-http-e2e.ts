#!/usr/bin/env npx tsx
/**
 * 经轻量 /erp-api HTTP 跑多图成片端到端（上传 → 提交 → 轮询）。
 * 用法：MEOO_ERP_API_BASE=http://139.196.42.5/erp-api npx tsx scripts/ice-images-pipeline-http-e2e.ts
 */
const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  const body = (await res.json().catch(() => null)) as T | null
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: string }).message)
        : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

async function main(): Promise<void> {
  const cfg = await jsonFetch<{ configured?: boolean; localUploadEnabled?: boolean }>(
    '/meoo-merchant-ai-video-ice-config',
  )
  if (!cfg.configured) {
    console.error('FAIL: ICE 未配置')
    process.exit(1)
  }

  const upload = await jsonFetch<{
    ok: boolean
    message?: string
    mediaUrl?: string
    timelineUrl?: string
  }>('/meoo-merchant-ai-video-ice-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: `ice-http-${Date.now()}.png`,
      contentType: 'image/png',
      contentBase64: TINY_PNG.toString('base64'),
    }),
  })
  if (!upload.ok || !upload.timelineUrl) {
    console.error('FAIL: upload', upload.message ?? 'no timelineUrl')
    process.exit(1)
  }
  const imageUrl = upload.timelineUrl
  console.log('upload ok')

  const pipeline = await jsonFetch<{ ok: boolean; message?: string; step?: string; jobId?: string }>(
    '/meoo-merchant-ai-video-ice-pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls: [imageUrl],
        projectName: 'ice-http-e2e',
        editBrief: 'HTTP 自检',
        width: 1080,
        height: 1920,
        clipEndSec: 3,
        preset: '无附加特效',
      }),
    },
  )
  if (!pipeline.ok || !pipeline.jobId) {
    console.error('FAIL: pipeline', pipeline.step, pipeline.message)
    process.exit(1)
  }
  console.log('job submitted:', pipeline.jobId)

  for (let i = 0; i < 48; i++) {
    await sleep(5000)
    const st = await jsonFetch<{
      ok: boolean
      status?: string
      progress?: number
      done?: boolean
      failed?: boolean
      message?: string
      downloadUrl?: string
    }>(`/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(pipeline.jobId)}`)
    if (!st.ok) {
      console.error('FAIL: poll')
      process.exit(1)
    }
    console.log(`poll ${i + 1}: ${st.status} progress=${st.progress ?? '-'}`)
    if (st.failed) {
      console.error('FAIL: job', st.message)
      process.exit(1)
    }
    if (st.done) {
      if (!st.downloadUrl) {
        console.error('FAIL: success but no downloadUrl')
        process.exit(1)
      }
      console.log('OK: downloadUrl', st.downloadUrl.slice(0, 120))
      process.exit(0)
    }
  }
  console.error('FAIL: poll timeout')
  process.exit(1)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
