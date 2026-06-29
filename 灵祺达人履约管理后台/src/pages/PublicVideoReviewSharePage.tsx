import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
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

export default function PublicVideoReviewSharePage() {
  const { token = '' } = useParams()
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
      if (!activeVideoId && data.videos[0]) setActiveVideoId(data.videos[0].applicantId)
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
    setDraftRect({ x: Math.max(0, Math.min(0.85, x - 0.1)), y: Math.max(0, Math.min(0.85, y - 0.1)), w: 0.2, h: 0.2 })
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-4">
        <p className="text-xs text-sky-400">审片协作 · 只读分享页</p>
        <h1 className="mt-1 text-lg font-semibold">{title || '视频审片'}</h1>
        {expiresAt ? (
          <p className="mt-1 text-xs text-slate-500">有效期至 {expiresAt.slice(0, 10)} · 无需登录即可标注</p>
        ) : null}
        <input
          value={visitorName}
          onChange={(e) => setVisitorName(e.target.value)}
          placeholder="您的昵称（选填）"
          className="mt-3 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {loading && !videos.length ? <p className="text-sm text-slate-400">加载中…</p> : null}
        {err ? <p className="text-sm text-rose-400">{err}</p> : null}

        {videos.map((v) => (
          <section
            key={v.applicantId}
            className={`rounded-xl border p-3 ${activeVideoId === v.applicantId ? 'border-sky-500/50 bg-slate-900' : 'border-slate-800 bg-slate-900/50'}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-medium">{v.displayName}</h2>
              <button
                type="button"
                className="text-xs text-sky-400 hover:underline"
                onClick={() => setActiveVideoId(v.applicantId)}
              >
                {activeVideoId === v.applicantId ? '当前标注' : '切换标注'}
              </button>
            </div>
            <div
              ref={activeVideoId === v.applicantId ? overlayRef : undefined}
              className={`relative aspect-video overflow-hidden rounded-lg bg-black ${activeVideoId === v.applicantId ? 'cursor-crosshair' : ''}`}
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
              <p className="mt-1 text-xs text-slate-500">点击视频画面框选问题区域，再填写说明提交</p>
            ) : null}
            {(annoByVideo[v.applicantId] ?? []).length ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {(annoByVideo[v.applicantId] ?? []).map((a) => (
                  <li key={a.id} className="rounded bg-slate-950/60 px-2 py-1">
                    <span className="text-amber-300">{a.visitorName}</span>
                    {a.frameTimeSec != null ? (
                      <span className="ml-1 text-slate-500">@{formatShareTimeLabel(a.frameTimeSec)}</span>
                    ) : null}
                    ：{a.commentText}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        {activeVideo ? (
          <section className="sticky bottom-0 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-lg">
            <p className="mb-2 text-sm font-medium">添加问题标注 · {activeVideo.displayName}</p>
            <textarea
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value)}
              rows={3}
              placeholder="描述问题点，如：字幕与脚本不符、logo 被裁切…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!draftComment.trim() || submitting}
              onClick={() => void onSubmitAnnotation()}
              className="mt-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? '提交中…' : '提交反馈'}
            </button>
          </section>
        ) : null}
      </main>
    </div>
  )
}
