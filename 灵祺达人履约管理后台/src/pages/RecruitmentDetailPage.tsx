import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { hasAppliedToOrder } from '../lib/mpSync/applicationsStore'
import { enrichMpOrder } from '../lib/mpSync/recruitmentDisplay'

export default function RecruitmentDetailPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const nav = useNavigate()
  const role = getActiveRole()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [view, setView] = useState<ReturnType<typeof enrichMpOrder> | null>(null)
  const [mpRaw, setMpRaw] = useState<Record<string, unknown> | null>(null)
  const applied = search.get('applied') === '1' || (id ? hasAppliedToOrder(id) : false)

  useEffect(() => {
    if (!id) {
      setErr('缺少招募单号')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
        const mp = list.find((o) => o && o.id === id)
        if (!mp) {
          setErr('招募单不存在或已结束')
          return
        }
        if (mp.status === 'closed' || mp.status === 'done') {
          setErr('该招募已结束')
          return
        }
        setMpRaw(mp)
        setView(enrichMpOrder(mp))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function goApply() {
    if (!view || !id) return
    const meta = mpRaw?.mpPublishMeta as { applyFormTemplateId?: string } | undefined
    const q = new URLSearchParams({
      platform: view.platform,
      merchantOrderNo: view.merchantOrderNo,
    })
    if (view.isIce) q.set('ice', '1')
    if (meta?.applyFormTemplateId) q.set('templateId', meta.applyFormTemplateId)
    nav(`/recruitment/${encodeURIComponent(id)}/apply?${q}`)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/hall" className="text-sm text-slate-400 hover:text-white">
        ← 返回招募大厅
      </Link>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-red-400">{err}</p> : null}
      {view ? (
        <>
          <h2 className="text-xl font-bold">{view.title}</h2>
          <p className="text-amber-400 font-semibold">{view.budgetText}</p>
          <div className="text-sm text-slate-400 space-y-1">
            <p>
              {view.platform} · {view.region} · 报名 {view.applicantCount}/{view.recruitCount}
            </p>
            <p>粉丝要求：{view.fansRequirement}</p>
            <p className="font-mono text-xs text-slate-500">单号 {view.mpOrderId}</p>
          </div>
          <section className="surface-card rounded-xl border p-4">
            <h3 className="font-medium mb-2">招募说明</h3>
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{view.recruitmentInfo}</pre>
          </section>
          {view.taskDetail !== view.recruitmentInfo ? (
            <section className="surface-card rounded-xl border p-4">
              <h3 className="font-medium mb-2">任务说明</h3>
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{view.taskDetail}</pre>
            </section>
          ) : null}
          {role === 'talent' && !applied ? (
            <button type="button" className="w-full py-3 rounded-xl bg-violet-600 font-medium" onClick={goApply}>
              {view.isIce ? '认领云剪任务' : '立即报名'}
            </button>
          ) : null}
          {applied ? (
            <p className="text-sm text-emerald-400">您已报名该招募，可在「我的履约」查看记录。</p>
          ) : null}
          {role === 'pr' ? (
            <p className="text-sm text-slate-500">PR 账号仅可浏览大厅，报名请切换达人版。</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
