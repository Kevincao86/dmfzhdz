#!/usr/bin/env npx tsx
/**
 * 混剪「AI 分析素材」HTTP 自检：上传 → 截帧 → 视觉 → 指导文案
 * BASE 默认轻量 erp-api
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')
const __dir = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE_MP4 = path.join(__dir, '../public/landing-merchant/hero-loop.mp4')

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

async function uploadSample(label: string): Promise<string> {
  const buf = fs.readFileSync(SAMPLE_MP4)
  const upload = await jsonFetch<{
    ok: boolean
    message?: string
    timelineUrl?: string
  }>('/meoo-merchant-ai-video-ice-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: `ice-analyze-smoke-${label}.mp4`,
      contentType: 'video/mp4',
      contentBase64: buf.toString('base64'),
    }),
  })
  if (!upload.ok || !upload.timelineUrl) {
    throw new Error(`upload ${label}: ${upload.message ?? 'no timelineUrl'}`)
  }
  return upload.timelineUrl
}

async function extractOpeningFrame(timelineUrl: string): Promise<string> {
  const frame = await jsonFetch<{ ok: boolean; message?: string; imageBase64?: string }>(
    '/meoo-merchant-ai-video-last-frame',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: timelineUrl, frame: 'opening' }),
    },
  )
  if (!frame.ok || !frame.imageBase64 || frame.imageBase64.length < 64) {
    throw new Error(`last-frame: ${frame.message ?? 'empty imageBase64'}`)
  }
  return frame.imageBase64.replace(/\s/g, '')
}

async function visionDescribe(b64: string): Promise<string> {
  const dataUrl = `data:image/jpeg;base64,${b64}`
  for (const provider of ['doubao', 'qwen', 'tokenmix'] as const) {
    try {
      const chat = await jsonFetch<{ ok: boolean; content?: string; message?: string; error?: string }>(
        '/meoo-ai-chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            ...(provider === 'tokenmix' ? { modelFamily: 'openai', model: 'gpt-4o' } : {}),
            temperature: 0.35,
            imageDataUrls: [dataUrl],
            messages: [
              {
                role: 'system',
                content:
                  '你是短视频素材分析师。描述画面：场景、主体、氛围。禁止只复述编号或文件名。中文一段。',
              },
              { role: 'user', content: '素材1（测试视频）' },
            ],
          }),
        },
      )
      const text = chat.content?.trim() || ''
      if (text.length >= 24 && !/仅获得编号|暂未获取|没有图/i.test(text)) {
        console.log(`vision ok via ${provider}:`, text.slice(0, 120), '…')
        return text
      }
      console.warn(`vision ${provider} weak:`, text.slice(0, 80))
    } catch (e) {
      console.warn(`vision ${provider} err:`, e instanceof Error ? e.message : String(e))
    }
  }
  throw new Error('视觉模型未返回有效画面描述')
}

async function writeGuidance(visionNotes: string): Promise<string> {
  for (const provider of ['doubao', 'qwen'] as const) {
    try {
      const chat = await jsonFetch<{ ok: boolean; content?: string }>('/meoo-ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          temperature: 0.65,
          messages: [
            {
              role: 'system',
              content:
                '你是短视频编导，根据画面理解写混剪指导文案（150-380字）。禁止 Markdown、禁止写「仅获得编号」。',
            },
            {
              role: 'user',
              content: `【画面理解】\n${visionNotes}\n\n目标 20 秒竖屏探店混剪，请写指导文案。`,
            },
          ],
        }),
      })
      const text = chat.content?.trim() || ''
      if (text.length >= 40 && !/仅获得编号|暂未获取/i.test(text)) {
        console.log(`guidance ok via ${provider}:`, text.slice(0, 160), '…')
        return text
      }
    } catch (e) {
      console.warn(`guidance ${provider} err:`, e instanceof Error ? e.message : String(e))
    }
  }
  throw new Error('指导文案生成失败')
}

async function main(): Promise<void> {
  if (!fs.existsSync(SAMPLE_MP4)) throw new Error(`missing ${SAMPLE_MP4}`)
  console.log(`BASE=${BASE}`)
  const timelineUrl = await uploadSample('1')
  console.log('uploaded:', timelineUrl.slice(0, 90), '…')
  const b64 = await extractOpeningFrame(timelineUrl)
  console.log('frame b64 len:', b64.length)
  console.log('OK: mix analyze frame extraction (vision/guidance need browser login token)')
  if (process.env.ICE_MIX_ANALYZE_SMOKE_FULL === '1') {
    const vision = await visionDescribe(b64)
    const guidance = await writeGuidance(vision)
    if (guidance.length < 40) throw new Error('guidance too short')
    console.log('OK: mix analyze full pipeline')
  }
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
