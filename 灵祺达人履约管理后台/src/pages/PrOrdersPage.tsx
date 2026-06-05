import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry, patchMpRecruitmentOrder } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import * as listFilters from '../lib/mpRecruitment/listFilters'
import { readPublishedOrders } from '../lib/mpRecruitment/publishedOrders'
import {
  deletePublishDraft,
  draftDisplayTitle,
  formatDraftSavedAt,
  listPublishDrafts,
  type PublishWizardDraft,
} from '../lib/mpSync/publishDraft'
import { DELIVERY_WINDOWS } from '../lib/mpSync/publishFormOptions'

type Tab = 'published' | 'drafts'

type PrOrderRow = ReturnType<typeof listFilters.enrichMpOrderListItem> & {
  mpOrderId: string
  hallLabel: string
}

function deliveryWindowLabel(id: string) {
  return DELIVERY_WINDOWS.find((w) => w.id === id)?.label || '招募大厅'
}

export default function PrOrdersPage() {
  const acc = getAccount()
  const [search, setSearch] = useSearchParams()
  const tab: Tab = search.get('tab') === 'drafts' ? 'drafts' : 'published'

  const [rows, setRows] = useState<PrOrderRow[]>([])
  const [drafts, setDrafts] = useState<PublishWizardDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [togglingId, setTogglingId] = useState('')

  const refreshDrafts = useCallback(() => {
    setDrafts(listPublishDrafts())
  }, [])

  async function loadPublished() {
    const local = readPublishedOrders()
    if (!local.length) {
      setRows([])
      return
    }
    setErr('')
    try {
      const reg = await fetchMpRegistry()
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
      setRows(
        local.map((item) => {
          const mp = mpList.find((o) => o && o.id === item.mpOrderId)
          const enriched = listFilters.enrichMpOrderListItem(mp || null, item)
          return { ...enriched, mpOrderId: item.mpOrderId, hallLabel: enriched.hallLabel as string }
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      setRows(
        local.map((item) => {
          const enriched = listFilters.enrichMpOrderListItem(null, item)
          return { ...enriched, mpOrderId: item.mpOrderId, hallLabel: '招募大厅' }
        }),
      )
    }
  }

  async function load() {
    setLoading(true)
    refreshDrafts()
    await loadPublished()
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [refreshDrafts])

  function setTab(next: Tab) {
    if (next === 'drafts') setSearch({ tab: 'drafts' })
    else setSearch({})
  }

  function onDeleteDraft(id: string) {
    if (!confirm('确定删除该草稿？删除后不可恢复。')) return
    deletePublishDraft(id)
    refreshDrafts()
  }

  async function onToggle(row: PrOrderRow) {
    if (!row.canToggleRecruit || togglingId) return
    const next = row.toggleNextStatus as string
    if (!confirm(next === 'closed' ? '停止后达人将无法继续报名，已报名数据保留。' : '开始后将在招募大厅重新展示。')) return
    setTogglingId(row.mpOrderId)
    try {
      await patchMpRecruitmentOrder({ mpOrderId: row.mpOrderId, status: next })
      await loadPublished()
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setTogglingId('')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">我的发单</h2>
      <p className="text-sm text-slate-400 mb-4">
        PR ID：<span className="text-amber-400 font-mono">{acc?.lingqiPrId || '—'}</span> · 已发布与草稿分开展示
      </p>

      <div className="flex gap-2 mb-4 p-1 rounded-xl panel-input border max-w-md">
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'published' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setTab('published')}
        >
          已发布招募单
          {!loading && rows.length ? (
            <span className="ml-1 text-xs opacity-80">({rows.length})</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'drafts' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setTab('drafts')}
        >
          草稿箱
          {!loading && drafts.length ? (
            <span className="ml-1 text-xs opacity-80">({drafts.length})</span>
          ) : null}
        </button>
      </div>

      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err && tab === 'published' ? <p className="text-amber-500 text-sm mb-2">{err}</p> : null}

      {tab === 'published' ? (
        <>
          {!loading && !rows.length ? (
            <div className="surface-card rounded-xl border p-6 text-center text-slate-500 text-sm">
              <p>暂无已发布招募单</p>
              <p className="mt-2 text-xs">发布招募成功后会出现在此处；也可在小程序发单后同步到本机</p>
              <Link to="/publish" className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm">
                去发布招募
              </Link>
            </div>
          ) : null}
          <div className="space-y-3">
            {rows.map((row) => (
              <article key={row.mpOrderId} className="surface-card rounded-xl border p-4">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <span className="text-xs text-violet-400">{row.hallLabel}</span>
                    <h3 className="font-semibold mt-1">{row.title}</h3>
                    <p className="text-xs text-slate-500 mt-2">
                      {row.signupLabel} · {row.deadlineDaysText}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10">{row.statusLabel}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/publish?edit=${encodeURIComponent(row.mpOrderId)}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-600/10"
                  >
                    编辑招募
                  </Link>
                  {row.canToggleRecruit ? (
                    <button
                      type="button"
                      disabled={togglingId === row.mpOrderId}
                      className="text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5"
                      onClick={() => void onToggle(row)}
                    >
                      {row.toggleActionLabel}招募
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          {!loading && !drafts.length ? (
            <div className="surface-card rounded-xl border p-6 text-center text-slate-500 text-sm">
              <p>草稿箱为空</p>
              <p className="mt-2 text-xs">在「发布招募」填写表单后点击「保存草稿」，会出现在此处</p>
              <Link to="/publish" className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm">
                去发布招募
              </Link>
            </div>
          ) : null}
          <div className="space-y-3">
            {drafts.map((draft) => (
              <article key={draft.id} className="surface-card rounded-xl border border-amber-500/25 p-4">
                <div className="flex justify-between gap-2 items-start">
                  <div>
                    <span className="text-xs text-amber-400/90">草稿</span>
                    <h3 className="font-semibold mt-1">{draftDisplayTitle(draft)}</h3>
                    <p className="text-xs text-slate-500 mt-2">
                      {draft.recruitModeLabel || '招募'} · {deliveryWindowLabel(draft.form.deliveryWindow)} · 保存于{' '}
                      {formatDraftSavedAt(draft.savedAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/publish?draft=${encodeURIComponent(draft.id)}`}
                    className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                  >
                    继续编辑
                  </Link>
                  <button
                    type="button"
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5"
                    onClick={() => onDeleteDraft(draft.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
