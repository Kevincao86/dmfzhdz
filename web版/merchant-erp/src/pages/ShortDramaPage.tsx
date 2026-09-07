import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  BookOpen,
  Building2,
  Car,
  Coffee,
  Cpu,
  Crown,
  Download,
  Dumbbell,
  Film,
  Flame,
  Flower2,
  Gamepad2,
  Ghost,
  GraduationCap,
  Heart,
  Hotel,
  Loader2,
  Mic2,
  Monitor,
  Mountain,
  PawPrint,
  Plane,
  Scissors,
  ShoppingBag,
  Smartphone,
  Smile,
  Soup,
  Sparkles,
  Swords,
  Trash2,
  Trees,
  UtensilsCrossed,
  Wand2,
  Wine,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { MpAddonPointsRateBadge } from '../components/MpAddonPointsRateBadge'
import { MembershipMediaLockedBanner, useMembership } from '../context/MembershipContext'
import { probeVideoDurationSec } from '../lib/digitalHumanSubtitle'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { planLongformSegmentDurations } from '../lib/shortVideoScriptTable'
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
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  formatVideoAiUserError,
  postVideoLastFrameFromUrl,
  runShortVideoJobWithFailover,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'

type WorldId = 'catering' | 'leisure' | 'tech' | 'drama' | 'comic'
type StyleId =
  | 'smoke'
  | 'neon'
  | 'fresh'
  | 'cinema'
  | 'quiet'
  | 'product'
  | 'live'
  | 'cel'
  | 'ink'
  | 'webtoon'
type MainTab = 'create' | 'works'
type FieldKey = 'storeName' | 'offerName' | 'price' | 'area'
type ShopFill = Record<FieldKey, string>

type DramaScene = {
  id: string
  world: WorldId
  name: string
  hook: string
  mustSee: string
  visual: string
  icon: LucideIcon
}

type DramaFormula = {
  id: string
  world: WorldId
  name: string
  hint: string
  beats: [string, string, string, string]
  story: string
  roles: string
  conflict: string
  dialogue: string
}

type DramaWork = {
  id: string
  title: string
  sceneName: string
  previewUrl: string
  createdAt: number
  durationSec: number
}

type DurationOpt = { sec: number; label: string; hint: string }

/** Seedance 单段稳妥上限；更长走分段尾帧续写 + 云端拼接 */
const SEGMENT_UNIT_SEC = 15
const PREVIEW_SEC = 5
/** 产品目标：最长 15 分钟（900 秒），与商家长片预期对齐 */
const MAX_DRAMA_TOTAL_SEC = 900

const DURATION_OPTIONS: DurationOpt[] = [
  { sec: 8, label: '8 秒', hint: '单段直出' },
  { sec: 12, label: '12 秒', hint: '单段直出' },
  { sec: 15, label: '15 秒', hint: '单段直出' },
  { sec: 30, label: '30 秒', hint: '2 段拼接' },
  { sec: 60, label: '1 分钟', hint: '4 段拼接' },
  { sec: 180, label: '3 分钟', hint: '先试镜再全片' },
  { sec: 300, label: '5 分钟', hint: '先试镜再全片' },
  { sec: 600, label: '10 分钟', hint: '先试镜再全片' },
  { sec: 900, label: '15 分钟', hint: '先试镜再全片' },
]

const WORLDS: {
  id: WorldId
  label: string
  blurb: string
  refill: string
  defaultStyle: StyleId
  promptKind: 'shop' | 'product' | 'drama' | 'comic'
  fields: { key: FieldKey; label: string; placeholder: string }[]
}[] = [
  {
    id: 'catering',
    label: '餐饮',
    blurb: '火锅、烧烤、茶饮、面馆到店场景。钩子围着菜单、价格和第一口。超过 15 秒会分段拼接，先出前 5 秒试镜。',
    refill: '用当前店名重填剧本',
    defaultStyle: 'smoke',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '店名', placeholder: '例：老街铜锅' },
      { key: 'offerName', label: '招牌 / 卖点', placeholder: '例：牛油锅底' },
      { key: 'price', label: '价格记忆点', placeholder: '例：人均 88' },
      { key: 'area', label: '商圈位置', placeholder: '例：中山路地铁口' },
    ],
  },
  {
    id: 'leisure',
    label: '休闲娱乐',
    blurb: '美业、健身、亲子、酒旅、娱乐。钩子围着体验反差和预约。长片同样先试镜再全片。',
    refill: '用当前店名重填剧本',
    defaultStyle: 'fresh',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '店名', placeholder: '例：南风造型' },
      { key: 'offerName', label: '体验项目', placeholder: '例：锁骨发 / 体验课' },
      { key: 'price', label: '价格记忆点', placeholder: '例：体验 99' },
      { key: 'area', label: '位置', placeholder: '例：万达 3 楼' },
    ],
  },
  {
    id: 'tech',
    label: '科技',
    blurb: '数码开箱、智能家居、软件演示。钩子围着功能打脸与场景救命。',
    refill: '用当前产品重填剧本',
    defaultStyle: 'product',
    promptKind: 'product',
    fields: [
      { key: 'storeName', label: '品牌 / 产品', placeholder: '例：某品牌降噪耳机' },
      { key: 'offerName', label: '核心卖点', placeholder: '例：通勤降噪 40dB' },
      { key: 'price', label: '价格档', placeholder: '例：399 档' },
      { key: 'area', label: '使用场景', placeholder: '例：地铁通勤' },
    ],
  },
  {
    id: 'drama',
    label: '短剧',
    blurb: '职场、情感、悬疑、家庭。人物关系驱动；长片按分镜分段续写，尽量尾帧衔接。',
    refill: '用当前设定重填剧本',
    defaultStyle: 'live',
    promptKind: 'drama',
    fields: [
      { key: 'storeName', label: '剧名 / 主题', placeholder: '例：合同碎了吗' },
      { key: 'offerName', label: '人设反差', placeholder: '例：助理 vs 老板' },
      { key: 'price', label: '悬念', placeholder: '例：她还有一份备份' },
      { key: 'area', label: '时代 / 城市', placeholder: '例：当代一线城市' },
    ],
  },
  {
    id: 'comic',
    label: '漫画',
    blurb: '校园、古风、条漫、战斗。二维分格；禁止拍成真人探店。',
    refill: '用当前人设重填剧本',
    defaultStyle: 'cel',
    promptKind: 'comic',
    fields: [
      { key: 'storeName', label: '作品名', placeholder: '例：放学后的秘密' },
      { key: 'offerName', label: '主角人设', placeholder: '例：黑发高中生' },
      { key: 'price', label: '分格风格', placeholder: '例：竖屏条漫' },
      { key: 'area', label: '世界观', placeholder: '例：现代校园' },
    ],
  },
]

