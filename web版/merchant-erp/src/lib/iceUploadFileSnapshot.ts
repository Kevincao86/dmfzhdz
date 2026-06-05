/** 将 input / 拖拽得到的 File 读入内存，避免清空 file input 后 Chrome 无法再读 File。 */

function guessUploadMime(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.(jpe?g|heic)$/i.test(name)) return 'image/jpeg'
  if (/\.(mp4|m4v)$/i.test(name)) return 'video/mp4'
  if (/\.mov$/i.test(name)) return 'video/quicktime'
  if (/\.webm$/i.test(name)) return 'video/webm'
  return 'application/octet-stream'
}

export async function snapshotUploadFiles(files: FileList | File[] | null): Promise<File[]> {
  if (!files?.length) return []
  // 立即脱离 input FileList，避免清空 value 后 Chrome 无法 arrayBuffer
  const list = Array.from(files)
  const out: File[] = []
  for (const raw of list) {
    let buf: ArrayBuffer
    try {
      buf = await raw.arrayBuffer()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        msg.includes('could not be read')
          ? '浏览器无法读取所选文件，请重新选择（勿在选图后移动/删除原文件）'
          : msg || '读取文件失败',
      )
    }
    const type = raw.type?.trim() || guessUploadMime(raw.name)
    out.push(new File([buf], raw.name, { type, lastModified: raw.lastModified }))
  }
  return out
}
