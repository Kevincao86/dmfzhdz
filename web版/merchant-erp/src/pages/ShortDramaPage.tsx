import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  Coffee,
  Download,
  Dumbbell,
  Film,
  Flame,
  Flower2,
  GraduationCap,
  Hotel,
  Loader2,
  Package,
  PawPrint,
  Scissors,
  Soup,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Wine,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { MpAddonPointsRateBadge } from '../components/MpAddonPointsRateBadge'
import { MembershipMediaLockedBanner, useMembership } from '../context/MembershipContext'
import { probeVideoDurationSec } from '../lib/digitalHumanSubtitle'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { sanitizePromptForSeedanceNativeAv } from '../lib/shortVideoPostProcess'
import {
  SEEDANCE_1_5_PRO_MODEL_ID,
  SEEDANCE_2_0_MODEL_ID,
  SEEDANCE_QUALITY_OPTIONS,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  type SeedanceQualityId,
} from '../lib/shortVideoUiLabels'
import {
  checkMpAddonPointsAffordable,
  formatMpAddonPointsSpendHint,
  spendMpAddonPoints,
} from '../services/mpAddonPointsSpendClient'
import {
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  formatVideoAiUserError,
  runShortVideoJobWithFailover,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'

type GroupId = 'catering' | 'beauty' | 'leisure' | 'hotel' | 'retail'
type FormulaId = 'hidden_menu' | 'price_twist' | 'queue_flip' | 'boss_reveal' | 'date_fail' | 'flash_hook'
type StyleId = 'smoke' | 'neon' | 'fresh' | 'cinema' | 'quiet'
type MainTab = 'create' | 'works'
type DurationSec = 8 | 12 | 15

type ShopFill = {
  storeName: string
  offerName: string
  price: string
  area: string
}

type DramaScene = {
  id: string
  group: GroupId
  name: string
  hook: string
  mustSee: string
  visual: string
  cover: string
  icon: LucideIcon
}

type DramaWork = {
  id: string
  title: string
  sceneName: string
  previewUrl: string
  createdAt: number
}

const GROUPS: { id: GroupId | 'all'; label: string }[] = [
  { id: 'all', label: '全部场景' },
  { id: 'catering', label: '餐饮' },
  { id: 'beauty', label: '美业' },
  { id: 'leisure', label: '休娱' },
  { id: 'hotel', label: '酒旅' },
  { id: 'retail', label: '到家零售' },
]

const SCENES: DramaScene[] = [
  {
    id: 'hotpot',
    group: 'catering',
    name: '火锅局',
    hook: '红油翻滚，熟人局开场就吵',
    mustSee: '红油翻滚、蒸汽、涮菜入锅、举杯',
    visual: '暖红灯光，铜锅特写，蒸汽迎面，跟拍涮菜与欢呼，烟火气写实，浅景深',
    cover: 'from-rose-800 via-orange-700 to-amber-500',
    icon: Flame,
  },
  {
    id: 'bbq',
    group: 'catering',
    name: '烧烤夜宵',
    hook: '炭火滋滋，夜市才刚开始',
    mustSee: '炭火、刷酱翻串、油光、夜色街灯',
    visual: '夜市暖黄灯，炭火火星，刷酱滋滋，跟拍咬一口，烟雾与啤酒',
    cover: 'from-stone-900 via-amber-800 to-yellow-600',
    icon: Flame,
  },
  {
    id: 'tea',
    group: 'catering',
    name: '茶饮咖啡',
    hook: '第一口决定会不会发朋友圈',
    mustSee: '杯身、原料、拉花或珍珠，第一口特写',
    visual: '明亮浅景深，杯壁水珠，制作闪切，第一口反应，清新打卡感',
    cover: 'from-teal-800 via-cyan-600 to-lime-400',
    icon: Coffee,
  },
  {
    id: 'noodles',
    group: 'catering',
    name: '面馆拉面',
    hook: '出锅那一秒必须拉丝',
    mustSee: '出锅、拉面或浇头、热气、大口吸面',
    visual: '后厨出锅热气，面条拉丝，汤面特写，暖色食堂烟火',
    cover: 'from-amber-900 via-orange-600 to-yellow-400',
    icon: Soup,
  },
  {
    id: 'home_cook',
    group: 'catering',
    name: '家常正餐',
    hook: '招牌菜上桌，话筒递给第一口',
    mustSee: '装盘、家常硬菜、家庭或朋友围桌',
    visual: '圆桌硬菜特写，装盘动作，真实聚餐，暖光家常而非精修广告',
    cover: 'from-red-900 via-rose-700 to-orange-400',
    icon: UtensilsCrossed,
  },
  {
    id: 'bakery',
    group: 'catering',
    name: '烘焙甜品',
    hook: '切开断面比海报好看',
    mustSee: '切开拉丝或夹心、裱花、第一口',
    visual: '奶油拉丝，断面特写，自然光橱窗，精致但不假甜',
    cover: 'from-pink-300 via-rose-400 to-amber-200',
    icon: Coffee,
  },
  {
    id: 'hair',
    group: 'beauty',
    name: '美发造型',
    hook: '镜子一转，前后不是同一个人',
    mustSee: '镜子、剪发或吹风、前后对比',
    visual: '干净镜面，剪发跟拍，吹风定型，出门回头，冷暖混合灯光',
    cover: 'from-slate-800 via-violet-700 to-fuchsia-400',
    icon: Scissors,
  },
  {
    id: 'nail',
    group: 'beauty',
    name: '美甲美睫',
    hook: '特写比整张脸更有说服力',
    mustSee: '色板、微距完成面、灯光下闪光',
    visual: '微距美甲完成面，干净台面，缓慢环绕，少女感但不廉价闪粉',
    cover: 'from-fuchsia-800 via-pink-500 to-rose-300',
    icon: Sparkles,
  },
  {
    id: 'skin',
    group: 'beauty',
    name: '皮肤管理',
    hook: '仪器贴上脸的那一秒最安静',
    mustSee: '干净床位、仪器或手法、肤感特写',
    visual: '通透白光，干净床品，仪器贴肤，专业克制，无夸张医美特效',
    cover: 'from-sky-200 via-cyan-100 to-white',
    icon: Sparkles,
  },
  {
    id: 'gym',
    group: 'leisure',
    name: '健身瑜伽',
    hook: '动作比口号更像广告',
    mustSee: '训练动作、汗水、教练指导',
    visual: '跟拍训练，慢动作发力，汗水特写，节奏有力，健身房真实灯光',
    cover: 'from-zinc-900 via-emerald-800 to-lime-500',
    icon: Dumbbell,
  },
  {
    id: 'kids',
    group: 'leisure',
    name: '亲子乐园',
    hook: '孩子笑了，家长才会下单',
    mustSee: '孩子玩耍、家长旁观、明亮安全场地',
    visual: '明亮暖色，孩子玩耍跟拍，家长安心表情，禁止危险动作',
    cover: 'from-orange-400 via-amber-300 to-yellow-200',
    icon: Baby,
  },
  {
    id: 'pet',
    group: 'leisure',
    name: '宠物友好',
    hook: '萌宠特写先抢走前三秒',
    mustSee: '萌宠脸部特写、互动、店内环境',
    visual: '浅景深萌宠特写，轻抚互动，店内暖光，治愈但不摆拍僵硬',
    cover: 'from-amber-700 via-orange-400 to-stone-200',
    icon: PawPrint,
  },
  {
    id: 'spa',
    group: 'leisure',
    name: '足浴按摩',
    hook: '进门肩膀就卸下来',
    mustSee: '足浴盆或床位、手法、昏光放松',
    visual: '昏暖灯光，洁净木纹，蒸汽足浴，手法特写，安静疗愈',
    cover: 'from-stone-800 via-amber-900 to-yellow-700',
    icon: Wine,
  },
  {
    id: 'hotel',
    group: 'hotel',
    name: '酒店民宿',
    hook: '推开门那一帧决定订不订',
    mustSee: '推开门、床品、窗景',
    visual: '缓慢推轨，推开门，床品与窗景，干净高级，禁止廉价滤镜',
    cover: 'from-slate-700 via-sky-800 to-stone-300',
    icon: Hotel,
  },
  {
    id: 'spring',
    group: 'hotel',
    name: '温泉度假',
    hook: '热气先说话',
    mustSee: '热气水面、石景、放松神态',
    visual: '热气水面，石景与木廊，暮色，疗愈度假，人物表情放松',
    cover: 'from-cyan-900 via-teal-700 to-stone-400',
    icon: Hotel,
  },
  {
    id: 'takeaway',
    group: 'retail',
    name: '外卖开箱',
    hook: '拆袋比吃更有戏',
    mustSee: '拆袋、摆盘全景、份量、第一口',
    visual: '桌面俯拍拆袋，摆盘全景，份量特写，第一口评价，干脆运镜',
    cover: 'from-orange-700 via-red-600 to-amber-400',
    icon: Package,
  },
  {
    id: 'flower',
    group: 'retail',
    name: '鲜花礼品',
    hook: '拆纸的声音就能留人',
    mustSee: '花束、包装纸、递出或摆桌',
    visual: '自然光花材特写，包装纸展开，递出花束，清新柔软质感',
    cover: 'from-rose-500 via-pink-400 to-green-300',
    icon: Flower2,
  },
  {
    id: 'edu',
    group: 'retail',
    name: '兴趣课堂',
    hook: '孩子举手的那帧最能转化',
    mustSee: '课堂互动、作品或黑板、家长旁观',
    visual: '明亮教室，孩子举手互动，作品特写，信任感，禁止说教长镜头',
    cover: 'from-indigo-800 via-sky-600 to-amber-300',
    icon: GraduationCap,
  },
]

const FORMULAS: { id: FormulaId; name: string; hint: string; beats: [string, string, string, string] }[] = [
  {
    id: 'hidden_menu',
    name: '隐藏菜单',
    hint: '熟客才知道的那一道',
    beats: ['熟客把人往里拉', '普通菜单被揭穿', '隐藏招牌亮相', '悬念：你敢点吗'],
  },
  {
    id: 'price_twist',
    name: '价格误会',
    hint: '以为被宰，结账打脸',
    beats: ['看见价格愣住', '差点转身离开', '结账真相落地', '团购记忆点定格'],
  },
  {
    id: 'queue_flip',
    name: '排队反转',
    hint: '以为关店，推门爆满',
    beats: ['门口冷清误会', '推门发现满座', '第一口改口', '位置号召定格'],
  },
  {
    id: 'boss_reveal',
    name: '老板出手',
    hint: '被嫌弃后亲自上阵',
    beats: ['被当众看轻', '老板挽袖出手', '成品打脸', '店名收尾'],
  },
  {
    id: 'date_fail',
    name: '约会翻车',
    hint: '踩雷开场，第一口改口',
    beats: ['约会选错地方', '第一口翻车预期', '味道打脸', '安利到店'],
  },
  {
    id: 'flash_hook',
    name: '今晚限量',
    hint: '卖完就收，制造紧迫',
    beats: ['只剩最后几份', '制作或体验特写', '抢到的人反应', '倒计时到店'],
  },
]

const STYLES: { id: StyleId; name: string; visual: string }[] = [
  { id: 'smoke', name: '烟火气', visual: '暖黄实用光，蒸汽油光，真实市井，禁止精修广告片感' },
  { id: 'neon', name: '夜市霓虹', visual: '夜晚霓虹与路灯，潮湿地面反光，都市夜色' },
  { id: 'fresh', name: '清新打卡', visual: '自然光，浅景深，干净桌面，适合茶饮甜品美业' },
  { id: 'cinema', name: '电影感', visual: '跟拍推轨，轻微运动模糊，情绪特写，连续运镜' },
  { id: 'quiet', name: '高级克制', visual: '低饱和，留白，材质特写，慢推，适合酒旅与皮肤管理' },
]

const DURATION_OPTIONS: DurationSec[] = [8, 12, 15]

function newWorkId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `drama-${Date.now()}`
}

