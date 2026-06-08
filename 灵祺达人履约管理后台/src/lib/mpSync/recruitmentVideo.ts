import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

const MAX_BODY_MB = 48

async function postMp(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
    try {
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
        lastErr = String(data.message || data.detail || data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw
      if (!base64) {
        reject(new Error('读取视频失败'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('读取视频失败'))
    reader.readAsDataURL(file)
  })
}

/** 经 ECS 转存 OSS 并写入报名视频（避免浏览器直传 OSS 的 CORS 问题） */
export async function uploadAndSubmitRecruitmentVideo(
  file: File,
  mpOrderId: string,
  applicantId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) throw new Error('缺少报名信息')
  if (!file.size) throw new Error('视频文件无效')
  if (file.size > MAX_BODY_MB * 1024 * 1024) {
    throw new Error(`视频超过 ${MAX_BODY_MB}MB，请压缩后重试`)
  }
  if (onProgress) onProgress(5)
  const contentBase64 = await fileToBase64(file)
  if (onProgress) onProgress(35)
  await postMp(
    [
      '/api/meoo-ops-mp-recruitment-video-upload-body',
      '/api/ops-sync/mp-recruitment-orders/video-upload-body',
    ],
    {
      mpOrderId: orderId,
      applicantId: aid,
      fileName: file.name || 'recruit-video.mp4',
      contentType: file.type || 'video/mp4',
      contentBase64,
    },
  )
  if (onProgress) onProgress(100)
}

/** @deprecated 浏览器直传 OSS 易因 CORS 失败，请用 uploadAndSubmitRecruitmentVideo */
export async function initRecruitmentVideoUpload(file: File) {
  const data = await postMp(['/api/meoo-ops-mp-recruitment-video-upload-init'], {
    fileName: file.name || 'recruit-video.mp4',
    contentType: file.type || 'video/mp4',
    sizeBytes: file.size,
  })
  return {
    uploadUrl: String(data.uploadUrl || ''),
    mediaUrl: String(data.mediaUrl || ''),
    contentType: String(data.contentType || file.type || 'video/mp4'),
  }
}

/** @deprecated 请用 uploadAndSubmitRecruitmentVideo */
export async function uploadRecruitmentVideoFile(file: File, onProgress?: (pct: number) => void) {
  const plan = await initRecruitmentVideoUpload(file)
  if (!plan.uploadUrl || !plan.mediaUrl) throw new Error('上传凭证无效')
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', plan.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', plan.contentType)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败 ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('上传失败，请改用经服务器转存'))
    xhr.send(file)
  })
  return plan.mediaUrl
}

export async function submitRecruitmentVideo(mpOrderId: string, applicantId: string, videoUrl: string) {
  return postMp(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl },
  )
}

export async function reviewRecruitmentVideo(
  mpOrderId: string,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
) {
  return postMp(
    ['/api/meoo-ops-mp-recruitment-video-review', '/api/ops-sync/mp-recruitment-orders/video-review'],
    { mpOrderId, applicantId, action, rejectReason },
  )
}

export function videoStatusLabel(status?: string): string {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回'
  if (status === 'pending') return '待审核'
  return ''
}
