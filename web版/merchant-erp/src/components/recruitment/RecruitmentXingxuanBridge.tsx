import { ExternalLink } from 'lucide-react'
import { isPartnerEdition } from '../../lib/appEdition'
import { openXingxuanRecruitment, xingxuanWebOrigin } from '../../lib/xingxuanPlatformUrl'

type Props = {
  mpOrderId?: string | null
  /** hub=全流程入口；step=当前环节 */
  variant?: 'hub' | 'step'
  step?: 'applicants' | 'schedule' | 'video-review'
}

export default function RecruitmentXingxuanBridge({ mpOrderId, variant = 'hub', step }: Props) {
  const id = String(mpOrderId || '').trim()
  const partner = isPartnerEdition()

  const links: { label: string; action: () => void }[] =
    variant === 'hub'
      ? [
          { label: '星选 · 发布招募', action: () => openXingxuanRecruitment('publish') },
          { label: '星选 · 招募大厅', action: () => openXingxuanRecruitment('detail') },
          ...(id
            ? [
                { label: '星选 · 报名反选', action: () => openXingxuanRecruitment('applicants', id) },
                { label: '星选 · 探店排期', action: () => openXingxuanRecruitment('schedule', id) },
                { label: '星选 · 视频审核', action: () => openXingxuanRecruitment('video-review', id) },
              ]
            : []),
        ]
      : step && id
        ? [
            {
              label: '在星选平台打开此环节',
              action: () => openXingxuanRecruitment(step, id),
            },
          ]
        : []

  if (!links.length) return null

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <p className="mb-2 text-sm font-semibold text-sky-950">
        {partner ? '服务商 · 星选平台协同' : '星选平台（PR 端）'}
      </p>
      <p className="mb-3 text-xs leading-relaxed text-sky-900/85">
        ERP 发布/反选已与星选共用同一招募注册表；在星选 Web（{xingxuanWebOrigin()}）可完成 PR
        发单、达人/直播/品宣类招募及排期审核。请使用与 ERP 相同的手机号登录星选。
        {partner ? ' 代运营客户数据以顶栏当前客户为准。' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <button
            key={l.label}
            type="button"
            onClick={l.action}
            className="inline-flex items-center rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-50"
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}
