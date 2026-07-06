const STORAGE_KEY = 'meoo_dr_chat_custom_emojis_v1'
const MAX_CUSTOM = 60

export type CustomEmoji = {
  id: string
  url: string
  ts: number
}

function readRaw(): CustomEmoji[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as CustomEmoji[]) : []
  } catch {
    return []
  }
}

function write(list: CustomEmoji[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CUSTOM)))
}

export function loadCustomEmojis(): CustomEmoji[] {
  return readRaw()
}

export function removeCustomEmoji(id: string): CustomEmoji[] {
  const next = readRaw().filter((item) => item.id !== id)
  write(next)
  return next
}

export function addCustomEmoji(url: string): CustomEmoji[] {
  const u = String(url || '').trim()
  if (!u) return readRaw()
  const list = readRaw()
  if (list.some((item) => item.url === u)) return list
  const next = [{ id: `ce_${Date.now()}`, url: u, ts: Date.now() }, ...list].slice(0, MAX_CUSTOM)
  write(next)
  return next
}

export async function addCustomEmojiFromUrl(url: string): Promise<CustomEmoji[]> {
  return addCustomEmoji(String(url || '').trim())
}
