/** 短剧制作目录 — 对齐电脑端场景/钩子，手机端精简（无无限画布） */

const WORLDS = [
  {
    id: 'catering',
    label: '餐饮',
    blurb: '火锅、烧烤、茶饮到日料西餐。钩子围着菜单、价格和第一口。',
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
    blurb: '景点打卡、酒店入住、攻略翻车。钩子围着第一眼和值不值。',
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
    blurb: '一日跟拍、搬家、探店日记。手持生活感，前三秒就要人设。',
    promptKind: 'vlog',
    fields: [
      { key: 'storeName', label: '主题', placeholder: '例：搬进新合租' },
      { key: 'offerName', label: '主角人设', placeholder: '例：北漂打工人' },
      { key: 'price', label: '今日目标', placeholder: '例：把衣柜装完' },
      { key: 'area', label: '城市 / 空间', placeholder: '例：上海合租' },
    ],
  },
  {
    id: 'retail',
    label: '零售探店',
    blurb: '服饰、美妆、潮玩、超市开箱。钩子围着试穿试色。',
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
    blurb: '试驾、提车、车内场景。钩子围着关门声和第一脚油。',
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
    blurb: '看房、收房、改造前后。钩子围着推开门那一帧。',
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
    blurb: '兴趣课、考证、干货口播短剧化。钩子围着学会那一秒。',
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
    blurb: '数码开箱、家居联动、软件演示。钩子围着功能打脸。',
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
    blurb: '职场、情感、重生、豪门。人物关系驱动；手机端建议 8–15 秒竖屏。',
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
    blurb: '校园、古风、条漫、战斗。二维分格，不要拍成真人探店。',
    promptKind: 'comic',
    fields: [
      { key: 'storeName', label: '作品名', placeholder: '例：放学后的秘密' },
      { key: 'offerName', label: '主角人设', placeholder: '例：黑发高中生' },
      { key: 'price', label: '分格风格', placeholder: '例：竖屏条漫' },
      { key: 'area', label: '世界观', placeholder: '例：现代校园' },
    ],
  },
]

