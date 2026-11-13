/**
 * 视觉工坊三级类目。一级/二级与网页业态对齐，三级是出图必须锁定的具体品类。
 */
const TREE = [
  {
    id: 'catering',
    label: '餐饮',
    children: [
      { id: 'catering_chinese', label: '中餐正餐', children: [
        { id: 'catering_chinese_home', label: '家常菜', scene: '家常热菜、圆桌、碗筷，禁止茶席和甜品台' },
        { id: 'catering_chinese_sichuan', label: '川湘菜', scene: '麻辣热菜、红油、聚餐炒锅' },
        { id: 'catering_chinese_cantonese', label: '粤菜早茶', scene: '蒸笼点心、清淡摆盘、茶楼' },
      ]},
      { id: 'catering_hotpot', label: '火锅烧烤', children: [
        { id: 'catering_hotpot_sichuan', label: '川味火锅', scene: '红汤火锅、毛肚鸭肠、涮锅蒸汽' },
        { id: 'catering_hotpot_beef', label: '牛肉火锅', scene: '清汤或红汤、鲜切牛肉片' },
        { id: 'catering_bbq_skewer', label: '烧烤撸串', scene: '炭火烤串、夜宵摊，禁止火锅和茶饮' },
        { id: 'catering_bbq_yakiniku', label: '日式烧肉', scene: '铁板烧肉、和牛切片' },
      ]},
      { id: 'catering_tea', label: '茶饮咖啡', children: [
        { id: 'catering_tea_milktea', label: '奶茶', scene: '现制奶茶、杯装饮品、吧台' },
        { id: 'catering_tea_coffee', label: '咖啡', scene: '咖啡豆、拉花、咖啡馆吧台' },
        { id: 'catering_tea_fruit', label: '果茶', scene: '鲜果茶、冰块、透明杯' },
      ]},
      { id: 'catering_bakery', label: '烘焙甜品', children: [
        { id: 'catering_bakery_cake', label: '蛋糕', scene: '奶油蛋糕、裱花' },
        { id: 'catering_bakery_bread', label: '面包', scene: '现烤面包、橱窗' },
        { id: 'catering_bakery_dessert', label: '甜品', scene: '冰淇淋、布丁、甜品台' },
      ]},
      { id: 'catering_snack', label: '快餐小吃', children: [
        { id: 'catering_snack_noodle', label: '面馆', scene: '一碗面、热汤' },
        { id: 'catering_snack_rice', label: '盖浇饭', scene: '盖浇饭、快餐盒' },
        { id: 'catering_snack_fried', label: '炸鸡小吃', scene: '炸鸡、薯条、小吃盒' },
      ]},
    ],
  },
  {
    id: 'beauty',
    label: '美业',
    children: [
      { id: 'beauty_hair', label: '美发造型', children: [
        { id: 'beauty_hair_cut', label: '剪发', scene: '理发镜、剪刀、发型' },
        { id: 'beauty_hair_color', label: '染烫', scene: '染发碗、烫发卷' },
        { id: 'beauty_hair_care', label: '护理', scene: '洗护、护发' },
      ]},
      { id: 'beauty_nail', label: '美甲美睫', children: [
        { id: 'beauty_nail_art', label: '美甲', scene: '指甲彩绘、甲油' },
        { id: 'beauty_lash', label: '美睫', scene: '睫毛嫁接、眼部特写' },
      ]},
      { id: 'beauty_skin', label: '皮肤管理', children: [
        { id: 'beauty_skin_clean', label: '清洁护理', scene: '面部清洁、护肤床' },
        { id: 'beauty_skin_glow', label: '透亮修护', scene: '面部护理仪器、干净诊室' },
      ]},
      { id: 'beauty_med', label: '轻医美', children: [
        { id: 'beauty_med_face', label: '面部项目', scene: '医美诊室、面部治疗，禁止餐饮' },
        { id: 'beauty_med_body', label: '身体项目', scene: '身体护理床、专业诊室' },
      ]},
    ],
  },
  {
    id: 'leisure',
    label: '休娱',
    children: [
      { id: 'leisure_foot_spa', label: '足浴按摩', children: [
        { id: 'leisure_foot_spa_sofa', label: '足浴', scene: '足浴沙发、足浴桶、技师足部按摩，禁止浴缸酒店和菜品' },
        { id: 'leisure_massage', label: '推拿按摩', scene: '按摩床、推拿，禁止餐饮' },
        { id: 'leisure_spa_body', label: '养生SPA', scene: '养生馆、精油，禁止海边度假别墅' },
      ]},
      { id: 'leisure_billiards', label: '台球桌游', children: [
        { id: 'leisure_billiards_pool', label: '台球', scene: '台球桌、球杆' },
        { id: 'leisure_boardgame', label: '桌游', scene: '桌游桌、卡牌' },
      ]},
      { id: 'leisure_ktv', label: 'KTV酒吧', children: [
        { id: 'leisure_ktv_room', label: 'KTV', scene: '包房、麦克风、霓虹' },
        { id: 'leisure_bar', label: '酒吧', scene: '吧台、酒杯，禁止火锅' },
      ]},
      { id: 'leisure_escape', label: '影院密室', children: [
        { id: 'leisure_cinema', label: '影院', scene: '影厅座椅、银幕' },
        { id: 'leisure_escape_room', label: '密室', scene: '密室机关、沉浸布景' },
      ]},
      { id: 'leisure_fitness', label: '健身运动', children: [
        { id: 'leisure_gym', label: '健身房', scene: '器械、哑铃' },
        { id: 'leisure_yoga', label: '瑜伽', scene: '瑜伽垫、镜面教室' },
      ]},
    ],
  },
  {
    id: 'hotel',
    label: '酒旅',
    children: [
      { id: 'hotel_stay', label: '酒店民宿', children: [
        { id: 'hotel_room', label: '酒店客房', scene: '客房床品、窗景' },
        { id: 'hotel_homestay', label: '民宿', scene: '民宿客厅、本地陈设' },
      ]},
      { id: 'hotel_spring', label: '温泉度假', children: [
        { id: 'hotel_onsen', label: '温泉', scene: '温泉池、毛巾' },
        { id: 'hotel_resort', label: '度假酒店', scene: '度假大堂、休闲区' },
      ]},
      { id: 'hotel_scenic', label: '景区游乐', children: [
        { id: 'hotel_scenic_spot', label: '景区', scene: '景点打卡、门票入口' },
        { id: 'hotel_kids', label: '亲子乐园', scene: '亲子游乐设施' },
      ]},
    ],
  },
  {
    id: 'pet',
    label: '宠物',
    children: [
      { id: 'pet_grooming', label: '宠物洗护', children: [
        { id: 'pet_bath', label: '宠物洗澡', scene: '宠物浴池、毛巾' },
        { id: 'pet_beauty', label: '宠物美容', scene: '修剪台、宠物造型' },
      ]},
      { id: 'pet_clinic', label: '宠物医疗', children: [
        { id: 'pet_vet', label: '宠物诊疗', scene: '宠物诊台、医生' },
        { id: 'pet_vaccine', label: '疫苗驱虫', scene: '宠物医院前台' },
      ]},
      { id: 'pet_supplies', label: '宠物用品', children: [
        { id: 'pet_food', label: '主粮零食', scene: '宠物粮、零食包装' },
        { id: 'pet_goods', label: '用品玩具', scene: '猫砂、牵引、玩具' },
      ]},
    ],
  },
  {
    id: 'education',
    label: '教育',
    children: [
      { id: 'edu_k12', label: 'K12学科', children: [
        { id: 'edu_k12_class', label: '学科辅导', scene: '教室、黑板、教材' },
        { id: 'edu_k12_1on1', label: '一对一', scene: '小教室、师生' },
      ]},
      { id: 'edu_art', label: '艺术兴趣', children: [
        { id: 'edu_art_draw', label: '美术', scene: '画架、颜料' },
        { id: 'edu_art_music', label: '音乐', scene: '乐器、琴房' },
        { id: 'edu_art_dance', label: '舞蹈', scene: '舞蹈教室、镜子' },
      ]},
      { id: 'edu_vocational', label: '职业技能', children: [
        { id: 'edu_skill_it', label: '电脑技能', scene: '电脑教室' },
        { id: 'edu_skill_job', label: '就业培训', scene: '实训工位' },
      ]},
    ],
  },
]