const SCENES: DramaScene[] = [
  // catering
  { id: 'hotpot', world: 'catering', name: '火锅局', hook: '红油翻滚，熟人局开场就吵', mustSee: '红油、蒸汽、涮菜、举杯', visual: '暖实用光，铜锅特写，烟火气写实', icon: Flame },
  { id: 'bbq', world: 'catering', name: '烧烤夜宵', hook: '炭火滋滋，夜市才刚开始', mustSee: '炭火、刷酱、油光、街灯', visual: '夜市路灯，刷酱滋滋，跟拍咬一口', icon: Flame },
  { id: 'tea', world: 'catering', name: '茶饮咖啡', hook: '第一口决定会不会发朋友圈', mustSee: '杯身、原料、第一口特写', visual: '自然光浅景深，杯壁水珠', icon: Coffee },
  { id: 'noodles', world: 'catering', name: '面馆拉面', hook: '出锅那一秒必须拉丝', mustSee: '出锅、拉丝、热气、吸面', visual: '后厨热气，汤面特写', icon: Soup },
  { id: 'home_cook', world: 'catering', name: '家常正餐', hook: '招牌菜上桌递给第一口', mustSee: '装盘、硬菜、围桌', visual: '圆桌硬菜，真实聚餐', icon: UtensilsCrossed },
  { id: 'bakery', world: 'catering', name: '烘焙甜品', hook: '切开断面比海报好看', mustSee: '切开拉丝、裱花、第一口', visual: '奶油拉丝，橱窗自然光', icon: Coffee },
  { id: 'seafood', world: 'catering', name: '海鲜大排档', hook: '蒸汽开盖那一下最香', mustSee: '蒸笼开盖、海鲜特写、夜市', visual: '夜市蒸汽，海鲜鲜活感', icon: Soup },
  { id: 'buffet', world: 'catering', name: '自助烤肉', hook: '夹到招牌肉才算开场', mustSee: '烤盘、翻面、滋滋油光', visual: '烤盘特写，跟拍夹肉', icon: Flame },
  { id: 'breakfast', world: 'catering', name: '早点摊', hook: '天亮前那一口最真实', mustSee: '蒸笼、油条或粥、街边', visual: '清晨街边，烟火气克制', icon: Soup },
  { id: 'takeaway', world: 'catering', name: '外卖开箱', hook: '拆袋比吃更有戏', mustSee: '拆袋、摆盘、份量、第一口', visual: '桌面俯拍拆袋，干脆运镜', icon: ShoppingBag },
  // leisure
  { id: 'hair', world: 'leisure', name: '美发造型', hook: '镜子一转前后不是同一个人', mustSee: '镜子、剪吹、前后对比', visual: '干净镜面，剪发跟拍', icon: Scissors },
  { id: 'nail', world: 'leisure', name: '美甲美睫', hook: '特写比整张脸更有说服力', mustSee: '色板、微距完成面', visual: '微距完成面，缓慢环绕', icon: Sparkles },
  { id: 'skin', world: 'leisure', name: '皮肤管理', hook: '仪器贴上脸最安静', mustSee: '床位、仪器、肤感', visual: '通透白光，专业克制', icon: Sparkles },
  { id: 'gym', world: 'leisure', name: '健身瑜伽', hook: '动作比口号更像广告', mustSee: '训练、汗水、教练', visual: '跟拍训练，慢动作发力', icon: Dumbbell },
  { id: 'kids', world: 'leisure', name: '亲子乐园', hook: '孩子笑了家长才下单', mustSee: '玩耍、家长旁观、安全场地', visual: '明亮场地，轻快跟拍', icon: Baby },
  { id: 'pet', world: 'leisure', name: '宠物友好', hook: '萌宠特写抢走前三秒', mustSee: '萌宠脸、互动、店内', visual: '浅景深萌宠特写', icon: PawPrint },
  { id: 'spa', world: 'leisure', name: '足浴按摩', hook: '进门肩膀就卸下来', mustSee: '足浴盆、手法、昏光', visual: '昏暖灯光，手法特写', icon: Wine },
  { id: 'hotel', world: 'leisure', name: '酒店民宿', hook: '推开门那一帧决定订不订', mustSee: '推开门、床品、窗景', visual: '缓慢推轨，干净高级', icon: Hotel },
  { id: 'ktv', world: 'leisure', name: 'KTV 酒吧', hook: '第一首歌把气氛掀起来', mustSee: '包厢灯、麦克风、举杯', visual: '包厢彩光克制，跟拍唱歌', icon: Mic2 },
  { id: 'escape', world: 'leisure', name: '剧本杀密室', hook: '进门就进另一条时间线', mustSee: '机关、线索、惊吓反应', visual: '暗调场景，线索特写，禁止血腥', icon: Ghost },
  { id: 'billiard', world: 'leisure', name: '台球桌游', hook: '一杆清台才说话', mustSee: '击球、球桌、欢呼', visual: '台球厅灯光，击球慢动作', icon: Gamepad2 },
  { id: 'flower', world: 'leisure', name: '鲜花礼品', hook: '拆纸的声音就能留人', mustSee: '花束、包装、递出', visual: '自然光花材特写', icon: Flower2 },
  { id: 'edu', world: 'leisure', name: '兴趣课堂', hook: '孩子举手最能转化', mustSee: '举手、作品、课堂', visual: '明亮教室，信任感', icon: GraduationCap },
  { id: 'travel', world: 'leisure', name: '周边游玩', hook: '下车第一眼就要想发圈', mustSee: '景点门头、打卡位、笑脸', visual: '户外自然光，跟拍行走', icon: Plane },
  // tech
  { id: 'phone', world: 'tech', name: '数码开箱', hook: '拆封比参数更有戏', mustSee: '拆封、机身、上手', visual: '干净桌面俯拍，材质特写', icon: Smartphone },
  { id: 'smarthome', world: 'tech', name: '智能家居', hook: '一句话灯就亮了', mustSee: '开关灯、音箱、生活场景', visual: '现代客厅，灯光变化', icon: Cpu },
  { id: 'gadget', world: 'tech', name: '桌面配件', hook: '桌面一换效率跟着换', mustSee: '桌面布置、配件、操作', visual: '冷色桌面，手部操作', icon: Monitor },
  { id: 'ev', world: 'tech', name: '出行科技', hook: '关门那一声就要高级', mustSee: '车门、仪表、起步', visual: '座舱屏幕清晰，克制夜景', icon: Car },
  { id: 'saas', world: 'tech', name: '软件演示', hook: '屏幕结果当场打脸质疑', mustSee: '屏幕界面、操作、前后对比', visual: '过肩拍屏幕，禁止乱码界面', icon: Monitor },
  { id: 'ai_office', world: 'tech', name: '办公 AI', hook: '加班到一半被工具救了', mustSee: '工位、屏幕生成、表情变化', visual: '夜晚台灯，屏幕内容可读', icon: Cpu },
  { id: 'wearable', world: 'tech', name: '穿戴设备', hook: '手腕一抬数据就说话', mustSee: '手表特写、运动或通知', visual: '手腕微距，运动场景', icon: Smartphone },
  { id: 'camera', world: 'tech', name: '影像设备', hook: '按下快门前后反差', mustSee: '相机、取景、成片对比', visual: '器材质感，取景框叙事', icon: Film },
  // drama
  { id: 'workplace', world: 'drama', name: '职场打脸', hook: '被压的人手里还有后手', mustSee: '对峙、证据、表情反转', visual: '当代办公室，表情清晰', icon: Building2 },
  { id: 'romance', world: 'drama', name: '情感悬念', hook: '一句对白把关系掀翻', mustSee: '近景、对白口型、停顿', visual: '都市暖光或夜色，情绪特写', icon: Heart },
  { id: 'family', world: 'drama', name: '家庭伦理', hook: '饭桌上那句话不能收回', mustSee: '餐桌、对视、沉默', visual: '家常餐厅灯光，关系清楚', icon: UtensilsCrossed },
  { id: 'suspense', world: 'drama', name: '悬疑钩子', hook: '开门瞬间先别出声', mustSee: '门缝、惊觉、定格', visual: '冷色走廊，浅景深', icon: Film },
  { id: 'sweet', world: 'drama', name: '甜宠误会', hook: '先吵再被小事砸中', mustSee: '争执、线索、改口', visual: '清透都市，节奏轻快', icon: Heart },
  { id: 'teaser', world: 'drama', name: '下集预告', hook: '高潮切黑只留一句', mustSee: '高潮碎片、切黑、旁白', visual: '快切定格，禁止片尾表', icon: Film },
  { id: 'revenge', world: 'drama', name: '逆袭翻盘', hook: '最被看不起的人先赢', mustSee: '被嘲、证据、翻盘', visual: '都市写实，节奏加快', icon: Crown },
  { id: 'campus_live', world: 'drama', name: '校园写实', hook: '放学铃一响事情就变了', mustSee: '校门口、书包、对峙', visual: '校园写实，自然光', icon: BookOpen },
  // comic
  { id: 'school', world: 'comic', name: '校园日常', hook: '放学铃一响开始不对劲', mustSee: '教室、大特写、分格', visual: '日漫赛璐珞，眼睛高光', icon: BookOpen },
  { id: 'xianxia', world: 'comic', name: '古风仙侠', hook: '剑未出鞘气势先到', mustSee: '古装、兵器、广袖', visual: '国漫厚涂，二维，禁止真人古装剧', icon: Wand2 },
  { id: 'urban_power', world: 'comic', name: '都市异能', hook: '地铁里忽然不是同一世界', mustSee: '都市+异能、变装', visual: '都市漫画，克制光效', icon: Sparkles },
  { id: 'gag', world: 'comic', name: '搞笑条漫', hook: '第三格必须打脸', mustSee: '分格、夸张表情', visual: '四格/条漫，竖屏阅读方向', icon: Smile },
  { id: 'battle', world: 'comic', name: '战斗高潮', hook: '出招那一帧要停得住', mustSee: '出招、冲击线、反应', visual: '速度线与动态 pose', icon: Swords },
  { id: 'comic_sweet', world: 'comic', name: '甜宠漫画', hook: '对视比告白更有杀伤力', mustSee: '近景、脸红、留白', visual: '韩漫清透，大眼睛近景', icon: Heart },
  { id: 'horror_comic', world: 'comic', name: '怪谈一格', hook: '最后一格才发现不对', mustSee: '日常铺垫、异常细节', visual: '冷色分格，禁止过度血腥', icon: Ghost },
  { id: 'wuxia', world: 'comic', name: '武侠江湖', hook: '客栈里先让一步', mustSee: '客栈、兵器、对峙', visual: '水墨或国漫武侠二维', icon: Mountain },
  { id: 'nature_comic', world: 'comic', name: '治愈自然', hook: '风一吹情绪就慢下来', mustSee: '树影、散步、静物', visual: '柔和色块，慢节奏分格', icon: Trees },
]

