import { useCallback, useEffect, useState } from 'react'
import { fetchRegistry } from '../opsRegistryApi'
import { resolveTeamIntro } from '../../meooRegistryShared/teamIntroRegistryCore.js'
import { saveTeamIntro } from '../opsTeamIntroApi'
import { OpsEditableSection } from '../useOpsModuleEdit'

const LEGAL_COMPANY_NAME = '宁波墨典网络科技有限公司'

function nowStr() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function paragraphsToDraft(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}

function draftToParagraphs(draft: string): string[] {
  return draft
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export default function OpsTeamIntroPage() {
  const [subtitle, setSubtitle] = useState(LEGAL_COMPANY_NAME)
  const [bodyDraft, setBodyDraft] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      const intro = resolveTeamIntro(r)
      setSubtitle(intro.subtitle || LEGAL_COMPANY_NAME)
      setBodyDraft(paragraphsToDraft(intro.paragraphs))
      setUpdatedAt(intro.updatedAt)
    } catch {
      setMsg('加载失败，请刷新重试')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onSave() {
    const paragraphs = draftToParagraphs(bodyDraft)
    if (!paragraphs.length) {
      window.alert('请填写至少一段正文（段落之间空一行）')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const intro = {
        subtitle: subtitle.trim() || LEGAL_COMPANY_NAME,
        paragraphs,
        updatedAt: nowStr(),
      }
      const r = await saveTeamIntro(intro)
      if (!r.ok) {
        setMsg(r.error ?? '保存失败')
        return
      }
      setUpdatedAt(intro.updatedAt)
      setMsg('已保存，商家版 / 服务商版 / 履约平台登录页「团队介绍」将同步更新')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">团队介绍</h1>
        <p className="mt-1 text-sm text-slate-500">
          内容同步至各版本登录页「团队介绍」（商家 ERP、服务商版、星选履约平台）。正文可用{' '}
          <code className="rounded bg-slate-800 px-1 text-cyan-300">{'{{product}}'}</code>{' '}
          占位符，各端按产品名自动替换。
        </p>
      </div>

      <OpsEditableSection className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5 space-y-4 block">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="team-intro-subtitle">
            副标题
          </label>
          <input
            id="team-intro-subtitle"
            className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder={LEGAL_COMPANY_NAME}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300" htmlFor="team-intro-body">
            正文（段落之间空一行）
          </label>
          <textarea
            id="team-intro-body"
            className="min-h-[280px] w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-violet-400"
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="第一段&#10;&#10;第二段"
          />
        </div>

        {updatedAt ? <p className="text-xs text-slate-500">上次保存：{updatedAt}</p> : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存并同步全版本'}
        </button>

        {msg ? (
          <p className={`text-sm ${msg.includes('已保存') ? 'text-emerald-400' : 'text-rose-400'}`}>{msg}</p>
        ) : null}
      </OpsEditableSection>
    </div>
  )
}
