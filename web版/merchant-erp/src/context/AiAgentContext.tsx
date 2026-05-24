import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { saveAiProductDraft, saveAiProductDraftBatch, type AiProductDraft } from '../lib/aiProductDraft'
import type {
  AiAgentArchivedSession,
  AiAgentMessage,
  AiAgentOpenContext,
  AiAgentPendingQuote,
  AiComposerAttachment,
  AiPermissionId,
  AiProductPlanPreview,
  AiRecruitmentBriefPreview,
  AiTaskPreviewPayload,
  AiTaskType,
} from '../lib/aiAgentTypes'
import {
  briefProductNameHint,
  buildPlanExecutionConsultation,
  coerceAgentDisplayError,
  coerceAgentTextField,
  formatAssistantDisplayText,
  inferTaskTypeFromText,
  inferTaskTypesFromCombinedContext,
  isExplicitExecutionIntent,
  isPlanDesignQuery,
  isUserDecliningProductImages,
  parseComboLinesFromApi,
  parsePriceYuanFromApi,
  inferVoucherPricesFromText,
  parseAgentActionType,
  parseCreateProductIntents,
  parseCreateProductIntentsFromPlan,
  shouldDeferTaskPreview,
  summarizeAssistantContent,
} from '../lib/aiAgentActionParse'
import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { isProductPreviewLoading, listProductPlansFromPreview } from '../lib/aiAgentProductPlans'
import { appendKolBriefRecord, writeSelectedBriefForRecruitment } from '../lib/kolBriefStorage'
import {
  loadMerchantIntelSnapshot,
  merchantIntelForProductPlanApi,
  merchantIntelStatusLine,
} from '../lib/agentMerchantContext'
import {
  buildAgentMerchantIntelContextAsync,
  loadFullMerchantIntelSnapshot,
} from '../lib/agentMerchantIntelLoader'
import { fetchAiProductPlan, fetchAiProductPlansBatch } from '../services/storeIntelApi'
import { enrichAiProductPlanPreview } from '../services/aiAgentProductPlanEnrich'
import { buildAiRecruitmentBriefPreview } from '../services/aiAgentRecruitmentBriefEnrich'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import { loadDouyinWizardLastContext } from '../lib/douyinWizardLastContext'
import { AI_TASK_TYPE_LABELS, createAgentMessage } from '../lib/aiAgentTypes'
import {
  buildAiAgentPlanProfile,
  membershipAllowsAiTask,
} from '../lib/aiAgentPlan'
import {
  buildRecruitmentOrderFromAgentBrief,
  recruitmentOrderDetailFromRegistry,
} from '../lib/aiAgentRecruitmentOrder'
import { appendRecruitmentOrderToOps } from '../lib/opsRegistryClient'
import { buildAgentRecruitmentAllocation } from '../services/aiAgentRecruitmentAllocation'
import { resolveRecruitmentOrderTenantMeta } from '../lib/recruitmentOrderMeta'
import { appendTaxFilingRecord, buildTaxExportBlob, buildTaxPlatformRows } from '../lib/taxFiling'
import { buildAiTaxFilingPreview } from '../services/aiAgentTaxFilingPreview'
import { compressImageFileToDataUrl } from '../lib/aiImageCompress'
import {
  extractVideoPosterDataUrl,
  isComposerImageFile,
  isComposerVideoFile,
} from '../lib/aiVideoPoster'
import { modelPickerKeyForNativeImageVendor } from '../services/ai/aiImageIntentRouting'
import { shouldRouteToAgentNativeImage } from '../services/ai/agentModelRoute'
import {
  agentNativeImageRouteFromPickerKey,
  effectiveChatPickerKey,
  resolveImagePickerKeyForUserLine,
} from '../services/ai/agentImageModelKeys'
import {
  defaultAiModelPickerKeyForPlan,
  listAiModelPickerOptionsForPlan,
  parseAiModelPickerKey,
} from '../services/ai/modelRegistry'
import { useMembership } from './MembershipContext'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { listMerchantBindings } from '../lib/merchantPlatformBindings'
import { fetchFinanceReconcile } from '../services/financeReconcileApi'
import { defaultModelIdForFamily } from '../services/ai/tokenmixClient'
import {
  isAiRequestAborted,
  postAiAgentNativeImage,
  postAiChat,
  type AiAgentNativeImageOk,
} from '../services/ai/aiClient'
import { MAX_AI_CHAT_IMAGE_ATTACHMENTS, type AIMessage } from '../services/ai/types'

function buildAgentImagePostOpts(
  pickerKey: string,
  referenceImageDataUrl?: string,
): Parameters<typeof postAiAgentNativeImage>[1] | undefined {
  const r = agentNativeImageRouteFromPickerKey(pickerKey)
  const o: NonNullable<Parameters<typeof postAiAgentNativeImage>[1]> = {}
  const ref = referenceImageDataUrl?.trim()
  if (ref) o.referenceImageDataUrl = ref
  if (r.route === 'tokenmix') {
    o.imageRoute = 'tokenmix'
    o.tokenmixImageModel = r.tokenmixImageModel
  } else if (r.preferredVendor) {
    o.preferredVendor = r.preferredVendor
  }
  if (Object.keys(o).length === 0) return undefined
  return o
}

function captionForAgentImageResult(img: AiAgentNativeImageOk, isI2i: boolean): string {
  if (img.channel === 'tokenmix') {
    let s = `已使用 **${img.displayModel ?? '图像模型'}** 生成下方结果。`
    if (img.fallbackNote) s += `\n\n${img.fallbackNote}`
    return s
  }
  const vendorZh =
    img.vendorUsed === 'qwen' ? '通义万相' : img.vendorUsed === 'doubao' ? '豆包 Seedream' : 'MiniMax'
  let s = isI2i
    ? `已使用 **${vendorZh}** 图生图（已参考你上传的图片）。下方为生成结果。`
    : `已使用 **${vendorZh}** 文生图生成下方结果（与商品 AI 共用服务端配置）。如需改风格、主体或构图，请直接说明。`
  if (img.fallbackNote) s += `\n\n${img.fallbackNote}`
  return s
}

const PREFS_KEY = 'meoo_ai_model_picker_key'

function loadPickerKey(plan: import('../lib/membershipPlan').MembershipPlan): string {
  const fallback = defaultAiModelPickerKeyForPlan(plan)
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const opts = listAiModelPickerOptionsForPlan(plan)
    return opts.some((o) => o.key === raw) ? raw : fallback
  } catch {
    return fallback
  }
}

function savePickerKey(key: string): void {
  try {
    localStorage.setItem(PREFS_KEY, key)
  } catch {
    /* ignore */
  }
}

function agentMessagesToChatMessages(msgs: AiAgentMessage[]): AIMessage[] {
  const out: AIMessage[] = []
  for (const m of msgs) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out.slice(-24)
}

const MAX_ARCHIVED_SESSIONS = 10
const MAX_COMPOSER_ATTACHMENTS = MAX_AI_CHAT_IMAGE_ATTACHMENTS
const MAX_COMPOSER_VIDEO_BYTES = 100 * 1024 * 1024

function revokeComposerAttachment(att: AiComposerAttachment) {
  if (att.kind === 'video') URL.revokeObjectURL(att.previewUrl)
}

function attachmentVisionUrls(attachments: AiComposerAttachment[]): string[] {
  return attachments.map((a) => (a.kind === 'image' ? a.url : a.posterUrl))
}

function userReferenceImagesFromMessages(msgs: AiAgentMessage[]): string[] {
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  return lastUser?.imageUrls?.map((u) => u.trim()).filter(Boolean) ?? []
}

function cloneAgentMessages(msgs: AiAgentMessage[]): AiAgentMessage[] {
  return structuredClone(msgs) as AiAgentMessage[]
}

function sessionTitleFromMessages(msgs: AiAgentMessage[]): string {
  const u = msgs.find((m) => m.role === 'user')
  const raw = (u?.content ?? '对话').trim().replace(/\s+/g, ' ')
  if (!raw) return '对话'
  return raw.length <= 32 ? raw : `${raw.slice(0, 31)}…`
}

