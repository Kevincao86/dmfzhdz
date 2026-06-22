/**
 * 抖音探店/团购带货风格预设（大CC 类口播短视频）。
 * 含风格包、口播模板、示例 BGM、场景背景与动作指令。
 */

import type { DigitalHumanDraft } from './digitalHumanBroadcast'

/** IMS 公网示例音轨 + 云剪同款路径（ECS 静态站 /digital-human/bgm/ 可后续替换为自有 OSS） */
export const DH_BGM_PUBLIC_BASE =
  'https://ice-document-materials.oss-cn-shanghai.aliyuncs.com/test_media/music'

export type DhBgmPreset = {
  id: string
  label: string
  category: string
  url: string
  /** 相对口播音量，0.12–0.22 为宜 */
  volume: number
  hint: string
}

export const DH_BGM_PRESETS: DhBgmPreset[] = [
  {
    id: 'none',
    label: '无背景音乐',
    category: '无',
    url: '',
    volume: 0,
    hint: '仅保留口播人声',
  },
  {
    id: 'upbeat-food',
    label: '轻快探店 · 美食种草',
    category: '探店',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.16,
    hint: '适合快餐、披萨、奶茶等快节奏带货',
  },
  {
    id: 'warm-deal',
    label: '温暖促销 · 团购转化',
    category: '团购',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.14,
    hint: '适合套餐价、双人餐、限时秒杀口播',
  },
  {
    id: 'energy-hook',
    label: '高能钩子 · 前3秒吸睛',
    category: '钩子',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.18,
    hint: '适合「你敢信？」「居然只要」类开头',
  },
  {
    id: 'calm-explain',
    label: '舒缓讲解 · 门店介绍',
    category: '讲解',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.12,
    hint: '适合环境、服务、预约类长一点的口播',
  },
  {
    id: 'night-neon',
    label: '夜市霓虹 · 烧烤小龙虾',
    category: '夜市',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.17,
    hint: '适合夜宵、大排档、啤酒节氛围',
  },
  {
    id: 'delivery-rush',
    label: '外卖到家 · 节奏感',
    category: '外卖',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.15,
    hint: '适合配送上门、30分钟达、免配送费',
  },
  {
    id: 'beauty-soft',
    label: '美业柔和 · 种草安利',
    category: '美业',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.13,
    hint: '适合美甲、美发、皮肤管理类',
  },
  {
    id: 'leisure-fun',
    label: '休闲娱乐 · 轻快活力',
    category: '休闲',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.17,
    hint: '适合 KTV、电玩、密室、轰趴等年轻向场景',
  },
  {
    id: 'cinema-warm',
    label: '影城约会 · 温馨铺底',
    category: '休闲',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.13,
    hint: '适合电影院、情侣套餐、周末休闲',
  },
  {
    id: 'spa-zen',
    label: 'SPA养生 · 舒缓禅意',
    category: '休闲',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.11,
    hint: '适合足疗、按摩、汗蒸、疗愈类口播',
  },
  {
    id: 'bar-jazz',
    label: '酒吧微醺 · 氛围感',
    category: '酒旅',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.14,
    hint: '适合清吧、威士忌、小酒馆、夜生活',
  },
  {
    id: 'travel-scenic',
    label: '酒旅度假 · 开阔舒缓',
    category: '酒旅',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.12,
    hint: '适合酒店、民宿、景区套票、周末度假',
  },
  {
    id: 'resort-luxury',
    label: '高端度假 · 质感铺底',
    category: '酒旅',
    url: `${DH_BGM_PUBLIC_BASE}/speech.mp3`,
    volume: 0.11,
    hint: '适合五星酒店、温泉度假村、酒庄体验',
  },
  {
    id: 'live-house',
    label: 'Live现场 · 节奏感',
    category: '休闲',
    url: `${DH_BGM_PUBLIC_BASE}/m1.wav`,
    volume: 0.16,
    hint: '适合 livehouse、音乐节、演出票务',
  },
]

export type DhViralBackground = {
  id: string
  label: string
  tag: string
  promptHint: string
}

/** 与 digitalHumanBackgroundComposite.drawBackground 的 id 对齐 */
export const DH_VIRAL_BACKGROUNDS: DhViralBackground[] = [
  { id: 'food-restaurant', label: '餐饮暖光 · 堂食', tag: '餐饮', promptHint: '暖色餐厅内景，餐桌与灯光，适合快餐火锅' },
  { id: 'fast-food-counter', label: '快餐柜台 · 明档', tag: '快餐', promptHint: '明亮快餐店柜台，红黄色调，适合披萨汉堡' },
  { id: 'delivery-window', label: '外卖取餐 · 都市', tag: '外卖', promptHint: '外卖打包台与城市窗景，适合配送上门' },
  { id: 'mall-bright', label: '商场明亮 · 零售', tag: '商场', promptHint: '商场美食层明亮通道，适合连锁品牌' },
  { id: 'kitchen-steam', label: '后厨蒸汽 · 烟火气', tag: '厨房', promptHint: '开放式厨房蒸汽与暖光，适合现做小吃' },
  { id: 'neon-street', label: '霓虹夜景 · 探店', tag: '夜景', promptHint: '霓虹招牌夜景街道，适合烧烤夜市' },
  { id: 'ktv-lounge', label: 'KTV包厢 · 派对', tag: '休闲', promptHint: 'KTV 包厢彩色灯光，适合娱乐团购' },
  { id: 'cinema-hall', label: '影城大厅 · 约会', tag: '休闲', promptHint: '电影院大厅与海报墙，适合观影套餐' },
  { id: 'spa-relax', label: 'SPA养生 · 疗愈', tag: '休闲', promptHint: '足疗 SPA 柔和暖光，适合养生按摩' },
  { id: 'bar-wine', label: '酒吧酒廊 · 微醺', tag: '酒旅', promptHint: '清吧酒柜与暖色灯带，适合酒类夜场' },
  { id: 'arcade-fun', label: '电玩城 · 潮玩', tag: '休闲', promptHint: '电玩城霓虹与机台，适合游戏币套餐' },
  { id: 'scenic-resort', label: '景区度假 · 山水', tag: '酒旅', promptHint: '山景/湖景度假酒店，适合周末出游' },
  { id: 'homestay-cozy', label: '民宿小院 · 慢生活', tag: '酒旅', promptHint: '文艺民宿庭院，适合短途度假' },
  { id: 'hotspring-mist', label: '温泉云雾 · 冬日', tag: '酒旅', promptHint: '温泉池雾气与木栈道，适合泡汤套餐' },
]

