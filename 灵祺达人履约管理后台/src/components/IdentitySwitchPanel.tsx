import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { getWorkIdentity, workIdentityLabel } from '../lib/mpWorkIdentity'
import { applyWorkIdentitySwitch } from '../lib/switchWorkIdentity'
import LandingRolePicker from '../pages/landing/LandingRolePicker'

export default function IdentitySwitchPanel() {
  const nav = useNavigate()
  const workId = getWorkIdentity()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [err, setErr] = useState('')

  async function onPick(next: Parameters<typeof applyWorkIdentitySwitch>[0]) {
    if (next === workId || switching) {
      setOpen(false)
      return
    }
    setErr('')
    setSwitching(true)
    try {
      await applyWorkIdentitySwitch(next)
      setOpen(false)
      nav('/hall', { replace: true })
      window.location.reload()
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
        className="w-full text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)] text-left px-3 py-2 rounded-lg hover:bg-[var(--shell-hover)] transition-colors disabled:opacity-60"
        onClick={() => setOpen(true)}
      >
        {switching ? '切换中…' : `切换身份 · ${workIdentityLabel(workId)}`}
      </button>
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
