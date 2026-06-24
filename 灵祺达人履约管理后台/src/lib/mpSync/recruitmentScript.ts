import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { clearMpRegistryCache } from '../mpApi'

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

export function scriptStatusLabel(status?: string): string {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新提交'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '待达人提交'
  return ''
}

export function isApplicantScriptVisibleOnPrReview(a: Record<string, unknown> | null | undefined): boolean {
  if (!a) return false
  const status = String(a.scriptStatus || '').trim()
  if (status === 'draft') return false
  if (status === 'rejected') return true
  const url = String(a.scriptUrl || a.scriptLinkUrl || '').trim()
  return !!url
}

export function submitCountLabel(count?: number): string {
  const n = Math.max(1, Number(count || 0) || 1)
  return `第 ${n} 次提交`
}

export async function reviewRecruitmentScript(
  mpOrderId: string,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
) {
  const data = await postMp(['/api/meoo-ops-mp-recruitment-script-review'], {
    mpOrderId,
    applicantId,
    action,
    rejectReason: action === 'reject' ? String(rejectReason || '').trim() : undefined,
  })
  clearMpRegistryCache()
  return data
}

export async function readScriptTextForAi(scriptUrl?: string, scriptLinkUrl?: string): Promise<string> {
  const link = String(scriptLinkUrl || '').trim()
  if (link) return ''
  const url = String(scriptUrl || '').trim()
  if (!url) return ''
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const text = await res.text()
    return text.slice(0, 12000)
  } catch {
    return ''
  }
}

const SCRIPT_SUBMIT_PATHS = ['/api/meoo-ops-mp-recruitment-script-submit']

function resolveScriptContentType(fileName: string): string {
  const name = String(fileName || '').toLowerCase()
  if (name.endsWith('.doc')) return 'application/msword'
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'text/plain'
}

export async function saveRecruitmentScriptDraft(
  mpOrderId: string,
  applicantId: string,
  payload: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
) {
  const data = await postMp(SCRIPT_SUBMIT_PATHS, {
    mpOrderId,
    applicantId,
    draft: true,
    ...payload,
  })
  clearMpRegistryCache()
  return data
}

export async function saveRecruitmentScriptLinkDraft(
  mpOrderId: string,
  applicantId: string,
  scriptLinkUrl: string,
) {
  const link = String(scriptLinkUrl || '').trim()
  if (!link) throw new Error('请填写文档链接')
  return saveRecruitmentScriptDraft(mpOrderId, applicantId, { scriptLinkUrl: link })
}

export async function submitRecruitmentScriptForReview(
  mpOrderId: string,
  applicantId: string,
  payload?: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
) {
  const data = await postMp(SCRIPT_SUBMIT_PATHS, {
    mpOrderId,
    applicantId,
    ...(payload || {}),
  })
  clearMpRegistryCache()
  return data
}

async function initScriptUpload(file: File) {
  return postMp(['/api/meoo-ops-mp-recruitment-video-upload-init'], {
    fileName: file.name || 'recruit-script.txt',
    contentType: file.type || resolveScriptContentType(file.name),
    sizeBytes: file.size,
  })
}

export async function uploadRecruitmentScriptFile(
  file: File,
  mpOrderId: string,
  applicantId: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const orderId = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!orderId || !aid) throw new Error('缺少报名信息')
  if (!file.size) throw new Error('文件无效')
  if (file.size > 10 * 1024 * 1024) throw new Error('文稿超过 10MB，请压缩后重试')

  if (onProgress) onProgress(5)
  const plan = await initScriptUpload(file)
  const uploadUrl = String(plan.uploadUrl || '')
  const mediaUrl = String(plan.mediaUrl || '')
  const contentType = String(plan.contentType || file.type || resolveScriptContentType(file.name))
  if (!uploadUrl || !mediaUrl) throw new Error('上传凭证无效')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', contentType)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(5 + Math.round((e.loaded / e.total) * 85))
      }
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败 ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('上传失败'))
    xhr.send(file)
  })

  await saveRecruitmentScriptDraft(orderId, aid, {
    scriptUrl: mediaUrl,
    scriptFileName: file.name || 'script.txt',
  })
  if (onProgress) onProgress(100)
}

export function openRecruitmentScriptUrl(scriptUrl?: string, scriptLinkUrl?: string): void {
  const fileUrl = String(scriptUrl || '').trim()
  const linkUrl = String(scriptLinkUrl || '').trim()
  const url = linkUrl || fileUrl
  if (!url) {
    alert('暂无文稿')
    return
  }
  if (linkUrl) {
    void navigator.clipboard.writeText(linkUrl).then(
      () => alert('链接已复制'),
      () => window.open(linkUrl, '_blank', 'noopener,noreferrer'),
    )
    return
  }
  window.open(fileUrl, '_blank', 'noopener,noreferrer')
}
