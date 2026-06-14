import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clearMpRegistryCache, fetchMpRegistry } from '../lib/mpApi'
import { isIceMpOrder } from '../lib/mpRecruitment/orderCard'
import { buildMpOrderHeroMeta } from '../lib/mpSync/mpOrderHeroMeta'
import VisitSchedulePrPanel from '../components/mp/VisitSchedulePrPanel'
import PageHero from '../components/ui/PageHero'

export default function PrOrderSchedulePage() {
  const { id: mpOrderId = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [storeName, setStoreName] = useState('')
  const [category, setCategory] = useState('')
  const [selectedApplicants, setSelectedApplicants] = useState<Record<string, unknown>[]>([])

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
      if (!pool.length) setErr('请先在报名管理中确认选择并通知达人')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mpOrderId])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  function onSaved() {
    clearMpRegistryCache()
    void loadOrder()
  }

  return (
    <div className="page-content-shell page-content-shell--wide">
      <PageHero title="探店排期" subtitle={title || mpOrderId}>
        <Link
          to="/orders?tab=pending_schedule"
          className="inline-flex items-center px-4 py-2 rounded-xl border border-[var(--shell-border)] text-sm"
        >
          返回待排期
        </Link>
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
            selectedApplicants={selectedApplicants}
            onSaved={onSaved}
          />
        </div>
      ) : null}
    </div>
  )
}
