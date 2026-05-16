import { cn } from '../cn'

type MascotState = 'outputting' | 'idle' | 'userTyping'

function resolveState(aiSending: boolean, inputDraft: string): MascotState {
  if (aiSending) return 'outputting'
  if (inputDraft.trim().length > 0) return 'userTyping'
  return 'idle'
}

const IDLE_SRC = '/meoo-agent-idle.png'
const WRITING_SRC = '/meoo-agent-writing.gif'

/**
 * 墨典智能体输入区旁吉祥物：
 * - 未输入：图2 静态卡通（透明底，仅中间形象）
 * - 输入中 / 生成中：书写动图
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
  const isWriting = state === 'userTyping' || state === 'outputting'

  return (
    <div
      className={cn('relative flex w-[4.75rem] flex-col items-center select-none', className)}
      aria-hidden
      title="墨典小助手"
    >
      <MascotFigure isWriting={isWriting} state={state} />
      <span className="mt-0.5 max-w-[4.75rem] truncate text-center text-[9px] font-medium text-indigo-600/90">
        {state === 'outputting' ? '生成中…' : state === 'userTyping' ? '在书写…' : '待机'}
      </span>
    </div>
  )
}

function MascotFigure({
  isWriting,
  state,
}: {
  isWriting: boolean
  state: MascotState
}) {
  return (
    <>
      <div
        className={cn(
          'relative h-[5.5rem] w-[4.5rem] overflow-hidden',
          state === 'outputting' && 'meoo-mascot-output',
        )}
      >
        <img
          src={isWriting ? WRITING_SRC : IDLE_SRC}
          alt=""
          className="h-full w-full object-contain object-bottom [filter:drop-shadow(0_6px_10px_rgba(15,23,42,0.16))]"
          draggable={false}
        />
      </div>
      <style>{`
        @keyframes meooMascotOutput {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .meoo-mascot-output {
          animation: meooMascotOutput 0.7s ease-in-out infinite;
        }
      `}</style>
    </>
  )
}
