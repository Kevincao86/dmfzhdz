import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import {
  buildChannelStats,
  filterProjectsByChannel,
  filterPromotionsByChannel,
} from '../../lib/localPromotionAnalytics'
import { isLocalPromotionBound, readLocalPromotionBinding } from '../../lib/localPromotionBinding'
import { isQianchuanBound, readQianchuanBinding } from '../../lib/qianchuanBinding'
import { toUserFacingError } from '../../lib/userFacingError'
import type {
  LocalClueRow,
  LocalProjectRow,
  LocalPromotionAiAction,
  LocalPromotionAiMode,
  LocalPromotionAiPane,
  LocalPromotionRow,
  LocalReportSummary,
} from '../../lib/localPromotionTypes'
import {
  fetchLocalClues,
  fetchLocalProjects,
  fetchLocalPromotions,
  fetchLocalReportSummary,
  postAdAiInsight,
  updatePromotionStatus,
} from '../../services/localPromotionApi'
import {
  fetchLocalClues as fetchQianchuanClues,
  fetchLocalProjects as fetchQianchuanProjects,
  fetchQianchuanPromotions,
  fetchLocalReportSummary as fetchQianchuanReportSummary,
  postAdAiInsight as postQianchuanAdAiInsight,
  updatePromotionStatus as updateQianchuanPromotionStatus,
} from '../../services/qianchuanApi'
import LocalPromotionAiOverviewPanel from './LocalPromotionAiOverviewPanel'
import LocalPromotionChannelPanel from './LocalPromotionChannelPanel'
import LocalPromotionLeadsAnalysisPanel from './LocalPromotionLeadsAnalysisPanel'

type OceanPlatform = 'local_promotion' | 'qianchuan'
type LocalPane = LocalPromotionAiPane

const LOCAL_PANES: Array<{ id: LocalPane; label: string; hint: string }> = [
  { id: 'live', label: '直播间投流', hint: 'LIVE 类营销目标' },
  { id: 'video', label: '短视频投流', hint: '短视频/图文类计划' },
  { id: 'leads', label: '线索分析', hint: '表单/私信线索归因' },
  { id: 'ai', label: 'AI 整体分析', hint: '直播+短视频+线索' },
]

const AI_MODE_STORAGE_KEYS: Record<OceanPlatform, string> = {
  local_promotion: 'meoo_local_promotion_ai_mode',
  qianchuan: 'meoo_qianchuan_ai_mode',
}

function readStoredAiMode(platform: OceanPlatform): LocalPromotionAiMode {
  try {
    const v = localStorage.getItem(AI_MODE_STORAGE_KEYS[platform])
    if (v === 'manual' || v === 'assisted' || v === 'full_ai' || v === 'auto_adjust') return v
  } catch {
    /* ignore */
  }
  return 'assisted'
}

type PaneAiState = {
  insight: string | null
  actions: LocalPromotionAiAction[]
  busy: boolean
}

const emptyPaneAi = (): PaneAiState => ({ insight: null, actions: [], busy: false })

