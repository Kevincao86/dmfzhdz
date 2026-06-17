#!/usr/bin/env npx tsx
/** 4 图多图成片 HTTP 自检 × N 次（默认 5） */
const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')
const RUNS = Math.max(1, Number(process.env.ICE_SMOKE_RUNS ?? 5) || 5)
const IMAGE_COUNT = Math.max(1, Number(process.env.ICE_SMOKE_IMAGE_COUNT ?? 4) || 4)

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

async function runOnce(runIndex: number): Promise<void> {
  const imageUrls: string[] = []
  for (let i = 0; i < IMAGE_COUNT; i++) {
    const upload = await jsonFetch<{
      ok: boolean
      message?: string
      timelineUrl?: string
    }>('/meoo-merchant-ai-video-ice-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `ice-4img-${runIndex}-${i}.png`,
        contentType: 'image/png',
        contentBase64: TINY_PNG.toString('base64'),
      }),
    })
    if (!upload.ok || !upload.timelineUrl) {
      throw new Error(`upload ${i + 1}: ${upload.message ?? 'no timelineUrl'}`)
    }
    imageUrls.push(upload.timelineUrl)
  }

  const pipeline = await jsonFetch<{ ok: boolean; message?: string; step?: string; jobId?: string }>(
    '/meoo-merchant-ai-video-ice-pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls,
        projectName: `ice-4img-run-${runIndex}`,
        editBrief: '4图 HTTP 自检',
        width: 1080,
        height: 1920,
        clipEndSec: 8,
        preset: '无附加特效',
      }),
    },
  )
  if (!pipeline.ok || !pipeline.jobId) {
    throw new Error(`pipeline: ${pipeline.step ?? ''} ${pipeline.message ?? ''}`.trim())
  }

  for (let i = 0; i < 48; i++) {
    await sleep(5000)
    const st = await jsonFetch<{
      ok: boolean
      status?: string
      done?: boolean
      failed?: boolean
      message?: string
      downloadUrl?: string
    }>(`/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(pipeline.jobId)}`)
    if (st.failed) throw new Error(`job failed: ${st.message ?? st.status}`)
    if (st.done) {
      if (!st.downloadUrl) throw new Error('success but no downloadUrl')
      return
    }
  }
  throw new Error('poll timeout')
}

async function main(): Promise<void> {
  let ok = 0
  for (let i = 1; i <= RUNS; i++) {
    try {
      await runOnce(i)
      ok += 1
      console.log(`RUN ${i}/${RUNS} OK (${IMAGE_COUNT} images)`)
    } catch (e) {
      console.error(`RUN ${i}/${RUNS} FAIL:`, e instanceof Error ? e.message : String(e))
      process.exit(1)
    }
  }
  console.log(`ALL OK: ${ok}/${RUNS} runs × ${IMAGE_COUNT} images`)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
