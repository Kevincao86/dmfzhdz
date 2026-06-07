#!/usr/bin/env npx tsx
/**
 * 从生产注册表拉 ICE 凭证，在本地跑修复后的 pipeline 端到端（勿提交密钥输出）。
 */
import {
  iceGetProducingJob,
  iceRunImagesPipeline,
  readAliyunIceConfigFromEnv,
} from '../vite-plugins/aliyunIceCore.ts'
import { putIceSourceObject } from '../vite-plugins/aliyunOssIceUpload.ts'
import { applyRegistryVideoAiToMerchantEnv } from '../vite-plugins/registryVideoAiEnvMerge.ts'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const base = (process.env.MEOO_ERP_API_BASE ?? 'https://mofangdianai.com/erp-api').replace(/\/+$/, '')
  const regRes = await fetch(`${base}/meoo-ops-sync-registry`)
  if (!regRes.ok) {
    console.error('FAIL: registry', regRes.status)
    process.exit(1)
  }
  const reg = (await regRes.json()) as Record<string, unknown>
  const env: Record<string, string | undefined> = {}
  applyRegistryVideoAiToMerchantEnv(env, reg)
  const cfg = readAliyunIceConfigFromEnv(env)
  if (!cfg.appId || !cfg.accessKeyId || !cfg.accessKeySecret) {
    console.error('FAIL: registry 无 ICE 凭证')
    process.exit(1)
  }

  const put = await putIceSourceObject(cfg, env, {
    fileName: `ice-e2e-${Date.now()}.png`,
    contentType: 'image/png',
    buffer: TINY_PNG,
  })
  if (!put.ok) {
    console.error('FAIL: upload', put.message)
    process.exit(1)
  }
  const imageUrl = put.timelineUrl ?? put.mediaUrl
  console.log('upload ok')

  const pipeline = await iceRunImagesPipeline(cfg, {
    imageUrls: [imageUrl],
    projectName: 'ice-e2e',
    editBrief: 'E2E 自检',
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