export type DhScriptTemplate = {
  id: string
  category: string
  title: string
  /** 可用占位符：{店名} {商品} {价格} {亮点} {城市} */
  script: string
  hookTitle: string
  motionInstructions: string
  tags: string[]
}

export const DH_SCRIPT_TEMPLATES: DhScriptTemplate[] = [
  {
    id: 'pizza-deal-cc',
    category: '快餐披萨',
    title: '披萨双人餐 · 配送上门（大CC同款结构）',
    script:
      '复制打开抖音的姐妹们听好了！{店名}这次真的疯了，{价格}居然能拿下{商品}，还能配送上门你敢信？我下单不到半小时就送到了，饼底酥脆芝士拉丝，两个人吃刚刚好。链接就在左下角，手慢无，赶紧冲！',
    hookTitle: '{价格}居然有{商品}',
    motionInstructions: '0-3秒：快速推近强调价格；3-8秒：指向下方链接；8-15秒：展示产品手势，结尾点赞庆祝',
    tags: ['披萨', '配送', '双人餐'],
  },
  {
    id: 'pizza-lunch',
    category: '快餐披萨',
    title: '工作日午餐披萨',
    script:
      '打工人午餐别将就！{店名}{价格}{商品}，堂食外带都行，出餐快不用等。我中午和同事拼单，人均不到三十，性价比直接拉满。想要同款套餐的点左下角团购。',
    hookTitle: '午餐{价格}搞定',
    motionInstructions: '0-2秒：点头讲解；2-6秒：强调手势；6-12秒：稳镜头微推',
    tags: ['午餐', '打工人'],
  },
  {
    id: 'hotpot-group',
    category: '火锅团购',
    title: '火锅双人餐秒杀',
    script:
      '冬天就该整顿火锅！{店名}这套{商品}只要{价格}，毛肚鸭肠蔬菜拼盘全都有，锅底还能选鸳鸯。我们两个人吃到扶墙出，真的值。库存不多，左下角先囤券再约。',
    hookTitle: '{价格}火锅吃到扶墙',
    motionInstructions: '0-3秒：欢迎拉远；3-10秒：讲解手势；10-18秒：指向团购入口',
    tags: ['火锅', '冬季'],
  },
  {
    id: 'milk-tea-new',
    category: '奶茶咖啡',
    title: '奶茶新品首发',
    script:
      '奶茶脑袋集合！{店名}新品{商品}上了，{价格}大杯还加料，第一口就是{亮点}，甜而不腻。我连喝三天都不腻，姐妹赶紧冲左下角，晚了就没这价了。',
    hookTitle: '新品{商品}{价格}',
    motionInstructions: '0-2秒：轻快起伏；2-8秒：指向产品位；8-14秒：点赞',
    tags: ['奶茶', '新品'],
  },
  {
    id: 'coffee-morning',
    category: '奶茶咖啡',
    title: '早八咖啡续命',
    script:
      '早八人必备！{店名}{价格}{商品}，豆子现磨奶泡绵密，一杯下去清醒一上午。门店就在{城市}地铁口，也可以外卖点到工位。左下角团购比柜台省一半。',
    hookTitle: '早八{价格}续命咖啡',
    motionInstructions: '0-3秒：强调推近；3-10秒：讲解稳镜头',
    tags: ['咖啡', '早餐'],
  },
  {
    id: 'bbq-night',
    category: '烧烤夜市',
    title: '烧烤夜市套餐',
    script:
      '夜宵氛围感拉满！{店名}夜市套餐{价格}，{商品}加啤酒搭档，炭火烤出来的就是香。我们一行四人这价够吃，老板还说周末要排队。想吃的先左下角囤，不然真抢不到。',
    hookTitle: '夜宵{价格}吃到爽',
    motionInstructions: '0-3秒：庆祝推拉；3-12秒：横向指向；12-20秒：点头',
    tags: ['烧烤', '夜宵'],
  },
  {
    id: 'buffet-unlimited',
    category: '自助餐',
    title: '自助不限量',
    script:
      '吃货福利来了！{店名}自助{价格}一位，{商品}不限量，海鲜牛排甜品随便拿。我算了一下吃三盘就回本，{亮点}区域是招牌。周末记得提前预约，左下角团购更划算。',
    hookTitle: '{价格}自助不限量',
    motionInstructions: '0-4秒：快速推近；4-15秒：讲解；15-22秒：欢迎拉远',
    tags: ['自助', '不限量'],
  },
  {
    id: 'delivery-free',
    category: '外卖配送',
    title: '免配送费到家',
    script:
      '不想出门的看这里！{店名}{商品}{价格}，现在下单免配送费，{亮点}送到家还是热的。我住{城市}这边三十分钟就敲门了，比下楼还省事。左下角直接点，新用户还有券。',
    hookTitle: '免配送{商品}{价格}',
    motionInstructions: '0-3秒：指向；3-10秒：强调；10-16秒：点赞',
    tags: ['外卖', '免配送'],
  },
  {
    id: 'burger-combo',
    category: '快餐汉堡',
    title: '汉堡全家桶',
    script:
      '带娃出门就吃这个！{店名}{价格}{商品}，汉堡薯条饮料一套齐，小孩大人都能吃饱。门店干净出餐快，外带也不软。左下角团购比单点省二十，Families 冲就完了。',
    hookTitle: '{价格}全家桶够吃',
    motionInstructions: '0-3秒：欢迎；3-12秒：讲解；12-18秒：庆祝',
    tags: ['汉堡', '亲子'],
  },
  {
    id: 'cake-dessert',
    category: '烘焙甜品',
    title: '蛋糕下午茶',
    script:
      '下午茶仪式感！{店名}{商品}{价格}，动物奶油{亮点}，切块够三四个人分。生日聚会买这个够排面，还能写祝福语。左下角预定，当天现做新鲜出炉。',
    hookTitle: '{价格}{商品}够排面',
    motionInstructions: '0-3秒：轻柔推近；3-10秒：讲解；10-15秒：点赞',
    tags: ['蛋糕', '下午茶'],
  },
  {
    id: 'hair-salon',
    category: '美业丽人',
    title: '美发洗剪吹',
    script:
      '想换发型的姐妹！{店名}{价格}{商品}，洗剪吹加护理，托尼老师手法在线，{亮点}。我剪完脸小一圈，朋友问在哪做的。左下角团购名额有限，先囤再去。',
    hookTitle: '{价格}换发型',
    motionInstructions: '0-3秒：点头；3-10秒：讲解；10-14秒：指向',
    tags: ['美发', '丽人'],
  },
  {
    id: 'gym-trial',
    category: '运动健身',
    title: '健身房体验课',
    script:
      '想开始减脂的！{店名}{价格}{商品}，私教带练加体测，{亮点}设备全新。我上了一节就出汗了，教练很专业不会推销。左下角体验价只有今天，别错过。',
    hookTitle: '{价格}私教体验',
    motionInstructions: '0-3秒：强调；3-12秒：讲解稳镜头',
    tags: ['健身', '体验'],
  },
  {
    id: 'kids-park',
    category: '亲子乐园',
    title: '亲子乐园通玩',
    script:
      '遛娃神器！{店名}{价格}{商品}，全天通玩不限次，{亮点}区域孩子能玩一下午。家长休息区免费，停车还减免。周末票紧张，左下角先买券再出发。',
    hookTitle: '{价格}娃玩一天',
    motionInstructions: '0-3秒：庆祝；3-12秒：欢迎；12-18秒：指向',
    tags: ['亲子', '乐园'],
  },
  {
    id: 'hotel-stay',
    category: '酒店民宿',
    title: '酒店周末住',
    script:
      '周末微度假！{店名}{价格}{商品}，含双早{亮点}，房间干净景观好。我们情侣来过纪念日，性价比比平台订还低。左下角团购周末可用，旺季记得提前约。',
    hookTitle: '周末{价格}住一晚',
    motionInstructions: '0-4秒：舒缓拉远；4-15秒：讲解',
    tags: ['酒店', '周末'],
  },
  {
    id: 'car-wash',
    category: '汽车服务',
    title: '精洗打蜡',
    script:
      '车主看过来！{店名}{价格}{商品}，内外精洗加打蜡，{亮点}护理一套搞定。我开进去十分钟就亮到反光，比路边洗放心多了。左下角囤三次卡更省，附近车主冲。',
    hookTitle: '{价格}精洗亮到反光',
    motionInstructions: '0-3秒：指向；3-10秒：讲解',
    tags: ['洗车', '车主'],
  },
  {
    id: 'supermarket-deal',
    category: '商超便利',
    title: '超市囤货日',
    script:
      '会过日子的买这个！{店名}{商品}{价格}，{亮点}比日常省一半，线上线下都能核销。我一次囤够一周量，家人都说划算。左下角限量，看到就拍别犹豫。',
    hookTitle: '{价格}囤货省一半',
    motionInstructions: '0-3秒：快速推近；3-10秒：强调；10-15秒：点赞',
    tags: ['超市', '囤货'],
  },
  {
    id: 'local-snack',
    category: '地方小吃',
    title: '老字号小吃',
    script:
      '本地人才知道！{店名}{商品}{价格}，{亮点}传承几十年，一口就是小时候的味道。我排队十分钟值了，外带盒也不洒。左下角团购跳过排队，来{城市}必吃。',
    hookTitle: '老字号{价格}',
    motionInstructions: '0-3秒：点头；3-12秒：讲解；12-16秒：指向',
    tags: ['小吃', '老字号'],
  },
  {
    id: 'seafood-fresh',
    category: '海鲜餐厅',
    title: '海鲜现捞',
    script:
      '海鲜控别划走！{店名}{价格}{商品}，现捞现做{亮点}，鲜到眉毛掉下来。我们三个人这价吃到撑，老板还送了饮料。左下角先囤，周末家庭聚餐合适。',
    hookTitle: '{价格}海鲜吃到撑',
    motionInstructions: '0-3秒：庆祝；3-12秒：讲解；12-18秒：欢迎',
    tags: ['海鲜', '现捞'],
  },
  {
    id: 'ktv-party',
    category: '休闲娱乐',
    title: 'KTV欢唱套餐',
    script:
      '周末别宅家！{店名}{价格}{商品}，包厢欢唱{亮点}，小吃饮料套餐全包。我们姐妹四个人唱到嗓子哑，人均才几十。{城市}这家音质真的绝，左下角囤券周末直接预约。',
    hookTitle: '{价格}KTV唱到爽',
    motionInstructions: '0-3秒：庆祝推拉；3-10秒：指向；10-16秒：点赞',
    tags: ['KTV', '聚会'],
  },
  {
    id: 'cinema-date',
    category: '休闲娱乐',
    title: '影城双人观影',
    script:
      '约会不知道去哪？{店名}{价格}{商品}，2D/3D通兑加爆米花可乐，{亮点}厅视听超赞。我们周末下午场人不多，座位随便挑。左下角团购比柜台便宜一半，情侣冲。',
    hookTitle: '{价格}双人看电影',
    motionInstructions: '0-3秒：轻柔推近；3-10秒：讲解；10-14秒：欢迎',
    tags: ['电影', '约会'],
  },
  {
    id: 'escape-room',
    category: '休闲娱乐',
    title: '密室逃脱团建',
    script:
      '胆子大的来！{店名}{价格}{商品}，{亮点}主题沉浸感拉满，剧情反转我鸡皮疙瘩都起来了。我们四个人配合通关，老板还送了纪念照。左下角先囤，节假日档期紧。',
    hookTitle: '{价格}密室超刺激',
    motionInstructions: '0-3秒：强调；3-12秒：讲解；12-18秒：庆祝',
    tags: ['密室', '团建'],
  },
  {
    id: 'spa-massage',
    category: '休闲娱乐',
    title: '足疗SPA放松',
    script:
      '打工人解压必来！{店名}{价格}{商品}，足疗加肩颈{亮点}，技师手法专业不推销。我按完差点睡着，整个人松了。{城市}这家环境也干净，左下角团购比到店省不少。',
    hookTitle: '{价格}按完太舒服',
    motionInstructions: '0-4秒：舒缓拉远；4-14秒：讲解稳镜头',
    tags: ['SPA', '足疗'],
  },
  {
    id: 'bar-night',
    category: '休闲娱乐',
    title: '清吧微醺套餐',
    script:
      '下班小酌一下！{店名}{价格}{商品}，{亮点}特调加小食，氛围灯一关太有感觉了。我和朋友坐吧台聊俩小时，人均不到一百。左下角套餐周末可用，记得提前预约。',
    hookTitle: '{价格}微醺套餐',
    motionInstructions: '0-3秒：欢迎；3-10秒：讲解；10-15秒：指向',
    tags: ['酒吧', '夜生活'],
  },
  {
    id: 'arcade-coins',
    category: '休闲娱乐',
    title: '电玩城游戏币',
    script:
      '大小朋友都能玩！{店名}{价格}{商品}，游戏币{亮点}加倍送，抓娃娃赛车投篮全都有。我带孩子玩了一下午，币还没用完。左下角囤币比现场买划算，假期遛娃神器。',
    hookTitle: '{价格}游戏币加倍',
    motionInstructions: '0-3秒：轻快起伏；3-10秒：强调；10-14秒：点赞',
    tags: ['电玩', '亲子'],
  },
  {
    id: 'bowling-friends',
    category: '休闲娱乐',
    title: '保龄球朋友局',
    script:
      '聚会新选择！{店名}{价格}{商品}，球鞋租赁{亮点}全包，新手也有教练教。我们五个朋友打了一局又笑又闹，比吃饭有意思。左下角团购含饮料，周末场次记得抢。',
    hookTitle: '{价格}保龄球局',
    motionInstructions: '0-3秒：庆祝；3-12秒：讲解；12-16秒：指向',
    tags: ['保龄球', '聚会'],
  },
  {
    id: 'live-ticket',
    category: '休闲娱乐',
    title: 'Livehouse演出票',
    script:
      '乐迷别错过！{店名}{价格}{商品}，{亮点}现场氛围绝了，比耳机里听震撼一百倍。我提前左下角抢票，比门口黄牛靠谱多了。{城市}这家场地不大但音效顶级，冲就完了。',
    hookTitle: '{价格}Live现场',
    motionInstructions: '0-3秒：快速推近；3-10秒：强调；10-15秒：庆祝',
    tags: ['演出', '音乐'],
  },
  {
    id: 'pet-cafe',
    category: '休闲娱乐',
    title: '猫咖狗咖下午茶',
    script:
      '治愈系下午茶！{店名}{价格}{商品}，{亮点}毛孩子随便撸，饮品甜点也好看。我待了两小时不想走，拍照出片率超高。左下角双人套餐含喂食，爱宠人士必来。',
    hookTitle: '{价格}撸猫下午茶',
    motionInstructions: '0-3秒：轻柔推近；3-10秒：讲解；10-14秒：点赞',
    tags: ['猫咖', '治愈'],
  },
  {
    id: 'ski-winter',
    category: '休闲娱乐',
    title: '滑雪冬季度假',
    script:
      '冬天就要滑雪！{店名}{价格}{商品}，雪具租赁{亮点}含教学，新手也能滑起来。我们零基础下午就敢上中级道，太爽了。左下角套票含缆车，{城市}周边自驾方便。',
    hookTitle: '{价格}滑雪入门',
    motionInstructions: '0-3秒：庆祝；3-12秒：讲解；12-18秒：欢迎',
    tags: ['滑雪', '冬季'],
  },
  {
    id: 'resort-weekend',
    category: '酒旅景区',
    title: '度假酒店周末',
    script:
      '逃离城市48小时！{店名}{价格}{商品}，含早{亮点}，泳池健身房免费用。我们开窗就是山景，睡到天亮不想走。左下角比OTA便宜，周末加价规则看清楚再囤。',
    hookTitle: '周末{价格}度假',
    motionInstructions: '0-4秒：舒缓拉远；4-15秒：讲解',
    tags: ['度假', '酒店'],
  },
  {
    id: 'homestay-scenic',
    category: '酒旅景区',
    title: '景区民宿慢住',
    script:
      '想住有故事的民宿！{店名}{价格}{商品}，{亮点}小院能喝茶看星星，老板还做本地早餐。我们在{城市}周边住两晚，比酒店有温度。左下角连住更优惠，适合小情侣。',
    hookTitle: '{价格}民宿慢生活',
    motionInstructions: '0-3秒：欢迎；3-12秒：讲解稳镜头',
    tags: ['民宿', '慢生活'],
  },
  {
    id: 'scenic-ticket',
    category: '酒旅景区',
    title: '景区门票套票',
    script:
      '来{城市}必打卡！{店名}{价格}{商品}，含{亮点}观光项目，比窗口买票省一半。我建议早上九点前入园，人少拍照好看。左下角电子票即买即用，亲子老人都有优待说明。',
    hookTitle: '{价格}景区门票',
    motionInstructions: '0-3秒：强调；3-10秒：指向；10-15秒：讲解',
    tags: ['景区', '门票'],
  },
  {
    id: 'winery-taste',
    category: '酒旅景区',
    title: '酒庄品鉴体验',
    script:
      '微醺爱好者看这里！{店名}{价格}{商品}，{亮点}品鉴师带队讲解，三款酒加小食搭配。我学到了不少品酒知识，送人自饮都合适。左下角周末场次有限，开车别贪杯哦。',
    hookTitle: '{价格}酒庄品鉴',
    motionInstructions: '0-3秒：轻柔推近；3-12秒：讲解；12-16秒：指向',
    tags: ['酒庄', '品鉴'],
  },
  {
    id: 'hotspring-winter',
    category: '酒旅景区',
    title: '温泉泡汤冬日',
    script:
      '冬天泡汤太幸福！{店名}{价格}{商品}，室内外池{亮点}，换衣储物免费用。我们泡完皮肤都滑了，还有姜茶供应。左下角双人票比单买省，{城市}开车一小时到。',
    hookTitle: '{价格}温泉泡汤',
    motionInstructions: '0-4秒：舒缓拉远；4-14秒：讲解',
    tags: ['温泉', '冬季'],
  },
  {
    id: 'travel-group',
    category: '酒旅景区',
    title: '周边跟团一日游',
    script:
      '不想做攻略的来！{店名}{价格}{商品}，大巴接送{亮点}，导游讲解不购物。我们全家老小都合适，中午还含团餐。左下角看发团日期，节假日要提前三天订。',
    hookTitle: '{价格}跟团省心',
    motionInstructions: '0-3秒：讲解；3-12秒：强调；12-16秒：指向',
    tags: ['跟团', '一日游'],
  },
  {
    id: 'glamping-night',
    category: '酒旅景区',
    title: '露营Glamping',
    script:
      '城市青年新玩法！{店名}{价格}{商品}，帐篷{亮点}已搭好，烧烤星空电影全安排。我们不过夜也玩了半天，拍照巨出片。左下角含装备租赁，周末记得防晒防蚊。',
    hookTitle: '{价格}精致露营',
    motionInstructions: '0-3秒：庆祝；3-12秒：欢迎；12-16秒：点赞',
    tags: ['露营', '户外'],
  },
  {
    id: 'bb-homestay',
    category: '酒旅景区',
    title: '网红民宿打卡',
    script:
      '拍照党集合！{店名}{价格}{商品}，{亮点}窗景房太绝了，原图直出。我们住一晚送了下午茶，老板还借反光板。左下角库存不多，热门日期提前两周抢。',
    hookTitle: '网红民宿{价格}',
    motionInstructions: '0-3秒：快速推近；3-10秒：讲解；10-14秒：点赞',
    tags: ['网红', '民宿'],
  },
  {
    id: 'tea-mountain',
    category: '酒旅景区',
    title: '茶山民宿体验',
    script:
      '想放空就来山里！{店名}{价格}{商品}，采茶制茶{亮点}体验，空气好到不想回城。我们两天一夜含三餐，人均比想象中低。左下角适合团建小团队，记得带外套。',
    hookTitle: '{价格}茶山度假',
    motionInstructions: '0-4秒：舒缓拉远；4-14秒：讲解',
    tags: ['茶山', '民宿'],
  },
  {
    id: 'photo-studio',
    category: '生活服务',
    title: '写真摄影套餐',
    script:
      '想拍好看照片！{店名}{价格}{商品}，妆造{亮点}全包，精修十张够发圈。我拍了一套证件照加形象照，当天就能选片。左下角比直接到店咨询划算，记得提前预约档期。',
    hookTitle: '{价格}写真套餐',
    motionInstructions: '0-3秒：点头；3-10秒：讲解',
    tags: ['摄影', '写真'],
  },
  {
    id: 'nail-art',
    category: '美业丽人',
    title: '美甲款式套餐',
    script:
      '指甲也要换季！{店名}{价格}{商品}，{亮点}款式任选，建构加固不额外收费。我做的猫眼款朋友都在问链接，其实就在左下角团购。新客还有卸甲优惠，姐妹冲。',
    hookTitle: '{价格}美甲任选',
    motionInstructions: '0-2秒：轻快起伏；2-8秒：展示；8-12秒：点赞',
    tags: ['美甲', '丽人'],
  },
  {
    id: 'pet-groom',
    category: '生活服务',
    title: '宠物洗护美容',
    script:
      '毛孩子也要精致！{店名}{价格}{商品}，洗澡剪毛{亮点}，美容师超有耐心。我家狗子洗完香香的，还送了小零食。左下角新客体验价，养宠家庭必备。',
    hookTitle: '{价格}宠物洗护',
    motionInstructions: '0-3秒：讲解；3-10秒：指向',
    tags: ['宠物', '美容'],
  },
]

