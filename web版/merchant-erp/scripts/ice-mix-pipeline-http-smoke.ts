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

  const segCount = Math.max(2, Math.min(8, Number(process.env.ICE_MIX_SMOKE_SEGMENTS) || 2))
  const segDur = Math.max(2, Number(process.env.ICE_MIX_SMOKE_SEG_DUR) || 4)
  const totalSec = segCount * segDur
  const effectId = process.env.ICE_MIX_SMOKE_EFFECT ?? 'none'
  const withNarration = process.env.ICE_MIX_SMOKE_NARRATION === '1'
  const withCaption = process.env.ICE_MIX_SMOKE_CAPTION === '1'
  const editBrief =
    process.env.ICE_MIX_SMOKE_BRIEF ??
    (withNarration
      ? '探店种草混剪；多素材拼接；原素材静音，使用 ICE AI_TTS 口播讲解；字幕带弹入动效'
      : '')

  console.log(`BASE=${BASE}`)
  console.log(
    `segments=${segCount} dur=${segDur}s effect=${effectId} narration=${withNarration} caption=${withCaption}`,
  )

  const uploads: Array<{ timelineUrl: string; mediaUrl: string }> = []
  for (let i = 0; i < segCount; i++) {
    uploads.push(await uploadSampleVideo(String.fromCharCode(97 + (i % 26))))
  }
  console.log('uploaded:', uploads[0]!.timelineUrl.slice(0, 80), '…')

  const mixSegments = uploads.map((u, i) => {
    const signed = u.mediaUrl.includes('?') ? u.mediaUrl : `${u.timelineUrl}?Signature=smoke-test`
    return {
      kind: 'video' as const,
      mediaUrl: u.timelineUrl,
      signedMediaUrl: signed,
      timelineStartSec: i * segDur,
      timelineEndSec: (i + 1) * segDur,
      materialIndex: i,
      sourceInSec: i * 0.5,
      caption: withCaption ? `第${i + 1}段口播文案` : undefined,
    }
  })

  const pipeline = await jsonFetch<{ ok: boolean; message?: string; step?: string; jobId?: string }>(
    '/meoo-merchant-ai-video-ice-pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mixSegments,
        mixNarrationText: withNarration ? '混剪冒烟测试，多段素材拼接与口播讲解。' : undefined,
        projectName: 'ice-mix-http-smoke',
        editBrief,
        width: 1080,
        height: 1920,
        clipEndSec: totalSec,
        effectId,
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
