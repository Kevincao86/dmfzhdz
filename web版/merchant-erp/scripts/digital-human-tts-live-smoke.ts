/**
 * MiniMax TTS 真实联调：从 erp-api 注册表读 Key，探测各端点（不打印完整密钥）。
 * 用法: npx tsx scripts/digital-human-tts-live-smoke.ts
 */
import { toMinimaxSpeedInt } from '../src/lib/digitalHumanTtsCore.js'
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import { sanitizeVendorApiKey } from '../vite-plugins/merchantRegistryVendorEnv.js'

const REGISTRY_URL = process.env.MEOO_REGISTRY_URL ?? 'https://mofangdianai.com/erp-api/meoo-ops-sync-registry'
const TEST_TEXT = '哈喽，我是思琪，今天探店走起。'
const VOICE_ID = 'Chinese (Mandarin)_Crisp_Girl'

type EndpointResult = { url: string; ok: boolean; code?: number; msg: string }

async function fetchRegistryKey(): Promise<{ key: string; region: string }> {
  const r = await fetch(REGISTRY_URL, { headers: { Accept: 'application/json' } })
  const data = (await r.json()) as {
    vendorKeys?: Record<string, string>
    videoAi?: { minimaxRegion?: string }
  }
  const expanded = expandVendorKeysForRegistrySave(normalizeVendorKeysFromDisk(data.vendorKeys))
  const key = sanitizeVendorApiKey(expanded.minimax)
  if (!key) throw new Error('registry_minimax_key_missing')
  const region = String(data.videoAi?.minimaxRegion ?? '').trim().toLowerCase()
  return { key, region }
}

async function probeEndpoint(url: string, apiKey: string): Promise<EndpointResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        text: TEST_TEXT,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: VOICE_ID,
          speed: toMinimaxSpeedInt(1.05),
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    })
    const data = (await res.json()) as {
      base_resp?: { status_code?: number; status_msg?: string }
      data?: { audio?: string }
    }
    const br = data.base_resp
    if (br && typeof br.status_code === 'number' && br.status_code !== 0) {
      return { url, ok: false, code: br.status_code, msg: String(br.status_msg || 'error') }
    }
    const audio = data.data?.audio
    if (typeof audio === 'string' && audio.length > 100) {
      return { url, ok: true, msg: `audio_hex_len=${audio.length}` }
    }
    return { url, ok: false, msg: 'no_audio' }
  } catch (e) {
    return { url, ok: false, msg: e instanceof Error ? e.message : String(e) }
  }
}

function endpointOrder(key: string, region: string): string[] {
  const domestic = key.startsWith('sk-api-') || region === 'cn'
  const bases = domestic
    ? ['https://api.minimaxi.com/v1', 'https://api-bj.minimaxi.com/v1', 'https://api.minimax.io/v1']
    : ['https://api.minimax.io/v1', 'https://api.minimaxi.com/v1', 'https://api-bj.minimaxi.com/v1']
  return bases.map((b) => `${b.replace(/\/$/, '')}/t2a_v2`)
}

async function main() {
  const rounds = Math.max(1, Number(process.env.TTS_SMOKE_ROUNDS || 5))
  let pass = 0
  for (let i = 1; i <= rounds; i++) {
    const { key, region } = await fetchRegistryKey()
    const fp = `${key.slice(0, 8)}…${key.slice(-4)}(${key.length})`
    console.log(`\n== round ${i}/${rounds} key=${fp} region=${region || 'auto'}`)
    const urls = endpointOrder(key, region)
    let roundOk = false
    for (const url of urls) {
      const r = await probeEndpoint(url, key)
      console.log(`  ${r.ok ? 'OK' : 'FAIL'} ${url} ${r.code ?? ''} ${r.msg}`)
      if (r.ok) {
        roundOk = true
        break
      }
    }
    if (!roundOk) {
      console.error(`FAIL round ${i}: all endpoints failed`)
      process.exit(1)
    }
    pass++
  }
  console.log(`\nOK: ${pass}/${rounds} rounds passed MiniMax TTS live smoke`)
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
