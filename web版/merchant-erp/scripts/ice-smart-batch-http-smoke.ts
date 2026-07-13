#!/usr/bin/env npx tsx
/** 智能一键成片 HTTP 自检：上传 2 条视频 → SubmitBatchMediaProducingJob */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')
const __dir = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_MP4 = path.join(__dir, '../public/landing-merchant/hero-loop.mp4')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function jsonFetch<T>(p: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${p}`, init)
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

async function uploadSampleVideo(label: string): Promise<string> {
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
      fileName: `ice-smart-smoke-${label}.mp4`,
      contentType: 'video/mp4',
      contentBase64: buf.toString('base64'),
    }),
  })
  if (!upload.ok || !upload.timelineUrl) {
    throw new Error(`upload ${label}: ${upload.message ?? 'no timelineUrl'}`)
  }
  return upload.timelineUrl
}

async function main(): Promise<void> {
  if (!fs.existsSync(SAMPLE_MP4)) throw new Error(`missing sample mp4: ${SAMPLE_MP4}`)
  console.log(`BASE=${BASE}`)
  const u1 = await uploadSampleVideo('a')
  const u2 = await uploadSampleVideo('b')
  console.log('uploaded:', u1.slice(0, 80), '…')

  const submit = await jsonFetch<{
    ok: boolean
    message?: string
    jobId?: string
    batchJobId?: string
    step?: string
  }>('/meoo-merchant-ai-video-ice-smart-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      materials: [
        { kind: 'video', mediaUrl: u1, label: 'a' },
        { kind: 'video', mediaUrl: u2, label: 'b' },
      ],
      scriptRows: [
        { dialogue: '欢迎光临本店，今天带大家看看招牌菜', visual: '门头' },
        { dialogue: '这道招牌菜色泽诱人，口感绝佳', visual: '菜品' },
      ],
      guidance: '探店种草短视频，展示门头与招牌菜，口播自然亲切，突出店铺氛围与菜品卖点',
      targetTotalSec: 20,
      width: 1080,
      height: 1920,
      materialSlots: [0, 1],
      mixVoicePresetId: 'v-female-warm',
      bgmPresetId: 'bgm-2',
    }),
  })
  if (!submit.ok) throw new Error(`submit: ${submit.message ?? 'failed'} step=${submit.step ?? ''}`)
  const jobId = submit.jobId || submit.batchJobId
  if (!jobId) throw new Error('submit: no jobId')
  console.log('submitted jobId:', jobId)

  for (let i = 0; i < 40; i++) {
    await sleep(5000)
    const st = await jsonFetch<{
      ok: boolean
      status?: string
      done?: boolean
      failed?: boolean
      message?: string
    }>(`/meoo-merchant-ai-video-ice-smart-batch-job?id=${encodeURIComponent(jobId)}`)
    console.log(`poll ${i + 1}:`, st.status, st.done ? 'done' : '', st.failed ? 'FAILED' : '')
    if (st.failed) throw new Error(st.message ?? 'smart batch failed')
    if (st.done) {
      console.log('OK: smart batch done')
      return
    }
  }
  throw new Error('poll timeout')
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
