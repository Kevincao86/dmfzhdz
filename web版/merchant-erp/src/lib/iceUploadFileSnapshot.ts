/** 将 input / 拖拽得到的 File 读入内存，避免清空 file input 后 Chrome 无法再读 File。 */

const UPLOAD_IMAGE_EXT =
  /\.(jpe?g|png|webp|gif|bmp|heic|avif|tiff?|svg)$/i

/** 根据文件名 / 浏览器声明推断上传 MIME（云剪 OSS Content-Type） */
export function guessUploadImageMime(name: string, declaredType?: string): string {
  const t = declaredType?.trim().toLowerCase()
  if (t && t.startsWith('image/')) return t
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.bmp$/i.test(name)) return 'image/bmp'
  if (/\.avif$/i.test(name)) return 'image/avif'
  if (/\.(tiff?|tif)$/i.test(name)) return 'image/tiff'
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.(jpe?g|heic)$/i.test(name)) return 'image/jpeg'
  return 'application/octet-stream'
}

function guessUploadMime(name: string, declaredType?: string): string {
  const t = declaredType?.trim().toLowerCase()
  if (t) return t
  const image = guessUploadImageMime(name)
  if (image.startsWith('image/')) return image
  if (/\.(mp4|m4v)$/i.test(name)) return 'video/mp4'
  if (/\.mov$/i.test(name)) return 'video/quicktime'
  if (/\.webm$/i.test(name)) return 'video/webm'
  if (/\.(avi|mkv)$/i.test(name)) return 'video/x-msvideo'
  return 'application/octet-stream'
}

export function isUploadImageFile(file: File): boolean {
  const t = file.type?.trim().toLowerCase()
  if (t.startsWith('image/')) return true
  return UPLOAD_IMAGE_EXT.test(file.name)
}

async function readFileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result)
          else reject(new Error('读取文件失败'))
        }
        reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
        reader.readAsArrayBuffer(file)
      })
    } catch {
      throw new Error(
        msg.includes('could not be read')
          ? '浏览器无法读取所选文件，请重新选择（勿在选图后移动/删除原文件）'
          : msg || '读取文件失败',
      )
    }
  }
}

export async function snapshotUploadFiles(files: FileList | File[] | null): Promise<File[]> {
  if (!files?.length) return []
  const list = Array.from(files)
  const out: File[] = []
  for (const raw of list) {
    const buf = await readFileToArrayBuffer(raw)
    const type = guessUploadMime(raw.name, raw.type)
    out.push(new File([buf], raw.name, { type, lastModified: raw.lastModified }))
  }
  return out
}
