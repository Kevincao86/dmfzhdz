/** 短视频口播提取（纯函数，供 auth-api / Vite 网关共用，勿引入前端 services） */

export const SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX =
  '【画面约束】禁止在视频画面内渲染任何文字、字幕、标题、Logo 字样或乱码字符；口播与字幕由后期合成。'

/** 图生视频时强调连续动态，避免模型输出近乎静止的「幻灯片」 */
export const SHORT_VIDEO_MOTION_PROMPT_SUFFIX =
  '【动作运镜】镜头持续平滑运动，主体有自然微动与景深变化，禁止静止硬切或单帧停留。'

const METADATA_LINE =
  /^(总时长|时长|适配比例|画幅|比例|帧率|fps|BGM|背景音乐|配乐|字幕样式|字体|分辨率|水印)/i

const GUIDANCE_INSTRUCTION_LINE =
  /^(AI生成|生成技巧|使用技巧|分镜参考|参考图|上传|模型选择|时长|画幅|帧率|提示词说明|执导说明|建议|注意[:：]|说明[:：])/i

const GUIDANCE_SECTION_LINE =
  /^(基础设定|人物设定|人物|风格|调性|画面要求|动作要求|运镜|运镜要求|分镜|镜头|全局|前置提示词|技术参数|时长设定|场景设定|角色设定|产品呈现|画面描述|动作描述)/i

