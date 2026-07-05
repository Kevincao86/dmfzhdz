import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { fetchSession, parseProfileLink, registerTalentMember, setLoginCredentials } from '../lib/mpApi'
import { getAccount, getActiveRole, getToken, setSession } from '../lib/mpSession'
import { labels } from '../lib/mpSync/platformLabels'
import { DOUYIN_LEVELS, validatePlatformProfile } from '../lib/mpSync/platformForm'
import {
  TALENT_PLATFORMS,
  emptyAllProfiles,
  type PlatformProfile,
  type TalentMember,
} from '../lib/mpSync/talentPlatformProfiles'
import { pullRegistryProfileAfterLogin } from '../lib/registryProfileSync'
import { readMember, writeMember } from '../lib/mpSync/talentMember'
import { inferLegacyMemberType } from '../lib/mpSync/talentPlatformProfiles'
import { TALENT_TAGS } from '../lib/mpSync/publishFormOptions'
import { validateBasicContactFields } from '../lib/mpSync/basicContactFields'
import { validateRegion } from '../lib/mpSync/regionPicker'
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
      gender: prev?.gender || '',
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
  const [autofillLoading, setAutofillLoading] = useState(false)
  /** 用户已开始编辑后，禁止异步云端回填覆盖当前表单 */
  const formDirtyRef = useRef(false)
  const remoteHydratedRef = useRef(false)

  function markDirty() {
    formDirtyRef.current = true
  }

  function memberFromStorage() {
    const prev = readMember()
    const acc = getAccount()
    const wx = readWxAccount()
    if (!prev && !acc) return null
    const profiles = prev?.platformProfiles || emptyAllProfiles()
    return {
      id: prev?.id || acc?.registryMemberId || `MTM-${Date.now()}`,
      lingqiTalentId: prev?.lingqiTalentId || acc?.lingqiTalentId || '',
      wxNickName: prev?.wxNickName || wx?.wxNickName || acc?.wxNickName || '',
      wxAvatarUrl: prev?.wxAvatarUrl || wx?.wxAvatarUrl || '',
      contact: prev?.contact || acc?.loginName || '',
      wechatId: prev?.wechatId || acc?.loginName || '',
      alipayAccount: prev?.alipayAccount || '',
      gender: prev?.gender || '',
      province: prev?.province || '',
      city: prev?.city || '',
      platformProfiles: profiles,
      prExclusiveQuotes: Array.isArray(prev?.prExclusiveQuotes) ? prev.prExclusiveQuotes : [],
      registeredAt: prev?.registeredAt,
    } satisfies TalentMember
  }

  useEffect(() => {
    if (!getToken()) return
    void fetchSession()
      .then(({ account }) => {
        setSession(getToken(), account)
        setLoginName(account.loginName || '')
        setHasPassword(!!account.hasPassword)
        return pullRegistryProfileAfterLogin()
      })
      .then(() => {
        if (formDirtyRef.current || remoteHydratedRef.current) return
        remoteHydratedRef.current = true
        const next = memberFromStorage()
        if (next) setMember(next)
      })
      .catch(() => {})
  }, [])

  const prof = member.platformProfiles[activePlatform] || emptyAllProfiles()[activePlatform]
  const lb = labels(TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name || '抖音')

  function patchMember(patch: Partial<TalentMember>) {
    markDirty()
    setMember((m) => ({ ...m, ...patch }))
  }

  function patchProfile(patch: Partial<PlatformProfile>) {
    markDirty()
    setMember((m) => ({
      ...m,
      platformProfiles: {
        ...m.platformProfiles,
        [activePlatform]: { ...prof, enabled: true, ...patch },
      },
    }))
  }

  const onRegionChange = useCallback((province: string, city: string) => {
    markDirty()
    setMember((m) => ({ ...m, province, city }))
  }, [])

  const onRegionDefaultFill = useCallback((province: string, city: string) => {
    setMember((m) => ({ ...m, province, city }))
  }, [])

  useEffect(() => {
    writeWxAccount({ wxNickName: member.wxNickName, wxAvatarUrl: member.wxAvatarUrl })
  }, [member.wxNickName, member.wxAvatarUrl])

  async function onAutofillFromLink() {
    const platName = TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name || '抖音'
    const link = String(prof.profileLink || '').trim()
    if (!link) {
      setMsg('请先粘贴主页分享链接')
      return
    }
    setAutofillLoading(true)
    setMsg('')
    try {
      const parsed = await parseProfileLink(link, platName)
      const talentTagSet = new Set<string>(TALENT_TAGS)
      const mergedTags = [
        ...new Set([...(prof.accountTags || []), ...(parsed.accountTags || [])]),
      ].filter((t): t is (typeof TALENT_TAGS)[number] => talentTagSet.has(t))
      const profilePatch: Partial<PlatformProfile> = {
        platformAccount: parsed.platformAccount || prof.platformAccount,
        platformNickname: parsed.platformNickname || prof.platformNickname,
        profileLink: parsed.profileLink || prof.profileLink,
        followers: parsed.followers > 0 ? String(parsed.followers) : prof.followers,
        accountTags: mergedTags,
      }
      if (parsed.talentGrade && activePlatform === 'kuaishou') {
        profilePatch.talentGrade = parsed.talentGrade
      }
      patchProfile(profilePatch)
      if (parsed.gender && !member.gender) patchMember({ gender: parsed.gender })
      setMsg('已根据链接自动填写')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setAutofillLoading(false)
    }
  }

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
    const gender = String(member.gender || '').trim()
    if (gender !== '男' && gender !== '女') {
      setMsg('请选择性别')
      return
    }
    const regionErr = validateRegion(member.province || '', member.city || '')
    if (regionErr) {
      setMsg(regionErr)
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
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">我的信息（达人）</h2>
      {member.lingqiTalentId ? (
        <p className="text-sm text-slate-400">达人 ID：{member.lingqiTalentId}</p>
      ) : null}

      <section className="pub-form-card space-y-3 text-sm">
        <p className="text-slate-400 text-xs">登录账号（选填）— 设置后可用账号密码登录，与微信绑定同一灵祺 ID</p>
        <label className="block">
          <span className="text-slate-400">手机号</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={loginName}
            onChange={(e) => {
              markDirty()
              setLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))
            }}
            placeholder="字母数字"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">登录密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={password}
            onChange={(e) => {
              markDirty()
              setPassword(e.target.value)
            }}
            placeholder={hasPassword ? '留空则不修改原密码' : '至少 6 位，可不填'}
          />
        </label>
      </section>

      <section className="pub-form-card space-y-3 text-sm">
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
            placeholder="选填，用于结算打款"
          />
        </label>
        <div>
          <span className="text-slate-400">性别</span>
          <div className="mt-2 flex gap-2">
            {(['男', '女'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={`px-4 py-1.5 rounded-full text-sm border ${
                  member.gender === g
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-white/5 border-white/15 text-slate-300'
                }`}
                onClick={() => patchMember({ gender: member.gender === g ? '' : g })}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <RegionSelect
          province={member.province || ''}
          city={member.city || ''}
          onChange={onRegionChange}
          onDefaultFill={onRegionDefaultFill}
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

      <section className="pub-form-card space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!prof.enabled}
            onChange={(e) => patchProfile({ enabled: e.target.checked })}
          />
          启用 {TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name} 资料
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.profileLink}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.profileLink || ''}
            onChange={(e) => patchProfile({ profileLink: e.target.value })}
            placeholder="粘贴分享口令或主页链接"
          />
          {activePlatform !== 'weixin_video' ? (
            <button
              type="button"
              disabled={autofillLoading}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => void onAutofillFromLink()}
            >
              {autofillLoading ? 'AI 解析中…' : 'AI自动解析链接并填写下方信息'}
            </button>
          ) : null}
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
          <span className="text-slate-400">{lb.nickname}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.platformNickname || ''}
            onChange={(e) => patchProfile({ platformNickname: e.target.value })}
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
          <span className="text-slate-400">默认报价（元）</span>
          <p className="text-xs text-slate-500 mt-0.5 mb-1">报名时预填此价格；专属 PR 价请在「我的报价」中设置</p>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.quotePrice || ''}
            onChange={(e) => patchProfile({ quotePrice: e.target.value })}
          />
        </label>

        <div>
          <span className="text-slate-400">账号标签</span>
          <p className="text-xs text-slate-500 mt-1 mb-2">可多选，自动填写时会尝试匹配简介关键词</p>
          <div className="flex flex-wrap gap-2">
            {TALENT_TAGS.map((tag) => {
              const on = (prof.accountTags || []).includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs border ${
                    on ? 'bg-violet-600/30 border-violet-400 text-violet-100' : 'border-white/10 text-slate-400'
                  }`}
                  onClick={() => {
                    const cur = prof.accountTags || []
                    patchProfile({
                      accountTags: on ? cur.filter((t) => t !== tag) : [...cur, tag],
                    })
                  }}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
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
