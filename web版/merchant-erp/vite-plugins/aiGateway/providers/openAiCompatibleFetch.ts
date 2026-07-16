/** OpenAI 兼容 Chat Completions（原生 fetch，避免 SDK 与部分厂商鉴权差异） */

export type OpenAiCompatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function openAiCompatChatFetch(opts: {
  baseURL: string
  apiKey: string
  model: string
  messages: OpenAiCompatMessage[]
  temperature?: number
  tools?: unknown[]
  tool_choice?: unknown
}): Promise<{
  model: string
  content: string
  raw: Record<string, unknown>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}> {
  const base = opts.baseURL.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    stream: false,
  }
  if (opts.tools?.length) {
    body.tools = opts.tools
    if (opts.tool_choice != null) body.tool_choice = opts.tool_choice
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    json = { raw_text: text.slice(0, 400) }
  }
  if (!res.ok) {
    const errMsg =
      typeof json.error === 'object' && json.error !== null
        ? String((json.error as { message?: string }).message ?? text.slice(0, 200))
        : text.slice(0, 200)
    throw new Error(`${res.status} ${errMsg}`)
  }
  const choices = json.choices as
    | {
        message?: {
          content?: string | null
          tool_calls?: Array<{
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }[]
    | undefined
  const message = choices?.[0]?.message
  const content = message?.content
  const rawCalls = message?.tool_calls
  const tool_calls =
    Array.isArray(rawCalls) && rawCalls.length
      ? rawCalls
          .filter((c) => c?.function?.name)
          .map((c, i) => ({
            id: typeof c.id === 'string' && c.id ? c.id : `call_${i}`,
            type: 'function' as const,
            function: {
              name: String(c.function!.name),
              arguments:
                typeof c.function!.arguments === 'string' ? c.function!.arguments : '{}',
            },
          }))
      : undefined
  return {
    model: typeof json.model === 'string' ? json.model : opts.model,
    content: typeof content === 'string' ? content : '',
    raw: json,
    ...(tool_calls?.length ? { tool_calls } : {}),
  }
}