export type DhStylePackScene = 'food' | 'leisure' | 'hotel-travel' | 'life'

export type DhViralStylePack = {
  id: string
  label: string
  description: string
  reference: string
  scene: DhStylePackScene
  background: string
  bgmId: string
  subtitleStyle: string
  gesturePreset: string
  speechRate: number
  templateId: string
}

export const DH_STYLE_PACK_SCENES: { id: DhStylePackScene | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'food', label: '餐饮团购' },
  { id: 'leisure', label: '休闲娱乐' },
  { id: 'hotel-travel', label: '酒旅景区' },
  { id: 'life', label: '生活服务' },
]

export const DH_VIRAL_STYLE_PACKS: DhViralStylePack[] = [
  {
    id: 'viral-deal-cc',
    label: '大CC探店 · 团购带货',
    description: '高能钩子 + 黄字字幕 + 轻快 BGM，适合披萨快餐配送类',
    reference: '大CC / 必胜客类口令短视频',
    scene: 'food',
    background: 'fast-food-counter',
    bgmId: 'energy-hook',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'emphasis',
    speechRate: 1.08,
    templateId: 'pizza-deal-cc',
  },
  {
    id: 'food-warm-store',
    label: '暖光堂食 · 真实探店',
    description: '门店实景感 + 温暖 BGM，适合火锅中餐',
    reference: '堂食排队 / 扶墙出',
    scene: 'food',
    background: 'food-restaurant',
    bgmId: 'warm-deal',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'explain',
    speechRate: 1.0,
    templateId: 'hotpot-group',
  },
  {
    id: 'delivery-home',
    label: '外卖到家 · 免配送',
    description: '都市取餐背景 + 节奏 BGM',
    reference: '30分钟送到家',
    scene: 'food',
    background: 'delivery-window',
    bgmId: 'delivery-rush',
    subtitleStyle: 'bottom-green',
    gesturePreset: 'point',
    speechRate: 1.06,
    templateId: 'delivery-free',
  },
  {
    id: 'night-bbq',
    label: '夜市烧烤 · 霓虹氛围',
    description: '夜景背景 + 高能 BGM',
    reference: '夜宵撸串',
    scene: 'food',
    background: 'neon-street',
    bgmId: 'night-neon',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'celebrate',
    speechRate: 1.1,
    templateId: 'bbq-night',
  },
  {
    id: 'milk-tea-grass',
    label: '奶茶种草 · 少女心',
    description: '商场明亮 + 柔和 BGM + 粉字字幕',
    reference: '新品首发 / 连喝三天',
    scene: 'food',
    background: 'mall-bright',
    bgmId: 'beauty-soft',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'thumbs',
    speechRate: 1.05,
    templateId: 'milk-tea-new',
  },
  {
    id: 'kitchen-smoke',
    label: '后厨烟火 · 现做小吃',
    description: '开放式厨房 + 轻快探店 BGM',
    reference: '现做 / 老字号',
    scene: 'food',
    background: 'kitchen-steam',
    bgmId: 'upbeat-food',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'nod',
    speechRate: 0.98,
    templateId: 'local-snack',
  },
  {
    id: 'seafood-fresh-pack',
    label: '海鲜现捞 · 新鲜力',
    description: '餐饮暖光 + 轻快 BGM',
    reference: '现捞现做',
    scene: 'food',
    background: 'food-restaurant',
    bgmId: 'upbeat-food',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'celebrate',
    speechRate: 1.04,
    templateId: 'seafood-fresh',
  },
  {
    id: 'buffet-feast',
    label: '自助不限量 · 扶墙出',
    description: '堂食暖光 + 温暖促销 BGM',
    reference: '自助餐',
    scene: 'food',
    background: 'food-restaurant',
    bgmId: 'warm-deal',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'emphasis',
    speechRate: 1.02,
    templateId: 'buffet-unlimited',
  },
  {
    id: 'ktv-party-pack',
    label: 'KTV欢唱 · 朋友局',
    description: '包厢灯光 + 休闲活力 BGM',
    reference: 'KTV团购',
    scene: 'leisure',
    background: 'ktv-lounge',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'celebrate',
    speechRate: 1.1,
    templateId: 'ktv-party',
  },
  {
    id: 'cinema-date-pack',
    label: '影城约会 · 双人观影',
    description: '影城大厅 + 温馨铺底 BGM',
    reference: '电影套餐',
    scene: 'leisure',
    background: 'cinema-hall',
    bgmId: 'cinema-warm',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'welcome',
    speechRate: 1.0,
    templateId: 'cinema-date',
  },
  {
    id: 'escape-room-pack',
    label: '密室逃脱 · 刺激沉浸',
    description: '霓虹娱乐 + 高能 BGM',
    reference: '密室团建',
    scene: 'leisure',
    background: 'arcade-fun',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'emphasis',
    speechRate: 1.08,
    templateId: 'escape-room',
  },
  {
    id: 'spa-relax-pack',
    label: 'SPA养生 · 打工人解压',
    description: '疗愈背景 + 禅意 BGM',
    reference: '足疗按摩',
    scene: 'leisure',
    background: 'spa-relax',
    bgmId: 'spa-zen',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'explain',
    speechRate: 0.94,
    templateId: 'spa-massage',
  },
  {
    id: 'bar-wine-pack',
    label: '清吧微醺 · 夜生活',
    description: '酒廊氛围 + 爵士铺底',
    reference: '酒吧套餐',
    scene: 'leisure',
    background: 'bar-wine',
    bgmId: 'bar-jazz',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'welcome',
    speechRate: 0.98,
    templateId: 'bar-night',
  },
  {
    id: 'arcade-youth',
    label: '电玩城 · 潮玩币',
    description: '电玩霓虹 + 活力 BGM',
    reference: '游戏币',
    scene: 'leisure',
    background: 'arcade-fun',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-green',
    gesturePreset: 'thumbs',
    speechRate: 1.08,
    templateId: 'arcade-coins',
  },
  {
    id: 'live-music-pack',
    label: 'Live现场 · 乐迷',
    description: '霓虹夜景 + 现场节奏 BGM',
    reference: '演出票务',
    scene: 'leisure',
    background: 'neon-street',
    bgmId: 'live-house',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'celebrate',
    speechRate: 1.1,
    templateId: 'live-ticket',
  },
  {
    id: 'bowling-party',
    label: '保龄球 · 聚会局',
    description: '电玩风 + 休闲 BGM',
    reference: '保龄球',
    scene: 'leisure',
    background: 'arcade-fun',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'celebrate',
    speechRate: 1.06,
    templateId: 'bowling-friends',
  },
  {
    id: 'pet-cafe-pack',
    label: '猫咖治愈 · 下午茶',
    description: '商场明亮 + 柔和 BGM',
    reference: '猫咖狗咖',
    scene: 'leisure',
    background: 'mall-bright',
    bgmId: 'beauty-soft',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'nod',
    speechRate: 1.02,
    templateId: 'pet-cafe',
  },
  {
    id: 'ski-winter-pack',
    label: '滑雪冬季度假',
    description: '景区山水 + 开阔 BGM',
    reference: '滑雪套票',
    scene: 'leisure',
    background: 'scenic-resort',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'celebrate',
    speechRate: 1.05,
    templateId: 'ski-winter',
  },
  {
    id: 'resort-vacation',
    label: '度假酒店 · 周末逃离',
    description: '山水度假 + 舒缓酒旅 BGM',
    reference: '五星/度假',
    scene: 'hotel-travel',
    background: 'scenic-resort',
    bgmId: 'resort-luxury',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'welcome',
    speechRate: 0.96,
    templateId: 'resort-weekend',
  },
  {
    id: 'homestay-getaway',
    label: '民宿慢住 · 小院生活',
    description: '文艺民宿 + 舒缓 BGM',
    reference: '周边民宿',
    scene: 'hotel-travel',
    background: 'homestay-cozy',
    bgmId: 'travel-scenic',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'explain',
    speechRate: 0.95,
    templateId: 'homestay-scenic',
  },
  {
    id: 'scenic-ticket-hot',
    label: '景区门票 · 必打卡',
    description: '景区山水 + 开阔 BGM',
    reference: '门票套票',
    scene: 'hotel-travel',
    background: 'scenic-resort',
    bgmId: 'travel-scenic',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'point',
    speechRate: 1.02,
    templateId: 'scenic-ticket',
  },
  {
    id: 'winery-date',
    label: '酒庄品鉴 · 微醺之旅',
    description: '酒廊质感 + 爵士 BGM',
    reference: '酒庄体验',
    scene: 'hotel-travel',
    background: 'bar-wine',
    bgmId: 'bar-jazz',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'welcome',
    speechRate: 0.94,
    templateId: 'winery-taste',
  },
  {
    id: 'hotspring-winter-pack',
    label: '温泉泡汤 · 冬日必去',
    description: '温泉云雾 + 高端度假 BGM',
    reference: '温泉双人',
    scene: 'hotel-travel',
    background: 'hotspring-mist',
    bgmId: 'resort-luxury',
    subtitleStyle: 'bottom-white-large',
    gesturePreset: 'explain',
    speechRate: 0.93,
    templateId: 'hotspring-winter',
  },
  {
    id: 'travel-day-tour',
    label: '跟团一日游 · 省心',
    description: '景区背景 + 舒缓 BGM',
    reference: '周边游',
    scene: 'hotel-travel',
    background: 'scenic-resort',
    bgmId: 'travel-scenic',
    subtitleStyle: 'bottom-green',
    gesturePreset: 'explain',
    speechRate: 1.0,
    templateId: 'travel-group',
  },
  {
    id: 'glamping-outdoor',
    label: '精致露营 · 户外',
    description: '民宿慢生活 + 开阔 BGM',
    reference: 'Glamping',
    scene: 'hotel-travel',
    background: 'homestay-cozy',
    bgmId: 'travel-scenic',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'celebrate',
    speechRate: 1.04,
    templateId: 'glamping-night',
  },
  {
    id: 'bb-homestay-pack',
    label: '网红民宿 · 打卡出片',
    description: '文艺民宿 + 柔和 BGM',
    reference: '网红窗景',
    scene: 'hotel-travel',
    background: 'homestay-cozy',
    bgmId: 'beauty-soft',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'thumbs',
    speechRate: 1.03,
    templateId: 'bb-homestay',
  },
  {
    id: 'tea-mountain-pack',
    label: '茶山民宿 · 放空',
    description: '山水度假 + 禅意 BGM',
    reference: '茶山体验',
    scene: 'hotel-travel',
    background: 'scenic-resort',
    bgmId: 'spa-zen',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'welcome',
    speechRate: 0.92,
    templateId: 'tea-mountain',
  },
  {
    id: 'hotel-weekend-pack',
    label: '酒店周末 · 微度假',
    description: '度假山水 + 高端 BGM（沿用酒店模板）',
    reference: '周末连住',
    scene: 'hotel-travel',
    background: 'scenic-resort',
    bgmId: 'resort-luxury',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'welcome',
    speechRate: 0.96,
    templateId: 'hotel-stay',
  },
  {
    id: 'photo-studio-pack',
    label: '写真摄影 · 出片',
    description: '商场明亮 + 柔和 BGM',
    reference: '写真套餐',
    scene: 'life',
    background: 'mall-bright',
    bgmId: 'beauty-soft',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'nod',
    speechRate: 1.0,
    templateId: 'photo-studio',
  },
  {
    id: 'nail-beauty-pack',
    label: '美甲丽人 · 款式任选',
    description: '明亮背景 + 美业 BGM',
    reference: '美甲团购',
    scene: 'life',
    background: 'mall-bright',
    bgmId: 'beauty-soft',
    subtitleStyle: 'bottom-pink',
    gesturePreset: 'thumbs',
    speechRate: 1.05,
    templateId: 'nail-art',
  },
  {
    id: 'gym-fitness-pack',
    label: '健身塑形 · 体验课',
    description: '门店实景 + 活力 BGM',
    reference: '私教体验',
    scene: 'life',
    background: 'store',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-green',
    gesturePreset: 'emphasis',
    speechRate: 1.06,
    templateId: 'gym-trial',
  },
  {
    id: 'kids-park-pack',
    label: '亲子乐园 · 遛娃',
    description: '商场明亮 + 轻快 BGM',
    reference: '乐园通玩',
    scene: 'life',
    background: 'mall-bright',
    bgmId: 'leisure-fun',
    subtitleStyle: 'bottom-yellow',
    gesturePreset: 'celebrate',
    speechRate: 1.08,
    templateId: 'kids-park',
  },
  {
    id: 'pet-groom-pack',
    label: '宠物美容 · 毛孩子',
    description: '门店实景 + 舒缓 BGM',
    reference: '洗护美容',
    scene: 'life',
    background: 'store',
    bgmId: 'calm-explain',
    subtitleStyle: 'bottom-white',
    gesturePreset: 'explain',
    speechRate: 1.0,
    templateId: 'pet-groom',
  },
  {
    id: 'car-wash-pack',
    label: '精洗打蜡 · 车主',
    description: '都市背景 + 讲解 BGM',
    reference: '洗车养护',
    scene: 'life',
    background: 'delivery-window',
    bgmId: 'calm-explain',
    subtitleStyle: 'bottom-green',
    gesturePreset: 'point',
    speechRate: 0.98,
    templateId: 'car-wash',
  },
]