const FORMULAS: DramaFormula[] = [
  { id: 'c_hidden', world: 'catering', name: '隐藏菜单', hint: '熟客才知道的那一道', beats: ['熟客把人往里拉', '普通菜单被揭穿', '隐藏招牌亮相', '悬念定格'], story: '熟客把人拉进{品类}后场，说普通菜单都是给人看的。', roles: '本地熟客 / 第一次来的客人 / 店员', conflict: '客人点了明面上的招牌，熟客当场拦住，改上{卖点}。', dialogue: '这道{卖点}，菜单上没有。' },
  { id: 'c_price', world: 'catering', name: '价格误会', hint: '以为被宰，结账打脸', beats: ['看见价格愣住', '差点转身离开', '结账真相落地', '团购记忆点'], story: '客人在{店名}看见{价格}以为被宰，结账才发现是团购。', roles: '精打细算的客人 / 收银店员', conflict: '差点转身离开，店员把团购码推到眼前。', dialogue: '你看的是原价。{价格}，现在就能核。' },
  { id: 'c_queue', world: 'catering', name: '排队反转', hint: '以为关店，推门爆满', beats: ['门口冷清误会', '推门发现满座', '第一口改口', '位置号召'], story: '路过{位置}以为{店名}倒闭了，推门却是满座。', roles: '路过的两人 / 迎宾', conflict: '门外冷清是错觉，里面在等位。', dialogue: '别看门口没人，里面位置都是抢的。' },
  { id: 'c_boss', world: 'catering', name: '老板出手', hint: '被嫌弃后亲自上阵', beats: ['被当众看轻', '老板挽袖出手', '成品打脸', '店名收尾'], story: '有人当众嫌{店名}不起眼，老板挽袖亲自做{卖点}。', roles: '嘴碎客人 / 老板', conflict: '被看轻之后，老板用成品打脸。', dialogue: '你再尝尝这口{卖点}。' },
  { id: 'c_date', world: 'catering', name: '约会翻车', hint: '踩雷开场，第一口改口', beats: ['约会选错地方', '第一口翻车预期', '味道打脸', '安利到店'], story: '约会选到{店名}，对方先皱眉，第一口{卖点}直接改口。', roles: '约会两人', conflict: '开场踩雷预期，味道把气氛救回来。', dialogue: '我刚才收回那句。我们下次还来。' },
  { id: 'c_flash', world: 'catering', name: '今晚限量', hint: '卖完就收，制造紧迫', beats: ['只剩最后几份', '制作特写', '抢到的人反应', '倒计时到店'], story: '{店名}今晚{卖点}只做限定份，卖完就收。', roles: '店员 / 赶来的客人', conflict: '只剩最后几份，门口还有人在问。', dialogue: '就这些了，明天不一定有。' },
  { id: 'c_review', world: 'catering', name: '差评反转', hint: '差评进来，好评出去', beats: ['念差评进店', '现场对质', '第一口改口', '当场改评'], story: '有人拿着差评进{店名}找茬，尝到{卖点}后当场改口。', roles: '差评客人 / 店员', conflict: '带着偏见进店，味道把偏见打掉。', dialogue: '这口{卖点}，我收回差评。' },
  { id: 'l_before', world: 'leisure', name: '前后对比', hint: '进门和出门不是同一个人', beats: ['进店状态', '过程闪切', '完成面亮相', '预约号召'], story: '客人带着将就的状态走进{店名}，做完{卖点}出门被拦下来问地址。', roles: '客人 / 老师或技师', conflict: '开始觉得没必要，结束时主动加预约。', dialogue: '刚才那是你？我要预约同款{卖点}。' },
  { id: 'l_queue', world: 'leisure', name: '预约打脸', hint: '以为随时能进，其实要排队', beats: ['直接上门', '被告知要预约', '体验一眼种草', '马上预约'], story: '路过{位置}想进{店名}即做{卖点}，前台说今天已满。', roles: '路过客人 / 前台', conflict: '即到即做的预期被预约制打脸。', dialogue: '今天{卖点}已经排满，我帮你约最早的。' },
  { id: 'l_date', world: 'leisure', name: '约会翻车', hint: '选错项目，体验把气氛救回来', beats: ['选错预期', '体验开始别扭', '效果打脸', '下次还来'], story: '约会选到{店名}的{卖点}，对方先皱眉，体验结束后改口。', roles: '约会两人', conflict: '项目看起来不适合，实际体验相反。', dialogue: '行，下次还来这家。' },
  { id: 'l_flash', world: 'leisure', name: '体验限时', hint: '名额有限，错过再等', beats: ['名额提示', '体验片段', '抢到的人反应', '倒计时预约'], story: '{店名}的{卖点}今晚只放{价格}体验名额。', roles: '顾问 / 赶来的客人', conflict: '名额见底，门口还有人在问。', dialogue: '就这些名额了，明天恢复原价。' },
  { id: 'l_boss', world: 'leisure', name: '老师出手', hint: '被看轻后亲自做示范', beats: ['被当众看轻', '老师上手', '效果打脸', '店名收尾'], story: '有人嫌{店名}普通，老师亲自上手做{卖点}。', roles: '挑事客人 / 老师', conflict: '被看轻之后用完成面打脸。', dialogue: '你再看看这版{卖点}。' },
  { id: 'l_family', world: 'leisure', name: '带娃翻车', hint: '家长先慌，孩子先笑', beats: ['家长犹豫', '孩子上手', '笑场', '立刻报名'], story: '家长犹豫要不要给孩子试{店名}的{卖点}，孩子一上手就笑开了。', roles: '家长 / 孩子 / 老师', conflict: '家长怕不适合，现场反馈相反。', dialogue: '行，给我们留个名额。' },
  { id: 't_unbox', world: 'tech', name: '开箱翻车', hint: '先嫌弃包装，上手打脸', beats: ['拆开先皱眉', '以为不值这个价', '功能亮相', '改口安利'], story: '开箱{店名}，先嫌弃包装，上手{卖点}之后立刻改口。', roles: '测评的人 / 旁边吐槽的朋友', conflict: '价格档看起来不匹配，体验相反。', dialogue: '{价格}能做成这样？我收回刚才那句。' },
  { id: 't_spec', world: 'tech', name: '参数打脸', hint: '口头参数打不过现场一试', beats: ['口头质疑参数', '现场演示', '结果弹出', '使用场景定格'], story: '有人说{店名}的{卖点}是宣传，当场在{位置}演示打脸。', roles: '质疑者 / 演示者', conflict: '口头不信，屏幕或实物结果说话。', dialogue: '你自己看，这就是{卖点}。' },
  { id: 't_commute', world: 'tech', name: '场景救命', hint: '最吵的时候它才出现', beats: ['场景噪音或混乱', '掏出产品', '一瞬间变静/变顺', '记忆点'], story: '在{位置}快被打断时，{店名}的{卖点}把局面救回来。', roles: '通勤或办公的人', conflict: '环境已经崩了，产品把节奏拉回来。', dialogue: '就靠这个{卖点}撑过这一段。' },
  { id: 't_launch', world: 'tech', name: '发布钩子', hint: '倒计时，先看一眼核心', beats: ['倒计时', '核心功能特写', '一句卖点', '行动号召'], story: '{店名}今晚揭晓，先看一眼{卖点}。', roles: '发布者 / 围观的人', conflict: '信息只给一口，逼着看完。', dialogue: '{卖点}，{价格}，今晚截止。' },
  { id: 't_office', world: 'tech', name: '加班被救', hint: '通宵前被工具截胡', beats: ['截止日期压过来', '旧方法崩了', '产品出结果', '人松一口气'], story: '截止日期前{位置}里的人快崩了，{店名}用{卖点}直接出结果。', roles: '加班的人 / 同事', conflict: '人手不够，工具把结果提前交出来。', dialogue: '你早点拿出来，我至于熬到现在？' },
  { id: 't_compare', world: 'tech', name: '同价对比', hint: '并排放，一秒分出高下', beats: ['两款并排', '同场景测试', '差距拉开', '结论定格'], story: '同价位对比{店名}与普通方案，{卖点}差距一眼可见。', roles: '测评者', conflict: '口头说差不多，画面差很多。', dialogue: '同价位，别再赌运气了。' },
  { id: 'd_hook', world: 'drama', name: '冲突钩子', hint: '前三秒必须出事', beats: ['角色亮相', '意外砸下来', '情绪顶点', '悬念定格'], story: '{店名}：{卖点}正面碰上，前三秒必须出事。', roles: '{卖点}', conflict: '{价格}', dialogue: '你以为这就结束了？' },
  { id: 'd_twist', world: 'drama', name: '反转开场', hint: '先以为是 A，立刻打脸成 B', beats: ['误导开场', '打脸反转', '真相落地', '一句钩子'], story: '{店名}开场全是误导，三秒后身份或关系翻过来。', roles: '{卖点}', conflict: '观众以为站对边了。', dialogue: '你认错人了。' },
  { id: 'd_work', world: 'drama', name: '职场翻盘', hint: '被压的人当场摊牌', beats: ['被当众压', '证据亮相', '当场翻盘', '身份反差'], story: '{位置}办公室里，{卖点}被当众看轻，{价格}被摊到桌上。', roles: '{卖点}', conflict: '{价格}', dialogue: '这份东西，你看完再说话。' },
  { id: 'd_love', world: 'drama', name: '情感掀翻', hint: '一句对白把关系掀翻', beats: ['亲密或冷战', '关键对白', '情绪决堤', '未说完'], story: '{店名}里两人本来还能装，{卖点}被一句对白掀翻。', roles: '{卖点}', conflict: '{价格}', dialogue: '你刚才说的，再重复一遍。' },
  { id: 'd_teaser', world: 'drama', name: '下集预告', hint: '高潮切黑，只留一句', beats: ['高潮碎片', '最大冲突', '突然切黑', '旁白预告'], story: '{店名}本集不给结局，{价格}留到下一秒。', roles: '{卖点}', conflict: '观众以为要揭晓。', dialogue: '下一秒，你不会想错过。' },
  { id: 'd_family', world: 'drama', name: '饭桌风暴', hint: '最亲的人最狠的话', beats: ['饭桌寒暄', '一句话刺穿', '沉默爆发', '门响或离席'], story: '{店名}的饭桌上，{卖点}被一句家常话刺穿。', roles: '{卖点}', conflict: '{价格}', dialogue: '你再说一遍试试。' },
  { id: 'm_panel', world: 'comic', name: '分格钩子', hint: '第三格必须反转', beats: ['第一格铺垫', '第二格加码', '第三格打脸', '第四格定格'], story: '{店名}用{价格}讲{卖点}，第三格必须反转。', roles: '{卖点}', conflict: '读者以为走向日常。', dialogue: '你以为放学就结束了？' },
  { id: 'm_gag', world: 'comic', name: '搞笑打脸', hint: '表情比台词更狠', beats: ['正经开场', '动作走偏', '表情崩掉', '吐槽定格'], story: '{卖点}在{位置}里想装酷，结果当场翻车。', roles: '{卖点}', conflict: '人设撑不住动作。', dialogue: '……当我没说。' },
  { id: 'm_ink', world: 'comic', name: '气势一格', hint: '不出手，气势先到', beats: ['对峙远景', '特写眼睛', '气势铺开', '出招或收势'], story: '{店名}里{卖点}还没出手，气场已经压过去。', roles: '{卖点}', conflict: '对手先慌。', dialogue: '你先走一步。' },
  { id: 'm_color', world: 'comic', name: '变装揭示', hint: '一格换装，身份翻面', beats: ['日常伪装', '触发条件', '变装揭示', '新身份定格'], story: '{位置}里的{卖点}被触发，一格换装身份翻面。', roles: '{卖点}', conflict: '伪装被当场揭开。', dialogue: '现在，认清我。' },
  { id: 'm_cliff', world: 'comic', name: '条漫悬念', hint: '最后一格切黑', beats: ['推进剧情', '线索特写', '冲突顶格', '切黑留白'], story: '{店名}这一话不给答案，{价格}停在最后一格。', roles: '{卖点}', conflict: '读者以为要揭晓。', dialogue: '未完。' },
  { id: 'm_battle', world: 'comic', name: '连招高潮', hint: '每一格都要更狠', beats: ['起手式', '连招加速', '反击', '胜负定格'], story: '{店名}里{卖点}连招拉满，最后一格定胜负。', roles: '{卖点}', conflict: '对手以为能拖过这一格。', dialogue: '这一招，够了。' },
]