const SCENES = [
  { id: 'hotpot', world: 'catering', name: '火锅局', hook: '红油翻滚，熟人局开场就吵', mustSee: '红油、蒸汽、涮菜、举杯', visual: '暖实用光，铜锅特写，烟火气写实' },
  { id: 'bbq', world: 'catering', name: '烧烤夜宵', hook: '炭火滋滋，夜市才刚开始', mustSee: '炭火、刷酱、油光、街灯', visual: '夜市路灯，刷酱滋滋，跟拍咬一口' },
  { id: 'tea', world: 'catering', name: '茶饮咖啡', hook: '第一口决定会不会发朋友圈', mustSee: '杯身、原料、第一口特写', visual: '自然光浅景深，杯壁水珠' },
  { id: 'noodles', world: 'catering', name: '面馆拉面', hook: '出锅那一秒必须拉丝', mustSee: '出锅、拉丝、热气、吸面', visual: '后厨热气，汤面特写' },
  { id: 'home_cook', world: 'catering', name: '家常正餐', hook: '招牌菜上桌递给第一口', mustSee: '装盘、硬菜、围桌', visual: '圆桌硬菜，真实聚餐' },
  { id: 'bakery', world: 'catering', name: '烘焙甜品', hook: '切开断面比海报好看', mustSee: '切开拉丝、裱花、第一口', visual: '奶油拉丝，橱窗自然光' },
  { id: 'seafood', world: 'catering', name: '海鲜大排档', hook: '蒸汽开盖那一下最香', mustSee: '蒸笼开盖、海鲜特写、夜市', visual: '夜市蒸汽，海鲜鲜活感' },
  { id: 'buffet', world: 'catering', name: '自助烤肉', hook: '夹到招牌肉才算开场', mustSee: '烤盘、翻面、滋滋油光', visual: '烤盘特写，跟拍夹肉' },
  { id: 'breakfast', world: 'catering', name: '早点摊', hook: '天亮前那一口最真实', mustSee: '蒸笼、油条或粥、街边', visual: '清晨街边，烟火气克制' },
  { id: 'takeaway', world: 'catering', name: '外卖开箱', hook: '拆袋比吃更有戏', mustSee: '拆袋、摆盘、份量、第一口', visual: '桌面俯拍拆袋，干脆运镜' },
  { id: 'japan', world: 'catering', name: '日料寿司', hook: '刀工那一下最安静', mustSee: '切鱼、握寿司、酱油', visual: '干净台面，克制运镜' },
  { id: 'western', world: 'catering', name: '西餐约会', hook: '烛光比菜单更危险', mustSee: '摆盘、碰杯、第一口', visual: '暖光浅景深，餐具质感' },
  { id: 'hotpot_base', world: 'catering', name: '粥底夜宵', hook: '凌晨三点才懂这口', mustSee: '砂锅、配菜、夜色', visual: '深夜街边，蒸汽克制' },
  { id: 'hair', world: 'leisure', name: '美发造型', hook: '镜子一转前后不是同一个人', mustSee: '镜子、剪吹、前后对比', visual: '干净镜面，剪发跟拍' },
  { id: 'nail', world: 'leisure', name: '美甲美睫', hook: '特写比整张脸更有说服力', mustSee: '色板、微距完成面', visual: '微距完成面，缓慢环绕' },
  { id: 'skin', world: 'leisure', name: '皮肤管理', hook: '仪器贴上脸最安静', mustSee: '床位、仪器、肤感', visual: '通透白光，专业克制' },
  { id: 'gym', world: 'leisure', name: '健身瑜伽', hook: '动作比口号更像广告', mustSee: '训练、汗水、教练', visual: '跟拍训练，慢动作发力' },
  { id: 'kids', world: 'leisure', name: '亲子乐园', hook: '孩子笑了家长才下单', mustSee: '玩耍、家长旁观、安全场地', visual: '明亮场地，轻快跟拍' },
  { id: 'pet', world: 'leisure', name: '宠物友好', hook: '萌宠特写抢走前三秒', mustSee: '萌宠脸、互动、店内', visual: '浅景深萌宠特写' },
  { id: 'spa', world: 'leisure', name: '足浴按摩', hook: '进门肩膀就卸下来', mustSee: '足浴盆、手法、昏光', visual: '昏暖灯光，手法特写' },
  { id: 'hotel', world: 'leisure', name: '酒店民宿', hook: '推开门那一帧决定订不订', mustSee: '推开门、床品、窗景', visual: '缓慢推轨，干净高级' },
  { id: 'ktv', world: 'leisure', name: 'KTV 酒吧', hook: '第一首歌把气氛掀起来', mustSee: '包厢灯、麦克风、举杯', visual: '包厢彩光克制，跟拍唱歌' },
  { id: 'escape', world: 'leisure', name: '剧本杀密室', hook: '进门就进另一条时间线', mustSee: '机关、线索、惊吓反应', visual: '暗调场景，线索特写，禁止血腥' },
  { id: 'billiard', world: 'leisure', name: '台球桌游', hook: '一杆清台才说话', mustSee: '击球、球桌、欢呼', visual: '台球厅灯光，击球慢动作' },
  { id: 'flower', world: 'leisure', name: '鲜花礼品', hook: '拆纸的声音就能留人', mustSee: '花束、包装、递出', visual: '自然光花材特写' },
  { id: 'scenic', world: 'travel', name: '景点打卡', hook: '下车第一眼就要想发圈', mustSee: '门头或地标、打卡位、笑脸', visual: '户外自然光，跟拍行走' },
  { id: 'citywalk', world: 'travel', name: '城市漫步', hook: '巷子拐角才有故事', mustSee: '街巷、咖啡或小吃、脚步', visual: '手持跟拍，城市纹理' },
  { id: 'hotel_checkin', world: 'travel', name: '酒店入住', hook: '推开门那一帧决定好评', mustSee: '房卡、推门、窗景床品', visual: '缓慢推轨，干净高级' },
  { id: 'guide_fail', world: 'travel', name: '攻略翻车', hook: '网红点排队两小时', mustSee: '长队、表情、改道惊喜', visual: '真实跟拍，情绪清晰' },
  { id: 'roadtrip', world: 'travel', name: '自驾公路', hook: '车窗风一吹人就松了', mustSee: '车内、公路、落日', visual: '车窗光影，跟拍公路' },
  { id: 'food_travel', world: 'travel', name: '美食旅行', hook: '为这一口专程飞来', mustSee: '当地小吃、第一口、街景', visual: '街头烟火气，克制' },
  { id: 'camp', world: 'travel', name: '露营星空', hook: '帐篷外比滤镜好看', mustSee: '帐篷、篝火或星空、朋友', visual: '户外自然光到夜景过渡' },
  { id: 'museum', world: 'travel', name: '博物馆一日', hook: '展柜前忽然安静', mustSee: '展品、观众反应、笔记', visual: '展厅柔光，禁止乱闪' },
  { id: 'day_in_life', world: 'vlog', name: '一日跟拍', hook: '闹钟响了人设就出来', mustSee: '起床、通勤、收尾', visual: '手持生活感，自然光' },
  { id: 'move_house', world: 'vlog', name: '搬家日记', hook: '纸箱一拆情绪就上来', mustSee: '纸箱、空房、第一晚', visual: '手持跟拍，真实凌乱' },
  { id: 'startup', world: 'vlog', name: '创业日记', hook: '成交或翻车都要拍', mustSee: '工位、客户、数据或订单', visual: '办公实拍，屏幕可读' },
  { id: 'study', world: 'vlog', name: '学习打卡', hook: '台灯亮着就不准放弃', mustSee: '书桌、笔记、时钟', visual: '夜台灯，安静跟拍' },
  { id: 'couple', world: 'vlog', name: '情侣日常', hook: '小事比告白更狠', mustSee: '并肩、拌嘴、和好', visual: '暖光双人，手持' },
  { id: 'pet_vlog', world: 'vlog', name: '萌宠日常', hook: '它一抬头你就输了', mustSee: '萌宠脸、互动、家', visual: '浅景深萌宠特写' },
  { id: 'fitness_vlog', world: 'vlog', name: '健身打卡', hook: '最后一组才说话', mustSee: '训练、汗水、称重或镜子', visual: '跟拍发力，慢动作' },
  { id: 'shop_diary', world: 'vlog', name: '探店日记', hook: '推门前先吐槽预期', mustSee: '推门、点单、第一口', visual: '手持探店，真实反应' },
  { id: 'fashion', world: 'retail', name: '服饰试穿', hook: '镜子一转人设换了', mustSee: '试衣间、镜子前后、面料', visual: '商场自然光，跟拍试穿' },
  { id: 'beauty', world: 'retail', name: '美妆试色', hook: '试色比参数更能留人', mustSee: '色号、手臂或唇部、镜子', visual: '微距试色，通透光' },
  { id: 'sneaker', world: 'retail', name: '潮鞋开箱', hook: '拆盒比上脚更有戏', mustSee: '拆盒、鞋面特写、上脚', visual: '干净桌面，材质特写' },
  { id: 'toy', world: 'retail', name: '潮玩盲盒', hook: '拆到隐藏款才算赢', mustSee: '拆盒、手办、表情', visual: '桌面俯拍，情绪特写' },
  { id: 'supermarket', world: 'retail', name: '超市开箱', hook: '购物车比清单更诚实', mustSee: '货架、扫码、开箱', visual: '手持跟拍货架' },
  { id: 'jewelry', world: 'retail', name: '珠宝首饰', hook: '戴上那一秒眼神变了', mustSee: '首饰微距、佩戴、镜子', visual: '高级克制光，材质清晰' },
  { id: 'home_goods', world: 'retail', name: '家居软装', hook: '摆上桌才算真正开箱', mustSee: '拆箱、摆放、空间前后', visual: '家居自然光，俯拍' },
  { id: 'testdrive', world: 'auto', name: '试驾体验', hook: '第一脚油门决定种草', mustSee: '上车、仪表、起步', visual: '座舱清晰，公路跟拍' },
  { id: 'pickup', world: 'auto', name: '提车仪式', hook: '交钥匙那帧最贵', mustSee: '车头、钥匙、合影', visual: '展厅干净光，仪式感' },
  { id: 'cabin', world: 'auto', name: '座舱科技', hook: '屏幕一点灯全亮', mustSee: '中控屏、语音、氛围灯', visual: '夜色座舱，屏幕可读' },
  { id: 'compare_car', world: 'auto', name: '同价对比', hook: '并排一开差距出来', mustSee: '两车并排、同路试、结论', visual: '公路对比，克制字幕' },
  { id: 'family_car', world: 'auto', name: '家用场景', hook: '后排孩子先投票', mustSee: '后排、储物、上下车', visual: '家庭用车真实跟拍' },
  { id: 'ev_charge', world: 'auto', name: '补能日常', hook: '插枪那一下最安静', mustSee: '充电桩、电量、等待', visual: '夜间充电站，实用光' },
  { id: 'viewing', world: 'home', name: '看房推门', hook: '推开门那一帧定生死', mustSee: '推门、采光、格局', visual: '缓慢推轨，真实样板间' },
  { id: 'handover', world: 'home', name: '收房验收', hook: '卷尺比销售更诚实', mustSee: '卷尺、空房、问题点', visual: '空房自然光，跟拍验收' },
  { id: 'reno_before', world: 'home', name: '改造前后', hook: '同一角度前后打脸', mustSee: '同机位前后、关键改动', visual: '前后对比，干净构图' },
  { id: 'soft_unbox', world: 'home', name: '软装开箱', hook: '摆上才算真正完工', mustSee: '拆箱、摆放、空间氛围', visual: '家居自然光' },
  { id: 'kitchen', world: 'home', name: '厨房动线', hook: '开火那一下最香', mustSee: '台面、收纳、开火', visual: '厨房实用光，跟拍' },
  { id: 'balcony', world: 'home', name: '阳台生活', hook: '一杯咖啡就住进来', mustSee: '阳台、绿植、窗外', visual: '自然光，慢节奏' },
  { id: 'kids_class', world: 'edu', name: '少儿兴趣课', hook: '孩子举手最能转化', mustSee: '举手、作品、课堂', visual: '明亮教室，信任感' },
  { id: 'exam', world: 'edu', name: '考证冲刺', hook: '倒计时板上写着要命', mustSee: '倒计时、刷题、突破', visual: '夜自习感，克制' },
  { id: 'skill', world: 'edu', name: '技能实操', hook: '第一次做对那一秒', mustSee: '动手、成品、老师点评', visual: '工坊或教室跟拍' },
  { id: 'talk', world: 'edu', name: '干货口播', hook: '第一句就要打脸认知', mustSee: '出镜、要点板书或字幕克制', visual: '干净背景，人物清晰' },
  { id: 'parent', world: 'edu', name: '家长课', hook: '家长先慌，老师先稳', mustSee: '家长提问、示范、释然', visual: '明亮教室，关系清楚' },
  { id: 'online', world: 'edu', name: '线上直播课', hook: '弹幕比掌声更吵', mustSee: '屏幕、互动、知识点', visual: '过肩拍屏幕，界面可读' },
  { id: 'phone', world: 'tech', name: '数码开箱', hook: '拆封比参数更有戏', mustSee: '拆封、机身、上手', visual: '干净桌面俯拍，材质特写' },
  { id: 'smarthome', world: 'tech', name: '家居联动', hook: '一句话灯就亮了', mustSee: '开关灯、音箱、生活场景', visual: '现代客厅，灯光变化' },
  { id: 'gadget', world: 'tech', name: '桌面配件', hook: '桌面一换效率跟着换', mustSee: '桌面布置、配件、操作', visual: '冷色桌面，手部操作' },
  { id: 'ev', world: 'tech', name: '出行科技', hook: '关门那一声就要高级', mustSee: '车门、仪表、起步', visual: '座舱屏幕清晰，克制夜景' },
  { id: 'saas', world: 'tech', name: '软件演示', hook: '屏幕结果当场打脸质疑', mustSee: '屏幕界面、操作、前后对比', visual: '过肩拍屏幕，禁止乱码界面' },
  { id: 'office_tool', world: 'tech', name: '办公效率', hook: '加班到一半被工具救了', mustSee: '工位、屏幕结果、表情变化', visual: '夜晚台灯，屏幕内容可读' },
  { id: 'wearable', world: 'tech', name: '穿戴设备', hook: '手腕一抬数据就说话', mustSee: '手表特写、运动或通知', visual: '手腕微距，运动场景' },
  { id: 'camera', world: 'tech', name: '影像设备', hook: '按下快门前后反差', mustSee: '相机、取景、成片对比', visual: '器材质感，取景框叙事' },
  { id: 'workplace', world: 'drama', name: '职场打脸', hook: '被压的人手里还有后手', mustSee: '对峙、证据、表情反转', visual: '当代办公室，表情清晰' },
  { id: 'romance', world: 'drama', name: '情感悬念', hook: '一句对白把关系掀翻', mustSee: '近景、对白口型、停顿', visual: '都市暖光或夜色，情绪特写' },
  { id: 'family', world: 'drama', name: '家庭伦理', hook: '饭桌上那句话不能收回', mustSee: '餐桌、对视、沉默', visual: '家常餐厅灯光，关系清楚' },
  { id: 'suspense', world: 'drama', name: '悬疑钩子', hook: '开门瞬间先别出声', mustSee: '门缝、惊觉、定格', visual: '冷色走廊，浅景深' },
  { id: 'sweet', world: 'drama', name: '甜宠误会', hook: '先吵再被小事砸中', mustSee: '争执、线索、改口', visual: '清透都市，节奏轻快' },
  { id: 'teaser', world: 'drama', name: '下集预告', hook: '高潮切黑只留一句', mustSee: '高潮碎片、切黑、旁白', visual: '快切定格，禁止片尾表' },
  { id: 'revenge', world: 'drama', name: '逆袭翻盘', hook: '最被看不起的人先赢', mustSee: '被嘲、证据、翻盘', visual: '都市写实，节奏加快' },
  { id: 'campus_live', world: 'drama', name: '校园写实', hook: '放学铃一响事情就变了', mustSee: '校门口、书包、对峙', visual: '校园写实，自然光' },
  { id: 'rebirth', world: 'drama', name: '重生开局', hook: '睁眼回到关键那天', mustSee: '惊醒、日历或旧物、决意', visual: '都市写实，时间感道具' },
  { id: 'tycoon', world: 'drama', name: '豪门恩怨', hook: '宴会一句话掀桌', mustSee: '宴会、对峙、身份反差', visual: '奢华克制，表情清晰' },
  { id: 'crime', world: 'drama', name: '刑侦钩子', hook: '证据比口供先说话', mustSee: '现场线索、对质、反转', visual: '冷色写实，禁止血腥特写' },
  { id: 'costume', world: 'drama', name: '古装权谋', hook: '一封折子改命运', mustSee: '宫装或衙门、奏折、对视', visual: '古装写实，服饰清楚，禁止低俗' },
  { id: 'period', world: 'drama', name: '年代剧', hook: '旧收音机里有秘密', mustSee: '年代道具、邻里、信件', visual: '怀旧色调，道具准确' },
  { id: 'flash_marry', world: 'drama', name: '闪婚契约', hook: '先签字再谈感情', mustSee: '合同、对视、犹豫', visual: '都市写实，节奏干脆' },
  { id: 'school', world: 'comic', name: '校园日常', hook: '放学铃一响开始不对劲', mustSee: '教室、大特写、分格', visual: '日漫赛璐珞，眼睛高光' },
  { id: 'xianxia', world: 'comic', name: '古风仙侠', hook: '剑未出鞘气势先到', mustSee: '古装、兵器、广袖', visual: '国漫厚涂，二维，禁止真人古装剧' },
  { id: 'urban_power', world: 'comic', name: '都市异能', hook: '地铁里忽然不是同一世界', mustSee: '都市+异能、变装', visual: '都市漫画，克制光效' },
  { id: 'gag', world: 'comic', name: '搞笑条漫', hook: '第三格必须打脸', mustSee: '分格、夸张表情', visual: '四格/条漫，竖屏阅读方向' },
  { id: 'battle', world: 'comic', name: '战斗高潮', hook: '出招那一帧要停得住', mustSee: '出招、冲击线、反应', visual: '速度线与动态 pose' },
  { id: 'comic_sweet', world: 'comic', name: '甜宠漫画', hook: '对视比告白更有杀伤力', mustSee: '近景、脸红、留白', visual: '韩漫清透，大眼睛近景' },
  { id: 'horror_comic', world: 'comic', name: '怪谈一格', hook: '最后一格才发现不对', mustSee: '日常铺垫、异常细节', visual: '冷色分格，禁止过度血腥' },
  { id: 'wuxia', world: 'comic', name: '武侠江湖', hook: '客栈里先让一步', mustSee: '客栈、兵器、对峙', visual: '水墨或国漫武侠二维' },
  { id: 'nature_comic', world: 'comic', name: '治愈自然', hook: '风一吹情绪就慢下来', mustSee: '树影、散步、静物', visual: '柔和色块，慢节奏分格' },
]

