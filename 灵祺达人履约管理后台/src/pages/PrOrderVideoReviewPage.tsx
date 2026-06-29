import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry, clearMpRegistryCache } from '../lib/mpApi'
import { isIceMpOrder } from '../lib/mpRecruitment/orderCard'
import { reviewRecruitmentVideo, videoStatusLabel } from '../lib/mpSync/recruitmentVideo'
import {
  checkVideoCompliance,
  formatInlineStatus,
  getCheckingInlineStatus,
  type VideoAiInlineStatus,
} from '../lib/mpSync/recruitmentVideoAiCompliance'
import { isApplicantVideoVisibleOnPrReview, applicantVideoStatusRaw } from '../lib/mpRecruitment/prOrderVideoCounts'
import { buildApplicantTalentMeta, enrichApplicantRow } from '../lib/mpSync/applicationDisplay'
import type { MpRegistry } from '../lib/mpRecruitment/types'
import PageHero from '../components/ui/PageHero'
import PrLinkeSettlementBanner from '../components/mp/PrLinkeSettlementBanner'
import { maybeFlagPrLinkeSettlementReminder } from '../lib/mpSync/prDouyinCpsSync'
import type { RecruitmentCpsLinkage } from '@merchant/lib/opsRegistryTypes'
import {
  createVideoReviewShareLink,
  fetchVideoReviewShareFeedback,
  formatShareTimeLabel,
  revokeVideoReviewShareLink,
  type ShareAnnotation,
} from '../lib/videoReviewShare'

type VideoCard = {
  id: string
  displayName: string
  talentMeta: string
  videoUrl: string
  isIceLink: boolean
  videoStatus: string
  videoRejectReason?: string
  videoSubmittedAt?: string
  videoSubmitCount?: number
  publishUrl?: string
  publishLinkLabel?: string
  publishLinkTone?: string
  publishLinkNote?: string
  orderCompletedAt?: string
  aiCheckStatusText?: string
  aiCheckStatusTone?: VideoAiInlineStatus['tone']
  shareFeedback?: ShareAnnotation[]
}

type OrderContext = {
  mpOrderId: string
  platform: string
  orderTitle: string
  recruitmentInfo: string
  merchantRequirements: string
  taskDetail: string
  category: string
  region: string
}

function submitCountLabel(count?: number): string {
  const n = Math.max(1, Number(count || 0) || 1)
  return `第 ${n} 次提交`
}

