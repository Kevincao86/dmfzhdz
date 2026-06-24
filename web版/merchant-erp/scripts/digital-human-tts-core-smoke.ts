/**
 * 数字人 TTS 全链路冒烟（5 轮）：注册表 Key → MiniMax（余额不足时）→ 千问神经语音回退
 * 用法: npx tsx scripts/digital-human-tts-core-smoke.ts
 */
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import { runDigitalHumanTtsCore } from '../src/lib/digitalHumanTtsCore.js'
import { sanitizeVendorApiKey } from '../vite-plugins/merchantRegistryVendorEnv.js'

const REGISTRY_URL = process.env.MEOO_REGISTRY_URL ?? 'https://mofangdianai.com/erp-api/meoo-ops-sync-registry'

async function loadEnvFromRegistry(): Promise<Record<string, string>> {
  const r = await fetch(REGISTRY_URL, { headers: { Accept: 'application/json' } })
  const data = (await r.json()) as { vendorKeys?: Record<string, string> }
  const expanded = expandVendorKeysForRegistrySave(normalizeVendorKeysFromDisk(data.vendorKeys))
  const env: Record<string, string> = {}
  const mm = sanitizeVendorApiKey(expanded.minimax)
  const qw = sanitizeVendorApiKey(expanded.qwen)
  if (mm) {
    env.MINIMAX_API_KEY = mm
    env.MERCHANT_AI_MINIMAX_KEY = mm
  }
  if (qw) {
    env.MERCHANT_AI_QWEN_KEY = qw
    env.DASHSCOPE_API_KEY = qw
  }
  if (!mm && !qw) throw new Error('registry_missing_tts_keys')
  return env
}

async function main() {
  process.env.MEOO_TTS_SMOKE_SKIP_AUTH = '1'
  const rounds = Math.max(1, Number(process.env.TTS_SMOKE_ROUNDS || 5))
  const env = await loadEnvFromRegistry()

  for (let i = 1; i <= rounds; i++) {
    const out = await runDigitalHumanTtsCore(
      {
        text: '哈喽，我是思琪，今天探店 vlog 走起，这家宝藏小店必须安利给你们。',
        voicePresetId: 'v-av-real-8',
        speechRate: 1.05,
        speechPitch: 1.04,
      },
      env,
    )
    if (!out.ok) {
      console.error(`FAIL round ${i}: ${out.message}`)
      process.exit(1)
    }
    if (!out.audioBase64 || out.audioBase64.length < 500) {
      console.error(`FAIL round ${i}: audio too short`)
      process.exit(1)
    }
    console.log(
      `OK round ${i}/${rounds} provider=${out.provider} model=${out.model} audio_b64_len=${out.audioBase64.length}`,
    )
  }
  console.log(`\nOK: ${rounds}/${rounds} rounds passed digital-human TTS core smoke`)
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