export type DhScriptFillVars = {
  店名?: string
  商品?: string
  价格?: string
  亮点?: string
  城市?: string
}

const DEFAULT_FILL: Required<DhScriptFillVars> = {
  店名: '本店',
  商品: '超值套餐',
  价格: '59元',
  亮点: '招牌必点',
  城市: '本地',
}

export function fillDhScriptPlaceholders(text: string, vars?: DhScriptFillVars): string {
  const v = { ...DEFAULT_FILL, ...vars }
  return text
    .replace(/\{店名\}/g, v.店名)
    .replace(/\{商品\}/g, v.商品)
    .replace(/\{价格\}/g, v.价格)
    .replace(/\{亮点\}/g, v.亮点)
    .replace(/\{城市\}/g, v.城市)
}

export function findDhBgmPreset(id: string | undefined | null): DhBgmPreset {
  const t = String(id ?? 'none').trim() || 'none'
  return DH_BGM_PRESETS.find((b) => b.id === t) ?? DH_BGM_PRESETS[0]!
}

export function findDhScriptTemplate(id: string): DhScriptTemplate | undefined {
  return DH_SCRIPT_TEMPLATES.find((t) => t.id === id)
}

export function findDhStylePack(id: string): DhViralStylePack | undefined {
  return DH_VIRAL_STYLE_PACKS.find((p) => p.id === id)
}

