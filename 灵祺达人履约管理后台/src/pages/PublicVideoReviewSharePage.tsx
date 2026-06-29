import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import PageHero from '../components/ui/PageHero'
import { videoStatusLabel } from '../lib/mpSync/recruitmentVideo'
import {
  addPublicVideoReviewAnnotation,
  fetchPublicVideoReviewShare,
  formatShareTimeLabel,
  type ShareAnnotation,
  type ShareVideo,
} from '../lib/videoReviewShare'

const VISITOR_KEY = 'meoo_vr_share_visitor'

function loadVisitorName(): string {
  try {
    return localStorage.getItem(VISITOR_KEY) || ''
  } catch {
    return ''
  }
}

function saveVisitorName(name: string) {
  try {
    localStorage.setItem(VISITOR_KEY, name)
  } catch {
    /* ignore */
  }
}

function resolveShareToken(params: { token?: string; shareToken?: string }): string {
  return String(params.shareToken || params.token || '').trim()
}

export default function PublicVideoReviewSharePage() {
  const params = useParams()
  const token = resolveShareToken(params)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [videos, setVideos] = useState<ShareVideo[]>([])
  const [annotations, setAnnotations] = useState<ShareAnnotation[]>([])
  const [visitorName, setVisitorName] = useState(loadVisitorName)
  const [activeVideoId, setActiveVideoId] = useState('')
  const [draftComment, setDraftComment] = useState('')
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setErr('')
    try {
      const data = await fetchPublicVideoReviewShare(token)
      setTitle(data.title)
      setExpiresAt(data.expiresAt)
      setVideos(data.videos)
      setAnnotations(data.annotations)
      setActiveVideoId((prev) => prev || data.videos[0]?.applicantId || '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(t)
  }, [load])

  const stats = useMemo(() => {
    const list = videos || []
    return {
      pending: list.filter((v) => v.videoStatus === 'pending').length,
      passed: list.filter((v) => v.videoStatus === 'passed').length,
      rejected: list.filter((v) => v.videoStatus === 'rejected').length,
      total: list.length,
    }
  }, [videos])

  const annoByVideo = useMemo(() => {
    const map: Record<string, ShareAnnotation[]> = {}
    for (const a of annotations) {
      if (!map[a.applicantId]) map[a.applicantId] = []
      map[a.applicantId].push(a)
    }
    return map
  }, [annotations])

  const activeVideo = videos.find((v) => v.applicantId === activeVideoId) ?? videos[0]

  function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!overlayRef.current || !activeVideo) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setDraftRect({
      x: Math.max(0, Math.min(0.85, x - 0.1)),
      y: Math.max(0, Math.min(0.85, y - 0.1)),
      w: 0.2,
      h: 0.2,
    })
  }

  async function onSubmitAnnotation() {
    if (!token || !activeVideo || !draftComment.trim() || submitting) return
    const name = visitorName.trim() || '访客'
    saveVisitorName(name)
    setSubmitting(true)
    try {
      const rect = draftRect ?? { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }
      await addPublicVideoReviewAnnotation({
        token,
        applicantId: activeVideo.applicantId,
        visitorName: name,
        commentText: draftComment.trim(),
        rectX: rect.x,
        rectY: rect.y,
        rectW: rect.w,
        rectH: rect.h,
      })
      setDraftComment('')
      setDraftRect(null)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-[var(--shell-muted)]">
        分享链接无效
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--shell-bg)] text-[var(--shell-fg)]">
      <div className="mx-auto max-w-4xl space-y-4 p-4 pb-24">
        <PageHero
          title="视频审核 · 协作审片"
          subtitle={
            expiresAt
              ? `${title || '招募单审片'} · 无需登录 · 有效至 ${expiresAt.slice(0, 10)}`
              : `${title || '招募单审片'} · 客户/协作方标注，无需登录`
          }
        />

        <div className="surface-card rounded-xl border border-sky-500/30 bg-sky-50/60 p-4">
          <p className="text-sm font-semibold text-sky-900">外部分享审片</p>
          <p className="mt-1 text-xs text-sky-800/80">
            您正在查看 PR 分享的审片页面，可直接预览视频并标注问题，无需注册或登录。
          </p>
          <label className="mt-3 block text-xs text-sky-900/70">
            您的昵称（选填，便于 PR 识别反馈来源）
            <input
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="如：客户张总 / 品牌方"
              className="mt-1 w-full max-w-xs rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: '待审核', v: stats.pending },
            { label: '已通过', v: stats.passed },
            { label: '已驳回', v: stats.rejected },
            { label: '总视频', v: stats.total },
          ].map((x) => (
            <div key={x.label} className="surface-card rounded-xl border p-3 text-center">
              <div className="text-xs text-[var(--shell-muted)]">{x.label}</div>
              <div className="mt-1 text-xl font-bold">{x.v}</div>
            </div>
          ))}
        </div>

        {loading && !videos.length ? (
          <p className="text-sm text-[var(--shell-muted)]">加载中…</p>
        ) : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}

        {!loading && !videos.length && !err ? (
          <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
            暂无可审片视频
          </div>
        ) : null}

        {videos.map((v) => (
          <article
            key={v.applicantId}
            className={`surface-card rounded-xl border p-4 ${
              activeVideoId === v.applicantId ? 'border-violet-400 ring-1 ring-violet-400/30' : ''
            }`}
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{v.displayName}</h3>
                <p className="mt-1 text-xs text-[var(--shell-muted)]">
                  提交于 {v.videoSubmittedAt || '—'} · {videoStatusLabel(v.videoStatus)}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-violet-600 hover:underline"
                onClick={() => setActiveVideoId(v.applicantId)}
              >
                {activeVideoId === v.applicantId ? '当前标注' : '切换标注'}
              </button>
            </div>

            <div
              ref={activeVideoId === v.applicantId ? overlayRef : undefined}
              className={`relative aspect-video overflow-hidden rounded-lg bg-black ${
                activeVideoId === v.applicantId ? 'cursor-crosshair' : ''
              }`}
              onClick={activeVideoId === v.applicantId ? onOverlayClick : undefined}
            >
              <video
                src={v.videoUrl}
                controls
                className="h-full w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              {(annoByVideo[v.applicantId] ?? []).map((a) => (
                <div
                  key={a.id}
                  className="pointer-events-none absolute border-2 border-amber-400/90 bg-amber-400/10"
                  style={{
                    left: `${a.rectX * 100}%`,
                    top: `${a.rectY * 100}%`,
                    width: `${a.rectW * 100}%`,
                    height: `${a.rectH * 100}%`,
                  }}
                  title={a.commentText}
                />
              ))}
              {activeVideoId === v.applicantId && draftRect ? (
                <div
                  className="pointer-events-none absolute border-2 border-sky-400 bg-sky-400/10"
                  style={{
                    left: `${draftRect.x * 100}%`,
                    top: `${draftRect.y * 100}%`,
                    width: `${draftRect.w * 100}%`,
                    height: `${draftRect.h * 100}%`,
                  }}
                />
              ) : null}
            </div>

            {activeVideoId === v.applicantId ? (
              <p className="mt-1 text-xs text-[var(--shell-muted)]">点击画面框选问题区域，在下方填写说明</p>
            ) : null}

            {(annoByVideo[v.applicantId] ?? []).length ? (
              <ul className="mt-3 space-y-1 rounded-lg bg-amber-50/80 p-2 text-xs text-amber-950">
                {(annoByVideo[v.applicantId] ?? []).map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-amber-800">{a.visitorName}</span>
                    {a.frameTimeSec != null ? (
                      <span className="ml-1 text-amber-700">@{formatShareTimeLabel(a.frameTimeSec)}</span>
                    ) : null}
                    ：{a.commentText}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}

        {activeVideo ? (
          <section className="surface-card sticky bottom-4 rounded-xl border border-violet-300/50 p-4 shadow-lg">
            <p className="mb-2 text-sm font-semibold">添加问题标注 · {activeVideo.displayName}</p>
            <textarea
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value)}
              rows={3}
              placeholder="描述问题点，如：字幕与脚本不符、logo 被裁切…"
              className="w-full rounded-lg border border-[var(--shell-border)] bg-[var(--shell-bg)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!draftComment.trim() || submitting}
              onClick={() => void onSubmitAnnotation()}
              className="mt-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? '提交中…' : '提交反馈'}
            </button>
          </section>
        ) : null}
      </div>
    </div>
  )
}
