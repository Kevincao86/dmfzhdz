export type KolBriefRecord = {
  id: string
  createdAt: string
  platform: string
  mainProductName: string
  secondaryProductName?: string
  tags: string[]
  previews: [string, string, string]
}

const RECORDS_KEY = 'meoo_kol_brief_records'
const SELECTED_BRIEF_KEY = 'meoo_kol_selected_brief_payload'

export function readKolBriefRecords(): KolBriefRecord[] {
  try {
    const raw = window.localStorage.getItem(RECORDS_KEY)
    if (!raw) return []
    const j = JSON.parse(raw) as KolBriefRecord[]
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

export function writeKolBriefRecords(rows: KolBriefRecord[]) {
  window.localStorage.setItem(RECORDS_KEY, JSON.stringify(rows.slice(0, 50)))
}

export function appendKolBriefRecord(row: KolBriefRecord) {
  const cur = readKolBriefRecords()
  writeKolBriefRecords([row, ...cur])
}

export type SelectedBriefPayload = {
  recordId: string
  variantIndex: 0 | 1 | 2
  text: string
  platform: string
  mainProductName: string
  tags: string[]
}

export function writeSelectedBriefForRecruitment(payload: SelectedBriefPayload | null) {
  if (!payload) window.localStorage.removeItem(SELECTED_BRIEF_KEY)
  else window.localStorage.setItem(SELECTED_BRIEF_KEY, JSON.stringify(payload))
}

export function readSelectedBriefForRecruitment(): SelectedBriefPayload | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_BRIEF_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SelectedBriefPayload
  } catch {
    return null
  }
}
