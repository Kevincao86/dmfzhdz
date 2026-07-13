/**
 * 视觉工坊 AI 接入：文案（LLM）+ 生图（已在页面内 postAiAgentNativeImage）
 */
import { postAiChat } from './aiClient'
import type { CopySuggestion, VisualStudioForm } from '../../lib/aiImageStudioPresets'
import {
  generateCopySuggestions,
  LOCAL_LIFE_INDUSTRIES,
  PUBLISH_CHANNELS,
  resolvePlaybook,
} from '../../lib/aiImageStudioPresets'

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m?.[1] ?? t).trim()
}

function parseCopySuggestionsFromAi(text: string): CopySuggestion[] | null {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned) as unknown
    if (!Array.isArray(parsed)) return null
    const out: CopySuggestion[] = []
    for (const row of parsed.slice(0, 3)) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const headline = typeof o.headline === 'string' ? o.headline.trim() : ''
      if (!headline) continue
      out.push({
        headline,
        subheadline: typeof o.subheadline === 'string' ? o.subheadline.trim() : '',
        offer: typeof o.offer === 'string' ? o.offer.trim() : '',
        timeRange: typeof o.timeRange === 'string' ? o.timeRange.trim() : '',
        note: typeof o.note === 'string' ? o.note.trim() : '',
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export type VisualStudioAiCopyResult =
  | { ok: true; items: CopySuggestion[]; source: 'ai' | 'local' }
  | { ok: false; message: string; fallback: CopySuggestion[] }

/** 调用智能体 LLM 生成 3 套海报文案，失败则回退本地模板 */
export async function fetchVisualStudioCopyFromAi(
  form: VisualStudioForm,
  opts?: { signal?: AbortSignal },
): Promise<VisualStudioAiCopyResult> {
  const fallback = generateCopySuggestions(form)
  const industry = LOCAL_LIFE_INDUSTRIES.find((x) => x.id === form.industry)
  const pb = resolvePlaybook(form.playbook)
  const channels = form.channels
    .map((id) => PUBLISH_CHANNELS.find((c) => c.id === id)?.label ?? id)
    .join('、')

  const jsonExample = '[{"headline":"","subheadline":"","offer":"","timeRange":"","note":""}]'
  const userPrompt = [
    `你是中国大陆本地生活商家营销文案专家。请为「${industry?.label ?? '本地生活'}」门店生成 3 套海报文案。`,
    '',
    `门店名：${form.storeName.trim() || '（未填，可用「本店」）'}`,
    `营销玩法：${pb.label}（${pb.desc}）`,
    `投放平台：${channels || '抖音'}`,
    `当前主标题参考：${form.headline.trim() || '（待生成）'}`,
    '',
    '要求：',
    '1. 每套含 headline（主标题≤12字）、subheadline、offer、timeRange、note',
    `2. 文案符合${industry?.label}行业语感（${industry?.sceneHint}）`,
    `3. 适合${pb.label}场景，可直接用于 AI 海报生图`,
    `4. 只输出 JSON 数组，不要 markdown，格式示例：${jsonExample}`,
    '',
    '生成 3 套风格略有差异的方案。',
  ].join('\n')

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        taskType: 'generate_copywriting',
      },
      { signal: opts?.signal },
    )
    const parsed = parseCopySuggestionsFromAi(res.content)
    if (parsed?.length) {
      return { ok: true, items: parsed, source: 'ai' }
    }
    return {
      ok: false,
      message: 'AI 返回格式无法解析，已使用本地文案包',
      fallback,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: msg.includes('abort') ? '已取消' : `AI 文案暂不可用：${msg.slice(0, 120)}`,
      fallback,
    }
  }
}
