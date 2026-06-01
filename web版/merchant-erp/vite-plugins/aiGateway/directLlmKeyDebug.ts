import { looksLikeJwtCredential, vendorKeyFingerprint } from '../../src/lib/aiVendorKeyValidate.js'
import {
  minimaxChatBaseCandidates,
  moonshotChatBaseCandidates,
  resolveMinimaxApiKey,
  resolveMoonshotApiKey,
} from './providers/directLlmEnv.js'
import { describeMergedAiVendorKeys } from '../merchantRegistryVendorEnv.js'
import type { MerchantAiEnv } from '../merchantAiUpstream.js'

export type DirectLlmKeyDebug = {
  fingerprint: string
  looksLikeJwt: boolean
  bases: string[]
  source: 'registry' | 'env' | 'none'
}

export function describeDirectLlmKeyDebug(
  provider: 'kimi' | 'minimax',
  env: MerchantAiEnv,
  registryKeys: unknown,
): DirectLlmKeyDebug {
  const vendors = describeMergedAiVendorKeys(env, registryKeys)
  const row = vendors.find((v) => v.vendor === provider)
  if (provider === 'kimi') {
    const key = resolveMoonshotApiKey(env)
    return {
      fingerprint: vendorKeyFingerprint(key),
      looksLikeJwt: key ? looksLikeJwtCredential(key) : false,
      bases: moonshotChatBaseCandidates(env),
      source: row?.source ?? 'none',
    }
  }
  const key = resolveMinimaxApiKey(env)
  return {
    fingerprint: vendorKeyFingerprint(key),
    looksLikeJwt: key ? looksLikeJwtCredential(key) : false,
    bases: minimaxChatBaseCandidates(env, key),
    source: row?.source ?? 'none',
  }
}

export function formatDirectLlmKeyDebugHint(provider: 'kimi' | 'minimax', dbg: DirectLlmKeyDebug): string {
  const regionHint =
    provider === 'minimax'
      ? '国内 Key 用 api.minimaxi.com，国际用 api.minimax.io；可设 MINIMAX_REGION=cn|intl'
      : '国内 Key 用 api.moonshot.cn，国际用 api.moonshot.ai'
  return `[key=${dbg.fingerprint}, source=${dbg.source}, jwt=${dbg.looksLikeJwt ? 'yes' : 'no'}; ${regionHint}]`
}
