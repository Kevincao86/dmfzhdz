#!/usr/bin/env npx tsx
/**
 * 混剪 HTTP 自检：上传 2 条视频 → 提交 mixSegments → 轮询 ICE 任务
 * BASE 默认轻量 erp-api（须已配置 OSS + ICE）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')
const __dir = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_MP4 = path.join(__dir, '../public/landing-merchant/hero-loop.mp4')

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

async function uploadSampleVideo(label: string): Promise<{ timelineUrl: string; mediaUrl: string }> {
  const buf = fs.readFileSync(SAMPLE_MP4)
  const upload = await jsonFetch<{
    ok: boolean
    message?: string
    timelineUrl?: string
    mediaUrl?: string
  }>('/meoo-merchant-ai-video-ice-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: `ice-mix-smoke-${label}.mp4`,
      contentType: 'video/mp4',
      contentBase64: buf.toString('base64'),
    }),
  })
  if (!upload.ok || !upload.timelineUrl) {
    throw new Error(`upload ${label}: ${upload.message ?? 'no timelineUrl'}`)
  }
  return {
    timelineUrl: upload.timelineUrl,
    mediaUrl: upload.mediaUrl || upload.timelineUrl,
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(SAMPLE_MP4)) {
    throw new Error(`missing sample mp4: ${SAMPLE_MP4}`)
  }

  console.log(`BASE=${BASE}`)
  const a = await uploadSampleVideo('a')
  const b = await uploadSampleVideo('b')
  console.log('uploaded:', a.timelineUrl.slice(0, 80), '…')

  const signedA = a.mediaUrl.includes('?') ? a.mediaUrl : `${a.timelineUrl}?Signature=smoke-test`
  const mixSegments = [
    {
      kind: 'video' as const,
      mediaUrl: a.timelineUrl,
      signedMediaUrl: signedA,
      timelineStartSec: 0,
      timelineEndSec: 4,
      materialIndex: 0,
      sourceInSec: 0,
      caption: process.env.ICE_MIX_SMOKE_CAPTION === '1' ? '第一段' : undefined,
    },
    {
      kind: 'video' as const,
      mediaUrl: b.timelineUrl,
      signedMediaUrl: b.mediaUrl.includes('?') ? b.mediaUrl : `${b.timelineUrl}?Signature=smoke-test`,
      timelineStartSec: 4,
      timelineEndSec: 8,
      materialIndex: 1,
      sourceInSec: 0.5,
      caption: process.env.ICE_MIX_SMOKE_CAPTION === '1' ? '第二段' : undefined,
    },
  ]

  const pipeline = await jsonFetch<{ ok: boolean; message?: string; step?: string; jobId?: string }>(
    '/meoo-merchant-ai-video-ice-pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mixSegments,
        mixNarrationText: process.env.ICE_MIX_SMOKE_NARRATION === '1' ? '混剪冒烟测试，两段素材拼接。' : undefined,
        projectName: 'ice-mix-http-smoke',
        editBrief: process.env.ICE_MIX_SMOKE_BRIEF ?? '',
        width: 1080,
        height: 1920,
        clipEndSec: 8,
        effectId: process.env.ICE_MIX_SMOKE_EFFECT ?? 'none',
        subtitleStyleId: 'viral-white-pop',
      }),
    },
  )

  if (!pipeline.ok || !pipeline.jobId) {
    throw new Error(`pipeline: ${pipeline.step ?? ''} ${pipeline.message ?? ''}`.trim())
  }
  console.log('submitted jobId:', pipeline.jobId)

  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    const st = await jsonFetch<{
      ok: boolean
      status?: string
      done?: boolean
      failed?: boolean
      message?: string
      downloadUrl?: string
    }>(`/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(pipeline.jobId)}`)
    const status = String(st.status ?? '')
    console.log(`poll ${i + 1}: ${status}${st.message ? ` — ${st.message.slice(0, 120)}` : ''}`)
    if (st.failed) {
      throw new Error(st.message || 'ICE job failed')
    }
    if (st.done && st.downloadUrl) {
      console.log('OK: mix pipeline done', st.downloadUrl.slice(0, 100))
      return
    }
  }
  throw new Error('poll timeout (5min)')
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
