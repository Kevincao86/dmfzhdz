/** 阿里云 ICE 云剪辑 — 经商户 BFF 代理（生产优先 ECS /erp-api 读运营台 videoAi） */

import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type AliyunIceCloudConfig = {
  configured: boolean
  regionId: string
  hasOssOutput?: boolean
  hasVodOutput?: boolean
  /** 已配置 OSS 前缀时可本地上传至 Bucket */
  localUploadEnabled?: boolean
  presets: string[]
  effectOptions?: { id: string; label: string }[]
  credentialNote?: string
  docsUrl?: string
}

export type IcePipelineResult =
  | { ok: true; jobId: string; exportId: string; projectId?: string }
  | { ok: false; message: string; step?: string }

export type IceJobStatus =
  | {
      ok: true
      status: string
      progress?: number
      done: boolean
      failed: boolean
      /** ICE Success 但 OSS 尚未写入可读文件 */
      outputPending?: boolean
      outputBytes?: number
      downloadUrl?: string
      /** 经 BFF 代理预览（私有 OSS 不可直链打开） */
      previewUrl?: string
      message?: string
    }
  | { ok: false; message: string }

/** 成片下载/预览代理（勿用 ICE 返回的 OSS 直链） */
export function iceJobDownloadProxyPaths(jobId: string, inline = false): string[] {
  const q = new URLSearchParams({ id: jobId })
  if (inline) q.set('inline', '1')
  const qs = q.toString()
  const paths = [
    `/api/meoo-merchant-ai-video-ice-job-download?${qs}`,
    `/api/meoo-merchant-ai-video-openshot-export-download?${qs}`,
    `/api/merchant/ai/video/ice/job-download?${qs}`,
  ]
  const urls: string[] = []
  for (const p of paths) {
    for (const u of merchantApiFetchUrls(p)) {
      if (!urls.includes(u)) urls.push(u)
    }
  }
  return urls
}

/** @deprecated 使用 iceJobDownloadProxyPaths */
export function iceJobDownloadProxyPath(jobId: string, inline = false): string {
  return iceJobDownloadProxyPaths(jobId, inline)[0] ?? `/api/meoo-merchant-ai-video-ice-job-download?id=${jobId}`
}

export function iceExportFileName(label: string): string {
  const safe = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'meoo-ice-output'
  return `${safe.slice(0, 80)}.mp4`
}

/**
 * 经 BFF 拉取成片 Blob 再触发下载（可校验非空并展示错误；避免直链 0 字节空文件）。
 */
export async function downloadIceExportFile(jobId: string, label: string): Promise<void> {
  const paths = iceJobDownloadProxyPaths(jobId)
  let lastErr = '下载失败'
  for (const p of paths) {
    try {
      const res = await fetch(p)
      const ct = (res.headers.get('content-type') ?? '').toLowerCase()
      if (!res.ok) {
        const j = ct.includes('json') ? await parseJson<{ message?: string }>(res) : null
        lastErr = j?.message ?? `下载失败 HTTP ${res.status}`
        if (res.status === 404) continue
        throw new Error(lastErr)
      }
      if (ct.includes('json') || ct.includes('text/html')) {
        lastErr = '下载接口返回了非视频内容'
        continue
      }
      const blob = await res.blob()
      if (blob.size < 2048) {
        throw new Error('下载到的成片为空，请稍后重试或重新提交云剪')
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = iceExportFileName(label)
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (p === paths[paths.length - 1]) throw new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

/** @deprecated 请用 downloadIceExportFile */
export function triggerIceExportDownload(jobId: string, label: string): void {
  void downloadIceExportFile(jobId, label)
}

export type IceBatchJob = {
  id: string
  label: string
  mediaUrl: string
  /** 多图一键成片：按顺序合成的图片 OSS/HTTPS 地址 */
  imageUrls?: string[]
  phase: 'pending' | 'pipeline' | 'polling' | 'done' | 'failed'
  message?: string
  exportId?: string
  downloadUrl?: string
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

const CONFIG_PATHS = [
  '/api/meoo-merchant-ai-video-ice-config',
  '/api/meoo-merchant-ai-video-openshot-config',
  '/api/merchant/ai/video/ice/config',
  '/api/merchant/ai/video/openshot/config',
] as const

const UPLOAD_INIT_PATHS = [
  '/api/meoo-merchant-ai-video-ice-upload-init',
  '/api/merchant/ai/video/ice/upload-init',
] as const

const UPLOAD_SERVER_PATHS = [
  '/api/meoo-merchant-ai-video-ice-upload',
  '/api/merchant/ai/video/ice/upload',
] as const

const UPLOAD_MULTIPART_PATHS = [
  '/api/meoo-merchant-ai-video-ice-multipart',
  '/api/merchant/ai/video/ice/multipart',
] as const

/** 与后端 ICE_UPLOAD_CHUNK_BYTES 一致：超过则走分片经 BFF 上传 */
const ICE_CLIENT_CHUNK_BYTES = 2 * 1024 * 1024

const PIPELINE_PATHS = [
  '/api/meoo-merchant-ai-video-ice-pipeline',
  '/api/meoo-merchant-ai-video-openshot-pipeline',
  '/api/merchant/ai/video/ice/pipeline',
  '/api/merchant/ai/video/openshot/pipeline',
] as const

export async function fetchAliyunIceCloudConfig(): Promise<AliyunIceCloudConfig | null> {
  for (const p of CONFIG_PATHS) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetch(url)
        if (res.status === 404) continue
        const j = await parseJson<AliyunIceCloudConfig>(res)
        if (res.ok && j && typeof j.configured === 'boolean') return j
      } catch {
        /* next */
      }
    }
  }
  return null
}

export type IceUploadInitResult =
  | { ok: true; uploadUrl: string; contentType: string; mediaUrl: string; objectKey?: string }
  | { ok: false; message: string }

export async function postIceUploadInit(body: {
  fileName: string
  contentType: string
  sizeBytes: number
}): Promise<IceUploadInitResult> {
  for (const p of UPLOAD_INIT_PATHS) {
    for (const url of merchantApiFetchUrls(p)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      const j = await parseJson<IceUploadInitResult & { message?: string }>(res)
      if (res.status === 404) continue
      if (!res.ok || !j?.ok) {
        return { ok: false, message: j?.message ?? `上传初始化失败 HTTP ${res.status}` }
      }
      return j as IceUploadInitResult
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg }
    }
    }
  }
  return { ok: false, message: '本地上传接口未部署' }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function postJsonPaths<T extends { ok: boolean; message?: string }>(
  paths: readonly string[],
  body: unknown,
): Promise<T | { ok: false; message: string }> {
  for (const p of paths) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
        })
        const j = await parseJson<T & { message?: string }>(res)
        if (res.status === 404) continue
        if (!res.ok || !j || !('ok' in j) || !j.ok) {
          return { ok: false, message: j?.message ?? `请求失败 HTTP ${res.status}` }
        }
        return j as T
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, message: msg }
      }
    }
  }
  return { ok: false, message: '本地上传接口未部署' }
}

