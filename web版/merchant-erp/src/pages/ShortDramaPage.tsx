import type { LucideIcon } from 'lucide-react'
import {
  Baby,
  BookOpen,
  Building2,
  Camera,
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
  Gift,
  GraduationCap,
  Heart,
  Home,
  Hotel,
  Loader2,
  Map,
  Mic2,
  Monitor,
  Mountain,
  PawPrint,
  Plane,
  Radio,
  Scissors,
  Shirt,
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

type WorldId =
  | 'catering'
  | 'leisure'
  | 'travel'
  | 'vlog'
  | 'retail'
  | 'auto'
  | 'home'
  | 'edu'
  | 'tech'
  | 'drama'
  | 'comic'
type StyleId =
  | 'smoke'
  | 'neon'
  | 'fresh'
  | 'cinema'
  | 'quiet'
  | 'product'
  | 'outdoor'
  | 'handheld'
  | 'showroom'
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
  { sec: 30, label: '30 秒', hint: '先试镜 · 待接小云雀' },
  { sec: 60, label: '1 分钟', hint: '先试镜 · 待接小云雀' },
  { sec: 180, label: '3 分钟', hint: '先试镜 · 待接小云雀' },
  { sec: 300, label: '5 分钟', hint: '先试镜 · 待接小云雀' },
  { sec: 600, label: '10 分钟', hint: '先试镜 · 待接小云雀' },
  { sec: 900, label: '15 分钟', hint: '先试镜 · 待接小云雀' },
]