const STYLES: { id: StyleId; worlds: WorldId[]; name: string; visual: string }[] = [
  { id: 'smoke', worlds: ['catering'], name: '烟火气', visual: '暖黄实用光，蒸汽油光，真实市井，禁止精修广告片感' },
  { id: 'neon', worlds: ['catering', 'leisure'], name: '夜色街灯', visual: '夜晚路灯与室内暖光，潮湿地面反光，克制不霓虹爆炸' },
  { id: 'fresh', worlds: ['catering', 'leisure'], name: '清新打卡', visual: '自然光，浅景深，干净桌面或镜面' },
  { id: 'quiet', worlds: ['leisure'], name: '高级克制', visual: '低饱和，留白，材质特写，慢推' },
  { id: 'cinema', worlds: ['catering', 'leisure', 'tech', 'drama'], name: '电影感', visual: '跟拍推轨，轻微运动模糊，情绪特写，连续运镜' },
  { id: 'product', worlds: ['tech'], name: '产品冷调', visual: '干净桌面，材质微距，手部操作，屏幕内容可读' },
  { id: 'live', worlds: ['drama'], name: '真人写实', visual: '当代都市真人写实，人物表情清晰，禁止二维漫画，禁止探店空镜堆砌' },
  { id: 'cel', worlds: ['comic'], name: '赛璐珞', visual: '日漫赛璐珞上色，清晰线稿，眼睛高光，二维动画，禁止真人实拍质感' },
  { id: 'ink', worlds: ['comic'], name: '国漫厚涂', visual: '国漫厚涂，服饰纹样清楚，气势与飘带，二维，禁止真人古装剧' },
  { id: 'webtoon', worlds: ['comic'], name: '条漫清透', visual: '韩漫清透上色，竖屏分格阅读，大特写与留白，二维' },
]

