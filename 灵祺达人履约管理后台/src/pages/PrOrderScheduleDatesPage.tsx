import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { clearMpRegistryCache, fetchMpRegistry } from '../lib/mpApi'
import { isIceMpOrder } from '../lib/mpRecruitment/orderCard'
import { buildMpOrderHeroMeta } from '../lib/mpSync/mpOrderHeroMeta'
import { confirmVisitPlanDates } from '../lib/mpSync/visitScheduleRuntime'
import VisitScheduleDatesEditor, { useVisitScheduleDatesEditor } from '../components/mp/VisitScheduleDatesEditor'
import PageHero from '../components/ui/PageHero'

export default function PrOrderScheduleDatesPage() {
  const { id: mpOrderId = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('餐饮美食')
  const [mp, setMp] = useState<Record<string, unknown> | null>(null)

  const loadOrder = useCallback(async () => {
    if (!mpOrderId) return
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId] })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const order = mpList.find(
        (o: Record<string, unknown>) => o && String(o.id) === mpOrderId,
      ) as Record<string, unknown> | undefined
      if (!order) {
        setErr('招募单不存在或已删除')
        setMp(null)
        return
      }
      if (isIceMpOrder(order)) {
        setErr('云剪任务无需探店排期')
        return
      }
      const hero = buildMpOrderHeroMeta(order)
      setTitle(String(order.title || order.customerName || hero.orderNo || mpOrderId))
      setCategory(String(order.category || '餐饮美食'))
      setMp(order)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mpOrderId])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  const editor = useVisitScheduleDatesEditor({ mp, category })

  async function onConfirm() {
    if (!mpOrderId || busy) return
    if (!editor.visitPlanRows.length) {
      editor.setHint('请至少设置一天可探店时段')
      return
    }
    setBusy(true)
    editor.setHint('')
    try {
      await confirmVisitPlanDates(mpOrderId, {
        visitPlanDates: editor.visitPlanRows,
        category,
      })
      clearMpRegistryCache()
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/schedule`, { replace: true })
    } catch (e) {
      editor.setHint(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--wide">
      <PageHero title="可探店日期" subtitle={title || mpOrderId}>
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
        </div>
      ) : null}
      {!loading && !err ? (
        <div className="px-4 pb-8 space-y-4">
          <p className="text-sm text-[var(--shell-muted)]">
            请先确认 PR 可接待探店的日期与时段；保存后达人可在报名详情中选择对应日期提交探店意向，再进入下一步拖拽排期。
          </p>
          <VisitScheduleDatesEditor category={category} editor={editor} />
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm disabled:opacity-60"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? '保存中…' : '确认并进入排期'}
            </button>
            <Link
              to={`/orders/${encodeURIComponent(mpOrderId)}/applicants`}
              className="px-4 py-2 rounded-xl border text-sm"
            >
              返回报名管理
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
