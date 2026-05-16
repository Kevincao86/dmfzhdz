import { cn } from '../cn'

type MascotState = 'outputting' | 'idle' | 'userTyping'

function resolveState(aiSending: boolean, inputDraft: string): MascotState {
  if (aiSending) return 'outputting'
  if (inputDraft.trim().length > 0) return 'userTyping'
  return 'idle'
}

const MASCOT_SRC = '/meoo-agent-mascot.png'

/**
 * 墨典智能体输入区旁吉祥物（最初版）：单图 + CSS 待机动效 / 生成中摆动。
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
      <div
        className={cn(
          'relative h-[5.25rem] w-[4.25rem] overflow-visible',
          state === 'outputting' && 'meoo-mascot-typing',
          state === 'userTyping' && 'translate-x-0.5 transition-transform duration-300',
          state === 'idle' && 'meoo-mascot-idle',
        )}
      >
        <img
          src={MASCOT_SRC}
          alt=""
          className="h-full w-full object-contain object-bottom drop-shadow-md"
          draggable={false}
        />
      </div>
      <span className="mt-0.5 max-w-[4.5rem] truncate text-center text-[9px] font-medium text-indigo-600/90">
        {state === 'outputting' ? '生成中…' : state === 'userTyping' ? '在看输入' : '待机'}
      </span>
      <style>{`
        @keyframes meooMascotType {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          50% { transform: rotate(3deg) translateY(-1px); }
        }
        @keyframes meooMascotIdle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .meoo-mascot-typing {
          animation: meooMascotType 0.55s ease-in-out infinite;
          transform-origin: 50% 85%;
        }
        .meoo-mascot-idle {
          animation: meooMascotIdle 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