export default function PrOrderVideoReviewPage() {
  const { id: mpOrderId = '' } = useParams()
  const [search] = useSearchParams()
  const fromCompleted = search.get('from') === 'completed'
  const [title, setTitle] = useState('')
  const [isIceOrder, setIsIceOrder] = useState(false)
  const [cards, setCards] = useState<VideoCard[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [rejectModal, setRejectModal] = useState<VideoCard | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [previewId, setPreviewId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState('')
  const [cpsLinkage, setCpsLinkage] = useState<RecruitmentCpsLinkage | null>(null)
  const [orderContext, setOrderContext] = useState<OrderContext | null>(null)
  const [aiCheckBusyId, setAiCheckBusyId] = useState('')
  const [batchAiCheckBusy, setBatchAiCheckBusy] = useState(false)
  const [aiCheckStatusMap, setAiCheckStatusMap] = useState<Record<string, VideoAiInlineStatus>>({})
  const [shareUrl, setShareUrl] = useState('')
  const [shareExpiresAt, setShareExpiresAt] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareFeedbackMap, setShareFeedbackMap] = useState<Record<string, ShareAnnotation[]>>({})

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!mpOrderId) return
    const silent = !!opts?.silent
    if (!silent) setLoading(true)
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId], includePrOwned: true })
      const regTyped = reg as MpRegistry
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
        string,
        unknown
      >[]
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId)
      const ice = mp ? isIceMpOrder(mp) : false
      setTitle(String(mp?.title || mpOrderId))
      setIsIceOrder(ice)
      setCpsLinkage((mp?.cpsLinkage as RecruitmentCpsLinkage | undefined) ?? null)
      if (mp) {
        setOrderContext({
          mpOrderId,
          platform: String(mp.platform || '抖音'),
          orderTitle: String(mp.title || mpOrderId),
          recruitmentInfo: String(mp.recruitmentInfo || mp.taskDetail || ''),
          merchantRequirements: String(mp.merchantRequirements || ''),
          taskDetail: String(mp.taskDetail || ''),
          category: String(mp.category || ''),
          region: String(mp.region || ''),
        })
      } else {
        setOrderContext(null)
      }
      const applicants = Array.isArray(mp?.applicants) ? (mp!.applicants as Record<string, unknown>[]) : []
      if (mp) {
        void maybeFlagPrLinkeSettlementReminder(mp, applicants).then((flagged) => {
          if (flagged) void load({ silent: true })
        })
      }
      const rows: VideoCard[] = applicants
        .filter((a) => {
          if (!a) return false
          return isApplicantVideoVisibleOnPrReview(a, ice)
        })
        .map((a, i) => {
          const enriched = enrichApplicantRow(a, i, regTyped)
          const visitVideoUrl = String(a.videoUrl || '').trim()
          const url = ice
            ? String(a.videoUrl || a.douyinPublishUrl || '').trim()
            : visitVideoUrl
          const isIceLink = ice && !!String(a.douyinPublishUrl || '').trim()
          const rawStatus = applicantVideoStatusRaw(a)
          const videoStatus = rawStatus || 'pending'
          return {
            id: String(a.id || ''),
            displayName: enriched.displayName,
            talentMeta: buildApplicantTalentMeta(enriched),
            videoUrl: url,
            isIceLink,
            videoStatus,
            videoRejectReason: a.videoRejectReason ? String(a.videoRejectReason) : undefined,
            videoSubmittedAt: a.videoSubmittedAt ? String(a.videoSubmittedAt) : undefined,
            videoSubmitCount: a.videoSubmitCount != null ? Number(a.videoSubmitCount) : undefined,
            publishUrl: enriched.visitPublishUrl,
            publishLinkLabel: enriched.publishLinkLabel,
            publishLinkTone: enriched.publishLinkTone,
            publishLinkNote: enriched.publishLinkNote,
            orderCompletedAt: enriched.orderCompletedAt,
          }
        })
      setCards(rows)
      setPreviewId((prev) => {
        if (!prev || !rows.some((r) => r.id === prev)) return ''
        return prev
      })
    } catch {
      setCards([])
      setPreviewId('')
      setPreviewOpen(false)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [mpOrderId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load({ silent: true }), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const loadShareFeedback = useCallback(async () => {
    if (!mpOrderId || fromCompleted) return
    try {
      const fb = await fetchVideoReviewShareFeedback(mpOrderId)
      const map: Record<string, ShareAnnotation[]> = {}
      for (const a of fb.annotations) {
        if (!map[a.applicantId]) map[a.applicantId] = []
        map[a.applicantId].push(a)
      }
      setShareFeedbackMap(map)
      if (fb.shareUrl) setShareUrl(fb.shareUrl)
      if (fb.expiresAt) setShareExpiresAt(fb.expiresAt)
    } catch {
      /* 表未迁移时忽略 */
    }
  }, [mpOrderId, fromCompleted])

  useEffect(() => {
    void loadShareFeedback()
    const t = window.setInterval(() => void loadShareFeedback(), 10000)
    return () => window.clearInterval(t)
  }, [loadShareFeedback])

  async function onCreateShare() {
    if (!mpOrderId || shareBusy || fromCompleted) return
    setShareBusy(true)
    try {
      const r = await createVideoReviewShareLink(mpOrderId)
      setShareUrl(r.shareUrl)
      setShareExpiresAt(r.expiresAt)
      await navigator.clipboard.writeText(r.shareUrl)
      window.alert('分享链接已复制到剪贴板')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '生成失败')
    } finally {
      setShareBusy(false)
    }
  }

  async function onRevokeShare() {
    if (!mpOrderId || shareBusy) return
    setShareBusy(true)
    try {
      await revokeVideoReviewShareLink(mpOrderId)
      setShareUrl('')
      setShareExpiresAt('')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setShareBusy(false)
    }
  }

  const stats = useMemo(() => {
    return {
      pending: cards.filter((c) => c.videoStatus === 'pending').length,
      passed: cards.filter((c) => c.videoStatus === 'passed').length,
      rejected: cards.filter((c) => c.videoStatus === 'rejected').length,
      total: cards.length,
    }
  }, [cards])

  const displayCards = useMemo(
    () =>
      cards.map((c) => {
        const st = aiCheckStatusMap[c.id]
        const base = st ? { ...c, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : c
        return { ...base, shareFeedback: shareFeedbackMap[c.id] ?? [] }
      }),
    [cards, aiCheckStatusMap, shareFeedbackMap],
  )

  const batchAiTargets = useMemo(
    () =>
      displayCards.filter(
        (c) => c.videoStatus === 'pending' && !c.isIceLink && !!String(c.videoUrl || '').trim(),
      ),
    [displayCards],
  )

  const previewCard = useMemo(() => displayCards.find((c) => c.id === previewId) || null, [displayCards, previewId])

  function updateCardAiStatus(cardId: string, status: VideoAiInlineStatus) {
    setAiCheckStatusMap((prev) => ({ ...prev, [cardId]: status }))
  }

  async function runAiCheckForCard(card: VideoCard) {
    if (!orderContext || card.isIceLink || !card.videoUrl) return
    updateCardAiStatus(card.id, getCheckingInlineStatus())
    try {
      const res = await checkVideoCompliance({
        mpOrderId: orderContext.mpOrderId,
        applicantId: card.id,
        platform: orderContext.platform,
        orderTitle: orderContext.orderTitle,
        recruitmentInfo: orderContext.recruitmentInfo,
        merchantRequirements: orderContext.merchantRequirements,
        taskDetail: orderContext.taskDetail,
        category: orderContext.category,
        region: orderContext.region,
        applicantName: card.displayName,
        videoUrl: card.videoUrl,
        douyinPublishUrl: card.publishUrl || '',
      })
      updateCardAiStatus(card.id, formatInlineStatus(res))
    } catch (e) {
      updateCardAiStatus(card.id, { text: '', tone: '' })
      throw e
    }
  }

  async function onAiCheck(card: VideoCard) {
    if (aiCheckBusyId || batchAiCheckBusy || card.isIceLink) return
    setAiCheckBusyId(card.id)
    try {
      await runAiCheckForCard(card)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'AI 检核失败')
    } finally {
      setAiCheckBusyId('')
    }
  }

  async function onBatchAiCheck() {
    if (batchAiCheckBusy || aiCheckBusyId || !batchAiTargets.length) return
    setBatchAiCheckBusy(true)
    let failed = 0
    try {
      for (const card of batchAiTargets) {
        setAiCheckBusyId(card.id)
        try {
          await runAiCheckForCard(card)
        } catch {
          failed += 1
        }
      }
      if (failed > 0) {
        window.alert(`批量检核完成，${failed} 条失败，请稍后重试单条检核`)
      }
    } finally {
      setAiCheckBusyId('')
      setBatchAiCheckBusy(false)
    }
  }

  function openPreview(card: VideoCard) {
    if (card.isIceLink) {
      window.open(card.videoUrl, '_blank', 'noopener,noreferrer')
      return
    }
    setPreviewId(card.id)
    setPreviewOpen(true)
  }

  async function onDownloadVideo(card: VideoCard) {
    if (!card.videoUrl || downloadingId || card.isIceLink) return
    setDownloadingId(card.id)
    const fileName = `${card.displayName || '探店成片'}.mp4`.replace(/[/\\?%*:|"<>]/g, '_')
    try {
      const res = await fetch(card.videoUrl)
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
      a.href = card.videoUrl
      a.download = fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    } finally {
      setDownloadingId('')
    }
  }

  async function onPass(card: VideoCard) {
    if (!mpOrderId || busyId) return
    setBusyId(card.id)
    try {
      await reviewRecruitmentVideo(mpOrderId, card.id, 'pass')
      clearMpRegistryCache()
      await load()
      window.alert('已通过审核')
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
      clearMpRegistryCache()
      await load()
      window.alert('已驳回')
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusyId('')
    }
  }

  const reviewLabel = isIceOrder ? '链接审核' : '视频审核'
  const itemLabel = isIceOrder ? '链接' : '视频'

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <PageHero
        title={reviewLabel}
        subtitle={
          isIceOrder
            ? `云剪单「${title}」的达人抖音链接审核，通过或驳回后将自动通知达人。`
            : `招募单「${title}」的达人成片审核，通过或驳回后将自动通知达人、拍摄与剪辑。`
        }
        badge={`${stats.total} 条${itemLabel}`}
      >
        <Link
          to={fromCompleted ? '/orders?tab=completed' : '/orders?tab=pending_video_review'}
          className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
        >
          {fromCompleted ? '返回已完成' : '返回待视频审核'}
        </Link>
        {!isIceOrder && batchAiTargets.length > 0 && !fromCompleted ? (
          <button
            type="button"
            disabled={batchAiCheckBusy || !!aiCheckBusyId}
            className="inline-flex items-center px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            onClick={() => void onBatchAiCheck()}
          >
            {batchAiCheckBusy ? '批量检核中…' : `AI批量检核（${batchAiTargets.length}）`}
          </button>
        ) : null}
      </PageHero>

      <PrLinkeSettlementBanner
        mpOrderId={mpOrderId}
        cpsLinkage={cpsLinkage}
        onUpdated={() => void load({ silent: true })}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '待审核', v: stats.pending },
          { label: '已通过', v: stats.passed },
          { label: '已驳回', v: stats.rejected },
          { label: `总${itemLabel}`, v: stats.total },
        ].map((x) => (
          <div key={x.label} className="surface-card rounded-xl border p-3 text-center">
            <div className="text-xs text-[var(--shell-muted)]">{x.label}</div>
            <div className="text-xl font-bold mt-1">{x.v}</div>
          </div>
        ))}
      </div>

      {!isIceOrder && !fromCompleted ? (
        <div className="surface-card rounded-xl border border-sky-500/30 bg-sky-50/50 p-4 space-y-2">
          <div className="text-sm font-semibold text-sky-900">分享审片</div>
          <p className="text-xs text-sky-800/80">生成外链供客户/协作方标注问题，无需登录</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={shareBusy}
              className="text-sm px-3 py-1.5 rounded-lg bg-sky-600 text-white disabled:opacity-60"
              onClick={() => void onCreateShare()}
            >
              {shareBusy ? '处理中…' : shareUrl ? '复制分享链接' : '生成分享链接'}
            </button>
            {shareUrl ? (
              <button
                type="button"
                disabled={shareBusy}
                className="text-sm px-3 py-1.5 rounded-lg border border-sky-300 text-sky-800"
                onClick={() => void onRevokeShare()}
              >
                失效链接
              </button>
            ) : null}
          </div>
          {shareUrl ? (
            <p className="text-xs break-all text-sky-900/70">
              {shareUrl}
              {shareExpiresAt ? ` · 有效至 ${shareExpiresAt.slice(0, 10)}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-[1.25rem]">
        {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}
      </div>

      {!loading && !cards.length ? (
        <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
          {isIceOrder
            ? '暂无达人提交链接。达人可在商单详情中提交抖音作品链接。'
            : '暂无达人上传视频。达人可在「我的报名」中点击「上传视频」提交成片。'}
        </div>
      ) : null}

      {cards.length ? (
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className={`min-w-0 space-y-3 ${previewOpen ? 'lg:flex-1' : 'w-full'}`}>
            {displayCards.map((c) => (
              <article
                key={c.id}
                className={`surface-card rounded-xl border p-4 ${
                  previewOpen && previewId === c.id ? 'border-violet-400 ring-1 ring-violet-400/30' : ''
                }`}
              >
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <h3 className="font-semibold">
                      {c.displayName}
                      {c.talentMeta ? (
                        <span className="ml-2 text-xs font-normal text-[var(--shell-muted)]">{c.talentMeta}</span>
                      ) : null}
                    </h3>
                    <p className="text-xs text-[var(--shell-muted)] mt-1">
                      提交于 {c.videoSubmittedAt || '—'}
                      {` · ${submitCountLabel(c.videoSubmitCount)}`}
                      {c.videoStatus ? ` · ${videoStatusLabel(c.videoStatus)}` : ''}
                    </p>
                    {c.isIceLink ? (
                      <p className="text-xs text-violet-600 mt-1 break-all">{c.videoUrl}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {c.aiCheckStatusText ? (
                      <span className={`vr-ai-status vr-ai-status--${c.aiCheckStatusTone || 'checking'}`}>
                        {c.aiCheckStatusText}
                      </span>
                    ) : null}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        c.videoStatus === 'passed'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : c.videoStatus === 'rejected'
                            ? 'bg-red-500/10 text-red-700'
                            : 'bg-amber-500/10 text-amber-700'
                      }`}
                    >
                      {videoStatusLabel(c.videoStatus) || (c.videoStatus === 'pending' ? '待审核' : c.videoStatus)}
                    </span>
                  </div>
                </div>
                {c.videoRejectReason ? (
                  <p className="text-xs text-red-600 mt-2 rounded-lg bg-red-50 px-2 py-1.5">
                    驳回原因：{c.videoRejectReason}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!c.videoUrl}
                    className={`text-sm px-3 py-1.5 rounded-lg border ${
                      previewOpen && previewId === c.id
                        ? 'border-violet-500 bg-violet-600 text-white'
                        : 'border-violet-500/40 text-violet-600 hover:bg-violet-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => openPreview(c)}
                  >
                    {c.isIceLink ? '打开链接' : c.videoUrl ? '视频预览' : '暂无成片'}
                  </button>
                  {!c.isIceLink ? (
                    <button
                      type="button"
                      disabled={downloadingId === c.id}
                      className="text-sm px-3 py-1.5 rounded-lg border border-[var(--shell-border)] text-[var(--shell-muted)] hover:bg-white/5 disabled:opacity-60"
                      onClick={() => void onDownloadVideo(c)}
                    >
                      {downloadingId === c.id ? '下载中…' : '下载'}
                    </button>
                  ) : null}
                  {!c.isIceLink && c.videoStatus === 'pending' && !fromCompleted ? (
                    <button
                      type="button"
                      disabled={aiCheckBusyId === c.id || batchAiCheckBusy}
                      className="text-sm px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      onClick={() => void onAiCheck(c)}
                    >
                      {aiCheckBusyId === c.id ? '检核中…' : 'AI检核'}
                    </button>
                  ) : null}
                </div>
                {c.shareFeedback && c.shareFeedback.length ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs space-y-1.5">
                    <div className="font-semibold text-amber-900">外部分享反馈（{c.shareFeedback.length}）</div>
                    {c.shareFeedback.map((fb) => (
                      <div key={fb.id} className="text-amber-950/90">
                        <span className="font-medium text-amber-800">{fb.visitorName}</span>
                        {fb.frameTimeSec != null ? (
                          <span className="ml-1 text-amber-700">@{formatShareTimeLabel(fb.frameTimeSec)}</span>
                        ) : null}
                        <span className="text-amber-700/70"> · {fb.createdAt.slice(0, 16).replace('T', ' ')}</span>
                        <p className="mt-0.5">{fb.commentText}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                {!isIceOrder && c.videoStatus === 'passed' ? (
                  <div className="mt-3 rounded-lg border border-violet-200/70 bg-violet-50/40 p-3 text-xs space-y-1.5">
                    <div className="font-semibold text-violet-900">平台发布链接</div>
                    <div>
                      状态：
                      <span className="ml-1 font-medium text-violet-800">{c.publishLinkLabel || '待回传'}</span>
                    </div>
                    {c.publishUrl ? (
                      <a href={c.publishUrl} target="_blank" rel="noreferrer" className="text-blue-600 break-all hover:underline">
                        {c.publishUrl}
                      </a>
                    ) : (
                      <p className="text-[var(--shell-muted)]">达人尚未回传作品链接</p>
                    )}
                    {c.publishLinkNote ? <p className="text-[var(--shell-muted)]">核查：{c.publishLinkNote}</p> : null}
                    {c.orderCompletedAt ? (
                      <p className="text-emerald-700">已于 {c.orderCompletedAt} 完结</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {previewOpen && previewCard && !previewCard.isIceLink ? (
            <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[min(100%,400px)] xl:w-[420px]">
              <div className="surface-card rounded-xl border p-4 shadow-lg lg:shadow-none">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--shell-text)]">视频预览</h3>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-[var(--shell-muted)] truncate">
                      {previewCard.displayName}
                      {previewCard.talentMeta ? ` · ${previewCard.talentMeta}` : ''}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-[var(--shell-muted)] hover:text-[var(--shell-text)] px-1.5 py-0.5 rounded border border-[var(--shell-border)]"
                      onClick={() => setPreviewOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/90">
                  <video
                    key={previewCard.videoUrl}
                    src={previewCard.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  >
                    您的浏览器不支持视频播放，请使用「下载」保存后观看。
                  </video>
                </div>
                <p className="mt-2 text-xs text-[var(--shell-muted)]">
                  提交于 {previewCard.videoSubmittedAt || '—'} · {submitCountLabel(previewCard.videoSubmitCount)} ·{' '}
                  {videoStatusLabel(previewCard.videoStatus) || '待审核'}
                </p>
                {previewCard.videoRejectReason ? (
                  <p className="mt-2 text-xs text-red-600 rounded-lg bg-red-50 px-2 py-1.5">
                    驳回原因：{previewCard.videoRejectReason}
                  </p>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      ) : null}

      {rejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-card rounded-xl border p-5 w-full max-w-md shadow-xl">
            <h3 className="font-semibold">
              驳回{rejectModal.isIceLink ? '链接' : '视频'} · {rejectModal.displayName}
            </h3>
            <p className="text-xs text-[var(--shell-muted)] mt-1">
              请填写驳回原因，达人将收到通知并可在「我的报名」{rejectModal.isIceLink ? '重新提交链接' : '重新上传'}。
            </p>
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
