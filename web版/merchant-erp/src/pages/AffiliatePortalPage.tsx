import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AffiliatePortalSection from './settings/AffiliatePortalSection'
import { isPartnerEdition } from '../lib/appEdition'

function portalBackFallback(): string {
  if (typeof window === 'undefined') return '/'
  const h = window.location.hostname.toLowerCase()
  if (h.startsWith('dr.') || h.includes('.dr.')) return '/profile'
  return '/settings?tab=affiliate'
}

export default function AffiliatePortalPage() {
  const navigate = useNavigate()
  const partnerSite = isPartnerEdition()

  if (partnerSite) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-600">
        服务商版请在「系统 → 分销设置」中管理内部分销员；个人推广员请使用商家版或星选端。
        <Link to="/settings?tab=partner_distribution" className="mt-4 block text-cyan-600 hover:underline">
          前往分销设置
        </Link>
      </div>
    )
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(portalBackFallback())
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <AffiliatePortalSection />
      </div>
    </div>
  )
}
