import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

const MULTIPART_PATHS = ['/api/meoo-merchant-ai-video-ice-multipart']
const CHUNK_BYTES = 2 * 1024 * 1024

async function postMp(path: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.message || data.detail || data.error || `http_${res.status}`))
  }
  return data
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw
      if (!base64) {
        reject(new Error('读取文件失败'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

/** 经 erp-api 分片上传（单片 base64 约 2.7MB，避免 Nginx 413） */
export async function uploadFileViaErpMultipart(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const contentType = file.type?.trim() || 'application/octet-stream'
  const fileName = file.name || 'upload.bin'
  if (onProgress) onProgress(5)

  let init: Record<string, unknown> | null = null
  let lastErr = '分片上传初始化失败'
  for (const path of MULTIPART_PATHS) {
    try {
      init = await postMp(path, {
        step: 'init',
        fileName,
        contentType,
        sizeBytes: file.size,
      })
      break
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  if (!init) throw new Error(lastErr)

  const uploadId = String(init.uploadId || '').trim()
  const objectKey = String(init.objectKey || '').trim()
  const partSize = Number(init.partSize) || CHUNK_BYTES
  const partCount = Number(init.partCount) || Math.max(1, Math.ceil(file.size / partSize))
  if (!uploadId || !objectKey) throw new Error('分片上传初始化失败')

  const parts: { partNumber: number; etag: string }[] = []
  for (let i = 0; i < partCount; i += 1) {
    const partNumber = i + 1
    const start = i * partSize
    const end = Math.min(start + partSize, file.size)
    const contentBase64 = await blobToBase64(file.slice(start, end))
    if (onProgress) onProgress(5 + Math.round(((i + 0.5) / partCount) * 85))

    let part: Record<string, unknown> | null = null
    for (const path of MULTIPART_PATHS) {
      try {
        part = await postMp(path, {
          step: 'part',
          objectKey,
          uploadId,
          partNumber,
          contentBase64,
        })
        break
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (!/404|not_found/i.test(lastErr)) throw e
      }
    }
    if (!part) throw new Error(lastErr)
    parts.push({ partNumber, etag: String(part.etag || '').trim() })
  }

  let done: Record<string, unknown> | null = null
  for (const path of MULTIPART_PATHS) {
    try {
      done = await postMp(path, {
        step: 'complete',
        objectKey,
        uploadId,
        fileName,
        parts,
      })
      break
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  if (!done) throw new Error(lastErr)

  const mediaUrl = String(done.mediaUrl || '').trim()
  if (!mediaUrl) throw new Error('分片上传未完成')
  if (onProgress) onProgress(95)
  return mediaUrl
}
