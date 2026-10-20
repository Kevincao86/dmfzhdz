import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { useProtectedForm } from '../hooks/useProtectedForm'
import { fetchSession, parseProfileLink, registerTalentMember, setLoginCredentials } from '../lib/mpApi'
import { getAccount, getActiveRole, getToken, persistAccount } from '../lib/mpSession'
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
import { getWorkIdentity, noteOwnedWorkIdentity, readOwnedWorkIdentities } from '../lib/mpWorkIdentity'
import { inferLegacyMemberType } from '../lib/mpSync/talentPlatformProfiles'
import { TALENT_TAGS } from '../lib/mpSync/publishFormOptions'
import { validateBasicContactFields } from '../lib/mpSync/basicContactFields'
import { validateRegion } from '../lib/mpSync/regionPicker'
import { uploadContentImage } from '../lib/mpContentUpload'
import { readWxAccount, writeWxAccount } from '../lib/mpSync/wxAccount'

const PLATFORM_LOGO: Record<string, string> = {
  douyin: '/platforms/douyin.png',
  xiaohongshu: '/platforms/xiaohongshu.png',
  kuaishou: '/platforms/kuaishou-local.png',
  dianping: '/platforms/dianping.png',
  weixin_video: '/platforms/wechat.png',
}

let profileEnvelopeScrollLocks = 0

function retainProfileScrollLock() {
  profileEnvelopeScrollLocks += 1
  if (profileEnvelopeScrollLocks === 1) document.documentElement.classList.add('lq-env-scroll-lock')
  return () => {
    profileEnvelopeScrollLocks = Math.max(0, profileEnvelopeScrollLocks - 1)
    if (profileEnvelopeScrollLocks === 0) document.documentElement.classList.remove('lq-env-scroll-lock')
  }
}