function fillTokens(template: string, scene: DramaScene, shop: ShopFill): string {
  const store = shop.storeName.trim() || '这家店'
  const offer = shop.offerName.trim() || scene.name
  const price = shop.price.trim() || '团购价'
  const area = shop.area.trim() || '附近'
  return template
    .replaceAll('{店名}', store)
    .replaceAll('{卖点}', offer)
    .replaceAll('{品类}', scene.name)
    .replaceAll('{价格}', price)
    .replaceAll('{位置}', area)
}

function formulaCopy(formulaId: FormulaId): {
  story: string
  roles: string
  conflict: string
  dialogue: string
} {
  switch (formulaId) {
    case 'hidden_menu':
      return {
        story: '熟客把人拉进{品类}后场，说普通菜单都是给人看的。',
        roles: '本地熟客 / 第一次来的客人 / 店员',
        conflict: '客人点了明面上的招牌，熟客当场拦住，改上{卖点}。',
        dialogue: '这道{卖点}，菜单上没有。',
      }
    case 'price_twist':
      return {
        story: '客人在{店名}看见{价格}以为被宰，结账才发现是团购。',
        roles: '精打细算的客人 / 收银店员',
        conflict: '差点转身离开，店员把团购码推到眼前。',
        dialogue: '你看的是原价。{价格}，现在就能核。',
      }
    case 'queue_flip':
      return {
        story: '路过{位置}以为{店名}倒闭了，推门却是满座。',
        roles: '路过的两人 / 迎宾',
        conflict: '门外冷清是错觉，里面在等位。',
        dialogue: '别看门口没人，里面位置都是抢的。',
      }
    case 'boss_reveal':
      return {
        story: '有人当众嫌{店名}不起眼，老板挽袖亲自做{卖点}。',
        roles: '嘴碎客人 / 老板',
        conflict: '被看轻之后，老板用成品打脸。',
        dialogue: '你再尝尝这口{卖点}。',
      }
    case 'date_fail':
      return {
        story: '约会选到{店名}，对方先皱眉，第一口{卖点}直接改口。',
        roles: '约会两人',
        conflict: '开场踩雷预期，味道把气氛救回来。',
        dialogue: '我刚才收回那句。我们下次还来。',
      }
    case 'flash_hook':
      return {
        story: '{店名}今晚{卖点}只做限定份，卖完就收。',
        roles: '店员 / 赶来的客人',
        conflict: '只剩最后几份，门口还有人在问。',
        dialogue: '就这些了，明天不一定有。',
      }
  }
}