const DURATION_OPTIONS = [
  { sec: 8, label: '8 秒' },
  { sec: 12, label: '12 秒' },
  { sec: 15, label: '15 秒' },
]

function worldOf(id) {
  return WORLDS.find((w) => w.id === id) || WORLDS[0]
}

function scenesOf(worldId) {
  return SCENES.filter((s) => s.world === worldId)
}

function sceneOf(id) {
  return SCENES.find((s) => s.id === id) || SCENES[0]
}

function fillTokens(template, scene, shop) {
  const store = String((shop && shop.storeName) || '').trim() || '这一个项目'
  const offer = String((shop && shop.offerName) || '').trim() || scene.name
  const price = String((shop && shop.price) || '').trim() || '关键卖点'
  const area = String((shop && shop.area) || '').trim() || '当下'
  return String(template || '')
    .split('{店名}').join(store)
    .split('{卖点}').join(offer)
    .split('{品类}').join(scene.name)
    .split('{价格}').join(price)
    .split('{位置}').join(area)
}

function kindLine(promptKind) {
  if (promptKind === 'comic') {
    return '二维漫画/动画竖屏短剧，分格阅读感，禁止真人实拍质感，禁止餐饮探店。'
  }
  if (promptKind === 'drama') {
    return '真人写实都市短剧，前 3 秒必须冲突或反转。禁止二维漫画，禁止探店空镜堆砌。'
  }
  if (promptKind === 'product') {
    return '科技/汽车产品短剧，产品特写必须可读。禁止仙侠，禁止纯餐饮烟雾。'
  }
  if (promptKind === 'vlog') {
    return '竖屏生活短剧，手持纪实感，前 3 秒亮人设。禁止电影片头片尾，禁止精修广告片。'
  }
  return '本地生活真人写实竖屏短剧，前 3 秒必须冲突或反转。禁止办公室网文，禁止仙侠古装。'
}

function buildPrompt(world, scene, shop, story, dialogue) {
  const infoBits = (world.fields || [])
    .map((f) => {
      const v = String((shop && shop[f.key]) || '').trim()
      return v ? `${f.label}「${v}」` : ''
    })
    .filter(Boolean)
    .join('，')
  const quoted = String(dialogue || '').trim()
  return [
    `【竖屏短剧·${world.label}·${scene.name}】`,
    kindLine(world.promptKind),
    `画面必须出现：${scene.mustSee}。${scene.visual}。`,
    infoBits ? `创作信息：${infoBits}。` : '',
    `主题：${fillTokens(story || scene.hook, scene, shop)}`,
    `钩子：${scene.hook}。`,
    quoted ? `对白钩子：「${quoted}」。` : '',
    '运镜跟拍，禁止拖沓空镜，禁止大面积海报字幕。口播与对白短、口语。禁止电影片头片尾和演职员表。',
  ]
    .filter(Boolean)
    .join('\n')
}

module.exports = {
  WORLDS,
  SCENES,
  DURATION_OPTIONS,
  worldOf,
  scenesOf,
  sceneOf,
  fillTokens,
  buildPrompt,
}
