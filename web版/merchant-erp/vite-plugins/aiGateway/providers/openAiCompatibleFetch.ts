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
}): Promise<{ model: string; content: string; raw: Record<string, unknown> }> {
  const base = opts.baseURL.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.6,
      stream: false,
    }),
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
  const choices = json.choices as { message?: { content?: string } }[] | undefined
  const content = choices?.[0]?.message?.content
  return {
    model: typeof json.model === 'string' ? json.model : opts.model,
    content: typeof content === 'string' ? content : '',
    raw: json,
  }
}
