import { registerClientSyncOnChange } from './mpClientSyncHooks'
import { syncClientState as apiSyncClientState } from './mpApi'
import { getAccount, getToken } from './mpSession'
import {
  APPLICATIONS_BASE,
  PUBLISH_BASE,
} from './mpSync/applicationsStore'
import { scopedStorageKey } from './mpAccountLocalScope'
import { readMember } from './mpSync/talentMember'
import { readPrProfile } from './mpSync/userProfile'
import {
  applyTemplatesFromSync,
  listCustomTemplates,
  readActiveApplyTemplateIds,
} from './mpSync/applyFormTemplates'
import { applyFavoriteIdsFromSync, readFavoriteIds } from './mpSync/talentFavorites'
import { listPublishDrafts } from './mpSync/publishDraft'
import { readPrDouyinLinkeBindings, applyPrDouyinLinkeBindingsFromSync } from './mpSync/prDouyinLinkeStore'
import { applyOrderFavoriteIdsFromSync, readOrderFavoriteIds } from './mpSync/orderFavorites'
import { applyHandledMapFromSync, exportHandledMapForSync } from './mpSync/inboxNoticeState'
import { applyGroupQrCacheFromSync, exportGroupQrCacheForSync } from './mpSync/mpGroupQr'

const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'
const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'
const PUBLISH_DRAFTS_KEY = 'meoo_publish_wizard_drafts_v1'

export type MpClientStatePayload = {
  v?: number
  talentMemberDraft?: Record<string, unknown> | null
  prProfileDraft?: Record<string, unknown> | null
  applications?: Record<string, unknown>[]
  publishedOrders?: Record<string, unknown>[]
  notifications?: Record<string, unknown>[]
  messages?: Record<string, unknown>[]
  inboxSeen?: string[]
  publishWizardDrafts?: Record<string, unknown>[]
  applyFormTemplates?: Record<string, unknown>[]
  activeApplyTemplateIds?: Record<string, string>
  talentFavoriteIds?: string[]
  orderFavoriteIds?: string[]
  selectionHandled?: Record<string, string>
  groupQrCache?: Record<string, string>
  prDouyinLinkeBindings?: Record<string, unknown> | null
}

let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function readList(key: string): Record<string, unknown>[] {
  const list = readJson<unknown[]>(key, [])
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

export function collectLocalClientState(): MpClientStatePayload {
  const account = getAccount()
  const appKey = scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scopedStorageKey(PUBLISH_BASE, account)
  const notifyKey = scopedStorageKey(NOTIFY_KEY, account)
  const msgKey = scopedStorageKey(MSG_KEY, account)
  const inboxKey = scopedStorageKey(INBOX_SEEN_KEY, account)
  return {
    v: 1,
    talentMemberDraft: (readMember() as Record<string, unknown> | null) || null,
    prProfileDraft: (readPrProfile() as Record<string, unknown> | null) || null,
    applications: readList(appKey),
    publishedOrders: readList(pubKey),
    notifications: readList(notifyKey),
    messages: readList(msgKey),
    inboxSeen: readJson<string[]>(inboxKey, []),
    publishWizardDrafts: listPublishDrafts() as unknown as Record<string, unknown>[],
    applyFormTemplates: listCustomTemplates() as unknown as Record<string, unknown>[],
    activeApplyTemplateIds: readActiveApplyTemplateIds(),
    talentFavoriteIds: readFavoriteIds(),
    orderFavoriteIds: [...readOrderFavoriteIds()],
    selectionHandled: exportHandledMapForSync(),
    groupQrCache: exportGroupQrCacheForSync(),
    prDouyinLinkeBindings: readPrDouyinLinkeBindings() as unknown as Record<string, unknown>,
  }
}

function mergePublishedOrdersRemote(
  local: Record<string, unknown>[],
  remote: Record<string, unknown>[],
): Record<string, unknown>[] {
  const localById = new Map(local.map((item) => [String(item.mpOrderId || '').trim(), item]))
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const item of remote) {
    const id = String(item.mpOrderId || '').trim()
    if (!id) continue
    seen.add(id)
    const localItem = localById.get(id)
    const deletedAt = localItem?.deletedAt || item.deletedAt
    out.push(deletedAt ? { ...item, deletedAt } : item)
  }
  for (const item of local) {
    const id = String(item.mpOrderId || '').trim()
    if (!id || seen.has(id)) continue
    if (item.deletedAt) {
      seen.add(id)
      out.push(item)
    }
  }
  return out.slice(0, 80)
}

