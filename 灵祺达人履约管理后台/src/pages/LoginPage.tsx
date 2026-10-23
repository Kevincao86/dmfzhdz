import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LoginLegalFooter from '@merchant/components/login/LoginLegalFooter'
import LoginPortalNav from '@merchant/components/login/LoginPortalNav'
import {
  isRememberLoginEnabled,
  readRememberedLogin,
  writeRememberedLogin,
} from '@merchant/lib/rememberLogin'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { passwordLogin } from '../lib/mpApi'
import type { MpAccount } from '../lib/mpSession'
import { enterDevPreview } from '../lib/mpSession'
import { applyWorkIdentityAfterLogin } from '../lib/switchWorkIdentity'
import { workIdentityToAccountRole } from '../lib/mpWorkIdentity'
import TalentLoginAuthPanel, { type LoginTab } from './login/TalentLoginAuthPanel'

const REMEMBER_SCOPE = 'fulfillment'

export default function LoginPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const workIdentity = 'talent' as const

  const [tab, setTab] = useState<LoginTab>('sms')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(() => isRememberLoginEnabled(REMEMBER_SCOPE))
  const [videoOn, setVideoOn] = useState(true)

  useEffect(() => {
    const saved = readRememberedLogin(REMEMBER_SCOPE)
    if (saved) {
      setLoginName(saved.loginName)
      setPassword(saved.password)
      setRememberPassword(true)
    }
  }, [])

  async function onPasswordLogin() {
    setErr('')
    setLoading(true)
    try {
      const { token, account } = await passwordLogin(loginName.trim(), password)
      if (rememberPassword) {
        writeRememberedLogin(REMEMBER_SCOPE, { loginName: loginName.trim(), password })
      } else {
        writeRememberedLogin(REMEMBER_SCOPE, null)
      }
      await applyWorkIdentityAfterLogin(token, account, workIdentity)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(formatMpApiErr(e, '登录失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  async function onScanLoginSuccess(token: string, account: MpAccount) {
    await applyWorkIdentityAfterLogin(token, account, workIdentity)
    if (account.needsPhoneBind) return
    nav('/hall', { replace: true })
  }

  function onDevPreview() {
    enterDevPreview(workIdentityToAccountRole(workIdentity))
    nav('/hall', { replace: true })
  }

  return (
    <div className="grid min-h-[100dvh] bg-[#1a100e] text-[#f6f1ea] lg:grid-cols-[minmax(0,1fr)_minmax(440px,600px)]">
      <div className="relative min-h-[42dvh] overflow-hidden bg-[#120c0a] lg:min-h-[100dvh]">
        {videoOn ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src="/landing/login-visit-40.mp4"
            poster="/landing/portrait-shop.jpg"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoOn(false)}
          />
        ) : (
          <img src="/landing/portrait-shop.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <div className="flex min-h-[100dvh] flex-col justify-center overflow-auto px-6 py-8 sm:px-10">
        <div className="mb-8">
          <LoginPortalNav linkClassName="text-[#f6f1ea]/70 hover:text-white" activeClassName="text-white" />
        </div>
        <h1
          className="m-0 font-medium text-[#f6f1ea]"
          style={{
            fontFamily: '"Noto Serif SC", "Songti SC", serif',
            fontSize: 'clamp(44px, 4.2vw, 68px)',
            lineHeight: 1.2,
            letterSpacing: '0.06em',
            marginBottom: 24,
          }}
        >
          灵祺星选
        </h1>
        <p className="mb-9 max-w-[20em] text-base text-[#f7f1e8]" style={{ lineHeight: 1.85 }}>
          达人探店、商单和审片在同一处。
          <br />
          用小程序同一套账号登录。
        </p>
        <div className="w-full rounded-[28px] bg-[#f4efe6] px-6 py-7 text-[#1a140f] shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:px-8">
          <TalentLoginAuthPanel
            tab={tab}
            onTabChange={setTab}
            loginName={loginName}
            onLoginNameChange={setLoginName}
            password={password}
            onPasswordChange={setPassword}
            err={err}
            loading={loading}
            onPasswordLogin={onPasswordLogin}
            workIdentity={workIdentity}
            onScanLoginSuccess={onScanLoginSuccess}
            showDevPreview={import.meta.env.DEV}
            onDevPreview={onDevPreview}
            rememberPassword={rememberPassword}
            onRememberPasswordChange={setRememberPassword}
            bindPending={params.get('bind') === '1'}
          />
          <p className="mt-4 text-center text-sm text-[#5c5348]">
            还没有账号？{' '}
            <Link to="/register" className="font-semibold text-[#1a140f] underline">
              手机号注册
            </Link>
          </p>
          <LoginLegalFooter />
        </div>
      </div>
    </div>
  )
}
