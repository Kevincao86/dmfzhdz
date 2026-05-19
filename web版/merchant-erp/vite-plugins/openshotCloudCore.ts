/**
 * OpenShot Cloud API 客户端（REST）。
 * @see https://www.openshot.org/zh-hant/cloud-api/
 */

export type OpenshotCreds = {
  apiBase: string
  username: string
  password: string
}

export type OpenshotProject = {
  url: string
  id: string
}

export type OpenshotExportRecord = {
  url: string
  id: string
  status?: string
  progress?: number
  video_url?: string
  json?: Record<string, unknown>
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

function authHeader(creds: OpenshotCreds): string {
  const token = Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64')
  return `Basic ${token}`
}

function resourceIdFromUrl(url: string): string {
  const parts = trimSlash(url).split('/')
  return parts[parts.length - 1] ?? url
}

async function openshotJson<T>(
  creds: OpenshotCreds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const base = trimSlash(creds.apiBase)
  const p = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${p}`
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader(creds),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 0, message: `无法连接 OpenShot Cloud：${msg}` }
  }
  const text = await res.text()
  let data: unknown = null
  if (text.trim()) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { raw: text }
    }
  }
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && data !== null
        ? String((data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).error ?? text).slice(0, 400)
        : text.slice(0, 400)
    return { ok: false, status: res.status, message: detail || `OpenShot HTTP ${res.status}` }
  }
  return { ok: true, data: data as T }
}

export function readOpenshotCredsFromEnv(env: Record<string, string | undefined>): OpenshotCreds | null {
  const username = (
    env.OPENSHOT_CLOUD_USER ??
    env.OPENCUT_CLOUD_USER ??
    env.OPENCUT_CLOUD_USERNAME ??
    ''
  ).trim()
  const password = (
    env.OPENSHOT_CLOUD_PASSWORD ??
    env.OPENCUT_CLOUD_PASSWORD ??
    ''
  ).trim()
  const apiBase = (
    env.OPENSHOT_CLOUD_API_BASE ??
    env.OPENCUT_CLOUD_API_BASE ??
    'https://cloud.openshot.org'
  ).trim()
  if (!username || !password) return null
  return { apiBase, username, password }
}

export function mergeOpenshotCredsFromRegistry(
  creds: OpenshotCreds | null,
  reg?: { openshotApiBase?: string; openshotUsername?: string; openshotPassword?: string },
): OpenshotCreds | null {
  const base = reg?.openshotApiBase?.trim() || creds?.apiBase || 'https://cloud.openshot.org'
  const username = reg?.openshotUsername?.trim() || creds?.username || ''
  const password = reg?.openshotPassword?.trim() || creds?.password || ''
  if (!username || !password) return null
  return { apiBase: base, username, password }
}

export async function openshotCreateProject(
  creds: OpenshotCreds,
  args: {
    name: string
    width: number
    height: number
    fpsNum?: number
    fpsDen?: number
  },
): Promise<{ ok: true; project: OpenshotProject } | { ok: false; message: string }> {
  const r = await openshotJson<{ url?: string }>(creds, 'POST', '/projects/', {
    name: args.name,
    width: args.width,
    height: args.height,
    fps_num: args.fpsNum ?? 30,
    fps_den: args.fpsDen ?? 1,
    sample_rate: 44100,
    channels: 2,
    json: {},
  })
  if (!r.ok) return { ok: false, message: r.message }
  const url = String(r.data?.url ?? '').trim()
  if (!url) return { ok: false, message: 'OpenShot 未返回 project URL' }
  return { ok: true, project: { url, id: resourceIdFromUrl(url) } }
}

export async function openshotUploadFileByUrl(
  creds: OpenshotCreds,
  projectUrl: string,
  mediaUrl: string,
): Promise<{ ok: true; fileUrl: string; fileId: string } | { ok: false; message: string }> {
  const r = await openshotJson<{ url?: string }>(creds, 'POST', '/files/', {
    media: null,
    project: projectUrl,
    json: { url: mediaUrl },
  })
  if (!r.ok) return { ok: false, message: r.message }
  const url = String(r.data?.url ?? '').trim()
  if (!url) return { ok: false, message: 'OpenShot 未返回 file URL' }
  return { ok: true, fileUrl: url, fileId: resourceIdFromUrl(url) }
}

export async function openshotAddClip(
  creds: OpenshotCreds,
  args: {
    fileUrl: string
    projectUrl: string
    position?: number
    start?: number
    end: number
    layer?: number
  },
): Promise<{ ok: true; clipUrl: string; clipId: string } | { ok: false; message: string }> {
  const r = await openshotJson<{ url?: string }>(creds, 'POST', '/clips/', {
    file: args.fileUrl,
    position: args.position ?? 0,
    start: args.start ?? 0,
    end: args.end,
    layer: args.layer ?? 1,
    project: args.projectUrl,
    json: {},
  })
  if (!r.ok) return { ok: false, message: r.message }
  const url = String(r.data?.url ?? '').trim()
  if (!url) return { ok: false, message: 'OpenShot 未返回 clip URL' }
  return { ok: true, clipUrl: url, clipId: resourceIdFromUrl(url) }
}

export async function openshotApplyClipPreset(
  creds: OpenshotCreds,
  clipId: string,
  args: { preset: string; lengthInSeconds: number; curve?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await openshotJson<unknown>(creds, 'POST', `/clips/${clipId}/presets/`, {
    preset: args.preset,
    length_in_seconds: String(args.lengthInSeconds),
    curve: args.curve ?? 'Ease In',
  })
  if (!r.ok) return { ok: false, message: r.message }
  return { ok: true }
}

export async function openshotStartExport(
  creds: OpenshotCreds,
  projectUrl: string,
  opts?: { videoBitrate?: number },
): Promise<{ ok: true; export: OpenshotExportRecord } | { ok: false; message: string }> {
  const r = await openshotJson<Record<string, unknown>>(creds, 'POST', '/exports/', {
    export_type: 'video',
    video_format: 'mp4',
    video_codec: 'libx264',
    video_bitrate: opts?.videoBitrate ?? 8_000_000,
    audio_codec: 'aac',
    audio_bitrate: 1_920_000,
    start_frame: 1,
    end_frame: 0,
    project: projectUrl,
    webhook: '',
    json: {},
    status: 'pending',
  })
  if (!r.ok) return { ok: false, message: r.message }
  const url = String(r.data?.url ?? '').trim()
  if (!url) return { ok: false, message: 'OpenShot 未返回 export URL' }
  return {
    ok: true,
    export: {
      url,
      id: resourceIdFromUrl(url),
      status: String(r.data?.status ?? 'pending'),
      progress: typeof r.data?.progress === 'number' ? r.data.progress : undefined,
      video_url: typeof r.data?.video_url === 'string' ? r.data.video_url : undefined,
      json: r.data,
    },
  }
}

export async function openshotGetExport(
  creds: OpenshotCreds,
  exportId: string,
): Promise<{ ok: true; export: OpenshotExportRecord } | { ok: false; message: string }> {
  const r = await openshotJson<Record<string, unknown>>(creds, 'GET', `/exports/${exportId}/`)
  if (!r.ok) return { ok: false, message: r.message }
  const url = String(r.data?.url ?? '').trim()
  return {
    ok: true,
    export: {
      url: url || `${trimSlash(creds.apiBase)}/exports/${exportId}/`,
      id: exportId,
      status: String(r.data?.status ?? ''),
      progress: typeof r.data?.progress === 'number' ? r.data.progress : undefined,
      video_url:
        typeof r.data?.video_url === 'string'
          ? r.data.video_url
          : typeof (r.data?.json as Record<string, unknown> | undefined)?.url === 'string'
            ? String((r.data?.json as Record<string, unknown>).url)
            : undefined,
      json: r.data,
    },
  }
}

export function openshotExportDownloadPath(creds: OpenshotCreds, exportId: string): string {
  return `${trimSlash(creds.apiBase)}/exports/${exportId}/download/`
}

/** 单条素材：建项 → 拉媒体 → 上轨 → 预设 → 导出 */
export async function openshotRunSinglePipeline(
  creds: OpenshotCreds,
  input: {
    mediaUrl: string
    projectName: string
    width: number
    height: number
    clipEndSec: number
    preset: string
    presetLengthSec: number
    curve?: string
  },
): Promise<
  | { ok: true; projectId: string; exportId: string; exportUrl: string }
  | { ok: false; message: string; step?: string }
> {
  const proj = await openshotCreateProject(creds, {
    name: input.projectName,
    width: input.width,
    height: input.height,
  })
  if (!proj.ok) return { ok: false, message: proj.message, step: 'create_project' }

  const file = await openshotUploadFileByUrl(creds, proj.project.url, input.mediaUrl)
  if (!file.ok) return { ok: false, message: file.message, step: 'upload_file' }

  const clip = await openshotAddClip(creds, {
    fileUrl: file.fileUrl,
    projectUrl: proj.project.url,
    end: input.clipEndSec,
  })
  if (!clip.ok) return { ok: false, message: clip.message, step: 'add_clip' }

  const preset = await openshotApplyClipPreset(creds, clip.clipId, {
    preset: input.preset,
    lengthInSeconds: input.presetLengthSec,
    curve: input.curve,
  })
  if (!preset.ok) return { ok: false, message: preset.message, step: 'apply_preset' }

  const exp = await openshotStartExport(creds, proj.project.url)
  if (!exp.ok) return { ok: false, message: exp.message, step: 'start_export' }

  return {
    ok: true,
    projectId: proj.project.id,
    exportId: exp.export.id,
    exportUrl: exp.export.url,
  }
}