type AiAgentContextValue = {
  drawerOpen: boolean
  openDrawer: (ctx?: AiAgentOpenContext) => void
  closeDrawer: () => void
  pageContext: AiAgentOpenContext | null
  permissions: Record<AiPermissionId, boolean>
  messages: AiAgentMessage[]
  inputDraft: string
  setInputDraft: Dispatch<SetStateAction<string>>
  sendUserText: (text: string) => void
  applyShortcut: (taskType: AiTaskType) => void
  pendingPreviewId: string | null
  pendingPreviewTaskType: AiTaskType | null
  /** 商品/招募预览生成中（禁用确认） */
  pendingPreviewLoading: boolean
  /** 招募订单确认推送中（禁用确认） */
  taskConfirming: boolean
  confirmPendingTask: () => void
  /** 批量保存商品方案至草稿箱（不跳转提交） */
  savePendingTaskToDrafts: () => void
  cancelPendingTask: () => void
  modifyPendingTask: () => void
  /** 创建商品预览：用户勾选的上架平台 */
  previewSubmitPlatforms: CreatePlatformId[]
  togglePreviewSubmitPlatform: (id: CreatePlatformId) => void
  submitTopSearchQuery: (query: string) => void
  /** 多模型：下拉 key，与 modelRegistry 中 listAiModelPickerOptions 一致 */
  modelPickerKey: string
  setModelPickerKey: (key: string) => void
  modelPickerOptions: ReturnType<typeof listAiModelPickerOptionsForPlan>
  agentProfile: ReturnType<typeof buildAiAgentPlanProfile>
  aiSending: boolean
  /** 终止当前进行中的对话/生图请求 */
  stopAiGeneration: () => void
  /** 主输入区待发送的图片/视频（最多 8 个） */
  pendingComposerAttachments: AiComposerAttachment[]
  addComposerMediaFiles: (files: FileList | File[] | null) => Promise<void>
  removeComposerAttachment: (index: number) => void
  clearComposerAttachments: () => void
  /** 发送下一条用户消息时，将附在正文前的「引用」片段 */
  pendingQuote: AiAgentPendingQuote | null
  quoteMessage: (m: AiAgentMessage) => void
  clearPendingQuote: () => void
  /** 有用户发言后的侧边栏：历史对话快照，最多 10 条 */
  archivedSessions: AiAgentArchivedSession[]
  /** 将当前对话存档并回到欢迎空态 */
  startNewChat: () => void
  /** 从历史恢复一条对话到主区域（当前有内容会先被存档） */
  resumeArchivedSession: (sessionId: string) => void
  /** 侧边栏当前高亮的历史项（从 resume 进入时） */
  sidebarActiveArchiveId: string | null
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
    case 'file_tax':
      return {
        taskType,
        title: '一键报税',
        steps: [
          '读取各已绑定平台（抖音来客、小红书等）与财务对账核销数据',
          '按申报周期汇总销售额与核销额',
          '在确认后导出报税数据包并记录申报状态（正式税局接口可后续对接）',
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

export function AiAgentProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { plan, entitlements } = useMembership()
  const agentProfile = useMemo(() => buildAiAgentPlanProfile(plan), [plan])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageContext, setPageContext] = useState<AiAgentOpenContext | null>(null)
  const [messages, setMessages] = useState<AiAgentMessage[]>(() => [
    createAgentMessage('assistant', buildAiAgentPlanProfile('member').welcome),
  ])
  const [archivedSessions, setArchivedSessions] = useState<AiAgentArchivedSession[]>([])
  const [sidebarActiveArchiveId, setSidebarActiveArchiveId] = useState<string | null>(null)
  const [inputDraft, setInputDraft] = useState('')
  const [pendingComposerAttachments, setPendingComposerAttachments] = useState<
    AiComposerAttachment[]
  >([])
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null)
  const [pendingQuote, setPendingQuote] = useState<AiAgentPendingQuote | null>(null)
  const pendingQuoteRef = useRef<AiAgentPendingQuote | null>(null)
  const [modelPickerKey, setModelPickerKeyState] = useState(() =>
    defaultAiModelPickerKeyForPlan('free'),
  )
  const [aiSending, setAiSending] = useState(false)
  const [taskConfirming, setTaskConfirming] = useState(false)
  const aiRunAbortRef = useRef<AbortController | null>(null)
  const merchantIntelCacheRef = useRef<{
    at: number
    task?: AiTaskType
    text: string
  } | null>(null)
  const MERCHANT_INTEL_CACHE_MS = 45_000

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  type PendingExecutionCtx = {
    userBrief: string
    assistantContent: string
    taskTypes: AiTaskType[]
  }
  const pendingExecutionRef = useRef<PendingExecutionCtx | null>(null)
  const awaitingProductImagesRef = useRef(false)

  const [previewSubmitPlatforms, setPreviewSubmitPlatforms] = useState<CreatePlatformId[]>([
    'douyin',
  ])

  const archivedRef = useRef(archivedSessions)
  archivedRef.current = archivedSessions

  const resolveMerchantIntelBlock = useCallback(async (taskType?: AiTaskType) => {
    const now = Date.now()
    const hit = merchantIntelCacheRef.current
    if (hit && now - hit.at < MERCHANT_INTEL_CACHE_MS && hit.task === taskType) {
      return hit.text
    }
    const text = await buildAgentMerchantIntelContextAsync(taskType)
    merchantIntelCacheRef.current = { at: now, task: taskType, text }
    return text
  }, [])

  useEffect(() => {
    pendingQuoteRef.current = pendingQuote
  }, [pendingQuote])

  useEffect(() => {
    const key = loadPickerKey(plan)
    setModelPickerKeyState(key)
  }, [plan])

  const beginAiRun = useCallback((): AbortController => {
    aiRunAbortRef.current?.abort()
    const ac = new AbortController()
    aiRunAbortRef.current = ac
    return ac
  }, [])

  const endAiRun = useCallback((ac: AbortController) => {
    if (aiRunAbortRef.current === ac) aiRunAbortRef.current = null
    setAiSending(false)
  }, [])

  const appendStoppedMessage = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.content === '已停止生成。') {
        return prev
      }
      const next = [...prev, createAgentMessage('assistant', '已停止生成。')]
      messagesRef.current = next
      return next
    })
  }, [])

  const stopAiGeneration = useCallback(() => {
    aiRunAbortRef.current?.abort()
    aiRunAbortRef.current = null
    setAiSending(false)
    appendStoppedMessage()
  }, [appendStoppedMessage])

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.role !== 'assistant') return prev
      return [createAgentMessage('assistant', agentProfile.welcome)]
    })
  }, [agentProfile.welcome])

  const modelPickerOptions = useMemo(() => listAiModelPickerOptionsForPlan(plan), [plan])

  const setModelPickerKey = useCallback((key: string) => {
    setModelPickerKeyState(key)
    savePickerKey(key)
  }, [])

  const permissions = useMemo<Record<AiPermissionId, boolean>>(
    () => agentProfile.permissions,
    [agentProfile],
  )

  const openDrawer = useCallback((ctx?: AiAgentOpenContext) => {
    setPageContext(ctx ?? null)
    setDrawerOpen(true)
    if (ctx?.draftInput) setInputDraft(ctx.draftInput)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  const addComposerMediaFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length) return
    const added: AiComposerAttachment[] = []
    for (const file of Array.from(files)) {
      try {
        if (isComposerImageFile(file)) {
          added.push({ kind: 'image', url: await compressImageFileToDataUrl(file) })
        } else if (isComposerVideoFile(file)) {
          if (file.size > MAX_COMPOSER_VIDEO_BYTES) continue
          const posterUrl = await extractVideoPosterDataUrl(file)
          const previewUrl = URL.createObjectURL(file)
          added.push({
            kind: 'video',
            previewUrl,
            posterUrl,
            name: file.name || 'video.mp4',
          })
        }
      } catch {
        /* 跳过无法解析的文件 */
      }
    }
    if (!added.length) return
    setPendingComposerAttachments((prev) => {
      const next = [...prev]
      for (const att of added) {
        if (next.length >= MAX_COMPOSER_ATTACHMENTS) break
        next.push(att)
      }
      return next.length === prev.length ? prev : next
    })
  }, [])

  const clearPendingQuote = useCallback(() => setPendingQuote(null), [])

  const quoteMessage = useCallback((m: AiAgentMessage) => {
    if (m.role !== 'user' && m.role !== 'assistant') return
    const text = (m.content ?? '').trim()
    const hasImg = Boolean(m.imageUrls?.some((u) => u?.trim()))
    const hasVid = Boolean(m.videoUrls?.some((u) => u?.trim()))
    let excerpt = text.slice(0, 500)
    if (!excerpt) excerpt = hasVid ? '［附视频，无文字］' : hasImg ? '［附图，无文字］' : '（空消息）'
    else if (hasVid) excerpt = `［附视频］ ${excerpt}`.slice(0, 500)
    else if (hasImg) excerpt = `［附图］ ${excerpt}`.slice(0, 500)
    setPendingQuote({
      quotedMessageId: m.id,
      role: m.role,
      excerpt,
    })
  }, [])

  const removeComposerAttachment = useCallback((index: number) => {
    setPendingComposerAttachments((prev) => {
      const hit = prev[index]
      if (hit) revokeComposerAttachment(hit)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const clearComposerAttachments = useCallback(() => {
    setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
  }, [])

  const pushCurrentToArchiveIfHasUser = useCallback(() => {
    const cur = messagesRef.current
    if (!cur.some((m) => m.role === 'user')) return
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry: AiAgentArchivedSession = {
      id,
      title: sessionTitleFromMessages(cur),
      messages: cloneAgentMessages(cur),
      updatedAt: Date.now(),
    }
    setArchivedSessions((prev) => [entry, ...prev].slice(0, MAX_ARCHIVED_SESSIONS))
  }, [])

  const resetToWelcome = useCallback(() => {
    const fresh = [createAgentMessage('assistant', agentProfile.welcome)]
    setMessages(fresh)
    messagesRef.current = fresh
    setPendingPreviewId(null)
    pendingExecutionRef.current = null
    awaitingProductImagesRef.current = false
    setPreviewSubmitPlatforms(['douyin'])
    setInputDraft('')
    setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
    setPendingQuote(null)
  }, [agentProfile.welcome])

  const startNewChat = useCallback(() => {
    pushCurrentToArchiveIfHasUser()
    resetToWelcome()
    setSidebarActiveArchiveId(null)
  }, [pushCurrentToArchiveIfHasUser, resetToWelcome])

  const resumeArchivedSession = useCallback(
    (sessionId: string) => {
      if (sessionId === sidebarActiveArchiveId) return
      const hit = archivedRef.current.find((s) => s.id === sessionId)
      if (!hit) return
      pushCurrentToArchiveIfHasUser()
      const next = cloneAgentMessages(hit.messages)
      setMessages(next)
      messagesRef.current = next
      setPendingPreviewId(null)
      setInputDraft('')
      setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
      setPendingQuote(null)
      setSidebarActiveArchiveId(sessionId)
    },
    [pushCurrentToArchiveIfHasUser, sidebarActiveArchiveId],
  )

  const pushPreview = useCallback((taskType: AiTaskType, intro: string, pageLabelOverride?: string) => {
    const preview = buildPreviewForTask(taskType, pageLabelOverride ?? pageContext?.pageLabel)
    const msg = createAgentMessage('task_preview', intro, { preview })
    setPendingPreviewId(msg.id)
    setMessages((prev) => {
      const next = [...prev, msg]
      messagesRef.current = next
      return next
    })
    return msg.id
  }, [pageContext?.pageLabel])

  const patchPreviewProductPlans = useCallback(
    (
      previewMsgId: string,
      plans: AiProductPlanPreview[],
      content?: string,
    ) => {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== previewMsgId || !m.preview) return m
          return {
            ...m,
            ...(content ? { content } : {}),
            preview: {
              ...m.preview,
              productPlans: plans,
              productPlan: plans[0],
            },
          }
        })
        messagesRef.current = next
        return next
      })
    },
    [],
  )

  const patchPreviewRecruitmentBrief = useCallback(
    (previewMsgId: string, patch: Partial<AiRecruitmentBriefPreview>, content?: string) => {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== previewMsgId || !m.preview) return m
          const cur = m.preview.recruitmentBrief
          return {
            ...m,
            ...(content ? { content } : {}),
            preview: {
              ...m.preview,
              recruitmentBrief: cur
                ? { ...cur, ...patch }
                : ({ ...patch } as AiRecruitmentBriefPreview),
            },
          }
        })
        messagesRef.current = next
        return next
      })
    },
    [],
  )

  const planFromApi = (
    intent: ReturnType<typeof parseCreateProductIntents>[number],
    plan: import('../services/storeIntelApi').AiProductPlan,
    userBrief: string,
  ): AiProductPlanPreview => {
    const productName =
      coerceAgentTextField(plan.productName) || intent.label
    const suggestedPriceYuan = parsePriceYuanFromApi(plan.suggestedPriceYuan) ?? 0
    return {
      slotKey: intent.key,
      slotLabel: intent.label,
      productName,
      suggestedPriceYuan,
      description: coerceAgentTextField(plan.description) || '正在生成说明…',
      comboLines: parseComboLinesFromApi(plan.comboLines),
      productType:
        intent.productType ?? inferDouyinProductTypeFromText(`${userBrief} ${productName}`),
      enrichStatus: 'loading',
      ...(parsePriceYuanFromApi(plan.originYuan) != null
        ? { originYuan: parsePriceYuanFromApi(plan.originYuan) }
        : {}),
      ...(coerceAgentTextField(plan.marginNote) ? { marginNote: coerceAgentTextField(plan.marginNote) } : {}),
      ...(coerceAgentTextField(plan.competitorNote)
        ? { competitorNote: coerceAgentTextField(plan.competitorNote) }
        : {}),
      ...(plan.riskLevel ? { riskLevel: plan.riskLevel } : {}),
    }
  }

  const attachProductPlanToPreview = useCallback(
    async (previewMsgId: string, userBrief: string, assistantContent?: string) => {
      const intents = parseCreateProductIntentsFromPlan(userBrief, assistantContent)
      const userReferenceImages = userReferenceImagesFromMessages(messagesRef.current)
      const hasUserRefs = userReferenceImages.length > 0
      const imagePhaseHint = hasUserRefs
        ? `正在基于您上传的 ${userReferenceImages.length} 张参考图优化主图`
        : '正在优化标题与主图'
      const loadingIntro =
        intents.length > 1
          ? `正在分别为 ${intents.map((i) => i.label).join('、')} 生成团购方案与 C 端预览…`
          : `正在生成团购方案，并${imagePhaseHint}…`
      patchPreviewProductPlans(
        previewMsgId,
        intents.map((intent) => {
          const voucher = intent.productType === 2 ? inferVoucherPricesFromText(userBrief) : {}
          return {
            slotKey: intent.key,
            slotLabel: intent.label,
            productName: intent.label,
            suggestedPriceYuan: voucher.price ?? 0,
            description: '正在生成方案…',
            comboLines: [],
            productType: intent.productType,
            enrichStatus: 'loading' as const,
            ...(voucher.origin != null ? { originYuan: voucher.origin } : {}),
          }
        }),
        loadingIntro,
      )

      const intel = await loadFullMerchantIntelSnapshot('create_product')
      const planCtx = merchantIntelForProductPlanApi(userBrief, intel)
      const errorPlan = (intent: (typeof intents)[number], message: string): AiProductPlanPreview => ({
        slotKey: intent.key,
        slotLabel: intent.label,
        productName: intent.label,
        suggestedPriceYuan: 0,
        description: '方案生成失败',
        comboLines: [],
        productType: intent.productType,
        enrichStatus: 'error',
        enrichError: coerceAgentDisplayError(message, '方案生成失败'),
      })

      let basePlans: AiProductPlanPreview[]

      if (intents.length > 1) {
        const batch = await fetchAiProductPlansBatch({
          ...planCtx,
          userBrief,
          intentLabels: intents.map((i) => i.label),
        })
        if (!batch.ok) {
          basePlans = intents.map((intent) => errorPlan(intent, batch.message))
        } else {
          const byLabel = new Map(batch.plans.map((p) => [p.slotLabel, p]))
          basePlans = intents.map((intent) => {
            const plan = byLabel.get(intent.label)
            if (!plan) return errorPlan(intent, '批量方案中缺少该项')
            return planFromApi(intent, plan, userBrief)
          })
        }
      } else {
        const r = await fetchAiProductPlan(planCtx)
        basePlans = intents.map((intent) =>
          r.ok ? planFromApi(intent, r.plan, userBrief) : errorPlan(intent, r.message),
        )
      }

      const okPlans = basePlans.filter((p) => p.enrichStatus === 'loading')
      const failedPlans = basePlans.filter((p) => p.enrichStatus === 'error')
      const anyOk = okPlans.length > 0
      let statusIntro = '方案生成失败，请稍后重试或改在「创建商品」页手动填写。'
      if (anyOk && failedPlans.length === 0) {
        statusIntro =
          intents.length > 1
            ? `已生成 ${okPlans.length} 项方案草稿，${imagePhaseHint}…`
            : `已生成方案草稿，${imagePhaseHint}…`
      } else if (anyOk && failedPlans.length > 0) {
        statusIntro = `已生成 ${okPlans.length} 项；${failedPlans.length} 项失败：${failedPlans
          .map((p) => `${p.slotLabel}（${coerceAgentDisplayError(p.enrichError, '失败')}）`)
          .join('；')}`
      } else if (failedPlans.length > 0) {
        statusIntro = `全部方案生成失败：${failedPlans
          .map((p) => `${p.slotLabel}：${coerceAgentDisplayError(p.enrichError, '失败')}`)
          .join('；')}`
      }
      patchPreviewProductPlans(previewMsgId, basePlans, statusIntro)
      if (!anyOk) return

      const enriched: AiProductPlanPreview[] = []
      for (let idx = 0; idx < basePlans.length; idx++) {
        const base = basePlans[idx]
        if (base.enrichStatus === 'error') {
          enriched.push(base)
          continue
        }
        try {
          enriched.push(
            await enrichAiProductPlanPreview(base, intents[idx].brief, modelPickerKey, {
              userReferenceImages,
              planIndex: idx,
            }),
          )
        } catch (e) {
          enriched.push({
            ...base,
            enrichStatus: 'ready' as const,
            enrichError: `主图/标题优化未完成：${coerceAgentDisplayError(e, '未知错误').slice(0, 160)}`,
          })
        }
      }

      const readyCount = enriched.filter((p) => p.enrichStatus === 'ready').length
      patchPreviewProductPlans(
        previewMsgId,
        enriched.map((p, i) => ({ ...p, slotKey: intents[i].key, slotLabel: intents[i].label })),
        intents.length > 1
          ? `已为 ${readyCount} 个商品生成 C 端预览。${hasUserRefs ? '主图已基于您上传的参考图优化。' : ''}请逐项核对手机效果，确认后将依次预填创建页。`
          : `已生成 C 端团购预览（含 AI 优化标题与主图${hasUserRefs ? '，主图参考您上传的菜品图' : ''}）。请核对手机预览效果，确认后将自动提交抖音来客审核。`,
      )
    },
    [patchPreviewProductPlans, modelPickerKey],
  )

  const attachRecruitmentBriefToPreview = useCallback(
    async (previewMsgId: string, userBrief: string) => {
      patchPreviewRecruitmentBrief(
        previewMsgId,
        { enrichStatus: 'loading' },
        '正在生成达人探店图文 Brief（3 个版本）…',
      )
      try {
        const brief = await buildAiRecruitmentBriefPreview(userBrief)
        patchPreviewRecruitmentBrief(
          previewMsgId,
          brief,
          '已生成达人招募图文 Brief。请核对主推品与文案，确认后将在本窗口展示招募订单明细（含 AI 档位分配）。',
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        patchPreviewRecruitmentBrief(
          previewMsgId,
          {
            platform: '抖音来客',
            mainProductName: briefProductNameHint(userBrief),
            tags: [],
            briefText: userBrief.slice(0, 400),
            enrichStatus: 'ready',
            enrichError: `Brief 生成未完成：${msg.slice(0, 120)}`,
          },
          'Brief 生成失败，确认后可在招募页手动补充。',
        )
      }
    },
    [patchPreviewRecruitmentBrief],
  )

  const pushCreateProductPreview = useCallback(
    (
      userBrief: string,
      pageLabel?: string,
      opts?: { assistantContent?: string; includeRecruitment?: boolean },
    ) => {
      const intents = parseCreateProductIntentsFromPlan(userBrief, opts?.assistantContent)
      const intelLine = merchantIntelStatusLine(loadMerchantIntelSnapshot())
      const intro =
        intents.length > 1
          ? `检测到 ${intents.length} 个商品/套餐方案（${intents.map((i) => i.label).join('、')}）。${intelLine}，将一次性生成全部 C 端预览，您可批量保存草稿或勾选平台提交审核。`
          : opts?.includeRecruitment
            ? `将根据方案生成商品 C 端预览与达人招募 Brief。${intelLine}，请核对后批量保存或提交至所选平台。`
            : `检测到您希望创建/上架商品。${intelLine}，将生成团购方案与 C 端预览；确认后可保存草稿或提交审核。`
      const voucher = inferVoucherPricesFromText(userBrief)
      const preview = buildPreviewForTask('create_product', pageLabel)
      const initialPlans: AiProductPlanPreview[] = intents.map((intent) => {
        const v = intent.productType === 2 ? inferVoucherPricesFromText(userBrief) : {}
        return {
          slotKey: intent.key,
          slotLabel: intent.label,
          productName: intent.label,
          suggestedPriceYuan: v.price ?? 0,
          description: '正在生成方案…',
          comboLines: [],
          productType: intent.productType,
          enrichStatus: 'loading',
          ...(v.origin != null ? { originYuan: v.origin } : {}),
        }
      })
      const msg = createAgentMessage('task_preview', intro, {
        preview: {
          ...preview,
          productPlans: initialPlans,
          productPlan: initialPlans[0] ?? {
            productName: briefProductNameHint(userBrief),
            suggestedPriceYuan: voucher.price ?? 0,
            description: '正在生成方案…',
            comboLines: [],
            productType: inferDouyinProductTypeFromText(userBrief),
            enrichStatus: 'loading',
            ...(voucher.origin != null ? { originYuan: voucher.origin } : {}),
          },
          ...(opts?.includeRecruitment
            ? {
                recruitmentBrief: {
                  platform: '抖音来客',
                  mainProductName: briefProductNameHint(userBrief),
                  tags: [],
                  briefText: '',
                  enrichStatus: 'loading' as const,
                },
              }
            : {}),
        },
      })
      setPendingPreviewId(msg.id)
      setPreviewSubmitPlatforms(['douyin'])
      setMessages((prev) => {
        const next = [...prev, msg]
        messagesRef.current = next
        return next
      })
      void attachProductPlanToPreview(msg.id, userBrief, opts?.assistantContent)
      if (opts?.includeRecruitment) {
        void attachRecruitmentBriefToPreview(msg.id, userBrief)
      }
    },
    [attachProductPlanToPreview, attachRecruitmentBriefToPreview],
  )

  const pushRecruitInfluencerPreview = useCallback(
    (userBrief: string, pageLabel?: string) => {
      const intro =
        '检测到您希望招募达人。我将结合门店商品与行业标签生成探店图文 Brief，并在下方展示可核对的三版文案。'
      const preview = buildPreviewForTask('recruit_influencer', pageLabel)
      const msg = createAgentMessage('task_preview', intro, {
        preview: {
          ...preview,
          recruitmentBrief: {
            platform: '抖音来客',
            mainProductName: briefProductNameHint(userBrief),
            tags: [],
            briefText: '',
            enrichStatus: 'loading',
          },
        },
      })
      setPendingPreviewId(msg.id)
      setMessages((prev) => {
        const next = [...prev, msg]
        messagesRef.current = next
        return next
      })
      void attachRecruitmentBriefToPreview(msg.id, userBrief)
    },
    [attachRecruitmentBriefToPreview],
  )

  const pushTaxFilingPreview = useCallback((pageLabel?: string) => {
    if (!entitlements.features.financeTax) {
      setMessages((prev) => {
        const next = [
          ...prev,
          createAgentMessage(
            'assistant',
            '一键报税为会员功能。请升级会员版后在「财务 → 报税管理」或此处继续使用。',
          ),
        ]
        messagesRef.current = next
        return next
      })
      return
    }
    const intro =
      '将按已绑定平台汇总上一自然月财务对账核销数据，生成报税预览。确认后导出申报数据包并记录状态。'
    const preview = buildPreviewForTask('file_tax', pageLabel)
    const msg = createAgentMessage('task_preview', intro, {
      preview: {
        ...preview,
        taxFiling: {
          periodLabel: '—',
          startDate: '',
          endDate: '',
          platforms: [],
          totalVerifyYuan: 0,
          enrichStatus: 'loading',
        },
      },
    })
    setPendingPreviewId(msg.id)
    setMessages((prev) => {
      const next = [...prev, msg]
      messagesRef.current = next
      return next
    })
    void (async () => {
      try {
        const tax = await buildAiTaxFilingPreview()
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== msg.id || !m.preview) return m
            return {
              ...m,
              content: `已汇总 ${tax.periodLabel} 各平台核销数据，请核对后确认一键报税。`,
              preview: { ...m.preview, taxFiling: tax },
            }
          })
          messagesRef.current = next
          return next
        })
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.id !== msg.id || !m.preview?.taxFiling) return m
            return {
              ...m,
              preview: {
                ...m.preview,
                taxFiling: {
                  ...m.preview.taxFiling!,
                  enrichStatus: 'error' as const,
                  enrichError: err,
                },
              },
            }
          })
          messagesRef.current = next
          return next
        })
      }
    })()
  }, [entitlements.features.financeTax])

  const triggerExecutionPreviews = useCallback(
    (ctx: PendingExecutionCtx, pageLabel?: string) => {
      const combinedBrief = ctx.assistantContent
        ? `${ctx.userBrief}\n\n【方案要点】\n${ctx.assistantContent.slice(0, 3500)}`
        : ctx.userBrief
      const hasProduct = ctx.taskTypes.includes('create_product')
      const hasRecruit = ctx.taskTypes.includes('recruit_influencer')
      if (hasProduct) {
        pushCreateProductPreview(combinedBrief, pageLabel, {
          assistantContent: ctx.assistantContent,
          includeRecruitment: hasRecruit,
        })
      } else if (hasRecruit) {
        pushRecruitInfluencerPreview(combinedBrief, pageLabel)
      }
    },
    [pushCreateProductPreview, pushRecruitInfluencerPreview],
  )

  const appendAssistantLine = useCallback((content: string) => {
    const msg = createAgentMessage('assistant', content)
    setMessages((prev) => {
      const next = [...prev, msg]
      messagesRef.current = next
      return next
    })
  }, [])

  const tryHandleExecutionFlow = useCallback(
    (strippedLine: string, visionUrls: string[], pageLabel?: string): boolean => {
      if (awaitingProductImagesRef.current && pendingExecutionRef.current) {
        if (
          visionUrls.length > 0 ||
          isUserDecliningProductImages(strippedLine) ||
          isExplicitExecutionIntent(strippedLine)
        ) {
          awaitingProductImagesRef.current = false
          const ctx = pendingExecutionRef.current
          pendingExecutionRef.current = null
          appendAssistantLine('正在根据方案生成执行预览，请稍候…')
          triggerExecutionPreviews(ctx, pageLabel)
          return true
        }
        return false
      }

      if (pendingExecutionRef.current && isExplicitExecutionIntent(strippedLine)) {
        const ctx = pendingExecutionRef.current
        const needsImages =
          ctx.taskTypes.includes('create_product') &&
          visionUrls.length === 0 &&
          !isUserDecliningProductImages(strippedLine)

        if (needsImages) {
          awaitingProductImagesRef.current = true
          appendAssistantLine(
            '请上传商品图片（可多张），我将优化为主图与辅助图；若暂无图片，请回复「自动生成」。',
          )
          return true
        }

        pendingExecutionRef.current = null
        appendAssistantLine('好的，正在根据方案生成执行预览…')
        triggerExecutionPreviews(ctx, pageLabel)
        return true
      }

      return false
    },
    [appendAssistantLine, triggerExecutionPreviews],
  )

  const scheduleTaskPreview = useCallback(
    (trimmed: string, assistantContent: string | undefined, explicitTaskType: AiTaskType | undefined, pageLabel?: string) => {
      if (shouldDeferTaskPreview(trimmed, assistantContent, explicitTaskType)) return

      const taskType =
        explicitTaskType ??
        inferTaskTypeFromText(trimmed) ??
        (assistantContent ? parseAgentActionType(assistantContent) : undefined)
      if (!taskType) return
      if (isPlanDesignQuery(trimmed) && !parseAgentActionType(assistantContent ?? '')) return

      const intro = '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。'
      setTimeout(() => {
        switch (taskType) {
          case 'create_product':
            pushCreateProductPreview(trimmed, pageLabel)
            break
          case 'recruit_influencer':
            pushRecruitInfluencerPreview(trimmed, pageLabel)
            break
          case 'file_tax':
            pushTaxFilingPreview(pageLabel)
            break
          case 'handle_review':
            pushPreview('handle_review', intro, pageLabel)
            break
          case 'analyze_exception':
            pushPreview('analyze_exception', intro, pageLabel)
            break
          case 'sync_platform':
            pushPreview('sync_platform', intro, pageLabel)
            break
          default:
            break
        }
      }, 200)
    },
    [pushCreateProductPreview, pushRecruitInfluencerPreview, pushTaxFilingPreview, pushPreview],
  )

  const runGatewayForSnapshot = useCallback(
    async (
      snapshot: AiAgentMessage[],
      trimmed: string,
      taskType: AiTaskType | undefined,
      previewPage?: string,
      imageDataUrls: string[] = [],
      pickerKeyOverride?: string,
      runSignal?: AbortSignal,
    ) => {
      const userPickerKey = pickerKeyOverride ?? modelPickerKey
      const chatKey = effectiveChatPickerKey(userPickerKey)
      const parsed = parseAiModelPickerKey(chatKey)
      if (!parsed) return

      const ownsRun = !runSignal
      const ac = ownsRun ? beginAiRun() : null
      const signal = runSignal ?? ac!.signal
      if (ownsRun) setAiSending(true)

      try {
        const merchantCtx = await resolveMerchantIntelBlock(taskType)
        const history: AIMessage[] = [
          { role: 'system', content: merchantCtx },
          ...agentMessagesToChatMessages(snapshot),
        ]
        let chatModel = parsed.model
        if (parsed.provider === 'tokenmix' && !chatModel) {
          chatModel = defaultModelIdForFamily(parsed.modelFamily)
        }
        const res = await postAiChat(
          {
            provider: parsed.provider,
            model: chatModel || undefined,
            ...(parsed.provider === 'tokenmix' ? { modelFamily: parsed.modelFamily } : {}),
            messages: history,
            ...(imageDataUrls.length ? { imageDataUrls } : {}),
            taskType,
            agentPickerKey: userPickerKey,
          },
          { signal },
        )
        const rawSummary = summarizeAssistantContent(res.content)
        let display = formatAssistantDisplayText(rawSummary ?? res.content)
        const deferPreview = shouldDeferTaskPreview(
          trimmed,
          res.content,
          taskType ?? inferTaskTypeFromText(trimmed),
        )

        if (deferPreview) {
          const taskTypes = inferTaskTypesFromCombinedContext(trimmed, res.content)
          if (taskTypes.length) {
            pendingExecutionRef.current = {
              userBrief: trimmed,
              assistantContent: res.content,
              taskTypes,
            }
            display = `${display}${buildPlanExecutionConsultation(taskTypes)}`
          }
        }

        const assistantMsg = createAgentMessage('assistant', display)
        setMessages((prev) => {
          const next = [...prev, assistantMsg]
          messagesRef.current = next
          return next
        })
        if (!deferPreview) {
          scheduleTaskPreview(
            trimmed,
            res.content,
            taskType ?? inferTaskTypeFromText(trimmed),
            previewPage ?? pageContext?.pageLabel,
          )
        }
      } catch (e) {
        if (isAiRequestAborted(e)) {
          appendStoppedMessage()
          return
        }
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((prev) => {
          const next = [
            ...prev,
            createAgentMessage(
              'assistant',
              `暂时连不上助手服务。请确认已登录；若仍失败，请联系管理员检查智能助手配置。详情：${msg}`,
            ),
          ]
          messagesRef.current = next
          return next
        })
      } finally {
        if (ownsRun && ac) endAiRun(ac)
      }
    },
    [
      modelPickerKey,
      pageContext?.pageLabel,
      scheduleTaskPreview,
      beginAiRun,
      endAiRun,
      appendStoppedMessage,
      resolveMerchantIntelBlock,
    ],
  )

  const sendUserText = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      const attachments = [...pendingComposerAttachments]
      const visionUrls = attachmentVisionUrls(attachments)
      const pq = pendingQuoteRef.current
      if ((!trimmed && attachments.length === 0 && !pq) || aiSending || pendingPreviewId) return
      let line =
        trimmed ||
        (attachments.some((a) => a.kind === 'video')
          ? '请结合附带的视频（已提供首帧截图）说明你的需求。'
          : attachments.length
            ? '请结合附图说明你的需求。'
            : '')
      if (pq) {
        const who = pq.role === 'user' ? '我' : '助手'
        const shortId = pq.quotedMessageId.slice(0, 8)
        const quotedBlock = `[引用${who} #${shortId}]\n> ${pq.excerpt.split('\n').join('\n> ')}\n\n`
        line = quotedBlock + line
        setPendingQuote(null)
      }
      setSidebarActiveArchiveId(null)
      for (const a of attachments) {
        if (a.kind === 'video') revokeComposerAttachment(a)
      }
      setPendingComposerAttachments([])
      const activePickerKey = modelPickerKey
      const bubbleImageUrls: string[] = []
      for (const a of attachments) {
        if (a.kind === 'image') bubbleImageUrls.push(a.url)
        else bubbleImageUrls.push(a.posterUrl)
      }
      const userMsg = createAgentMessage('user', line, {
        imageUrls: bubbleImageUrls.length ? bubbleImageUrls : undefined,
        videoUrls: attachments
          .filter((a): a is Extract<AiComposerAttachment, { kind: 'video' }> => a.kind === 'video')
          .map((a) => a.previewUrl),
      })
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      setInputDraft('')
      queueMicrotask(() => {
        void (async () => {
          const ac = beginAiRun()
          setAiSending(true)
          try {
            const strippedLine = line.replace(/\[引用[\s\S]*?\n\n/, '').trim()
            if (tryHandleExecutionFlow(strippedLine, visionUrls, pageContext?.pageLabel)) {
              return
            }
            const refImg = visionUrls[0]?.trim()
            const imagePickerKey = resolveImagePickerKeyForUserLine(
              activePickerKey,
              modelPickerOptions,
              line,
              visionUrls.length > 0,
            )
            if (shouldRouteToAgentNativeImage(imagePickerKey, line, visionUrls)) {
              const imgOpts = buildAgentImagePostOpts(imagePickerKey, refImg)
              const imgRes = await postAiAgentNativeImage(line, {
                ...imgOpts,
                signal: ac.signal,
              })
              if (imgRes.ok) {
                if (imgRes.channel === 'builtin') {
                  const vk = modelPickerKeyForNativeImageVendor(imgRes.vendorUsed, modelPickerOptions)
                  if (vk) {
                    setModelPickerKeyState(vk)
                    savePickerKey(vk)
                  }
                }
                const isI2i = Boolean(refImg)
                const assistantMsg = createAgentMessage(
                  'assistant',
                  captionForAgentImageResult(imgRes, isI2i),
                  { imageUrls: [imgRes.imageUrl] },
                )
                setMessages((prev) => {
                  const next = [...prev, assistantMsg]
                  messagesRef.current = next
                  return next
                })
                scheduleTaskPreview(trimmed, undefined, inferTaskTypeFromText(trimmed), pageContext?.pageLabel)
                return
              }
            }
            await runGatewayForSnapshot(
              messagesRef.current,
              line,
              inferTaskTypeFromText(line),
              pageContext?.pageLabel,
              visionUrls,
              activePickerKey,
              ac.signal,
            )
          } catch (e) {
            if (isAiRequestAborted(e)) appendStoppedMessage()
          } finally {
            endAiRun(ac)
          }
        })()
      })
    },
    [
      aiSending,
      stopAiGeneration,
      pendingComposerAttachments,
      pendingPreviewId,
      pageContext?.pageLabel,
      runGatewayForSnapshot,
      scheduleTaskPreview,
      modelPickerKey,
      modelPickerOptions,
      beginAiRun,
      endAiRun,
      appendStoppedMessage,
      tryHandleExecutionFlow,
    ],
  )

  const togglePreviewSubmitPlatform = useCallback((id: CreatePlatformId) => {
    setPreviewSubmitPlatforms((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id)
        return next.length ? next : ['douyin']
      }
      return [...prev, id]
    })
  }, [])

  const savePendingTaskToDrafts = useCallback(() => {
    if (!pendingPreviewId) return
    const pending = messagesRef.current.find((m) => m.id === pendingPreviewId)
    const p = pending?.preview
    const title = p?.title ?? '任务'
    if (p?.taskType !== 'create_product') return

    const plans = listProductPlansFromPreview(p).filter(
      (pl) => pl.enrichStatus !== 'error' && pl.productName?.trim(),
    )
    const plan = plans[0] ?? p.productPlan
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
    const brief = lastUser?.content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() || '团购商品'

    const toDraft = (pl: AiProductPlanPreview): AiProductDraft => ({
      platform: 'douyin',
      productName: pl.productName,
      productDesc: pl.description,
      priceYuan: String(pl.suggestedPriceYuan),
      originYuan: pl.originYuan != null ? String(pl.originYuan) : undefined,
      headUrl: pl.headUrl,
      productType: pl.productType,
      comboSummary: pl.comboLines.join('；'),
      planNotes: [pl.marginNote, pl.competitorNote].filter(Boolean).join('\n'),
      autoSubmit: false,
    })

    if (plans.length > 1) {
      saveAiProductDraftBatch(plans.map(toDraft))
    } else if (plan) {
      saveAiProductDraft(toDraft(plan))
    } else {
      saveAiProductDraft({
        platform: 'douyin',
        productName: brief.slice(0, 60),
        productDesc: brief,
        autoSubmit: false,
      })
    }

    const count = Math.max(plans.length, plan ? 1 : 0)
    setMessages((prev) => {
      const next = [
        ...prev,
        createAgentMessage(
          'task_result',
          `「${title}」已批量保存至草稿箱（${count || 1} 个方案）。您可在「创建商品」页逐项修改后再提交。`,
          { resultSummary: 'confirmed' },
        ),
      ]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const applyShortcut = useCallback(
    (taskType: AiTaskType) => {
      if (aiSending || pendingPreviewId) return
      if (!membershipAllowsAiTask(plan, taskType)) {
        setMessages((prev) => {
          const next = [
            ...prev,
            createAgentMessage(
              'assistant',
              `当前为${agentProfile.planLabel}，「${AI_TASK_TYPE_LABELS[taskType]}」需升级会员后使用。`,
            ),
          ]
          messagesRef.current = next
          return next
        })
        return
      }
      if (taskType === 'file_tax') {
        pushTaxFilingPreview(pageContext?.pageLabel)
        return
      }
      setSidebarActiveArchiveId(null)
      setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
      const label = AI_TASK_TYPE_LABELS[taskType]
      const line = `使用快捷任务：${label}`
      const userMsg = createAgentMessage('user', line)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      queueMicrotask(() => {
        void runGatewayForSnapshot(messagesRef.current, line, taskType, pageContext?.pageLabel, [])
      })
    },
    [aiSending, pendingPreviewId, pageContext?.pageLabel, runGatewayForSnapshot, plan, agentProfile.planLabel, pushTaxFilingPreview],
  )

  const confirmPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    const pending = messagesRef.current.find((m) => m.id === pendingPreviewId)
    const p = pending?.preview
    const title = p?.title ?? '任务'

    if (p?.taskType === 'create_product') {
      const plans = listProductPlansFromPreview(p).filter(
        (pl) => pl.enrichStatus !== 'error' && pl.productName?.trim(),
      )
      const plan = plans[0] ?? p.productPlan
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
      const brief = lastUser?.content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() || '团购商品'
      const lastCtx = loadDouyinWizardLastContext()
      const submitPlatforms =
        previewSubmitPlatforms.length > 0 ? previewSubmitPlatforms : (['douyin'] as CreatePlatformId[])
      const canAutoSubmit = Boolean(
        lastCtx?.cat3 &&
          plan?.enrichStatus === 'ready' &&
          plans.length <= 1 &&
          submitPlatforms.length === 1 &&
          submitPlatforms[0] === 'douyin',
      )

      const toDraft = (pl: AiProductPlanPreview): AiProductDraft => ({
        platform: 'douyin',
        productName: pl.productName,
        productDesc: pl.description,
        priceYuan: String(pl.suggestedPriceYuan),
        originYuan: pl.originYuan != null ? String(pl.originYuan) : undefined,
        headUrl: pl.headUrl,
        productType: pl.productType,
        comboSummary: pl.comboLines.join('；'),
        planNotes: [pl.marginNote, pl.competitorNote].filter(Boolean).join('\n'),
        autoSubmit: canAutoSubmit,
      })

      if (plans.length > 1) {
        saveAiProductDraftBatch(plans.map(toDraft))
      } else if (plan) {
        saveAiProductDraft(toDraft(plan))
      } else {
        saveAiProductDraft({
          platform: 'douyin',
          productName: brief.slice(0, 60),
          productDesc: brief,
          autoSubmit: false,
        })
      }

      const firstLabel = plan?.slotLabel ?? plan?.productName ?? '商品'
      const batchNote =
        plans.length > 1
          ? `共 ${plans.length} 个方案，创建页将先预填「${firstLabel}」，其余 ${plans.length - 1} 项已排队。`
          : ''

      const platNames =
        submitPlatforms.length > 1
          ? `${submitPlatforms.length} 个平台`
          : submitPlatforms[0] === 'douyin'
            ? '抖音来客'
            : submitPlatforms[0]

      setMessages((prev) => {
        const next = [
          ...prev,
          createAgentMessage(
            'task_result',
            plans.length > 1
              ? `「${title}」已确认。${batchNote} 将打开创建页预填方案。`
              : canAutoSubmit
                ? `「${title}」已确认。正在打开创建商品页并自动提交${platNames}审核…`
                : `「${title}」已确认。将预填方案并提交至${platNames}；若需自动审核请先在创建页保存类目。`,
            { resultSummary: 'confirmed' },
          ),
        ]
        messagesRef.current = next
        return next
      })
      setPendingPreviewId(null)
      setDrawerOpen(false)

      const combinedRecruitBrief = p.recruitmentBrief
      if (combinedRecruitBrief?.briefText?.trim() && combinedRecruitBrief.enrichStatus === 'ready') {
        void (async () => {
          try {
            const userBrief =
              lastUser?.content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() ||
              combinedRecruitBrief.briefText.slice(0, 200)
            const recordId =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `brief-${Date.now()}`
            appendKolBriefRecord({
              id: recordId,
              createdAt: new Date().toISOString(),
              platform: combinedRecruitBrief.platform,
              mainProductName: combinedRecruitBrief.mainProductName,
              tags: combinedRecruitBrief.tags,
              previews: combinedRecruitBrief.previews ?? [
                combinedRecruitBrief.briefText,
                combinedRecruitBrief.briefText,
                combinedRecruitBrief.briefText,
              ],
            })
            writeSelectedBriefForRecruitment({
              recordId,
              variantIndex: 0,
              text: combinedRecruitBrief.briefText,
              platform: combinedRecruitBrief.platform,
              mainProductName: combinedRecruitBrief.mainProductName,
              tags: combinedRecruitBrief.tags,
            })
            const { intent, allocation } = await buildAgentRecruitmentAllocation(
              userBrief,
              combinedRecruitBrief,
            )
            const tenantMeta = await resolveRecruitmentOrderTenantMeta(
              supabaseConfigured ? supabase : null,
            )
            const order = buildRecruitmentOrderFromAgentBrief(combinedRecruitBrief, tenantMeta, {
              intent,
              allocation,
              userBrief,
            })
            await appendRecruitmentOrderToOps(order)
          } catch {
            /* 商品已确认；招募订单失败可在招募页补提 */
          }
        })()
      }

      navigate('/products/create', {
        state: { platforms: submitPlatforms, autoSubmit: canAutoSubmit },
      })
      return
    }

    if (p?.taskType === 'recruit_influencer') {
      const brief = p.recruitmentBrief
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
      const userBrief =
        lastUser?.content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() ||
        brief?.briefText?.slice(0, 200) ||
        ''
      void (async () => {
        setTaskConfirming(true)
        try {
          if (!brief?.briefText?.trim()) {
            setMessages((prev) => {
              const next = [
                ...prev,
                createAgentMessage(
                  'task_result',
                  `「${title}」已确认，但 Brief 为空。请在输入框补充需求后重试。`,
                  { resultSummary: 'partial' },
                ),
              ]
              messagesRef.current = next
              return next
            })
            setPendingPreviewId(null)
            return
          }

          const recordId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `brief-${Date.now()}`
          appendKolBriefRecord({
            id: recordId,
            createdAt: new Date().toISOString(),
            platform: brief.platform,
            mainProductName: brief.mainProductName,
            tags: brief.tags,
            previews: brief.previews ?? [brief.briefText, brief.briefText, brief.briefText],
          })
          writeSelectedBriefForRecruitment({
            recordId,
            variantIndex: 0,
            text: brief.briefText,
            platform: brief.platform,
            mainProductName: brief.mainProductName,
            tags: brief.tags,
          })

          const { intent, allocation } = await buildAgentRecruitmentAllocation(userBrief, brief)
          const tenantMeta = await resolveRecruitmentOrderTenantMeta(
            supabaseConfigured ? supabase : null,
          )
          const order = buildRecruitmentOrderFromAgentBrief(brief, tenantMeta, {
            intent,
            allocation,
            userBrief,
          })
          await appendRecruitmentOrderToOps(order)
          const orderDetail = recruitmentOrderDetailFromRegistry(order, brief, intent, allocation)
          try {
            window.localStorage.setItem('meoo_last_recruitment_order_id', order.id)
          } catch {
            /* ignore */
          }

          setMessages((prev) => {
            const next = [
              ...prev,
              createAgentMessage(
                'task_result',
                `「${title}」已确认。招募订单已生成并推送运营台（待接单），下方为 AI 智能分配后的订单明细。`,
                { resultSummary: 'confirmed', recruitmentOrder: orderDetail },
              ),
            ]
            messagesRef.current = next
            return next
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setMessages((prev) => {
            const next = [
              ...prev,
              createAgentMessage(
                'task_result',
                `Brief 已保存，但招募订单推送失败：${msg.slice(0, 200)}。可在达人招募页手动提交。`,
                { resultSummary: 'partial' },
              ),
            ]
            messagesRef.current = next
            return next
          })
        } finally {
          setTaskConfirming(false)
          setPendingPreviewId(null)
        }
      })()
      return
    }

    if (p?.taskType === 'file_tax' && p.taxFiling) {
      const tax = p.taxFiling
      void (async () => {
        const period = {
          label: tax.periodLabel,
          start: tax.startDate,
          end: tax.endDate,
        }
        let bindings: Awaited<ReturnType<typeof listMerchantBindings>> = []
        if (supabaseConfigured && supabase) {
          const [dy, xhs] = await Promise.all([
            listMerchantBindings(supabase, 'douyin'),
            listMerchantBindings(supabase, 'xhs_commercial'),
          ])
          bindings = [...dy, ...xhs]
        }
        const fin = await fetchFinanceReconcile({ startDate: period.start, endDate: period.end })
        const rows = fin.ok ? buildTaxPlatformRows(bindings, fin.rows) : []
        const blob = buildTaxExportBlob(rows, period)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meoo-tax-${period.start}-${period.end}.json`
        a.click()
        URL.revokeObjectURL(url)
        appendTaxFilingRecord({
          id: `TAX-${Date.now()}`,
          periodLabel: period.label,
          startDate: period.start,
          endDate: period.end,
          submittedAt: new Date().toISOString(),
          platforms: tax.platforms.map((x) => ({
            platformId: x.platformId,
            verifyAmountYuan: x.verifyAmountYuan,
          })),
          totalVerifyYuan: tax.totalVerifyYuan,
          status: 'submitted_mock',
        })
        setMessages((prev) => {
          const next = [
            ...prev,
            createAgentMessage(
              'task_result',
              `「${title}」已确认。报税数据包已下载，申报记录已保存。可在「财务 → 报税管理」查看历史。`,
              { resultSummary: 'confirmed' },
            ),
          ]
          messagesRef.current = next
          return next
        })
        setPendingPreviewId(null)
        setDrawerOpen(false)
        navigate('/finance/tax')
      })()
      return
    }

    setMessages((prev) => {
      const next = [
        ...prev,
        createAgentMessage(
          'task_result',
          `「${title}」已确认。后续将按步骤调用业务接口；若接口未就绪，请稍后在对应模块查看执行结果。`,
          { resultSummary: 'confirmed' },
        ),
      ]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId, navigate, previewSubmitPlatforms])

  const cancelPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const next = [...prev, createAgentMessage('system', '已取消本次待执行操作。')]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const modifyPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const next = [
        ...prev,
        createAgentMessage(
          'assistant',
          '请直接在输入框中说明需要调整的部分（例如：只要同步抖音、先不要发布等）。我会根据你的补充重新生成方案。',
        ),
      ]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const submitTopSearchQuery = useCallback(
    (query: string) => {
      const q = query.trim()
      if (!q || aiSending) return
      setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
      const activePickerKey = modelPickerKey
      const pl = '顶部搜索 / AI 指令'
      setPageContext({ pageLabel: pl })
      setDrawerOpen(true)
      setInputDraft('')
      const userMsg = createAgentMessage('user', q)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      queueMicrotask(() => {
        void (async () => {
          const ac = beginAiRun()
          setAiSending(true)
          try {
            if (tryHandleExecutionFlow(q, [], pl)) {
              return
            }
            const imagePickerKey = resolveImagePickerKeyForUserLine(activePickerKey, modelPickerOptions, q, false)
            if (shouldRouteToAgentNativeImage(imagePickerKey, q, [])) {
              const imgOpts = buildAgentImagePostOpts(imagePickerKey)
              const imgRes = await postAiAgentNativeImage(q, { ...imgOpts, signal: ac.signal })
              if (imgRes.ok) {
                if (imgRes.channel === 'builtin') {
                  const vk = modelPickerKeyForNativeImageVendor(imgRes.vendorUsed, modelPickerOptions)
                  if (vk) {
                    setModelPickerKeyState(vk)
                    savePickerKey(vk)
                  }
                }
                const assistantMsg = createAgentMessage(
                  'assistant',
                  captionForAgentImageResult(imgRes, false),
                  { imageUrls: [imgRes.imageUrl] },
                )
                setMessages((prev) => {
                  const next = [...prev, assistantMsg]
                  messagesRef.current = next
                  return next
                })
                scheduleTaskPreview(q, undefined, inferTaskTypeFromText(q), pl)
                return
              }
            }
            await runGatewayForSnapshot(
              messagesRef.current,
              q,
              inferTaskTypeFromText(q),
              pl,
              [],
              activePickerKey,
              ac.signal,
            )
          } catch (e) {
            if (isAiRequestAborted(e)) appendStoppedMessage()
          } finally {
            endAiRun(ac)
          }
        })()
      })
    },
    [
      aiSending,
      runGatewayForSnapshot,
      modelPickerKey,
      modelPickerOptions,
      scheduleTaskPreview,
      tryHandleExecutionFlow,
      beginAiRun,
      endAiRun,
      appendStoppedMessage,
    ],
  )

  const pendingPreviewTaskType = useMemo((): AiTaskType | null => {
    if (!pendingPreviewId) return null
    const m = messages.find((x) => x.id === pendingPreviewId)
    return m?.preview?.taskType ?? null
  }, [pendingPreviewId, messages])

  const pendingPreviewLoading = useMemo(() => {
    if (!pendingPreviewId) return false
    const m = messages.find((x) => x.id === pendingPreviewId)
    const p = m?.preview
    if (!p) return false
    if (p.taskType === 'create_product') {
      const productLoading = isProductPreviewLoading(p)
      const recruitLoading = p.recruitmentBrief?.enrichStatus === 'loading'
      return productLoading || recruitLoading
    }
    if (p.taskType === 'recruit_influencer') return p.recruitmentBrief?.enrichStatus === 'loading'
    if (p.taskType === 'file_tax') return p.taxFiling?.enrichStatus === 'loading'
    return false
  }, [pendingPreviewId, messages])

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
      pendingPreviewTaskType,
      pendingPreviewLoading,
      taskConfirming,
      confirmPendingTask,
      savePendingTaskToDrafts,
      cancelPendingTask,
      modifyPendingTask,
      previewSubmitPlatforms,
      togglePreviewSubmitPlatform,
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      agentProfile,
      aiSending,
      stopAiGeneration,
      pendingComposerAttachments,
      addComposerMediaFiles,
      removeComposerAttachment,
      clearComposerAttachments,
      pendingQuote,
      quoteMessage,
      clearPendingQuote,
      archivedSessions,
      startNewChat,
      resumeArchivedSession,
      sidebarActiveArchiveId,
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
      pendingPreviewTaskType,
      confirmPendingTask,
      savePendingTaskToDrafts,
      cancelPendingTask,
      modifyPendingTask,
      previewSubmitPlatforms,
      togglePreviewSubmitPlatform,
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      agentProfile,
      aiSending,
      stopAiGeneration,
      pendingPreviewLoading,
      taskConfirming,
      pendingComposerAttachments,
      addComposerMediaFiles,
      removeComposerAttachment,
      clearComposerAttachments,
      pendingQuote,
      quoteMessage,
      clearPendingQuote,
      archivedSessions,
      startNewChat,
      resumeArchivedSession,
      sidebarActiveArchiveId,
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
