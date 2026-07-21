/**
 * 浏览器安全：探店/云剪成片预览 URL 工具（勿 import 含 Node/OSS SDK 的 core）。
 */

/** 探店成片预览/下载：OSS 公有读直链（去掉 7 天签名，避免过期 403 黑屏） */
export function toPlayableRecruitmentVideoUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return raw
  if (raw.startsWith('oss://')) {
    const rest = raw.slice(6)
    const slash = rest.indexOf('/')
    if (slash > 0) {
      const bucket = rest.slice(0, slash)
      const key = rest.slice(slash + 1)
      const m = bucket.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
      if (m?.[1] && m[2]) {
        return `https://${m[1]}.oss-${m[2]}.aliyuncs.com/${key.replace(/^\/+/, '')}`
      }
    }
  }
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    if (/^([^.]+)\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(u.hostname)) {
      u.protocol = 'https:'
      u.search = ''
      u.hash = ''
      return u.toString()
    }
  } catch {
    /* fall through */
  }
  if (/oss-[a-z0-9-]+\.aliyuncs\.com/i.test(raw)) {
    return raw.split('?')[0]!.split('#')[0]!
  }
  return raw
}

/** 抖音/小红书等页面短链（不可用 video 标签直接播放） */
export function isExternalPublishPageUrl(url: string): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  const bare = toPlayableRecruitmentVideoUrl(raw).split('?')[0] || raw
  if (/\.(mp4|mov|m4v|webm)$/i.test(bare) && /oss-[a-z0-9-]+\.aliyuncs\.com/i.test(bare)) {
    return false
  }
  return /(?:^https?:\/\/)?(?:[\w.-]+\.)?(?:douyin\.com|iesdouyin\.com|xiaohongshu\.com|xhslink\.com|bilibili\.com)\b/i.test(
    raw,
  )
}

/** 云剪「链接审核」：含剪辑回传 editDeliverLinks（历史上只写了 videoUrl） */
export function isApplicantIcePublishLink(
  isIce: boolean,
  applicant: {
    douyinPublishUrl?: string
    videoUrl?: string
    editDeliverLinks?: string[] | null
  } | null | undefined,
): boolean {
  if (!isIce || !applicant) return false
  if (String(applicant.douyinPublishUrl || '').trim()) return true
  const links = Array.isArray(applicant.editDeliverLinks) ? applicant.editDeliverLinks : []
  if (links.some((u) => String(u || '').trim())) return true
  return isExternalPublishPageUrl(String(applicant.videoUrl || ''))
}
