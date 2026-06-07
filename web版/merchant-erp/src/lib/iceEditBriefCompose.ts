/** 云剪：字幕文案框 + 剪辑指令框 合并为 ICE 解析用完整 brief */

const ICE_BRIEF_BRAND_NOISE_RE = /灵祺\s*AI?|智能\s*ERP|云剪|Lingqi/gi

/** 去掉 AI 偶发带入的产品/平台名称，避免上屏字幕出现品牌词 */
export function sanitizeIceEditBriefBrandNoise(text: string): string {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(ICE_BRIEF_BRAND_NOISE_RE, '').replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

export function composeIceEditBrief(copy: string, instruction: string): string {
  const c = String(copy || '').trim()
  const i = String(instruction || '').trim()
  if (c && i) return `【剪辑指令】\n${i}\n\n【字幕文案】\n${c}`
  if (c) return `【字幕文案】\n${c}`
  if (i) return `【剪辑指令】\n${i}`
  return ''
}

export function splitIceEditBrief(brief: string): { copy: string; instruction: string } {
  const raw = String(brief || '').trim()
  if (!raw) return { copy: '', instruction: '' }

  const instMatch = raw.match(/【剪辑指令】\s*([\s\S]*?)(?=\n*【字幕文案】|$)/)
  const copyMatch = raw.match(/【字幕文案】\s*([\s\S]*?)(?=\n*【|$)/)
  const instruction = instMatch?.[1]?.trim() ?? ''
  const copy = copyMatch?.[1]?.trim() ?? ''

  if (instruction || copy) return { copy, instruction }

  // 旧版单框：含「整体基调/镜头」等视为指令，引号句视为文案
  const quoted = [...raw.matchAll(/[「『"]([^」』"]{2,36})[」』"]/g)].map((m) => m[1]?.trim()).filter(Boolean)
  if (quoted.length) {
    return {
      copy: quoted.join('\n'),
      instruction: raw,
    }
  }
  return { copy: '', instruction: raw }
}
