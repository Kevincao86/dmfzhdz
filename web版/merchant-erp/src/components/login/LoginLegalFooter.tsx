import { Link } from 'react-router-dom'
import SiteIcpFooter from '../SiteIcpFooter'

export default function LoginLegalFooter() {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-center text-xs leading-relaxed text-slate-500">
        查看{' '}
        <Link to="/legal/aup" className="text-cyan-700 hover:underline">
          软件服务及许可协议
        </Link>{' '}
        和{' '}
        <Link to="/legal/privacy" className="text-cyan-700 hover:underline">
          隐私政策
        </Link>
      </p>
      <SiteIcpFooter />
    </div>
  )
}
