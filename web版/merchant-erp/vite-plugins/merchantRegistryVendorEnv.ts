/**
 * 将运营台注册表 vendorKeys 合并进服务端 MerchantAiEnv。
 * 运营台保存的 Key **优先于** Vercel/ECS 环境变量（避免旧 env 盖住新 Key 导致 401）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import {
  looksLikeJwtCredential,
  validateRegistryVendorKey,
  vendorKeyFingerprint,
} from '../src/lib/aiVendorKeyValidate.js'
import type { MerchantAiEnv } from './merchantAiUpstream.js'

const DIRECT_LLM_ENV_KEYS = [
  'TOKENMIX_API_KEY',
  'MINIMAX_API_KEY',
  'MERCHANT_AI_MINIMAX_KEY',
  'MOONSHOT_API_KEY',
  'MERCHANT_AI_KIMI_KEY',
  'KIMI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'MERCHANT_AI_QWEN_KEY',
  'ARK_API_KEY',
  'MERCHANT_AI_DOUBAO_KEY',
] as const

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

/** MiniMax / Kimi 勿用 JWT；平台「创建密钥」若下发 eyJ 会 401/2049 */
export function looksLikeMinimaxJwtKey(key: string): boolean {
  const k = key.trim()
  return k.startsWith('eyJ')
}

/** 合并前清洗 process.env 中的直连 Key（引号、Bearer 前缀等） */
export function sanitizeMerchantAiEnvInPlace(out: MerchantAiEnv): void {
  for (const k of DIRECT_LLM_ENV_KEYS) {
    const raw = out[k]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const cleaned = sanitizeVendorApiKey(raw)
    if (cleaned) out[k] = cleaned
    else delete out[k]
  }
}

export type AiVendorKeyDiag = {
  vendor: string
  configured: boolean
  fingerprint: string
  source: 'registry' | 'env' | 'none'
}

/** 诊断：实际生效 Key 来源（不含完整密钥） */
export function describeMergedAiVendorKeys(
  base: MerchantAiEnv,
  registryKeys: unknown,
): AiVendorKeyDiag[] {
  const expanded = expandVendorKeysForRegistrySave(normalizeVendorKeysFromDisk(registryKeys))
  const pick = (
    vendor: string,
    registryVal: string | undefined,
    envKeys: string[],
  ): AiVendorKeyDiag => {
    const reg = sanitizeVendorApiKey(registryVal)
    if (reg) {
      return { vendor, configured: true, fingerprint: vendorKeyFingerprint(reg), source: 'registry' }
    }
    for (const ek of envKeys) {
      const fromEnv = sanitizeVendorApiKey(base[ek])
      if (fromEnv) {
        return { vendor, configured: true, fingerprint: vendorKeyFingerprint(fromEnv), source: 'env' }
      }
    }
    return { vendor, configured: false, fingerprint: '(empty)', source: 'none' }
  }
  return [
    pick('kimi', expanded.kimi, ['MOONSHOT_API_KEY', 'MERCHANT_AI_KIMI_KEY', 'KIMI_API_KEY']),
    pick('minimax', expanded.minimax, ['MINIMAX_API_KEY', 'MERCHANT_AI_MINIMAX_KEY']),
    pick('tokenmix', expanded.tokenmix, ['TOKENMIX_API_KEY']),
  ]
}

/** 仅剥离注册表已配置的厂商 env，避免 qwen 在注册表时误删 kimi/minimax 的 env 回退 */
function stripDirectLlmEnvKeysForVendors(
  out: MerchantAiEnv,
  expanded: Partial<Record<string, string>>,
): void {
  if (expanded.tokenmix?.trim()) delete out.TOKENMIX_API_KEY
  if (expanded.minimax?.trim()) {
    delete out.MINIMAX_API_KEY
    delete out.MERCHANT_AI_MINIMAX_KEY
  }
  if (expanded.kimi?.trim()) {
    delete out.MOONSHOT_API_KEY
    delete out.MERCHANT_AI_KIMI_KEY
    delete out.KIMI_API_KEY
  }
  if (expanded.qwen?.trim()) {
    delete out.MERCHANT_AI_QWEN_KEY
    delete out.DASHSCOPE_API_KEY
  }
  if (expanded.doubao?.trim()) {
    delete out.MERCHANT_AI_DOUBAO_KEY
    delete out.ARK_API_KEY
  }
  if (expanded.deepseek?.trim()) delete out.DEEPSEEK_API_KEY
}

