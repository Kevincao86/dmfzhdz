import { registerClientSyncOnChange } from './mpClientSyncHooks'
import { syncClientState as apiSyncClientState } from './mpApi'
import { getAccount, getToken } from './mpSession'
import {
  APPLICATIONS_BASE,
  PUBLISH_BASE,
} from './mpSync/applicationsStore'
import { scopedStorageKey } from './mpAccountLocalScope'
import { readMember, writeMember } from './mpSync/talentMember'
import { readPrProfile, writePrProfile } from './mpSync/userProfile'

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
  return {
    v: 1,
    talentMemberDraft: (readMember() as Record<string, unknown> | null) || null,
    prProfileDraft: (readPrProfile() as Record<string, unknown> | null) || null,
    applications: readList(appKey),
    publishedOrders: readList(pubKey),
    notifications: readList(NOTIFY_KEY),
    messages: readList(MSG_KEY),
    inboxSeen: readJson<string[]>(INBOX_SEEN_KEY, []),
    publishWizardDrafts: readList(PUBLISH_DRAFTS_KEY),
  }
}

export function applyRemoteClientState(state: MpClientStatePayload | null | undefined) {
  if (!state || typeof state !== 'object') return
  const account = getAccount()
  const appKey = scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scopedStorageKey(PUBLISH_BASE, account)

  if (state.talentMemberDraft && typeof state.talentMemberDraft === 'object') {
    writeMember(state.talentMemberDraft as never)
  }
  if (state.prProfileDraft && typeof state.prProfileDraft === 'object') {
    writePrProfile(state.prProfileDraft as never)
  }
  if (Array.isArray(state.applications)) {
    writeJson(appKey, state.applications.slice(0, 80))
  }
  if (Array.isArray(state.publishedOrders)) {
    writeJson(pubKey, state.publishedOrders.slice(0, 80))
  }
  if (Array.isArray(state.notifications)) {
    writeJson(NOTIFY_KEY, state.notifications.slice(0, 100))
  }
  if (Array.isArray(state.messages)) {
    writeJson(MSG_KEY, state.messages.slice(0, 100))
  }
  if (Array.isArray(state.inboxSeen)) {
    writeJson(INBOX_SEEN_KEY, state.inboxSeen.slice(-500))
  }
  if (Array.isArray(state.publishWizardDrafts)) {
    writeJson(PUBLISH_DRAFTS_KEY, state.publishWizardDrafts.slice(0, 20))
  }
}

export async function syncClientStateWithServer() {
  if (!getToken() || syncing) return null
  syncing = true
  try {
    const { state } = await apiSyncClientState(collectLocalClientState())
    applyRemoteClientState(state)
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
