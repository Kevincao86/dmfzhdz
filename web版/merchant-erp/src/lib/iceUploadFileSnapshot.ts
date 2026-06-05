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
  const list = Array.from(files)
  const out: File[] = []
  for (const raw of list) {
    const buf = await raw.arrayBuffer()
    const type = raw.type?.trim() || guessUploadMime(raw.name)
    out.push(new File([buf], raw.name, { type, lastModified: raw.lastModified }))
  }
  return out
}
