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
import { saveAiProductDraft } from '../lib/aiProductDraft'
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
  inferTaskTypeFromText,
  inferVoucherPricesFromText,
  parseAgentActionType,
  summarizeAssistantContent,
} from '../lib/aiAgentActionParse'
import { appendKolBriefRecord, writeSelectedBriefForRecruitment } from '../lib/kolBriefStorage'
import {
  competitorReportSummary,
  loadSelectedCompetitorStore,
  latestCompetitorReportForPoi,
} from '../lib/competitorStorage'
import { loadStoreMenuRecord, menuItemsSummary } from '../lib/storeMenuStorage'
import { readStoreMarginConfig } from '../lib/storeMarginsRead'
import { fetchAiProductPlan } from '../services/storeIntelApi'
import { enrichAiProductPlanPreview } from '../services/aiAgentProductPlanEnrich'
import { buildAiRecruitmentBriefPreview } from '../services/aiAgentRecruitmentBriefEnrich'
import { inferDouyinProductTypeFromText } from '../lib/aiAgentProductPreviewDefaults'
import { loadDouyinWizardLastContext } from '../lib/douyinWizardLastContext'
import { AI_AGENT_WELCOME_CONTENT, AI_TASK_TYPE_LABELS, createAgentMessage } from '../lib/aiAgentTypes'
import { compressImageFileToDataUrl } from '../lib/aiImageCompress'
import {
  extractVideoPosterDataUrl,
  isComposerImageFile,
  isComposerVideoFile,
} from '../lib/aiVideoPoster'
import {
  detectImageGenerationIntent,
  modelPickerKeyForNativeImageVendor,
  resolveModelPickerKeyForImageIntent,
} from '../services/ai/aiImageIntentRouting'
import {
  agentNativeImageRouteFromPickerKey,
  effectiveChatPickerKey,
  isAgentImagePickerKey,
} from '../services/ai/agentImageModelKeys'
import {
  defaultAiModelPickerKeyForPlan,
  listAiModelPickerOptionsForPlan,
  parseAiModelPickerKey,
} from '../services/ai/modelRegistry'
import { useMembership } from './MembershipContext'
import { defaultModelIdForFamily } from '../services/ai/tokenmixClient'
import { postAiAgentNativeImage, postAiChat, type AiAgentNativeImageOk } from '../services/ai/aiClient'
import type { AIMessage } from '../services/ai/types'

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
const MAX_COMPOSER_ATTACHMENTS = 4
const MAX_COMPOSER_VIDEO_BYTES = 100 * 1024 * 1024

function revokeComposerAttachment(att: AiComposerAttachment) {
  if (att.kind === 'video') URL.revokeObjectURL(att.previewUrl)
}

