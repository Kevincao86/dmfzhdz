/** 直连厂商 Key / Base URL（与运营台 vendorKeys、MERCHANT_AI_* 对齐） */

export function resolveMinimaxApiKey(env: Record<string, string>): string {
  return (env.MINIMAX_API_KEY ?? env.MERCHANT_AI_MINIMAX_KEY ?? '').trim()
}

export function resolveMoonshotApiKey(env: Record<string, string>): string {
  return (env.MOONSHOT_API_KEY ?? env.MERCHANT_AI_KIMI_KEY ?? env.KIMI_API_KEY ?? '').trim()
}

/** 国内 Key 通常走 moonshot.cn；国际走 moonshot.ai */
export function moonshotChatBaseCandidates(env: Record<string, string>): string[] {
  const custom = (env.KIMI_BASE_URL ?? env.MOONSHOT_BASE_URL ?? '').trim().replace(/\/$/, '')
  const region = (env.KIMI_REGION ?? env.MOONSHOT_REGION ?? '').trim().toLowerCase()
  const cnFirst = region === 'cn' || region === 'moonshot.cn'
  const intlFirst = region === 'intl' || region === 'ai' || region === 'moonshot.ai'
  const out: string[] = []
  const add = (u: string) => {
    const t = u.trim().replace(/\/$/, '')
    if (t && !out.includes(t)) out.push(t)
  }
  if (custom) add(custom)
  if (intlFirst) {
    add('https://api.moonshot.ai/v1')
    add('https://api.moonshot.cn/v1')
  } else if (cnFirst) {
    add('https://api.moonshot.cn/v1')
    add('https://api.moonshot.ai/v1')
  } else {
    add('https://api.moonshot.cn/v1')
    add('https://api.moonshot.ai/v1')
  }
  return out
}

export function minimaxChatBaseCandidates(env: Record<string, string>, apiKey?: string): string[] {
  const custom = (env.MINIMAX_BASE_URL ?? env.MERCHANT_AI_MINIMAX_CHAT_BASE ?? '')
    .trim()
    .replace(/\/$/, '')
  const key = (apiKey ?? resolveMinimaxApiKey(env)).trim()
  const region = (env.MINIMAX_REGION ?? '').trim().toLowerCase()
  const cnFirst = region === 'cn' || key.startsWith('sk-api-')
  const intlFirst = region === 'intl' || region === 'io'
  const out: string[] = []
  const add = (u: string) => {
    const t = u.trim().replace(/\/$/, '')
    if (t && !out.includes(t)) out.push(t)
  }
  if (custom) {
    add(custom.includes('/chat/completions') ? custom.replace(/\/chat\/completions.*$/, '') : custom)
  }
  if (intlFirst) {
    add('https://api.minimax.io/v1')
    add('https://api.minimaxi.com/v1')
  } else if (cnFirst) {
    add('https://api.minimaxi.com/v1')
    add('https://api.minimax.io/v1')
  } else {
    add('https://api.minimaxi.com/v1')
    add('https://api.minimax.io/v1')
  }
  return out
}

export function moonshotChatModelCandidates(
  env: Record<string, string>,
  reqModel?: string,
): string[] {
  const out: string[] = []
  const add = (m: string) => {
    const t = m.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  if (reqModel?.trim()) add(reqModel.trim())
  const envModel = (env.KIMI_MODEL ?? env.MOONSHOT_MODEL ?? '').trim()
  if (envModel) add(envModel)
  for (const m of ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest']) add(m)
  return out.length ? out : ['moonshot-v1-8k']
}

export function minimaxChatModelCandidates(
  env: Record<string, string>,
  reqModel?: string,
  regDefault?: string,
): string[] {
  const out: string[] = []
  const add = (m: string) => {
    const t = m.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  if (reqModel?.trim()) add(reqModel.trim())
  const envModel = (env.MINIMAX_MODEL ?? env.MERCHANT_AI_MINIMAX_CHAT_MODEL ?? '').trim()
  if (envModel) add(envModel)

  const apiKey = resolveMinimaxApiKey(env)
  const region = (env.MINIMAX_REGION ?? '').trim().toLowerCase()
  const cnDomestic = region === 'cn' || apiKey.startsWith('sk-api-')
  const intlFirst = region === 'intl' || region === 'io'

  if (regDefault?.trim()) add(regDefault.trim())

  if (cnDomestic && !intlFirst) {
    /** 国内 sk-api- Key 在 api.minimaxi.com 上优先 abab 系列，M2.x 常报 401/2061 */
    for (const m of [
      'abab6.5s-chat',
      'abab6.5-chat',
      'abab6.5t-chat',
      'abab5.5s-chat',
      'MiniMax-Text-01',
    ]) {
      add(m)
    }
    for (const m of ['MiniMax-M2.1', 'MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2']) add(m)
  } else {
    for (const m of ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2']) add(m)
    for (const m of ['abab6.5s-chat', 'abab6.5-chat', 'abab6.5t-chat', 'abab5.5s-chat']) add(m)
  }
  return out.length ? out : [cnDomestic && !intlFirst ? 'abab6.5s-chat' : 'MiniMax-M2.7']
}
