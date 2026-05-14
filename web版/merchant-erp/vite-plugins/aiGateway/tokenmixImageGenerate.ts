/**
 * TokenMix OpenAI 兼容 `/v1/images/generations` — 用于智能体选择 GPT Image / DALL·E 等展示模型时走真实中继出图。
 */
export async function tokenmixImagesGenerate(
  env: Record<string, string>,
  modelId: string,
  prompt: string,
): Promise<{ imageUrl: string; modelUsed: string }> {
  const apiKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('TOKENMIX_API_KEY 未配置')
  const baseRaw = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
  const { default: OpenAICtor } = await import('openai')
  const client = new OpenAICtor({ apiKey, baseURL: baseRaw })
  const mid = modelId.trim()
  if (!mid) throw new Error('tokenmix_image_model 为空')

  const p = prompt.trim().slice(0, 3800)
  if (!p) throw new Error('prompt 为空')

  const isDalle3 = mid.includes('dall-e-3') || mid === 'dall-e-3'
  const isDalle2 = mid.includes('dall-e-2') || mid === 'dall-e-2'

  const payload: Record<string, unknown> = { model: mid, prompt: p, n: 1 }
  if (isDalle3) {
    payload.size = '1024x1024'
    payload.response_format = 'url'
  } else if (isDalle2) {
    payload.size = '512x512'
    payload.response_format = 'url'
  } else {
    payload.size = '1024x1024'
    payload.response_format = 'url'
  }

  const res = await client.images.generate(payload as never)
  const data = res.data
  const row = Array.isArray(data) ? data[0] : undefined
  let imageUrl = typeof row?.url === 'string' ? row.url.trim() : ''
  const b64 = typeof row?.b64_json === 'string' ? row.b64_json.trim() : ''
  if (!imageUrl && b64) imageUrl = `data:image/png;base64,${b64}`
  if (!imageUrl) throw new Error('TokenMix 生图未返回 url / b64_json')
  const modelUsed =
    typeof (res as unknown as { model?: string }).model === 'string'
      ? (res as unknown as { model: string }).model
      : mid
  return { imageUrl, modelUsed }
}
