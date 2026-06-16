/** 数字人口播 — IndexedDB 持久化（localStorage 容量约 5MB，不宜存 base64 照片/成片） */
const DB_NAME = 'meoo_dh_work_blobs_v1'
const STORE_MP4 = 'mp4'
const STORE_CUSTOM_AVATAR = 'custom_avatar'
const DB_VERSION = 2

type BlobDb = {
  close(): void
  objectStoreNames: { contains(name: string): boolean }
  createObjectStore(name: string): unknown
  transaction(name: string, mode: 'readonly' | 'readwrite'): {
    objectStore(name: string): {
      put(value: Blob | string, key: string): unknown
      get(key: string): { onsuccess: ((ev: Event) => void) | null; onerror: ((ev: Event) => void) | null; result?: unknown }
      delete(key: string): unknown
    }
    oncomplete: ((ev: Event) => void) | null
    onerror: ((ev: Event) => void) | null
  }
}

function openDb(): Promise<BlobDb> {
  const g = globalThis as typeof globalThis & { indexedDB?: { open(n: string, v: number): unknown } }
  if (!g.indexedDB) {
    return Promise.reject(new Error('当前环境不支持 IndexedDB'))
  }
  const idb = g.indexedDB
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION) as {
      onsuccess: ((ev: Event) => void) | null
      onerror: ((ev: Event) => void) | null
      onupgradeneeded: ((ev: Event) => void) | null
      result: BlobDb
      error?: Error
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_MP4)) {
        db.createObjectStore(STORE_MP4)
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_AVATAR)) {
        db.createObjectStore(STORE_CUSTOM_AVATAR)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function idbPut(db: BlobDb, store: string, key: string, value: Blob | string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('IndexedDB 写入失败'))
    }
    tx.objectStore(store).put(value, key)
  })
}

function idbGet<T>(db: BlobDb, store: string, key: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(new Error('IndexedDB 读取失败'))
    }
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(new Error('IndexedDB 读取失败'))
  })
}

function idbDelete(db: BlobDb, store: string, key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('IndexedDB 删除失败'))
    }
    tx.objectStore(store).delete(key)
  })
}

export async function saveWorkMp4Blob(workId: string, blob: Blob): Promise<void> {
  const id = workId.trim()
  if (!id || blob.size < 1024) throw new Error('成片无效，无法保存')
  const db = await openDb()
  await idbPut(db, STORE_MP4, id, blob)
}

export async function loadWorkMp4Blob(workId: string): Promise<Blob | null> {
  const id = workId.trim()
  if (!id) return null
  try {
    const db = await openDb()
    const v = await idbGet<unknown>(db, STORE_MP4, id)
    return v instanceof Blob && v.size >= 1024 ? v : null
  } catch {
    return null
  }
}

/** 自定义上传人像（data URL），避免写入 localStorage 撑爆配额 */
export async function saveWorkCustomAvatar(workId: string, dataUrl: string): Promise<void> {
  const id = workId.trim()
  const raw = dataUrl.trim()
  if (!id || !raw.startsWith('data:image/')) throw new Error('人像无效，无法保存')
  const db = await openDb()
  await idbPut(db, STORE_CUSTOM_AVATAR, id, raw)
}

export async function loadWorkCustomAvatar(workId: string): Promise<string | null> {
  const id = workId.trim()
  if (!id) return null
  try {
    const db = await openDb()
    const v = await idbGet<unknown>(db, STORE_CUSTOM_AVATAR, id)
    return typeof v === 'string' && v.startsWith('data:image/') ? v : null
  } catch {
    return null
  }
}

export async function deleteWorkCustomAvatar(workId: string): Promise<void> {
  const id = workId.trim()
  if (!id) return
  try {
    const db = await openDb()
    await idbDelete(db, STORE_CUSTOM_AVATAR, id)
  } catch {
    /* ignore */
  }
}

export async function deleteWorkMp4Blob(workId: string): Promise<void> {
  const id = workId.trim()
  if (!id) return
  try {
    const db = await openDb()
    await idbDelete(db, STORE_MP4, id)
  } catch {
    /* ignore */
  }
}

/** blob: URL 仅在创建它的会话有效 */
export async function blobUrlIsReadable(url: string): Promise<boolean> {
  if (!url.startsWith('blob:')) return false
  try {
    const head = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-3' } })
    return head.ok
  } catch {
    return false
  }
}
