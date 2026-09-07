import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  BookOpen,
  Building2,
  Car,
  Coffee,
  Cpu,
  Download,
  Dumbbell,
  Film,
  Flame,
  Flower2,
  GraduationCap,
  Heart,
  Hotel,
  Loader2,
  Monitor,
  PawPrint,
  Scissors,
  Smartphone,
  Smile,
  Soup,
  Sparkles,
  Swords,
  Trash2,
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

type WorldId = 'catering' | 'leisure' | 'tech' | 'drama' | 'comic'
type StyleId = 'smoke' | 'neon' | 'fresh' | 'cinema' | 'quiet' | 'product' | 'live' | 'cel' | 'ink' | 'webtoon'
type MainTab = 'create' | 'works'
type DurationSec = 8 | 12 | 15
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
}

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
    blurb: '火锅、烧烤、茶饮这些到店场景。钩子围着菜单、价格和第一口转。',
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
    blurb: '美业、健身、亲子、酒旅。钩子围着体验反差和预约转。',
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
    blurb: '数码、智能家居、软件演示。钩子围着开箱翻车和功能打脸转。',
    refill: '用当前产品重填剧本',
    defaultStyle: 'product',
    promptKind: 'product',
    fields: [
      { key: 'storeName', label: '品牌 / 产品', placeholder: '例：某品牌降噪耳机' },
      { key: 'offerName', label: '核心卖点', placeholder: '例：通勤降噪 40dB' },
      { key: 'price', label: '价格档', placeholder: '例：399 档' },
      { key: 'area', label: '使用场景', placeholder: '例：地铁通勤 / 桌面办公' },
    ],
  },
  {
    id: 'drama',
    label: '短剧',
    blurb: '职场、情感、悬疑。钩子围着人物关系和前三秒反转转。',
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
    blurb: '校园、古风、条漫。画面走二维分格，不要拍成真人探店。',
    refill: '用当前人设重填剧本',
    defaultStyle: 'cel',
    promptKind: 'comic',
    fields: [
      { key: 'storeName', label: '作品名', placeholder: '例：放学后的秘密' },
      { key: 'offerName', label: '主角人设', placeholder: '例：黑发高中生 / 冷面同桌' },
      { key: 'price', label: '分格风格', placeholder: '例：四格搞笑 / 竖屏条漫' },
      { key: 'area', label: '世界观', placeholder: '例：现代校园 / 古风门派' },
    ],
  },
]

