/** 数字人口播成片 MP4 — IndexedDB 持久化（localStorage 的 blob: URL 刷新后失效） */
const DB_NAME = 'meoo_dh_work_blobs_v1'
const STORE = 'mp4'
const DB_VERSION = 1

type BlobDb = {
  close(): void
  objectStoreNames: { contains(name: string): boolean }
  createObjectStore(name: string): unknown
  transaction(name: string, mode: 'readonly' | 'readwrite'): {
    objectStore(name: string): {
      put(value: Blob, key: string): unknown
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

export async function saveWorkMp4Blob(workId: string, blob: Blob): Promise<void> {
  const id = workId.trim()
  if (!id || blob.size < 1024) throw new Error('成片无效，无法保存')
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('IndexedDB 写入失败'))
    }
    tx.objectStore(STORE).put(blob, id)
  })
}

export async function loadWorkMp4Blob(workId: string): Promise<Blob | null> {
  const id = workId.trim()
  if (!id) return null
  try {
    const db = await openDb()
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      tx.oncomplete = () => db.close()
      tx.onerror = () => {
        db.close()
        reject(new Error('IndexedDB 读取失败'))
      }
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const v = req.result
        resolve(v instanceof Blob && v.size >= 1024 ? v : null)
      }
      req.onerror = () => reject(new Error('IndexedDB 读取失败'))
    })
  } catch {
    return null
  }
}

export async function deleteWorkMp4Blob(workId: string): Promise<void> {
  const id = workId.trim()
  if (!id) return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(new Error('IndexedDB 删除失败'))
      }
      tx.objectStore(STORE).delete(id)
    })
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
