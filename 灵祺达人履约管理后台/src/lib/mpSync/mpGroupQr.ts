import { patchMpRecruitmentOrder } from '../mpApi'
import { resolveDeadlineMs } from './mpOrderHeroMeta'

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'
/** 注册表 JSON 安全上限（base64 data URL） */
const MAX_DATA_URL_LEN = 48000
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

function writeLocalGroupQr(mpOrderId: string, dataUrl: string) {
  localStorage.setItem(`${LOCAL_PREFIX}${mpOrderId}`, dataUrl || '')
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

function compressImageToDataUrl(file: File, maxDim = 360, startQuality = 0.68): Promise<string> {
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
      let q = startQuality
      let dataUrl = canvas.toDataURL('image/jpeg', q)
      while (dataUrl.length > MAX_DATA_URL_LEN && q > 0.32) {
        q -= 0.08
        dataUrl = canvas.toDataURL('image/jpeg', q)
      }
      if (dataUrl.length > MAX_DATA_URL_LEN) {
        reject(new Error('二维码图片过大，请换一张更小的截图'))
        return
      }
      resolve(dataUrl)
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

function formatPatchError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || '保存失败')
  if (/group_qr_too_large|过大/i.test(msg)) return '二维码图片过大，请换一张更小的截图'
  if (/not_found|404/i.test(msg)) return '招募单不存在，请返回列表刷新后重试'
  if (/meoo_ops_mp_recruitment_orders_patch_failed|patch_failed/i.test(msg)) {
    return '服务器保存失败，群码已存本机。请稍后重试或换更小截图'
  }
  if (/supabase|registry|timeout/i.test(msg)) return '网络超时，群码已存本机，请稍后重试'
  return msg.length > 48 ? `${msg.slice(0, 46)}…` : msg
}

export async function patchGroupQrImage(mpOrderId: string, groupQrImage: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  const img = String(groupQrImage || '').trim()
  if (!img) throw new Error('未读取到图片')
  if (img.length > MAX_DATA_URL_LEN) throw new Error('二维码图片过大，请换一张更小的截图')
  writeLocalGroupQr(id, img)
  try {
    await patchMpRecruitmentOrder({ id, groupQrImage: img })
    return { localOnly: false }
  } catch (e) {
    const err = new Error(formatPatchError(e))
    ;(err as Error & { localSaved?: boolean }).localSaved = true
    throw err
  }
}
