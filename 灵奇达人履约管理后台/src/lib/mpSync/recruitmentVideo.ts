import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { clearMpRegistryCache } from '../mpApi'
import { assertRecruitmentVideoFile } from './recruitmentVideoLimits'
import { uploadFileViaErpMultipart } from './erpMultipartUpload'

/** Web 经 JSON base64 上限（dr Nginx body 有限，base64 约 ×4/3；更大走分片） */
const WEB_BASE64_MAX_BYTES = 2 * 1024 * 1024

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
        if (/413|entity too large/i.test(lastErr)) {
          throw new Error('视频过大，请压缩后重试或联系运维调大 Nginx 上传限制')
        }
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

async function uploadVideoBody(
  file: File,
  mpOrderId: string,
  applicantId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) onProgress(5)
  const contentBase64 = await fileToBase64(file)
  if (onProgress) onProgress(35)
  await postMp(
    [
      '/api/meoo-ops-mp-recruitment-video-upload-body',
      '/api/ops-sync/mp-recruitment-orders/video-upload-body',
    ],
    {
      mpOrderId,
      applicantId,
      fileName: file.name || 'recruit-video.mp4',
      contentType: file.type || 'video/mp4',
      contentBase64,
    },
  )
  clearMpRegistryCache()
  if (onProgress) onProgress(100)
}

async function uploadVideoViaMultipartAndDraft(
  file: File,
  mpOrderId: string,
  applicantId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) onProgress(5)
  const mediaUrl = await uploadFileViaErpMultipart(file, (pct) => {
    if (onProgress) onProgress(5 + Math.round(pct * 0.88))
  })
  await saveRecruitmentVideoDraft(mpOrderId, applicantId, mediaUrl)
  if (onProgress) onProgress(100)
}

/** 经 ECS 转存 OSS 并写入报名视频草稿（不提交审核） */
export async function uploadRecruitmentVideoDraft(
  file: File,
  mpOrderId: string,
  applicantId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) throw new Error('缺少报名信息')
  if (!file.size) throw new Error('视频文件无效')
  await assertRecruitmentVideoFile(file)

  if (file.size <= WEB_BASE64_MAX_BYTES) {
    await uploadVideoBody(file, orderId, aid, onProgress)
    return
  }
  await uploadVideoViaMultipartAndDraft(file, orderId, aid, onProgress)
}

/** 经 ECS 转存 OSS 并写入报名视频；大文件走分片经 erp-api */
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
  await assertRecruitmentVideoFile(file)

  if (file.size <= WEB_BASE64_MAX_BYTES) {
    await uploadVideoBody(file, orderId, aid, onProgress)
    return
  }

  if (onProgress) onProgress(5)
  const mediaUrl = await uploadFileViaErpMultipart(file, (pct) => {
    if (onProgress) onProgress(5 + Math.round(pct * 0.88))
  })
  await submitRecruitmentVideo(orderId, aid, mediaUrl)
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

export async function saveRecruitmentVideoDraft(mpOrderId: string, applicantId: string, videoUrl: string) {
  const data = await postMp(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl, draft: true },
  )
  clearMpRegistryCache()
  return data
}

export async function submitRecruitmentVideo(mpOrderId: string, applicantId: string, videoUrl: string) {
  const data = await postMp(
    ['/api/meoo-ops-mp-recruitment-video-submit', '/api/ops-sync/mp-recruitment-orders/video-submit'],
    { mpOrderId, applicantId, videoUrl },
  )
  clearMpRegistryCache()
  return data
}

export async function reviewRecruitmentVideo(
  mpOrderId: string,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
) {
  const data = await postMp(
    ['/api/meoo-ops-mp-recruitment-video-review', '/api/ops-sync/mp-recruitment-orders/video-review'],
    { mpOrderId, applicantId, action, rejectReason },
  )
  clearMpRegistryCache()
  return data
}

export function videoStatusLabel(status?: string): string {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新上传'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '待达人提交'
  return ''
}
