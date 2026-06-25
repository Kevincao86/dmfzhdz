import { useEffect, useState } from 'react'
import {
  ClipboardList,
  Users,
  FolderOpen,
  TrendingUp,
  Info,
  ChevronRight,
  MessageCircle,
  Handshake,
  AlertTriangle,
  UserCheck,
  Play,
  ArrowRight,
  Send,
  UserRound,
} from 'lucide-react'
import AiTokenUsagePanel from '../../components/AiTokenUsagePanel'
import { fetchMpRegistry, clearMpRegistryCache } from '../../lib/mpApi'
import { buildHallDashboardStats, emptyHallDashboardStats, type HallDashboardStats } from '../../lib/mpRecruitment/hallDashboard'
import { Link } from 'react-router-dom'
import { getWorkIdentity, type MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { getActiveRole } from '../../lib/mpSession'
import { resolveShellDisplayName } from '../../lib/shellDisplayName'
import { readApplications, type ApplicationLocal } from '../../lib/mpSync/applicationsStore'
import { readMember } from '../../lib/mpSync/talentMember'
import { resolveOrderCoverUrl } from '../../lib/mpSync/recruitCoverLibrary'
import { loadAllOrderRows, mapMpOrderRow } from '../../lib/mpRecruitment/orderCard'
import { orderVisibleToWorkIdentity } from '../../lib/mpRecruitment/roleHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import { resolveTalentApplicationProgress } from '../../lib/mpRecruitment/talentApplicationStatus'
import { findMyApplicant } from '../../lib/mpSync/talentContactPrGate'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import type { MpRegistry } from '../../lib/mpRecruitment/types'

function pctDelta(current: number, prev: number): string | null {
  if (prev <= 0 && current <= 0) return null
  if (prev <= 0) return '+100%'
  const pct = ((current - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

const PR_STAT_CARDS = [
  { key: 'total' as const, label: '撮合单总量', icon: ClipboardList, tone: 'blue', to: '/orders' },
  { key: 'recruiting' as const, label: '招募中', icon: Users, tone: 'green', to: '/hall?tab=hall' },
  { key: 'collecting' as const, label: '收集中', icon: FolderOpen, tone: 'orange', to: '/orders' },
  { key: 'todayNew' as const, label: '今日新增', icon: TrendingUp, tone: 'purple', to: '/hall?tab=hall' },
]

const DYNAMIC_LINKS: Record<string, string> = {
  待处理报名: '/orders',
  待沟通: '/messages',
  待确认合作: '/orders',
  异常单据: '/orders',
}

const DYNAMIC_ICONS = {
  blue: UserCheck,
  green: MessageCircle,
  orange: Handshake,
  purple: AlertTriangle,
}

function TrendBarChart({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="dash-bar-chart">
      {items.map((item) => (
        <div key={item.label} className="dash-bar-chart__col">
          <div className="dash-bar-chart__bar-wrap">
            <div
              className="dash-bar-chart__bar"
              style={{ height: `${Math.max((item.count / max) * 100, item.count ? 8 : 0)}%` }}
            />
          </div>
          <span className="dash-bar-chart__label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function StatusDonut({ stats }: { stats: HallDashboardStats }) {
  const segments = [
    { label: '招募中', count: stats.recruiting, color: '#3b82f6' },
    { label: '收集中', count: stats.collecting, color: '#10b981' },
    { label: '已结束', count: stats.ended, color: '#f59e0b' },
  ].filter((s) => s.count > 0)
  const total = stats.total || 1
  let offset = 0
  const gradient = segments
    .map((s) => {
      const pct = (s.count / total) * 100
      const seg = `${s.color} ${offset}% ${offset + pct}%`
      offset += pct
      return seg
    })
    .join(', ')

  return (
    <div className="dash-donut-wrap">
      <div className="dash-donut" style={{ background: segments.length ? `conic-gradient(${gradient})` : '#e2e8f0' }}>
        <div className="dash-donut__center">
          <span className="dash-donut__total">{stats.total}</span>
          <span className="dash-donut__sub">撮合单总量</span>
        </div>
      </div>
      <ul className="dash-donut__legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="dash-donut__dot" style={{ background: s.color }} />
            <span className="dash-donut__name">{s.label}</span>
            <span className="dash-donut__meta">
              {s.count} · {Math.round((s.count / total) * 1000) / 10}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoryBars({ items, total }: { items: { category: string; count: number }[]; total: number }) {
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <ul className="dash-hbar-list">
      {items.length ? (
        items.map((c) => (
          <li key={c.category} className="dash-hbar-row">
            <span className="dash-hbar-row__label">{c.category}</span>
            <div className="dash-hbar-row__track">
              <div className="dash-hbar-row__fill" style={{ width: `${Math.max((c.count / max) * 100, c.count ? 6 : 0)}%` }} />
            </div>
            <span className="dash-hbar-row__pct">{total > 0 ? `${Math.round((c.count / total) * 100)}%` : '0%'}</span>
          </li>
        ))
      ) : (
        <li className="text-sm text-[var(--shell-muted)] py-6 text-center">暂无品类数据</li>
      )}
    </ul>
  )
}

function MiniSparkline({ items }: { items: { count: number }[] }) {
  const data = items.length ? items : [{ count: 0 }]
  const max = Math.max(...data.map((d) => d.count), 1)
  const w = 72
  const h = 36
  const step = w / Math.max(data.length - 1, 1)
  const points = data
    .map((d, i) => {
      const x = i * step
      const y = h - (d.count / max) * (h - 6) - 3
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg className="talent-home__sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  )
}

const PLATFORM_ANNOUNCEMENTS = [
  { title: '星选平台全新升级 AI 智能匹配', date: '05-28', latest: true },
  { title: '六月达人招募活动火热进行中', date: '05-25' },
  { title: '平台服务协议更新通知', date: '05-20' },
]

function countPendingApplications(reg: MpRegistry): number {
  const apps = readApplications()
  if (!apps.length) return 0
  const orders = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  let pending = 0
  for (const app of apps) {
    const mp = orders.find((o) => String(o?.id) === app.mpOrderId) as Record<string, unknown> | undefined
    if (!mp) {
      pending += 1
      continue
    }
    const me = findMyApplicant(mp, app.mpOrderId)
    const progress = resolveTalentApplicationProgress(mp, me as Record<string, unknown> | null, app.mpOrderId)
    if (progress.id !== 'completed') pending += 1
  }
  return pending
}

function applicationSortMs(appliedAt?: string): number {
  const t = Date.parse(String(appliedAt || '').trim())
  return Number.isFinite(t) ? t : 0
}

type RecentApplicationItem = {
  mpOrderId: string
  title: string
  coverUrl?: string
  tags: string[]
  progressLabel: string
  appliedAt?: string
}

function enrichRecentApplication(
  app: ApplicationLocal,
  mp: Record<string, unknown> | undefined,
  reg: MpRegistry,
): RecentApplicationItem {
  const fallback: RecentApplicationItem = {
    mpOrderId: app.mpOrderId,
    title: app.title || '报名商单',
    tags: app.platform ? [app.platform] : [],
    progressLabel: '已报名',
    appliedAt: app.appliedAt,
  }
  if (!mp) return fallback
  const row = mapMpOrderRow(mp, reg)
  const me = findMyApplicant(mp, app.mpOrderId)
  const progress = resolveTalentApplicationProgress(mp, me as Record<string, unknown> | null, app.mpOrderId)
  return {
    mpOrderId: app.mpOrderId,
    title: app.title || row.title,
    coverUrl: resolveOrderCoverUrl(mp),
    tags: orderTagChips(row),
    progressLabel: progress.label,
    appliedAt: app.appliedAt,
  }
}

function formatAppliedAtShort(raw?: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.replace('T', ' ').slice(0, 16)
  return t
}

function orderTagChips(row: RecruitmentOrderRow): string[] {
  const tags: string[] = []
  if (row.isIce) tags.push('云剪')
  else if (row.platform) tags.push(row.platform)
  if (row.category) tags.push(row.category)
  if (row.fansRequirement && row.fansRequirement !== '不限') tags.push(row.fansRequirement)
  else if (row.categoryTagsText) tags.push(row.categoryTagsText.split(/[·、,，]/)[0]?.trim() || '')
  return tags.filter(Boolean).slice(0, 3)
}

function TalentHomeDashboard({
  stats,
  loading,
  err,
  onRetry,
  workId,
  refreshKey,
}: {
  stats: HallDashboardStats
  loading: boolean
  err: string
  onRetry: () => void
  workId: MpWorkIdentity
  refreshKey: number
}) {
  const displayName = resolveShellDisplayName()
  const profileLink = workId === 'shoot' || workId === 'edit' ? '/profile/supplier' : '/profile/talent'
  const [recentApps, setRecentApps] = useState<RecentApplicationItem[]>([])
  const [matchCount, setMatchCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [appsLoading, setAppsLoading] = useState(true)

  const todayTrend = pctDelta(stats.todayNew, stats.yesterdayNew)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setAppsLoading(true)
      try {
        const member = readMember()
        const reg = await fetchMpRegistry()
        if (!alive) return
        setPendingCount(countPendingApplications(reg))
        const mpOrders = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
        const mpById = new Map(mpOrders.map((o) => [String((o as { id?: string })?.id || ''), o as Record<string, unknown>]))
        const all = loadAllOrderRows(reg)
        const rows = all.filter((r) => orderVisibleToWorkIdentity(r, workId) && r.statusLabel === '招募中')
        let enriched = rows
        if (member && rows.length) {
          enriched = await recruitmentAi.enrichOrderMatches(rows, member, { workIdentity: workId })
        } else if (rows.length) {
          enriched = await recruitmentAi.enrichOrderTags(rows, member?.city || member?.province || '')
          enriched = enriched.map((r) => ({ ...r, matchScore: 0, aiMatch: false }))
        }
        if (!alive) return
        const matched = enriched.filter((r) => (r.matchScore || 0) >= 55 || r.aiMatch)
        setMatchCount(matched.length)

        const localApps = readApplications()
        const recent = [...localApps]
          .sort((a, b) => applicationSortMs(b.appliedAt) - applicationSortMs(a.appliedAt))
          .slice(0, 4)
          .map((app) => enrichRecentApplication(app, mpById.get(app.mpOrderId), reg))
        setRecentApps(recent)
      } catch {
        if (!alive) return
        setMatchCount(0)
        setRecentApps([])
      } finally {
        if (alive) setAppsLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [workId, refreshKey])

  return (
    <div className="talent-home">
      {loading ? <p className="talent-home__hint">加载数据中…</p> : null}
      {err ? (
        <p className="talent-home__err">
          {err}
          <button type="button" className="talent-home__retry" onClick={onRetry}>刷新重试</button>
        </p>
      ) : null}

      <section className="talent-home__welcome">
        <div className="talent-home__welcome-main">
          <h2 className="talent-home__welcome-title">Hi，{displayName} 👋</h2>
          <p className="talent-home__welcome-sub">今天是充满机会的一天，加油哦！</p>
        </div>
        <div className="talent-home__welcome-actions">
          <Link to="/help" className="talent-home__btn talent-home__btn--primary">
            <Play size={15} strokeWidth={2.5} aria-hidden />
            新手引导
          </Link>
          <Link to={profileLink} className="talent-home__btn talent-home__btn--outline">
            完善资料，提升接单效率
            <ArrowRight size={15} strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
      </section>

      <div className="talent-home__stat-row">
        <Link to="/hall?tab=hall" className="talent-home__stat-card talent-home__stat-card--purple no-underline">
          <div className="talent-home__stat-body">
            <span className="talent-home__stat-label">今日新单数</span>
            <span className="talent-home__stat-value">{stats.todayNew.toLocaleString('zh-CN')}</span>
            {todayTrend ? (
              <span className={`talent-home__stat-trend ${todayTrend.startsWith('-') ? 'down' : 'up'}`}>
                较昨日 {todayTrend.startsWith('-') ? '' : '↑'}{todayTrend.replace(/^\+/, '')}
              </span>
            ) : (
              <span className="talent-home__stat-trend muted">实时统计</span>
            )}
          </div>
          <MiniSparkline items={stats.dailyTrend} />
        </Link>

        <Link to="/hall?tab=recommend" className="talent-home__stat-card talent-home__stat-card--blue no-underline">
          <div className="talent-home__stat-body">
            <span className="talent-home__stat-label">匹配推荐</span>
            <span className="talent-home__stat-value">{matchCount.toLocaleString('zh-CN')}</span>
            <span className="talent-home__stat-sub">
              {matchCount > 0 ? `有 ${matchCount} 个订单适合你` : '完善资料获取智能匹配'}
            </span>
          </div>
          <ChevronRight size={20} className="talent-home__stat-chev" aria-hidden />
        </Link>

        <Link to="/orders" className="talent-home__stat-card talent-home__stat-card--orange no-underline">
          <div className="talent-home__stat-body">
            <span className="talent-home__stat-label">待处理报名</span>
            <span className="talent-home__stat-value">{pendingCount.toLocaleString('zh-CN')}</span>
            <span className="talent-home__stat-sub">尽快处理，提升合作率</span>
          </div>
          <ChevronRight size={20} className="talent-home__stat-chev" aria-hidden />
        </Link>
      </div>

      <AiTokenUsagePanel />

      <div className="talent-home__body">
        <div className="talent-home__left">
          <section className="talent-home__panel">
            <h3 className="talent-home__panel-title">快捷入口</h3>
            <div className="talent-home__quick-grid">
              <div className="talent-home__quick-card talent-home__quick-card--purple">
                <div className="talent-home__quick-icon">
                  <Send size={22} strokeWidth={2} aria-hidden />
                </div>
                <div className="talent-home__quick-label">去报名</div>
                <div className="talent-home__quick-sub">发现更多订单机会</div>
                <Link to="/hall?tab=hall" className="talent-home__quick-btn">去报名</Link>
              </div>
              <div className="talent-home__quick-card talent-home__quick-card--blue">
                <div className="talent-home__quick-icon">
                  <UserRound size={22} strokeWidth={2} aria-hidden />
                </div>
                <div className="talent-home__quick-label">完善资料</div>
                <div className="talent-home__quick-sub">完善资料提升匹配率</div>
                <Link to={profileLink} className="talent-home__quick-btn talent-home__quick-btn--blue">去完善</Link>
              </div>
            </div>
          </section>

          <section className="talent-home__panel">
            <h3 className="talent-home__panel-title">平台公告</h3>
            <ul className="talent-home__announce-list">
              {PLATFORM_ANNOUNCEMENTS.map((item) => (
                <li key={item.title}>
                  <Link to="/help" className="talent-home__announce-item no-underline">
                    <div className="talent-home__announce-main">
                      {item.latest ? <span className="talent-home__announce-badge">最新</span> : null}
                      <span className="talent-home__announce-text">{item.title}</span>
                    </div>
                    <span className="talent-home__announce-date">{item.date}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/help" className="talent-home__announce-more">查看更多</Link>
          </section>
        </div>

        <section className="talent-home__panel talent-home__right">
          <h3 className="talent-home__panel-title">最近报名单</h3>
          {appsLoading ? (
            <p className="talent-home__hint">报名单加载中…</p>
          ) : recentApps.length ? (
            <ul className="talent-home__order-list">
              {recentApps.map((item) => {
                const cover = item.coverUrl || ''
                const tags = item.tags
                const appliedLabel = formatAppliedAtShort(item.appliedAt)
                return (
                  <li key={item.mpOrderId}>
                    <div className="talent-home__order-row">
                      <div className="talent-home__order-cover">
                        {cover ? <img src={cover} alt="" /> : <span>📋</span>}
                      </div>
                      <div className="talent-home__order-body">
                        <h4 className="talent-home__order-title">{item.title}</h4>
                        <div className="talent-home__order-tags">
                          {tags.map((tag) => (
                            <span key={tag} className="talent-home__order-tag">{tag}</span>
                          ))}
                        </div>
                        {appliedLabel ? (
                          <p className="talent-home__order-applied">报名时间 {appliedLabel}</p>
                        ) : null}
                      </div>
                      <span className="talent-home__order-status">{item.progressLabel}</span>
                      <Link
                        to={`/recruitment/${encodeURIComponent(item.mpOrderId)}?applied=1`}
                        className="talent-home__order-apply talent-home__order-apply--outline"
                      >
                        查看详情
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="talent-home__order-empty">
              <p>暂无报名记录</p>
              <Link to="/hall?tab=hall" className="talent-home__order-empty-link">去招募大厅报名</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PrHomeDashboard({ stats, loading, err, onRetry }: {
  stats: HallDashboardStats
  loading: boolean
  err: string
  onRetry: () => void
}) {
  return (
    <div className="dash-home">
      {loading ? <p className="dash-home__hint">加载数据中…</p> : null}
      {err ? (
        <p className="dash-home__err">
          {err}
          <button type="button" className="dash-home__retry" onClick={onRetry}>刷新重试</button>
        </p>
      ) : null}

      <div className="dash-stat-grid">
            {PR_STAT_CARDS.map((c) => {
              const Icon = c.icon
              const value = stats[c.key] as number
              let trend: string | null = null
              if (c.key === 'todayNew') trend = pctDelta(stats.todayNew, stats.yesterdayNew)
              return (
                <Link
                  key={c.key}
                  to={c.to}
                  className={`dash-stat-card dash-stat-card--${c.tone} no-underline`}
                >
                  <div className="dash-stat-card__body">
                    <div className="dash-stat-card__title">
                      {c.label}
                      <Info size={14} className="dash-stat-card__info" aria-hidden />
                    </div>
                    <div className="dash-stat-card__value">{value.toLocaleString('zh-CN')}</div>
                    {trend ? (
                      <div className={`dash-stat-card__trend ${trend.startsWith('-') ? 'down' : 'up'}`}>
                        较昨日 {trend} {trend.startsWith('-') ? '↓' : '↑'}
                      </div>
                    ) : (
                      <div className="dash-stat-card__trend muted">实时统计</div>
                    )}
                  </div>
                  <div className={`dash-stat-card__icon dash-stat-card__icon--${c.tone}`}>
                    <Icon size={22} strokeWidth={2} />
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="dash-chart-grid">
            <div className="dash-panel">
              <div className="dash-panel__head">
                <h3 className="dash-panel__title">平台撮合单趋势</h3>
                <span className="dash-panel__chip">近7天</span>
              </div>
              <TrendBarChart items={stats.dailyTrend} />
            </div>

            <div className="dash-panel">
              <div className="dash-panel__head">
                <h3 className="dash-panel__title">招募状态分布</h3>
              </div>
              <StatusDonut stats={stats} />
            </div>

            <div className="dash-panel">
              <div className="dash-panel__head">
                <h3 className="dash-panel__title">行业类目分布</h3>
                <span className="dash-panel__chip">全部</span>
              </div>
              <CategoryBars items={stats.categoryCounts} total={stats.total} />
            </div>
          </div>

          <AiTokenUsagePanel />

          <section className="dash-dynamics">
            <h3 className="dash-dynamics__title">平台动态</h3>
            <div className="dash-dynamics-grid">
              {stats.dynamicCards.map((card) => {
                const Icon = DYNAMIC_ICONS[card.tone]
                const to = DYNAMIC_LINKS[card.label] || '/orders'
                return (
                  <Link
                    key={card.label}
                    to={to}
                    className={`dash-dynamic-card dash-dynamic-card--${card.tone} no-underline`}
                  >
                    <div className={`dash-dynamic-card__icon dash-dynamic-card__icon--${card.tone}`}>
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    <div className="dash-dynamic-card__body">
                      <div className="dash-dynamic-card__label">{card.label}</div>
                      <div className="dash-dynamic-card__row">
                        <span className="dash-dynamic-card__value">{card.count}</span>
                        {card.delta !== 0 ? (
                          <span className={`dash-dynamic-card__delta ${card.delta < 0 ? 'down' : 'up'}`}>
                            今日 {card.delta > 0 ? '+' : ''}{card.delta}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight size={18} className="dash-dynamic-card__chev" aria-hidden />
                  </Link>
                )
              })}
            </div>
          </section>
    </div>
  )
}

export default function HallHomeDashboard() {
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<HallDashboardStats | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        if (!alive) return
        const identity = role === 'pr' ? 'pr' : workId
        const next = buildHallDashboardStats(reg, identity)
        setStats(next)
        const mpCount = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders.length : 0
        if (mpCount === 0 && next.total === 0) {
          setErr('暂未拉取到招募单数据，请刷新重试')
        }
      } catch (e) {
        if (!alive) return
        setErr(e instanceof Error ? e.message : '加载失败')
        setStats(emptyHallDashboardStats())
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [role, workId, refreshKey])

  function retryLoad() {
    clearMpRegistryCache()
    setRefreshKey((k) => k + 1)
  }

  if (role === 'pr') {
    return (
      <PrHomeDashboard
        stats={stats ?? emptyHallDashboardStats()}
        loading={loading}
        err={err}
        onRetry={retryLoad}
      />
    )
  }

  return (
    <TalentHomeDashboard
      stats={stats ?? emptyHallDashboardStats()}
      loading={loading}
      err={err}
      onRetry={retryLoad}
      workId={workId}
      refreshKey={refreshKey}
    />
  )
}
