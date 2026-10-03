import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { phoneRegister, sendRegisterSms } from '../lib/mpApi'
import { applyWorkIdentityAfterLogin } from '../lib/switchWorkIdentity'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { workIdentityToAccountRole, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import './RegisterPage.css'

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
}

const IDENTITY_SCENES: Record<MpWorkIdentity, { label: string; line: string; file: string }> = {
  talent: { label: '我是达人', line: '看带货等级，报名商单', file: 'reg-talent.jpg' },
  shoot: { label: '我是拍摄', line: '接拍摄任务，去看课程', file: 'reg-shoot.jpg' },
  edit: { label: '我是剪辑', line: '接剪辑任务，交成片', file: 'reg-edit.jpg' },
  pr: { label: '我是PR', line: '发布招募，对接达人', file: 'reg-pr.jpg' },
}

const IDENTITY_OPTIONS = Object.keys(IDENTITY_SCENES) as MpWorkIdentity[]

export default function RegisterPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const preset = params.get('role')
  const [workIdentity, setWorkIdentity] = useState<MpWorkIdentity>(
    preset === 'pr' || preset === 'shoot' || preset === 'edit' || preset === 'talent' ? preset : 'talent',
  )

  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [sceneKey, setSceneKey] = useState(0)
  const scene = IDENTITY_SCENES[workIdentity]

  function pickIdentity(id: MpWorkIdentity) {
    setWorkIdentity(id)
    setSceneKey((n) => n + 1)
  }

  async function onSendSms() {
    const p = normalizePhone(phone)
    if (!p) {
      setErr('请输入有效大陆手机号')
      return
    }
    setErr('')
    try {
      await sendRegisterSms(p)
      setSmsCooldown(60)
      const t = setInterval(() => {
        setSmsCooldown((c) => {
          if (c <= 1) {
            clearInterval(t)
            return 0
          }
          return c - 1
        })
      }, 1000)
    } catch (e) {
      setErr(formatMpApiErr(e, '验证码发送失败'))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = normalizePhone(phone)
    if (!p) {
      setErr('请输入有效大陆手机号')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入 6 位验证码')
      return
    }
    if (password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      setErr('两次输入的密码不一致')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const { token, account } = await phoneRegister({
        phone: p,
        smsCode: smsCode.trim(),
        password,
        role: workIdentityToAccountRole(workIdentity),
        workIdentity,
      })
      await applyWorkIdentityAfterLogin(token, account, workIdentity)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(formatMpApiErr(e, '注册失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="reg-page">
      <form onSubmit={onSubmit} className="reg-card">
        <div className={`reg-stage reg-stage--${workIdentity}`} key={sceneKey}>
          <img className="reg-stage__img" src={`/register-identity/${scene.file}?v=20261003d`} alt="" />
          <div className="reg-stage__flash" />
          <div className="reg-stage__bars" />
        </div>
        <p className="reg-stage__line" key={`line-${sceneKey}`}>{scene.line}</p>
        <h1 className="reg-title">注册 · {scene.label}</h1>
        <p className="reg-note">手机号就是登录账号。身份选定后不可更改，之后登录自动进入这一版。</p>
        <div className="reg-picks">
          {IDENTITY_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={workIdentity === id ? 'reg-pick reg-pick--on' : 'reg-pick'}
              onClick={() => pickIdentity(id)}
            >
              {IDENTITY_SCENES[id].label}
            </button>
          ))}
        </div>

        <label className="reg-field">
          <span>手机号</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11 位大陆手机号"
          />
        </label>

        <div className="reg-sms">
          <input
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位验证码"
            aria-label="验证码"
          />
          <button type="button" disabled={smsCooldown > 0} onClick={() => void onSendSms()}>
            {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
          </button>
        </div>

        <label className="reg-field">
          <span>密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="reg-field">
          <span>确认密码</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>

        {err ? <p className="reg-err">{err}</p> : null}

        <button type="submit" className="reg-submit" disabled={loading}>
          {loading ? '提交中…' : '注册并进入工作台'}
        </button>

        <p className="reg-login">
          已有账号？ <Link to="/login">去登录</Link>
        </p>
      </form>
    </div>
  )
}
