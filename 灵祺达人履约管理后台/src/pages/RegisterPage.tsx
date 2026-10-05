import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { emailRegister, phoneRegister, sendEmailCode, sendRegisterSms } from '../lib/mpApi'
import { applyWorkIdentityAfterLogin } from '../lib/switchWorkIdentity'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { workIdentityToAccountRole, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import './RegisterPage.css'

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
}

function normalizeEmail(raw: string) {
  const mail = raw.trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(mail)) return ''
  return mail
}

function startCooldown(setCooldown: React.Dispatch<React.SetStateAction<number>>) {
  setCooldown(60)
  const t = setInterval(() => {
    setCooldown((c) => {
      if (c <= 1) {
        clearInterval(t)
        return 0
      }
      return c - 1
    })
  }, 1000)
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

  const [channel, setChannel] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [mailCooldown, setMailCooldown] = useState(0)
  const [playing, setPlaying] = useState(true)
  const scene = IDENTITY_SCENES[workIdentity]

  function pickIdentity(id: MpWorkIdentity) {
    setWorkIdentity(id)
    setPlaying(false)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setPlaying(true))
    })
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
      startCooldown(setSmsCooldown)
    } catch (e) {
      setErr(formatMpApiErr(e, '验证码发送失败'))
    }
  }

  async function onSendMail() {
    const mail = normalizeEmail(email)
    if (!mail) {
      setErr('请输入有效邮箱')
      return
    }
    setErr('')
    try {
      await sendEmailCode(mail)
      startCooldown(setMailCooldown)
    } catch (e) {
      setErr(formatMpApiErr(e, '邮箱验证码发送失败'))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const useEmail = channel === 'email'
    const p = normalizePhone(phone)
    const mail = normalizeEmail(email)
    if (useEmail) {
      if (!mail) {
        setErr('请输入有效邮箱')
        return
      }
      if (!/^\d{6}$/.test(emailCode.trim())) {
        setErr('请输入 6 位邮箱验证码')
        return
      }
    } else {
      if (!p) {
        setErr('请输入有效大陆手机号')
        return
      }
      if (!/^\d{6}$/.test(smsCode.trim())) {
        setErr('请输入 6 位验证码')
        return
      }
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
      const role = workIdentityToAccountRole(workIdentity)
      const { token, account } = useEmail
        ? await emailRegister({
            email: mail,
            emailCode: emailCode.trim(),
            password,
            role,
            workIdentity,
          })
        : await phoneRegister({
            phone: p,
            smsCode: smsCode.trim(),
            password,
            role,
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
    <div className={`reg-page reg-page--${workIdentity}${playing ? ' reg-page--play' : ''}`}>
      <img className="reg-page__bg" src={`/register-identity/${scene.file}?v=20261003d`} alt="" />
      <div className="reg-fx reg-fx--wash" aria-hidden="true" />
      <div className="reg-fx reg-fx--flash" aria-hidden="true" />
      <div className="reg-fx reg-fx--bar reg-fx--bar-top" aria-hidden="true" />
      <div className="reg-fx reg-fx--bar reg-fx--bar-bot" aria-hidden="true" />
      <form onSubmit={onSubmit} className="reg-card">
        <div className="reg-stage">
          <img className="reg-stage__img" src={`/register-identity/${scene.file}?v=20261003d`} alt="" />
        </div>
        <p className="reg-stage__line">{scene.line}</p>
        <h1 className="reg-title">注册 · {scene.label}</h1>
        <p className="reg-note">手机号或邮箱就是登录账号。身份选定后不可更改，之后登录自动进入这一版。</p>
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

        <div className="reg-channels">
          <button
            type="button"
            className={channel === 'phone' ? 'reg-channel reg-channel--on' : 'reg-channel'}
            onClick={() => {
              setChannel('phone')
              setErr('')
            }}
          >
            手机号注册
          </button>
          <button
            type="button"
            className={channel === 'email' ? 'reg-channel reg-channel--on' : 'reg-channel'}
            onClick={() => {
              setChannel('email')
              setErr('')
            }}
          >
            邮箱注册
          </button>
        </div>

        {channel === 'phone' ? (
          <>
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
          </>
        ) : (
          <>
            <label className="reg-field">
              <span>邮箱</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                placeholder="邮箱"
                inputMode="email"
                autoComplete="email"
              />
            </label>
            <div className="reg-sms">
              <input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位邮箱验证码"
                aria-label="邮箱验证码"
              />
              <button type="button" disabled={mailCooldown > 0} onClick={() => void onSendMail()}>
                {mailCooldown > 0 ? `${mailCooldown}s` : '获取验证码'}
              </button>
            </div>
          </>
        )}

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
