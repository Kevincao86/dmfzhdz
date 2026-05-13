import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type {
  AiAgentMessage,
  AiAgentOpenContext,
  AiPermissionId,
  AiTaskPreviewPayload,
  AiTaskType,
} from '../lib/aiAgentTypes'
import { AI_TASK_TYPE_LABELS, createAgentMessage } from '../lib/aiAgentTypes'

type AiAgentContextValue = {
  drawerOpen: boolean
  openDrawer: (ctx?: AiAgentOpenContext) => void
  closeDrawer: () => void
  pageContext: AiAgentOpenContext | null
  permissions: Record<AiPermissionId, boolean>
  messages: AiAgentMessage[]
  inputDraft: string
  setInputDraft: (v: string) => void
  sendUserText: (text: string) => void
  applyShortcut: (taskType: AiTaskType) => void
  /** 当前待确认的任务预览消息 id */
  pendingPreviewId: string | null
  confirmPendingTask: () => void
  cancelPendingTask: () => void
  modifyPendingTask: () => void
  /** 顶部搜索框提交：带入抽屉并作为用户意图 */
  submitTopSearchQuery: (query: string) => void
}

const AiAgentContext = createContext<AiAgentContextValue | null>(null)

function buildPreviewForTask(taskType: AiTaskType, pageLabel?: string): AiTaskPreviewPayload {
  const ctxLine = pageLabel ? `页面上下文：${pageLabel}` : ''
  switch (taskType) {
    case 'create_product':
      return {
        taskType,
        title: '创建商品任务',
        steps: [
          ...(ctxLine ? [ctxLine] : []),
          '解析商品类型与适用平台（抖音来客 / 美团 / 小红书等）',
          '生成 3 个候选商品标题与套餐结构草稿',
          '校验类目模板字段与图片规范',
          '在确认后调用商品创建流程并写入草稿或提交审核',
        ],
      }
    case 'recruit_influencer':
      return {
        taskType,
        title: '达人招募任务',
        steps: [
          '根据门店与城市筛选达人池与粉丝量级',
          '生成招募话术与报价区间建议',
          '创建邀约批次并等待你确认后发送',
        ],
      }
    case 'handle_review':
      return {
        taskType,
        title: '评价处理任务',
        steps: [
          '拉取最近差评与中评列表',
          '生成回复草稿（可多条）',
          '在确认后提交至平台或标记为已跟进',
        ],
      }
    case 'sync_platform':
      return {
        taskType,
        title: '平台同步任务',
        steps: [
          '比对 ERP 与各平台商品/库存差异',
          '生成同步项清单（新增、更新、下架）',
          '在确认后逐项调用同步接口并输出结果报告',
        ],
      }
    case 'analyze_exception':
      return {
        taskType,
        title: '异常分析任务',
        steps: [
          '聚合最近同步失败、审核驳回、接口报错日志',
          '归纳根因类别（权限、字段、图片、类目变更等）',
          '输出修复建议清单；高风险项需你二次确认后再改',
        ],
      }
    case 'generate_copywriting':
    default:
      return {
        taskType: 'generate_copywriting',
        title: '推广文案生成',
        steps: [
          '读取商品/活动卖点与限制词表',
          '生成多平台适配文案（标题、短描述、话题标签）',
          '在确认后写入素材库或同步至投放草稿',
        ],
      }
  }
}

function mockAssistantReply(userText: string, pageLabel?: string): string {
  const t = userText.trim()
  if (!t) return '请描述你想完成的任务，或点击下方快捷任务。'
  if (/创建|商品|套餐|上架/.test(t))
    return `已理解你的意图：「${t.slice(0, 80)}」。${pageLabel ? `结合当前页面「${pageLabel}」，` : ''}我将先整理可执行步骤，请在下方预览中确认后再真正创建或修改数据。`
  if (/达人|招募|探店/.test(t))
    return `已理解：「${t.slice(0, 80)}」。我会按你的门店与类目生成招募方案，确认后再发起邀约。`
  if (/差评|评价|评论/.test(t))
    return `已理解：「${t.slice(0, 80)}」。我会先拉取待处理评价并生成回复草稿，确认后再提交。`
  if (/同步|失败|异常|分析/.test(t))
    return `已理解：「${t.slice(0, 80)}」。我会汇总同步与接口状态并给出原因假设，确认后再执行修复类操作。`
  return `已收到：「${t.slice(0, 120)}」。当前为智能体工作台演示模式；接入后端后，将分解为可执行任务并逐步执行。涉及创建、修改、删除、发布等操作前，均会请你确认。`
}

