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

  const load = useCallback(async () => {
    if (!mpOrderId) return
    setLoading(true)
    try {
      const reg = await fetchMpRegistry()
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && (o as Record<string, unknown>).id === mpOrderId) as
        | Record<string, unknown>
        | undefined
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
    } catch {
      setCards([])
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
    <div className="max-w-4xl space-y-4">
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

      <div className="space-y-3">
        {cards.map((c) => (
          <article key={c.id} className="surface-card rounded-xl border p-4">
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
              <p className="text-xs text-red-600 mt-2 rounded-lg bg-red-50 px-2 py-1.5">驳回原因：{c.videoRejectReason}</p>
            ) : null}
            <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-600 underline mt-2 inline-block">
              打开视频
            </a>
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
