/**
 * 本地开发用：模拟「查询商品品类」树（一级下二级数量贴近真实来客结构，餐饮尤其完整）。
 * 生产环境由网关代理 goodlife/v1/goods/category/get/。
 */

export type DouyinCategoryNode = {
  category_id: string
  name: string
  parent_id: string
  level: number
  is_leaf: boolean
  enable: boolean
  sub_tree_infos?: DouyinCategoryNode[]
}

export function collectLeaves(nodes: DouyinCategoryNode[]): DouyinCategoryNode[] {
  const out: DouyinCategoryNode[] = []
  for (const n of nodes) {
    if (n.is_leaf) out.push(n)
    if (n.sub_tree_infos?.length) out.push(...collectLeaves(n.sub_tree_infos))
  }
  return out
}

export function findNodeById(nodes: DouyinCategoryNode[], id: string): DouyinCategoryNode | null {
  for (const n of nodes) {
    if (n.category_id === id) return n
    if (n.sub_tree_infos?.length) {
      const f = findNodeById(n.sub_tree_infos, id)
      if (f) return f
    }
  }
  return null
}

function leaf(pid: string, id: string, name: string, enable = true): DouyinCategoryNode {
  return { category_id: id, name, parent_id: pid, level: 3, is_leaf: true, enable }
}

function l2(
  pid: string,
  id: string,
  name: string,
  leaves: DouyinCategoryNode[],
  enableL2 = true,
): DouyinCategoryNode {
  return {
    category_id: id,
    name,
    parent_id: pid,
    level: 2,
    is_leaf: false,
    enable: enableL2,
    sub_tree_infos: leaves,
  }
}

const FOOD = 'l1_food'

