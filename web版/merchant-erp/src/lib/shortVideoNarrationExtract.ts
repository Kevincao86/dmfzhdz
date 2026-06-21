/** 短视频口播提取（纯函数，供 auth-api / Vite 网关共用，勿引入前端 services） */

export const SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX =
  '【画面约束】禁止在视频画面内渲染任何文字、字幕、标题、Logo 字样或乱码字符；口播与字幕由后期合成。'

const METADATA_LINE =
  /^(总时长|时长|适配比例|画幅|比例|帧率|fps|BGM|背景音乐|配乐|字幕样式|字体|分辨率|水印)/i

const GUIDANCE_INSTRUCTION_LINE =
  /^(AI生成|生成技巧|使用技巧|分镜参考|参考图|上传|模型选择|时长|画幅|帧率|提示词说明|执导说明|建议|注意[:：]|说明[:：])/i

/** 提交给视频模型前：去掉技术参数行，避免模型把元数据画进画面 */
export function sanitizePromptForVideoModel(prompt: string): string {
  const lines = prompt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !METADATA_LINE.test(l) && !/^--dur\s/i.test(l))
  let body = lines.join('\n').trim()
  if (!body) body = prompt.trim()
  if (!body.includes('【画面约束】')) {
    body = `${body}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}`
  }
  return body
}

/** 从执导/指导文案提取可朗读口播（过滤制作说明，不直接朗读操作提示） */
export function extractShortVideoNarrationScript(prompt: string): string {
  const raw = prompt.trim()
  if (!raw) return ''

  const spokenBlocks: string[] = []
  for (const block of raw.split(/\n{2,}/)) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !METADATA_LINE.test(l))
      .filter((l) => !GUIDANCE_INSTRUCTION_LINE.test(l))
      .filter((l) => !l.startsWith('【画面约束】') && !l.startsWith('【产品呈现】'))
      .filter((l) => !/^[-*•]\s/.test(l))
      .map((l) => l.replace(/【[^】]+】/g, '').trim())
      .filter((l) => l.length >= 2)
    if (!lines.length) continue
    const joined = lines.join('，').replace(/，+/g, '，')
    if (/口播[:：]/.test(block)) {
      const m = block.match(/口播[:：]\s*([\s\S]+)/)
      if (m?.[1]?.trim()) spokenBlocks.push(m[1].trim())
      continue
    }
    if (!/技巧|上传.*图|参考图|生成模式|AI生成/i.test(block)) {
      spokenBlocks.push(joined)
    }
  }

  if (spokenBlocks.length) {
    return spokenBlocks.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !METADATA_LINE.test(l))
    .filter((l) => !GUIDANCE_INSTRUCTION_LINE.test(l))
    .filter((l) => !l.startsWith('【画面约束】') && !l.startsWith('【产品呈现】'))
    .filter((l) => !/^[-*•]\s/.test(l))
    .map((l) => l.replace(/【[^】]+】/g, '').trim())
    .filter((l) => l.length >= 2)

  if (lines.length) {
    return lines.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  return raw
    .replace(SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, '')
    .replace(/【[^】]+】/g, '')
    .trim()
    .slice(0, 520)
}
