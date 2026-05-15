import { cn } from '../cn'

type MascotState = 'outputting' | 'idle' | 'userTyping'

function resolveState(aiSending: boolean, inputDraft: string): MascotState {
  if (aiSending) return 'outputting'
  if (inputDraft.trim().length > 0) return 'userTyping'
  return 'idle'
}

/**
 * 墨典智能体输入区旁吉祥物（透明底 PNG）：
 * - 待机：轻微浮动
 * - 正在输入：毛笔在书上书写的往复摆动
 * - 生成中：轻微摆动（呼应「工作中」）
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
          state === 'outputting' && 'meoo-mascot-output',
          state === 'userTyping' && 'meoo-mascot-writing',
          state === 'idle' && 'meoo-mascot-idle',
        )}
      >
        <img
          src="/meoo-agent-mascot.png"
          alt=""
          className="relative z-0 h-full w-full object-contain object-bottom [filter:drop-shadow(0_6px_10px_rgba(15,23,42,0.18))]"
          draggable={false}
        />
      </div>
      <span className="mt-0.5 max-w-[4.5rem] truncate text-center text-[9px] font-medium text-indigo-600/90">
        {state === 'outputting' ? '生成中…' : state === 'userTyping' ? '在书写…' : '待机'}
      </span>
      <style>{`
        @keyframes meooMascotOutput {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          50% { transform: rotate(3deg) translateY(-1px); }
        }
        @keyframes meooMascotIdle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        /** 输入框有内容：模拟拿毛笔在书上落笔、提笔的往复（transform-origin 约在角色足部偏中） */
        @keyframes meooMascotWriting {
          0%, 100% { transform: rotate(-5deg) translate(0, 0); }
          22% { transform: rotate(-11deg) translate(3px, 1px); }
          45% { transform: rotate(-6deg) translate(5px, 0); }
          68% { transform: rotate(-12deg) translate(2px, 2px); }
          85% { transform: rotate(-7deg) translate(4px, 0); }
        }
        .meoo-mascot-output {
          animation: meooMascotOutput 0.55s ease-in-out infinite;
          transform-origin: 50% 88%;
        }
        .meoo-mascot-idle {
          animation: meooMascotIdle 2.4s ease-in-out infinite;
          transform-origin: 50% 88%;
        }
        .meoo-mascot-writing {
          animation: meooMascotWriting 0.42s ease-in-out infinite;
          transform-origin: 52% 90%;
        }
      `}</style>
    </div>
  )
}
