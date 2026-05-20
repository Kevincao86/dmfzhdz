/** 阿里云 ICE 云剪辑 — 经商户 BFF 代理 */

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
export function iceJobDownloadProxyPath(jobId: string, inline = false): string {
  const q = new URLSearchParams({ id: jobId })
  if (inline) q.set('inline', '1')
  return `/api/meoo-merchant-ai-video-ice-job-download?${q.toString()}`
}

export type IceBatchJob = {
  id: string
  label: string
  mediaUrl: string
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
    try {
      const res = await fetch(p)
      if (res.status === 404) continue
      const j = await parseJson<AliyunIceCloudConfig>(res)
      if (res.ok && j && typeof j.configured === 'boolean') return j
    } catch {
      /* next */
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
    try {
      const res = await fetch(p, {
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
    try {
      const res = await fetch(p, {
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
  return { ok: false, message: '本地上传接口未部署' }
}

async function uploadIceViaServer(
  file: File,
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const contentType = file.type || 'video/mp4'
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

/** 本地上传：经商户 BFF 写入 OSS（无需浏览器直传，避免 CORS） */
export async function uploadIceLocalVideoFile(
  file: File,
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const viaServer = await uploadIceViaServer(file)
  if (viaServer.ok) return viaServer

  const init = await postIceUploadInit({
    fileName: file.name,
    contentType: file.type || 'video/mp4',
    sizeBytes: file.size,
  })
  if (!init.ok) {
    return {
      ok: false,
      message: `${viaServer.message}；${init.message}`,
    }
  }

  let putRes: Response
  try {
    putRes = await fetch(init.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': init.contentType },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: `上传到 OSS 失败：${msg}。若持续出现 Failed to fetch，请在阿里云 OSS 控制台为 Bucket 配置 CORS（允许本站域名 PUT），或刷新后重试（已优先走服务端上传）。`,
    }
  }
  if (!putRes.ok) {
    return { ok: false, message: `OSS 上传失败 HTTP ${putRes.status}` }
  }
  return { ok: true, mediaUrl: init.mediaUrl, label: file.name.replace(/\.[^.]+$/, '') || file.name }
}

export async function postIcePipeline(body: {
  mediaUrl: string
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
    try {
      const res = await fetch(p, {
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
    try {
      const res = await fetch(p)
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
  return { ok: false, message: '任务状态接口未部署' }
}

export async function downloadIceExportBlob(jobId: string): Promise<string> {
  const paths = [
    `/api/meoo-merchant-ai-video-ice-job-download?id=${encodeURIComponent(jobId)}`,
    `/api/meoo-merchant-ai-video-openshot-export-download?id=${encodeURIComponent(jobId)}`,
    `/api/merchant/ai/video/ice/job-download?id=${encodeURIComponent(jobId)}`,
    `/api/merchant/ai/video/openshot/export-download?id=${encodeURIComponent(jobId)}`,
  ]
  for (const p of paths) {
    try {
      const res = await fetch(p)
      if (res.status === 404) continue
      if (!res.ok) {
        const j = await parseJson<{ message?: string }>(res)
        throw new Error(j?.message ?? `下载失败 HTTP ${res.status}`)
      }
      const blob = await res.blob()
      if (blob.size < 2048) {
        throw new Error('下载到的成片为空，请稍后在任务列表重试或重新提交云剪')
      }
      return URL.createObjectURL(blob)
    } catch (e) {
      if (p === paths[paths.length - 1]) throw e
    }
  }
  throw new Error('下载接口未部署')
}

export const ICE_ASPECT_PRESETS = [
  { id: '9:16', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '横屏 16:9', width: 1920, height: 1080 },
  { id: '1:1', label: '方屏 1:1', width: 1080, height: 1080 },
] as const
