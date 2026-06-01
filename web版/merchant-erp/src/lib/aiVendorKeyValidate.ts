/** 直连 LLM 厂商 Key 格式校验（运营台保存 + 网关调用前） */

export function looksLikeJwtCredential(key: string): boolean {
  return key.trim().startsWith('eyJ')
}

export function vendorKeyFingerprint(key: string): string {
  const k = key.trim()
  if (!k) return '(empty)'
  if (looksLikeJwtCredential(k)) return `jwt:${k.slice(0, 12)}…(${k.length})`
  if (k.length <= 12) return `${k.slice(0, 4)}…(${k.length})`
  return `${k.slice(0, 8)}…${k.slice(-4)}(${k.length})`
}

/** 返回人类可读错误；null 表示通过 */
export function validateRegistryVendorKey(vendorId: string, rawKey: string): string | null {
  const id = vendorId.trim().toLowerCase()
  const key = rawKey.trim()
  if (!key) return null

  if (looksLikeJwtCredential(key)) {
    if (id === 'minimax') {
      return 'MiniMax 需 sk- 开头「接口密钥」，勿填 eyJ 开头的 JWT（会报 2049 invalid api key）'
    }
    if (id === 'kimi') {
      return 'Kimi 需 platform.moonshot.cn 的 sk- 开头 API Key，勿填 JWT 或其它平台密钥'
    }
    if (id === 'tokenmix' || id === 'openai' || id === 'claude' || id === 'gemini' || id === 'grok') {
      return null
    }
    return '密钥形如 JWT(eyJ…)，请确认是否粘贴了 Supabase/登录 Token 而非厂商 API Key'
  }

  if (id === 'kimi' && !key.startsWith('sk-')) {
    return 'Kimi Key 应以 sk- 开头（在 platform.moonshot.cn → API Key 复制）'
  }

  if (id === 'minimax' && !/^sk[-_]/i.test(key)) {
    return 'MiniMax OpenAI 兼容对话需 sk- 或 sk-api- 开头接口密钥（平台「接口密钥」页，非 JWT）'
  }

  return null
}

export function assertDistinctFromTokenMix(
  vendorLabel: string,
  apiKey: string,
  tokenmixKey: string | undefined,
): void {
  const tm = (tokenmixKey ?? '').trim()
  if (tm && apiKey.trim() === tm) {
    throw new Error(
      `${vendorLabel} Key 与 TokenMix Key 相同；请在运营台「AI 模型」为 ${vendorLabel} 单独填写厂商密钥`,
    )
  }
}
