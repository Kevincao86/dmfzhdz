/** 与 web版/merchant-erp/src/lib/recruitmentVideoLimits.ts 保持同步 */
export const RECRUITMENT_VIDEO_MAX_DURATION_SEC = 180
export const RECRUITMENT_VIDEO_BASE64_MAX_BYTES = 38 * 1024 * 1024
export const RECRUITMENT_VIDEO_OSS_MAX_BYTES = 200 * 1024 * 1024

export function recruitmentVideoDurationError(durationSec: number): string | null {
  const d = Number(durationSec) || 0
  if (d <= 0) return null
  if (d > RECRUITMENT_VIDEO_MAX_DURATION_SEC) {
    return `视频时长超过 ${RECRUITMENT_VIDEO_MAX_DURATION_SEC} 秒（3 分钟），请剪辑后重试`
  }
  return null
}

export function recruitmentVideoSizeError(sizeBytes: number): string | null {
  const n = Number(sizeBytes) || 0
  if (n <= 0) return '视频文件无效'
  if (n > RECRUITMENT_VIDEO_OSS_MAX_BYTES) {
    return `视频超过 ${Math.floor(RECRUITMENT_VIDEO_OSS_MAX_BYTES / (1024 * 1024))}MB，请压缩后重试`
  }
  return null
}

export function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }
    video.onloadedmetadata = () => {
      const d = Number(video.duration)
      cleanup()
      resolve(Number.isFinite(d) ? d : 0)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('无法读取视频时长'))
    }
    video.src = url
  })
}

export async function assertRecruitmentVideoFile(file: File): Promise<void> {
  const sizeErr = recruitmentVideoSizeError(file.size)
  if (sizeErr) throw new Error(sizeErr)
  try {
    const duration = await readVideoDurationSeconds(file)
    const durationErr = recruitmentVideoDurationError(duration)
    if (durationErr) throw new Error(durationErr)
  } catch (e) {
    if (e instanceof Error && /超过|3 分钟/.test(e.message)) throw e
  }
}
