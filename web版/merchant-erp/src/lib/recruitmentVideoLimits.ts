/** 探店成片：最长 3 分钟（Web + 小程序统一） */
export const RECRUITMENT_VIDEO_MAX_DURATION_SEC = 180

/** 经 ECS JSON base64 转存上限（须小于 Nginx erp-api body，base64 约 ×4/3） */
export const RECRUITMENT_VIDEO_BASE64_MAX_BYTES = 38 * 1024 * 1024

/** OSS 直传 / 分片上传单文件上限（对齐云剪 OSS 500MB 桶策略） */
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
