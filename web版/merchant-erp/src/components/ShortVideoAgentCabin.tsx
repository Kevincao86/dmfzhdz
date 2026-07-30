import {
  ChevronDown,
  Clapperboard,
  Focus,
  Image,
  Mic,
  Music2,
  Paperclip,
  Send,
  Sparkles,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../cn'
import {
  composeSkillPrompt,
  findShortVideoSkill,
  matchSkillsByQuery,
  SHORT_VIDEO_SKILLS,
  type ShortVideoSkill,
  type ShortVideoSkillId,
} from '../lib/shortVideoSkills'
import {
  SHORT_VIDEO_STUDIO_MODES,
  findStudioMode,
  type ShortVideoStudioModeId,
} from '../lib/shortVideoStudioModes'

export type ShortVideoAgentCabinProps = {
  value: string
  disabled?: boolean
  skillId: ShortVideoSkillId | null
  studioMode: ShortVideoStudioModeId
  onStudioModeChange: (id: ShortVideoStudioModeId) => void
  onSkillChange: (id: ShortVideoSkillId | null) => void
  onChange: (v: string) => void
  onSubmit: () => void
  onPickDoc?: () => void
  submitLabel?: string
  busy?: boolean
  /** 融合短片生成工作区（参数 / 分镜表 / 操作），减少页面切换 */
  children?: ReactNode
}

const MODE_ICON: Record<ShortVideoStudioModeId, typeof Sparkles> = {
  agent: Sparkles,
  video: Clapperboard,
  image: Image,
  music: Music2,
  digital_human: UserRound,
  canvas: Focus,
}

export default function ShortVideoAgentCabin({
  value,
  disabled,
  skillId,
  studioMode,
  onStudioModeChange,
  onSkillChange,
  onChange,
  onSubmit,
  onPickDoc,
  submitLabel = '开始创作',
  busy,
  children,
}: ShortVideoAgentCabinProps) {
  const [skillOpen, setSkillOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const activeSkill = findShortVideoSkill(skillId)
  const activeMode = findStudioMode(studioMode)
  const ModeIcon = MODE_ICON[activeMode.id]
  const menuOpen = modeOpen || skillOpen

  const skills = useMemo(() => matchSkillsByQuery(skillQuery), [skillQuery])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setSkillOpen(false)
        setModeOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSkillOpen(false)
        setModeOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

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
      setModeOpen(false)
      setSkillOpen(true)
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled && !busy) {
      e.preventDefault()
      onSubmit()
    }
  }

  const heading =
    activeMode.id === 'agent'
      ? children
        ? 'Agent 一站出片 · 文案到分镜'
        : '开启 Agent 模式，即刻出片'
      : activeMode.id === 'music'
        ? '音乐 / 配乐：内容匹配曲库'
        : activeMode.id === 'image'
          ? '图片生成：跳转视觉工坊'
          : activeMode.id === 'digital_human'
            ? '数字人口播一体化出片'
            : activeMode.id === 'canvas'
              ? '无限画布 · 分镜同屏'
              : children
                ? '视频生成 · 文案 · 分镜 · 出片同屏'
                : '视频生成 · Seedance 出片'

  return (
    <div
      ref={wrapRef}
      className={cn(
        'sv-agent-cabin relative w-full min-w-0 max-w-full',
        menuOpen ? 'z-40' : 'z-10',
      )}
    >
      <div className="mb-3 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{heading}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {activeMode.description} · 支持「/」调用技能
        </p>
      </div>

      <div
        className={cn(
          'relative w-full max-w-full rounded-[1.75rem] border border-slate-200/90 bg-white/95 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/[0.03] backdrop-blur-sm',
          // 下拉打开时禁止裁切，避免菜单被卡片 overflow 吃掉
          menuOpen ? 'overflow-visible' : 'overflow-hidden',
          disabled && 'opacity-70',
        )}
      >
        <div className="relative p-3 sm:p-4">
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

          {/* 工具栏：下拉锚定在此，勿挂到整舱底部（融合分镜区后曾错位） */}
          <div className="relative mt-1 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => {
                    setSkillOpen(false)
                    setModeOpen((v) => !v)
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 ring-1 ring-cyan-200/70 transition hover:bg-cyan-100"
                  aria-expanded={modeOpen}
                  aria-haspopup="listbox"
                >
                  <ModeIcon className="h-3.5 w-3.5" aria-hidden />
                  {activeMode.label}
                  <ChevronDown className={cn('h-3 w-3 transition', modeOpen && 'rotate-180')} />
                </button>

                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => {
                    setModeOpen(false)
                    setSkillOpen((v) => !v)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition',
                    skillOpen || activeSkill
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  )}
                  aria-expanded={skillOpen}
                  aria-haspopup="listbox"
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden />
                  使用技能
                  <span className="tabular-nums opacity-80">· {SHORT_VIDEO_SKILLS.length}</span>
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

                {modeOpen ? (
                  <div
                    role="listbox"
                    aria-label="创作模式"
                    className="absolute left-0 top-[calc(100%+0.35rem)] z-50 max-h-[min(60vh,22rem)] w-[min(100vw-2rem,20rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/15"
                  >
                    {SHORT_VIDEO_STUDIO_MODES.map((m) => {
                      const Ico = MODE_ICON[m.id]
                      const selected = m.id === activeMode.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            onStudioModeChange(m.id)
                            setModeOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition hover:bg-cyan-50',
                            selected && 'bg-cyan-50 ring-1 ring-cyan-200',
                          )}
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                            <Ico className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">{m.label}</span>
                            <span className="block text-[11px] leading-relaxed text-slate-500">
                              {m.description}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {skillOpen ? (
                  <div
                    role="listbox"
                    aria-label="技能列表"
                    className="absolute left-0 top-[calc(100%+0.35rem)] z-50 max-h-[min(60vh,24rem)] w-[min(100vw-2rem,22rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15 sm:left-auto sm:right-0"
                  >
                    <input
                      type="search"
                      value={skillQuery}
                      onChange={(e) => setSkillQuery(e.target.value)}
                      placeholder={`搜索技能（共 ${SHORT_VIDEO_SKILLS.length} 个）…`}
                      className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                      autoFocus
                    />
                    <ul className="space-y-1">
                      {skills.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={skillId === s.id}
                            onClick={() => applySkill(s)}
                            className={cn(
                              'flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition hover:bg-cyan-50',
                              skillId === s.id && 'bg-cyan-50 ring-1 ring-cyan-200',
                            )}
                          >
                            <span className="text-sm font-semibold text-slate-900">
                              {s.name}
                              <span className="ml-2 text-[11px] font-normal text-slate-400">
                                {s.category}
                              </span>
                            </span>
                            <span className="mt-0.5 text-xs leading-relaxed text-slate-500">
                              {s.description}
                            </span>
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

              <button
                type="button"
                disabled={
                  disabled ||
                  busy ||
                  (!value.trim() &&
                    !activeMode.href &&
                    activeMode.id !== 'canvas' &&
                    activeMode.id !== 'music')
                }
                onClick={() => {
                  if (disabled || busy) return
                  onSubmit()
                }}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-sky-500 px-5 text-sm font-semibold text-white shadow-md shadow-cyan-600/25 hover:from-cyan-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" aria-hidden />
                {busy ? '处理中…' : submitLabel}
              </button>
            </div>
          </div>
        </div>

        {children ? (
          <div
            id="sv-generate-workspace"
            className="border-t border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-3 py-4 sm:px-4"
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
