import { useState } from 'react'
import type { EnrichedApplicantRow } from '../../lib/mpSync/applicationDisplay'
import { videoStatusLabel } from '../../lib/mpSync/recruitmentVideo'
import {
  isExternalPublishPageUrl,
  toPlayableRecruitmentVideoUrl,
} from '@merchant/lib/mpRecruitmentVideoPlayUrl'

type Props = {
  applicant: EnrichedApplicantRow
  platform?: string
  showPublishLink?: boolean
  /** 已完成订单已选达人：无数据时也展示占位说明 */
  forceShow?: boolean
}

function publishToneClass(tone?: string): string {
  if (tone === 'completed' || tone === 'passed') return 'bg-emerald-500/10 text-emerald-700'
  if (tone === 'rejected') return 'bg-red-500/10 text-red-700'
  if (tone === 'pending') return 'bg-amber-500/10 text-amber-800'
  return 'bg-slate-100 text-slate-600'
}

export default function ApplicantVisitDeliverablePanel({
  applicant,
  platform,
  showPublishLink = true,
  forceShow = false,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const rawVideoUrl = String(applicant.visitVideoUrl || applicant.videoUrl || '').trim()
  const isPublishPage = isExternalPublishPageUrl(rawVideoUrl)
  const videoUrl = isPublishPage ? '' : toPlayableRecruitmentVideoUrl(rawVideoUrl)
  const publishUrl = String(
    applicant.visitPublishUrl || applicant.douyinPublishUrl || (isPublishPage ? rawVideoUrl : ''),
  ).trim()
  const videoStatus = String(applicant.videoStatus || '').trim()
  const hasVideo = !!videoUrl
  const hasPublish = showPublishLink && (!!publishUrl || videoStatus === 'passed')

  if (!hasVideo && !hasPublish) {
    if (!forceShow) return null
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-[var(--shell-muted)]">
        <span className="font-semibold text-slate-700">履约交付</span>
        <p className="mt-1">成片：未上传 · 发布链接：待回传</p>
      </div>
    )
  }

  async function onDownloadVideo() {
    if (!videoUrl || downloading) return
    setDownloading(true)
    const fileName = `${String(applicant.displayName || '探店成片')}.mp4`.replace(/[/\\?%*:|"<>]/g, '_')
    try {
      const res = await fetch(videoUrl)
      if (!res.ok) throw new Error(`下载失败 ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      const a = document.createElement('a')
      a.href = videoUrl
      a.download = fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-200/70 bg-violet-50/30 p-3 space-y-3 text-sm">
      <div className="text-xs font-semibold text-violet-900">履约交付</div>

      {hasVideo ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--shell-muted)]">探店成片</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                videoStatus === 'passed'
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : videoStatus === 'rejected'
                    ? 'bg-red-500/10 text-red-700'
                    : 'bg-amber-500/10 text-amber-800'
              }`}
            >
              {videoStatusLabel(videoStatus) || String(applicant.videoUploadLabel || '已上传')}
            </span>
            {applicant.videoSubmittedAt ? (
              <span className="text-xs text-[var(--shell-muted)]">提交于 {String(applicant.videoSubmittedAt)}</span>
            ) : null}
          </div>
          {applicant.videoRejectReason && videoStatus === 'rejected' ? (
            <p className="text-xs text-red-600 rounded-lg bg-red-50 px-2 py-1.5">
              驳回原因：{String(applicant.videoRejectReason)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                previewOpen
                  ? 'border-violet-500 bg-violet-600 text-white'
                  : 'border-violet-400 text-violet-700 hover:bg-violet-100'
              }`}
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {previewOpen ? '收起预览' : '播放视频'}
            </button>
            <button
              type="button"
              disabled={downloading}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-white disabled:opacity-60"
              onClick={() => void onDownloadVideo()}
            >
              {downloading ? '下载中…' : '下载成片'}
            </button>
          </div>
          {previewOpen ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[360px] rounded-lg bg-black"
            />
          ) : null}
        </div>
      ) : null}

      {hasPublish ? (
        <div className="space-y-2 border-t border-violet-200/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--shell-muted)]">平台发布链接</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${publishToneClass(String(applicant.publishLinkTone || ''))}`}>
              {String(applicant.publishLinkLabel || '—')}
            </span>
            {platform ? <span className="text-xs text-[var(--shell-muted)]">{platform}</span> : null}
          </div>
          {publishUrl ? (
            <div className="text-xs break-all">
              <a href={publishUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {publishUrl}
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--shell-muted)]">达人尚未回传作品链接</p>
          )}
          {applicant.publishLinkNote ? (
            <p className="text-xs text-[var(--shell-muted)]">核查说明：{String(applicant.publishLinkNote)}</p>
          ) : null}
          {applicant.orderCompletedAt ? (
            <p className="text-xs text-emerald-700">订单已于 {String(applicant.orderCompletedAt)} 完结</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
