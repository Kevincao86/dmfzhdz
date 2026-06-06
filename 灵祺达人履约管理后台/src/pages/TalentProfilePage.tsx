import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { fetchSession, registerTalentMember, setLoginCredentials } from '../lib/mpApi'
import { getAccount, getActiveRole, getToken, setSession } from '../lib/mpSession'
import { labels } from '../lib/mpSync/platformLabels'
import { DOUYIN_LEVELS, validatePlatformProfile } from '../lib/mpSync/platformForm'
import {
  TALENT_PLATFORMS,
  emptyAllProfiles,
  type PlatformProfile,
  type TalentMember,
} from '../lib/mpSync/talentPlatformProfiles'
import { readMember, writeMember } from '../lib/mpSync/talentMember'
import { inferLegacyMemberType } from '../lib/mpSync/talentPlatformProfiles'
import { validateBasicContactFields } from '../lib/mpSync/basicContactFields'
import { readWxAccount, writeWxAccount } from '../lib/mpSync/wxAccount'

export default function TalentProfilePage() {
  if (getActiveRole() !== 'talent') return <Navigate to="/profile" replace />

  const acc = getAccount()
  const [member, setMember] = useState<TalentMember>(() => {
    const prev = readMember()
    const wx = readWxAccount()
    const profiles = prev?.platformProfiles || emptyAllProfiles()
    return {
      id: prev?.id || acc?.registryMemberId || `MTM-${Date.now()}`,
      lingqiTalentId: prev?.lingqiTalentId || acc?.lingqiTalentId || '',
      wxNickName: prev?.wxNickName || wx?.wxNickName || acc?.wxNickName || '',
      wxAvatarUrl: prev?.wxAvatarUrl || wx?.wxAvatarUrl || '',
      contact: prev?.contact || '',
      wechatId: prev?.wechatId || '',
      alipayAccount: prev?.alipayAccount || '',
      province: prev?.province || '',
      city: prev?.city || '',
      platformProfiles: profiles,
      registeredAt: prev?.registeredAt,
    }
  })
  const [activePlatform, setActivePlatform] = useState('douyin')
  const [loginName, setLoginName] = useState(acc?.loginName || '')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(!!acc?.hasPassword)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!getToken()) return
    void fetchSession()
      .then(({ account }) => {
        setSession(getToken(), account)
        setLoginName(account.loginName || '')
        setHasPassword(!!account.hasPassword)
        if (account.lingqiTalentId) {
          setMember((m) => ({
            ...m,
            lingqiTalentId: account.lingqiTalentId || m.lingqiTalentId,
            id: account.registryMemberId || m.id,
          }))
        }
      })
      .catch(() => {})
  }, [])

  const prof = member.platformProfiles[activePlatform] || emptyAllProfiles()[activePlatform]
  const lb = labels(TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name || '抖音')

  function patchMember(patch: Partial<TalentMember>) {
    setMember((m) => ({ ...m, ...patch }))
  }

  function patchProfile(patch: Partial<PlatformProfile>) {
    setMember((m) => ({
      ...m,
      platformProfiles: {
        ...m.platformProfiles,
        [activePlatform]: { ...prof, enabled: true, ...patch },
      },
    }))
  }

  useEffect(() => {
    writeWxAccount({ wxNickName: member.wxNickName, wxAvatarUrl: member.wxAvatarUrl })
  }, [member.wxNickName, member.wxAvatarUrl])

  async function onSave() {
    const enabled = TALENT_PLATFORMS.filter((p) => member.platformProfiles[p.id]?.enabled)
    if (!enabled.length) {
      setMsg('请至少启用并填写一个平台资料')
      return
    }
    for (const p of enabled) {
      const prf = member.platformProfiles[p.id]
      const err = validatePlatformProfile(prf, labels(p.name))
      if (err) {
        setMsg(`${p.name}：${err}`)
        setActivePlatform(p.id)
        return
      }
    }
    const contactErr = validateBasicContactFields({
      wxNickName: member.wxNickName,
      contact: member.contact,
      wechatId: member.wechatId,
    })
    if (contactErr) {
      setMsg(contactErr)
      return
    }
    setSaving(true)
    setMsg('')
    const accNow = getAccount()
    const saved: TalentMember = {
      ...member,
      id: accNow?.registryMemberId || member.id,
      lingqiTalentId: accNow?.lingqiTalentId || member.lingqiTalentId,
      memberType: inferLegacyMemberType(member.platformProfiles),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      registeredAt: member.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    writeMember(saved)
    let credWarn = ''
    if (getToken() && loginName.trim()) {
      try {
        const { account } = await setLoginCredentials(loginName.trim(), password)
        setSession(getToken(), account)
        setHasPassword(!!account.hasPassword)
        setPassword('')
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        credWarn = m.includes('login_name_taken') ? '该手机号已被注册' : `登录账号未保存：${m}`
      }
    }
    try {
      const reg = (await registerTalentMember(saved as unknown as Record<string, unknown>)) as {
        lingqiTalentId?: string
        id?: string
      }
      if (reg?.lingqiTalentId) saved.lingqiTalentId = reg.lingqiTalentId
      if (reg?.id) saved.id = reg.id
      writeMember(saved)
      setMsg(credWarn ? `${credWarn}；资料已同步云端` : '已保存并同步云端')
    } catch (e) {
      setMsg(
        credWarn
          ? `${credWarn}；资料已保存本机；云端同步失败：${e instanceof Error ? e.message : String(e)}`
          : `已保存本机；云端同步失败：${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setSaving(false)
      setMember(saved)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">我的信息（达人）</h2>
      {member.lingqiTalentId ? (
        <p className="text-sm text-slate-400">达人 ID：{member.lingqiTalentId}</p>
      ) : null}

      <section className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <p className="text-slate-400 text-xs">登录账号（选填）— 设置后可用账号密码登录，与微信绑定同一灵祺 ID</p>
        <label className="block">
          <span className="text-slate-400">手机号</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))}
            placeholder="字母数字"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">登录密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? '留空则不修改原密码' : '至少 6 位，可不填'}
          />
        </label>
      </section>

      <section className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-slate-400">昵称 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.wxNickName || ''}
            onChange={(e) => patchMember({ wxNickName: e.target.value })}
            placeholder="用于登录与身份展示"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">联系电话 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.contact || ''}
            onChange={(e) => patchMember({ contact: e.target.value })}
            placeholder="便于招募方联系"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">微信号 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.wechatId || ''}
            onChange={(e) => patchMember({ wechatId: e.target.value })}
            placeholder="请填写微信号（非微信昵称）"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">支付宝账号</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.alipayAccount || ''}
            onChange={(e) => patchMember({ alipayAccount: e.target.value })}
          />
        </label>
        <RegionSelect
          province={member.province || ''}
          city={member.city || ''}
          onChange={(province, city) => patchMember({ province, city })}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        {TALENT_PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`px-3 py-1.5 rounded-full text-sm ${activePlatform === p.id ? 'bg-violet-600' : 'bg-white/10'}`}
            onClick={() => setActivePlatform(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <section className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!prof.enabled}
            onChange={(e) => patchProfile({ enabled: e.target.checked })}
          />
          启用 {TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name} 资料
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.nickname}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.platformNickname || ''}
            onChange={(e) => patchProfile({ platformNickname: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.accountId}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.platformAccount || ''}
            onChange={(e) => patchProfile({ platformAccount: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.profileLink}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.profileLink || ''}
            onChange={(e) => patchProfile({ profileLink: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.followersLabel}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.followers || ''}
            onChange={(e) => patchProfile({ followers: e.target.value })}
          />
        </label>
        {lb.showSalesLevel ? (
          <label className="block">
            <span className="text-slate-400">抖音带货等级</span>
            <select
              className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
              value={prof.douyinSalesLevel || ''}
              onChange={(e) => patchProfile({ douyinSalesLevel: e.target.value })}
            >
              <option value="">请选择</option>
              {DOUYIN_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="text-slate-400">报价（元）</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.quotePrice || ''}
            onChange={(e) => patchProfile({ quotePrice: e.target.value })}
          />
        </label>
      </section>

      {msg ? <p className="text-sm text-amber-400">{msg}</p> : null}
      <button
        type="button"
        disabled={saving}
        className="px-6 py-2.5 rounded-lg bg-violet-600 font-medium disabled:opacity-50"
        onClick={() => void onSave()}
      >
        {saving ? '保存中…' : '保存资料'}
      </button>
    </div>
  )
}
