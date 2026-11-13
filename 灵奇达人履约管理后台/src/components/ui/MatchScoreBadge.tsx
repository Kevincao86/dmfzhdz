type Props = {
  score?: number | null
  className?: string
}

export default function MatchScoreBadge({ score, className = '' }: Props) {
  const n = Number(score ?? 0)
  if (!Number.isFinite(n) || n <= 0) return null
  const tier = n >= 85 ? 'high' : n >= 70 ? 'mid' : 'low'
  return (
    <span className={`match-score-badge match-score-badge--${tier} ${className}`.trim()} title="AI 匹配分">
      匹配 {Math.round(n)}
    </span>
  )
}