/** 应用风格包到草稿（口播模板可选一并填入） */
export function applyDhStylePackToDraft(
  draft: DigitalHumanDraft,
  packId: string,
  fill?: DhScriptFillVars,
): DigitalHumanDraft {
  const pack = findDhStylePack(packId)
  if (!pack) return draft
  const tpl = findDhScriptTemplate(pack.templateId)
  const next: DigitalHumanDraft = {
    ...draft,
    stylePackId: pack.id,
    background: pack.background,
    bgmId: pack.bgmId,
    subtitleStyle: pack.subtitleStyle,
    gesturePreset: pack.gesturePreset,
    speechRate: pack.speechRate,
    subtitleEnabled: true,
    productOverlayEnabled: draft.productOverlayEnabled,
  }
  if (tpl) {
    next.script = fillDhScriptPlaceholders(tpl.script, fill)
    next.hookTitle = fillDhScriptPlaceholders(tpl.hookTitle, fill)
    next.motionInstructions = tpl.motionInstructions
  }
  return next
}

export function applyDhScriptTemplateToDraft(
  draft: DigitalHumanDraft,
  templateId: string,
  fill?: DhScriptFillVars,
): DigitalHumanDraft {
  const tpl = findDhScriptTemplate(templateId)
  if (!tpl) return draft
  return {
    ...draft,
    script: fillDhScriptPlaceholders(tpl.script, fill),
    hookTitle: fillDhScriptPlaceholders(tpl.hookTitle, fill),
    motionInstructions: tpl.motionInstructions,
    subtitleEnabled: true,
  }
}

export const DH_SCRIPT_CATEGORIES = Array.from(
  new Set(DH_SCRIPT_TEMPLATES.map((t) => t.category)),
)
