import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import {
  buildChannelStats,
  filterProjectsByChannel,
  filterPromotionsByChannel,
} from '../lib/localPromotionAnalytics'
import { isLocalPromotionBound, readLocalPromotionBinding } from '../lib/localPromotionBinding'
import { toUserFacingError } from '../lib/userFacingError'
import type {
  LocalClueRow,
  LocalProjectRow,
  LocalPromotionRow,
  LocalReportSummary,
} from '../lib/localPromotionTypes'
import ModulePage from './ModulePage'
import {
  fetchLocalClues,
  fetchLocalProjects,
  fetchLocalPromotions,
  fetchLocalReportSummary,
  postAdAiInsight,
  updatePromotionStatus,
} from '../services/localPromotionApi'
import LocalPromotionAiOverviewPanel from './advertising/LocalPromotionAiOverviewPanel'
import LocalPromotionChannelPanel from './advertising/LocalPromotionChannelPanel'
import LocalPromotionLeadsAnalysisPanel from './advertising/LocalPromotionLeadsAnalysisPanel'
import XhsJuguangAdvertisingPanel from './advertising/XhsJuguangAdvertisingPanel'

type AdChannel = 'local_promotion' | 'juguang'
type LocalPane = 'live' | 'video' | 'leads' | 'ai'

const LOCAL_PANES: Array<{ id: LocalPane; label: string; hint: string }> = [
  { id: 'live', label: '直播间投流', hint: 'LIVE 类营销目标' },
  { id: 'video', label: '短视频投流', hint: '短视频/图文类计划' },
  { id: 'leads', label: '线索分析', hint: '表单/私信线索归因' },
  { id: 'ai', label: 'AI 整体分析', hint: '直播+短视频+线索' },
]