const SCENES: DramaScene[] = [
  { id: 'hotpot', world: 'catering', name: '火锅局', hook: '红油翻滚，熟人局开场就吵', mustSee: '红油翻滚、蒸汽、涮菜入锅、举杯', visual: '暖实用光，铜锅特写，蒸汽迎面，跟拍涮菜，烟火气写实', icon: Flame },
  { id: 'bbq', world: 'catering', name: '烧烤夜宵', hook: '炭火滋滋，夜市才刚开始', mustSee: '炭火、刷酱翻串、油光、夜色街灯', visual: '夜市路灯，炭火火星，刷酱滋滋，跟拍咬一口', icon: Flame },
  { id: 'tea', world: 'catering', name: '茶饮咖啡', hook: '第一口决定会不会发朋友圈', mustSee: '杯身、原料、拉花或珍珠，第一口特写', visual: '自然光浅景深，杯壁水珠，制作闪切，第一口反应', icon: Coffee },
  { id: 'noodles', world: 'catering', name: '面馆拉面', hook: '出锅那一秒必须拉丝', mustSee: '出锅、拉面或浇头、热气、大口吸面', visual: '后厨出锅热气，面条拉丝，汤面特写', icon: Soup },
  { id: 'home_cook', world: 'catering', name: '家常正餐', hook: '招牌菜上桌，话筒递给第一口', mustSee: '装盘、家常硬菜、围桌', visual: '圆桌硬菜特写，装盘动作，真实聚餐', icon: UtensilsCrossed },
  { id: 'bakery', world: 'catering', name: '烘焙甜品', hook: '切开断面比海报好看', mustSee: '切开拉丝或夹心、裱花、第一口', visual: '奶油拉丝，断面特写，橱窗自然光', icon: Coffee },
  { id: 'hair', world: 'leisure', name: '美发造型', hook: '镜子一转，前后不是同一个人', mustSee: '镜子、剪发或吹风、前后对比', visual: '干净镜面，剪发跟拍，吹风定型', icon: Scissors },
  { id: 'nail', world: 'leisure', name: '美甲美睫', hook: '特写比整张脸更有说服力', mustSee: '色板、微距完成面、灯光下闪光', visual: '微距完成面，干净台面，缓慢环绕', icon: Sparkles },
  { id: 'skin', world: 'leisure', name: '皮肤管理', hook: '仪器贴上脸的那一秒最安静', mustSee: '干净床位、仪器或手法、肤感特写', visual: '通透白光，干净床品，仪器贴肤', icon: Sparkles },
  { id: 'gym', world: 'leisure', name: '健身瑜伽', hook: '动作比口号更像广告', mustSee: '训练动作、汗水、教练指导', visual: '跟拍训练，慢动作发力，汗水特写', icon: Dumbbell },
  { id: 'kids', world: 'leisure', name: '亲子乐园', hook: '孩子笑了，家长才会下单', mustSee: '孩子玩耍、家长旁观、明亮安全场地', visual: '明亮场地，孩子玩耍跟拍，家长安心表情', icon: Baby },
  { id: 'pet', world: 'leisure', name: '宠物友好', hook: '萌宠特写先抢走前三秒', mustSee: '萌宠脸部特写、互动、店内环境', visual: '浅景深萌宠特写，轻抚互动，店内暖光', icon: PawPrint },
  { id: 'spa', world: 'leisure', name: '足浴按摩', hook: '进门肩膀就卸下来', mustSee: '足浴盆或床位、手法、昏光放松', visual: '昏暖灯光，洁净木纹，手法特写', icon: Wine },
  { id: 'hotel', world: 'leisure', name: '酒店民宿', hook: '推开门那一帧决定订不订', mustSee: '推开门、床品、窗景', visual: '缓慢推轨，推开门，床品与窗景', icon: Hotel },
  { id: 'ktv', world: 'leisure', name: 'KTV 酒吧', hook: '第一首歌把气氛掀起来', mustSee: '包厢灯光、麦克风、举杯', visual: '包厢彩光克制使用，人物表情，跟拍唱歌', icon: Wine },
  { id: 'flower', world: 'leisure', name: '鲜花礼品', hook: '拆纸的声音就能留人', mustSee: '花束、包装纸、递出', visual: '自然光花材特写，包装纸展开', icon: Flower2 },
  { id: 'edu', world: 'leisure', name: '兴趣课堂', hook: '孩子举手的那帧最能转化', mustSee: '课堂互动、作品或黑板', visual: '明亮教室，举手互动，作品特写', icon: GraduationCap },
  { id: 'phone', world: 'tech', name: '数码开箱', hook: '拆封比参数更有戏', mustSee: '包装拆封、机身特写、第一下上手', visual: '干净桌面俯拍，拆封跟手，产品材质特写', icon: Smartphone },
  { id: 'smarthome', world: 'tech', name: '智能家居', hook: '一句话灯就亮了', mustSee: '开关灯、面板或音箱、生活场景', visual: '现代客厅，语音或App触发，灯光变化', icon: Cpu },
  { id: 'gadget', world: 'tech', name: '桌面配件', hook: '桌面一换，效率跟着换', mustSee: '桌面布置、配件特写、使用动作', visual: '冷色桌面，键帽或支架特写，手部操作', icon: Monitor },
  { id: 'ev', world: 'tech', name: '出行科技', hook: '关门那一声就要高级', mustSee: '车门或仪表、座舱、起步', visual: '车身线条与座舱屏幕，克制夜景，禁止撞车特效', icon: Car },
  { id: 'saas', world: 'tech', name: '软件演示', hook: '屏幕里的结果当场打脸质疑', mustSee: '屏幕界面、操作手、前后结果对比', visual: '过肩拍摄屏幕，光标操作，结果弹出，禁止乱码界面', icon: Monitor },
  { id: 'ai_office', world: 'tech', name: '办公 AI', hook: '加班到一半被工具救了', mustSee: '加班工位、屏幕生成、表情变化', visual: '夜晚办公室台灯，屏幕内容清晰，人物反应', icon: Cpu },
  { id: 'workplace', world: 'drama', name: '职场打脸', hook: '被压的人手里还有后手', mustSee: '办公室对峙、文件或屏幕证据、表情反转', visual: '当代都市办公室，人物表情清晰，跟拍对峙', icon: Building2 },
  { id: 'romance', world: 'drama', name: '情感悬念', hook: '一句对白把关系掀翻', mustSee: '两人近景、关键对白口型、停顿', visual: '都市夜色或室内暖光，情绪特写，连续运镜', icon: Heart },
  { id: 'family', world: 'drama', name: '家庭伦理', hook: '饭桌上那句话不能收回', mustSee: '餐桌、家人对视、沉默', visual: '家常餐厅灯光，人物关系清楚，克制写实', icon: UtensilsCrossed },
  { id: 'suspense', world: 'drama', name: '悬疑钩子', hook: '开门的瞬间先别出声', mustSee: '门缝或走廊、惊觉表情、定格', visual: '冷色走廊，浅景深，突然停镜，禁止鬼片跳吓堆砌', icon: Film },
  { id: 'sweet', world: 'drama', name: '甜宠误会', hook: '先吵，再被一件小事砸中', mustSee: '误会争执、物件线索、改口', visual: '日系清透都市，笑容与停顿，节奏轻快', icon: Heart },
  { id: 'teaser', world: 'drama', name: '下集预告', hook: '高潮切黑，只留一句', mustSee: '高潮碎片、突然切黑、旁白', visual: '快切高潮碎片，切黑前定格，禁止片尾演职员表', icon: Film },
  { id: 'school', world: 'comic', name: '校园日常', hook: '放学铃一响就开始不对劲', mustSee: '教室或校门口、角色大特写、分格切换', visual: '日漫校园，赛璐珞上色，清晰分格，人物眼睛有高光', icon: BookOpen },
  { id: 'xianxia', world: 'comic', name: '古风仙侠', hook: '剑还没出鞘，气势先到', mustSee: '古装角色、兵器或符咒、广袖动态', visual: '国漫古风，飘带与剑气，二维厚涂，禁止真人古装剧质感', icon: Wand2 },
  { id: 'urban_power', world: 'comic', name: '都市异能', hook: '地铁里忽然不是同一世界', mustSee: '现代都市+异能特效、角色变装', visual: '都市漫画，克制光效，角色一致，二维渲染', icon: Sparkles },
  { id: 'gag', world: 'comic', name: '搞笑条漫', hook: '第三格必须打脸', mustSee: '四格或条漫分格、夸张表情', visual: '四格漫画，简练线条，表情夸张，竖屏条漫阅读方向', icon: Smile },
  { id: 'battle', world: 'comic', name: '战斗高潮', hook: '出招那一帧要停得住', mustSee: '出招动态、冲击线、对手反应', visual: '漫画速度线与冲击波，动态pose，二维原画感', icon: Swords },
  { id: 'comic_sweet', world: 'comic', name: '甜宠漫画', hook: '对视比告白更有杀伤力', mustSee: '角色近景、脸红或心跳符号、分格留白', visual: '韩漫清透上色，大眼睛近景，粉彩克制，二维', icon: Heart },
]

