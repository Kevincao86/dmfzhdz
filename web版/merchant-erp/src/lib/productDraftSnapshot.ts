/**
 * 创建/编辑页保存草稿时写入的完整 save 载荷快照，供「商品列表 → 编辑」在无网关缓存时回显。
 * 键：商品 product_id（或 out_id）；与 `productEditLibrary` 行 id 对齐。
 */

import type { DouyinProductDetailPayload } from '../services/douyinProductApi'

const KEY = 'meoo_product_draft_snapshots_v1'

function readAll(): Record<string, DouyinProductDetailPayload> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as unknown
    return o && typeof o === 'object' && !Array.isArray(o)
      ? (o as Record<string, DouyinProductDetailPayload>)
      : {}
  } catch {
    return {}
  }
}

function writeAll(m: Record<string, DouyinProductDetailPayload>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function saveDraftDetailSnapshot(productId: string, detail: DouyinProductDetailPayload): void {
  const id = productId.trim()
  if (!id) return
  const all = readAll()
  all[id] = { ...detail, product_id: id }
  writeAll(all)
}

export function loadDraftDetailSnapshot(productId: string): DouyinProductDetailPayload | null {
  const id = productId.trim()
  if (!id) return null
  const v = readAll()[id]
  return v && typeof v === 'object' ? v : null
}

/** 列表行 id 与抖音返回的 product_id 不一致时，迁移快照键（如由 out_id 改为平台 id） */
export function renameDraftDetailSnapshotKey(oldId: string, newId: string): void {
  const o = oldId.trim()
  const n = newId.trim()
  if (!o || !n || o === n) return
  const all = readAll()
  const snap = all[o]
  if (!snap) return
  delete all[o]
  all[n] = { ...snap, product_id: n }
  writeAll(all)
}
