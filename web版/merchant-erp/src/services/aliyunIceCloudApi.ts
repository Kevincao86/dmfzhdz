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
      downloadUrl?: string
      message?: string
    }
  | { ok: false; message: string }

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

/** 本地上传：先取 OSS 凭证，再 PUT 直传，返回可供云剪拉取的 mediaUrl */
export async function uploadIceLocalVideoFile(
  file: File,
): Promise<{ ok: true; mediaUrl: string; label: string } | { ok: false; message: string }> {
  const init = await postIceUploadInit({
    fileName: file.name,
    contentType: file.type || 'video/mp4',
    sizeBytes: file.size,
  })
  if (!init.ok) return init

  let putRes: Response
  try {
    putRes = await fetch(init.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': init.contentType },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `上传到 OSS 失败：${msg}` }
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