export default function LocalPromotionAdvertisingPage() {
  const [channel, setChannel] = useState<AdChannel>('local_promotion')
  const [pane, setPane] = useState<LocalPane>('live')
  const [promotions, setPromotions] = useState<LocalPromotionRow[]>([])
  const [projects, setProjects] = useState<LocalProjectRow[]>([])
  const [clues, setClues] = useState<LocalClueRow[]>([])
  const [summary, setSummary] = useState<LocalReportSummary | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)

  const bind = readLocalPromotionBinding()

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setApiError(null)
    try {
      const [pr, pj, rep, cr] = await Promise.all([
        fetchLocalPromotions(),
        fetchLocalProjects(),
        fetchLocalReportSummary(),
        fetchLocalClues(),
      ])
      const failures: string[] = []
      const apiErrors: string[] = []

      if (pr.ok) setPromotions(pr.list)
      else failures.push(pr.message)
      if (pr.ok && pr.apiError) apiErrors.push(pr.apiError)

      if (pj.ok) setProjects(pj.list)
      else failures.push(pj.message)
      if (pj.ok && pj.apiError) apiErrors.push(pj.apiError)

      if (rep.ok) setSummary(rep.summary)
      else failures.push(rep.message)

      if (cr.ok) setClues(cr.list)
      else failures.push(cr.message)
      if (cr.ok && cr.apiError) apiErrors.push(cr.apiError)

      const hasCreds = Boolean(bind?.accessToken && bind.localAccountId)
      const anyDemo =
        (pr.ok && pr.demoMode) ||
        (pj.ok && pj.demoMode) ||
        (rep.ok && rep.demoMode) ||
        (cr.ok && cr.demoMode) ||
        Boolean(bind?.demoMode)
      setDemoMode(!hasCreds || anyDemo)
      setApiError(apiErrors[0] ?? null)
      setError(failures[0] ?? null)
    } catch (e) {
      setError(toUserFacingError(e, '同步投流数据'))
    } finally {
      setLoading(false)
    }
  }, [bind?.accessToken, bind?.demoMode, bind?.localAccountId])

  useEffect(() => {
    void reload()
  }, [reload])

  const livePromotions = useMemo(
    () => filterPromotionsByChannel(promotions, 'live'),
    [promotions],
  )
  const videoPromotions = useMemo(
    () => filterPromotionsByChannel(promotions, 'video'),
    [promotions],
  )
  const liveProjects = useMemo(() => filterProjectsByChannel(projects, 'live'), [projects])
  const videoProjects = useMemo(() => filterProjectsByChannel(projects, 'video'), [projects])
  const channelStats = useMemo(
    () => buildChannelStats({ promotions, clues }),
    [promotions, clues],
  )

  const runAiInsight = async () => {
    if (!summary) return
    setAiBusy(true)
    setAiInsight(null)
    try {
      const r = await postAdAiInsight({
        summary,
        promotions,
        clues,
        channelStats,
      })
      if (r.ok) setAiInsight(r.insight)
      else setError(r.message)
    } finally {
      setAiBusy(false)
    }
  }

  const togglePromotion = async (row: LocalPromotionRow, enable: boolean) => {
    setStatusBusy(row.promotionId)
    try {
      const r = await updatePromotionStatus([row.promotionId], enable ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
    } finally {
      setStatusBusy(null)
    }
  }

  const bound = isLocalPromotionBound()

  return (
    <ModulePage
      title="投流"
      subtitle="巨量本地推：直播间投流、短视频投流、线索分析与 AI 整体诊断"
      actions={
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          同步
        </button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChannel('local_promotion')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'local_promotion' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          巨量本地推 <span className="text-[10px] opacity-80">(抖音)</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('juguang')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'juguang' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          聚光 <span className="text-[10px] opacity-80">(小红书)</span>
        </button>
      </div>

      {channel === 'juguang' ? (
        <XhsJuguangAdvertisingPanel />
      ) : (
        <>
          {!bound ? (
            <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
              尚未绑定本地推，当前展示演示数据。
              <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
                前往系统设置 · 商业化后台
              </Link>
            </div>
          ) : apiError ? (
            <div className="erp-panel mb-6 border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
              <p className="font-medium">已绑定但暂未拉到真实数据</p>
              <p className="mt-1 text-xs leading-relaxed">
                {apiError}。请确认：① 广告主 ID{' '}
                <code className="rounded bg-white/80 px-1">{bind?.localAccountId}</code>{' '}
                与本地推后台一致；② 应用已开通投放/报表/线索权限；③ Token 未过期（可点设置页「重新校验连接」）。
              </p>
            </div>
          ) : demoMode ? (
            <div className="erp-panel mb-6 border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
              演示模式：绑定校验未通过真实接口，以下为样例数据。
            </div>
          ) : null}

          {bound && bind ? (
            <p className="mb-4 text-xs text-slate-500">
              当前账号：<strong>{bind.accountName}</strong>
              <span className="ml-2 tabular-nums">ID {bind.localAccountId}</span>
              {loading ? (
                <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-slate-400" />
              ) : null}
            </p>
          ) : null}

          {error && !apiError ? (
            <p className="mb-4 text-sm text-amber-700">{error}</p>
          ) : null}

          <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
            {LOCAL_PANES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPane(t.id)}
                className={cn(
                  'rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  pane === t.id
                    ? 'border-orange-600 text-orange-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {t.label}
                <span className="ml-1.5 text-[10px] font-normal opacity-70">{t.hint}</span>
              </button>
            ))}
          </div>

          {pane === 'live' ? (
            <LocalPromotionChannelPanel
              title="直播间投流监测"
              description="筛选营销目标为 LIVE 的广告计划与项目，监测消耗、转化与在投状态。"
              promotions={livePromotions}
              projects={liveProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
            />
          ) : null}

          {pane === 'video' ? (
            <LocalPromotionChannelPanel
              title="短视频投流监测"
              description="筛选短视频/图文类广告计划，查看展示、点击、转化与出价表现。"
              promotions={videoPromotions}
              projects={videoProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
            />
          ) : null}

          {pane === 'leads' ? (
            <LocalPromotionLeadsAnalysisPanel
              clues={clues}
              loading={loading}
              onReload={reload}
            />
          ) : null}

          {pane === 'ai' ? (
            <LocalPromotionAiOverviewPanel
              summary={summary}
              channelStats={channelStats}
              promotions={promotions}
              clues={clues}
              aiInsight={aiInsight}
              aiBusy={aiBusy}
              onRunAi={() => void runAiInsight()}
            />
          ) : null}
        </>
      )}
    </ModulePage>
  )
}
