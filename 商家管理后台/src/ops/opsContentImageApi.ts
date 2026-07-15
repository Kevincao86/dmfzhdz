import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

export async function uploadOpsContentImage(file: File): Promise<
  | { ok: true; imageUrl: string; mediaType: 'image' | 'video' }
  | { ok: false; error: string; detail?: string }
> {
  const contentBase64 = await fileToBase64(file)
  const guessedType =
    file.type ||
    (/\.(mp4|webm|mov|m4v)$/i.test(file.name)
      ? 'video/mp4'
      : /\.gif$/i.test(file.name)
        ? 'image/gif'
        : 'image/jpeg')
  const res = await fetchOpsErpApi('/api/meoo-ops-content-image-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: guessedType,
      contentBase64,
    }),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'upload_failed'),
      detail: typeof data.detail === 'string' ? data.detail : text.slice(0, 200),
    }
  }
  const imageUrl = String(data.imageUrl ?? '').trim()
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, error: 'invalid_image_url' }
  }
  const mediaType = data.mediaType === 'video' || /^video\//i.test(guessedType) ? 'video' : 'image'
  return { ok: true, imageUrl, mediaType }
}