function setFromRegistry(
  out: MerchantAiEnv,
  envKey: string,
  val: string | undefined,
  vendorId?: string,
): void {
  const v = sanitizeVendorApiKey(val)
  if (!v) return
  if (vendorId) {
    const err = validateRegistryVendorKey(vendorId, v)
    if (err) {
      console.error(`[mergeMerchantAiEnv] 跳过 registry ${vendorId}: ${err}`)
      return
    }
  }
  out[envKey] = v
}

/** Vercel/ECS 误配 eyJ JWT 到 MINIMAX/MOONSHOT 环境变量时会触发 2049 */
function purgeJwtDirectLlmKeys(out: MerchantAiEnv): void {
  const keys: Array<[keyof MerchantAiEnv & string, string]> = [
    ['MINIMAX_API_KEY', 'minimax'],
    ['MERCHANT_AI_MINIMAX_KEY', 'minimax'],
    ['MOONSHOT_API_KEY', 'kimi'],
    ['MERCHANT_AI_KIMI_KEY', 'kimi'],
    ['KIMI_API_KEY', 'kimi'],
  ]
  for (const [k, label] of keys) {
    const v = out[k]
    if (typeof v === 'string' && looksLikeJwtCredential(v)) {
      console.error(
        `[mergeMerchantAiEnv] 丢弃 ${k}（${label} JWT 会导致 2049）fp=${vendorKeyFingerprint(v)}`,
      )
      delete out[k]
    }
  }
}

function shouldMergeLocalRegistryFile(): boolean {
  if (process.env.MEOO_MERGE_LOCAL_REGISTRY === '1') return true
  if (process.env.MEOO_MERGE_LOCAL_REGISTRY === '0') return false
  if (process.env.VERCEL === '1') return false
  if (process.env.AUTH_API_PORT) return false
  return process.env.NODE_ENV !== 'production'
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
    setFromRegistry(out, 'MERCHANT_AI_MINIMAX_KEY', minimax, 'minimax')
    setFromRegistry(out, 'MINIMAX_API_KEY', minimax, 'minimax')
  }

  const qwen = expanded.qwen
  if (qwen) {
    setFromRegistry(out, 'MERCHANT_AI_QWEN_KEY', qwen, 'qwen')
    setFromRegistry(out, 'DASHSCOPE_API_KEY', qwen, 'qwen')
  }

  const doubao = expanded.doubao
  if (doubao) {
    setFromRegistry(out, 'MERCHANT_AI_DOUBAO_KEY', doubao, 'doubao')
    setFromRegistry(out, 'ARK_API_KEY', doubao, 'doubao')
  }

  const deepseek = expanded.deepseek
  if (deepseek) setFromRegistry(out, 'DEEPSEEK_API_KEY', deepseek, 'deepseek')

  const kimi = expanded.kimi
  if (kimi) {
    setFromRegistry(out, 'MOONSHOT_API_KEY', kimi, 'kimi')
    setFromRegistry(out, 'MERCHANT_AI_KIMI_KEY', kimi, 'kimi')
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
  sanitizeMerchantAiEnvInPlace(out)
  purgeJwtDirectLlmKeys(out)
  if (shouldMergeLocalRegistryFile()) {
    mergeVendorKeysFromLocalRegistry(viteRoot, out)
  }
  try {
    const { loadRegistrySnapshotForServer } = await import('../src/lib/registrySnapshotServerLoad.js')
    const data = await loadRegistrySnapshotForServer(viteRoot)
    if (!data) {
      purgeJwtDirectLlmKeys(out)
      return out
    }
    const expanded = expandVendorKeysForRegistrySave(normalizeVendorKeysFromDisk(data.vendorKeys))
    stripDirectLlmEnvKeysForVendors(out, expanded)
    applyRegistryVendorKeysToMerchantEnv(out, data.vendorKeys)
    const va = data.videoAi
    if (va && typeof va === 'object') {
      const region = va as { minimaxRegion?: string; kimiRegion?: string }
      const mr = (region.minimaxRegion ?? '').trim().toLowerCase()
      const kr = (region.kimiRegion ?? '').trim().toLowerCase()
      if (mr === 'cn' || mr === 'intl' || mr === 'io') out.MINIMAX_REGION = mr === 'io' ? 'intl' : mr
      if (kr === 'cn' || kr === 'intl' || kr === 'ai') out.KIMI_REGION = kr === 'ai' ? 'intl' : kr
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[mergeMerchantAiEnv] registry snapshot load failed:', msg.slice(0, 300))
  }
  purgeJwtDirectLlmKeys(out)
  return out
}