const FORMULAS: DramaFormula[] = [
  { id: 'c_hidden', world: 'catering', name: '隐藏菜单', hint: '熟客才知道的那一道', beats: ['熟客把人往里拉', '普通菜单被揭穿', '隐藏招牌亮相', '悬念定格'], story: '熟客把人拉进{品类}后场，说普通菜单都是给人看的。', roles: '本地熟客 / 第一次来的客人 / 店员', conflict: '客人点了明面上的招牌，熟客当场拦住，改上{卖点}。', dialogue: '这道{卖点}，菜单上没有。' },
  { id: 'c_price', world: 'catering', name: '价格误会', hint: '以为被宰，结账打脸', beats: ['看见价格愣住', '差点转身离开', '结账真相落地', '团购记忆点'], story: '客人在{店名}看见{价格}以为被宰，结账才发现是团购。', roles: '精打细算的客人 / 收银店员', conflict: '差点转身离开，店员把团购码推到眼前。', dialogue: '你看的是原价。{价格}，现在就能核。' },
  { id: 'c_queue', world: 'catering', name: '排队反转', hint: '以为关店，推门爆满', beats: ['门口冷清误会', '推门发现满座', '第一口改口', '位置号召'], story: '路过{位置}以为{店名}倒闭了，推门却是满座。', roles: '路过的两人 / 迎宾', conflict: '门外冷清是错觉，里面在等位。', dialogue: '别看门口没人，里面位置都是抢的。' },
  { id: 'c_boss', world: 'catering', name: '老板出手', hint: '被嫌弃后亲自上阵', beats: ['被当众看轻', '老板挽袖出手', '成品打脸', '店名收尾'], story: '有人当众嫌{店名}不起眼，老板挽袖亲自做{卖点}。', roles: '嘴碎客人 / 老板', conflict: '被看轻之后，老板用成品打脸。', dialogue: '你再尝尝这口{卖点}。' },
  { id: 'c_date', world: 'catering', name: '约会翻车', hint: '踩雷开场，第一口改口', beats: ['约会选错地方', '第一口翻车预期', '味道打脸', '安利到店'], story: '约会选到{店名}，对方先皱眉，第一口{卖点}直接改口。', roles: '约会两人', conflict: '开场踩雷预期，味道把气氛救回来。', dialogue: '我刚才收回那句。我们下次还来。' },
  { id: 'c_flash', world: 'catering', name: '今晚限量', hint: '卖完就收，制造紧迫', beats: ['只剩最后几份', '制作特写', '抢到的人反应', '倒计时到店'], story: '{店名}今晚{卖点}只做限定份，卖完就收。', roles: '店员 / 赶来的客人', conflict: '只剩最后几份，门口还有人在问。', dialogue: '就这些了，明天不一定有。' },
  { id: 'l_before', world: 'leisure', name: '前后对比', hint: '进门和出门不是同一个人', beats: ['进店状态', '过程闪切', '完成面亮相', '预约号召'], story: '客人带着将就的状态走进{店名}，做完{卖点}出门被拦下来问地址。', roles: '客人 / 老师或技师', conflict: '开始觉得没必要，结束时主动加预约。', dialogue: '刚才那是你？我要预约同款{卖点}。' },
  { id: 'l_queue', world: 'leisure', name: '预约打脸', hint: '以为随时能进，其实要排队', beats: ['直接上门', '被告知要预约', '体验一眼种草', '马上预约'], story: '路过{位置}想进{店名}即做{卖点}，前台说今天已满。', roles: '路过客人 / 前台', conflict: '即到即做的预期被预约制打脸。', dialogue: '今天{卖点}已经排满，我帮你约最早的。' },
  { id: 'l_date', world: 'leisure', name: '约会翻车', hint: '选错项目，体验把气氛救回来', beats: ['选错预期', '体验开始别扭', '效果打脸', '下次还来'], story: '约会选到{店名}的{卖点}，对方先皱眉，体验结束后改口。', roles: '约会两人', conflict: '项目看起来不适合，实际体验相反。', dialogue: '行，下次还来这家。' },
  { id: 'l_flash', world: 'leisure', name: '体验限时', hint: '名额有限，错过再等', beats: ['名额提示', '体验片段', '抢到的人反应', '倒计时预约'], story: '{店名}的{卖点}今晚只放{价格}体验名额。', roles: '顾问 / 赶来的客人', conflict: '名额见底，门口还有人在问。', dialogue: '就这些名额了，明天恢复原价。' },
  { id: 'l_boss', world: 'leisure', name: '老师出手', hint: '被看轻后亲自做示范', beats: ['被当众看轻', '老师上手', '效果打脸', '店名收尾'], story: '有人嫌{店名}普通，老师亲自上手做{卖点}。', roles: '挑事客人 / 老师', conflict: '被看轻之后用完成面打脸。', dialogue: '你再看看这版{卖点}。' },
  { id: 't_unbox', world: 'tech', name: '开箱翻车', hint: '先嫌弃包装，上手打脸', beats: ['拆开先皱眉', '以为不值这个价', '功能亮相', '改口安利'], story: '开箱{店名}，先嫌弃包装，上手{卖点}之后立刻改口。', roles: '测评的人 / 旁边吐槽的朋友', conflict: '价格档看起来不匹配，体验相反。', dialogue: '{价格}能做成这样？我收回刚才那句。' },
  { id: 't_spec', world: 'tech', name: '参数打脸', hint: '口头参数打不过现场一试', beats: ['口头质疑参数', '现场演示', '结果弹出', '使用场景定格'], story: '有人说{店名}的{卖点}是宣传，当场在{位置}演示打脸。', roles: '质疑者 / 演示者', conflict: '口头不信，屏幕或实物结果说话。', dialogue: '你自己看，这就是{卖点}。' },
  { id: 't_commute', world: 'tech', name: '场景救命', hint: '最吵的时候它才出现', beats: ['场景噪音或混乱', '掏出产品', '一瞬间变静/变顺', '记忆点'], story: '在{位置}快被打断时，{店名}的{卖点}把局面救回来。', roles: '通勤或办公的人', conflict: '环境已经崩了，产品把节奏拉回来。', dialogue: '就靠这个{卖点}撑过这一段。' },
  { id: 't_launch', world: 'tech', name: '发布钩子', hint: '倒计时，先看一眼核心', beats: ['倒计时', '核心功能特写', '一句卖点', '行动号召'], story: '{店名}今晚揭晓，先看一眼{卖点}。', roles: '发布者 / 围观的人', conflict: '信息只给一口，逼着看完。', dialogue: '{卖点}，{价格}，今晚截止。' },
  { id: 't_office', world: 'tech', name: '加班被救', hint: '通宵前被工具截胡', beats: ['截止日期压过来', '旧方法崩了', '产品出结果', '人松一口气'], story: '截止日期前{位置}里的人快崩了，{店名}用{卖点}直接出结果。', roles: '加班的人 / 同事', conflict: '人手不够，工具把结果提前交出来。', dialogue: '你早点拿出来，我至于熬到现在？' },
  { id: 'd_hook', world: 'drama', name: '冲突钩子', hint: '前三秒必须出事', beats: ['角色亮相', '意外砸下来', '情绪顶点', '悬念定格'], story: '{店名}：{卖点}正面碰上，前三秒必须出事。', roles: '{卖点}', conflict: '{价格}', dialogue: '你以为这就结束了？' },
  { id: 'd_twist', world: 'drama', name: '反转开场', hint: '先以为是 A，立刻打脸成 B', beats: ['误导开场', '打脸反转', '真相落地', '一句钩子'], story: '{店名}开场全是误导，三秒后身份或关系翻过来。', roles: '{卖点}', conflict: '观众以为站对边了。', dialogue: '你认错人了。' },
  { id: 'd_work', world: 'drama', name: '职场翻盘', hint: '被压的人当场摊牌', beats: ['被当众压', '证据亮相', '当场翻盘', '身份反差'], story: '{时代}办公室里，{卖点}被当众看轻，{价格}被摊到桌上。', roles: '{卖点}', conflict: '{价格}', dialogue: '这份东西，你看完再说话。' },
  { id: 'd_love', world: 'drama', name: '情感掀翻', hint: '一句对白把关系掀翻', beats: ['亲密或冷战', '关键对白', '情绪决堤', '未说完'], story: '{店名}里两人本来还能装，{卖点}被一句对白掀翻。', roles: '{卖点}', conflict: '{价格}', dialogue: '你刚才说的，再重复一遍。' },
  { id: 'd_teaser', world: 'drama', name: '下集预告', hint: '高潮切黑，只留一句', beats: ['高潮碎片', '最大冲突', '突然切黑', '旁白预告'], story: '{店名}本集不给结局，{价格}留到下一秒。', roles: '{卖点}', conflict: '观众以为要揭晓。', dialogue: '下一秒，你不会想错过。' },
  { id: 'm_panel', world: 'comic', name: '分格钩子', hint: '第三格必须反转', beats: ['第一格铺垫', '第二格加码', '第三格打脸', '第四格定格'], story: '{店名}用{价格}讲{卖点}，第三格必须反转。', roles: '{卖点}', conflict: '读者以为走向日常。', dialogue: '你以为放学就结束了？' },
  { id: 'm_gag', world: 'comic', name: '搞笑打脸', hint: '表情比台词更狠', beats: ['正经开场', '动作走偏', '表情崩掉', '吐槽定格'], story: '{卖点}在{位置}里想装酷，结果当场翻车。', roles: '{卖点}', conflict: '人设撑不住动作。', dialogue: '……当我没说。' },
  { id: 'm_ink', world: 'comic', name: '气势一格', hint: '不出手，气势先到', beats: ['对峙远景', '特写眼睛', '气势铺开', '出招或收势'], story: '{店名}里{卖点}还没出手，气场已经压过去。', roles: '{卖点}', conflict: '对手先慌。', dialogue: '你先走一步。' },
  { id: 'm_color', world: 'comic', name: '变装揭示', hint: '一格换装，身份翻面', beats: ['日常伪装', '触发条件', '变装揭示', '新身份定格'], story: '{位置}里的{卖点}被触发，一格换装身份翻面。', roles: '{卖点}', conflict: '伪装被当场揭开。', dialogue: '现在，认清我。' },
  { id: 'm_cliff', world: 'comic', name: '条漫悬念', hint: '最后一格切黑', beats: ['推进剧情', '线索特写', '冲突顶格', '切黑留白'], story: '{店名}这一话不给答案，{价格}停在最后一格。', roles: '{卖点}', conflict: '读者以为要揭晓。', dialogue: '未完。' },
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

const DURATION_OPTIONS: DurationSec[] = [8, 12, 15]

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

function beatTimings(durationSec: number): [string, string, string, string] {
  if (durationSec <= 8) return ['0-2秒', '2-4秒', '4-6秒', '6-8秒']
  if (durationSec <= 12) return ['0-3秒', '3-6秒', '6-9秒', '9-12秒']
  return ['0-4秒', '4-8秒', '8-12秒', '12-15秒']
}

function buildDramaPrompt(input: {
  world: (typeof WORLDS)[number]
  scene: DramaScene
  formula: DramaFormula
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
  const infoBits = input.world.fields
    .map((f) => {
      const v = input.shop[f.key].trim()
      return v ? `${f.label}「${v}」` : ''
    })
    .filter(Boolean)
    .join('，')

  const kindLine =
    input.world.promptKind === 'comic'
      ? `二维漫画/动画竖屏短剧，${input.durationSec} 秒，分格阅读感，禁止真人实拍质感，禁止餐饮探店。`
      : input.world.promptKind === 'drama'
        ? `真人写实都市短剧，${input.durationSec} 秒一条过，前 3 秒必须冲突或反转。禁止二维漫画，禁止探店空镜堆砌。`
        : input.world.promptKind === 'product'
          ? `科技产品短剧，${input.durationSec} 秒一条过，产品特写必须可读。禁止仙侠，禁止纯餐饮烟雾。`
          : `本地生活真人写实竖屏短剧，${input.durationSec} 秒一条过，前 3 秒必须冲突或反转。禁止办公室网文，禁止仙侠古装。`

  const closing =
    input.world.promptKind === 'shop'
      ? '结尾用店名或位置做到店号召。'
      : input.world.promptKind === 'product'
        ? '结尾留产品名或下单记忆点。'
        : input.world.promptKind === 'comic'
          ? '结尾停在分格悬念，禁止电影片尾演职员表。'
          : '结尾悬念定格，禁止电影片头片尾。'

  return [
    `【AI短剧·${input.world.label}·${input.scene.name}·${input.formula.name}】`,
    kindLine,
    `画风：${input.style.visual}。`,
    `画面必须出现：${input.scene.mustSee}。${input.scene.visual}。`,
    infoBits ? `创作信息：${infoBits}。${closing}` : closing,
    `主题：${input.story.trim()}`,
    input.roles.trim() ? `角色：${input.roles.trim()}。` : '',
    input.conflict.trim() ? `核心冲突：${input.conflict.trim()}。` : '',
    quoted,
    `分镜节奏：\n${beats}`,
    '运镜跟拍，禁止拖沓空镜，禁止大面积海报字幕。口播与对白短、口语。',
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

  const world = worldOf(worldId)
  const visibleScenes = scenesOf(worldId)
  const visibleFormulas = formulasOf(worldId)
  const visibleStyles = stylesOf(worldId)
  const scene = SCENES.find((s) => s.id === sceneId) ?? visibleScenes[0] ?? SCENES[0]!
  const formula = FORMULAS.find((f) => f.id === formulaId) ?? visibleFormulas[0] ?? FORMULAS[0]!
  const style = STYLES.find((s) => s.id === styleId) ?? visibleStyles[0] ?? STYLES[0]!
  const activeWork = works.find((w) => w.id === activeWorkId) ?? works[0] ?? null
  const times = beatTimings(durationSec)

  const applyTemplate = useCallback((nextScene: DramaScene, nextFormula: DramaFormula, nextShop: ShopFill) => {
    setStory(fillTokens(nextFormula.story, nextScene, nextShop))
    setRoles(fillTokens(nextFormula.roles, nextScene, nextShop))
    setConflict(fillTokens(nextFormula.conflict, nextScene, nextShop))
    setDialogue(fillTokens(nextFormula.dialogue, nextScene, nextShop))
  }, [])

  const switchWorld = (nextWorldId: WorldId) => {
    const nextWorld = worldOf(nextWorldId)
    const nextScene = scenesOf(nextWorldId)[0]!
    const nextFormula = formulasOf(nextWorldId)[0]!
    setWorldId(nextWorldId)
    setSceneId(nextScene.id)
    setFormulaId(nextFormula.id)
    setStyleId(nextWorld.defaultStyle)
    applyTemplate(nextScene, nextFormula, shop)
  }

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    applyTemplate(SCENES[0]!, FORMULAS[0]!, { storeName: '', offerName: '', price: '', area: '' })
  }, [applyTemplate])

  const promptPreview = useMemo(
    () =>
      buildDramaPrompt({
        world,
        scene,
        formula,
        style,
        shop,
        story: story.trim() || fillTokens(formula.story, scene, shop),
        roles,
        conflict,
        dialogue,
        durationSec,
      }),
    [world, scene, formula, style, shop, story, roles, conflict, dialogue, durationSec],
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
        world,
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
        sceneName: `${world.label} / ${scene.name}`,
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
                      onChange={(e) => setShop((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => applyTemplate(scene, formula, shop)}
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
                  onChange={(e) => setStory(e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-800">
                    {worldId === 'comic' ? '人设' : '角色'}
                  </span>
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
                    value={visibleStyles.some((s) => s.id === styleId) ? styleId : world.defaultStyle}
                    onChange={(e) => setStyleId(e.target.value as StyleId)}
                  >
                    {visibleStyles.map((s) => (
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
              </div>

              <ol className="grid grid-cols-4 gap-1">
                {formula.beats.map((beat, i) => (
                  <li
                    key={`${formula.id}-${beat}`}
                    className="rounded-lg bg-slate-800 px-1.5 py-2 text-center text-[10px] leading-snug text-slate-100"
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
