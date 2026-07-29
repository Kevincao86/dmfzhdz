import { ChevronDown, Mic, Paperclip, Send, Sparkles, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../cn'
import {
  composeSkillPrompt,
  findShortVideoSkill,
  matchSkillsByQuery,
  type ShortVideoSkill,
  type ShortVideoSkillId,
} from '../lib/shortVideoSkills'

export type ShortVideoAgentCabinProps = {
  value: string
  disabled?: boolean
  skillId: ShortVideoSkillId | null
  onSkillChange: (id: ShortVideoSkillId | null) => void
  onChange: (v: string) => void
  onSubmit: () => void
  onPickDoc?: () => void
  submitLabel?: string
  busy?: boolean
}

export default function ShortVideoAgentCabin({
  value,
  disabled,
  skillId,
  onSkillChange,
  onChange,
  onSubmit,
  onPickDoc,
  submitLabel = '开始创作',
  busy,
}: ShortVideoAgentCabinProps) {
  const [skillOpen, setSkillOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const activeSkill = findShortVideoSkill(skillId)

  const skills = useMemo(() => matchSkillsByQuery(skillQuery), [skillQuery])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSkillOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const applySkill = (skill: ShortVideoSkill) => {
    onSkillChange(skill.id)
    const note = value.includes('【商家补充】')
      ? (value.split('【商家补充】').pop() ?? '').replace(/^\n*/, '').trim()
      : value.includes('【Skill·')
        ? ''
        : value.trim()
    onChange(composeSkillPrompt(skill, note))
    setSkillOpen(false)
    taRef.current?.focus()
  }

  const clearSkill = () => {
    onSkillChange(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && !e.nativeEvent.isComposing && value.trim() === '') {
      e.preventDefault()
      setSkillOpen(true)
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled && !busy) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div ref={wrapRef} className="sv-agent-cabin relative">
      <div className="mb-3 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          开启 Agent 模式，即刻出片
        </h2>
        <p className="mt-1 text-sm text-slate-500">输入想法或剧本，支持「/」调用技能，与 AI 一起创作短片</p>
      </div>

      <div
        className={cn(
          'rounded-[1.75rem] border border-slate-200/90 bg-white/95 p-3 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/[0.03] backdrop-blur-sm sm:p-4',
          disabled && 'opacity-70',
        )}
      >
        {activeSkill ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800 ring-1 ring-cyan-200/80">
              <Wrench className="h-3 w-3" aria-hidden />
              技能 · {activeSkill.name}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-cyan-100"
                onClick={clearSkill}
                aria-label="清除技能"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
            <span className="text-[11px] text-slate-400">{activeSkill.category}</span>
          </div>
        ) : null}

        <textarea
          ref={taRef}
          spellCheck={false}
          disabled={disabled || busy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入想法、剧本或门店卖点；输入 / 使用技能，添加主体，和 Agent 一起创作"
          className="min-h-[108px] w-full resize-y rounded-2xl border-0 bg-transparent px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
        />

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 ring-1 ring-cyan-200/70">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Agent 模式
            </span>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setSkillOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
                skillOpen || activeSkill
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              )}
            >
              <Wrench className="h-3.5 w-3.5" aria-hidden />
              使用技能
              <ChevronDown className={cn('h-3 w-3 transition', skillOpen && 'rotate-180')} />
            </button>
            {onPickDoc ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={onPickDoc}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                参考文案
              </button>
            ) : null}
            <span className="hidden items-center gap-1 rounded-full px-2 py-1.5 text-[11px] text-slate-400 sm:inline-flex">
              <Mic className="h-3 w-3" aria-hidden />
              ⌘/Ctrl + Enter 提交
            </span>
          </div>

          <button
            type="button"
            disabled={disabled || busy || !value.trim()}
            onClick={onSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-sky-500 px-5 text-sm font-semibold text-white shadow-md shadow-cyan-600/25 hover:from-cyan-500 hover:to-sky-400 disabled:pointer-events-none disabled:opacity-45"
          >
            <Send className="h-4 w-4" aria-hidden />
            {busy ? '处理中…' : submitLabel}
          </button>
        </div>
      </div>

      {skillOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%-0.5rem)] z-40 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          <input
            type="search"
            value={skillQuery}
            onChange={(e) => setSkillQuery(e.target.value)}
            placeholder="搜索技能…"
            className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            autoFocus
          />
          <ul className="space-y-1">
            {skills.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => applySkill(s)}
                  className={cn(
                    'flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition hover:bg-cyan-50',
                    skillId === s.id && 'bg-cyan-50 ring-1 ring-cyan-200',
                  )}
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {s.name}
                    <span className="ml-2 text-[11px] font-normal text-slate-400">{s.category}</span>
                  </span>
                  <span className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.description}</span>
                </button>
              </li>
            ))}
            {skills.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">无匹配技能</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
