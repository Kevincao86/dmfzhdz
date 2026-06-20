import LocalPromotionSection from './LocalPromotionSection'
import QianchuanSection from './QianchuanSection'

/** 巨量工作台：本地推 + 千川（共用巨量 OAuth 应用，独立广告主账号） */
export default function OceanEngineWorkbenchSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
        <h3 className="text-base font-semibold text-slate-900">巨量工作台</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          同一巨量开放平台应用可分别绑定<strong>本地推</strong>与<strong>千川</strong>广告主，投流页将按平台展示直播间 / 短视频 / 线索 / AI 分析。
        </p>
      </div>
      <LocalPromotionSection embedded />
      <QianchuanSection embedded />
    </div>
  )
}
