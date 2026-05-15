import { cn } from '../cn'

type MascotState = 'outputting' | 'idle' | 'userTyping'

function resolveState(aiSending: boolean, inputDraft: string): MascotState {
  if (aiSending) return 'outputting'
  if (inputDraft.trim().length > 0) return 'userTyping'
  return 'idle'
}

/**
 * 墨典智能体输入区旁卡通小人：输出中敲键盘、空闲打哈欠、用户输入时盯输入框。
 */
export function MeooAgentMascot({
  aiSending,
  inputDraft,
  className,
}: {
  aiSending: boolean
  inputDraft: string
  className?: string
}) {
  const state = resolveState(aiSending, inputDraft)

  return (
    <div
      className={cn('relative flex w-[4.5rem] flex-col items-center select-none', className)}
      aria-hidden
      title="墨典小助手"
    >
      <div className="relative h-[5.25rem] w-[4.25rem]">
        <svg viewBox="0 0 68 84" className="h-full w-full drop-shadow-sm" fill="none">
          {/* 身体 */}
          <ellipse cx="34" cy="58" rx="22" ry="20" className="fill-indigo-500" />
          <ellipse cx="34" cy="58" rx="18" ry="16" className="fill-indigo-400/90" />
          {/* 头 */}
          <circle cx="34" cy="30" r="18" className="fill-amber-100 stroke-amber-200/80" strokeWidth="1.2" />
          {/* 小魔方角标 */}
          <rect x="44" y="14" width="10" height="10" rx="1.5" className="fill-violet-600 stroke-violet-800/40" strokeWidth="0.6" />
          <rect x="46.5" y="16.5" width="5" height="5" rx="0.5" className="fill-white/90" />

          {/* 眼睛 — userTyping 时向右看 */}
          <g className={cn('transition-transform duration-300', state === 'userTyping' && 'translate-x-1.5')}>
            <ellipse
              cx="28"
              cy="28"
              rx={state === 'idle' ? 2.2 : 2.5}
              ry={state === 'idle' ? 0.8 : 2.5}
              className={cn('fill-slate-800 transition-all', state === 'idle' && 'opacity-60')}
            />
            <ellipse
              cx="40"
              cy="28"
              rx={state === 'idle' ? 2.2 : 2.5}
              ry={state === 'idle' ? 0.8 : 2.5}
              className={cn('fill-slate-800 transition-all', state === 'idle' && 'opacity-60')}
            />
          </g>

          {/* 嘴：idle 打哈欠张大；其余微笑/抿嘴 */}
          {state === 'idle' ? (
            <ellipse cx="34" cy="38" rx="5" ry="7" className="fill-rose-300/90 stroke-rose-400/50" strokeWidth="0.6">
              <animate attributeName="ry" values="6;8.5;6" dur="2.2s" repeatCount="indefinite" />
            </ellipse>
          ) : (
            <path
              d="M 28 37 Q 34 41 40 37"
              className="stroke-slate-700"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            />
          )}

          {/* 手臂 + 键盘：outputting 时摆动 */}
          <g
            style={
              state === 'outputting'
                ? { animation: 'meooMascotType 0.55s ease-in-out infinite', transformOrigin: '34px 52px' }
                : undefined
            }
          >
            <path d="M 18 48 Q 12 58 14 68" className="stroke-amber-100" strokeWidth="3" strokeLinecap="round" />
            <path d="M 50 48 Q 56 58 54 68" className="stroke-amber-100" strokeWidth="3" strokeLinecap="round" />
            <rect x="10" y="70" width="48" height="10" rx="2" className="fill-slate-700/90 stroke-slate-900/30" strokeWidth="0.8" />
            <g opacity="0.85">
              <rect x="14" y="72" width="6" height="2" rx="0.4" className="fill-slate-500" />
              <rect x="22" y="72" width="6" height="2" rx="0.4" className="fill-slate-500" />
              <rect x="30" y="72" width="6" height="2" rx="0.4" className="fill-slate-500" />
              <rect x="38" y="72" width="6" height="2" rx="0.4" className="fill-slate-500" />
              <rect x="46" y="72" width="6" height="2" rx="0.4" className="fill-slate-500" />
            </g>
          </g>
        </svg>
      </div>
      <span className="mt-0.5 max-w-[4.5rem] truncate text-center text-[9px] font-medium text-indigo-600/90">
        {state === 'outputting' ? '生成中…' : state === 'userTyping' ? '在看输入' : '待机'}
      </span>
      <style>{`
        @keyframes meooMascotType {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          50% { transform: rotate(3deg) translateY(-1px); }
        }
      `}</style>
    </div>
  )
}