/** 餐饮：二级行业 28 个（贴近来客「餐饮」下常见划分），各带末级示例 */
const FOOD_L2: DouyinCategoryNode[] = [
  l2(FOOD, 'l2_hotpot', '火锅/汤锅', [
    leaf('l2_hotpot', 'l2_hotpot_tuan', '团购套餐'),
    leaf('l2_hotpot', 'l2_hotpot_quan', '代金券'),
    leaf('l2_hotpot', 'l2_hotpot_diguodi', '锅底/汤底'),
    leaf('l2_hotpot', 'l2_hotpot_chuanchuan', '串串香'),
  ]),
  l2(FOOD, 'l2_bbq', '烧烤/烤肉', [
    leaf('l2_bbq', 'l2_bbq_tuan', '团购套餐'),
    leaf('l2_bbq', 'l2_bbq_quan', '代金券'),
  ]),
  l2(FOOD, 'l2_buffet', '自助餐', [leaf('l2_buffet', 'l2_buffet_tuan', '团购套餐'), leaf('l2_buffet', 'l2_buffet_quan', '代金券')]),
  l2(FOOD, 'l2_fast', '小吃快餐', [leaf('l2_fast', 'l2_fast_tuan', '团购套餐'), leaf('l2_fast', 'l2_fast_quan', '代金券')]),
  l2(FOOD, 'l2_snack_local', '地方小吃', [leaf('l2_snack_local', 'l2_snack_local_tuan', '团购套餐'), leaf('l2_snack_local', 'l2_snack_local_quan', '代金券')]),
  l2(FOOD, 'l2_drink_shop', '饮品店', [leaf('l2_drink_shop', 'l2_drink_shop_tuan', '团购套餐'), leaf('l2_drink_shop', 'l2_drink_shop_quan', '代金券')]),
  l2(FOOD, 'l2_bakery', '面包蛋糕甜品', [leaf('l2_bakery', 'l2_bakery_tuan', '团购套餐'), leaf('l2_bakery', 'l2_bakery_quan', '代金券')]),
  l2(FOOD, 'l2_breakfast', '早餐', [leaf('l2_breakfast', 'l2_breakfast_tuan', '团购套餐'), leaf('l2_breakfast', 'l2_breakfast_quan', '代金券')]),
  l2(FOOD, 'l2_canteen', '食堂/团餐', [leaf('l2_canteen', 'l2_canteen_tuan', '团购套餐'), leaf('l2_canteen', 'l2_canteen_quan', '代金券')]),
  l2(FOOD, 'l2_jp', '日本料理', [leaf('l2_jp', 'l2_jp_tuan', '团购套餐'), leaf('l2_jp', 'l2_jp_quan', '代金券')]),
  l2(FOOD, 'l2_kr', '韩国料理', [leaf('l2_kr', 'l2_kr_tuan', '团购套餐'), leaf('l2_kr', 'l2_kr_quan', '代金券')]),
  l2(FOOD, 'l2_seasia', '东南亚菜', [leaf('l2_seasia', 'l2_seasia_tuan', '团购套餐'), leaf('l2_seasia', 'l2_seasia_quan', '代金券')]),
  l2(FOOD, 'l2_western', '西餐', [leaf('l2_western', 'l2_western_tuan', '团购套餐'), leaf('l2_western', 'l2_western_quan', '代金券')]),
  l2(FOOD, 'l2_mid_east', '中东菜', [leaf('l2_mid_east', 'l2_mid_east_tuan', '团购套餐'), leaf('l2_mid_east', 'l2_mid_east_quan', '代金券')]),
  l2(FOOD, 'l2_sichuan', '川菜', [leaf('l2_sichuan', 'l2_sichuan_tuan', '团购套餐'), leaf('l2_sichuan', 'l2_sichuan_quan', '代金券')]),
  l2(FOOD, 'l2_hunan', '湘菜', [leaf('l2_hunan', 'l2_hunan_tuan', '团购套餐'), leaf('l2_hunan', 'l2_hunan_quan', '代金券')]),
  l2(FOOD, 'l2_cantonese', '粤菜', [leaf('l2_cantonese', 'l2_cantonese_tuan', '团购套餐'), leaf('l2_cantonese', 'l2_cantonese_quan', '代金券')]),
  l2(FOOD, 'l2_jiangzhe', '本帮江浙菜', [leaf('l2_jiangzhe', 'l2_jiangzhe_tuan', '团购套餐'), leaf('l2_jiangzhe', 'l2_jiangzhe_quan', '代金券')]),
  l2(FOOD, 'l2_dongbei', '东北菜', [leaf('l2_dongbei', 'l2_dongbei_tuan', '团购套餐'), leaf('l2_dongbei', 'l2_dongbei_quan', '代金券')]),
  l2(FOOD, 'l2_yungui', '云贵菜', [leaf('l2_yungui', 'l2_yungui_tuan', '团购套餐'), leaf('l2_yungui', 'l2_yungui_quan', '代金券')]),
  l2(FOOD, 'l2_xibei', '西北菜', [leaf('l2_xibei', 'l2_xibei_tuan', '团购套餐'), leaf('l2_xibei', 'l2_xibei_quan', '代金券')]),
  l2(FOOD, 'l2_xinjiang', '新疆菜', [leaf('l2_xinjiang', 'l2_xinjiang_tuan', '团购套餐'), leaf('l2_xinjiang', 'l2_xinjiang_quan', '代金券')]),
  l2(FOOD, 'l2_seafood', '海鲜水产', [leaf('l2_seafood', 'l2_seafood_tuan', '团购套餐'), leaf('l2_seafood', 'l2_seafood_quan', '代金券')]),
  l2(FOOD, 'l2_grillfish', '烤鱼', [leaf('l2_grillfish', 'l2_grillfish_tuan', '团购套餐'), leaf('l2_grillfish', 'l2_grillfish_quan', '代金券')]),
  l2(FOOD, 'l2_crayfish', '小龙虾', [leaf('l2_crayfish', 'l2_crayfish_tuan', '团购套餐'), leaf('l2_crayfish', 'l2_crayfish_quan', '代金券')]),
  l2(FOOD, 'l2_chicken_pot', '地锅鸡/鸡煲', [leaf('l2_chicken_pot', 'l2_chicken_pot_tuan', '团购套餐'), leaf('l2_chicken_pot', 'l2_chicken_pot_quan', '代金券')]),
  l2(FOOD, 'l2_vegetarian', '素食', [leaf('l2_vegetarian', 'l2_vegetarian_tuan', '团购套餐'), leaf('l2_vegetarian', 'l2_vegetarian_quan', '代金券')]),
  l2(FOOD, 'l2_fusion', '创意/融合菜', [leaf('l2_fusion', 'l2_fusion_tuan', '团购套餐'), leaf('l2_fusion', 'l2_fusion_quan', '代金券')]),
  l2(FOOD, 'l2_private_chef', '私厨到家', [leaf('l2_private_chef', 'l2_private_chef_tuan', '团购套餐'), leaf('l2_private_chef', 'l2_private_chef_quan', '代金券')]),
  l2(FOOD, 'l2_coffee', '咖啡厅', [leaf('l2_coffee', 'l2_coffee_tuan', '团购套餐'), leaf('l2_coffee', 'l2_coffee_quan', '代金券')]),
  l2(FOOD, 'l2_tea_house', '茶馆', [leaf('l2_tea_house', 'l2_tea_house_tuan', '团购套餐'), leaf('l2_tea_house', 'l2_tea_house_quan', '代金券')]),
  l2(FOOD, 'l2_night_snack', '夜宵大排档', [leaf('l2_night_snack', 'l2_night_snack_tuan', '团购套餐'), leaf('l2_night_snack', 'l2_night_snack_quan', '代金券')]),
  l2(FOOD, 'l2_chinese_other', '其他中餐', [leaf('l2_chinese_other', 'l2_chinese_other_tuan', '团购套餐'), leaf('l2_chinese_other', 'l2_chinese_other_quan', '代金券')]),
]

function expandL1(
  l1Id: string,
  l1Name: string,
  prefix: string,
  labels: string[],
): DouyinCategoryNode {
  return {
    category_id: l1Id,
    name: l1Name,
    parent_id: '0',
    level: 1,
    is_leaf: false,
    enable: true,
    sub_tree_infos: labels.map((label, i) => {
      const id = `${prefix}_${i}`
      return l2(l1Id, id, label, [
        leaf(id, `${id}_tuan`, '团购套餐'),
        leaf(id, `${id}_quan`, '代金券'),
      ])
    }),
  }
}

