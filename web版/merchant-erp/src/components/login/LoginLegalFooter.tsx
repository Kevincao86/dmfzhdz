import SiteIcpFooter from '../SiteIcpFooter'
import { LEGAL_COMPANY_NAME } from '../../lib/legalProductMeta'

export default function LoginLegalFooter() {
  const year = new Date().getFullYear()
  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-center text-xs leading-relaxed text-slate-400">
        © {year} {LEGAL_COMPANY_NAME} Copyright. All Rights Reserved.
      </p>
      <SiteIcpFooter />
    </div>
  )
}
