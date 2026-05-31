/**
 * 将运营台注册表 vendorKeys 合并进服务端 MerchantAiEnv。
 * 运营台保存的 Key **优先于** Vercel/ECS 环境变量（避免旧 env 盖住新 Key 导致 401）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'

/** 去掉 Bearer 前缀、引号、JSON 包裹、多行粘贴等常见错误 */
export function sanitizeVendorApiKey(raw: string | undefined): string {
  if (typeof raw !== 'string') return ''
  let v = raw.replace(/[\u200b-\u200d\ufeff]/g, '').trim()
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, '').trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim()
  }
  if (v.startsWith('{')) {
    try {
      const o = JSON.parse(v) as Record<string, unknown>
      const nested =
        o.api_key ?? o.apiKey ?? o.key ?? o.token ?? o.secret ?? o.access_token
      if (typeof nested === 'string' && nested.trim()) v = nested.trim()
    } catch {
      /* 非 JSON */
    }
  }
  if (v.includes('\n')) {
    const line =
      v
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length >= 16 && !l.startsWith('{')) ?? v.split('\n')[0]?.trim()
    if (line) v = line
  }
  return v
}

/** MiniMax OpenAI 兼容接口需 sk- 类 Key；平台若只下发 eyJ JWT，会 2049 */
export function looksLikeMinimaxJwtKey(key: string): boolean {
  const k = key.trim()
  return k.startsWith('eyJ') && k.length > 80
}

/** 注册表有值时覆盖 env（运营台为唯一配置源） */
function setFromRegistry(out: MerchantAiEnv, envKey: string, val: string | undefined): void {
  const v = sanitizeVendorApiKey(val)
  if (!v) return
  out[envKey] = v
}

export function applyRegistryVendorKeysToMerchantEnv(
  out: MerchantAiEnv,
  rawVendorKeys: unknown,
): void {
  const expanded = expandVendorKeysForRegistrySave(normalizeVendorKeysFromDisk(rawVendorKeys))

  const tm = expanded.tokenmix
  if (tm) setFromRegistry(out, 'TOKENMIX_API_KEY', tm)

  const minimax = expanded.minimax
  if (minimax) {
    setFromRegistry(out, 'MERCHANT_AI_MINIMAX_KEY', minimax)
    setFromRegistry(out, 'MINIMAX_API_KEY', minimax)
  }

  const qwen = expanded.qwen
  if (qwen) {
    setFromRegistry(out, 'MERCHANT_AI_QWEN_KEY', qwen)
    setFromRegistry(out, 'DASHSCOPE_API_KEY', qwen)
  }

  const doubao = expanded.doubao
  if (doubao) {
    setFromRegistry(out, 'MERCHANT_AI_DOUBAO_KEY', doubao)
    setFromRegistry(out, 'ARK_API_KEY', doubao)
  }

  const deepseek = expanded.deepseek
  if (deepseek) setFromRegistry(out, 'DEEPSEEK_API_KEY', deepseek)

  const kimi = expanded.kimi
  if (kimi) {
    setFromRegistry(out, 'MOONSHOT_API_KEY', kimi)
    setFromRegistry(out, 'MERCHANT_AI_KIMI_KEY', kimi)
  }
}

function mergeVendorKeysFromLocalRegistry(viteRoot: string | undefined, out: MerchantAiEnv): void {
  if (!viteRoot) return
  const registryPath = path.join(path.resolve(viteRoot, '..', '..', '.meoo-dev-sync'), 'registry.json')
  try {
    if (!fs.existsSync(registryPath)) return
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Partial<RegistryFile>
    applyRegistryVendorKeysToMerchantEnv(out, reg.vendorKeys)
  } catch {
    /* 本地 dev 注册表不可读时保留 .env */
  }
}

/** 商品文案 / 智能体 / 数字人 TTS：合并运营台 vendorKeys（本地 registry.json + ECS PostgREST 注册表）。 */
export async function mergeMerchantAiEnvWithRegistrySnapshot(
  viteRoot: string | undefined,
  base: MerchantAiEnv,
): Promise<MerchantAiEnv> {
  const out: MerchantAiEnv = { ...base }
  mergeVendorKeysFromLocalRegistry(viteRoot, out)
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (!supabaseUrl || !serviceRole) return out
  try {
    const { createRegistrySnapshotIoFetch } = await import('../src/lib/registrySnapshotIoFetch.js')
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    applyRegistryVendorKeysToMerchantEnv(out, data.vendorKeys)
  } catch {
    /* 未配 ECS PostgREST 或注册表不可读 */
  }
  return out
}