function beatTimings(durationSec: number): [string, string, string, string] {
  if (durationSec <= 8) return ['0-2秒', '2-4秒', '4-6秒', '6-8秒']
  if (durationSec <= 12) return ['0-3秒', '3-6秒', '6-9秒', '9-12秒']
  return ['0-4秒', '4-8秒', '8-12秒', '12-15秒']
}

function buildDramaPrompt(input: {
  scene: DramaScene
  formula: (typeof FORMULAS)[number]
  style: (typeof STYLES)[number]
  shop: ShopFill
  story: string
  roles: string
  conflict: string
  dialogue: string
  durationSec: number
}): string {
  const times = beatTimings(input.durationSec)
  const beats = input.formula.beats.map((b, i) => `${i + 1}. ${times[i]} ${b}`).join('\n')
  const dialogue = input.dialogue.trim()
  const quoted = dialogue ? `对白钩子：${dialogue.includes('"') ? dialogue : `"${dialogue}"`}。` : ''
  const shopLine = [
    input.shop.storeName.trim() && `店名「${input.shop.storeName.trim()}」`,
    input.shop.offerName.trim() && `招牌「${input.shop.offerName.trim()}」`,
    input.shop.price.trim() && `价格记忆点「${input.shop.price.trim()}」`,
    input.shop.area.trim() && `位置「${input.shop.area.trim()}」`,
  ]
    .filter(Boolean)
    .join('，')
  return [
    `【本地生活短剧·${input.scene.name}·${input.formula.name}】`,
    `真人写实竖屏短剧，${input.durationSec} 秒一条过，前 3 秒必须冲突或反转。`,
    `画风：${input.style.visual}。`,
    `场景必须出现：${input.scene.mustSee}。${input.scene.visual}。`,
    shopLine ? `门店信息：${shopLine}。结尾用店名或位置做到店号召。` : '结尾留到店或下单行动号召。',
    `主题：${input.story.trim()}`,
    input.roles.trim() ? `角色：${input.roles.trim()}。` : '',
    input.conflict.trim() ? `核心冲突：${input.conflict.trim()}。` : '',
    quoted,
    `分镜节奏：\n${beats}`,
    '人物表情清晰，运镜跟拍，禁止拖沓空镜，禁止办公室职场网文，禁止仙侠古装，禁止电影片头片尾和演职员表，禁止大面积海报字幕。',
    '口播与对白短、狠、口语。',
  ]
    .filter(Boolean)
    .join('\n')
}

