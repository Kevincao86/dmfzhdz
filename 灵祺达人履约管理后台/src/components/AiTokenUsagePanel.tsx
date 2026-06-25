import { Calendar, Cpu, Loader2, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aiProviderLabel,
  fetchAiTokenUsage,
  formatTokenCount,
  type AiTokenUsageRange,
  type AiTokenUsageResponse,
} from '../services/aiTokenUsageApi'

const RANGE_TABS: { value: AiTokenUsageRange; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'custom', label: '自定义' },
]

function emptyData(): AiTokenUsageResponse {
  return {
    ok: true,
    summary: { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 },
    byProvider: [],
    dailySeries: [],
  }
}

export default function AiTokenUsagePanel() {
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
      })
      setData(r.ok !== false ? r : emptyData())
    } catch {
      setData(emptyData())
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo])

  useEffect(() => {
    void load()
  }, [load])

  const summary = data.summary ?? emptyData().summary!
  const chartData = useMemo(() => data.dailySeries ?? [], [data.dailySeries])
  const maxTokens = Math.max(...chartData.map((d) => d.totalTokens), 1)
  const topProviders = (data.byProvider ?? []).slice(0, 4)

  return (
    <section className="ai-token-panel">
      <div className="ai-token-panel__glow" aria-hidden />
      <div className="ai-token-panel__inner">
        <header className="ai-token-panel__head">
          <div className="ai-token-panel__brand">
            <span className="ai-token-panel__icon">
              <Sparkles size={18} strokeWidth={2.2} />
            </span>
            <div>
              <h3 className="ai-token-panel__title">AI 模型 Token 用量</h3>
              <p className="ai-token-panel__sub">
                {data.from && data.to ? `${data.from} ~ ${data.to}` : '主账号 · 智能体调用汇总'}
              </p>
            </div>
          </div>
          <div className="ai-token-panel__tabs">
            {RANGE_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={range === t.value ? 'is-active' : ''}
                onClick={() => setRange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {range === 'custom' ? (
          <div className="ai-token-panel__custom">
            <Calendar size={14} aria-hidden />
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span>至</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            <button type="button" onClick={() => void load()}>
              查询
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="ai-token-panel__loading">
            <Loader2 className="ai-token-panel__spin" size={16} />
            加载用量…
          </p>
        ) : (
          <>
            <div className="ai-token-panel__stats">
              <StatCard icon={Zap} label="总 Token" value={formatTokenCount(summary.totalTokens)} tone="violet" />
              <StatCard icon={TrendingUp} label="输入" value={formatTokenCount(summary.promptTokens)} tone="blue" />
              <StatCard icon={Cpu} label="输出" value={formatTokenCount(summary.completionTokens)} tone="green" />
              <StatCard icon={Sparkles} label="调用" value={String(summary.callCount)} tone="amber" />
            </div>

            <div className="ai-token-panel__chart">
              {chartData.some((d) => d.totalTokens > 0) ? (
                <div className="ai-token-panel__bars">
                  {chartData.map((d) => (
                    <div key={d.date} className="ai-token-panel__bar-col" title={`${d.date}: ${formatTokenCount(d.totalTokens)}`}>
                      <div
                        className="ai-token-panel__bar"
                        style={{ height: `${Math.max((d.totalTokens / maxTokens) * 100, d.totalTokens ? 10 : 0)}%` }}
                      />
                      <span>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ai-token-panel__empty">
                  <Sparkles size={22} strokeWidth={1.8} />
                  <p>该时段暂无 AI 调用</p>
                  <span>智能体、文案生成、短视频/数字人口播、文稿与成片 AI 核查、语音合成成功后会计入</span>
                </div>
              )}
            </div>

            {topProviders.length ? (
              <ul className="ai-token-panel__list">
                {topProviders.map((row) => (
                  <li key={`${row.provider}-${row.model}`}>
                    <span>
                      {aiProviderLabel(row.provider)}
                      {row.model ? <em>{row.model}</em> : null}
                    </span>
                    <strong>{formatTokenCount(row.totalTokens)}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap
  label: string
  value: string
  tone: 'violet' | 'blue' | 'green' | 'amber'
}) {
  return (
    <div className={`ai-token-panel__stat ai-token-panel__stat--${tone}`}>
      <Icon size={14} aria-hidden />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}
