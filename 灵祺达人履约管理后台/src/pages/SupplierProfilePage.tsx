import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { ensureIdentity, fetchSession, registerTalentMember, setLoginCredentials } from '../lib/mpApi'
import { getAccount, getActiveRole, getToken, setSession } from '../lib/mpSession'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { readMember, writeMember } from '../lib/mpSync/talentMember'
import {
  DAILY_CAPACITY,
  EDIT_SOFTWARE,
  EDIT_STYLES,
  EDIT_TYPES,
  ENTITY_TYPES,
  EXPERIENCE_YEARS,
  SHOOT_EQUIPMENT,
  SHOOT_TYPES,
  emptySupplierProfile,
  normalizeSupplierProfile,
  validateSupplierProfile,
  supplierTagsForWorkId,
  type SupplierProfile,
} from '../lib/mpSync/supplierTeamProfile'
import { TALENT_TAGS } from '../lib/mpSync/publishFormOptions'

export default function SupplierProfilePage() {
  const workId = getWorkIdentity()
  if (getActiveRole() !== 'talent' || (workId !== 'shoot' && workId !== 'edit')) {
    return <Navigate to="/profile" replace />
  }

  const acc = getAccount()
  const [member, setMember] = useState(() => {
    const prev = readMember()
    return {
      id: prev?.id || acc?.registryMemberId || `MTM-${Date.now()}`,
      lingqiTalentId: prev?.lingqiTalentId || acc?.lingqiTalentId || '',
      lingqiShootTeamId: prev?.lingqiShootTeamId || acc?.lingqiShootTeamId || '',
      lingqiEditTeamId: prev?.lingqiEditTeamId || acc?.lingqiEditTeamId || '',
      wxNickName: prev?.wxNickName || acc?.wxNickName || '',
      wxAvatarUrl: prev?.wxAvatarUrl || '',
      contact: prev?.contact || '',
      wechatId: prev?.wechatId || '',
      alipayAccount: prev?.alipayAccount || '',
      province: prev?.province || '',
      city: prev?.city || '',
      supplierProfile: normalizeSupplierProfile(prev?.supplierProfile),
      registeredAt: prev?.registeredAt,
    }
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!getToken()) return
    void fetchSession()
      .then(({ account }) => {
        setSession(getToken(), account)
        setMember((m) => ({
          ...m,
          lingqiTalentId: account.lingqiTalentId || m.lingqiTalentId,
          lingqiShootTeamId: account.lingqiShootTeamId || m.lingqiShootTeamId,
          lingqiEditTeamId: account.lingqiEditTeamId || m.lingqiEditTeamId,
          id: account.registryMemberId || m.id,
        }))
      })
      .catch(() => {})
  }, [])

  const sp = member.supplierProfile

  function patchSp(patch: Partial<SupplierProfile>) {
    setMember((m) => ({ ...m, supplierProfile: { ...m.supplierProfile, ...patch } }))
  }

  function toggleTag(field: 'categoryTags' | 'shootTypes' | 'equipment' | 'editTypes' | 'editStyles' | 'software', name: string) {
    const cur = [...(sp[field] || [])]
    const idx = cur.indexOf(name)
    if (idx >= 0) cur.splice(idx, 1)
    else {
      if (field === 'categoryTags' && cur.length >= 3) return
      cur.push(name)
    }
    patchSp({ [field]: cur })
  }

  async function onSave() {
    const err = validateSupplierProfile(workId, sp, member)
    if (err) {
      setMsg(err)
      return
    }
    setSaving(true)
    setMsg('')
    const saved = {
      ...member,
      workIdentity: workId,
      memberType: 'douyin' as const,
      accountTags: [...supplierTagsForWorkId(workId), ...sp.categoryTags],
      supplierProfile: normalizeSupplierProfile(sp),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      registeredAt: member.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    writeMember(saved as never)
    try {
      if (getToken()) await ensureIdentity('talent', workId as 'shoot' | 'edit')
      const reg = (await registerTalentMember(saved as unknown as Record<string, unknown>)) as {
        lingqiTalentId?: string
        lingqiShootTeamId?: string
        lingqiEditTeamId?: string
        id?: string
      }
      if (reg.lingqiTalentId) saved.lingqiTalentId = reg.lingqiTalentId
      if (reg.lingqiShootTeamId) saved.lingqiShootTeamId = reg.lingqiShootTeamId
      if (reg.lingqiEditTeamId) saved.lingqiEditTeamId = reg.lingqiEditTeamId
      if (reg.id) saved.id = reg.id
      writeMember(saved as never)
      setMsg('已保存并同步云端')
    } catch (e) {
      setMsg(`已保存本机；云端同步失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
      setMember(saved)
    }
  }

  const teamId = workId === 'shoot' ? member.lingqiShootTeamId : member.lingqiEditTeamId

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">{workId === 'edit' ? '剪辑团队信息' : '拍摄团队信息'}</h2>
      {teamId ? <p className="text-sm text-amber-500 font-mono">{teamId}</p> : null}

      <section className="surface-card rounded-xl border p-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-slate-400">昵称 *</span>
          <input
            required
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={member.wxNickName || ''}
            onChange={(e) => setMember((m) => ({ ...m, wxNickName: e.target.value }))}
            placeholder="用于登录与身份展示"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">团队名称 *</span>
          <input className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={sp.teamName} onChange={(e) => patchSp({ teamName: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-slate-400">主体类型</span>
          <select className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={sp.entityType} onChange={(e) => patchSp({ entityType: e.target.value })}>
            {ENTITY_TYPES.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-400">联系电话 *</span>
          <input className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={member.contact || ''} onChange={(e) => setMember((m) => ({ ...m, contact: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-slate-400">微信号 *</span>
          <input className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={member.wechatId || ''} onChange={(e) => setMember((m) => ({ ...m, wechatId: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-slate-400">支付宝账号 *</span>
          <input className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={member.alipayAccount || ''} onChange={(e) => setMember((m) => ({ ...m, alipayAccount: e.target.value }))} />
        </label>
        <RegionSelect province={member.province || ''} city={member.city || ''} onChange={(province, city) => setMember((m) => ({ ...m, province, city }))} />
        <div>
          <span className="text-slate-400">擅长品类 *</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {TALENT_TAGS.map((t) => (
              <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.categoryTags.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('categoryTags', t)}>{t}</button>
            ))}
          </div>
        </div>
        {workId === 'shoot' ? (
          <>
            <div>
              <span className="text-slate-400">拍摄类型 *</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {SHOOT_TYPES.map((t) => (
                  <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.shootTypes.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('shootTypes', t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-slate-400">设备能力</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {SHOOT_EQUIPMENT.map((t) => (
                  <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.equipment.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('equipment', t)}>{t}</button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="text-slate-400">成片类型 *</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {EDIT_TYPES.map((t) => (
                  <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.editTypes.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('editTypes', t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-slate-400">剪辑风格</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {EDIT_STYLES.map((t) => (
                  <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.editStyles.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('editStyles', t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-slate-400">软件能力</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {EDIT_SOFTWARE.map((t) => (
                  <button key={t} type="button" className={`px-2 py-1 rounded text-xs ${sp.software.includes(t) ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => toggleTag('software', t)}>{t}</button>
                ))}
              </div>
            </div>
          </>
        )}
        <label className="block">
          <span className="text-slate-400">作品集链接 *</span>
          <input className="mt-1 w-full rounded-lg panel-input border px-3 py-2" value={sp.portfolioLink} onChange={(e) => patchSp({ portfolioLink: e.target.value })} />
        </label>
      </section>

      {msg ? <p className="text-sm text-amber-400">{msg}</p> : null}
      <button type="button" disabled={saving} className="px-6 py-2.5 rounded-lg bg-violet-600 font-medium disabled:opacity-50" onClick={() => void onSave()}>
        {saving ? '保存中…' : '保存资料'}
      </button>
    </div>
  )
}
