import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { reviewRecruitmentVideo, videoStatusLabel } from '../lib/mpSync/recruitmentVideo'
import PageHero from '../components/ui/PageHero'

type VideoCard = {
  id: string
  displayName: string
  videoUrl: string
  videoStatus: string
  videoRejectReason?: string
  videoSubmittedAt?: string
}

export default function PrOrderVideoReviewPage() {
  const { id: mpOrderId = '' } = useParams()
  const [title, setTitle] = useState('')
  const [cards, setCards] = useState<VideoCard[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [rejectModal, setRejectModal] = useState<VideoCard | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [previewId, setPreviewId] = useState('')

  const load = useCallback(async () => {
    if (!mpOrderId) return
    setLoading(true)
    try {
      const reg = await fetchMpRegistry()
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
        string,
        unknown
      >[]
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId)
      setTitle(String(mp?.title || mpOrderId))
      const applicants = Array.isArray(mp?.applicants) ? (mp!.applicants as Record<string, unknown>[]) : []
      const rows: VideoCard[] = applicants
        .filter((a) => a && String(a.videoUrl || '').trim())
        .map((a) => ({
          id: String(a.id || ''),
          displayName: String(a.platformNickname || a.name || '达人'),
          videoUrl: String(a.videoUrl || ''),
          videoStatus: String(a.videoStatus || 'pending'),
          videoRejectReason: a.videoRejectReason ? String(a.videoRejectReason) : undefined,
          videoSubmittedAt: a.videoSubmittedAt ? String(a.videoSubmittedAt) : undefined,
        }))
      setCards(rows)
      setPreviewId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev
        return rows[0]?.id || ''
      })
    } catch {
      setCards([])
      setPreviewId('')
    } finally {
      setLoading(false)
    }
  }, [mpOrderId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const stats = useMemo(() => {
    return {
      pending: cards.filter((c) => c.videoStatus === 'pending').length,
      passed: cards.filter((c) => c.videoStatus === 'passed').length,
      rejected: cards.filter((c) => c.videoStatus === 'rejected').length,
      total: cards.length,
    }
  }, [cards])

  const previewCard = useMemo(() => cards.find((c) => c.id === previewId) || null, [cards, previewId])

  async function onPass(card: VideoCard) {
    if (!mpOrderId || busyId) return
    setBusyId(card.id)
    try {
      await reviewRecruitmentVideo(mpOrderId, card.id, 'pass')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusyId('')
    }
  }

  async function onRejectConfirm() {
    if (!rejectModal || !mpOrderId || !rejectReason.trim()) return
    setBusyId(rejectModal.id)
    try {
      await reviewRecruitmentVideo(mpOrderId, rejectModal.id, 'reject', rejectReason.trim())
      setRejectModal(null)
      setRejectReason('')
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="max-w-6xl space-y-4">
      <PageHero
        title="视频审核"
        subtitle={`招募单「${title}」的达人成片审核，通过或驳回后将自动通知达人、拍摄与剪辑。`}
        badge={`${stats.total} 条视频`}
      >
        <Link
          to="/orders"
          className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
        >
          返回我的发单
        </Link>
      </PageHero>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '待审核', v: stats.pending },
          { label: '已通过', v: stats.passed },
          { label: '已驳回', v: stats.rejected },
          { label: '总视频', v: stats.total },
        ].map((x) => (
          <div key={x.label} className="surface-card rounded-xl border p-3 text-center">
            <div className="text-xs text-[var(--shell-muted)]">{x.label}</div>
            <div className="text-xl font-bold mt-1">{x.v}</div>
          </div>
        ))}
      </div>

      {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}

      {!loading && !cards.length ? (
        <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
          暂无达人上传视频。达人可在「我的报名」中点击「上传视频」提交成片。
        </div>
      ) : null}

      {cards.length ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            {cards.map((c) => (
              <article
                key={c.id}
                className={`surface-card rounded-xl border p-4 transition-colors ${
                  previewId === c.id ? 'border-violet-400 ring-1 ring-violet-400/30' : ''
                }`}
              >
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <h3 className="font-semibold">{c.displayName}</h3>
                    <p className="text-xs text-[var(--shell-muted)] mt-1">
                      提交于 {c.videoSubmittedAt || '—'}
                      {c.videoStatus ? ` · ${videoStatusLabel(c.videoStatus)}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.videoStatus === 'passed'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : c.videoStatus === 'rejected'
                          ? 'bg-red-500/10 text-red-700'
                          : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    {videoStatusLabel(c.videoStatus) || '待审核'}
                  </span>
                </div>
                {c.videoRejectReason ? (
                  <p className="text-xs text-red-600 mt-2 rounded-lg bg-red-50 px-2 py-1.5">
                    驳回原因：{c.videoRejectReason}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      previewId === c.id
                        ? 'border-violet-500 bg-violet-600 text-white'
                        : 'border-violet-500/40 text-violet-600 hover:bg-violet-50'
                    }`}
                    onClick={() => setPreviewId(c.id)}
                  >
                    视频预览
                  </button>
                  <a
                    href={c.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm px-3 py-1.5 rounded-lg border border-[var(--shell-border)] text-[var(--shell-muted)] hover:bg-white/5"
                  >
                    新窗口打开
                  </a>
                </div>
                {c.videoStatus === 'pending' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                      onClick={() => void onPass(c)}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
                      onClick={() => {
                        setRejectModal(c)
                        setRejectReason('')
                      }}
                    >
                      驳回
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[min(100%,400px)] xl:w-[420px]">
            <div className="surface-card rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--shell-text)]">视频预览</h3>
                {previewCard ? (
                  <span className="text-xs text-[var(--shell-muted)] truncate">{previewCard.displayName}</span>
                ) : null}
              </div>
              {previewCard ? (
                <>
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/90">
                    <video
                      key={previewCard.videoUrl}
                      src={previewCard.videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                    >
                      您的浏览器不支持视频播放，请使用「新窗口打开」。
                    </video>
                  </div>
                  <p className="mt-2 text-xs text-[var(--shell-muted)]">
                    提交于 {previewCard.videoSubmittedAt || '—'} · {videoStatusLabel(previewCard.videoStatus) || '待审核'}
                  </p>
                  {previewCard.videoRejectReason ? (
                    <p className="mt-2 text-xs text-red-600 rounded-lg bg-red-50 px-2 py-1.5">
                      驳回原因：{previewCard.videoRejectReason}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[var(--shell-border)] bg-white/5 px-4 text-center text-sm text-[var(--shell-muted)]">
                  点击左侧「视频预览」在此播放成片
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {rejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-card rounded-xl border p-5 w-full max-w-md shadow-xl">
            <h3 className="font-semibold">驳回视频 · {rejectModal.displayName}</h3>
            <p className="text-xs text-[var(--shell-muted)] mt-1">请填写驳回原因，达人将收到通知并可在「我的报名」重新上传。</p>
            <textarea
              className="mt-3 w-full rounded-lg border panel-input px-3 py-2 text-sm min-h-[96px]"
              placeholder="请输入驳回原因"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-lg border"
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason('')
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || busyId === rejectModal.id}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-60"
                onClick={() => void onRejectConfirm()}
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
