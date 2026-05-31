/** OpenAI / Claude / Gemini / Grok 智能体与部分文案走 TokenMix，注册表只维护一份 tokenmix Key。 */
export const TOKENMIX_VENDOR_ID = 'tokenmix'

export const TOKENMIX_LINKED_VENDOR_IDS = ['openai', 'claude', 'gemini', 'grok'] as const

export type TokenmixLinkedVendorId = (typeof TOKENMIX_LINKED_VENDOR_IDS)[number]

export function isTokenmixLinkedVendor(id: string): boolean {
  const s = id.trim().toLowerCase()
  return s === TOKENMIX_VENDOR_ID || (TOKENMIX_LINKED_VENDOR_IDS as readonly string[]).includes(s)
}

/** 保存注册表前：统一 TokenMix 与四大家族的 Key */
export function expandVendorKeysForRegistrySave(
  keys: Partial<Record<string, string>>,
): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = { ...keys }
  let tm = (out[TOKENMIX_VENDOR_ID] ?? '').trim()
  if (!tm) {
    for (const id of TOKENMIX_LINKED_VENDOR_IDS) {
      const v = (out[id] ?? '').trim()
      if (v) {
        tm = v
        break
      }
    }
  }
  if (tm) {
    out[TOKENMIX_VENDOR_ID] = tm
    for (const id of TOKENMIX_LINKED_VENDOR_IDS) out[id] = tm
  } else {
    delete out[TOKENMIX_VENDOR_ID]
    for (const id of TOKENMIX_LINKED_VENDOR_IDS) delete out[id]
  }
  return out
}

/** UI 展示：链接厂商显示 TokenMix 的 Key */
export function resolveVendorKeyForDisplay(
  keys: Partial<Record<string, string>>,
  id: string,
): string {
  const s = id.trim().toLowerCase()
  if (isTokenmixLinkedVendor(s) && s !== TOKENMIX_VENDOR_ID) {
    return (keys[TOKENMIX_VENDOR_ID] ?? keys[s] ?? '').trim()
  }
  return (keys[s] ?? '').trim()
}
