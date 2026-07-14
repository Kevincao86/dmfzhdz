const STORAGE_KEY = 'meoo.pendingDistributionRef'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

type PendingRefPayload = {
  refCode: string
  savedAt: number
}

function readPayload(): PendingRefPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingRefPayload
    if (!parsed?.refCode || !parsed.savedAt) return null
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function savePendingDistributionRef(refCodeRaw: string): void {
  if (typeof window === 'undefined') return
  const refCode = String(refCodeRaw || '').trim()
  if (!refCode) return
  const payload: PendingRefPayload = { refCode, savedAt: Date.now() }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

export function readPendingDistributionRef(): string | null {
  return readPayload()?.refCode ?? null
}

export function clearPendingDistributionRef(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function captureDistributionRefFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const ref = String(params.get('ref') || '').trim()
  if (ref) savePendingDistributionRef(ref)
  return ref || readPendingDistributionRef()
}
