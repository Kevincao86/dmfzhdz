import {
  formatMpPointsRateLabel,
  MP_POINTS_USAGE_KIND_LABELS,
  type MpPointsUsageKind,
} from '../lib/mpPointsEconomics'

type Props = {
  kind: Extract<MpPointsUsageKind, 'shortvideo' | 'cloud_edit' | 'cloud_edit_smart' | 'digital_human'>
  className?: string
}

/** 星选增值 AI 功能页面积分扣费说明 */
export function MpAddonPointsRateBadge({ kind, className }: Props) {
  return (
    <span
      className={
        className ??
        'inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800'
      }
      title={`${MP_POINTS_USAGE_KIND_LABELS[kind]}：${formatMpPointsRateLabel(kind)}；优先消耗套餐 ai_video_quota 次数，超出后按积分扣费`}
    >
      {MP_POINTS_USAGE_KIND_LABELS[kind]} · {formatMpPointsRateLabel(kind)}
    </span>
  )
}

export function MpAddonPointsRatesSummary({ className }: { className?: string }) {
  const kinds: Props['kind'][] = ['shortvideo', 'cloud_edit', 'digital_human']
  return (
    <div className={className ?? 'flex flex-wrap gap-2'}>
      {kinds.map((k) => (
        <MpAddonPointsRateBadge key={k} kind={k} />
      ))}
    </div>
  )
}
