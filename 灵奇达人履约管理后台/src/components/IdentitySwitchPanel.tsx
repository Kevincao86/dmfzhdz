import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearMpRegistryCache } from '../lib/mpApi'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { triggerShellRefresh } from '../lib/shellRefresh'
import { getWorkIdentity, workIdentityLabel, workIdentityToAccountRole } from '../lib/mpWorkIdentity'
import { getActiveRole } from '../lib/mpSession'
import { applyWorkIdentitySwitch } from '../lib/switchWorkIdentity'
import LandingRolePicker from '../pages/landing/LandingRolePicker'

export default function IdentitySwitchPanel() {
  const nav = useNavigate()
  const workId = getWorkIdentity()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState('')

  async function onPick(next: Parameters<typeof applyWorkIdentitySwitch>[0]) {
    const targetRole = workIdentityToAccountRole(next)
    if ((next === workId && getActiveRole() === targetRole) || switching) {
      setOpen(false)
      return
    }
    setErr('')
    setWarn('')
    setSwitching(true)
    try {
      const result = await applyWorkIdentitySwitch(next)
      setOpen(false)
      if (result.needsReLogin) {
        nav(`/login?role=${next}`, { replace: true })
        return
      }
      if (result.cloudWarning) setWarn(result.cloudWarning)
      clearMpRegistryCache()
      nav('/hall?tab=home', { replace: true })
      triggerShellRefresh()
    } catch (e) {
      setErr(formatMpApiErr(e, '身份切换失败'))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={switching}
        className="app-sidebar__identity-switch w-full text-sm text-left px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
        onClick={() => setOpen(true)}
      >
        {switching ? '切换中…' : `切换身份 · ${workIdentityLabel(workId)}`}
      </button>
      {warn ? <p className="px-3 text-xs text-amber-600">{warn}</p> : null}
      {err ? <p className="px-3 text-xs text-red-500">{err}</p> : null}
      <LandingRolePicker
        open={open}
        onClose={() => !switching && setOpen(false)}
        title="切换工作台身份"
        onPick={(id) => void onPick(id)}
      />
    </>
  )
}
