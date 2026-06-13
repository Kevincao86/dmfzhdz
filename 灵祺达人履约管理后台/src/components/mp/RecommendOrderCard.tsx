import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Star, Zap } from 'lucide-react'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { platformIconClass } from '../../lib/mpRecruitment/hallFilters'
import { isOrderFavorited, toggleOrderFavorite } from '../../lib/mpSync/orderFavorites'

type Props = {
  row: RecruitmentOrderRow
  coverUrl?: string
  onDetail?: () => void
}

function categoryLabel(category: string): string {
  const c = String(category || '').trim()
  if (c.includes('美妆')) return '美妆个护'
  if (c.includes('餐饮') || c.includes('美食')) return '食品饮料'
  if (c.includes('数码') || c.includes('3C')) return '3C数码'
  if (c.includes('服饰') || c.includes('穿搭')) return '服饰穿搭'
  return c || '商单合作'
}

function coopFormat(row: RecruitmentOrderRow): string {
  if (row.isIce) return '云剪任务'
  const p = String(row.platform || '')
  if (p.includes('直播')) return '短视频 + 直播'
  if (p.includes('小红书')) return '图文 + 短视频'
  return '短视频'
}

function publishLabel(ms: number): string {
  if (!ms) return '待定'
  try {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return '待定'
  }
}

function budgetRange(row: RecruitmentOrderRow): string {
  if (row.hideBudget) return '面议'
  const text = row.budgetDisplay.kind === 'text' ? row.budgetDisplay.line || row.budgetText : row.budgetText
  if (text && /[-–—]/.test(text)) return text
  const amt = row.priceAmount
  if (amt > 0) {
    const low = Math.max(Math.round(amt * 0.8), 0)
    const high = Math.round(amt * 1.2)
    return `¥${low.toLocaleString('zh-CN')} - ¥${high.toLocaleString('zh-CN')}`
  }
  return text || '面议'
}

function summaryLine(row: RecruitmentOrderRow): string {
  const raw =
    String(row.summary || '').trim() ||
    String(row.recruitmentInfo || '').trim() ||
    String(row.merchantRequirements || '').trim()
  if (!raw) return '合作内容详见商单详情'
  const line = raw.replace(/\s+/g, ' ')
  return line.length > 72 ? `${line.slice(0, 70)}…` : line
}

export default function RecommendOrderCard({ row, coverUrl, onDetail }: Props) {
  const [favorited, setFavorited] = useState(() => isOrderFavorited(row.id))
  const score = Math.min(100, Math.max(0, Math.round(row.matchScore || 0)))
  const platform = String(row.platform || '抖音').trim()
  const cover = coverUrl || (row as { coverImage?: string }).coverImage

  function onFavorite(e: MouseEvent) {
    e.stopPropagation()
    setFavorited(toggleOrderFavorite(row.id))
  }

  return (
    <article className="recommend-order-card">
      <button type="button" className="recommend-order-card__fav" onClick={onFavorite} aria-pressed={favorited}>
        <Star size={18} strokeWidth={2} fill={favorited ? 'currentColor' : 'none'} />
      </button>

      <div className="recommend-order-card__cover">
        {cover ? <img src={cover} alt="" /> : <span className="recommend-order-card__cover-ph">📋</span>}
      </div>

      <div className="recommend-order-card__body">
        <div className="recommend-order-card__title-row">
          <h3 className="recommend-order-card__title">{row.title}</h3>
          <span className="recommend-order-card__tag">{categoryLabel(row.category)}</span>
        </div>
        <p className="recommend-order-card__desc">合作内容：{summaryLine(row)}</p>
        <div className="recommend-order-card__meta">
          <span className="recommend-order-card__meta-item">
            <span className={`hall-platform-icon ${platformIconClass(platform)}`} aria-hidden />
            {platform}
          </span>
          <span className="recommend-order-card__meta-item">粉丝要求 {row.fansRequirement || '不限'}</span>
          <span className="recommend-order-card__meta-item">预计发布 {publishLabel(row.publishedAtMs)}</span>
          <span className="recommend-order-card__meta-item">合作形式 {coopFormat(row)}</span>
        </div>
      </div>

      <div className="recommend-order-card__side">
        <div className="recommend-order-card__match">
          <div className="recommend-order-card__match-head">
            <span>匹配度</span>
            <strong>{score > 0 ? `${score}%` : '—'}</strong>
          </div>
          <div className="recommend-order-card__match-bar">
            <div className="recommend-order-card__match-fill" style={{ width: `${score || 0}%` }} />
          </div>
        </div>
        <p className="recommend-order-card__budget">
          <span className="recommend-order-card__budget-label">预算范围</span>
          <span className="recommend-order-card__budget-value">{budgetRange(row)}</span>
        </p>
        <Link
          to={`/recruitment/${encodeURIComponent(row.id)}/apply`}
          className="recommend-order-card__apply"
          onClick={(e) => e.stopPropagation()}
        >
          <Zap size={15} strokeWidth={2.5} aria-hidden />
          一键报名
        </Link>
        {onDetail ? (
          <button type="button" className="recommend-order-card__detail-link" onClick={onDetail}>
            查看详情
          </button>
        ) : null}
      </div>
    </article>
  )
}
