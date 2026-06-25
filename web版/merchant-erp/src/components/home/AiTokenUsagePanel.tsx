import { Calendar, Cpu, Loader2, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../../cn'
import {
  aiProviderLabel,
  fetchAiTokenUsage,
  formatTokenCount,
  type AiTokenUsageRange,
  type AiTokenUsageResponse,
} from '../../services/aiTokenUsageApi'

type Variant = 'erp' | 'xingxuan'

const RANGE_TABS: { value: AiTokenUsageRange; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'custom', label: '自定义' },
]

type Props = {
  variant?: Variant
  className?: string
  mpSessionToken?: string
}

function emptyData(): AiTokenUsageResponse {
  return {
    ok: true,
    summary: { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 },
    byProvider: [],
    dailySeries: [],
  }
}

export default function AiTokenUsagePanel({ variant = 'erp', className, mpSessionToken }: Props) {
  const [range, setRange] = useState<AiTokenUsageRange>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AiTokenUsageResponse>(emptyData())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchAiTokenUsage({
        range,
        from: range === 'custom' ? customFrom : undefined,
        to: range === 'custom' ? customTo : undefined,
        mpSessionToken,
      })
      setData(r.ok !== false ? r : emptyData())
    } catch {
      setData(emptyData())
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo, mpSessionToken])

  useEffect(() => {
    void load()
  }, [load])

  const summary = data.summary ?? emptyData().summary!
  const chartData = useMemo(
    () =>
      (data.dailySeries ?? []).map((d) => ({
        ...d,
        label: d.date.slice(5),
      })),
    [data.dailySeries],
  )
  const topProviders = (data.byProvider ?? []).slice(0, 5)
  const isXingxuan = variant === 'xingxuan'
  const storageNotReady = data.storageReady === false

  return (
    <div
      className={cn(
        isXingxuan ? 'ai-token-panel ai-token-panel--xingxuan' : 'flex h-full flex-col',
        className,
      )}
    >
      <div className={cn('mb-3 flex flex-wrap items-start justify-between gap-2', isXingxuan && 'ai-token-panel__head')}>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              isXingxuan
                ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25'
                : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm',
            )}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className={cn('font-semibold text-gray-900', isXingxuan && 'ai-token-panel__title')}>
              AI 模型 Token 用量
            </h3>
            <p className={cn('text-xs text-gray-500', isXingxuan && 'ai-token-panel__sub')}>
              {data.from && data.to ? `${data.from} ~ ${data.to}` : '主账号汇总'}
            </p>
          </div>
        </div>
        <div className={cn('flex rounded-lg border border-gray-200/90 bg-white/80 p-0.5', isXingxuan && 'ai-token-panel__tabs')}>
          {RANGE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setRange(t.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                range === t.value
                  ? isXingxuan
                    ? 'bg-violet-600 text-white shadow'
                    : 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Calendar className="h-3.5 w-3.5 text-gray-400" aria-hidden />
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1"
          />
          <span className="text-gray-400">至</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-white hover:bg-indigo-700"
          >
            查询
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          加载用量…
        </div>
      ) : (
        <>
          <div className={cn('mb-3 grid grid-cols-2 gap-2', isXingxuan && 'ai-token-panel__stats')}>
            <StatChip icon={Zap} label="总 Token" value={formatTokenCount(summary.totalTokens)} tone="violet" compact={!isXingxuan} />
            <StatChip icon={TrendingUp} label="输入 Token" value={formatTokenCount(summary.promptTokens)} tone="blue" compact={!isXingxuan} />
            <StatChip icon={Cpu} label="输出 Token" value={formatTokenCount(summary.completionTokens)} tone="emerald" compact={!isXingxuan} />
            <StatChip icon={Sparkles} label="调用次数" value={String(summary.callCount)} tone="amber" compact={!isXingxuan} />
          </div>

          <div className={cn('mb-3 min-h-[120px]', isXingxuan ? 'ai-token-panel__chart' : 'h-36')}>
            {storageNotReady ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-amber-200 bg-amber-50/80 px-3 text-center text-xs text-amber-800">
                <Sparkles className="mb-1.5 h-5 w-5 text-amber-400" />
                Token 用量存储未就绪
                <span className="mt-0.5 text-[11px] text-amber-700/90">
                  {data.storageHint ?? '请在轻量 ECS 执行数据库迁移后刷新页面'}
                </span>
              </div>
            ) : chartData.some((d) => d.totalTokens > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokenGradErp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2ff" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #e0e7ff', fontSize: 12 }}
                    formatter={(v) => [formatTokenCount(Number(v ?? 0)), 'Token']}
                    labelFormatter={(l) => `日期 ${l}`}
                  />
                  <Area type="monotone" dataKey="totalTokens" stroke="#6366f1" strokeWidth={2} fill="url(#tokenGradErp)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 text-center text-xs text-gray-500">
                <Sparkles className="mb-1.5 h-5 w-5 text-indigo-300" />
                该时段暂无 AI 调用记录
                <span className="mt-0.5 text-[11px] text-gray-400">
                  智能体对话、数字人口播、视频生成与云端语音合成成功后会计入
                </span>
              </div>
            )}
          </div>

          {topProviders.length ? (
            <ul className={cn('space-y-1.5', isXingxuan && 'ai-token-panel__providers')}>
              {topProviders.map((row) => (
                <li
                  key={`${row.provider}-${row.model}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50/80 px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-medium text-gray-800">
                    {aiProviderLabel(row.provider)}
                    {row.model ? <span className="ml-1 font-normal text-gray-400">{row.model}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-indigo-600">{formatTokenCount(row.totalTokens)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
  compact,
}: {
  icon: typeof Zap
  label: string
  value: string
  tone: 'violet' | 'blue' | 'emerald' | 'amber'
  compact?: boolean
}) {
  const toneMap = {
    violet: 'from-violet-500/10 to-indigo-500/5 text-violet-700 border-violet-100',
    blue: 'from-blue-500/10 to-cyan-500/5 text-blue-700 border-blue-100',
    emerald: 'from-emerald-500/10 to-teal-500/5 text-emerald-700 border-emerald-100',
    amber: 'from-amber-500/10 to-orange-500/5 text-amber-800 border-amber-100',
  }
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br px-2.5 py-2', toneMap[tone], compact && 'py-1.5')}>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium opacity-80">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <div className={cn('font-semibold tabular-nums tracking-tight', compact ? 'text-base' : 'text-lg')}>{value}</div>
    </div>
  )
}
