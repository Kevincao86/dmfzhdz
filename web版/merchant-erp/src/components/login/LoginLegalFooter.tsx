import { Link } from 'react-router-dom'

export default function LoginLegalFooter() {
  return (
    <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
      查看{' '}
      <Link to="/legal/aup" className="text-cyan-700 hover:underline">
        软件服务及许可协议
      </Link>{' '}
      和{' '}
      <Link to="/legal/privacy" className="text-cyan-700 hover:underline">
        隐私政策
      </Link>
    </p>
  )
}
