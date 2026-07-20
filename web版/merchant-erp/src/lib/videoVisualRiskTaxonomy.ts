/**
 * 成片抽帧「画面敏感分类」：固定类目 + 强制落库短语。
 * 不依赖模型自觉写 visualHits；由 riskClasses / 结构化字段映射。
 */

export type VisualRiskClass =
  | 'attire_edge'
  | 'pose_edge'
  | 'nudity_sensitive'
  | 'violence_fight'
  | 'gore_injury'
  | 'dangerous_act'
  | 'qr_divert'
  | 'blur_divert'
  | 'contact_divert'
  | 'innuendo_speech'
  | 'soft_porn_divert'
  | 'normal'

/** 类目 → 对外命中短语（写入 hits / 强制 suspect） */
export const VISUAL_RISK_CLASS_LABEL: Record<Exclude<VisualRiskClass, 'normal'>, string> = {
  attire_edge: '着装擦边',
  pose_edge: '姿态擦边',
  nudity_sensitive: '敏感裸露画面',
  violence_fight: '暴力打斗画面',
  gore_injury: '血腥伤害画面',
  dangerous_act: '危险动作画面',
  qr_divert: '二维码特写导流',
  blur_divert: '打码指认导流',
  contact_divert: '联系方式露出',
  innuendo_speech: '双关暗示话术',
  soft_porn_divert: '色情导流风险',
}

export const VISUAL_FORCE_HIT_LABELS = Object.values(VISUAL_RISK_CLASS_LABEL)

/** 命中任一即强制 suspect，禁止美食/探店豁免 */
export function isVisualForceHitPhrase(phrase: string): boolean {
  const p = String(phrase || '').trim()
  if (!p) return false
  return VISUAL_FORCE_HIT_LABELS.some((lab) => p.includes(lab) || lab.includes(p))
}

const CLASS_ALIASES: Record<string, VisualRiskClass> = {
  attire_edge: 'attire_edge',
  sheer_or_deep_neck: 'attire_edge',
  short_bottoms: 'attire_edge',
  both: 'attire_edge',
  pose_edge: 'pose_edge',
  bend_over: 'pose_edge',
  chest_closeup: 'pose_edge',
  nudity_sensitive: 'nudity_sensitive',
  nudity: 'nudity_sensitive',
  violence_fight: 'violence_fight',
  violence: 'violence_fight',
  fight: 'violence_fight',
  gore_injury: 'gore_injury',
  gore: 'gore_injury',
  blood: 'gore_injury',
  dangerous_act: 'dangerous_act',
  dangerous: 'dangerous_act',
  qr_divert: 'qr_divert',
  qr_closeup: 'qr_divert',
  blur_divert: 'blur_divert',
  blur_point: 'blur_divert',
  contact_divert: 'contact_divert',
  contact_shown: 'contact_divert',
  innuendo_speech: 'innuendo_speech',
  soft_porn_divert: 'soft_porn_divert',
  normal: 'normal',
  none: 'normal',
}

export function normalizeVisualRiskClass(raw: unknown): VisualRiskClass | null {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!key) return null
  if (CLASS_ALIASES[key]) return CLASS_ALIASES[key]
  if (key.includes('sheer') || key.includes('deep_neck') || key.includes('short_bottom')) return 'attire_edge'
  if (key.includes('bend') || key.includes('chest')) return 'pose_edge'
  if (key.includes('nud') || key.includes('裸')) return 'nudity_sensitive'
  if (key.includes('violen') || key.includes('fight') || key.includes('打')) return 'violence_fight'
  if (key.includes('gore') || key.includes('blood') || key.includes('血')) return 'gore_injury'
  if (key.includes('danger') || key.includes('危险')) return 'dangerous_act'
  if (key.includes('qr')) return 'qr_divert'
  if (key.includes('blur') || key.includes('打码')) return 'blur_divert'
  if (key.includes('contact') || key.includes('微信')) return 'contact_divert'
  return null
}

export type VisionRiskParseInput = {
  ocrText?: string
  visualHits?: string[]
  hasPerson?: boolean
  /** 新：主字段，多选类目 */
  riskClasses?: unknown
  /** 兼容旧字段 */
  attireRisk?: string
  poseRisk?: string
  divertRisk?: string
  violenceRisk?: string
  dangerRisk?: string
}

