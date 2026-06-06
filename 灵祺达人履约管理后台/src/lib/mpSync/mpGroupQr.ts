import { patchMpRecruitmentOrder } from '../mpApi'
import { resolveDeadlineMs } from './mpOrderHeroMeta'

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'
const MAX_DATA_URL_LEN = 120000
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

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (dataUrl.length > MAX_DATA_URL_LEN) {
        reject(new Error('二维码图片过大，请换一张更小的截图'))
        return
      }
      resolve(dataUrl)
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
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
    const err = new Error(e instanceof Error ? e.message : '保存失败')
    ;(err as Error & { localSaved?: boolean }).localSaved = true
    throw err
  }
}
