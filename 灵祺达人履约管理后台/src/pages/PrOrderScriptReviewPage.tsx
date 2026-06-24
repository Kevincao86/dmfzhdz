import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry, clearMpRegistryCache } from '../lib/mpApi'
import {
  isApplicantScriptVisibleOnPrReview,
  readScriptTextForAi,
  reviewRecruitmentScript,
  scriptStatusLabel,
  submitCountLabel,
} from '../lib/mpSync/recruitmentScript'
import {
  checkScriptCompliance,
  formatInlineStatus,
  getCheckingInlineStatus,
  type ScriptAiInlineStatus,
} from '../lib/mpSync/recruitmentScriptAiCompliance'
import { buildApplicantTalentMeta, enrichApplicantRow } from '../lib/mpSync/applicationDisplay'
import type { MpRegistry } from '../lib/mpRecruitment/types'
import PageHero from '../components/ui/PageHero'

type ScriptCard = {
  id: string
  displayName: string
  talentMeta: string
  scriptUrl: string
  scriptLinkUrl: string
  scriptFileName: string
  displayLabel: string
  scriptStatus: string
  scriptRejectReason?: string
  scriptSubmittedAt?: string
  scriptSubmitCount?: number
  aiCheckStatusText?: string
  aiCheckStatusTone?: ScriptAiInlineStatus['tone']
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

export default function PrOrderScriptReviewPage() {
  const { id: mpOrderId = '' } = useParams()
  const [search] = useSearchParams()
  const fromCompleted = search.get('from') === 'completed'
  const [title, setTitle] = useState('')
  const [cards, setCards] = useState<ScriptCard[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [rejectModal, setRejectModal] = useState<ScriptCard | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [orderContext, setOrderContext] = useState<OrderContext | null>(null)
  const [aiCheckBusyId, setAiCheckBusyId] = useState('')
  const [batchAiCheckBusy, setBatchAiCheckBusy] = useState(false)
  const [aiCheckStatusMap, setAiCheckStatusMap] = useState<Record<string, ScriptAiInlineStatus>>({})

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
      setTitle(String(mp?.title || mpOrderId))
      if (mp) {
        setOrderContext({
          mpOrderId,
          platform: String(mp.platform || '小红书'),
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
      const rows: ScriptCard[] = applicants
        .filter((a) => isApplicantScriptVisibleOnPrReview(a))
        .map((a, i) => {
          const enriched = enrichApplicantRow(a, i, regTyped)
          const scriptUrl = String(a.scriptUrl || '').trim()
          const scriptLinkUrl = String(a.scriptLinkUrl || '').trim()
          const scriptFileName = String(a.scriptFileName || '').trim()
          const rawStatus = String(a.scriptStatus || '').trim()
          const scriptStatus = rawStatus || 'pending'
          return {
            id: String(a.id || ''),
            displayName: enriched.displayName,
            talentMeta: buildApplicantTalentMeta(enriched),
            scriptUrl,
            scriptLinkUrl,
            scriptFileName,
            displayLabel: scriptLinkUrl ? '文档链接' : scriptFileName || '文稿文件',
            scriptStatus,
            scriptRejectReason: a.scriptRejectReason ? String(a.scriptRejectReason) : undefined,
            scriptSubmittedAt: a.scriptSubmittedAt ? String(a.scriptSubmittedAt) : undefined,
            scriptSubmitCount: a.scriptSubmitCount != null ? Number(a.scriptSubmitCount) : undefined,
          }
        })
      setCards(rows)
    } catch {
      setCards([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [mpOrderId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load({ silent: true }), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const stats = useMemo(
    () => ({
      pending: cards.filter((c) => c.scriptStatus === 'pending').length,
      passed: cards.filter((c) => c.scriptStatus === 'passed').length,
      rejected: cards.filter((c) => c.scriptStatus === 'rejected').length,
      total: cards.length,
    }),
    [cards],
  )

  const displayCards = useMemo(
    () =>
      cards.map((c) => {
        const st = aiCheckStatusMap[c.id]
        return st ? { ...c, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : c
      }),
    [cards, aiCheckStatusMap],
  )

  const batchAiTargets = useMemo(
    () =>
      displayCards.filter(
        (c) => c.scriptStatus === 'pending' && !!(c.scriptUrl || c.scriptLinkUrl),
      ),
    [displayCards],
  )

  function updateCardAiStatus(cardId: string, status: ScriptAiInlineStatus) {
    setAiCheckStatusMap((prev) => ({ ...prev, [cardId]: status }))
  }

  async function runAiCheckForCard(card: ScriptCard) {
    if (!orderContext) return
    updateCardAiStatus(card.id, getCheckingInlineStatus())
    const scriptText = await readScriptTextForAi(card.scriptUrl, card.scriptLinkUrl)
    const res = await checkScriptCompliance({
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
      scriptUrl: card.scriptUrl,
      scriptLinkUrl: card.scriptLinkUrl,
      scriptText,
    })
    updateCardAiStatus(card.id, formatInlineStatus(res))
  }

  async function onAiCheck(card: ScriptCard) {
    if (aiCheckBusyId || batchAiCheckBusy) return
    setAiCheckBusyId(card.id)
    try {
      await runAiCheckForCard(card)
    } catch (e) {
      updateCardAiStatus(card.id, { text: '', tone: '' })
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

  function openScript(card: ScriptCard) {
    const link = card.scriptLinkUrl.trim()
    const file = card.scriptUrl.trim()
    const url = link || file
    if (!url) {
      window.alert('暂无文稿')
      return
    }
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer')
      return
    }
    window.open(file, '_blank', 'noopener,noreferrer')
  }

  async function onPass(card: ScriptCard) {
    if (!mpOrderId || busyId) return
    setBusyId(card.id)
    try {
      await reviewRecruitmentScript(mpOrderId, card.id, 'pass')
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
      await reviewRecruitmentScript(mpOrderId, rejectModal.id, 'reject', rejectReason.trim())
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

  const backHref = fromCompleted
    ? '/orders?tab=completed&platformGroup=script'
    : '/orders?tab=pending_video_review&platformGroup=script'

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <PageHero
        title="文稿审核"
        subtitle={`招募单「${title}」的达人文稿审核，通过或驳回后将自动通知达人。`}
        badge={`${stats.total} 条文稿`}
      >
        <Link
          to={backHref}
          className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
        >
          {fromCompleted ? '返回已完成' : '返回待文稿审核'}
        </Link>
        {batchAiTargets.length > 0 && !fromCompleted ? (
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

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '待审核', v: stats.pending },
          { label: '已通过', v: stats.passed },
          { label: '已驳回', v: stats.rejected },
          { label: '总文稿', v: stats.total },
        ].map((x) => (
          <div key={x.label} className="surface-card rounded-xl border p-3 text-center">
            <div className="text-xs text-[var(--shell-muted)]">{x.label}</div>
            <div className="text-xl font-bold mt-1">{x.v}</div>
          </div>
        ))}
      </div>

      <div className="min-h-[1.25rem]">
        {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}
      </div>

      {!loading && !cards.length ? (
        <div className="surface-card rounded-xl border p-8 text-center text-sm text-[var(--shell-muted)]">
          暂无达人提交文稿。达人可在「我的报名」中上传 doc/txt 或粘贴腾讯文档/飞书链接。
        </div>
      ) : null}

      {cards.length ? (
        <div className="space-y-3">
          {displayCards.map((c) => (
            <article key={c.id} className="surface-card rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div>
                  <h3 className="font-semibold">
                    {c.displayName}
                    {c.talentMeta ? (
                      <span className="ml-2 text-xs font-normal text-[var(--shell-muted)]">{c.talentMeta}</span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">
                    提交于 {c.scriptSubmittedAt || '—'}
                    {` · ${submitCountLabel(c.scriptSubmitCount)}`}
                    {c.scriptStatus ? ` · ${scriptStatusLabel(c.scriptStatus)}` : ''}
                  </p>
                  <p className="text-xs text-violet-600 mt-1 break-all">
                    {c.displayLabel}
                    {c.scriptLinkUrl ? ` · ${c.scriptLinkUrl}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.aiCheckStatusText ? (
                    <span className={`vr-ai-status vr-ai-status--${c.aiCheckStatusTone || 'checking'}`}>
                      {c.aiCheckStatusText}
                    </span>
                  ) : null}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c.scriptStatus === 'passed'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : c.scriptStatus === 'rejected'
                          ? 'bg-red-500/10 text-red-700'
                          : 'bg-amber-500/10 text-amber-700'
                    }`}
                  >
                    {scriptStatusLabel(c.scriptStatus) || (c.scriptStatus === 'pending' ? '待审核' : c.scriptStatus)}
                  </span>
                </div>
              </div>
              {c.scriptRejectReason ? (
                <p className="text-xs text-red-600 mt-2 rounded-lg bg-red-50 px-2 py-1.5">
                  驳回原因：{c.scriptRejectReason}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!c.scriptUrl && !c.scriptLinkUrl}
                  className="text-sm px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                  onClick={() => openScript(c)}
                >
                  {c.scriptLinkUrl ? '打开链接' : c.scriptUrl ? '查看文稿' : '暂无文稿'}
                </button>
                {c.scriptStatus === 'pending' && !fromCompleted ? (
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
              {c.scriptStatus === 'pending' && !fromCompleted ? (
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
      ) : null}

      {rejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="surface-card rounded-xl border p-5 w-full max-w-md shadow-xl">
            <h3 className="font-semibold">驳回文稿 · {rejectModal.displayName}</h3>
            <p className="text-xs text-[var(--shell-muted)] mt-1">
              请填写驳回原因，达人将收到通知并可在「我的报名」重新上传或粘贴链接。
            </p>
            <textarea
              className="mt-3 w-full rounded-lg border panel-input px-3 py-2 text-sm min-h-[96px]"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例如：缺少门店地址、违禁词…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border text-sm"
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
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-60"
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