const ASPECTS = {
  '3:4': {
    label: '竖版 3:4',
    wanx: '832*1184',
    w: 832,
    h: 1184,
    lock: '【画幅锁定】整张图必须是竖版 3:4，主体和标题铺满四边。禁止画成横图，禁止在画布里再嵌一张别的比例海报，禁止纯色留边。',
  },
  '1:1': {
    label: '方形 1:1',
    wanx: '1024*1024',
    w: 1024,
    h: 1024,
    lock: '【画幅锁定】整张图必须是正方形 1:1，主体铺满四边。禁止竖版或横版海报居中贴在方图上，禁止纯色留边。',
  },
  '9:16': {
    label: '竖屏 9:16',
    wanx: '720*1280',
    w: 720,
    h: 1280,
    lock: '【画幅锁定】整张图必须是竖屏 9:16 全屏，主体铺满上下。禁止横图，禁止中间贴一张竖海报再留边。',
  },
  '4:3': {
    label: '横版 4:3',
    wanx: '1184*832',
    w: 1184,
    h: 832,
    lock: '【画幅锁定】整张图必须是横版 4:3，主体从左到右铺满。禁止竖版海报居中，禁止左右纯色大边。',
  },
  '16:9': {
    label: '横屏 16:9',
    wanx: '1280*720',
    w: 1280,
    h: 720,
    lock: '【画幅锁定】整张图必须是横屏 16:9，商品或服务场景铺满整个横画布。禁止画成竖版海报再居中贴上，禁止左右大面积纯色或卡纸留白。',
  },
  carousel: {
    label: '三连图',
    wanx: '1440*768',
    w: 1440,
    h: 768,
    lock: '【画幅锁定】超宽横幅，同一场景从左到右连续铺满。禁止竖版海报居中，禁止上下大留白。',
  },
}

