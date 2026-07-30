/**
 * 视频生成结构化 Brief：槽位抽取、执导增强、意图保真校验。
 * 阶段 C 产品侧；styleAdapter 仅类型预留，不接训练。
 */

import {
  BRIEF_SLOT_LABELS,
  STRUCTURE_BEAT_LABELS,
  findShortVideoSkill,
  type ShortVideoBriefSlotId,
  type ShortVideoSkill,
  type ShortVideoSkillId,
  type ShortVideoStructureBeat,
} from './shortVideoSkills'
import type { ShortVideoScriptRow } from './shortVideoScriptTable'

/** 阶段 D 再接 DiffSynth/musubi；本轮仅透传类型，上游忽略 */
export type VideoStyleAdapterHint = {
  id?: string
  strength?: number
}

export type ShortVideoGenBrief = {
  scene: string
  offer: string
  audience: string
  mustInclude: string[]
  mustAvoid: string[]
  skillId: ShortVideoSkillId | null
  aspect: '9:16' | '16:9' | '1:1' | null
  raw: string
  missingSlots: ShortVideoBriefSlotId[]
  adapterHint?: VideoStyleAdapterHint
}

const SLOT_PATTERNS: Record<ShortVideoBriefSlotId, RegExp[]> = {
  scene: [
    /(?:店名|门店|门店名|商圈|品牌|酒店|民宿|乐园|猫咖|健身房|瑜伽馆)[：:\s]*([^\n，,。；;]{2,40})/i,
    /(?:在|去)([^\n，,。；;]{2,24}(?:店|馆|屋|院|庄|吧|社|坊))/,
  ],
  offer: [
    /(?:卖点|主品|招牌|必点|产品|新品|活动|福利|菜品|锅底|课种|房型)[：:\s]*([^\n，,。；;]{2,48})/i,
    /必点[：:\s]*([^\n，,。；;]{2,40})/i,
  ],
  audience: [
    /(?:受众|人群|适合|面向)[：:\s]*([^\n，,。；;]{2,40})/i,
    /适合([^\n，,。；;]{2,24}(?:人|客|家长|情侣|朋友|家庭|白领))/,
  ],
}

const DEFAULT_MUST_AVOID = [
  '画面内出现可读字幕、标题、Logo 文字',
  '静止幻灯片式切图',
  '编造未提及的店名或价格',
]

const HOOK_HINTS = /钩子|开场|前\s*[123]秒|冲击|门铃|门口|排队|冲突|亮相|街景/
const PRODUCT_HINTS = /主品|卖点|特写|产品|招牌|必点|菜品|杯身|造型|房型|训练|萌宠|份量/
const CTA_HINTS = /CTA|行动号召|预约|下单|到店|外卖|办卡|预订|复购|福利|限时|扫码/

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return ''
}

function extractMustInclude(raw: string, scene: string, offer: string): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const t = s.trim()
    if (t.length >= 2 && !out.includes(t)) out.push(t)
  }
  if (scene) push(scene)
  if (offer) push(offer)
  for (const m of raw.matchAll(/[「『]([^」』]{2,24})[」』]/g)) push(m[1]!)
  for (const m of raw.matchAll(/(?:必须|务必|一定要)[出现含有有：:\s]*([^\n，,。；;]{2,24})/g)) {
    push(m[1]!)
  }
  return out.slice(0, 8)
}

function extractMustAvoid(raw: string): string[] {
  const out = [...DEFAULT_MUST_AVOID]
  for (const m of raw.matchAll(/(?:禁止|不要|避免|勿)[：:\s]*([^\n。；;]{2,40})/g)) {
    const t = m[1]!.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, 10)
}

/** 无 Skill 时的宽松必填：至少要有一段可执行描述 */
function missingSlotsFor(
  skill: ShortVideoSkill | null,
  scene: string,
  offer: string,
  audience: string,
  raw: string,
): ShortVideoBriefSlotId[] {
  const missing: ShortVideoBriefSlotId[] = []
  const required = skill?.briefSlots ?? (['scene', 'offer'] as ShortVideoBriefSlotId[])
  const filled: Record<ShortVideoBriefSlotId, boolean> = {
    scene: scene.length >= 2 || /店|馆|屋|院|品牌|商圈|门店/.test(raw),
    offer: offer.length >= 2 || /卖点|招牌|必点|产品|活动|福利|菜|串|杯/.test(raw),
    audience: audience.length >= 2 || /适合|人群|受众|家长|情侣|朋友/.test(raw),
  }
  // 无 Skill 且原文够具体：不强制槽位，只拦过短
  if (!skill && raw.trim().length >= 24) return []
  for (const slot of required) {
    if (!filled[slot]) missing.push(slot)
  }
  return missing
}

