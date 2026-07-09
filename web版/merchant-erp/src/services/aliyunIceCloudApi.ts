/** 阿里云 ICE 云剪辑 — 经商户 BFF 代理（生产优先 ECS /erp-api 读运营台 videoAi） */

import {
  merchantApiFetchUrls,
  merchantBinaryApiFetchUrls,
  merchantErpApiCandidates,
  merchantErpApiBase,
  buildMerchantErpApiUrl,
} from '../lib/merchantErpApiBase'
import { guessUploadImageMime, isUploadImageFile } from '../lib/iceUploadFileSnapshot'

export type AliyunIceCloudConfig = {
  configured: boolean
  regionId: string
  hasOssOutput?: boolean
  hasVodOutput?: boolean
  /** 已配置 OSS 前缀时可本地上传至 Bucket */
  localUploadEnabled?: boolean
  presets: string[]
  effectOptions?: { id: string; label: string }[]
  subtitleStyleOptions?: Array<{ id: string; label: string; description?: string; tag?: string }>
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
    for (const u of merchantBinaryApiFetchUrls(p)) {
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
        if (res.status === 404 || res.status === 500 || res.status === 502) continue
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
  /** 带签名 OSS 地址，私有 Bucket 时供 ICE URL 拉取回退 */
  signedMediaUrl?: string
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

const ICE_CONFIG_FETCH_TIMEOUT_MS = 20_000
const ICE_UPLOAD_INIT_TIMEOUT_MS = 12_000
const ICE_UPLOAD_BODY_TIMEOUT_MS = 75_000
/** OSS 直传失败则快速回退服务端写入 */
const ICE_OSS_PUT_TIMEOUT_MS = 18_000

/** 本会话内 OSS 直传已失败过则跳过后续直传（Bucket CORS 通常对所有文件一致） */
let iceOssDirectDisabledForSession = false

/** 配置接口实际命中的后端：ECS 有 ICE 凭据，Vercel 通常无 */
let iceConfigBackend: 'ecs' | 'same-origin' | null = null

function isEcsErpApiUrl(url: string): boolean {
  return /\/erp-api\//i.test(url) || /mofangdianai\.com\/erp-api/i.test(url)
}

function rememberIceConfigBackend(url: string): void {
  if (isEcsErpApiUrl(url)) iceConfigBackend = 'ecs'
  else if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) {
    iceConfigBackend = 'same-origin'
  }
}

/** 上传 API：配置来自 ECS 时仅走 ECS（Vercel 无 ICE 凭据，回退只会空耗超时） */
function iceUploadServerFetchUrls(apiPath: string): string[] {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }

  const base = merchantErpApiBase()
  if (base) add(buildMerchantErpApiUrl(base, path))
  if (iceConfigBackend === 'ecs' || (typeof window !== 'undefined' && window.location.hostname.toLowerCase() === 'cs.mofangdianai.com')) {
    return urls
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  for (const u of merchantErpApiCandidates(path)) {
    if (origin && u.startsWith(origin)) continue
    add(u)
  }
  if (origin) add(`${origin}${path}`)
  return urls
}

/** 上传 init：与 iceUploadServerFetchUrls 同源策略一致 */
function iceUploadInitFetchUrls(apiPath: string): string[] {
  return iceUploadServerFetchUrls(apiPath)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s），请检查网络或稍后重试`)
    }
    throw e
  } finally {
    window.clearTimeout(timer)
  }
}

const PIPELINE_PATHS = [
  '/api/meoo-merchant-ai-video-ice-pipeline',
  '/api/meoo-merchant-ai-video-openshot-pipeline',
  '/api/merchant/ai/video/ice/pipeline',
  '/api/merchant/ai/video/openshot/pipeline',
] as const

export async function fetchAliyunIceCloudConfig(): Promise<AliyunIceCloudConfig | null> {
  let lastErr: string | null = null
  for (const p of CONFIG_PATHS) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetchWithTimeout(url, {}, ICE_CONFIG_FETCH_TIMEOUT_MS)
        if (res.status === 404) continue
        const j = await parseJson<AliyunIceCloudConfig>(res)
        if (res.ok && j && typeof j.configured === 'boolean') {
          if (j.localUploadEnabled) rememberIceConfigBackend(url)
          return j
        }
        lastErr = j ? '配置响应异常' : `HTTP ${res.status}`
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
    }
  }
  if (lastErr) console.warn('[ice-config]', lastErr)
  return null
}

export type IceUploadInitResult =
  | { ok: true; uploadUrl: string; contentType: string; mediaUrl: string; timelineUrl?: string; objectKey?: string }
  | { ok: false; message: string }

export async function postIceUploadInit(body: {
  fileName: string
  contentType: string
  sizeBytes: number
}): Promise<IceUploadInitResult> {
  let lastMsg = '上传初始化失败，请稍后重试'
  for (const p of UPLOAD_INIT_PATHS) {
    for (const url of iceUploadInitFetchUrls(p)) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(body),
          },
          ICE_UPLOAD_INIT_TIMEOUT_MS,
        )
        const j = await parseJson<IceUploadInitResult & { message?: string }>(res)
        if (res.status === 404) continue
        if (!res.ok || !j?.ok) {
          lastMsg = j?.message ?? `上传初始化失败 HTTP ${res.status}`
          continue
        }
        return j as IceUploadInitResult
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e)
      }
    }
  }
  return { ok: false, message: lastMsg }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('读取文件失败'))
        return
      }
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

async function xhrPostJson<T extends { ok: boolean; message?: string }>(
  url: string,
  body: unknown,
  timeoutMs: number,
  onUploadProgress?: (sentRatio: number) => void,
): Promise<
  | { kind: 'ok'; data: T }
  | { kind: 'err'; message: string; status: number }
> {
  const payload = JSON.stringify(body)
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = timeoutMs
    xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) onUploadProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let j: (T & { message?: string }) | null = null
      try {
        j = JSON.parse(xhr.responseText) as T & { message?: string }
      } catch {
        j = null
      }
      if (xhr.status === 404) {
        resolve({ kind: 'err', message: '404', status: 404 })
        return
      }
      if (xhr.status >= 200 && xhr.status < 300 && j?.ok) {
        resolve({ kind: 'ok', data: j as T })
        return
      }
      resolve({
        kind: 'err',
        message: j?.message ?? `请求失败 HTTP ${xhr.status}`,
        status: xhr.status,
      })
    }
    xhr.onerror = () =>
      resolve({
        kind: 'err',
        message: 'ECS 连接被重置，请在服务器重启 meoo-auth-api',
        status: 0,
      })
    xhr.ontimeout = () =>
      resolve({
        kind: 'err',
        message: `上传超时（${Math.round(timeoutMs / 1000)}s），ECS 写入 OSS 过慢`,
        status: 0,
      })
    xhr.send(payload)
  })
}

async function postJsonPathsServer<T extends { ok: boolean; message?: string }>(
  paths: readonly string[],
  body: unknown,
  timeoutMs = ICE_UPLOAD_BODY_TIMEOUT_MS,
  onUploadProgress?: (sentRatio: number) => void,
): Promise<T | { ok: false; message: string }> {
  let lastMsg = '本地上传接口未就绪，请确认 ECS 已部署 meoo-auth-api 或刷新后重试'
  if (iceConfigBackend === 'ecs') {
    lastMsg =
      'ECS 上传接口不可用：请在服务器执行 cd ~/app && bash scripts/ecs-git-pull-main.sh && sudo systemctl restart meoo-auth-api'
  }
  for (const p of paths) {
    for (const url of iceUploadServerFetchUrls(p)) {
      const r = await xhrPostJson<T>(url, body, timeoutMs, onUploadProgress)
      if (r.kind === 'ok') return r.data
      if (r.status === 404) continue
      lastMsg = r.message
    }
  }
  return { ok: false, message: lastMsg }
}

async function uploadIceViaServer(
  file: File,
  onProgress?: (p: IceUploadProgress) => void,
): Promise<
  { ok: true; mediaUrl: string; timelineUrl?: string; signedMediaUrl?: string; label: string } | { ok: false; message: string }
> {
  const contentType = defaultContentType(file)
  const label = file.name.replace(/\.[^.]+$/, '') || file.name
  const report = (percent: number, phase: IceUploadProgress['phase'] = 'server') => {
    onProgress?.({
      loaded: Math.round((file.size * percent) / 100),
      total: file.size,
      percent: Math.min(99, Math.max(8, percent)),
      phase,
    })
  }

  report(8, 'server')

  if (file.size <= ICE_CLIENT_CHUNK_BYTES) {
    report(15, 'encode')
    const contentBase64 = await blobToBase64(file)
    report(45, 'server')
    const r = await postJsonPathsServer<{
      ok: true
      mediaUrl: string
      timelineUrl?: string
      label?: string
    }>(
      UPLOAD_SERVER_PATHS,
      {
        fileName: file.name,
        contentType,
        contentBase64,
      },
      ICE_UPLOAD_BODY_TIMEOUT_MS,
      (ratio) => report(45 + Math.round(ratio * 50), 'server'),
    )
    if (!r.ok) return r
    report(100)
    const pipelineUrl = r.timelineUrl?.trim() || r.mediaUrl
    return {
      ok: true,
      mediaUrl: pipelineUrl,
      timelineUrl: r.timelineUrl,
      signedMediaUrl: r.mediaUrl,
      label: r.label ?? label,
    }
  }

  const init = await postJsonPathsServer<{
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
    report(10 + Math.round(((i + 0.35) / init.partCount) * 75))
    const start = i * init.partSize
    const end = Math.min(start + init.partSize, file.size)
    const slice = file.slice(start, end)
    const contentBase64 = await blobToBase64(slice)
    report(10 + Math.round(((i + 0.75) / init.partCount) * 75))
    const part = await postJsonPathsServer<{ ok: true; etag: string; partNumber: number }>(
      UPLOAD_MULTIPART_PATHS,
      {
        step: 'part',
        objectKey: init.objectKey,
        uploadId: init.uploadId,
        partNumber: i + 1,
        contentBase64,
      },
      ICE_UPLOAD_BODY_TIMEOUT_MS,
      (ratio) =>
        report(
          10 + Math.round(((i + 0.75 + ratio * 0.2) / init.partCount) * 75),
          'server',
        ),
    )
    if (!part.ok) return part
    parts.push({ partNumber: i + 1, etag: part.etag })
  }

  const done = await postJsonPathsServer<{
    ok: true
    mediaUrl: string
    timelineUrl?: string
    label?: string
  }>(UPLOAD_MULTIPART_PATHS, {
    step: 'complete',
    objectKey: init.objectKey,
    uploadId: init.uploadId,
    fileName: file.name,
    parts,
  })
  if (!done.ok) return done
  report(100)
  const pipelineUrl = done.timelineUrl?.trim() || done.mediaUrl
  return {
    ok: true,
    mediaUrl: pipelineUrl,
    timelineUrl: done.timelineUrl,
    signedMediaUrl: done.mediaUrl,
    label: done.label ?? label,
  }
}

function defaultContentType(file: File): string {
  const mime = guessUploadImageMime(file.name, file.type)
  if (mime.startsWith('image/')) return mime
  return file.type?.trim() || 'video/mp4'
}

export type IceUploadProgress = {
  loaded: number
  total: number
  percent: number
  /** direct=浏览器直传 OSS；server=经 BFF 写入 OSS */
  phase?: 'direct' | 'server' | 'encode'
}

function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (p: IceUploadProgress) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.timeout = ICE_OSS_PUT_TIMEOUT_MS
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.min(100, Math.round((e.loaded / e.total) * 100)),
        phase: 'direct',
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
    xhr.ontimeout = () =>
      resolve({
        ok: false,
        message: 'OSS 直传超时，将改走服务端上传。',
      })
    xhr.send(file)
  })
}

/** 浏览器直传 OSS（预签名 PUT），通常比经 Vercel Base64 中转快 */
async function uploadIceDirectOss(
  file: File,
  onProgress?: (p: IceUploadProgress) => void,
): Promise<
  { ok: true; mediaUrl: string; timelineUrl?: string; signedMediaUrl?: string; label: string } | { ok: false; message: string }
> {
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
  const pipelineUrl = init.timelineUrl?.trim() || init.mediaUrl
  return {
    ok: true,
    mediaUrl: pipelineUrl,
    timelineUrl: init.timelineUrl,
    signedMediaUrl: init.mediaUrl,
    label,
  }
}

function isIceImageUploadFile(file: File): boolean {
  return isUploadImageFile(file)
}

/**
 * 本地上传至 OSS。
 * - 图片：直写 ECS→OSS（跳过浏览器直传，避免 OSS CORS 挂起）
 * - 视频：先 OSS 直传，失败再服务端写入
 */
export async function uploadIceLocalMediaFile(
  file: File,
  opts?: { onProgress?: (p: IceUploadProgress) => void },
): Promise<
  { ok: true; mediaUrl: string; timelineUrl?: string; signedMediaUrl?: string; label: string } | { ok: false; message: string }
> {
  if (isIceImageUploadFile(file)) {
    opts?.onProgress?.({ loaded: 0, total: file.size, percent: 10, phase: 'server' })
    return uploadIceViaServer(file, opts?.onProgress)
  }

  opts?.onProgress?.({ loaded: 0, total: file.size, percent: 1, phase: 'direct' })

  let directFail: { ok: false; message: string } | null = null
  if (!iceOssDirectDisabledForSession) {
    const direct = await uploadIceDirectOss(file, (p) =>
      opts?.onProgress?.({ ...p, phase: 'direct' }),
    )
    if (direct.ok) return direct
    directFail = direct
    iceOssDirectDisabledForSession = true
  }

  opts?.onProgress?.({ loaded: 0, total: file.size, percent: 8, phase: 'server' })
  const viaServer = await uploadIceViaServer(file, opts?.onProgress)
  if (viaServer.ok) {
    const pipelineUrl = viaServer.timelineUrl?.trim() || viaServer.mediaUrl
    return {
      ok: true,
      mediaUrl: pipelineUrl,
      timelineUrl: viaServer.timelineUrl,
      signedMediaUrl: viaServer.signedMediaUrl,
      label: viaServer.label,
    }
  }

  if (directFail) {
    return { ok: false, message: `${directFail.message}；${viaServer.message}` }
  }
  return viaServer
}

/** @deprecated 使用 uploadIceLocalMediaFile */
export const uploadIceLocalVideoFile = uploadIceLocalMediaFile

export async function postIcePipeline(body: {
  mediaUrl?: string
  /** 私有 OSS 上传时的签名地址，供服务端 Register 失败时回退 */
  signedMediaUrl?: string
  imageUrls?: string[]
  /** AI混剪：≥2 段分镜时间线 */
  mixSegments?: Array<{
    kind: 'video' | 'image'
    mediaUrl: string
    signedMediaUrl?: string
    timelineStartSec: number
    timelineEndSec: number
    caption?: string
  }>
  projectName?: string
  /** 剪辑文案指令，写入云端项目描述 */
  editBrief?: string
  width: number
  height: number
  clipEndSec: number
  /** @deprecated 请用 effectId */
  preset?: string
  effectId?: string
  subtitleStyleId?: string
  presetLengthSec?: number
}): Promise<IcePipelineResult> {
  for (const p of PIPELINE_PATHS) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
        const signal =
          typeof AS.timeout === 'function'
            ? AS.timeout(280_000)
            : (() => {
                const c = new AbortController()
                setTimeout(() => c.abort(), 280_000)
                return c.signal
              })()
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
          signal,
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
    for (const u of merchantBinaryApiFetchUrls(p)) {
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
        if (i < urls.length - 1 && (res.status === 500 || res.status === 502)) continue
        throw new Error(detail)
      }
      if (ct.includes('json') || ct.includes('text/html')) {
        if (i < urls.length - 1) continue
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