export function applyRemoteClientState(state: MpClientStatePayload | null | undefined) {
  if (!state || typeof state !== 'object') return
  const account = getAccount()
  const appKey = scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scopedStorageKey(PUBLISH_BASE, account)

  if (state.talentMemberDraft) {
    console.warn('[fulfillment] skip_talent_member_draft: use_registry_profile')
  }
  if (state.prProfileDraft) {
    console.warn('[fulfillment] skip_pr_profile_draft: use_registry_profile')
  }
  if (Array.isArray(state.applications)) {
    writeJson(appKey, state.applications.slice(0, 80))
  }
  if (Array.isArray(state.publishedOrders)) {
    const local = readList(pubKey)
    writeJson(pubKey, mergePublishedOrdersRemote(local, state.publishedOrders))
  }
  const notifyKey = scopedStorageKey(NOTIFY_KEY, account)
  const msgKey = scopedStorageKey(MSG_KEY, account)
  const inboxKey = scopedStorageKey(INBOX_SEEN_KEY, account)
  const draftsKey = scopedStorageKey(PUBLISH_DRAFTS_KEY, account)
  if (Array.isArray(state.notifications)) {
    writeJson(notifyKey, state.notifications.slice(0, 100))
  }
  if (Array.isArray(state.messages)) {
    writeJson(msgKey, state.messages.slice(0, 100))
  }
  if (Array.isArray(state.inboxSeen)) {
    writeJson(inboxKey, state.inboxSeen.slice(-500))
  }
  if (Array.isArray(state.publishWizardDrafts)) {
    writeJson(draftsKey, state.publishWizardDrafts.slice(0, 20))
  }
  if (Array.isArray(state.applyFormTemplates) || state.activeApplyTemplateIds) {
    applyTemplatesFromSync(
      state.applyFormTemplates as Parameters<typeof applyTemplatesFromSync>[0],
      state.activeApplyTemplateIds,
    )
  }
  if (Array.isArray(state.talentFavoriteIds)) {
    applyFavoriteIdsFromSync(state.talentFavoriteIds)
  }
  if (Array.isArray(state.orderFavoriteIds)) {
    applyOrderFavoriteIdsFromSync(state.orderFavoriteIds)
  }
  if (state.selectionHandled && typeof state.selectionHandled === 'object') {
    applyHandledMapFromSync(state.selectionHandled)
  }
  if (state.groupQrCache && typeof state.groupQrCache === 'object') {
    applyGroupQrCacheFromSync(state.groupQrCache)
  }
  if (state.prDouyinLinkeBindings) {
    applyPrDouyinLinkeBindingsFromSync(state.prDouyinLinkeBindings)
  }
}

export async function syncClientStateWithServer() {
  if (!getToken() || syncing) return null
  syncing = true
  try {
    const { state } = await apiSyncClientState(collectLocalClientState())
    applyRemoteClientState(state as MpClientStatePayload)
    return state
  } catch (e) {
    console.warn('[fulfillment] client_state_sync', e instanceof Error ? e.message : String(e))
    return null
  } finally {
    syncing = false
  }
}

export function scheduleClientStatePush(delayMs = 1500) {
  if (!getToken()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncClientStateWithServer()
  }, delayMs)
}

export function pullClientStateAfterLogin() {
  if (!getToken()) return Promise.resolve(null)
  return syncClientStateWithServer()
}

registerClientSyncOnChange(() => scheduleClientStatePush())