function worldOf(id: WorldId) {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0]!
}
function scenesOf(id: WorldId) {
  return SCENES.filter((s) => s.world === id)
}
function formulasOf(id: WorldId) {
  return FORMULAS.filter((f) => f.world === id)
}
function stylesOf(id: WorldId) {
  return STYLES.filter((s) => s.worlds.includes(id))
}

function newWorkId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `drama-${Date.now()}`
}

function fillTokens(template: string, scene: DramaScene, shop: ShopFill): string {
  const store = shop.storeName.trim() || '这一个项目'
  const offer = shop.offerName.trim() || scene.name
  const price = shop.price.trim() || '关键卖点'
  const area = shop.area.trim() || '当下'
  return template
    .replaceAll('{店名}', store)
    .replaceAll('{卖点}', offer)
    .replaceAll('{品类}', scene.name)
    .replaceAll('{价格}', price)
    .replaceAll('{位置}', area)
}

function needsPreviewGate(totalSec: number): boolean {
  return totalSec > SEGMENT_UNIT_SEC
}

function segmentPlanLabel(totalSec: number): string {
  if (totalSec <= SEGMENT_UNIT_SEC) return '单段直出'
  const plan = planLongformSegmentDurations(Math.min(MAX_DRAMA_TOTAL_SEC, totalSec))
  return `${plan.length} 段拼接（约 ${plan.join('+')} 秒）`
}

