import { initMpGroupQrOssUpload, patchMpRecruitmentOrder } from '../mpApi'
import { resolveDeadlineMs } from './mpOrderHeroMeta'

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'
const RETENTION_MS = 7 * 86400000

export function isGroupQrExpired(mp: Record<string, unknown> | null, nowMs?: number): boolean {
  const deadlineMs = resolveDeadlineMs(mp)
  if (deadlineMs <= 0) return false
  const now = nowMs ?? Date.now()
  return now > deadlineMs + RETENTION_MS
}

function readLocalGroupQr(mpOrderId: string): string {
  try {
    return String(localStorage.getItem(`${LOCAL_PREFIX}${mpOrderId}`) || '').trim()
  } catch {
    return ''
  }
}

function writeLocalGroupQr(mpOrderId: string, url: string) {
  localStorage.setItem(`${LOCAL_PREFIX}${mpOrderId}`, url || '')
}

function isHttpsUrl(raw: string): boolean {
  return /^https:\/\//i.test(String(raw || '').trim())
}

export function isGroupQrSyncedToServer(url: string): boolean {
  return isHttpsUrl(url)
}

export function groupQrFromMp(mp: Record<string, unknown> | null): string {
  if (!mp) return ''
  if (isGroupQrExpired(mp)) {
    const id = String(mp.id || '').trim()
    if (id) writeLocalGroupQr(id, '')
    return ''
  }
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? (mp.mpPublishMeta as Record<string, unknown>) : {}
  const remote = String(mp.groupQrImage || meta.groupQrImage || '').trim()
  if (remote) return remote
  const id = String(mp.id || '').trim()
  return id ? readLocalGroupQr(id) : ''
}

export function groupQrFromRegistry(
  reg: Record<string, unknown> | null | undefined,
  mpOrderId: string,
  mp?: Record<string, unknown> | null,
): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const map = reg?.mpGroupQrByOrderId
  if (map && typeof map === 'object') {
    const fromMap = String((map as Record<string, string>)[id] || '').trim()
    if (fromMap) return fromMap
  }
  return groupQrFromMp(mp ?? null)
}

function compressImageToDataUrl(file: File, maxDim = 720, startQuality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      const scale = Math.min(1, maxDim / Math.max(w, h, 1))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('图片处理失败'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', startQuality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('读取图片失败'))
    }
    img.src = url
  })
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return compressImageToDataUrl(file)
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], 'group-qr.jpg', { type: blob.type || 'image/jpeg' })
}

export async function uploadGroupQrFileToOss(mpOrderId: string, file: File): Promise<string> {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  const plan = (await initMpGroupQrOssUpload({
    mpOrderId: id,
    fileName: file.name || 'group-qr.jpg',
    contentType: file.type || 'image/jpeg',
    sizeBytes: file.size,
  })) as { ok?: boolean; error?: string; uploadUrl?: string; imageUrl?: string; contentType?: string }

  if (!plan || plan.ok === false) {
    throw new Error(String(plan?.error || '获取上传凭证失败'))
  }
  const uploadUrl = String(plan.uploadUrl || '').trim()
  const imageUrl = String(plan.imageUrl || '').trim()
  const contentType = String(plan.contentType || file.type || 'image/jpeg')
  if (!uploadUrl || !imageUrl) throw new Error('上传凭证无效')

  const secureUploadUrl = uploadUrl.replace(/^http:\/\//i, 'https://')
  const put = await fetch(secureUploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
  if (!put.ok) throw new Error(`上传 OSS 失败(${put.status})`)
  return imageUrl
}

async function resolveGroupQrOssUrl(mpOrderId: string, ref: string): Promise<string> {
  const img = String(ref || '').trim()
  if (!img) throw new Error('未读取到图片')
  if (isHttpsUrl(img)) return img
  const file = img.startsWith('data:image/') ? await dataUrlToFile(img) : null
  if (!file) throw new Error('请重新选择群二维码')
  return uploadGroupQrFileToOss(mpOrderId, file)
}

function formatPatchError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || '保存失败')
  if (/group_qr_too_large|过大/i.test(msg)) return '二维码图片过大，请换一张更小的截图'
  if (/not_found|404/i.test(msg)) return '招募单不存在，请返回列表刷新后重试'
  if (/oss_not|upload/i.test(msg)) return '群码上传 OSS 失败，请稍后重试'
  if (/meoo_ops_mp_recruitment_orders_patch_failed|patch_failed/i.test(msg)) {
    return '服务器保存失败，请稍后重试'
  }
  if (/supabase|registry|timeout/i.test(msg)) return '网络超时，请稍后重试'
  if (/failed to fetch|mixed content|networkerror/i.test(msg)) {
    return '群码上传网络失败，请检查网络后重试'
  }
  return msg.length > 48 ? `${msg.slice(0, 46)}…` : msg
}

export async function patchGroupQrImage(mpOrderId: string, groupQrImage: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  const imageUrl = await resolveGroupQrOssUrl(id, groupQrImage)
  writeLocalGroupQr(id, imageUrl)
  try {
    await patchMpRecruitmentOrder({ id, groupQrImage: imageUrl })
    return { localOnly: false, imageUrl }
  } catch (e) {
    const err = new Error(formatPatchError(e))
    ;(err as Error & { localSaved?: boolean; imageUrl?: string }).localSaved = true
    ;(err as Error & { localSaved?: boolean; imageUrl?: string }).imageUrl = imageUrl
    throw err
  }
}

export async function clearGroupQrImage(mpOrderId: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  writeLocalGroupQr(id, '')
  try {
    await patchMpRecruitmentOrder({ id, groupQrImage: '' })
  } catch (e) {
    throw new Error(formatPatchError(e))
  }
}
