import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { clearMpRegistryCache, fetchMpRegistry } from '../lib/mpApi'
import { isIceMpOrder } from '../lib/mpRecruitment/orderCard'
import { buildMpOrderHeroMeta } from '../lib/mpSync/mpOrderHeroMeta'
import { createGroup, getGroup } from '../lib/mpSync/orderGroupChat'
import { isVisitPlanDatesConfirmed } from '../lib/mpSync/visitScheduleRuntime'
import VisitSchedulePrPanel from '../components/mp/VisitSchedulePrPanel'
import PageHero from '../components/ui/PageHero'
import { BtnOutline, BtnPrimary } from '../components/ui/MockupLayouts'

export default function PrOrderSchedulePage() {
  const { id: mpOrderId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isReview = searchParams.get('view') === 'review'
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [storeName, setStoreName] = useState('')
  const [category, setCategory] = useState('')
  const [mpOrder, setMpOrder] = useState<Record<string, unknown> | null>(null)
  const [selectedApplicants, setSelectedApplicants] = useState<Record<string, unknown>[]>([])
  const [orderGroupChatActive, setOrderGroupChatActive] = useState(false)
  const [orderGroupChatClosed, setOrderGroupChatClosed] = useState(false)
  const [orderGroupChatTitle, setOrderGroupChatTitle] = useState('')
  const [orderGroupChatCreating, setOrderGroupChatCreating] = useState(false)

  const syncOrderGroupChatState = useCallback(async () => {
    if (!mpOrderId) return
    try {
      const body = await getGroup(mpOrderId)
      const group = body.group as Record<string, unknown> | undefined
      if (!group) {
        setOrderGroupChatActive(false)
        setOrderGroupChatClosed(false)
        setOrderGroupChatTitle('')
        return
      }
      setOrderGroupChatActive(true)
      setOrderGroupChatClosed(group.status === 'closed')
      setOrderGroupChatTitle(String(group.title || ''))
    } catch {
      setOrderGroupChatActive(false)
      setOrderGroupChatClosed(false)
      setOrderGroupChatTitle('')
    }
  }, [mpOrderId])

  const loadOrder = useCallback(async () => {
    if (!mpOrderId) return
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId] })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = mpList.find(
        (o: Record<string, unknown>) => o && String(o.id) === mpOrderId,
      ) as Record<string, unknown> | undefined
      if (!mp) {
        setErr('招募单不存在或已删除')
        setSelectedApplicants([])
        return
      }
      if (isIceMpOrder(mp)) {
        setErr('云剪任务无需探店排期')
        return
      }
      const hero = buildMpOrderHeroMeta(mp)
      setTitle(String(mp.title || mp.customerName || hero.orderNo || mpOrderId))
      setStoreName(String(mp.storeName || title || '门店'))
      setCategory(String(mp.category || '餐饮美食'))
      setMpOrder(mp)
      const selectedIds = new Set(
        (Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []).map(String),
      )
      const pool = (Array.isArray(mp.applicants) ? mp.applicants : []).filter(
        (a: Record<string, unknown>) =>
          a &&
          (a.prSelected || a.merchantSelected || selectedIds.has(String(a.id))) &&
          a.taskStatus !== 'rejected',
      ) as Record<string, unknown>[]
      setSelectedApplicants(pool)
      await syncOrderGroupChatState()
      if (!pool.length) setErr('请先在报名管理中确认选择并通知达人')
      else if (!isReview && !isVisitPlanDatesConfirmed(mp)) {
        navigate(`/orders/${encodeURIComponent(mpOrderId)}/schedule/dates`, { replace: true })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mpOrderId, isReview, navigate, syncOrderGroupChatState])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  async function onConfirmCreateOrderGroupChat() {
    if (orderGroupChatCreating) return
    const selectedCount = selectedApplicants.length
    if (selectedCount <= 0) {
      window.alert('暂无待排期达人')
      return
    }
    if (orderGroupChatActive) {
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)
      return
    }
    if (!window.confirm(`将为已选 ${selectedCount} 位达人创建小程序商单群。是否确认？`)) return
    setOrderGroupChatCreating(true)
    try {
      const body = await createGroup(mpOrderId)
      const group = body.group as Record<string, unknown> | undefined
      setOrderGroupChatActive(true)
      setOrderGroupChatClosed(false)
      setOrderGroupChatTitle(String(group?.title || ''))
      window.alert(body.existed ? '群已存在' : '商单群已创建')
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '创建失败'))
    } finally {
      setOrderGroupChatCreating(false)
    }
  }

  function onEffectiveSaved(talentCount?: number) {
    if (isReview) {
      clearMpRegistryCache()
      void loadOrder()
      return
    }
    clearMpRegistryCache()
    navigate(`/orders/${encodeURIComponent(mpOrderId)}/schedule/success`, {
      replace: true,
      state: { orderTitle: title, talentCount: talentCount || selectedApplicants.length },
    })
  }

  function onSaved() {
    clearMpRegistryCache()
    void loadOrder()
  }

  const backTab = isReview ? 'pending_video_review' : 'pending_schedule'
  const pageTitle = isReview ? '查看/修改排期' : '探店排期'
  const backLabel = isReview ? '返回待视频审核' : '返回待排期'

  return (
    <div className="page-content-shell page-content-shell--wide">
      <PageHero title={pageTitle} subtitle={title || mpOrderId}>
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            to={
              isReview
                ? `/orders/${encodeURIComponent(mpOrderId)}/schedule/dates?view=review`
                : `/orders/${encodeURIComponent(mpOrderId)}/schedule/dates`
            }
            className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
          >
            {isVisitPlanDatesConfirmed(mpOrder) ? '修改可探店日期' : '设置可探店日期'}
          </Link>
          {!loading && !err && selectedApplicants.length > 0 ? (
            orderGroupChatActive ? (
              <BtnOutline onClick={() => navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)}>
                {orderGroupChatClosed ? '查看商单群' : '进入商单群'}
                {orderGroupChatTitle ? ` · ${orderGroupChatTitle}` : ''}
              </BtnOutline>
            ) : (
              <BtnPrimary disabled={orderGroupChatCreating} onClick={() => void onConfirmCreateOrderGroupChat()}>
                {orderGroupChatCreating ? '拉群中…' : '一键拉群'}
              </BtnPrimary>
            )
          ) : null}
          <Link
            to={`/orders?tab=${backTab}`}
            className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
          >
            {backLabel}
          </Link>
        </div>
      </PageHero>
      {loading ? <p className="hint px-4">加载中…</p> : null}
      {err ? (
        <div className="card mx-4 my-4">
          <p className="hint">{err}</p>
          <Link className="text-sm text-violet-700 font-medium mt-2 inline-block" to={`/orders/${encodeURIComponent(mpOrderId)}/applicants`}>
            前往报名管理
          </Link>
        </div>
      ) : null}
      {!loading && !err && selectedApplicants.length > 0 ? (
        <div className="px-4 pb-8">
          <VisitSchedulePrPanel
            mpOrderId={mpOrderId}
            storeName={storeName}
            category={category}
            orderTitle={title}
            mpOrder={mpOrder}
            selectedApplicants={selectedApplicants}
            onSaved={onSaved}
            onEffectiveSaved={onEffectiveSaved}
            purpose={isReview ? 'review' : 'schedule'}
          />
        </div>
      ) : null}
    </div>
  )
}