function buildBasePromptMeta(input: {
  world: (typeof WORLDS)[number]
  scene: DramaScene
  formula: DramaFormula
  style: (typeof STYLES)[number]
  shop: ShopFill
  story: string
  roles: string
  conflict: string
  dialogue: string
}): string {
  const dialogue = input.dialogue.trim()
  const quoted = dialogue ? `对白钩子：${dialogue.includes('"') ? dialogue : `"${dialogue}"`}。` : ''
  const infoBits = input.world.fields
    .map((f) => {
      const v = input.shop[f.key].trim()
      return v ? `${f.label}「${v}」` : ''
    })
    .filter(Boolean)
    .join('，')
  const kindLine =
    input.world.promptKind === 'comic'
      ? '二维漫画/动画竖屏短剧，分格阅读感，禁止真人实拍质感，禁止餐饮探店。'
      : input.world.promptKind === 'drama'
        ? '真人写实都市短剧，前 3 秒必须冲突或反转。禁止二维漫画，禁止探店空镜堆砌。'
        : input.world.promptKind === 'product'
          ? '科技产品短剧，产品特写必须可读。禁止仙侠，禁止纯餐饮烟雾。'
          : '本地生活真人写实竖屏短剧，前 3 秒必须冲突或反转。禁止办公室网文，禁止仙侠古装。'
  return [
    `【AI短剧·${input.world.label}·${input.scene.name}·${input.formula.name}】`,
    kindLine,
    `画风：${input.style.visual}。`,
    `画面必须出现：${input.scene.mustSee}。${input.scene.visual}。`,
    infoBits ? `创作信息：${infoBits}。` : '',
    `主题：${input.story.trim()}`,
    input.roles.trim() ? `角色：${input.roles.trim()}。` : '',
    input.conflict.trim() ? `核心冲突：${input.conflict.trim()}。` : '',
    quoted,
    '运镜跟拍，禁止拖沓空镜，禁止大面积海报字幕。口播与对白短、口语。禁止电影片头片尾和演职员表。',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildSegmentPrompt(input: {
  meta: string
  beat: string
  index: number
  total: number
  durationSec: number
  continueFromPrev: boolean
}): string {
  return [
    input.meta,
    `本段是第 ${input.index + 1}/${input.total} 段，时长约 ${input.durationSec} 秒。`,
    `本段戏剧任务：${input.beat}。`,
    input.continueFromPrev
      ? '必须从上一段尾帧自然接戏：同一角色、同一场景光影连续，禁止硬切换人换景，禁止重开片头。'
      : '本段为开场：前 2 秒必须冲突或反转，直接进入故事。',
    input.index === input.total - 1 ? '本段收尾：留下记忆点或行动号召，不要突然黑屏演职员表。' : '本段结尾停在可续写的动作或表情，便于下一段接戏。',
  ].join('\n')
}

function expandBeats(formula: DramaFormula, segmentCount: number): string[] {
  if (segmentCount <= 4) {
    return Array.from({ length: segmentCount }, (_, i) => formula.beats[Math.min(i, 3)]!)
  }
  const out: string[] = []
  for (let i = 0; i < segmentCount; i++) {
    const t = i / Math.max(1, segmentCount - 1)
    const bi = Math.min(3, Math.floor(t * 4))
    const beat = formula.beats[bi]!
    out.push(`${beat}（全片进度 ${i + 1}/${segmentCount}）`)
  }
  return out
}

function isSeedance15ProModelId(id: string): boolean {
  const t = String(id || '').trim()
  return t === SEEDANCE_1_5_PRO_MODEL_ID || /seedance-1-5-pro/i.test(t) || /seedance-1\.5-pro/i.test(t)
}
function isSeedance20ModelId(id: string): boolean {
  return /seedance-2-0|seedance-2\.0|seedance-2-5|seedance-2\.5/i.test(String(id || ''))
}

/** 商家 CS：AI 创作 · AI短剧 */
export default function ShortDramaPage() {
  const { plan, requireAiVideoGen, openMembershipUpgrade } = useMembership()
  const [mainTab, setMainTab] = useState<MainTab>('create')
  const [worldId, setWorldId] = useState<WorldId>('catering')
  const [sceneId, setSceneId] = useState(SCENES[0]!.id)
  const [formulaId, setFormulaId] = useState(FORMULAS[0]!.id)
  const [styleId, setStyleId] = useState<StyleId>('smoke')
  const [shop, setShop] = useState<ShopFill>({ storeName: '', offerName: '', price: '', area: '' })
  const [story, setStory] = useState('')
  const [roles, setRoles] = useState('')
  const [conflict, setConflict] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [durationSec, setDurationSec] = useState(12)
  const [resolution, setResolution] = useState<SeedanceQualityId>('720p')
  const [cfg, setCfg] = useState<VideoAiBackendConfig | null>(null)
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [works, setWorks] = useState<DramaWork[]>([])
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null)
  /** 长片：先 5 秒试镜，用户确认后再全片 */
  const [trialUrl, setTrialUrl] = useState<string | null>(null)
  const [trialReady, setTrialReady] = useState(false)
  const cancelRef = useRef(false)
  const mountedRef = useRef(true)
  const previewUrlsRef = useRef<string[]>([])
  const initedRef = useRef(false)

  const world = worldOf(worldId)
  const visibleScenes = scenesOf(worldId)
  const visibleFormulas = formulasOf(worldId)
  const visibleStyles = stylesOf(worldId)
  const scene = SCENES.find((s) => s.id === sceneId) ?? visibleScenes[0] ?? SCENES[0]!
  const formula = FORMULAS.find((f) => f.id === formulaId) ?? visibleFormulas[0] ?? FORMULAS[0]!
  const style = STYLES.find((s) => s.id === styleId) ?? visibleStyles[0] ?? STYLES[0]!
  const activeWork = works.find((w) => w.id === activeWorkId) ?? works[0] ?? null
  const longPlan = useMemo(
    () => planLongformSegmentDurations(Math.min(MAX_DRAMA_TOTAL_SEC, Math.max(5, durationSec))),
    [durationSec],
  )
  const showPreviewGate = needsPreviewGate(durationSec)

  const applyTemplate = useCallback((nextScene: DramaScene, nextFormula: DramaFormula, nextShop: ShopFill) => {
    setStory(fillTokens(nextFormula.story, nextScene, nextShop))
    setRoles(fillTokens(nextFormula.roles, nextScene, nextShop))
    setConflict(fillTokens(nextFormula.conflict, nextScene, nextShop))
    setDialogue(fillTokens(nextFormula.dialogue, nextScene, nextShop))
  }, [])

  const clearTrial = useCallback(() => {
    if (trialUrl) {
      URL.revokeObjectURL(trialUrl)
      previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== trialUrl)
    }
    setTrialUrl(null)
    setTrialReady(false)
  }, [trialUrl])

  const switchWorld = (nextWorldId: WorldId) => {
    const nextWorld = worldOf(nextWorldId)
    const nextScene = scenesOf(nextWorldId)[0]!
    const nextFormula = formulasOf(nextWorldId)[0]!
    setWorldId(nextWorldId)
    setSceneId(nextScene.id)
    setFormulaId(nextFormula.id)
    setStyleId(nextWorld.defaultStyle)
    clearTrial()
    applyTemplate(nextScene, nextFormula, shop)
  }

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    applyTemplate(SCENES[0]!, FORMULAS[0]!, { storeName: '', offerName: '', price: '', area: '' })
  }, [applyTemplate])

  const metaPrompt = useMemo(
    () =>
      buildBasePromptMeta({
        world,
        scene,
        formula,
        style,
        shop,
        story: story.trim() || fillTokens(formula.story, scene, shop),
        roles,
        conflict,
        dialogue,
      }),
    [world, scene, formula, style, shop, story, roles, conflict, dialogue],
  )

  const promptPreview = useMemo(() => {
    if (durationSec <= SEGMENT_UNIT_SEC) {
      return `${metaPrompt}\n时长约 ${durationSec} 秒，竖屏 9:16 单段直出。`
    }
    const beats = expandBeats(formula, longPlan.length)
    return [
      metaPrompt,
      `目标总时长 ${durationSec} 秒，按 ${segmentPlanLabel(durationSec)}。`,
      '衔接策略：上一段尾帧作为下一段首帧参考，同角色同场景连续运镜。',
      '分段任务：',
      ...beats.map((b, i) => `${i + 1}. ${longPlan[i] ?? SEGMENT_UNIT_SEC}秒 · ${b}`),
      showPreviewGate ? `先生成前 ${PREVIEW_SEC} 秒试镜，确认后再生成全片。` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }, [metaPrompt, durationSec, formula, longPlan, showPreviewGate])

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

  const runOneClip = async (opts: {
    prompt: string
    durationSec: number
    images_base64?: string[]
    onProgress?: (t: string) => void
  }) => {
    const flags = `--dur ${opts.durationSec} --fps 24 --ratio 9:16 --wm false --resolution ${resolution}`
    return runShortVideoJobWithFailover({
      engine: 'seedance',
      body: {
        prompt: sanitizePromptForSeedanceNativeAv(opts.prompt),
        flags,
        model: SEEDANCE_1_5_PRO_MODEL_ID,
        skip_qwen: true,
        lock_model: false,
        generate_audio: true,
        images_base64: opts.images_base64,
        seedance_image_mode: opts.images_base64?.length ? 'first_only' : 'auto',
      },
      poolModels: seedancePoolModels,
      shouldCancel: () => cancelRef.current,
      onProgress: opts.onProgress,
      allowAutoHalveDuration: false,
    })
  }

  const finishAsWork = async (opts: {
    billId: string
    videoUrlOrBlob: string | Blob
    title: string
    durationSec: number
    modelUsed?: string | null
  }) => {
    const blob =
      typeof opts.videoUrlOrBlob === 'string'
        ? await downloadVideoUrlAsBlob(opts.videoUrlOrBlob, { maxAttempts: 3 })
        : opts.videoUrlOrBlob
    const previewUrl = URL.createObjectURL(blob)
    previewUrlsRef.current.push(previewUrl)
    const work: DramaWork = {
      id: opts.billId,
      title: opts.title,
      sceneName: `${world.label} / ${scene.name}`,
      previewUrl,
      createdAt: Date.now(),
      durationSec: opts.durationSec,
    }
    setWorks((prev) => [work, ...prev])
    setActiveWorkId(work.id)
    setMainTab('works')
    clearTrial()
    const spendHint = await chargePoints(blob, opts.billId, opts.durationSec)
    setHint(
      [opts.modelUsed ? `已使用视频模型：${opts.modelUsed}` : '', spendHint].filter(Boolean).join(' ') ||
        '成片已生成，请及时保存到本地。',
    )
  }

  const generateFullLongform = async (billId: string) => {
    const total = Math.min(MAX_DRAMA_TOTAL_SEC, durationSec)
    const plan = planLongformSegmentDurations(total)
    const beats = expandBeats(formula, plan.length)
    const segmentUrls: string[] = []
    let prevUrl: string | null = null
    let lastModel: string | null = null

    for (let i = 0; i < plan.length; i++) {
      if (cancelRef.current) throw new Error('已取消长片生成')
      const segDur = plan[i]!
      setProgress(`全片 ${i + 1}/${plan.length} · ${segDur} 秒生成中`)
      let images: string[] | undefined
      if (i > 0 && prevUrl) {
        setProgress(`全片 ${i + 1}/${plan.length} · 截取上一段尾帧衔接`)
        const frame = await postVideoLastFrameFromUrl(prevUrl, { frame: 'last', timeoutMs: 20_000 })
        if (frame.ok) images = [frame.pureBase64]
      }
      const prompt = buildSegmentPrompt({
        meta: metaPrompt,
        beat: beats[i]!,
        index: i,
        total: plan.length,
        durationSec: segDur,
        continueFromPrev: i > 0,
      })
      const r = await runOneClip({
        prompt,
        durationSec: segDur,
        images_base64: images,
        onProgress: (t) => {
          if (mountedRef.current) setProgress(`全片 ${i + 1}/${plan.length} · ${t}`)
        },
      })
      if (!r.ok) throw new Error(formatVideoAiUserError(r.message))
      segmentUrls.push(r.videoUrl)
      prevUrl = r.videoUrl
      lastModel = r.modelUsed ?? lastModel
    }

    setProgress(`正在云端无缝拼接 ${segmentUrls.length} 段…`)
    const blob = await concatVideoUrlsOnServer(segmentUrls, { ratio: '9:16', fps: 24 })
    await finishAsWork({
      billId,
      videoUrlOrBlob: blob,
      title: shop.storeName.trim() || story.trim().slice(0, 18) || scene.name,
      durationSec: total,
      modelUsed: lastModel,
    })
  }

  const submitPreviewOrShort = async () => {
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
    const chargeSec = showPreviewGate ? PREVIEW_SEC : durationSec
    setBusy(true)
    setProgress('正在检查积分与引擎')
    const afford = await checkMpAddonPointsAffordable('shortvideo', chargeSec)
    if (!afford.ok) {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
        setErr(afford.message)
      }
      return
    }

    try {
      if (!showPreviewGate) {
        setProgress('正在提交短剧生成')
        const prompt = `${metaPrompt}\n时长约 ${durationSec} 秒，竖屏 9:16 单段直出。结构：${formula.beats.join(' → ')}。`
        const r = await runOneClip({
          prompt,
          durationSec,
          onProgress: (t) => {
            if (mountedRef.current) setProgress(t)
          },
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
        await finishAsWork({
          billId,
          videoUrlOrBlob: r.videoUrl,
          title: shop.storeName.trim() || story.trim().slice(0, 18) || scene.name,
          durationSec,
          modelUsed: r.modelUsed,
        })
        return
      }

      // 长片：先 5 秒试镜
      clearTrial()
      setProgress(`长片试镜：先生成前 ${PREVIEW_SEC} 秒，确认后再出全片`)
      const previewPrompt = buildSegmentPrompt({
        meta: metaPrompt,
        beat: formula.beats[0]!,
        index: 0,
        total: longPlan.length,
        durationSec: PREVIEW_SEC,
        continueFromPrev: false,
      })
      const r = await runOneClip({
        prompt: previewPrompt,
        durationSec: PREVIEW_SEC,
        onProgress: (t) => {
          if (mountedRef.current) setProgress(`试镜 · ${t}`)
        },
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (cancelRef.current) {
        setHint('已停止等待。')
        return
      }
      setProgress('正在拉取试镜…')
      const blob = await downloadVideoUrlAsBlob(r.videoUrl, { maxAttempts: 3 })
      // 试镜也扣积分（按时长），避免白嫖长片预览
      const spendHint = await chargePoints(blob, `${billId}:trial`, PREVIEW_SEC)
      const url = URL.createObjectURL(blob)
      previewUrlsRef.current.push(url)
      setTrialUrl(url)
      setTrialReady(true)
      setHint(
        [
          `试镜 ${PREVIEW_SEC} 秒已出。满意再点「确认生成全片」（${segmentPlanLabel(durationSec)}）。`,
          '分段靠尾帧续写衔接，人物/场景一致性会更好，但不能保证电影级零缝。',
          spendHint,
        ]
          .filter(Boolean)
          .join(' '),
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

  const confirmFullGenerate = async () => {
    if (!requireAiVideoGen()) return
    if (!trialReady) {
      setErr('请先生成前 5 秒试镜并确认。')
      return
    }
    if (gateReason && !busy) {
      // busy false but gate may say busy - skip
    }
    if (!story.trim()) {
      setErr('请先确认一句话故事。')
      return
    }
    setErr(null)
    cancelRef.current = false
    const billId = newWorkId()
    setBusy(true)
    setProgress('正在检查全片积分')
    const afford = await checkMpAddonPointsAffordable('shortvideo', durationSec)
    if (!afford.ok) {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
        setErr(afford.message)
      }
      return
    }
    try {
      await generateFullLongform(billId)
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
  const phoneSrc = trialUrl || activeWork?.previewUrl || null

  return (
    <div className="short-drama-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="erp-page-title">AI短剧</h1>
          <MpAddonPointsRateBadge kind="shortvideo" className="mt-2" />
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {world.blurb}
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
            {WORLDS.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={busy}
                onClick={() => switchWorld(w.id)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-sm transition',
                  worldId === w.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                    clearTrial()
                    applyTemplate(s, formula, shop)
                  }}
                  className={cn(
                    'rounded-2xl border bg-white p-3 text-left transition active:scale-[0.99]',
                    on
                      ? 'border-cyan-600 bg-cyan-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  <p className="mt-2 text-sm font-medium text-slate-900">{s.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{s.hook}</p>
                </button>
              )
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <section className="erp-panel space-y-5 p-5">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-800">
                  {worldId === 'comic' ? '分格钩子' : worldId === 'tech' ? '产品钩子' : '戏剧钩子'}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visibleFormulas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setFormulaId(f.id)
                        clearTrial()
                        applyTemplate(scene, f, shop)
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
                {world.fields.map((f) => (
                  <label key={f.key} className="space-y-1.5">
                    <span className="text-sm font-medium text-slate-800">{f.label}</span>
                    <input
                      className={fieldCls}
                      disabled={busy}
                      value={shop[f.key]}
                      onChange={(e) => {
                        clearTrial()
                        setShop((p) => ({ ...p, [f.key]: e.target.value }))
                      }}
                      placeholder={f.placeholder}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  clearTrial()
                  applyTemplate(scene, formula, shop)
                }}
                className="text-sm font-medium text-cyan-800 hover:text-cyan-950"
              >
                {world.refill}
              </button>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">一句话故事</span>
                <textarea
                  className={cn(fieldCls, 'min-h-[84px] resize-y')}
                  disabled={busy}
                  value={story}
                  onChange={(e) => {
                    clearTrial()
                    setStory(e.target.value)
                  }}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">
                    {worldId === 'comic' ? '人设' : '角色'}
                  </span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={roles}
                    onChange={(e) => {
                      clearTrial()
                      setRoles(e.target.value)
                    }}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">对白钩子</span>
                  <input
                    className={fieldCls}
                    disabled={busy}
                    value={dialogue}
                    onChange={(e) => {
                      clearTrial()
                      setDialogue(e.target.value)
                    }}
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">核心冲突</span>
                <input
                  className={fieldCls}
                  disabled={busy}
                  value={conflict}
                  onChange={(e) => {
                    clearTrial()
                    setConflict(e.target.value)
                  }}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <label className="min-w-[140px] flex-1 space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">成片时长</span>
                  <select
                    className={fieldCls}
                    disabled={busy}
                    value={durationSec}
                    onChange={(e) => {
                      clearTrial()
                      setDurationSec(Number(e.target.value))
                    }}
                  >
                    {DURATION_OPTIONS.map((o) => (
                      <option key={o.sec} value={o.sec}>
                        {o.label}（{o.hint}）
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-slate-500">
                    单段模型最长约 15 秒（Seedance 2.5 可达约 30 秒）。超过则按 15 秒分段 + 尾帧续写拼接，最长支持 15
                    分钟。小云雀 Agent 也是「多段分镜合成」而不是一次吐出整集。
                  </span>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">画风</span>
                  <select
                    className={fieldCls}
                    disabled={busy}
                    value={visibleStyles.some((s) => s.id === styleId) ? styleId : world.defaultStyle}
                    onChange={(e) => {
                      clearTrial()
                      setStyleId(e.target.value as StyleId)
                    }}
                  >
                    {visibleStyles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
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
                    {phoneSrc ? (
                      <video key={phoneSrc} src={phoneSrc} controls playsInline className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col justify-end bg-slate-800 p-4 text-slate-100">
                        <SceneIcon className="mb-auto mt-8 h-7 w-7 text-slate-400" />
                        <p className="text-xs text-slate-400">{world.label}</p>
                        <p className="mt-1 text-lg font-semibold">{scene.name}</p>
                        <p className="mt-1 text-xs text-slate-300">{formula.name}</p>
                        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{scene.mustSee}</p>
                      </div>
                    )}
                  </div>
                </div>
                {trialReady ? (
                  <p className="mt-2 text-center text-xs font-medium text-cyan-800">试镜已就绪 · 请确认后再生成全片</p>
                ) : null}
              </div>

              <ol className="grid grid-cols-4 gap-1">
                {formula.beats.map((beat, i) => (
                  <li
                    key={`${formula.id}-${beat}`}
                    className="rounded-lg bg-slate-800 px-1.5 py-2 text-center text-[10px] leading-snug text-slate-100"
                  >
                    <span className="block text-cyan-300">{i + 1}</span>
                    {beat}
                  </li>
                ))}
              </ol>

              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                {showPreviewGate
                  ? `当前 ${DURATION_OPTIONS.find((d) => d.sec === durationSec)?.label ?? durationSec} · ${segmentPlanLabel(durationSec)}。先出前 ${PREVIEW_SEC} 秒试镜，满意再生成全片。尾帧续写可改善衔接，仍可能有轻微跳切。`
                  : '当前为单段直出，无需试镜确认。'}
              </p>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                生成后请及时保存到本地。刷新页面后，本页成片将消失。长片按秒扣积分，15 分钟成本很高，请先确认试镜。
              </p>
              {progress ? <p className="text-sm text-cyan-800">{progress}</p> : null}
              {hint ? <p className="text-sm text-slate-600">{hint}</p> : null}
              {err ? <p className="text-sm text-rose-700">{err}</p> : null}

              <div className="flex flex-wrap gap-2">
                {!trialReady ? (
                  <button
                    type="button"
                    disabled={!!gateReason}
                    onClick={() => void submitPreviewOrShort()}
                    className="erp-btn-primary min-w-[140px]"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                    {busy ? '生成中' : showPreviewGate ? `先出前 ${PREVIEW_SEC} 秒试镜` : '生成短剧'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void confirmFullGenerate()}
                      className="erp-btn-primary min-w-[140px]"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {busy ? '全片生成中' : `确认生成全片（${DURATION_OPTIONS.find((d) => d.sec === durationSec)?.label ?? `${durationSec}s`}）`}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        clearTrial()
                        setHint('已丢弃试镜，可改剧本后重新试镜。')
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600"
                    >
                      重做试镜
                    </button>
                  </>
                )}
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
              还没有成片。先选分类和场景，再生成。
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
                      <p className="text-[11px] text-slate-500">
                        {w.sceneName} · {w.durationSec >= 60 ? `${Math.round(w.durationSec / 60)} 分钟` : `${w.durationSec} 秒`}
                      </p>
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
