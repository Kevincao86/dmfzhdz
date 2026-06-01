import { openAiCompatChatFetch, type OpenAiCompatMessage } from './providers/openAiCompatibleFetch.js'
import {
  minimaxChatBaseCandidates,
  minimaxChatModelCandidates,
  moonshotChatBaseCandidates,
  moonshotChatModelCandidates,
  resolveMinimaxApiKey,
  resolveMoonshotApiKey,
} from './providers/directLlmEnv.js'
import { formatDirectLlmKeyDebugHint, describeDirectLlmKeyDebug } from './directLlmKeyDebug.js'
import type { MerchantAiEnv } from '../merchantAiUpstream.js'

const PROBE_MSG: OpenAiCompatMessage[] = [{ role: 'user', content: 'ping' }]

export type LlmProbeResult = {
  ok: boolean
  provider: 'kimi' | 'minimax'
  detail?: string
  model?: string
  baseURL?: string
  keyDebug: ReturnType<typeof describeDirectLlmKeyDebug>
}

async function probeProvider(
  provider: 'kimi' | 'minimax',
  env: MerchantAiEnv,
  registryKeys: unknown,
): Promise<LlmProbeResult> {
  const keyDebug = describeDirectLlmKeyDebug(provider, env, registryKeys)
  const apiKey = provider === 'kimi' ? resolveMoonshotApiKey(env) : resolveMinimaxApiKey(env)
  if (!apiKey) {
    return { ok: false, provider, keyDebug, detail: '未配置 Key（注册表为空且 env 无值）' }
  }
  const bases =
    provider === 'kimi'
      ? moonshotChatBaseCandidates(env)
      : minimaxChatBaseCandidates(env, apiKey)
  const models =
    provider === 'kimi'
      ? moonshotChatModelCandidates(env)
      : minimaxChatModelCandidates(env)

  let lastErr = 'no_attempt'
  for (const baseURL of bases) {
    for (const model of models.slice(0, 2)) {
      try {
        const out = await openAiCompatChatFetch({
          baseURL,
          apiKey,
          model,
          messages: PROBE_MSG,
          temperature: 0.1,
        })
        return { ok: true, provider, model: out.model, baseURL, keyDebug, detail: 'ok' }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
    }
  }
  return {
    ok: false,
    provider,
    keyDebug,
    detail: `${lastErr} ${formatDirectLlmKeyDebugHint(provider, keyDebug)}`,
  }
}

export async function probeDirectLlmKeys(
  env: MerchantAiEnv,
  registryKeys: unknown,
): Promise<{ kimi: LlmProbeResult; minimax: LlmProbeResult }> {
  const [kimi, minimax] = await Promise.all([
    probeProvider('kimi', env, registryKeys),
    probeProvider('minimax', env, registryKeys),
  ])
  return { kimi, minimax }
}