async function uploadIceViaServer(
  file: File,
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const contentType = defaultContentType(file)
  const label = file.name.replace(/\.[^.]+$/, '') || file.name

  if (file.size <= ICE_CLIENT_CHUNK_BYTES) {
    const contentBase64 = await blobToBase64(file)
    const r = await postJsonPaths<{
      ok: true
      mediaUrl: string
      label?: string
    }>(UPLOAD_SERVER_PATHS, {
      fileName: file.name,
      contentType,
      contentBase64,
    })
    if (!r.ok) return r
    return { ok: true, mediaUrl: r.mediaUrl, label: r.label ?? label }
  }

  const init = await postJsonPaths<{
    ok: true
    uploadId: string
    objectKey: string
    partSize: number
    partCount: number
  }>(UPLOAD_MULTIPART_PATHS, {
    step: 'init',
    fileName: file.name,
    contentType,
    sizeBytes: file.size,
  })
  if (!init.ok) return init

  const parts: { partNumber: number; etag: string }[] = []
  for (let i = 0; i < init.partCount; i++) {
    const start = i * init.partSize
    const end = Math.min(start + init.partSize, file.size)
    const slice = file.slice(start, end)
    const contentBase64 = await blobToBase64(slice)
    const part = await postJsonPaths<{ ok: true; etag: string; partNumber: number }>(
      UPLOAD_MULTIPART_PATHS,
      {
        step: 'part',
        objectKey: init.objectKey,
        uploadId: init.uploadId,
        partNumber: i + 1,
        contentBase64,
      },
    )
    if (!part.ok) return part
    parts.push({ partNumber: i + 1, etag: part.etag })
  }

  const done = await postJsonPaths<{
    ok: true
    mediaUrl: string
    label?: string
  }>(UPLOAD_MULTIPART_PATHS, {
    step: 'complete',
    objectKey: init.objectKey,
    uploadId: init.uploadId,
    fileName: file.name,
    parts,
  })
  if (!done.ok) return done
  return { ok: true, mediaUrl: done.mediaUrl, label: done.label ?? label }
}

function defaultContentType(file: File): string {
  if (file.type?.trim()) return file.type
  if (/\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name)) return 'image/jpeg'
  return 'video/mp4'
}

export type IceUploadProgress = { loaded: number; total: number; percent: number }

function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (p: IceUploadProgress) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
      })
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true })
      else resolve({ ok: false, message: `OSS 上传失败 HTTP ${xhr.status}` })
    }
    xhr.onerror = () =>
      resolve({
        ok: false,
        message:
          '浏览器无法直传 OSS（多为 Bucket 未配置 CORS）。将自动改走服务端上传，体积较大时会更慢。',
      })
    xhr.send(file)
  })
}

/** 浏览器直传 OSS（预签名 PUT），通常比经 Vercel Base64 中转快 */
async function uploadIceDirectOss(
  file: File,
  onProgress?: (p: IceUploadProgress) => void,
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const contentType = defaultContentType(file)
  const label = file.name.replace(/\.[^.]+$/, '') || file.name
  const init = await postIceUploadInit({
    fileName: file.name,
    contentType,
    sizeBytes: file.size,
  })
  if (!init.ok) return init

  const put = await putFileToPresignedUrl(init.uploadUrl, file, init.contentType, onProgress)
  if (!put.ok) return put
  return { ok: true, mediaUrl: init.mediaUrl, label }
}