export function AiAgentProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageContext, setPageContext] = useState<AiAgentOpenContext | null>(null)
  const [messages, setMessages] = useState<AiAgentMessage[]>(() => [
    createAgentMessage(
      'assistant',
      '你好，我是店魔方 AI 智能体。你可以用自然语言描述任务，或使用快捷按钮；涉及写操作前我会展示执行预览，需你确认后再执行。',
    ),
  ])
  const [inputDraft, setInputDraft] = useState('')
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null)

  /** 演示：默认已接入各能力；后续与租户权限接口对齐 */
  const permissions = useMemo<Record<AiPermissionId, boolean>>(
    () => ({
      product: true,
      store: true,
      influencer: true,
      review: true,
      sync: true,
    }),
    [],
  )

  const openDrawer = useCallback((ctx?: AiAgentOpenContext) => {
    setPageContext(ctx ?? null)
    setDrawerOpen(true)
    if (ctx?.draftInput) setInputDraft(ctx.draftInput)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  const pushPreview = useCallback((taskType: AiTaskType, intro: string, pageLabelOverride?: string) => {
    const preview = buildPreviewForTask(taskType, pageLabelOverride ?? pageContext?.pageLabel)
    const msg = createAgentMessage('task_preview', intro, { preview })
    setPendingPreviewId(msg.id)
    setMessages((prev) => [...prev, msg])
  }, [pageContext?.pageLabel])

  const sendUserText = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setMessages((prev) => [...prev, createAgentMessage('user', trimmed)])
      setInputDraft('')
      const reply = mockAssistantReply(trimmed, pageContext?.pageLabel)
      setMessages((prev) => [...prev, createAgentMessage('assistant', reply)])

      if (/创建|商品|套餐|上架|双人|单人/.test(trimmed)) {
        setTimeout(() => {
          pushPreview(
            'create_product',
            '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。',
            pageContext?.pageLabel,
          )
        }, 200)
      } else if (/达人|招募|探店/.test(trimmed)) {
        setTimeout(() => {
          pushPreview(
            'recruit_influencer',
            '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。',
            pageContext?.pageLabel,
          )
        }, 200)
      } else if (/差评|评价|评论/.test(trimmed)) {
        setTimeout(() => {
          pushPreview(
            'handle_review',
            '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。',
            pageContext?.pageLabel,
          )
        }, 200)
      } else if (/同步|失败|异常|分析/.test(trimmed)) {
        setTimeout(() => {
          pushPreview(
            /分析|原因|异常/.test(trimmed) ? 'analyze_exception' : 'sync_platform',
            '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。',
            pageContext?.pageLabel,
          )
        }, 200)
      }
    },
    [pageContext?.pageLabel, pushPreview],
  )

  const applyShortcut = useCallback(
    (taskType: AiTaskType) => {
      const label = AI_TASK_TYPE_LABELS[taskType]
      setMessages((prev) => [...prev, createAgentMessage('user', `使用快捷任务：${label}`)])
      const assistantLine = `好的，已选择「${label}」。以下为拟执行步骤，请确认；确认后将在对接后端后调用真实接口（当前为演示）。`
      setMessages((prev) => [...prev, createAgentMessage('assistant', assistantLine)])
      setTimeout(() => {
        pushPreview(taskType, `即将执行：${label}。请核对以下步骤：`, pageContext?.pageLabel)
      }, 150)
    },
    [pageContext?.pageLabel, pushPreview],
  )

  const confirmPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const p = prev.find((m) => m.id === pendingPreviewId)?.preview
      const title = p?.title ?? '任务'
      return [
        ...prev,
        createAgentMessage(
          'task_result',
          `「${title}」已确认。演示模式下未调用真实接口；后续将按步骤调用开放平台并回写结果。`,
          { resultSummary: 'confirmed' },
        ),
      ]
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const cancelPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => [...prev, createAgentMessage('system', '已取消本次待执行操作。')])
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const modifyPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => [
      ...prev,
      createAgentMessage(
        'assistant',
        '请直接在输入框中说明需要调整的部分（例如：只要同步抖音、先不要发布等）。我会根据你的补充重新生成方案。',
      ),
    ])
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const submitTopSearchQuery = useCallback(
    (query: string) => {
      const q = query.trim()
      if (!q) return
      const pl = '顶部搜索 / AI 指令'
      setPageContext({ pageLabel: pl, draftInput: q })
      setDrawerOpen(true)
      setInputDraft('')
      setMessages((prev) => [
        ...prev,
        createAgentMessage('user', q),
        createAgentMessage('assistant', mockAssistantReply(q, pl)),
      ])
      const intro = '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。'
      if (/创建|商品|套餐|上架|双人|单人/.test(q)) {
        setTimeout(() => pushPreview('create_product', intro, pl), 200)
      } else if (/达人|招募|探店/.test(q)) {
        setTimeout(() => pushPreview('recruit_influencer', intro, pl), 200)
      } else if (/差评|评价|评论/.test(q)) {
        setTimeout(() => pushPreview('handle_review', intro, pl), 200)
      } else if (/同步|失败|异常|分析/.test(q)) {
        setTimeout(
          () => pushPreview(/分析|原因|异常/.test(q) ? 'analyze_exception' : 'sync_platform', intro, pl),
          200,
        )
      }
    },
    [pushPreview],
  )

  const value = useMemo<AiAgentContextValue>(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer,
      pageContext,
      permissions,
      messages,
      inputDraft,
      setInputDraft,
      sendUserText,
      applyShortcut,
      pendingPreviewId,
      confirmPendingTask,
      cancelPendingTask,
      modifyPendingTask,
      submitTopSearchQuery,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      pageContext,
      permissions,
      messages,
      inputDraft,
      sendUserText,
      applyShortcut,
      pendingPreviewId,
      confirmPendingTask,
      cancelPendingTask,
      modifyPendingTask,
      submitTopSearchQuery,
    ],
  )

  return <AiAgentContext.Provider value={value}>{children}</AiAgentContext.Provider>
}

export function useAiAgent(): AiAgentContextValue {
  const v = useContext(AiAgentContext)
  if (!v) throw new Error('useAiAgent must be used within AiAgentProvider')
  return v
}

export function useAiAgentOptional(): AiAgentContextValue | null {
  return useContext(AiAgentContext)
}