export function buildBriefFromInput(
  rawInput: string,
  skillOrId?: ShortVideoSkill | ShortVideoSkillId | null,
): ShortVideoGenBrief {
  const raw = String(rawInput || '').trim()
  const skill =
    typeof skillOrId === 'string' || skillOrId == null
      ? findShortVideoSkill(skillOrId)
      : skillOrId

  let scene = firstMatch(raw, SLOT_PATTERNS.scene)
  let offer = firstMatch(raw, SLOT_PATTERNS.offer)
  let audience = firstMatch(raw, SLOT_PATTERNS.audience)

  // Skill 模板占位未替换时，从「商家补充」段取第一行作 scene 兜底
  const noteBlock = raw.match(/【商家补充】\s*([\s\S]+)/)
  if (noteBlock?.[1]) {
    const firstLine = noteBlock[1]
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length >= 2)
    if (firstLine) {
      if (!scene) scene = firstLine.slice(0, 40)
      if (!offer && firstLine.length >= 4) {
        const parts = firstLine.split(/[，,、／/]/).map((x) => x.trim()).filter(Boolean)
        if (parts[1]) offer = parts[1]!.slice(0, 48)
        else if (!offer) offer = firstLine.slice(0, 48)
      }
    }
  }

  // 占位符 {门店/商圈} 仍在且无补充 → scene 视为空
  if (/\{门店|\{品牌|\{产品|\{活动|\{菜品|\{火锅|\{烧烤|\{美发|\{酒店|\{乐园|\{猫咖|\{健身/.test(raw) && !noteBlock) {
    if (!scene) scene = ''
    if (!offer) offer = ''
  }

  const mustInclude = extractMustInclude(raw, scene, offer)
  const mustAvoid = extractMustAvoid(raw)
  const missingSlots = missingSlotsFor(skill, scene, offer, audience, raw)

  return {
    scene,
    offer,
    audience,
    mustInclude,
    mustAvoid,
    skillId: skill?.id ?? null,
    aspect: skill?.preferAspect ?? null,
    raw,
    missingSlots,
  }
}

export function formatMissingSlotsMessage(brief: ShortVideoGenBrief): string {
  if (brief.missingSlots.length === 0) return ''
  const labels = brief.missingSlots.map((s) => BRIEF_SLOT_LABELS[s]).join('、')
  return `请先补全：${labels}（可在执导文案中写明店名/卖点等，或选 Skill 后填写商家补充）。`
}

export function enrichGuidanceFromBrief(brief: ShortVideoGenBrief): string {
  const lines: string[] = []
  if (brief.raw) lines.push(brief.raw)
  lines.push('')
  lines.push('【结构化执导约束·须严格遵守】')
  if (brief.scene) lines.push(`- 场景/门店：${brief.scene}`)
  if (brief.offer) lines.push(`- 主品/卖点：${brief.offer}`)
  if (brief.audience) lines.push(`- 受众：${brief.audience}`)
  if (brief.mustInclude.length) {
    lines.push(`- 画面或口播必须出现：${brief.mustInclude.join('、')}`)
  }
  if (brief.mustAvoid.length) {
    lines.push(`- 禁止：${brief.mustAvoid.join('；')}`)
  }
  lines.push('- 前 2 秒须有明确视觉钩子；中段突出主品/卖点；收尾含行动号召。')
  lines.push('- 运镜连续平滑，禁止静止幻灯；不要在画面内写字。')
  return lines.join('\n').trim()
}

function corpusFromRowsOrPrompt(
  rows: ShortVideoScriptRow[] | null | undefined,
  prompt: string | null | undefined,
): string {
  if (rows && rows.length > 0) {
    return rows.map((r) => `${r.visual}\n${r.dialogue}`).join('\n')
  }
  return String(prompt || '')
}

function beatCovered(beat: ShortVideoStructureBeat, text: string): boolean {
  if (beat === 'hook') return HOOK_HINTS.test(text) || /开场|进门|进店|门铃/.test(text)
  if (beat === 'product') return PRODUCT_HINTS.test(text)
  return CTA_HINTS.test(text)
}

export function validateBriefFidelity(
  brief: ShortVideoGenBrief,
  opts: {
    rows?: ShortVideoScriptRow[] | null
    prompt?: string | null
    skill?: ShortVideoSkill | null
  },
): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  const text = corpusFromRowsOrPrompt(opts.rows, opts.prompt)
  const norm = text.replace(/\s+/g, '')

  if (brief.missingSlots.length > 0) {
    issues.push(formatMissingSlotsMessage(brief))
  }

  for (const item of brief.mustInclude) {
    const key = item.trim()
    if (key.length < 2) continue
    if (!norm.includes(key.replace(/\s+/g, '')) && !text.includes(key)) {
      issues.push(`意图保真：分镜/文案未体现「${key}」`)
    }
  }

  const skill = opts.skill ?? findShortVideoSkill(brief.skillId)
  const beats = skill?.structureBeats ?? (['hook', 'product', 'cta'] as ShortVideoStructureBeat[])
  // 单段短文案：只要求至少命中一个主品或卖点关键词（若有 mustInclude 已覆盖则跳过节拍）
  if (text.trim().length < 40 && brief.mustInclude.length === 0) {
    if (text.trim().length < 12) issues.push('执导文案过短，请补充具体场景与卖点')
  } else {
    for (const beat of beats) {
      if (!beatCovered(beat, text)) {
        issues.push(`结构节拍缺失：${STRUCTURE_BEAT_LABELS[beat]}`)
      }
    }
  }

  return { ok: issues.length === 0, issues }
}

/** 注入到数字人/单段 Seedance prompt 的尾缀 */
export function briefPromptSuffix(brief: ShortVideoGenBrief): string {
  const parts: string[] = []
  if (brief.mustInclude.length) {
    parts.push(`画面与口播须出现：${brief.mustInclude.join('、')}`)
  }
  if (brief.mustAvoid.length) {
    parts.push(`禁止：${brief.mustAvoid.slice(0, 4).join('；')}`)
  }
  if (!parts.length) return ''
  return `\n（${parts.join('。')}）`
}