/**
 * 本地上传至 OSS。
 * 优先浏览器直传（快）；失败时回退经 BFF Base64 中转（Vercel 单请求约 ≤2MB，大图会分片多次往返，较慢）。
 */
export async function uploadIceLocalMediaFile(
  file: File,
  opts?: { onProgress?: (p: IceUploadProgress) => void },
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const direct = await uploadIceDirectOss(file, opts?.onProgress)
  if (direct.ok) return direct

  const viaServer = await uploadIceViaServer(file)
  if (viaServer.ok) return viaServer

  return {
    ok: false,
    message: `${direct.message}；${viaServer.message}`,
  }
}

/** @deprecated 使用 uploadIceLocalMediaFile */
export const uploadIceLocalVideoFile = uploadIceLocalMediaFile

export async function postIcePipeline(body: {
  mediaUrl?: string
  imageUrls?: string[]
  projectName?: string
  /** 剪辑文案指令，写入云端项目描述 */
  editBrief?: string
  width: number
  height: number
  clipEndSec: number
  preset: string
  presetLengthSec?: number
}): Promise<IcePipelineResult> {
  for (const p of PIPELINE_PATHS) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
        })
        const j = await parseJson<IcePipelineResult & { message?: string }>(res)
        if (res.status === 404) continue
        if (!res.ok || !j?.ok) {
          return { ok: false, message: j?.message ?? `云剪提交失败 HTTP ${res.status}` }
        }
        return j as IcePipelineResult
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, message: msg }
      }
    }
  }
  return { ok: false, message: '云剪辑接口未部署' }
}

export async function fetchIceJobStatus(jobId: string): Promise<IceJobStatus> {
  const paths = [
    `/api/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(jobId)}`,
    `/api/meoo-merchant-ai-video-openshot-export?id=${encodeURIComponent(jobId)}`,
    `/api/merchant/ai/video/ice/job?id=${encodeURIComponent(jobId)}`,
    `/api/merchant/ai/video/openshot/export?id=${encodeURIComponent(jobId)}`,
  ]
  for (const p of paths) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetch(url)
        if (res.status === 404) continue
        const j = await parseJson<IceJobStatus & { message?: string }>(res)
        if (!res.ok || !j?.ok) {
          return { ok: false, message: j?.message ?? `查询失败 HTTP ${res.status}` }
        }
        return j
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, message: msg }
      }
    }
  }
  return { ok: false, message: '任务状态接口未部署' }
}

/** 拉取成片为 Blob URL（用于内嵌预览；下载请用 triggerIceExportDownload） */
export async function fetchIceExportPreviewUrl(jobId: string): Promise<string> {
  const paths = [
    `/api/meoo-merchant-ai-video-ice-job-download?id=${encodeURIComponent(jobId)}&inline=1`,
    `/api/meoo-merchant-ai-video-openshot-export-download?id=${encodeURIComponent(jobId)}&inline=1`,
    `/api/merchant/ai/video/ice/job-download?id=${encodeURIComponent(jobId)}&inline=1`,
    `/api/merchant/ai/video/openshot/export-download?id=${encodeURIComponent(jobId)}&inline=1`,
  ]
  const urls: string[] = []
  for (const p of paths) {
    for (const u of merchantApiFetchUrls(p)) {
      if (!urls.includes(u)) urls.push(u)
    }
  }
  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i]!
    try {
      const res = await fetch(url)
      if (res.status === 404) continue
      const ct = (res.headers.get('content-type') ?? '').toLowerCase()
      if (!res.ok) {
        const j = ct.includes('json') ? await parseJson<{ message?: string }>(res) : null
        const detail = j?.message ?? `预览加载失败 HTTP ${res.status}`
        if (res.status === 409) {
          throw new Error(`${detail}（成片尚未写入完成，请稍后重试）`)
        }
        throw new Error(detail)
      }
      if (ct.includes('json') || ct.includes('text/html')) {
        throw new Error('预览接口返回了非视频内容，请确认已部署最新版云剪下载 API')
      }
      const blob = await res.blob()
      if (blob.size < 2048) {
        throw new Error('预览到的成片为空，请稍后重试或重新提交云剪')
      }
      return URL.createObjectURL(blob)
    } catch (e) {
      if (i === urls.length - 1) throw e
    }
  }
  throw new Error('预览接口未部署')
}

/** @deprecated 请用 triggerIceExportDownload；保留供需要 Blob 的场景 */
export async function downloadIceExportBlob(jobId: string): Promise<string> {
  return fetchIceExportPreviewUrl(jobId)
}

export const ICE_ASPECT_PRESETS = [
  { id: '9:16', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '横屏 16:9', width: 1920, height: 1080 },
  { id: '1:1', label: '方屏 1:1', width: 1080, height: 1080 },
] as const
