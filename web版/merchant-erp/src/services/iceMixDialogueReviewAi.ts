/**
 * 混剪分镜表口播检核：规划完成后剔除提示语，并强制与当前段画面对齐。
 */
import { postAiChat } from './ai/aiClient'
import { finalizeMixScriptRows } from '../lib/iceMixPlan'
import type { ShortVideoScriptRow } from '../lib/shortVideoScriptTable'

const MIX_DIALOGUE_REVIEW_SYSTEM = `你是短视频口播编辑（探店/餐饮）。用户给出混剪分镜表，每段含【画面】与【口播】。

任务（强制）：
1. dialogue 只能是可直接 TTS 朗读的短句（12～28 字），第一人称或现场旁白
2. 剔除一切编导提示语/摘要/结构说明（如「最后以…收尾」「结合口播强调」「引导用户下单」「他们注重…」）
3. 口播必须只描述本段【画面】中可见的内容与动作，禁止讲其它镜头/未出现的信息
4. 禁止出现：核心卖点、叙事节奏、目标受众、引导用户、结合口播、以…收尾

只输出 JSON，无 markdown：
{"rows":[{"index":0,"dialogue":"..."},{"index":1,"dialogue":"..."}]}`

function parseReviewJson(raw: string, count: number): Map<number, string> {
  const map = new Map<number, string>()
  const m = raw.match(/\{[\s\S]*"rows"[\s\S]*\}/)
  if (!m) return map
  try {
    const o = JSON.parse(m[0]) as { rows?: Array<{ index?: number; dialogue?: string }> }
    if (!Array.isArray(o.rows)) return map
    for (const item of o.rows) {
      const idx = Number(item.index)
      const dialogue = String(item.dialogue ?? '').trim()
      if (!Number.isFinite(idx) || idx < 0 || idx >= count || dialogue.length < 4) continue
      map.set(idx, dialogue.slice(0, 120))
    }
  } catch {
    /* ignore */
  }
  return map
}

/** AI 检核口播：剔除提示语 + 与画面对齐；失败时回退规则 finalize */
export async function reviewMixScriptRowsWithAi(
  rows: ShortVideoScriptRow[],
  onProgress?: (msg: string) => void,
): Promise<ShortVideoScriptRow[]> {
  const base = finalizeMixScriptRows(rows)
  if (base.length === 0) return base

  onProgress?.('AI 检核口播文稿（剔除提示语、对齐画面）…')
  const userBlock = base
    .map(
      (r, i) =>
        `段${i}\n画面：${r.visual.trim() || '（无）'}\n口播：${r.dialogue.trim() || '（无）'}`,
    )
    .join('\n\n')

  const providers: Array<'doubao' | 'qwen'> = ['doubao', 'qwen']
  for (const provider of providers) {
    try {
      const res = await postAiChat({
        provider,
        temperature: 0.2,
        messages: [
          { role: 'system', content: MIX_DIALOGUE_REVIEW_SYSTEM },
          { role: 'user', content: userBlock },
        ],
      })
      const parsed = parseReviewJson(res.content?.trim() || '', base.length)
      if (parsed.size === 0) continue
      const merged = base.map((r, i) => ({
        ...r,
        dialogue: parsed.get(i) ?? r.dialogue,
      }))
      return finalizeMixScriptRows(merged)
    } catch {
      /* try next */
    }
  }

  return base
}