export function ProfileEnvelope({
  title,
  summary,
  logo,
  actionLabel,
  open,
  readOnly,
  saving,
  onView,
  onEdit,
  onClose,
  onSave,
  children,
}: {
  title: string
  summary: string
  logo?: string
  actionLabel?: string
  open: boolean
  readOnly?: boolean
  saving?: boolean
  onView?: () => void
  onEdit: () => void
  onClose: () => void
  onSave: () => void
  children: ReactNode
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    return retainProfileScrollLock()
  }, [open])
  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !open) return
    const onWheel = (event: WheelEvent) => {
      const letter = layer.querySelector('.lq-env-letter')
      if (!(letter instanceof HTMLElement) || !letter.contains(event.target as Node)) {
        event.preventDefault()
        return
      }
      const max = letter.scrollHeight - letter.clientHeight
      const atTop = letter.scrollTop <= 0
      const atBottom = letter.scrollTop >= max - 1
      if (max <= 1 || (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) event.preventDefault()
    }
    layer.addEventListener('wheel', onWheel, { passive: false })
    return () => layer.removeEventListener('wheel', onWheel)
  }, [open])

  return (
    <section>
      <div className="rounded-2xl border border-stone-200 bg-[#fbf7f1] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          {logo ? <img src={logo} alt="" className="h-9 w-9 rounded-xl bg-white object-contain" /> : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-stone-900">{title}</div>
            <div className="truncate text-xs text-stone-500">{summary || '未填写'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onView ? (
              <button type="button" className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700" onClick={onView}>
                查看
              </button>
            ) : null}
            <button type="button" className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700" onClick={onEdit}>
              {actionLabel || '修改'}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        html.lq-env-scroll-lock,
        html.lq-env-scroll-lock body { overflow: hidden; }
        .lq-env-letter {
          width: min(32rem, 100%);
          max-height: 78vh;
          overflow: auto;
          overscroll-behavior: contain;
          background: #fff;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 18px 48px rgba(28, 25, 23, 0.22);
        }
        .lq-env-view input:disabled,
        .lq-env-view textarea:disabled,
        .lq-env-view select:disabled,
        .lq-env-view button:disabled {
          opacity: 1;
          color: #1c1917;
          -webkit-text-fill-color: #1c1917;
          background-color: #fafaf9;
        }
        .lq-env-view .lq-env-editonly { display: none; }
        .lq-env-pop-logo {
          position: absolute;
          left: 50%;
          top: 0;
          z-index: 2;
          width: 52px;
          height: 52px;
          padding: 6px;
          border-radius: 50%;
          border: 2px solid #d6c4a8;
          background: #fff;
          object-fit: contain;
          box-shadow: 0 6px 16px rgba(90, 62, 30, 0.12);
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
      `}</style>
      {open ? (
        <div ref={layerRef} className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4" onClick={onClose}>
          <div className="relative w-full min-w-0 max-w-lg" onClick={(e) => e.stopPropagation()}>
            {logo ? <img className="lq-env-pop-logo" src={logo} alt="" /> : null}
            <div className="lq-env-letter text-sm">
            <div className="mb-3 text-base font-semibold text-stone-900">{title}</div>
            <fieldset disabled={!!readOnly} className={readOnly ? 'lq-env-view m-0 w-full min-w-0 border-0 p-0' : 'm-0 w-full min-w-0 border-0 p-0'}>
              <div className="space-y-3">{children}</div>
            </fieldset>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-semibold text-stone-700" onClick={onClose}>
                {readOnly ? '关闭' : '取消'}
              </button>
              {readOnly ? null : (
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                onClick={onSave}
              >
                {saving ? '保存中…' : '保存'}
              </button>
              )}
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function memberFromStorage(): TalentMember | null {
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
  }
}

function initialMember(): TalentMember {
  return memberFromStorage() || {
    id: getAccount()?.registryMemberId || `MTM-${Date.now()}`,
    lingqiTalentId: getAccount()?.lingqiTalentId || '',
    wxNickName: '',
    wxAvatarUrl: '',
    contact: '',
    wechatId: '',
    alipayAccount: '',
    gender: '',
    province: '',
    city: '',
    platformProfiles: emptyAllProfiles(),
  }
}

function TalentProfileForm() {
  const acc = getAccount()
  const [member, setMember] = useState<TalentMember>(initialMember)
  const [activePlatform, setActivePlatform] = useState('douyin')
  const [openContact, setOpenContact] = useState(false)
  const [openLogin, setOpenLogin] = useState(false)
  const [openPlat, setOpenPlat] = useState<Record<string, boolean>>({})
  const [loginMode, setLoginMode] = useState<'view' | 'edit'>('edit')
  const [contactMode, setContactMode] = useState<'view' | 'edit'>('edit')
  const [platMode, setPlatMode] = useState<'view' | 'edit'>('edit')
  const [loginName, setLoginName] = useState(acc?.loginName || '')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(!!acc?.hasPassword)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [autofillLoading, setAutofillLoading] = useState(false)
  const [shotPreview, setShotPreview] = useState('')
  const { lockForm, unlockForm, fieldFocusProps, lockedRef: formLockedRef } = useProtectedForm()
  const remoteHydratedRef = useRef(false)

  useEffect(() => {
    return () => {
      unlockForm()
    }
  }, [unlockForm])

  useEffect(() => {
    if (!getToken()) return
    let alive = true
    void (async () => {
      try {
        const { account } = await fetchSession()
        if (!alive) return
        /** 勿用 setSession：会连锁 pullRegistry + client_state_sync，与表单争抢 */
        persistAccount(account)
        if (!formLockedRef.current) {
          setLoginName(account.loginName || '')
          setHasPassword(!!account.hasPassword)
        }
        await pullRegistryProfileAfterLogin()
        if (!alive || formLockedRef.current || remoteHydratedRef.current) return
        remoteHydratedRef.current = true
        const next = memberFromStorage()
        if (next) setMember(next)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const prof = member.platformProfiles[activePlatform] || emptyAllProfiles()[activePlatform]
  const lb = labels(TALENT_PLATFORMS.find((p) => p.id === activePlatform)?.name || '抖音')

  function patchMember(patch: Partial<TalentMember>) {
    lockForm()
    setMember((m) => ({ ...m, ...patch }))
  }

  function patchProfile(patch: Partial<PlatformProfile>) {
    lockForm()
    setMember((m) => {
      const cur = m.platformProfiles[activePlatform] || emptyAllProfiles()[activePlatform]
      return {
        ...m,
        platformProfiles: {
          ...m.platformProfiles,
          [activePlatform]: { ...cur, enabled: true, ...patch },
        },
      }
    })
  }

  const onRegionChange = useCallback(
    (province: string, city: string) => {
      lockForm()
      setMember((m) => ({ ...m, province, city }))
    },
    [lockForm],
  )

  const onRegionDefaultFill = useCallback((province: string, city: string) => {
    if (formLockedRef.current) return
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
      const mergedTags = [
        ...new Set([...(prof.accountTags || []), ...(parsed.accountTags || [])]),
      ].filter((t) => t && t.length <= 12)
      const profilePatch: Partial<PlatformProfile> = {
        platformAccount: parsed.platformAccount || prof.platformAccount,
        platformNickname: parsed.platformNickname || prof.platformNickname,
        profileLink: parsed.profileLink || prof.profileLink,
        followers: parsed.followers > 0 ? String(parsed.followers) : prof.followers,
        accountTags: mergedTags,
      }
      if (parsed.avatarUrl) profilePatch.avatarUrl = parsed.avatarUrl
      if (parsed.ipLocation) profilePatch.ipLocation = parsed.ipLocation
      if (parsed.age) profilePatch.age = parsed.age
      if (parsed.signature) profilePatch.signature = parsed.signature
      if ((parsed.followingCount ?? 0) > 0) profilePatch.followingCount = String(parsed.followingCount)
      if ((parsed.totalFavorited ?? 0) > 0) profilePatch.totalFavorited = String(parsed.totalFavorited)
      if ((parsed.awemeCount ?? 0) > 0) profilePatch.awemeCount = String(parsed.awemeCount)
      if (parsed.talentGrade && activePlatform === 'kuaishou') {
        profilePatch.talentGrade = parsed.talentGrade
      }
      patchProfile(profilePatch)
      if (parsed.gender && !member.gender) patchMember({ gender: parsed.gender })
      setMsg(
        activePlatform === 'douyin' && !parsed.ipLocation
          ? '已填写头像、账号和粉丝。IP属地、年龄这次公开接口没有返回'
          : '已根据链接自动填写',
      )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setAutofillLoading(false)
    }
  }

  function closeSavedSection(section: 'all' | 'wx' | 'contact' | 'login' | 'platform', platformId?: string) {
    if (section === 'contact') setOpenContact(false)
    if (section === 'login') setOpenLogin(false)
    if (section === 'platform' && platformId) {
      setOpenPlat((s) => ({ ...s, [platformId]: false }))
    }
  }

  async function onSave(section: 'all' | 'wx' | 'contact' | 'login' | 'platform' = 'all', platformId?: string) {
    if (section === 'wx') {
      if (!String(member.wxNickName || '').trim()) {
        setMsg('请填写昵称')
        return
      }
    } else if (section === 'contact') {
      if (!String(member.contact || '').trim()) {
        setMsg('请填写联系电话')
        return
      }
      if (!String(member.wechatId || '').trim()) {
        setMsg('请填写微信号')
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
    } else if (section === 'platform') {
      const p = TALENT_PLATFORMS.find((x) => x.id === platformId)
      if (!p) {
        setMsg('请选择平台')
        return
      }
      const prf = member.platformProfiles[p.id]
      if (prf?.enabled) {
        const err = validatePlatformProfile(prf, labels(p.name))
        if (err) {
          setMsg(`${p.name}：${err}`)
          return
        }
      }
    } else if (section === 'all') {
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
          setPlatMode('edit')
          setOpenPlat((s) => ({ ...s, [p.id]: true }))
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
    if ((section === 'all' || section === 'login') && getToken() && loginName.trim()) {
      try {
        const { account } = await setLoginCredentials(loginName.trim(), password)
        persistAccount(account)
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
      noteOwnedWorkIdentity('talent')
      unlockForm()
      remoteHydratedRef.current = false
      closeSavedSection(section, platformId)
      setMsg(credWarn ? `${credWarn}；资料已同步云端` : '已保存并同步云端')
    } catch (e) {
      closeSavedSection(section, platformId)
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

  const focus = fieldFocusProps()

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">我的信息（达人）</h2>
      <div className="flex flex-wrap gap-2">
        {readOwnedWorkIdentities().map((id) =>
          id === 'talent' ? (
            <span key={id} className="rounded-full bg-stone-900 px-3 py-1 text-sm text-white">
              达人
            </span>
          ) : (
            <Link
              key={id}
              to={`/profile/supplier?identity=${id}`}
              className="rounded-full bg-white px-3 py-1 text-sm text-stone-700"
            >
              {id === 'shoot' ? '拍摄' : id === 'edit' ? '剪辑' : '达人'}
            </Link>
          ),
        )}
        {(['talent', 'shoot', 'edit'] as const)
          .filter((id) => !readOwnedWorkIdentities().includes(id))
          .map((id) => (
            <Link
              key={id}
              to={id === 'talent' ? '/profile/talent' : `/profile/supplier?identity=${id}`}
              className="rounded-full border border-dashed border-stone-400 bg-white px-3 py-1 text-sm text-stone-800"
            >
              +{id === 'shoot' ? '拍摄' : id === 'edit' ? '剪辑' : '达人'}
            </Link>
          ))}
        {getWorkIdentity() !== 'talent' && !readOwnedWorkIdentities().includes('talent') ? (
          <Link
            to={
              getWorkIdentity() === 'shoot' || getWorkIdentity() === 'edit'
                ? `/profile/supplier?identity=${getWorkIdentity()}`
                : '/profile'
            }
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm text-stone-800"
          >
            返回上一身份
          </Link>
        ) : null}
      </div>
      {member.lingqiTalentId ? (
        <p className="text-sm text-slate-400">达人 ID：{member.lingqiTalentId}</p>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-[#fbf7f1] px-4 py-3 shadow-sm text-sm">
        <div className="text-sm font-semibold text-stone-900">微信信息</div>
        <label className="mt-3 block">
          <span className="text-slate-400">昵称 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.wxNickName || ''}
            onFocus={focus.onFocus}
            onChange={(e) => patchMember({ wxNickName: e.target.value })}
            placeholder="用于登录与身份展示"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={saving}
            className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => void onSave('wx')}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </section>

      <ProfileEnvelope
        title="修改密码"
        summary={hasPassword ? '账号密码已设置' : '未设置登录密码'}
        open={openLogin}
        readOnly={loginMode === 'view'}
        saving={saving}
        onView={
          hasPassword
            ? () => {
                setLoginMode('view')
                setOpenLogin(true)
              }
            : undefined
        }
        onEdit={() => {
          setLoginMode('edit')
          setOpenLogin(true)
        }}
        onClose={() => setOpenLogin(false)}
        onSave={() => void onSave('login')}
      >
        {loginMode === 'view' ? (
          <div className="space-y-3 text-sm text-stone-800">
            <div>
              <span className="text-slate-400">手机号</span>
              <div className="mt-1 rounded-lg bg-stone-50 px-3 py-2">{loginName || '未填写'}</div>
            </div>
            <div>
              <span className="text-slate-400">登录密码</span>
              <div className="mt-1 rounded-lg bg-stone-50 px-3 py-2">已设置</div>
            </div>
          </div>
        ) : null}
        {loginMode === 'view' ? null : (
        <>
        <p className="text-slate-400 text-xs">登录账号（选填）— 设置后可用账号密码登录，与微信绑定同一灵祺 ID</p>
        <label className="block">
          <span className="text-slate-400">手机号</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={loginName}
            onFocus={focus.onFocus}
            onChange={(e) => {
              lockForm()
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
            onFocus={focus.onFocus}
            onChange={(e) => {
              lockForm()
              setPassword(e.target.value)
            }}
            placeholder={hasPassword ? '留空则不修改原密码' : '至少 6 位，可不填'}
          />
        </label>
        </>
        )}
      </ProfileEnvelope>

      <ProfileEnvelope
        title="联系信息"
        summary={`${member.contact || '未填写电话'}${member.city ? ` · ${member.city}` : ''}`}
        open={openContact}
        readOnly={contactMode === 'view'}
        saving={saving}
        onView={
          member.contact || member.wechatId || member.alipayAccount || member.gender || member.province || member.city
            ? () => {
                setContactMode('view')
                setOpenContact(true)
              }
            : undefined
        }
        onEdit={() => {
          setContactMode('edit')
          setOpenContact(true)
        }}
        onClose={() => setOpenContact(false)}
        onSave={() => void onSave('contact')}
      >
        <label className="block">
          <span className="text-slate-400">联系电话 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.contact || ''}
            onFocus={focus.onFocus}
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
            onFocus={focus.onFocus}
            onChange={(e) => patchMember({ wechatId: e.target.value })}
            placeholder="请填写微信号（非微信昵称）"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">支付宝账号</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.alipayAccount || ''}
            onFocus={focus.onFocus}
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
          onFocus={lockForm}
        />
      </ProfileEnvelope>

      {TALENT_PLATFORMS.map((p) => {
        const row = member.platformProfiles[p.id]
        const opened = !!openPlat[p.id]
        return (
          <ProfileEnvelope
            key={p.id}
            title={p.name}
            logo={PLATFORM_LOGO[p.id]}
            summary={
              row?.enabled
                ? `${row.platformNickname || '已启用'}${row.followers ? ` · 粉丝 ${row.followers}` : ''}`
                : '未启用'
            }
            actionLabel={row?.enabled ? '修改' : '开启'}
            open={opened}
            readOnly={platMode === 'view'}
            saving={saving}
            onView={
              row?.enabled
                ? () => {
                    setPlatMode('view')
                    setActivePlatform(p.id)
                    setOpenPlat({ [p.id]: true })
                  }
                : undefined
            }
            onEdit={() => {
              setPlatMode('edit')
              setActivePlatform(p.id)
              if (!row?.enabled) {
                setMember((m) => {
                  const cur = m.platformProfiles[p.id] || emptyAllProfiles()[p.id]
                  return {
                    ...m,
                    platformProfiles: {
                      ...m.platformProfiles,
                      [p.id]: { ...cur, enabled: true },
                    },
                  }
                })
              }
              setOpenPlat({ [p.id]: true })
            }}
            onClose={() => setOpenPlat({})}
            onSave={() => void onSave('platform', p.id)}
          >
            {opened && p.id === activePlatform ? (
              <>
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
            onFocus={focus.onFocus}
            onChange={(e) => patchProfile({ profileLink: e.target.value })}
            placeholder="粘贴分享口令或主页链接"
          />
          <button
            type="button"
            disabled={autofillLoading}
            className="lq-env-editonly mt-2 w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void onAutofillFromLink()}
          >
            {autofillLoading ? 'AI 解析中…' : 'AI自动解析链接并填写下方信息'}
          </button>
        </label>
        {prof.avatarUrl ? (
          <img
            src={prof.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : null}
        <label className="block">
          <span className="text-slate-400">{lb.accountId}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.platformAccount || ''}
            onFocus={focus.onFocus}
            onChange={(e) => patchProfile({ platformAccount: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.nickname}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.platformNickname || ''}
            onFocus={focus.onFocus}
            onChange={(e) => patchProfile({ platformNickname: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">{lb.followersLabel}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={prof.followers || ''}
            onFocus={focus.onFocus}
            onChange={(e) => patchProfile({ followers: e.target.value })}
          />
        </label>
        {activePlatform === 'douyin' ||
        activePlatform === 'xiaohongshu' ||
        activePlatform === 'kuaishou' ||
        activePlatform === 'weixin_video' ? (
          <>
            <label className="block">
              <span className="text-slate-400">IP属地</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={prof.ipLocation || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ ipLocation: e.target.value })}
              />
            </label>
            {activePlatform === 'douyin' ? (
            <label className="block">
              <span className="text-slate-400">年龄</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={prof.age || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ age: e.target.value })}
              />
            </label>
            ) : null}
            <label className="block">
              <span className="text-slate-400">关注数</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={prof.followingCount || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ followingCount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-400">{activePlatform === 'xiaohongshu' ? '获赞与收藏' : '获赞'}</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={prof.totalFavorited || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ totalFavorited: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-400">作品数</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={prof.awemeCount || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ awemeCount: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-slate-400">简介</span>
              <textarea
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                rows={3}
                value={prof.signature || ''}
                onFocus={focus.onFocus}
                onChange={(e) => patchProfile({ signature: e.target.value })}
              />
            </label>
          </>
        ) : null}
        {activePlatform === 'douyin' || activePlatform === 'kuaishou' ? (
          <div>
            <span className="text-slate-400">近期交易截图（选填）</span>
            <p className="text-xs text-slate-500 mt-1">
              打开抖音或快手「数据中心 → 数据概览 → 交易分析 → 近30日」，截这一屏。不上传也可以保存。
            </p>
            <button
              type="button"
              className="mt-2 block"
              onClick={() => setShotPreview('/trade-screenshot-example.jpg')}
            >
              <img
                src="/trade-screenshot-example.jpg"
                alt="抖音数据中心交易分析示例"
                className="h-28 w-20 rounded-lg border object-cover object-top"
              />
            </button>
            <p className="text-xs text-slate-500 mt-1">点击小图可放大。上图是抖音数据中心示例，快手截同样的交易数据页即可。</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="lq-env-editonly mt-2 block text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void uploadContentImage(file)
                  .then((url) => patchProfile({ recentTradeScreenshot: url }))
                  .catch((err) => setMsg(err instanceof Error ? err.message : '上传失败'))
              }}
            />
            {prof.recentTradeScreenshot ? (
              <button
                type="button"
                className="mt-2 block"
                onClick={() => setShotPreview(prof.recentTradeScreenshot)}
              >
                <img src={prof.recentTradeScreenshot} alt="近期交易截图" className="h-28 w-20 rounded-lg border object-cover object-top" />
              </button>
            ) : null}
          </div>
        ) : null}
        {lb.showSalesLevel ? (
          <label className="block">
            <span className="text-slate-400">抖音带货等级</span>
            <select
              className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
              value={prof.douyinSalesLevel || ''}
              onFocus={focus.onFocus}
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
            onFocus={focus.onFocus}
            onChange={(e) => patchProfile({ quotePrice: e.target.value })}
          />
        </label>

        <div>
          <span className="text-slate-400">账号标签</span>
          <p className="text-xs text-slate-500 mt-1 mb-2">可多选，自动填写时会尝试匹配简介关键词</p>
          <div className="flex flex-wrap gap-2">
            {[...TALENT_TAGS, ...(prof.accountTags || []).filter((tag) => !(TALENT_TAGS as readonly string[]).includes(tag))].map((tag) => {
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
              </>
            ) : null}
          </ProfileEnvelope>
        )
      })}

      {msg ? <p className="text-sm text-amber-400">{msg}</p> : null}
      {shotPreview ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setShotPreview('')}
        >
          <img src={shotPreview} alt="交易截图放大" className="max-h-[90vh] max-w-full rounded-lg" />
        </button>
      ) : null}
    </div>
  )
}

export default function TalentProfilePage() {
  if (getActiveRole() !== 'talent') return <Navigate to="/profile" replace />
  return <TalentProfileForm />
}