function industries() {
  return TREE.map((n) => ({ id: n.id, label: n.label }))
}

function childrenOf(parentId, level) {
  if (level === 2) {
    const top = TREE.find((n) => n.id === parentId)
    return top ? top.children.map((n) => ({ id: n.id, label: n.label })) : []
  }
  for (const top of TREE) {
    const mid = top.children.find((n) => n.id === parentId)
    if (mid) return mid.children.map((n) => ({ id: n.id, label: n.label, scene: n.scene }))
  }
  return []
}

function resolveLeaf(leafId) {
  for (const top of TREE) {
    for (const mid of top.children) {
      const leaf = mid.children.find((n) => n.id === leafId)
      if (leaf) {
        return {
          industryId: top.id,
          industryLabel: top.label,
          midId: mid.id,
          midLabel: mid.label,
          leafId: leaf.id,
          leafLabel: leaf.label,
          scene: leaf.scene,
          path: `${top.label} / ${mid.label} / ${leaf.label}`,
        }
      }
    }
  }
  return null
}

function guessFromPath(text) {
  const raw = String(text || '')
  if (!raw.trim()) return null
  let best = null
  let score = 0
  for (const top of TREE) {
    for (const mid of top.children) {
      for (const leaf of mid.children) {
        const keys = [top.label, mid.label, leaf.label].concat(leaf.label.length > 2 ? [leaf.label.slice(0, 2)] : [])
        let s = 0
        keys.forEach((k) => {
          if (k && raw.indexOf(k) >= 0) s += k.length
        })
        if (s > score) {
          score = s
          best = leaf.id
        }
      }
    }
  }
  return score >= 2 ? resolveLeaf(best) : null
}

function aspectSpec(id) {
  return ASPECTS[id] || ASPECTS['3:4']
}

function stripInventedAspect(text) {
  return String(text || '')
    .replace(
      /竖构图|横构图|竖版海报|横版海报|竖屏海报|横屏海报|竖向海报|横向海报|竖版|横版|竖屏|横屏|竖图|横图|手机信息流|信息流竖图|海报比例|画幅|留白边|纯色边|9\s*[:：]\s*16|16\s*[:：]\s*9|3\s*[:：]\s*4|4\s*[:：]\s*3|1\s*[:：]\s*1|\d{3,4}\s*[*x×]\s*\d{3,4}/g,
      '',
    )
    .replace(/[，。]{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim()
}

function lockPromptToAspect(prompt, aspectId) {
  const spec = aspectSpec(aspectId)
  const body = stripInventedAspect(prompt)
  return `${body}\n${spec.lock}`
}

module.exports = {
  TREE,
  ASPECTS,
  industries,
  childrenOf,
  resolveLeaf,
  guessFromPath,
  aspectSpec,
  stripInventedAspect,
  lockPromptToAspect,
}