export default function OceanEngineAdvertisingInner({ platform }: { platform: OceanPlatform }) {
  const [pane, setPane] = useState<LocalPane>('live')
  const [promotions, setPromotions] = useState<LocalPromotionRow[]>([])
  const [projects, setProjects] = useState<LocalProjectRow[]>([])
  const [clues, setClues] = useState<LocalClueRow[]>([])
  const [summary, setSummary] = useState<LocalReportSummary | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiMode, setAiMode] = useState<LocalPromotionAiMode>(() => readStoredAiMode(platform))
  const [paneAi, setPaneAi] = useState<Record<LocalPane, PaneAiState>>({
    live: emptyPaneAi(),
    video: emptyPaneAi(),
    leads: emptyPaneAi(),
    ai: emptyPaneAi(),
  })
  const [aiApplyingId, setAiApplyingId] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)

  const bind =
    platform === 'qianchuan' ? readQianchuanBinding() : readLocalPromotionBinding()
  const platformLabel = platform === 'qianchuan' ? '巨量千川' : '本地推'

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setApiError(null)
    try {
      const fetchPromotions =
        platform === 'qianchuan' ? fetchQianchuanPromotions : fetchLocalPromotions
      const fetchProjects = platform === 'qianchuan' ? fetchQianchuanProjects : fetchLocalProjects
      const fetchSummary =
        platform === 'qianchuan' ? fetchQianchuanReportSummary : fetchLocalReportSummary
      const fetchClues = platform === 'qianchuan' ? fetchQianchuanClues : fetchLocalClues

      const [pr, pj, rep, cr] = await Promise.all([
        fetchPromotions(),
        fetchProjects(),
        fetchSummary(),
        fetchClues(),
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
  }, [bind?.accessToken, bind?.demoMode, bind?.localAccountId, platform])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    setAiMode(readStoredAiMode(platform))
    setPaneAi({
      live: emptyPaneAi(),
      video: emptyPaneAi(),
      leads: emptyPaneAi(),
      ai: emptyPaneAi(),
    })
  }, [platform])

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

  const setAiModePersist = (mode: LocalPromotionAiMode) => {
    setAiMode(mode)
    try {
      localStorage.setItem(AI_MODE_STORAGE_KEYS[platform], mode)
    } catch {
      /* ignore */
    }
    if (mode === 'full_ai' || mode === 'auto_adjust') {
      setPaneAi((prev) => ({
        ...prev,
        [pane]: { ...prev[pane], insight: null, actions: [] },
      }))
    }
  }

  const runPaneAi = useCallback(
    async (targetPane: LocalPane = pane) => {
      if (aiMode === 'manual') return
      setPaneAi((prev) => ({
        ...prev,
        [targetPane]: { ...prev[targetPane], busy: true },
      }))
      try {
        const promos =
          targetPane === 'live'
            ? livePromotions
            : targetPane === 'video'
              ? videoPromotions
              : promotions
        const r = await (platform === 'qianchuan' ? postQianchuanAdAiInsight : postAdAiInsight)({
          summary,
          promotions: promos,
          clues,
          channelStats,
          pane: targetPane,
          mode: aiMode,
        })
        if (r.ok) {
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: { insight: r.insight, actions: r.actions ?? [], busy: false },
          }))
        } else {
          setError(r.message)
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: { ...prev[targetPane], busy: false },
          }))
        }
      } catch (e) {
        setError(toUserFacingError(e, 'AI 投流分析'))
        setPaneAi((prev) => ({
          ...prev,
          [targetPane]: { ...prev[targetPane], busy: false },
        }))
      }
    },
    [aiMode, pane, livePromotions, videoPromotions, promotions, summary, clues, channelStats, platform],
  )

  useEffect(() => {
    if (aiMode === 'manual') return
    const cur = paneAi[pane]
    if (cur.busy || cur.insight) return
    if (loading) return
    if (aiMode === 'full_ai' || aiMode === 'auto_adjust') {
      void runPaneAi(pane)
    }
  }, [pane, aiMode, loading, paneAi, runPaneAi])

  const handlePaneChange = (next: LocalPane) => {
    setPane(next)
    if (aiMode === 'full_ai' || aiMode === 'auto_adjust') {
      setPaneAi((prev) => ({
        ...prev,
        [next]: { ...prev[next], insight: null, actions: [] },
      }))
    }
  }

  const applyAiAction = async (action: LocalPromotionAiAction) => {
    if (!action.promotionId || (action.actionType !== 'enable' && action.actionType !== 'disable')) {
      return
    }
    setAiApplyingId(action.actionId)
    try {
      const r = await (platform === 'qianchuan'
        ? updateQianchuanPromotionStatus
        : updatePromotionStatus)([action.promotionId], action.actionType === 'enable' ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
      setPaneAi((prev) => ({
        ...prev,
        [pane]: {
          ...prev[pane],
          actions: prev[pane].actions.filter((a) => a.actionId !== action.actionId),
        },
      }))
    } finally {
      setAiApplyingId(null)
    }
  }

  const togglePromotion = async (row: LocalPromotionRow, enable: boolean) => {
    setStatusBusy(row.promotionId)
    try {
      const r = await (platform === 'qianchuan'
        ? updateQianchuanPromotionStatus
        : updatePromotionStatus)([row.promotionId], enable ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
    } finally {
      setStatusBusy(null)
    }
  }

  const bound = platform === 'qianchuan' ? isQianchuanBound() : isLocalPromotionBound()
  const currentAi = paneAi[pane]

  const aiPanelProps = {
    aiMode,
    onAiModeChange: setAiModePersist,
    aiInsight: currentAi.insight,
    aiActions: currentAi.actions,
    aiBusy: currentAi.busy,
    aiApplyingId,
    onRunAi: () => void runPaneAi(pane),
    onApplyAiAction: (a: LocalPromotionAiAction) => void applyAiAction(a),
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          同步
        </button>
      </div>

      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          尚未绑定{platformLabel}，当前展示演示数据。
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            前往系统设置 · 商业化后台 · 巨量工作台
          </Link>
        </div>
      ) : apiError ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
          <p className="font-medium">已绑定但暂未拉到真实数据</p>
          <p className="mt-1 text-xs leading-relaxed">
            {apiError}。请确认：① 广告主 ID{' '}
            <code className="rounded bg-white/80 px-1">{bind?.localAccountId}</code>{' '}
            与{platformLabel}后台一致；② 应用已开通投放/报表/线索权限；③ Token 未过期。
          </p>
        </div>
      ) : demoMode ? (
        <div className="erp-panel mb-6 border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
          演示模式：绑定校验未通过真实接口，以下为样例数据。
        </div>
      ) : null}

      {bound && bind ? (
        <p className="mb-4 text-xs text-slate-500">
          当前{platformLabel}账号：<strong>{bind.accountName}</strong>
          <span className="ml-2 tabular-nums">ID {bind.localAccountId}</span>
          {loading ? (
            <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-slate-400" />
          ) : null}
        </p>
      ) : null}

      {error && !apiError ? <p className="mb-4 text-sm text-amber-700">{error}</p> : null}

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {LOCAL_PANES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePaneChange(t.id)}
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
              pane="live"
              promotions={livePromotions}
              projects={liveProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
              {...aiPanelProps}
            />
          ) : null}

          {pane === 'video' ? (
            <LocalPromotionChannelPanel
              title="短视频投流监测"
              description="筛选短视频/图文类广告计划，查看展示、点击、转化与出价表现。"
              pane="video"
              promotions={videoPromotions}
              projects={videoProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
              {...aiPanelProps}
            />
          ) : null}

          {pane === 'leads' ? (
            <LocalPromotionLeadsAnalysisPanel
              clues={clues}
              promotions={promotions}
              summary={summary}
              loading={loading}
              onReload={reload}
              {...aiPanelProps}
            />
          ) : null}

      {pane === 'ai' ? (
        <LocalPromotionAiOverviewPanel
          summary={summary}
          channelStats={channelStats}
          promotions={promotions}
          clues={clues}
          loading={loading}
          {...aiPanelProps}
        />
      ) : null}
    </>
  )
}