/** 三级示例树：与真实来客「一级下多二级」结构类似，用于未绑定抖音时的 UI/联调 */
export const MOCK_CATEGORY_TREE: DouyinCategoryNode[] = [
  {
    category_id: FOOD,
    name: '餐饮',
    parent_id: '0',
    level: 1,
    is_leaf: false,
    enable: true,
    sub_tree_infos: FOOD_L2,
  },
  expandL1('l1_beauty', '丽人', 'l2bm', [
    '美发',
    '美甲',
    '美睫',
    '美容美体',
    '祛痘/皮肤管理',
    '半永久纹绣',
    '纹身刺青',
    '养发护发',
    '美体塑形',
    '产后恢复',
    '男士美容',
    '舞蹈塑形',
    '瑜伽普拉提',
    'SPA按摩',
    '其他丽人',
  ]),
  expandL1('l1_leisure', '休闲娱乐', 'l2ls', [
    'KTV',
    '酒吧',
    '电影院',
    '剧本杀',
    '密室逃脱',
    '棋牌室',
    '网吧电竞',
    '游戏厅',
    '桌游馆',
    '轰趴馆',
    '农家乐',
    '真人CS',
    '温泉洗浴',
    '汗蒸桑拿',
    '其他玩乐',
  ]),
  expandL1('l1_sport', '运动健身', 'l2sp', [
    '健身房',
    '私教工作室',
    '瑜伽馆',
    '舞蹈培训',
    '格斗搏击',
    '游泳馆',
    '羽毛球馆',
    '篮球场馆',
    '网球场地',
    '滑雪户外',
    '马术俱乐部',
    '攀岩馆',
    '团操课',
    '其他运动',
  ]),
  expandL1('l1_kids', '亲子', 'l2kd', [
    '儿童乐园',
    '亲子餐厅',
    '婴儿游泳',
    '早教中心',
    '托育托管',
    '亲子摄影',
    '儿童理发',
    '绘本馆',
    '手工DIY',
    '亲子酒店',
    '动物园门票',
    '科技馆',
    '营地研学',
    '其他亲子',
  ]),
  expandL1('l1_life', '生活服务', 'l2lf', [
    '家政保洁',
    '家电清洗',
    '搬家货运',
    '开锁换锁',
    '维修到家',
    '洗衣洗鞋',
    '月嫂保姆',
    '婚庆摄影',
    '法律咨询',
    '财务代办',
    '装修设计',
    '甲醛检测',
    '绿植养护',
    '其他生活',
  ]),
  expandL1('l1_car', '爱车', 'l2cr', [
    '洗车美容',
    '保养维修',
    '轮胎服务',
    '贴膜改色',
    '钣金喷漆',
    '道路救援',
    '年检代办',
    '二手车服务',
    '充电桩',
    '加油优惠',
    '驾校培训',
    '租车服务',
    '车内消毒',
    '其他汽车',
  ]),
  expandL1('l1_shopping', '购物', 'l2sh', [
    '商超便利',
    '百货零售',
    '服饰鞋包',
    '美妆集合',
    '数码家电',
    '母婴用品',
    '礼品鲜花',
    '图书文具',
    '进口商品',
    '农副产品',
    '茶叶酒水',
    '珠宝首饰',
    '眼镜钟表',
    '其他购物',
  ]),
  expandL1('l1_edu', '学习培训', 'l2ed', [
    '语言培训',
    '职业技能',
    '学历教育',
    '考研公考',
    '艺术培训',
    '体育培训',
    'IT编程',
    '财会金融',
    '企业管理',
    '心理咨询',
    '书法绘画',
    '音乐乐器',
    '早幼教',
    '其他教育',
  ]),
  expandL1('l1_pet', '宠物', 'l2pt', [
    '宠物医疗',
    '宠物美容',
    '宠物寄养',
    '宠物训练',
    '宠物食品',
    '宠物用品',
    '宠物摄影',
    '异宠服务',
    '宠物殡葬',
    '宠物保险',
    '宠物出行',
    '水族造景',
    '爬宠服务',
    '其他宠物',
  ]),
  expandL1('l1_med_beauty', '医疗医美', 'l2md', [
    '口腔齿科',
    '眼科视光',
    '体检中心',
    '中医理疗',
    '轻医美',
    '植发养发',
    '医学美容',
    '疫苗接种',
    '康复护理',
    '心理咨询',
    '基因检测',
    '孕产服务',
    '专科门诊',
    '其他医疗',
  ]),
]

/** 演示环境：所有 enable 的末级类目均可选（与树解析一致） */
export const MOCK_UPLOADABLE_LEAF_IDS = new Set(
  collectLeaves(MOCK_CATEGORY_TREE)
    .filter((n) => n.is_leaf && n.enable !== false)
    .map((n) => n.category_id),
)
