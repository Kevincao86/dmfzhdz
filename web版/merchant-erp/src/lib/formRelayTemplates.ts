import type { FormRelayPlatformId } from './formRelayPlatforms.js'

export type FormRelayTemplatePreset = {
  id: string
  label: string
  platformId: FormRelayPlatformId
  sourceUrl: string
  titleHint?: string
}

/** 转发工具快捷模版（一键填充原表链接与平台） */
export const FORM_RELAY_TEMPLATE_PRESETS: FormRelayTemplatePreset[] = [
  {
    id: 'qunbaoshu-default',
    label: '群报数模版',
    platformId: 'qunbaoshu',
    sourceUrl: 'https://s.qun100.com/link/aiOSTXXfnea',
    titleHint: '群报数代收',
  },
]