function attachmentVisionUrls(attachments: AiComposerAttachment[]): string[] {
  return attachments.map((a) => (a.kind === 'image' ? a.url : a.posterUrl))
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
  confirmPendingTask: () => void
  cancelPendingTask: () => void
  modifyPendingTask: () => void
  submitTopSearchQuery: (query: string) => void
  /** 多模型：下拉 key，与 modelRegistry 中 listAiModelPickerOptions 一致 */
  modelPickerKey: string
  setModelPickerKey: (key: string) => void
  modelPickerOptions: ReturnType<typeof listAiModelPickerOptionsForPlan>
  aiSending: boolean
  /** 主输入区待发送的图片/视频（最多 4 个） */
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

function buildProductPlanContext(userBrief: string) {
  const marginCfg = readStoreMarginConfig()
  const menu = loadStoreMenuRecord()
  const menuSummary = menu?.items?.length ? menuItemsSummary(menu.items, 35) : ''
  const sel = loadSelectedCompetitorStore()
  const cmp = sel?.poiId ? latestCompetitorReportForPoi(sel.poiId) : null
  return {
    userBrief,
    platform: 'douyin',
    storeName: sel?.storeName ?? menu?.storeName,
    menuSummary: menuSummary || undefined,
    margins: marginCfg.margins,
    industryPath: marginCfg.industry.path || marginCfg.industry.name || undefined,
    competitorSummary: cmp ? competitorReportSummary(cmp) : undefined,
  }
}

export function AiAgentProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { plan } = useMembership()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageContext, setPageContext] = useState<AiAgentOpenContext | null>(null)
  const [messages, setMessages] = useState<AiAgentMessage[]>(() => [
    createAgentMessage('assistant', AI_AGENT_WELCOME_CONTENT),
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

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const archivedRef = useRef(archivedSessions)
  archivedRef.current = archivedSessions

  useEffect(() => {
    pendingQuoteRef.current = pendingQuote
  }, [pendingQuote])

  useEffect(() => {
    const key = loadPickerKey(plan)
    setModelPickerKeyState(key)
  }, [plan])

  const modelPickerOptions = useMemo(() => listAiModelPickerOptionsForPlan(plan), [plan])

  const setModelPickerKey = useCallback((key: string) => {
    setModelPickerKeyState(key)
    savePickerKey(key)
  }, [])

  const permissions = useMemo<Record<AiPermissionId, boolean>>(
    () => ({
      product: true,
      store: true,
      influencer: true,
      review: true,
      local_ads: true,
      local_leads: true,
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

  const addComposerMediaFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length) return
    const added: AiComposerAttachment[] = []
    for (const file of Array.from(files)) {
      if (added.length >= MAX_COMPOSER_ATTACHMENTS) break
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
    setPendingComposerAttachments((prev) => [...prev, ...added].slice(0, MAX_COMPOSER_ATTACHMENTS))
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
    const fresh = [createAgentMessage('assistant', AI_AGENT_WELCOME_CONTENT)]
    setMessages(fresh)
    messagesRef.current = fresh
    setPendingPreviewId(null)
    setInputDraft('')
    setPendingComposerAttachments((prev) => {
      for (const a of prev) revokeComposerAttachment(a)
      return []
    })
    setPendingQuote(null)
  }, [])

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

  const patchPreviewProductPlan = useCallback(
    (previewMsgId: string, patch: Partial<AiProductPlanPreview>, content?: string) => {
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== previewMsgId || !m.preview) return m
          const cur = m.preview.productPlan
          return {
            ...m,
            ...(content ? { content } : {}),
            preview: {
              ...m.preview,
              productPlan: cur ? { ...cur, ...patch } : ({ ...patch } as AiProductPlanPreview),
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

  const attachProductPlanToPreview = useCallback(
    async (previewMsgId: string, userBrief: string) => {
      patchPreviewProductPlan(
        previewMsgId,
        { enrichStatus: 'loading' },
        '正在生成团购方案，并优化标题、说明与主图…',
      )
      const r = await fetchAiProductPlan(buildProductPlanContext(userBrief))
      if (!r.ok) {
        patchPreviewProductPlan(
          previewMsgId,
          { enrichStatus: 'error', enrichError: r.message },
          '方案生成失败，请稍后重试或改在「创建商品」页手动填写。',
        )
        return
      }
      const basePlan: AiProductPlanPreview = {
        productName: r.plan.productName,
        suggestedPriceYuan: r.plan.suggestedPriceYuan,
        description: r.plan.description,
        comboLines: r.plan.comboLines,
        productType: inferDouyinProductTypeFromText(`${userBrief} ${r.plan.productName}`),
        enrichStatus: 'loading',
        ...(r.plan.originYuan != null ? { originYuan: r.plan.originYuan } : {}),
        ...(r.plan.marginNote ? { marginNote: r.plan.marginNote } : {}),
        ...(r.plan.competitorNote ? { competitorNote: r.plan.competitorNote } : {}),
        ...(r.plan.riskLevel ? { riskLevel: r.plan.riskLevel } : {}),
      }
      patchPreviewProductPlan(previewMsgId, basePlan)
      try {
        const enriched = await enrichAiProductPlanPreview(basePlan, userBrief)
        patchPreviewProductPlan(
          previewMsgId,
          enriched,
          '已生成 C 端团购预览（含 AI 优化标题与主图）。请核对手机预览效果，确认后将自动提交抖音来客审核。',
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        patchPreviewProductPlan(
          previewMsgId,
          {
            ...basePlan,
            enrichStatus: 'ready',
            enrichError: `主图/标题优化未完成：${msg.slice(0, 120)}`,
          },
          '方案已生成；主图或标题优化未完成，确认后可在创建页补全。',
        )
      }
    },
    [patchPreviewProductPlan],
  )

  const pushCreateProductPreview = useCallback(
    (userBrief: string, pageLabel?: string) => {
      const intro =
        '检测到您希望创建/上架商品。我将结合菜单价目、毛利率与竞品分析生成团购方案，并以 C 端预览图展示；确认后将自动提交抖音来客审核。'
      const voucher = inferVoucherPricesFromText(userBrief)
      const preview = buildPreviewForTask('create_product', pageLabel)
      const msg = createAgentMessage('task_preview', intro, {
        preview: {
          ...preview,
          productPlan: {
            productName: briefProductNameHint(userBrief),
            suggestedPriceYuan: voucher.price ?? 0,
            description: '正在生成方案…',
            comboLines: [],
            productType: inferDouyinProductTypeFromText(userBrief),
            enrichStatus: 'loading',
            ...(voucher.origin != null ? { originYuan: voucher.origin } : {}),
          },
        },
      })
      setPendingPreviewId(msg.id)
      setMessages((prev) => {
        const next = [...prev, msg]
        messagesRef.current = next
        return next
      })
      void attachProductPlanToPreview(msg.id, userBrief)
    },
    [attachProductPlanToPreview],
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
          '已生成达人招募图文 Brief。请核对主推品与文案，确认后将带入「达人招募」页。',
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

  const scheduleTaskPreview = useCallback(
    (trimmed: string, assistantContent: string | undefined, explicitTaskType: AiTaskType | undefined, pageLabel?: string) => {
      const taskType =
        explicitTaskType ??
        inferTaskTypeFromText(trimmed) ??
        (assistantContent ? parseAgentActionType(assistantContent) : undefined)
      if (!taskType) return

      const intro = '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。'
      setTimeout(() => {
        switch (taskType) {
          case 'create_product':
            pushCreateProductPreview(trimmed, pageLabel)
            break
          case 'recruit_influencer':
            pushRecruitInfluencerPreview(trimmed, pageLabel)
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
    [pushCreateProductPreview, pushRecruitInfluencerPreview, pushPreview],
  )

  const runGatewayForSnapshot = useCallback(
    async (
      snapshot: AiAgentMessage[],
      trimmed: string,
      taskType: AiTaskType | undefined,
      previewPage?: string,
      imageDataUrls: string[] = [],
      pickerKeyOverride?: string,
    ) => {
      const rawKey = pickerKeyOverride ?? modelPickerKey
      const key = effectiveChatPickerKey(rawKey)
      const parsed = parseAiModelPickerKey(key)
      if (!parsed) return
      setAiSending(true)
      try {
        const history = agentMessagesToChatMessages(snapshot)
        let chatModel = parsed.model
        if (parsed.provider === 'tokenmix' && !chatModel) {
          chatModel = defaultModelIdForFamily(parsed.modelFamily)
        }
        const res = await postAiChat({
          provider: parsed.provider,
          model: chatModel || undefined,
          ...(parsed.provider === 'tokenmix' ? { modelFamily: parsed.modelFamily } : {}),
          messages: history,
          ...(imageDataUrls.length ? { imageDataUrls } : {}),
          taskType,
        })
        const display =
          summarizeAssistantContent(res.content) ??
          res.content
        const assistantMsg = createAgentMessage('assistant', display)
        setMessages((prev) => {
          const next = [...prev, assistantMsg]
          messagesRef.current = next
          return next
        })
        scheduleTaskPreview(
          trimmed,
          res.content,
          taskType ?? inferTaskTypeFromText(trimmed),
          previewPage ?? pageContext?.pageLabel,
        )
      } catch (e) {
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
        setAiSending(false)
      }
    },
    [modelPickerKey, pageContext?.pageLabel, scheduleTaskPreview],
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
      const nextPickerKey = resolveModelPickerKeyForImageIntent(
        modelPickerKey,
        modelPickerOptions,
        line,
        visionUrls.length > 0,
      )
      if (nextPickerKey !== modelPickerKey) {
        setModelPickerKeyState(nextPickerKey)
        savePickerKey(nextPickerKey)
      }
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
          const refImg = visionUrls[0]?.trim()
          const tryNativePixel =
            (detectImageGenerationIntent(line) && visionUrls.length === 0) ||
            (isAgentImagePickerKey(nextPickerKey) && visionUrls.length === 0 && trimmed.length > 0) ||
            (Boolean(refImg) &&
              (isAgentImagePickerKey(nextPickerKey) || detectImageGenerationIntent(line)))
          if (tryNativePixel) {
            setAiSending(true)
            try {
              const imgOpts = buildAgentImagePostOpts(nextPickerKey, refImg)
              const imgRes = await postAiAgentNativeImage(line, imgOpts)
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
            } finally {
              setAiSending(false)
            }
          }
          await runGatewayForSnapshot(
            messagesRef.current,
            line,
            inferTaskTypeFromText(line),
            pageContext?.pageLabel,
            visionUrls,
            effectiveChatPickerKey(nextPickerKey),
          )
        })()
      })
    },
    [
      aiSending,
      pendingComposerAttachments,
      pendingPreviewId,
      pageContext?.pageLabel,
      runGatewayForSnapshot,
      scheduleTaskPreview,
      modelPickerKey,
      modelPickerOptions,
    ],
  )

  const applyShortcut = useCallback(
    (taskType: AiTaskType) => {
      if (aiSending || pendingPreviewId) return
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
    [aiSending, pendingPreviewId, pageContext?.pageLabel, runGatewayForSnapshot],
  )

  const confirmPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    const pending = messagesRef.current.find((m) => m.id === pendingPreviewId)
    const p = pending?.preview
    const title = p?.title ?? '任务'

    if (p?.taskType === 'create_product') {
      const plan = p.productPlan
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
      const brief = lastUser?.content?.replace(/\[引用[\s\S]*?\n\n/, '').trim() || '团购商品'
      const lastCtx = loadDouyinWizardLastContext()
      const canAutoSubmit = Boolean(lastCtx?.cat3 && plan?.enrichStatus === 'ready')
      if (plan) {
        saveAiProductDraft({
          platform: 'douyin',
          productName: plan.productName,
          productDesc: plan.description,
          priceYuan: String(plan.suggestedPriceYuan),
          originYuan: plan.originYuan != null ? String(plan.originYuan) : undefined,
          headUrl: plan.headUrl,
          productType: plan.productType,
          comboSummary: plan.comboLines.join('；'),
          planNotes: [plan.marginNote, plan.competitorNote].filter(Boolean).join('\n'),
          autoSubmit: canAutoSubmit,
        })
      } else {
        saveAiProductDraft({
          platform: 'douyin',
          productName: brief.slice(0, 60),
          productDesc: brief,
          autoSubmit: false,
        })
      }
      setMessages((prev) => {
        const next = [
          ...prev,
          createAgentMessage(
            'task_result',
            canAutoSubmit
              ? `「${title}」已确认。正在打开创建商品页并自动提交抖音来客审核…`
              : `「${title}」已确认。请先在「创建商品」页选择类目并保存一次，之后可在此一键自动提交；本次将为您预填方案。`,
            { resultSummary: 'confirmed' },
          ),
        ]
        messagesRef.current = next
        return next
      })
      setPendingPreviewId(null)
      setDrawerOpen(false)
      navigate('/products/create', {
        state: { platforms: ['douyin'], autoSubmit: canAutoSubmit },
      })
      return
    }

    if (p?.taskType === 'recruit_influencer') {
      const brief = p.recruitmentBrief
      if (brief?.briefText?.trim()) {
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
      }
      setMessages((prev) => {
        const next = [
          ...prev,
          createAgentMessage(
            'task_result',
            `「${title}」已确认。已写入达人 Brief，正在打开达人招募页…`,
            { resultSummary: 'confirmed' },
          ),
        ]
        messagesRef.current = next
        return next
      })
      setPendingPreviewId(null)
      setDrawerOpen(false)
      navigate('/recruitment')
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
  }, [pendingPreviewId, navigate])

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
      const nextPickerKey = resolveModelPickerKeyForImageIntent(
        modelPickerKey,
        modelPickerOptions,
        q,
        false,
      )
      if (nextPickerKey !== modelPickerKey) {
        setModelPickerKeyState(nextPickerKey)
        savePickerKey(nextPickerKey)
      }
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
          if (detectImageGenerationIntent(q) || isAgentImagePickerKey(nextPickerKey)) {
            setAiSending(true)
            try {
              const imgOpts = buildAgentImagePostOpts(nextPickerKey)
              const imgRes = await postAiAgentNativeImage(q, imgOpts)
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
            } finally {
              setAiSending(false)
            }
          }
          await runGatewayForSnapshot(
            messagesRef.current,
            q,
            inferTaskTypeFromText(q),
            pl,
            [],
            effectiveChatPickerKey(nextPickerKey),
          )
        })()
      })
    },
    [aiSending, runGatewayForSnapshot, modelPickerKey, modelPickerOptions, scheduleTaskPreview],
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
    if (p.taskType === 'create_product') return p.productPlan?.enrichStatus === 'loading'
    if (p.taskType === 'recruit_influencer') return p.recruitmentBrief?.enrichStatus === 'loading'
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
      confirmPendingTask,
      cancelPendingTask,
      modifyPendingTask,
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      aiSending,
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
      cancelPendingTask,
      modifyPendingTask,
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      aiSending,
      pendingPreviewLoading,
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