const STORYBOARD_LINE =
  /^(分镜|镜头)\s*[\d一二三四五六七八九十]|^\d+[\.、:：\s]|^[（(]\s*\d+[\-~–—至]\d+\s*秒/

const NARRATION_SECTION_RE =
  /(?:^|\n)\s*【?\s*(口播文案|口播稿|旁白文案|旁白|对白|字幕文案|上屏文案|文案稿)\s*】?\s*[:：]\s*([\s\S]+?)(?=\n\s*【|\n\s*(?:基础设定|分镜|镜头|画面|动作|运镜|人物|风格)|$)/gi

/** 方舟 Seedance content.text 字段上限（中文约 500 字内较稳） */
export const SEEDANCE_MAX_CONTENT_TEXT = 480

/** 图生视频（含参考图）时 content.text 更短更稳，避免 Invalid content.text */
export const SEEDANCE_I2V_MAX_CONTENT_TEXT = 280

/** 数字人口播 / 图生视频兜底提示词（方舟校验失败时重试） */
export const SEEDANCE_EMERGENCY_I2V_PROMPT =
  '竖屏9:16数字人口播，参考图人物为主播，自然口型微动与肢体动作，背景简洁，镜头平稳，禁止画面内任何文字字幕。'

function closeBrokenBrackets(text: string): string {
  let t = text
  const opens = (t.match(/【/g) ?? []).length
  const closes = (t.match(/】/g) ?? []).length
  if (opens > closes) t += '】'.repeat(opens - closes)
  return t
}

/** 去掉 prompt 内嵌 CLI 参数（Seedance v2 用 payload 字段，勿写入 text） */
export function stripSeedanceInlineFlagsFromPrompt(text: string): string {
  return String(text ?? '')
    .replace(/\s--(?:dur|fps|ratio|wm|resolution)\s+\S+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 提交 Seedance 前截断/规整 content.text，避免 Invalid content.text */
export function clampSeedanceContentText(
  text: string,
  maxLen = SEEDANCE_MAX_CONTENT_TEXT,
): string {
  let t = stripSeedanceInlineFlagsFromPrompt(
    String(text ?? '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\r\n/g, '\n')
      .trim(),
  )
  if (!t) return SEEDANCE_EMERGENCY_I2V_PROMPT
  t = t.replace(/\n{3,}/g, '\n\n')
  if (t.length <= maxLen) return closeBrokenBrackets(t)

  const keepPatterns = [
    /竖屏[^。\n]{0,80}/,
    /竖屏数字人口播[^。\n]*/,
    /承接上一段[^。\n]*/,
    /背景替换[^。\n]*/,
    /【背景】[^。\n]*/,
    /严格执行动作[^。\n]*/,
    /【一体化融合】[^。\n]*/,
    /【动作运镜】[^。\n]*/,
    /【画面约束】[^。\n]*/,
    /【画幅】[^。\n]*/,
    /自然口播微动[^。\n]*/,
  ]
  const picked: string[] = []
  for (const re of keepPatterns) {
    const m = t.match(re)
    if (m?.[0]) picked.push(m[0].trim())
  }
  let compact = picked.length ? [...new Set(picked)].join('；') : t.slice(0, maxLen)
  if (compact.length > maxLen) compact = compact.slice(0, maxLen)
  compact = closeBrokenBrackets(compact)
  if (!compact.includes('【画幅】') && !/9:16/.test(compact)) {
    const suffix = '；【画幅】竖屏9:16'
    compact = `${compact.slice(0, Math.max(40, maxLen - suffix.length))}${suffix}`
  }
  const out = closeBrokenBrackets(compact.slice(0, maxLen)).trim()
  return out.length >= 8 ? out : SEEDANCE_EMERGENCY_I2V_PROMPT.slice(0, maxLen)
}

/** 提交给视频模型前：去掉技术参数行，避免模型把元数据画进画面 */
export function sanitizePromptForVideoModel(prompt: string): string {
  const lines = prompt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !METADATA_LINE.test(l) && !/^--dur\s/i.test(l))
  let body = lines
    .map((l) =>
      l
        .replace(/https?:\/\/[^\s)\]"']+/gi, '网页界面演示')
        .replace(/\b[\w-]+\.(com|cn|net|io|ai|org)(?:\/[^\s)\]"']*)?/gi, '网页界面'),
    )
    .join('\n')
    .trim()
  if (!body) body = prompt.trim()
  if (!body.includes('【画面约束】')) {
    body = `${body}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}`
  }
  return body
}

function looksLikeGuidanceDoc(text: string): boolean {
  return /基础设定|分镜\s*[\d一二三四五六七八九十]|总时长|前置提示词|画面描述|运镜要求|适配比例|竖屏（抖音|全局统一\s*AI|执行流程|画面[:：]|动作[:：]|镜头\s*\d/i.test(
    text,
  )
}

/** 已是短口播稿（非执导全文）时不再二次拆解 */
export function looksLikeReadyNarration(text: string): boolean {
  const t = text.trim()
  if (t.length < 4) return false
  if (looksLikeGuidanceDoc(t)) return false
  if (t.length <= 320 && !STORYBOARD_LINE.test(t) && !GUIDANCE_SECTION_LINE.test(t)) return true
  return false
}

function extractExplicitNarrationSections(raw: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(NARRATION_SECTION_RE.source, 'gi')
  while ((m = re.exec(raw)) !== null) {
    const body = String(m[2] || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !METADATA_LINE.test(l))
      .filter((l) => !GUIDANCE_SECTION_LINE.test(l))
      .filter((l) => !STORYBOARD_LINE.test(l))
      .join('，')
      .replace(/，+/g, '，')
      .trim()
    if (body.length >= 4) out.push(body)
  }
  return out
}

function extractQuotedDialogue(raw: string): string {
  const parts: string[] = []
  const re = /「([^」]{3,120})」|“([^”]{3,120})”|"([^"]{3,120})"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const q = (m[1] || m[2] || m[3] || '').trim()
    if (q.length >= 3) parts.push(q)
  }
  if (!parts.length) return ''
  return parts.join('。').replace(/。+/g, '。')
}

function filterSpokenLines(lines: string[]): string[] {
  return lines
    .filter((l) => !METADATA_LINE.test(l))
    .filter((l) => !GUIDANCE_INSTRUCTION_LINE.test(l))
    .filter((l) => !GUIDANCE_SECTION_LINE.test(l))
    .filter((l) => !STORYBOARD_LINE.test(l))
    .filter((l) => !/^画面[:：]|^动作[:：]|^运镜[:：]|^镜头[:：]/i.test(l))
    .filter((l) => !l.startsWith('【画面约束】') && !l.startsWith('【产品呈现】'))
    .filter((l) => !/^[-*•]\s/.test(l))
    .map((l) => l.replace(/【[^】]+】/g, '').trim())
    .filter((l) => l.length >= 2)
}

export function capNarrationForDuration(script: string, durationSec: number): string {
  const t = script.trim()
  if (!t) return ''
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 30
  const maxChars = Math.max(12, Math.min(520, Math.floor(dur * 4.2)))
  if (t.length <= maxChars) return t
  const slice = t.slice(0, maxChars)
  const lastPause = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'))
  if (lastPause >= Math.floor(maxChars * 0.45)) return slice.slice(0, lastPause + 1)
  return slice
}

/** 从执导/指导文案提取可朗读口播（过滤制作说明，不直接朗读操作提示） */
export function extractShortVideoNarrationScript(prompt: string): string {
  const raw = prompt.trim()
  if (!raw) return ''

  if (looksLikeReadyNarration(raw)) return raw.slice(0, 520)

  const explicit = extractExplicitNarrationSections(raw)
  if (explicit.length) {
    return explicit.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  const quoted = extractQuotedDialogue(raw)
  if (quoted.length >= 8) return quoted.slice(0, 520)

  const spokenBlocks: string[] = []
  for (const block of raw.split(/\n{2,}/)) {
    const lines = filterSpokenLines(
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
    if (!lines.length) continue
    if (/口播[:：]/.test(block)) {
      const m = block.match(/口播[:：]\s*([\s\S]+)/)
      if (m?.[1]?.trim()) spokenBlocks.push(m[1].trim())
      continue
    }
    if (/技巧|上传.*图|参考图|生成模式|AI生成|前置提示词|画面描述|运镜/i.test(block)) continue
    const joined = lines.join('，').replace(/，+/g, '，')
    if (joined.length >= 4) spokenBlocks.push(joined)
  }

  if (spokenBlocks.length) {
    return spokenBlocks.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  const lines = filterSpokenLines(
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  )

  if (lines.length) {
    return lines.join('。').replace(/。+/g, '。').slice(0, 520)
  }

  return raw
    .replace(SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, '')
    .replace(/【[^】]+】/g, '')
    .trim()
    .slice(0, 520)
}

/** 指导文案 → 可 TTS 口播（含时长截断） */
export function finalizeNarrationScript(source: string, durationSec: number): string {
  const raw = source.trim()
  if (!raw) return ''
  const base = looksLikeReadyNarration(raw) ? raw : extractShortVideoNarrationScript(raw)
  return capNarrationForDuration(base, durationSec)
}
