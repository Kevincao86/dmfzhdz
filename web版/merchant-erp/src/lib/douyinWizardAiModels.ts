import { BUILTIN_AI_VENDOR_ENTRIES } from './aiVendorCatalogShared'
import { listAiModelPickerOptions, type AiModelPickerOption } from '../services/ai/modelRegistry'
import { parseAgentImagePickerKey } from '../services/ai/agentImageModelKeys'
import { listAiUiModelOptions } from '../services/merchantAiVendorCatalogClient'

export type WizardAiModelOption = { id: string; label: string; hint?: string; logoUrl?: string }

const VENDOR_LOGO = new Map(BUILTIN_AI_VENDOR_ENTRIES.map((e) => [e.id, e.logoUrl]))
const VENDOR_LABEL = new Map(BUILTIN_AI_VENDOR_ENTRIES.map((e) => [e.id, e.label]))

/** 文案模型：与系统设置 / AI 智能体目录一致 */
export function listWizardTextModelOptions(): WizardAiModelOption[] {
  return listAiUiModelOptions()
}

function brandLabelForImagePicker(o: AiModelPickerOption): string {
  const parsed = parseAgentImagePickerKey(o.key)
  if (parsed?.kind === 'vendor') {
    if (parsed.vendor === 'auto') return '自动路由'
    return VENDOR_LABEL.get(parsed.vendor) ?? parsed.vendor
  }
  if (parsed?.kind === 'brand-direct') {
    return parsed.slug === 'kimi' ? 'Kimi' : 'DeepSeek'
  }
  if (parsed?.kind === 'style') {
    const famLabels: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Claude',
      gemini: 'Gemini',
      grok: 'Grok',
    }
    return famLabels[parsed.family] ?? parsed.family
  }
  const head = o.label.split('·')[0]?.trim()
  return head || o.label
}

function logoForImagePicker(o: AiModelPickerOption): string | undefined {
  const parsed = parseAgentImagePickerKey(o.key)
  if (parsed?.kind === 'vendor' && parsed.vendor !== 'auto') {
    return VENDOR_LOGO.get(parsed.vendor)
  }
  if (parsed?.kind === 'brand-direct') {
    return VENDOR_LOGO.get(parsed.slug)
  }
  if (parsed?.kind === 'style') {
    const famToVendor: Record<string, string> = {
      openai: 'openai',
      claude: 'claude',
      gemini: 'gemini',
      grok: 'openai',
    }
    const v = famToVendor[parsed.family]
    return v ? VENDOR_LOGO.get(v) : undefined
  }
  return VENDOR_LOGO.get(o.provider)
}

/**
 * 图片模型：与 AI 智能体文生图下拉同源（listAiModelPickerOptions capability=image），
 * 手选展示为 logo + 品牌名。
 */
export function listWizardImageModelOptions(): WizardAiModelOption[] {
  const imageOpts = listAiModelPickerOptions().filter((o) => o.capability === 'image')
  const seen = new Set<string>()
  const out: WizardAiModelOption[] = []
  for (const o of imageOpts) {
    const label = brandLabelForImagePicker(o)
    const dedupeKey = `${o.provider}::${label}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      id: o.key,
      label,
      logoUrl: logoForImagePicker(o),
      hint: o.label,
    })
  }
  return out
}
