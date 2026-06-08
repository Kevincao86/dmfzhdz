import { Link } from 'react-router-dom'
import LoginPortalNav from '../components/login/LoginPortalNav'
import type { HelpManualEdition } from '../lib/helpManualTypes'
import { LEGAL_COMPANY_NAME, productNameForEdition } from '../lib/legalProductMeta'

type Props = { edition: HelpManualEdition }

export default function TeamIntroPage({ edition }: Props) {
  const product = productNameForEdition(edition)
  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <LoginPortalNav />
          <Link to="/login" className="text-sm font-medium text-cyan-700 hover:underline">
            登录
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold">团队介绍</h1>
        <p className="mt-2 text-sm text-slate-500">{LEGAL_COMPANY_NAME}</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            {LEGAL_COMPANY_NAME} 专注本地生活数字化与达人经济基础设施，运营 {product}，
            为商户、服务商、达人及 PR 提供招募协作、智能运营与履约管理一体化能力。
          </p>
          <p>
            我们相信「简单生意需要简单工具」——通过 AI 辅助、数据打通与多端协同，帮助客户降低运营成本、
            提升转化效率，共建健康可持续的本地生活达人生态。
          </p>
          <p>
            产品覆盖商家 ERP、服务商协同、星选履约平台与运营管控体系，数据经加密传输与权限隔离，
            持续迭代以满足行业合规与业务增长需求。
          </p>
        </div>
      </main>
    </div>
  )
}
