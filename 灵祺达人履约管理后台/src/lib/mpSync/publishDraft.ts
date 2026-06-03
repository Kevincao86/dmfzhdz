import type { PublishForm } from './publishOrder'

const DRAFTS_KEY = 'meoo_publish_wizard_drafts_v1'
const LEGACY_KEY = 'meoo_publish_wizard_draft_v1'

export type PublishWizardDraft = {
  id: string
  recruitMode: string
  recruitModeLabel: string
  form: PublishForm
  signupDeadlineDate: string
  signupDeadlineTime: string
  talentTags: string[]
  douyinSalesLevels: string[]
  savedAt: number
}

function newDraftId() {
  return `DRAFT-${Date.now()}`
}

function readRawList(): PublishWizardDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    if (!raw) return migrateLegacyDraft()
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list.filter((d): d is PublishWizardDraft => !!d && typeof d === 'object' && !!(d as PublishWizardDraft).form)
  } catch {
    return []
  }
}

function migrateLegacyDraft(): PublishWizardDraft[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const d = JSON.parse(raw) as PublishWizardDraft & { id?: string }
    if (!d?.form) return []
    const migrated: PublishWizardDraft = {
      id: d.id || newDraftId(),
      recruitMode: d.recruitMode,
      recruitModeLabel: d.recruitModeLabel,
      form: d.form,
      signupDeadlineDate: d.signupDeadlineDate || '',
      signupDeadlineTime: d.signupDeadlineTime || '23:59',
      talentTags: d.talentTags || [],
      douyinSalesLevels: d.douyinSalesLevels || ['不限'],
      savedAt: d.savedAt || Date.now(),
    }
    writeList([migrated])
    localStorage.removeItem(LEGACY_KEY)
    return [migrated]
  } catch {
    return []
  }
}

function writeList(list: PublishWizardDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 50)))
}

export function listPublishDrafts(): PublishWizardDraft[] {
  return readRawList().sort((a, b) => b.savedAt - a.savedAt)
}

export function getPublishDraftById(id: string): PublishWizardDraft | null {
  const key = String(id || '').trim()
  if (!key) return null
  return listPublishDrafts().find((d) => d.id === key) || null
}

export function getLatestPublishDraftForMode(recruitMode: string): PublishWizardDraft | null {
  const mode = String(recruitMode || '').trim()
  if (!mode) return null
  return listPublishDrafts().find((d) => d.recruitMode === mode) || null
}

/** 保存草稿；传入 id 则更新，否则新建。返回草稿 id */
export function savePublishDraft(
  payload: Omit<PublishWizardDraft, 'id' | 'savedAt'>,
  existingId?: string,
): string {
  const list = readRawList()
  const id = String(existingId || '').trim() || newDraftId()
  const draft: PublishWizardDraft = { ...payload, id, savedAt: Date.now() }
  const idx = list.findIndex((d) => d.id === id)
  if (idx >= 0) list[idx] = draft
  else list.unshift(draft)
  writeList(list)
  return id
}

export function deletePublishDraft(id: string) {
  const key = String(id || '').trim()
  if (!key) return
  writeList(readRawList().filter((d) => d.id !== key))
}

export function clearPublishDraft(id?: string) {
  if (id) {
    deletePublishDraft(id)
    return
  }
  localStorage.removeItem(DRAFTS_KEY)
  localStorage.removeItem(LEGACY_KEY)
}

/** @deprecated 使用 getPublishDraftById / getLatestPublishDraftForMode */
export function loadPublishDraft(): PublishWizardDraft | null {
  return listPublishDrafts()[0] || null
}

export function draftDisplayTitle(draft: PublishWizardDraft) {
  const t = String(draft.form?.title || '').trim()
  return t || '未命名招募'
}

export function formatDraftSavedAt(savedAt: number) {
  if (!savedAt) return '—'
  return new Date(savedAt).toLocaleString('zh-CN', { hour12: false })
}
