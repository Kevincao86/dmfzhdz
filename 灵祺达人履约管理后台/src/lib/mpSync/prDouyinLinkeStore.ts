import { scopedStorageKey } from '../mpAccountLocalScope'
import type { PrDouyinLinkeBindings, PrDouyinLinkeClient, PrDouyinLinkeServiceProvider } from './prDouyinLinkeTypes'

const STORAGE_KEY = 'meoo_pr_douyin_linke_v1'

function storageKey() {
  return scopedStorageKey(STORAGE_KEY)
}

export function emptyPrDouyinLinkeBindings(): PrDouyinLinkeBindings {
  return { serviceProvider: null, clients: [] }
}

export function readPrDouyinLinkeBindings(): PrDouyinLinkeBindings {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return emptyPrDouyinLinkeBindings()
    const parsed = JSON.parse(raw) as PrDouyinLinkeBindings
    return {
      serviceProvider: parsed.serviceProvider ?? null,
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    }
  } catch {
    return emptyPrDouyinLinkeBindings()
  }
}

export function writePrDouyinLinkeBindings(bindings: PrDouyinLinkeBindings) {
  localStorage.setItem(storageKey(), JSON.stringify(bindings))
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

export function upsertPrDouyinServiceProvider(sp: PrDouyinLinkeServiceProvider) {
  const cur = readPrDouyinLinkeBindings()
  writePrDouyinLinkeBindings({ ...cur, serviceProvider: sp })
}

export function upsertPrDouyinLinkeClient(client: PrDouyinLinkeClient) {
  const cur = readPrDouyinLinkeBindings()
  const idx = cur.clients.findIndex((c) => c.id === client.id)
  const clients = [...cur.clients]
  if (idx >= 0) clients[idx] = client
  else clients.push(client)
  writePrDouyinLinkeBindings({ ...cur, clients })
}

export function deletePrDouyinLinkeClient(clientId: string) {
  const cur = readPrDouyinLinkeBindings()
  writePrDouyinLinkeBindings({
    ...cur,
    clients: cur.clients.filter((c) => c.id !== clientId),
  })
}

export function findPrDouyinLinkeClient(clientId: string): PrDouyinLinkeClient | null {
  return readPrDouyinLinkeBindings().clients.find((c) => c.id === clientId) ?? null
}

export function hasPrDouyinLinkeServiceProvider(): boolean {
  const sp = readPrDouyinLinkeBindings().serviceProvider
  return !!(sp?.sealedToken && sp.merchantAccountId)
}

export function listPrDouyinLinkeClients(): PrDouyinLinkeClient[] {
  return readPrDouyinLinkeBindings().clients
}

/** 发单/同步用：临时注入客户商家凭证到 sessionStorage（与服务商版 session key 对齐） */
export function applyPrDouyinClientSession(client: PrDouyinLinkeClient) {
  try {
    sessionStorage.setItem('meoo_pr_douyin_merchant_token', client.sealedToken)
    sessionStorage.setItem('meoo_pr_douyin_merchant_id', client.merchantAccountId)
    if (client.clientKey) sessionStorage.setItem('meoo_pr_douyin_app_id', client.clientKey)
    sessionStorage.setItem('meoo_pr_douyin_account_name', client.accountDisplayName)
  } catch {
    /* ignore */
  }
}

export function readPrDouyinClientSessionToken(): string {
  try {
    return String(sessionStorage.getItem('meoo_pr_douyin_merchant_token') || '').trim()
  } catch {
    return ''
  }
}