/** 从模型 JSON 强制映射为 hits；探店场景不得因「有人出镜」单独误报，但擦边/暴力必须报 */
export function forceHitsFromVisionRiskFields(parsed: VisionRiskParseInput): string[] {
  const classes = new Set<VisualRiskClass>()
  const push = (c: VisualRiskClass | null | undefined) => {
    if (c && c !== 'normal') classes.add(c)
  }

  if (Array.isArray(parsed.riskClasses)) {
    for (const item of parsed.riskClasses) push(normalizeVisualRiskClass(item))
  } else if (parsed.riskClasses != null) {
    push(normalizeVisualRiskClass(parsed.riskClasses))
  }

  push(normalizeVisualRiskClass(parsed.attireRisk))
  push(normalizeVisualRiskClass(parsed.poseRisk))
  push(normalizeVisualRiskClass(parsed.divertRisk))
  push(normalizeVisualRiskClass(parsed.violenceRisk))
  push(normalizeVisualRiskClass(parsed.dangerRisk))

  // 旧 attire/pose/divert 字符串含关键字
  const attire = String(parsed.attireRisk || '').toLowerCase()
  const pose = String(parsed.poseRisk || '').toLowerCase()
  const divert = String(parsed.divertRisk || '').toLowerCase()
  if (attire.includes('sheer') || attire.includes('deep') || attire.includes('short') || attire.includes('both')) {
    push('attire_edge')
  }
  if (pose.includes('bend') || pose.includes('chest')) push('pose_edge')
  if (divert.includes('qr')) push('qr_divert')
  if (divert.includes('blur')) push('blur_divert')
  if (divert.includes('contact')) push('contact_divert')

  if (Array.isArray(parsed.visualHits)) {
    for (const h of parsed.visualHits) {
      const s = String(h || '').trim()
      if (!s) continue
      if (/着装擦边/.test(s)) push('attire_edge')
      else if (/姿态擦边/.test(s)) push('pose_edge')
      else if (/裸露|敏感部位/.test(s)) push('nudity_sensitive')
      else if (/暴力|打斗|打架/.test(s)) push('violence_fight')
      else if (/血腥|流血|残肢/.test(s)) push('gore_injury')
      else if (/危险动作|高空|自残/.test(s)) push('dangerous_act')
      else if (/二维码/.test(s)) push('qr_divert')
      else if (/打码/.test(s)) push('blur_divert')
      else if (/联系方式/.test(s)) push('contact_divert')
      else if (/双关/.test(s)) push('innuendo_speech')
      else if (/色情导流|低俗导流/.test(s)) push('soft_porn_divert')
    }
  }

  const ocr = String(parsed.ocrText || '')
  const hasPerson = parsed.hasPerson === true
  if (hasPerson && /非常肥美|好大一只|duang大/i.test(ocr)) {
    push('innuendo_speech')
  }

  const edge =
    classes.has('attire_edge') ||
    classes.has('pose_edge') ||
    classes.has('nudity_sensitive') ||
    classes.has('innuendo_speech')
  const divertHit =
    classes.has('qr_divert') || classes.has('blur_divert') || classes.has('contact_divert')
  if (edge) push('soft_porn_divert')
  if (edge && divertHit) push('soft_porn_divert')

  return [...classes]
    .filter((c) => c !== 'normal')
    .map((c) => VISUAL_RISK_CLASS_LABEL[c as Exclude<VisualRiskClass, 'normal'>])
    .filter(Boolean)
    .slice(0, 16)
}

/** 口播/字幕敏感词（暴力等），辅助画面分类漏报时兜底 */
export const VIDEO_SENSITIVE_MEDIA_PHRASES: string[] = [
  '打死他',
  '砍一刀',
  '砍人',
  '流血了',
  '满地是血',
  '拿刀砍',
  '打架',
  '群殴',
  '自残',
  '跳楼',
  '喝农药',
]

export function scanSensitiveMediaPhrases(text: string): string[] {
  const t = String(text || '')
  const hits: string[] = []
  for (const p of VIDEO_SENSITIVE_MEDIA_PHRASES) {
    if (t.includes(p)) {
      if (/血|砍|刀/.test(p)) hits.push(VISUAL_RISK_CLASS_LABEL.gore_injury)
      else if (/打|殴/.test(p)) hits.push(VISUAL_RISK_CLASS_LABEL.violence_fight)
      else hits.push(VISUAL_RISK_CLASS_LABEL.dangerous_act)
    }
  }
  return [...new Set(hits)]
}

export const FRAME_VISION_RISK_SYSTEM = `你是短视频画面安全审核器（抖音/快手/视频号本地生活成片）。对用户提供的 1 张关键帧做强制分类，禁止因「探店/美食/种草」而豁免擦边或暴力。

只输出 JSON（不要 Markdown）：
{
  "ocrText":"帧内全部可见文字",
  "hasPerson":true或false,
  "riskClasses":["类目代码，可多选；无风险则 [\\"normal\\"]"],
  "visualNotes":"10-40字"
}

riskClasses 仅允许：
attire_edge（薄透/深领/超短裤等着装擦边）
pose_edge（弯腰俯拍胸口臀部、性暗示姿态）
nudity_sensitive（裸露或明显敏感部位）
violence_fight（打架、殴打、器械伤人等暴力）
gore_injury（明显流血、血腥、严重伤害画面）
dangerous_act（高危动作、自残倾向、危险挑战）
qr_divert（二维码特写/强调可扫）
blur_divert（故意打码并指认）
contact_divert（微信号/手机号等联系方式露出）
normal（以上皆无）

强制规则（从严）：
1. 探店超市出镜若白衬衫偏透、深V大领、超短热裤 → 必须含 attire_edge，不得用「正常探店」豁免。
2. 弯腰放购物车导致领口敞开/胸口构图 → pose_edge。
3. 画面有清晰打斗、拳打脚踢、持械攻击 → violence_fight。
4. 明显鲜血、开放性伤口特写 → gore_injury。
5. 高空极限、玩火玩电、疑似自残 → dangerous_act。
6. 二维码特写/手指指打码/露微信号 → 对应 divert 类。
7. 仅食物货架、无人、无暴力 → ["normal"]。
8. 正常着装（不透、领口正常）笑脸探店 → ["normal"]，不要因「好看」误报 attire_edge。
9. ocrText 须完整；极限广告词可顺带出现在 notes，但 riskClasses 以画面安全为主。`