function isSeedance15ProModelId(id: string): boolean {
  const t = String(id || '').trim()
  return t === SEEDANCE_1_5_PRO_MODEL_ID || /seedance-1-5-pro/i.test(t) || /seedance-1\.5-pro/i.test(t)
}

function isSeedance20ModelId(id: string): boolean {
  return /seedance-2-0|seedance-2\.0|seedance-2-5|seedance-2\.5/i.test(String(id || ''))
}

/** 商家 CS：AI 创作 · AI短剧（本地生活模板工坊） */
export default function ShortDramaPage() {
  const { plan, requireAiVideoGen, openMembershipUpgrade } = useMembership()
  const [mainTab, setMainTab] = useState<MainTab>('create')
  const [groupId, setGroupId] = useState<GroupId | 'all'>('all')
  const [sceneId, setSceneId] = useState(SCENES[0]!.id)
  const [formulaId, setFormulaId] = useState<FormulaId>('hidden_menu')
  const [styleId, setStyleId] = useState<StyleId>('smoke')
  const [shop, setShop] = useState<ShopFill>({ storeName: '', offerName: '', price: '', area: '' })
  const [story, setStory] = useState('')
  const [roles, setRoles] = useState('')
  const [conflict, setConflict] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [durationSec, setDurationSec] = useState<DurationSec>(12)
  const [resolution, setResolution] = useState<SeedanceQualityId>('720p')
  const [cfg, setCfg] = useState<VideoAiBackendConfig | null>(null)
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [works, setWorks] = useState<DramaWork[]>([])
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null)
  const cancelRef = useRef(false)
  const mountedRef = useRef(true)
  const previewUrlsRef = useRef<string[]>([])
  const initedRef = useRef(false)

  const scene = SCENES.find((s) => s.id === sceneId) ?? SCENES[0]!
  const formula = FORMULAS.find((f) => f.id === formulaId) ?? FORMULAS[0]!
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0]!
  const activeWork = works.find((w) => w.id === activeWorkId) ?? works[0] ?? null
  const visibleScenes = groupId === 'all' ? SCENES : SCENES.filter((s) => s.group === groupId)
  const times = beatTimings(durationSec)

  const applyTemplate = useCallback(
    (nextScene: DramaScene, nextFormulaId: FormulaId, nextShop: ShopFill) => {
      const raw = formulaCopy(nextFormulaId)
      setStory(fillTokens(raw.story, nextScene, nextShop))
      setRoles(fillTokens(raw.roles, nextScene, nextShop))
      setConflict(fillTokens(raw.conflict, nextScene, nextShop))
      setDialogue(fillTokens(raw.dialogue, nextScene, nextShop))
    },
    [],
  )

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    applyTemplate(SCENES[0]!, 'hidden_menu', { storeName: '', offerName: '', price: '', area: '' })
  }, [applyTemplate])

  const promptPreview = useMemo(
    () =>
      buildDramaPrompt({
        scene,
        formula,
        style,
        shop,
        story: story.trim() || fillTokens(formulaCopy(formulaId).story, scene, shop),
        roles,
        conflict,
        dialogue,
        durationSec,
      }),
    [scene, formula, style, shop, story, roles, conflict, dialogue, durationSec, formulaId],
  )

  const seedancePoolModels = useMemo(() => {
    const raw = (cfg?.arkVideoModels.map((m) => m.endpointId) ?? []).filter((id) => {
      const t = String(id || '').trim()
      if (!t) return false
      if (/^wan[\d._-]/i.test(t) || (/t2v|i2v/i.test(t) && /^wan/i.test(t))) return false
      return true
    })
    const pro15 = raw.filter(isSeedance15ProModelId)
    const fallback20 = raw.filter((id) => isSeedance20ModelId(id) && !/mini/i.test(id))
    const ordered = [...pro15, ...fallback20]
    return ordered.length > 0
      ? ordered
      : [SEEDANCE_1_5_PRO_MODEL_ID, SEEDANCE_2_0_MODEL_ID, 'doubao-seedance-2-0-fast-260128']
  }, [cfg?.arkVideoModels])

  const gateReason = useMemo((): string | null => {
    if (busy) return '正在生成短剧，请稍候'
    if (!cfgLoaded) return '正在加载视频引擎配置'
    if (cfg?.configLoadError) return `视频配置加载失败：${cfg.configLoadError.slice(0, 120)}`
    if (!cfg?.arkKeyConfigured) {
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请在运营台配置后再生成。`
    }
    if (!(cfg?.arkVideoModels?.length ?? 0)) {
      return '视频服务已配置但未设置模型端点，请在运营台完成短剧模型配置。'
    }
    if (!story.trim()) return '请先确认一句话故事，或点一个场景模板。'
    return null
  }, [busy, cfgLoaded, cfg, story])

  useEffect(() => {
    mountedRef.current = true
    void fetchVideoAiConfig()
      .then((c) => {
        if (mountedRef.current) setCfg(c)
      })
      .finally(() => {
        if (mountedRef.current) setCfgLoaded(true)
      })
    return () => {
      mountedRef.current = false
      previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      previewUrlsRef.current = []
    }
  }, [])

  const chargePoints = useCallback(async (blob: Blob, billId: string, fallbackSec: number) => {
    let dur = Math.max(1, Math.ceil(Number(fallbackSec) || 1))
    try {
      const probed = await probeVideoDurationSec(blob)
      if (probed > 0.3) dur = Math.ceil(probed)
    } catch {
      /* use fallback */
    }
    try {
      const charge = await spendMpAddonPoints({
        kind: 'shortvideo',
        durationSec: dur,
        idempotencyKey: `shortdrama:${billId}`,
        note: `shortdrama:${billId}`,
      })
      if (!charge) return ''
      return formatMpAddonPointsSpendHint('shortvideo', charge, dur)
    } catch {
      return ''
    }
  }, [])

  const submitGenerate = async () => {
    if (!requireAiVideoGen()) return
    if (gateReason) {
      setErr(gateReason)
      setHint(null)
      setProgress(null)
      return
    }
    setErr(null)
    setHint(null)
    cancelRef.current = false
    const billId = newWorkId()
    setBusy(true)
    setProgress('正在检查积分与引擎')
    const afford = await checkMpAddonPointsAffordable('shortvideo', durationSec)
    if (!afford.ok) {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
        setErr(afford.message)
      }
      return
    }

    const flags = `--dur ${durationSec} --fps 24 --ratio 9:16 --wm false --resolution ${resolution}`
    const prompt = sanitizePromptForSeedanceNativeAv(
      buildDramaPrompt({
        scene,
        formula,
        style,
        shop,
        story: story.trim(),
        roles,
        conflict,
        dialogue,
        durationSec,
      }),
    )
    setProgress('正在提交短剧生成')
    try {
      const r = await runShortVideoJobWithFailover({
        engine: 'seedance',
        body: {
          prompt,
          flags,
          model: SEEDANCE_1_5_PRO_MODEL_ID,
          skip_qwen: true,
          lock_model: false,
          generate_audio: true,
        },
        poolModels: seedancePoolModels,
        shouldCancel: () => cancelRef.current,
        onProgress: (text) => {
          if (mountedRef.current) setProgress(text)
        },
        allowAutoHalveDuration: false,
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (cancelRef.current) {
        setHint('已停止等待。后台任务可能不会自动取消。')
        return
      }
      setProgress('正在拉取成片')
      const blob = await downloadVideoUrlAsBlob(r.videoUrl, { maxAttempts: 3 })
      const previewUrl = URL.createObjectURL(blob)
      previewUrlsRef.current.push(previewUrl)
      const title = shop.storeName.trim() || story.trim().slice(0, 18) || scene.name
      const work: DramaWork = {
        id: billId,
        title,
        sceneName: scene.name,
        previewUrl,
        createdAt: Date.now(),
      }
      setWorks((prev) => [work, ...prev])
      setActiveWorkId(work.id)
      setMainTab('works')
      const spendHint = await chargePoints(blob, billId, r.durationSecUsed ?? durationSec)
      setHint(
        [r.modelUsed ? `已使用视频模型：${r.modelUsed}` : '', spendHint].filter(Boolean).join(' ') ||
          '成片已生成，请及时保存到本地。',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const cancelWait = () => {
    cancelRef.current = true
    setBusy(false)
    setProgress(null)
    setHint('已停止等待。后台任务可能不会自动取消。')
  }

  const downloadWork = (work: DramaWork) => {
    const a = document.createElement('a')
    a.href = work.previewUrl
    a.download = `ai短剧-${work.title.slice(0, 18)}.mp4`
    a.click()
  }

  const removeWork = (id: string) => {
    setWorks((prev) => {
      const next = prev.filter((w) => w.id !== id)
      const removed = prev.find((w) => w.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
        previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== removed.previewUrl)
      }
      if (activeWorkId === id) setActiveWorkId(next[0]?.id ?? null)
      return next
    })
  }

  const fieldCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60'

  const SceneIcon = scene.icon

  return (
    <div className="short-drama-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="erp-page-title">AI短剧</h1>
          <MpAddonPointsRateBadge kind="shortvideo" className="mt-2" />
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            先选你的门店场景，再套一条本地生活钩子。成片按竖屏短剧走，不是探店剪辑，也不是数字人口播。
            {readMpSessionToken() ? (
              <span className="mt-1 block text-xs text-cyan-800">
                星选账号：成片成功后按秒扣积分；套餐次数优先，用尽后扣积分余额。
              </span>
            ) : null}
          </p>
          <div className="mt-2 max-w-2xl">
            <MembershipMediaLockedBanner
              kind="video"
              plan={plan}
              onUpgradeClick={() => openMembershipUpgrade('video')}
            />
          </div>
        </div>
        <div className="flex rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMainTab('create')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'create' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            做短剧
          </button>
          <button
            type="button"
            onClick={() => setMainTab('works')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              mainTab === 'works' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            成片{works.length ? ` ${works.length}` : ''}
          </button>
        </div>
      </div>

      {mainTab === 'create' ? (
        <div className="space-y-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupId(g.id)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-sm transition',
                  groupId === g.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {visibleScenes.map((s) => {
              const Icon = s.icon
              const on = s.id === sceneId
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSceneId(s.id)
                    applyTemplate(s, formulaId, shop)
                    if (s.group === 'beauty' || s.group === 'hotel') setStyleId('quiet')
                    else if (s.id === 'tea' || s.id === 'bakery' || s.id === 'flower') setStyleId('fresh')
                    else if (s.id === 'bbq' || s.id === 'spa') setStyleId('neon')
                    else setStyleId('smoke')
                  }}
                  className={cn(
                    'overflow-hidden rounded-2xl text-left transition active:scale-[0.98]',
                    on ? 'ring-2 ring-cyan-600 ring-offset-2' : 'ring-1 ring-slate-200 hover:ring-cyan-300',
                  )}
                >
                  <div className={cn('relative h-[88px] bg-gradient-to-br p-3 text-white', s.cover)}>
                    <Icon className="absolute right-2 top-2 h-5 w-5 opacity-70" />
                    <p className="relative text-sm font-semibold">{s.name}</p>
                    <p className="relative mt-1 line-clamp-2 text-[11px] leading-snug text-white/85">{s.hook}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <section className="erp-panel space-y-5 p-5">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">戏剧钩子</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FORMULAS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFormulaId(f.id)
                        applyTemplate(scene, f.id, shop)
                      }}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left transition',
                        formulaId === f.id
                          ? 'border-cyan-600 bg-cyan-50 text-cyan-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200',
                      )}
                    >
                      <span className="block text-sm font-medium">{f.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{f.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">店名</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={shop.storeName}
                    onChange={(e) => setShop((p) => ({ ...p, storeName: e.target.value }))}
                    placeholder="例：老街铜锅"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">招牌 / 卖点</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={shop.offerName}
                    onChange={(e) => setShop((p) => ({ ...p, offerName: e.target.value }))}
                    placeholder="例：牛油锅底 / 新品杯"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">价格记忆点</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={shop.price}
                    onChange={(e) => setShop((p) => ({ ...p, price: e.target.value }))}
                    placeholder="例：人均 88 / 第二杯半价"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">商圈位置</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={shop.area}
                    onChange={(e) => setShop((p) => ({ ...p, area: e.target.value }))}
                    placeholder="例：中山路地铁口"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => applyTemplate(scene, formulaId, shop)}
                className="text-sm font-medium text-cyan-800 hover:text-cyan-950"
              >
                用当前店名重填剧本
              </button>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">一句话故事</span>
                <textarea
                  className={cn(fieldCls, 'min-h-[84px] resize-y')}
                  disabled={busy}
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">角色</span>
                  <input className={fieldCls} disabled={busy} value={roles} onChange={(e) => setRoles(e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">对白钩子</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={dialogue}
                    onChange={(e) => setDialogue(e.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">核心冲突</span>
                <input
                  className={fieldCls}
                  disabled={busy}
                  value={conflict}
                  onChange={(e) => setConflict(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">画风</span>
                  <select
                    className={fieldCls}
                    disabled={busy}
                    value={styleId}
                    onChange={(e) => setStyleId(e.target.value as StyleId)}
                  >
                    {STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">时长</span>
                  <select
                    className={fieldCls}
                    disabled={busy}
                    value={durationSec}
                    onChange={(e) => setDurationSec(Number(e.target.value) as DurationSec)}
                  >
                    {DURATION_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} 秒
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">清晰度</span>
                  <select
                    className={fieldCls}
                    disabled={busy}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as SeedanceQualityId)}
                  >
                    {SEEDANCE_QUALITY_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="flex flex-col items-center">
                <div className="relative w-[240px] overflow-hidden rounded-[2rem] border-[5px] border-slate-800 bg-slate-900 shadow-xl shadow-slate-400/25">
                  <div className="absolute left-1/2 top-2.5 z-10 h-1 w-16 -translate-x-1/2 rounded-full bg-slate-700" />
                  <div className="aspect-[9/16] w-full">
                    {activeWork ? (
                      <video
                        key={activeWork.id}
                        src={activeWork.previewUrl}
                        controls
                        playsInline
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className={cn('flex h-full flex-col justify-end bg-gradient-to-br p-4 text-white', scene.cover)}>
                        <SceneIcon className="mb-auto mt-8 h-8 w-8 opacity-80" />
                        <p className="text-lg font-semibold">{scene.name}</p>
                        <p className="mt-1 text-xs text-white/85">{formula.name}</p>
                        <p className="mt-3 text-[11px] leading-relaxed text-white/80">{scene.mustSee}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <ol className="grid grid-cols-4 gap-1">
                {formula.beats.map((beat, i) => (
                  <li
                    key={beat}
                    className="rounded-lg bg-slate-900 px-1.5 py-2 text-center text-[10px] leading-snug text-white"
                  >
                    <span className="block text-cyan-300">{times[i]}</span>
                    {beat}
                  </li>
                ))}
              </ol>

              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                生成后请及时保存到本地。刷新页面后，本页成片将消失。
              </p>
              {progress ? <p className="text-sm text-cyan-800">{progress}</p> : null}
              {hint ? <p className="text-sm text-slate-600">{hint}</p> : null}
              {err ? <p className="text-sm text-rose-700">{err}</p> : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!gateReason}
                  onClick={() => void submitGenerate()}
                  className="erp-btn-primary min-w-[140px]"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                  {busy ? '生成中' : '生成短剧'}
                </button>
                {busy ? (
                  <button
                    type="button"
                    onClick={cancelWait}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600"
                  >
                    停止等待
                  </button>
                ) : null}
              </div>
              <details className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <summary className="cursor-pointer select-none text-slate-500">将发送的执导提示词</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{promptPreview}</pre>
              </details>
            </aside>
          </div>
        </div>
      ) : (
        <section>
          {works.length === 0 ? (
            <div className="erp-panel px-6 py-16 text-center text-sm text-slate-500">
              还没有成片。选一个门店场景，填店名后生成。
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {works.map((w) => (
                <li
                  key={w.id}
                  className={cn(
                    'overflow-hidden rounded-2xl bg-white ring-1',
                    activeWorkId === w.id ? 'ring-cyan-600' : 'ring-slate-200',
                  )}
                >
                  <button type="button" className="block w-full" onClick={() => setActiveWorkId(w.id)}>
                    <video src={w.previewUrl} className="aspect-[9/16] w-full bg-slate-950 object-contain" muted />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{w.title}</p>
                      <p className="text-[11px] text-slate-500">{w.sceneName}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="下载"
                        onClick={() => downloadWork(w)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-cyan-800"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={() => removeWork(w.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