const WORLDS: {
  id: WorldId
  label: string
  blurb: string
  refill: string
  defaultStyle: StyleId
  promptKind: 'shop' | 'product' | 'vlog' | 'drama' | 'comic'
  fields: { key: FieldKey; label: string; placeholder: string }[]
}[] = [
  {
    id: 'catering',
    label: '餐饮',
    blurb: '火锅、烧烤、茶饮到日料西餐。钩子围着菜单、价格和第一口。长片先 5 秒试镜。',
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
    blurb: '美业、健身、亲子、酒旅、娱乐。钩子围着体验反差和预约。',
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
    id: 'travel',
    label: '旅游',
    blurb: '景点打卡、酒店入住、攻略翻车、城市漫步。钩子围着第一眼和「值不值」。',
    refill: '用当前目的地重填剧本',
    defaultStyle: 'outdoor',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '目的地 / 线路', placeholder: '例：大理古城三日' },
      { key: 'offerName', label: '必打卡点', placeholder: '例：苍山索道日出' },
      { key: 'price', label: '预算记忆点', placeholder: '例：人均 800' },
      { key: 'area', label: '季节 / 时段', placeholder: '例：清明小长假' },
    ],
  },
  {
    id: 'vlog',
    label: 'Vlog',
    blurb: '一日跟拍、搬家、探店日记、创业日记。手持生活感，前三秒就要人设。',
    refill: '用当前主题重填剧本',
    defaultStyle: 'handheld',
    promptKind: 'vlog',
    fields: [
      { key: 'storeName', label: 'Vlog 主题', placeholder: '例：搬进新合租' },
      { key: 'offerName', label: '主角人设', placeholder: '例：北漂打工人' },
      { key: 'price', label: '今日目标', placeholder: '例：把衣柜装完' },
      { key: 'area', label: '城市 / 空间', placeholder: '例：上海合租' },
    ],
  },
  {
    id: 'retail',
    label: '零售探店',
    blurb: '服饰、美妆、潮玩、超市开箱。钩子围着试穿试色和「闭眼入」。',
    refill: '用当前门店重填剧本',
    defaultStyle: 'showroom',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '门店 / 品牌', placeholder: '例：某集合店' },
      { key: 'offerName', label: '主推单品', placeholder: '例：春款风衣' },
      { key: 'price', label: '价格记忆点', placeholder: '例：299 起' },
      { key: 'area', label: '商场楼层', placeholder: '例：万象城 B1' },
    ],
  },
  {
    id: 'auto',
    label: '汽车',
    blurb: '试驾、提车、车内场景、对比打脸。钩子围着关门声和第一脚油。',
    refill: '用当前车型重填剧本',
    defaultStyle: 'showroom',
    promptKind: 'product',
    fields: [
      { key: 'storeName', label: '车型 / 品牌', placeholder: '例：某新能源 SUV' },
      { key: 'offerName', label: '核心卖点', placeholder: '例：智驾辅助' },
      { key: 'price', label: '价格档', placeholder: '例：15 万档' },
      { key: 'area', label: '试驾路段', placeholder: '例：环城快速路' },
    ],
  },
  {
    id: 'home',
    label: '家装房产',
    blurb: '看房、收房、改造前后、软装开箱。钩子围着推开门那一帧。',
    refill: '用当前楼盘重填剧本',
    defaultStyle: 'quiet',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '楼盘 / 项目', placeholder: '例：江景样板间' },
      { key: 'offerName', label: '空间卖点', placeholder: '例：全景落地窗' },
      { key: 'price', label: '总价 / 套餐', placeholder: '例：装修套餐 9.9 万' },
      { key: 'area', label: '区位', placeholder: '例：滨江核心盘' },
    ],
  },
  {
    id: 'edu',
    label: '知识教培',
    blurb: '兴趣课、考证、亲子课、干货口播短剧化。钩子围着「学会那一秒」。',
    refill: '用当前课程重填剧本',
    defaultStyle: 'fresh',
    promptKind: 'shop',
    fields: [
      { key: 'storeName', label: '机构 / 课程', placeholder: '例：少儿编程体验课' },
      { key: 'offerName', label: '学会什么', placeholder: '例：做出第一个小游戏' },
      { key: 'price', label: '体验价', placeholder: '例：体验 1 元' },
      { key: 'area', label: '校区位置', placeholder: '例：学区旁校区' },
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
    blurb: '职场、情感、重生、豪门、刑侦、古装。人物关系驱动；长片宜走小云雀 Agent。',
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
  { id: 'japan', world: 'catering', name: '日料寿司', hook: '刀工那一下最安静', mustSee: '切鱼、握寿司、酱油', visual: '干净台面，克制运镜', icon: Soup },
  { id: 'western', world: 'catering', name: '西餐约会', hook: '烛光比菜单更危险', mustSee: '摆盘、碰杯、第一口', visual: '暖光浅景深，餐具质感', icon: Wine },
  { id: 'hotpot_base', world: 'catering', name: '粥底夜宵', hook: '凌晨三点才懂这口', mustSee: '砂锅、配菜、夜色', visual: '深夜街边，蒸汽克制', icon: Soup },
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
  // travel
  { id: 'scenic', world: 'travel', name: '景点打卡', hook: '下车第一眼就要想发圈', mustSee: '门头或地标、打卡位、笑脸', visual: '户外自然光，跟拍行走', icon: Camera },
  { id: 'citywalk', world: 'travel', name: '城市漫步', hook: '巷子拐角才有故事', mustSee: '街巷、咖啡或小吃、脚步', visual: '手持跟拍，城市纹理', icon: Map },
  { id: 'hotel_checkin', world: 'travel', name: '酒店入住', hook: '推开门那一帧决定好评', mustSee: '房卡、推门、窗景床品', visual: '缓慢推轨，干净高级', icon: Hotel },
  { id: 'guide_fail', world: 'travel', name: '攻略翻车', hook: '网红点排队两小时', mustSee: '长队、表情、改道惊喜', visual: '真实跟拍，情绪清晰', icon: Plane },
  { id: 'roadtrip', world: 'travel', name: '自驾公路', hook: '车窗风一吹人就松了', mustSee: '车内、公路、落日', visual: '车窗光影，跟拍公路', icon: Car },
  { id: 'food_travel', world: 'travel', name: '美食旅行', hook: '为这一口专程飞来', mustSee: '当地小吃、第一口、街景', visual: '街头烟火气，克制', icon: UtensilsCrossed },
  { id: 'camp', world: 'travel', name: '露营星空', hook: '帐篷外比滤镜好看', mustSee: '帐篷、篝火或星空、朋友', visual: '户外自然光到夜景过渡', icon: Trees },
  { id: 'museum', world: 'travel', name: '博物馆一日', hook: '展柜前忽然安静', mustSee: '展品、观众反应、笔记', visual: '展厅柔光，禁止乱闪', icon: Building2 },
  // vlog
  { id: 'day_in_life', world: 'vlog', name: '一日跟拍', hook: '闹钟响了人设就出来', mustSee: '起床、通勤、收尾', visual: '手持生活感，自然光', icon: Camera },
  { id: 'move_house', world: 'vlog', name: '搬家日记', hook: '纸箱一拆情绪就上来', mustSee: '纸箱、空房、第一晚', visual: '手持跟拍，真实凌乱', icon: Home },
  { id: 'startup', world: 'vlog', name: '创业日记', hook: '成交或翻车都要拍', mustSee: '工位、客户、数据或订单', visual: '办公实拍，屏幕可读', icon: Building2 },
  { id: 'study', world: 'vlog', name: '学习打卡', hook: '台灯亮着就不准放弃', mustSee: '书桌、笔记、时钟', visual: '夜台灯，安静跟拍', icon: BookOpen },
  { id: 'couple', world: 'vlog', name: '情侣日常', hook: '小事比告白更狠', mustSee: '并肩、拌嘴、和好', visual: '暖光双人，手持', icon: Heart },
  { id: 'pet_vlog', world: 'vlog', name: '萌宠日常', hook: '它一抬头你就输了', mustSee: '萌宠脸、互动、家', visual: '浅景深萌宠特写', icon: PawPrint },
  { id: 'fitness_vlog', world: 'vlog', name: '健身打卡', hook: '最后一组才说话', mustSee: '训练、汗水、称重或镜子', visual: '跟拍发力，慢动作', icon: Dumbbell },
  { id: 'shop_diary', world: 'vlog', name: '探店日记', hook: '推门前先吐槽预期', mustSee: '推门、点单、第一口', visual: '手持探店，真实反应', icon: ShoppingBag },
  // retail
  { id: 'fashion', world: 'retail', name: '服饰试穿', hook: '镜子一转人设换了', mustSee: '试衣间、镜子前后、面料', visual: '商场自然光，跟拍试穿', icon: Shirt },
  { id: 'beauty', world: 'retail', name: '美妆试色', hook: '试色比参数更能留人', mustSee: '色号、手臂或唇部、镜子', visual: '微距试色，通透光', icon: Sparkles },
  { id: 'sneaker', world: 'retail', name: '潮鞋开箱', hook: '拆盒比上脚更有戏', mustSee: '拆盒、鞋面特写、上脚', visual: '干净桌面，材质特写', icon: ShoppingBag },
  { id: 'toy', world: 'retail', name: '潮玩盲盒', hook: '拆到隐藏款才算赢', mustSee: '拆盒、手办、表情', visual: '桌面俯拍，情绪特写', icon: Gift },
  { id: 'supermarket', world: 'retail', name: '超市开箱', hook: '购物车比清单更诚实', mustSee: '货架、扫码、开箱', visual: '手持跟拍货架', icon: ShoppingBag },
  { id: 'jewelry', world: 'retail', name: '珠宝首饰', hook: '戴上那一秒眼神变了', mustSee: '首饰微距、佩戴、镜子', visual: '高级克制光，材质清晰', icon: Sparkles },
  { id: 'home_goods', world: 'retail', name: '家居软装', hook: '摆上桌才算真正开箱', mustSee: '拆箱、摆放、空间前后', visual: '家居自然光，俯拍', icon: Home },
  // auto
  { id: 'testdrive', world: 'auto', name: '试驾体验', hook: '第一脚油门决定种草', mustSee: '上车、仪表、起步', visual: '座舱清晰，公路跟拍', icon: Car },
  { id: 'pickup', world: 'auto', name: '提车仪式', hook: '交钥匙那帧最贵', mustSee: '车头、钥匙、合影', visual: '展厅干净光，仪式感', icon: Car },
  { id: 'cabin', world: 'auto', name: '座舱科技', hook: '屏幕一点灯全亮', mustSee: '中控屏、语音、氛围灯', visual: '夜色座舱，屏幕可读', icon: Monitor },
  { id: 'compare_car', world: 'auto', name: '同价对比', hook: '并排一开差距出来', mustSee: '两车并排、同路试、结论', visual: '公路对比，克制字幕', icon: Car },
  { id: 'family_car', world: 'auto', name: '家用场景', hook: '后排孩子先投票', mustSee: '后排、储物、上下车', visual: '家庭用车真实跟拍', icon: Baby },
  { id: 'ev_charge', world: 'auto', name: '补能日常', hook: '插枪那一下最安静', mustSee: '充电桩、电量、等待', visual: '夜间充电站，实用光', icon: Cpu },
  // home
  { id: 'viewing', world: 'home', name: '看房推门', hook: '推开门那一帧定生死', mustSee: '推门、采光、格局', visual: '缓慢推轨，真实样板间', icon: Home },
  { id: 'handover', world: 'home', name: '收房验收', hook: '卷尺比销售更诚实', mustSee: '卷尺、空房、问题点', visual: '空房自然光，跟拍验收', icon: Building2 },
  { id: 'reno_before', world: 'home', name: '改造前后', hook: '同一角度前后打脸', mustSee: '同机位前后、关键改动', visual: '前后对比，干净构图', icon: Home },
  { id: 'soft_unbox', world: 'home', name: '软装开箱', hook: '摆上才算真正完工', mustSee: '拆箱、摆放、空间氛围', visual: '家居自然光', icon: ShoppingBag },
  { id: 'kitchen', world: 'home', name: '厨房动线', hook: '开火那一下最香', mustSee: '台面、收纳、开火', visual: '厨房实用光，跟拍', icon: UtensilsCrossed },
  { id: 'balcony', world: 'home', name: '阳台生活', hook: '一杯咖啡就住进来', mustSee: '阳台、绿植、窗外', visual: '自然光，慢节奏', icon: Flower2 },
  // edu
  { id: 'kids_class', world: 'edu', name: '少儿兴趣课', hook: '孩子举手最能转化', mustSee: '举手、作品、课堂', visual: '明亮教室，信任感', icon: GraduationCap },
  { id: 'exam', world: 'edu', name: '考证冲刺', hook: '倒计时板上写着要命', mustSee: '倒计时、刷题、突破', visual: '夜自习感，克制', icon: BookOpen },
  { id: 'skill', world: 'edu', name: '技能实操', hook: '第一次做对那一秒', mustSee: '动手、成品、老师点评', visual: '工坊或教室跟拍', icon: Wand2 },
  { id: 'talk', world: 'edu', name: '干货口播', hook: '第一句就要打脸认知', mustSee: '出镜、要点板书或字幕克制', visual: '干净背景，人物清晰', icon: Mic2 },
  { id: 'parent', world: 'edu', name: '家长课', hook: '家长先慌，老师先稳', mustSee: '家长提问、示范、释然', visual: '明亮教室，关系清楚', icon: Baby },
  { id: 'online', world: 'edu', name: '线上直播课', hook: '弹幕比掌声更吵', mustSee: '屏幕、互动、知识点', visual: '过肩拍屏幕，界面可读', icon: Monitor },
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
  { id: 'rebirth', world: 'drama', name: '重生开局', hook: '睁眼回到关键那天', mustSee: '惊醒、日历或旧物、决意', visual: '都市写实，时间感道具', icon: Sparkles },
  { id: 'tycoon', world: 'drama', name: '豪门恩怨', hook: '宴会一句话掀桌', mustSee: '宴会、对峙、身份反差', visual: '奢华克制，表情清晰', icon: Crown },
  { id: 'crime', world: 'drama', name: '刑侦钩子', hook: '证据比口供先说话', mustSee: '现场线索、对质、反转', visual: '冷色写实，禁止血腥特写', icon: Film },
  { id: 'costume', world: 'drama', name: '古装权谋', hook: '一封折子改命运', mustSee: '宫装或衙门、奏折、对视', visual: '古装写实，服饰清楚，禁止低俗', icon: Wand2 },
  { id: 'period', world: 'drama', name: '年代剧', hook: '旧收音机里有秘密', mustSee: '年代道具、邻里、信件', visual: '怀旧色调，道具准确', icon: Radio },
  { id: 'flash_marry', world: 'drama', name: '闪婚契约', hook: '先签字再谈感情', mustSee: '合同、对视、犹豫', visual: '都市写实，节奏干脆', icon: Heart },
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
  { id: 'tr_first', world: 'travel', name: '第一眼打卡', hint: '下车就想发圈', beats: ['抵达误会', '第一眼打脸预期', '打卡位亮相', '下次还来'], story: '到了{店名}以为会踩雷，第一眼{卖点}直接改口。', roles: '旅行两人', conflict: '攻略预期翻车或超预期。', dialogue: '这才是{卖点}，拍了。' },
  { id: 'tr_queue', world: 'travel', name: '网红排队', hint: '排两小时值不值', beats: ['长队崩溃', '差点放弃', '进去打脸', '预算记忆'], story: '为{卖点}在{位置}排长队，差点放弃，进去后改口。', roles: '游客 / 同伴', conflict: '时间成本 vs 体验回报。', dialogue: '{价格}值不值？我收回那句。' },
  { id: 'tr_hotel', world: 'travel', name: '推门打脸', hint: '照片和实景差很远', beats: ['对照片怀疑', '推门瞬间', '窗景或床品', '好评定格'], story: '对{店名}照片存疑，推门看见{卖点}当场改口。', roles: '入住客人', conflict: '滤镜预期 vs 实景。', dialogue: '比照片还好看。' },
  { id: 'tr_road', world: 'travel', name: '公路松绑', hint: '车窗风把人吹松', beats: ['城市压垮', '上车出发', '公路空镜', '人松一口气'], story: '在{位置}快崩了，开上{店名}线路，{卖点}把人救回来。', roles: '自驾的人', conflict: '城市压力 vs 公路自由。', dialogue: '就这一段路，值了。' },
  { id: 'tr_food', world: 'travel', name: '为吃飞来', hint: '专程为一口', beats: ['专程抵达', '排队或找店', '第一口', '安利定格'], story: '专程为{卖点}飞到{店名}，第一口决定值不值。', roles: '美食旅客', conflict: '旅途成本 vs 一口味道。', dialogue: '就为这口{卖点}。' },
  { id: 'v_day', world: 'vlog', name: '一日人设', hint: '闹钟响了人设出场', beats: ['起床开场', '白天冲突', '小胜或翻车', '夜灯收尾'], story: '{卖点}的一天从{位置}开始，目标是{价格}。', roles: '{卖点}', conflict: '计划和现实对不上。', dialogue: '今天先把{价格}做完。' },
  { id: 'v_move', world: 'vlog', name: '空房第一晚', hint: '纸箱比旁白更狠', beats: ['空房沉默', '拆箱忙乱', '摆上关键物', '第一晚定格'], story: '{卖点}搬进{位置}，空房第一晚才像真正开始。', roles: '{卖点}', conflict: '期待新生活 vs 空房孤独。', dialogue: '先把这一箱拆完。' },
  { id: 'v_fail', world: 'vlog', name: '翻车实录', hint: '失败比成功更留人', beats: ['自信开场', '现场翻车', '补救', '自嘲收尾'], story: '{卖点}本想轻松完成{价格}，结果在{位置}翻车。', roles: '{卖点}', conflict: '人设撑不住现实。', dialogue: '……当我没说过。' },
  { id: 'v_win', world: 'vlog', name: '小胜一刻', hint: '小事做成也要拍', beats: ['目标亮相', '过程咬牙', '做成那秒', '分享安利'], story: '{卖点}盯着{价格}硬啃，做成那一秒最安静。', roles: '{卖点}', conflict: '坚持 vs 放弃。', dialogue: '成了。' },
  { id: 'r_try', world: 'retail', name: '试穿打脸', hint: '镜子前后不是同一个人', beats: ['进店犹豫', '试穿过程', '镜子反转', '闭眼入'], story: '在{店名}试{卖点}，镜子一转当场改口。', roles: '客人 / 导购', conflict: '以为不适合，上身相反。', dialogue: '这件{卖点}，我要了。' },
  { id: 'r_swatch', world: 'retail', name: '试色种草', hint: '色号比广告诚实', beats: ['挑色纠结', '试色特写', '镜子确认', '带走'], story: '在{店名}纠结色号，试到{卖点}立刻决定。', roles: '客人 / 柜员', conflict: '参数太多，眼睛说了算。', dialogue: '就这个{卖点}。' },
  { id: 'r_unbox', world: 'retail', name: '开箱反转', hint: '拆盒比上身更有戏', beats: ['拆盒预期', '第一眼皱眉或惊喜', '上手', '安利'], story: '开箱{店名}的{卖点}，{价格}档位当场被验证。', roles: '开箱的人', conflict: '包装预期 vs 实物。', dialogue: '{价格}能做成这样？' },
  { id: 'r_soldout', world: 'retail', name: '断货倒计时', hint: '只剩最后一件', beats: ['库存提示', '冲去门店', '抢到或错过', '号召'], story: '{店名}的{卖点}只剩最后几件，{位置}还有人在问。', roles: '客人 / 店员', conflict: '来晚了。', dialogue: '就这些了。' },
  { id: 'a_drive', world: 'auto', name: '第一脚油', hint: '起步定种草', beats: ['上车怀疑', '起步', '路感打脸', '定论'], story: '试驾{店名}，第一脚油门验证{卖点}。', roles: '试驾者 / 销售', conflict: '纸面参数 vs 路感。', dialogue: '这脚{卖点}，够了。' },
  { id: 'a_key', world: 'auto', name: '交钥匙', hint: '仪式感定格', beats: ['展厅等待', '交钥匙', '绕车一圈', '合影'], story: '在{位置}提走{店名}，钥匙交到手里才像真的。', roles: '车主 / 销售', conflict: '漫长等待后的兑现。', dialogue: '钥匙给我。' },
  { id: 'a_cabin', world: 'auto', name: '座舱亮灯', hint: '一点灯全亮', beats: ['熄灯座舱', '点亮屏幕', '功能演示', '夜色定格'], story: '{店名}座舱一点亮，{卖点}把夜色切开。', roles: '演示者', conflict: '科技感是否花架子。', dialogue: '你听，这就是{卖点}。' },
  { id: 'a_family', world: 'auto', name: '后排投票', hint: '孩子先举手', beats: ['家长纠结', '后排体验', '孩子表态', '下单'], story: '家用场景里，孩子先给{店名}的{卖点}投票。', roles: '家长 / 孩子', conflict: '参数 vs 家庭体感。', dialogue: '后排说了算。' },
  { id: 'h_door', world: 'home', name: '推门定生死', hint: '第一帧采光', beats: ['门外犹豫', '推门', '采光打脸', '留下意向'], story: '看{店名}，推门看见{卖点}当场改口。', roles: '看房人 / 顾问', conflict: '户型图 vs 实景。', dialogue: '这采光，我要了。' },
  { id: 'h_before', world: 'home', name: '前后打脸', hint: '同机位最狠', beats: ['改造前惨状', '关键改动', '同机位后', '安利套餐'], story: '{店名}同一角度前后对比，{卖点}差距一眼可见。', roles: '业主 / 设计师', conflict: '口头说差不多，画面差很多。', dialogue: '还是以前那个家吗？' },
  { id: 'h_measure', world: 'home', name: '卷尺诚实', hint: '收房比销售狠', beats: ['空房进场', '卷尺发现问题', '对质', '整改或接受'], story: '收{店名}时卷尺比说辞更诚实。', roles: '业主 / 物业', conflict: '承诺 vs 实测。', dialogue: '你自己看尺寸。' },
  { id: 'h_soft', world: 'home', name: '摆上才算完', hint: '软装定氛围', beats: ['毛坯或空荡', '拆箱摆放', '氛围成型', '生活定格'], story: '{卖点}摆进{位置}，家才像能住。', roles: '业主', conflict: '硬装完成不等于能住。', dialogue: '这下像家了。' },
  { id: 'e_raise', world: 'edu', name: '举手种草', hint: '孩子举手最能转化', beats: ['家长犹豫', '课堂上手', '举手笑场', '报名'], story: '家长犹豫{店名}的{卖点}，孩子举手就定了。', roles: '家长 / 孩子 / 老师', conflict: '怕不适合 vs 现场反馈。', dialogue: '给我们留个名额。' },
  { id: 'e_skill', world: 'edu', name: '学会那秒', hint: '第一次做对', beats: ['不会开场', '试错', '做对那秒', '作品亮相'], story: '在{店名}学{卖点}，第一次做对那秒最安静。', roles: '学员 / 老师', conflict: '不会 vs 做成。', dialogue: '成了。' },
  { id: 'e_talk', world: 'edu', name: '认知打脸', hint: '第一句掀翻常识', beats: ['错误常识', '一句打脸', '三点干货', '行动号召'], story: '关于{卖点}，很多人在{位置}一直搞错。', roles: '讲者', conflict: '常识是错的。', dialogue: '你以为的{卖点}，不是这样。' },
  { id: 'e_exam', world: 'edu', name: '倒计时冲刺', hint: '板子上写着要命', beats: ['倒计时压迫', '刷题崩溃', '方法救场', '信心回来'], story: '{价格}倒计时前，{店名}把{卖点}救回来。', roles: '考生 / 老师', conflict: '时间不够。', dialogue: '按这个方法，还来得及。' },
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
  { id: 'd_rebirth', world: 'drama', name: '重生开局', hint: '睁眼回到关键天', beats: ['惊醒', '确认旧物', '改写决意', '第一步行动'], story: '{店名}：{卖点}睁眼回到{位置}，决定改写{价格}。', roles: '{卖点}', conflict: '知道结局还要重来。', dialogue: '这一次，我不会再错。' },
  { id: 'd_tycoon', world: 'drama', name: '宴会掀桌', hint: '一句身份翻盘', beats: ['宴会寒暄', '当众看轻', '身份亮牌', '全场静音'], story: '{店名}宴会上，{卖点}被当众看轻，{价格}摊到桌上。', roles: '{卖点}', conflict: '{价格}', dialogue: '你认错人了。' },
  { id: 'd_crime', world: 'drama', name: '证据先到', hint: '口供不如物证', beats: ['对质僵持', '证据亮相', '表情崩掉', '悬念定格'], story: '{位置}里{卖点}还在狡辩，{价格}已经摆上桌。', roles: '{卖点}', conflict: '口头 vs 物证。', dialogue: '你自己看。' },
  { id: 'd_costume', world: 'drama', name: '折子改命', hint: '一纸定生死', beats: ['递折子', '对视施压', '批红或拒', '命运转向'], story: '{店名}里一封折子，把{卖点}的命运拧向{价格}。', roles: '{卖点}', conflict: '权谋对峙。', dialogue: '陛下，请看这一页。' },
  { id: 'd_marry', world: 'drama', name: '先签后爱', hint: '合同比告白更早', beats: ['合同推到眼前', '犹豫签字', '对视停顿', '关系未定'], story: '{店名}里{卖点}先面对合同，感情被{价格}压住。', roles: '{卖点}', conflict: '契约 vs 真心。', dialogue: '先签字，别的以后再说。' },
  { id: 'm_panel', world: 'comic', name: '分格钩子', hint: '第三格必须反转', beats: ['第一格铺垫', '第二格加码', '第三格打脸', '第四格定格'], story: '{店名}用{价格}讲{卖点}，第三格必须反转。', roles: '{卖点}', conflict: '读者以为走向日常。', dialogue: '你以为放学就结束了？' },
  { id: 'm_gag', world: 'comic', name: '搞笑打脸', hint: '表情比台词更狠', beats: ['正经开场', '动作走偏', '表情崩掉', '吐槽定格'], story: '{卖点}在{位置}里想装酷，结果当场翻车。', roles: '{卖点}', conflict: '人设撑不住动作。', dialogue: '……当我没说。' },
  { id: 'm_ink', world: 'comic', name: '气势一格', hint: '不出手，气势先到', beats: ['对峙远景', '特写眼睛', '气势铺开', '出招或收势'], story: '{店名}里{卖点}还没出手，气场已经压过去。', roles: '{卖点}', conflict: '对手先慌。', dialogue: '你先走一步。' },
  { id: 'm_color', world: 'comic', name: '变装揭示', hint: '一格换装，身份翻面', beats: ['日常伪装', '触发条件', '变装揭示', '新身份定格'], story: '{位置}里的{卖点}被触发，一格换装身份翻面。', roles: '{卖点}', conflict: '伪装被当场揭开。', dialogue: '现在，认清我。' },
  { id: 'm_cliff', world: 'comic', name: '条漫悬念', hint: '最后一格切黑', beats: ['推进剧情', '线索特写', '冲突顶格', '切黑留白'], story: '{店名}这一话不给答案，{价格}停在最后一格。', roles: '{卖点}', conflict: '读者以为要揭晓。', dialogue: '未完。' },
  { id: 'm_battle', world: 'comic', name: '连招高潮', hint: '每一格都要更狠', beats: ['起手式', '连招加速', '反击', '胜负定格'], story: '{店名}里{卖点}连招拉满，最后一格定胜负。', roles: '{卖点}', conflict: '对手以为能拖过这一格。', dialogue: '这一招，够了。' },
]

const STYLES: { id: StyleId; worlds: WorldId[]; name: string; visual: string }[] = [
  { id: 'smoke', worlds: ['catering'], name: '烟火气', visual: '暖黄实用光，蒸汽油光，真实市井，禁止精修广告片感' },
  { id: 'neon', worlds: ['catering', 'leisure', 'vlog'], name: '夜色街灯', visual: '夜晚路灯与室内暖光，潮湿地面反光，克制不霓虹爆炸' },
  { id: 'fresh', worlds: ['catering', 'leisure', 'edu', 'retail'], name: '清新打卡', visual: '自然光，浅景深，干净桌面或镜面' },
  { id: 'quiet', worlds: ['leisure', 'home', 'retail'], name: '高级克制', visual: '低饱和，留白，材质特写，慢推' },
  { id: 'cinema', worlds: ['catering', 'leisure', 'travel', 'vlog', 'tech', 'drama', 'auto', 'home'], name: '电影感', visual: '跟拍推轨，轻微运动模糊，情绪特写，连续运镜' },
  { id: 'outdoor', worlds: ['travel', 'vlog'], name: '户外旅行', visual: '户外自然光，地标清晰，跟拍行走，禁止滤镜过重' },
  { id: 'handheld', worlds: ['vlog', 'travel'], name: '手持生活', visual: '手持轻微晃动，生活纪实，对白口语，禁止精修广告片' },
  { id: 'showroom', worlds: ['retail', 'auto', 'home'], name: '展陈质感', visual: '展厅或样板间干净光，材质与空间可读，慢推' },
  { id: 'product', worlds: ['tech', 'auto'], name: '产品冷调', visual: '干净桌面，材质微距，手部操作，屏幕内容可读' },
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
          ? '科技/汽车产品短剧，产品特写必须可读。禁止仙侠，禁止纯餐饮烟雾。'
          : input.world.promptKind === 'vlog'
            ? '竖屏生活 Vlog 短剧，手持纪实感，前 3 秒亮人设。禁止电影片头片尾，禁止精修广告片。'
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
                  {worldId === 'comic'
                    ? '分格钩子'
                    : worldId === 'tech' || worldId === 'auto'
                      ? '产品钩子'
                      : worldId === 'vlog'
                        ? '叙事钩子'
                        : worldId === 'travel'
                          ? '旅行钩子'
                          : '戏剧钩子'}
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
                    单段仍走 Seedance（约 15 秒）。超过 15 秒的长片目标是接小云雀智能生视频 Agent（多镜编排，最长约 15
                    分钟）；当前长片暂用尾帧续写拼接兜底，小云雀网关接入后会切换。
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
