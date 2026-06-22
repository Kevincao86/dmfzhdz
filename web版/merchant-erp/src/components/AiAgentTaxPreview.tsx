import type { AiTaxFilingPreview } from '../lib/aiAgentTypes'

export function AiAgentTaxPreview({ tax }: { tax: AiTaxFilingPreview }) {
  if (tax.enrichStatus === 'loading') {
    return <p className="text-sm text-slate-500">正在汇总各平台对账与绑定状态…</p>
  }
  if (tax.enrichStatus === 'error') {
    return <p className="text-sm text-rose-600">{tax.enrichError || '报税数据加载失败'}</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium text-slate-800">
        申报周期：{tax.periodLabel}（{tax.startDate} ~ {tax.endDate}）
      </p>
      <p className="text-slate-600">
        核销合计（参考）：<span className="font-semibold tabular-nums">¥{tax.totalVerifyYuan.toLocaleString('zh-CN')}</span>
        {typeof tax.totalCommissionYuan === 'number' ? (
          <>
            {' '}
            · 平台佣金合计（粗算）：{' '}
            <span className="font-semibold tabular-nums text-amber-800">
              ¥{tax.totalCommissionYuan.toLocaleString('zh-CN')}
            </span>
          </>
        ) : null}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-2">平台</th>
              <th className="px-2 py-2">绑定</th>
              <th className="px-2 py-2 text-right">核销额</th>
              <th className="px-2 py-2 text-right">佣金</th>
            </tr>
          </thead>
          <tbody>
            {tax.platforms.map((p) => (
              <tr key={p.platformId} className="border-t border-slate-100">
                <td className="px-2 py-2 text-slate-800">{p.platformLabel}</td>
                <td className="px-2 py-2 text-slate-500">{p.bindingLabel}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  ¥{p.verifyAmountYuan.toLocaleString('zh-CN')}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-800">
                  {typeof p.commissionAmountYuan === 'number'
                    ? `¥${p.commissionAmountYuan.toLocaleString('zh-CN')} (${p.commissionRatePct ?? '—'}%)`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        确认后将导出申报数据包并记录申报状态；正式税局接口对接后可替换为真实一键申报。
      </p>
    </div>
  )
}
