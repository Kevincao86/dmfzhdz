/** OpenShot Cloud API — 经商户 BFF 代理，密钥不暴露前端 */

export type OpenshotCloudConfig = {
  configured: boolean
  apiBase: string
  presets: string[]
  credentialNote?: string
  docsUrl?: string
}

export type OpenshotPipelineResult =
  | {
      ok: true
      projectId: string
      exportId: string
      exportUrl: string
      downloadPath: string
    }
  | { ok: false; message: string; step?: string }

export type OpenshotExportStatus =
  | {
      ok: true
      status: string
      progress?: number
      done: boolean
      failed: boolean
      downloadUrl?: string
    }
  | { ok: false; message: string }

export type OpenshotBatchJob = {
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
  '/api/meoo-merchant-ai-video-openshot-config',
  '/api/merchant/ai/video/openshot/config',
] as const

const PIPELINE_PATHS = [
  '/api/meoo-merchant-ai-video-openshot-pipeline',
  '/api/merchant/ai/video/openshot/pipeline',
] as const

export async function fetchOpenshotCloudConfig(): Promise<OpenshotCloudConfig | null> {
  for (const p of CONFIG_PATHS) {
    try {
      const res = await fetch(p)
      if (res.status === 404) continue
      const j = await parseJson<OpenshotCloudConfig>(res)
      if (res.ok && j && typeof j.configured === 'boolean') return j
    } catch {
      /* next */
    }
  }
  return null
}

export async function postOpenshotPipeline(body: {
  mediaUrl: string
  projectName?: string
  width: number
  height: number
  clipEndSec: number
  preset: string
  presetLengthSec: number
  curve?: string
}): Promise<OpenshotPipelineResult> {
  for (const p of PIPELINE_PATHS) {
    try {
      const res = await fetch(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      const j = await parseJson<OpenshotPipelineResult & { message?: string }>(res)
      if (res.status === 404) continue
      if (!res.ok || !j?.ok) {
        return { ok: false, message: j?.message ?? `云剪提交失败 HTTP ${res.status}` }
      }
      return j as OpenshotPipelineResult
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg }
    }
  }
  return { ok: false, message: 'OpenShot 云剪接口未部署' }
}

export async function fetchOpenshotExportStatus(exportId: string): Promise<OpenshotExportStatus> {
  const paths = [
    `/api/meoo-merchant-ai-video-openshot-export?id=${encodeURIComponent(exportId)}`,
    `/api/merchant/ai/video/openshot/export?id=${encodeURIComponent(exportId)}`,
  ]
  for (const p of paths) {
    try {
      const res = await fetch(p)
      if (res.status === 404) continue
      const j = await parseJson<OpenshotExportStatus & { message?: string }>(res)
      if (!res.ok || !j?.ok) {
        return { ok: false, message: j?.message ?? `查询失败 HTTP ${res.status}` }
      }
      return j
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg }
    }
  }
  return { ok: false, message: '导出状态接口未部署' }
}

/** 经 BFF 下载成片，返回 blob URL */
export async function downloadOpenshotExportBlob(exportId: string): Promise<string> {
  const paths = [
    `/api/meoo-merchant-ai-video-openshot-export-download?id=${encodeURIComponent(exportId)}`,
    `/api/merchant/ai/video/openshot/export-download?id=${encodeURIComponent(exportId)}`,
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

export const OPENCUT_ASPECT_PRESETS = [
  { id: '9:16', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '横屏 16:9', width: 1920, height: 1080 },
  { id: '1:1', label: '方屏 1:1', width: 1080, height: 1080 },
] as const
