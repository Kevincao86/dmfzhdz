import MerchantShopEvalPanel from '../components/home/MerchantShopEvalPanel'

export default function HealthAnalysisPage() {
  return (
    <div className="space-y-6">
      <div className="relative pl-4">
        <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-px bg-[#1E3A5F]" aria-hidden />
        <h1 className="erp-page-title">健康分析</h1>
        <p className="mt-1 text-sm text-slate-600">评估门店经营，并按同一次选择生成分析提升</p>
      </div>
      <MerchantShopEvalPanel />
    </div>
  )
}
