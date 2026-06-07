#!/usr/bin/env npx tsx
/**
 * 云剪多图成片端到端自检（上传测试图 → 提交剪辑 → 轮询 → 探测成片 OSS）。
 * 用法（在 merchant-erp 目录）：
 *   npx tsx scripts/ice-images-pipeline-smoke.ts
 * 可选：ICE_SMOKE_IMAGE_URLS=https://.../a.jpg,https://.../b.jpg npx tsx ...
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  iceGetProducingJob,
  iceRunImagesPipeline,
  readAliyunIceConfigFromEnv,
} from '../vite-plugins/aliyunIceCore.ts'
import { putIceSourceObject } from '../vite-plugins/aliyunOssIceUpload.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function loadEnvFile(rel: string): Record<string, string> {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 1×1 透明 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function main(): Promise<void> {
  const fileEnv = {
    ...loadEnvFile('.env.local'),
    ...loadEnvFile('.env.merchant'),
  }
  const env = { ...fileEnv, ...process.env } as Record<string, string | undefined>
  const cfg = readAliyunIceConfigFromEnv(env)
  if (!cfg.appId || !cfg.accessKeyId || !cfg.accessKeySecret) {
    console.error('FAIL: 缺少 ICE 凭证（ALIYUN_ICE_APP_ID / ACCESS_KEY）')
    process.exit(1)
  }

  let imageUrls: string[] = []
  const fromEnv = (env.ICE_SMOKE_IMAGE_URLS ?? '').trim()
  if (fromEnv) {
    imageUrls = fromEnv.split(',').map((u) => u.trim()).filter(Boolean)
  } else {
    const put = await putIceSourceObject(cfg, env, {
      fileName: `ice-smoke-${Date.now()}.png`,
      contentType: 'image/png',
      buffer: TINY_PNG,
    })
    if (!put.ok) {
      console.error('FAIL: 上传测试图失败', put.message)
      process.exit(1)
    }
    imageUrls = [put.timelineUrl ?? put.mediaUrl]
    console.log('uploaded test image:', imageUrls[0])
  }

  const pipeline = await iceRunImagesPipeline(cfg, {
    imageUrls,
    projectName: 'ice-smoke',
    editBrief: '自检：多图成片',
    width: 1080,
    height: 1920,
    totalDurationSec: 3,
    effectId: 'none',
  })
  if (!pipeline.ok) {
    console.error('FAIL: pipeline', pipeline.step, pipeline.message)
    process.exit(1)
  }
  console.log('job submitted:', pipeline.jobId)

  for (let i = 0; i < 48; i++) {
    await sleep(5000)
    const st = await iceGetProducingJob(cfg, pipeline.jobId, env)
    if (!st.ok) {
      console.error('FAIL: poll', st.message)
      process.exit(1)
    }
    console.log(`poll ${i + 1}: status=${st.status} progress=${st.progress ?? '-'}`)
    if (st.failed) {
      console.error('FAIL: job failed', st.message)
      process.exit(1)
    }
    if (st.done) {
      if (!st.downloadUrl) {
        console.error('FAIL: job success but no downloadUrl')
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
