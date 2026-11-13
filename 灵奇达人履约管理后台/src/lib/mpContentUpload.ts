import { apiUrl } from './mpApiBase'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export async function uploadContentImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('请上传 PNG、JPG 或 WebP 图片')
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('图片请小于 5MB')
  const res = await fetch(apiUrl('/api/meoo-ops-content-image-upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name || `image-${Date.now()}.jpg`,
      contentType: file.type || 'image/jpeg',
      contentBase64: await fileToBase64(file),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; imageUrl?: string; detail?: string; error?: string }
  const imageUrl = String(data.imageUrl || '').trim()
  if (!res.ok || data.ok === false || !/^https:\/\//i.test(imageUrl)) {
    throw new Error(String(data.detail || data.error || '图片上传失败'))
  }
  return imageUrl
}

export async function uploadContentVideo(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('视频请小于 20MB')
  const res = await fetch(apiUrl('/api/meoo-ops-mp-order-group-chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload_media',
      fileName: file.name || `video-${Date.now()}.mp4`,
      contentType: file.type || 'video/mp4',
      contentBase64: await fileToBase64(file),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; mediaUrl?: string; message?: string; error?: string }
  const mediaUrl = String(data.mediaUrl || '').trim()
  if (!res.ok || data.ok === false || !/^https:\/\//i.test(mediaUrl)) {
    throw new Error(String(data.message || data.error || '视频上传失败'))
  }
  return mediaUrl
}
