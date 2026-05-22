import { Loader2 } from 'lucide-react'
import {
  DouyinProductMobilePreviewFrame,
  type DouyinPreviewComboLine,
} from './douyin/DouyinProductMobilePreview'
import { defaultAiAgentPreviewFormRules } from '../lib/aiAgentProductPreviewDefaults'
import { coerceAgentDisplayError } from '../lib/aiAgentActionParse'
import type { AiProductPlanPreview } from '../lib/aiAgentTypes'

export function AiAgentProductVisualPreview({
  plan,
  slotLabel,
}: {
  plan: AiProductPlanPreview
  slotLabel?: string
}) {
  const label = slotLabel ?? plan.slotLabel
  if (plan.enrichStatus === 'loading') {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-indigo-100 bg-white py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="mt-3 text-sm text-slate-600">正在优化标题并生成团购主图…</p>
        <p className="mt-1 text-xs text-slate-400">完成后将展示 C 端预览效果</p>
      </div>
    )
  }

  const comboLines: DouyinPreviewComboLine[] = plan.comboLines
    .map((line) => ({
      name: typeof line === 'string' ? line : coerceAgentDisplayError(line, ''),
      qty: '1',
      price: '',
    }))
    .filter((it) => it.name.trim() && it.name !== '[object Object]')

  const productType = plan.productType ?? (/代金券|代\d+抵/.test(plan.productName) ? 2 : 1)

  const enrichErr = plan.enrichError
    ? coerceAgentDisplayError(plan.enrichError, '')
    : ''

  return (
    <div className="mt-4 space-y-3">
      {label ? (
        <p className="text-center text-sm font-semibold text-violet-900">{label}</p>
      ) : null}
      <p className="text-center text-xs font-medium text-indigo-800">抖音来客团购 · C 端预览</p>
      <div className="flex justify-center rounded-xl border border-indigo-100 bg-gradient-to-b from-slate-50 to-white p-4">
        <DouyinProductMobilePreviewFrame
          embedded
          productName={plan.productName}
          productDesc={plan.description}
          priceYuan={String(plan.suggestedPriceYuan)}
          originYuan={plan.originYuan != null ? String(plan.originYuan) : ''}
          headUrl={plan.headUrl ?? ''}
          envUrls={[]}
          productType={productType}
          comboLines={comboLines}
          poiCount={1}
          formRules={defaultAiAgentPreviewFormRules()}
        />
      </div>
      {enrichErr ? <p className="text-center text-xs text-amber-700">{enrichErr}</p> : null}
      <p className="text-center text-[11px] text-slate-500">
        确认后将按此方案提交抖音来客审核；如需改价、换图或售后规则，可在提交前于创建页微调。
      </p>
    </div>
  )
}
