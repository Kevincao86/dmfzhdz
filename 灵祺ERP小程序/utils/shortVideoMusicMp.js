/** 与 CS shortVideoMusicLibrary 同源；预览走 CDN */
const SHORT_VIDEO_MUSIC_LIBRARY = [
  {
    id: 'bgm-visit-night',
    title: '夜市烟火',
    description: '轻快节拍，适合夜市/夜宵探店开场',
    moods: ['探店', '美食', '城市'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-visit-night.m4a?v=bgm1',
    caseId: 'case-visit-night',
  },
  {
    id: 'bgm-skincare',
    title: '护肤清透',
    description: '柔和铺底，不抢口播，适合美妆种草',
    moods: ['种草', '美业'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-seed-skincare.m4a?v=bgm1',
    caseId: 'case-seed-skincare',
  },
  {
    id: 'bgm-promo',
    title: '大促冲击',
    description: '活力鼓点，适合满减/闪购预告',
    moods: ['促销'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-promo-event.m4a?v=bgm1',
    caseId: 'case-promo-event',
  },
  {
    id: 'bgm-cafe',
    title: '咖啡馆慵懒',
    description: '慢节奏空间氛围，适合横屏品牌片',
    moods: ['氛围', '探店'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-ambiance-cafe.m4a?v=bgm1',
    caseId: 'case-ambiance-cafe',
  },
  {
    id: 'bgm-drama',
    title: '短剧悬念',
    description: '紧张推进，适合冲突钩子前 3 秒',
    moods: ['短剧'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-drama-hook.m4a?v=bgm1',
    caseId: 'case-drama-hook',
  },
  {
    id: 'bgm-ramen',
    title: '拉面食欲',
    description: '温暖律动，衬托蒸汽与特写',
    moods: ['美食'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-food-ramen.m4a?v=bgm1',
    caseId: 'case-food-ramen',
  },
  {
    id: 'bgm-brunch',
    title: '早午餐明亮',
    description: '清新轻盈，自然光探店',
    moods: ['探店', '美食'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-visit-brunch.m4a?v=bgm1',
    caseId: 'case-visit-brunch',
  },
  {
    id: 'bgm-gadget',
    title: '数码科技',
    description: '干净节奏，适合桌面/小物种草',
    moods: ['种草'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-seed-gadget.m4a?v=bgm1',
    caseId: 'case-seed-gadget',
  },
  {
    id: 'bgm-hotpot',
    title: '火锅热闹',
    description: '升温鼓点，适合聚餐局',
    moods: ['美食', '探店'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-hotpot.m4a?v=bgm1',
    caseId: 'case-hotpot',
  },
  {
    id: 'bgm-bbq',
    title: '烧烤街头',
    description: '夜感律动，炭火撸串',
    moods: ['美食', '城市'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-bbq.m4a?v=bgm1',
    caseId: 'case-bbq',
  },
  {
    id: 'bgm-milktea',
    title: '新茶饮甜感',
    description: '轻快偏甜，适合杯身/上新',
    moods: ['美食', '促销'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-milktea.m4a?v=bgm1',
    caseId: 'case-milktea',
  },
  {
    id: 'bgm-hair',
    title: '美发时尚',
    description: '潮流氛围，变装前后对比',
    moods: ['美业'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-hair.m4a?v=bgm1',
    caseId: 'case-hair',
  },
  {
    id: 'bgm-nail',
    title: '美甲精致',
    description: '柔音微距，完成面展示',
    moods: ['美业'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-nail.m4a?v=bgm1',
    caseId: 'case-nail',
  },
  {
    id: 'bgm-gym',
    title: '健身能量',
    description: '驱动感强，训练打卡',
    moods: ['健身'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-gym.m4a?v=bgm1',
    caseId: 'case-gym',
  },
  {
    id: 'bgm-hotel',
    title: '酒店质感',
    description: '慢铺高级感，客房漫游',
    moods: ['酒店', '氛围'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-hotel.m4a?v=bgm1',
    caseId: 'case-hotel',
  },
  {
    id: 'bgm-kids',
    title: '亲子欢快',
    description: '跳跃明亮，遛娃乐园',
    moods: ['亲子'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-kids.m4a?v=bgm1',
    caseId: 'case-kids',
  },
  {
    id: 'bgm-pet',
    title: '萌宠轻柔',
    description: '温暖不吵，猫咖互动',
    moods: ['萌宠'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-pet.m4a?v=bgm1',
    caseId: 'case-pet',
  },
  {
    id: 'bgm-takeaway',
    title: '外卖家常',
    description: '轻松节奏，开箱第一口',
    moods: ['美食'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-takeaway.m4a?v=bgm1',
    caseId: 'case-takeaway',
  },
  {
    id: 'bgm-bakery',
    title: '烘焙黄油',
    description: '暖调铺底，出炉切片',
    moods: ['美食', '氛围'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-bakery.m4a?v=bgm1',
    caseId: 'case-bakery',
  },
  {
    id: 'bgm-queue',
    title: '城市游走',
    description: '街头感，排队种草到店',
    moods: ['探店', '城市'],
    previewUrl: 'https://mofangdianai.com/erp-mp-static/short-video-bgm/case-queue.m4a?v=bgm1',
    caseId: 'case-queue',
  },
]

const KEYWORD_MOOD = [
  { re: /夜市|夜宵|探店|排队|网红店|门头/, mood: '探店' },
  { re: /火锅|烧烤|拉面|面包|烘焙|外卖|奶茶|茶饮|美食|蒸汽/, mood: '美食' },
  { re: /大促|满减|活动|福利|闪购|618|促销/, mood: '促销' },
  { re: /咖啡馆|氛围|空间|品牌|漫游/, mood: '氛围' },
  { re: /种草|护肤|精华|数码|小物|产品/, mood: '种草' },
  { re: /短剧|悬念|冲突|反转/, mood: '短剧' },
  { re: /美发|美甲|美睫|护肤|变装/, mood: '美业' },
  { re: /健身|训练|打卡|汗/, mood: '健身' },
  { re: /酒店|民宿|客房/, mood: '酒店' },
  { re: /亲子|遛娃|乐园|儿童/, mood: '亲子' },
  { re: /猫|狗|宠物|萌宠/, mood: '萌宠' },
  { re: /街头|城市|街景/, mood: '城市' },
]

function recommendMusicForPrompt(prompt) {
  const text = String(prompt || '').trim()
  if (!text) return SHORT_VIDEO_MUSIC_LIBRARY.slice(0, 6)
  const scores = new Map()
  for (const { re, mood } of KEYWORD_MOOD) {
    if (!re.test(text)) continue
    for (const t of SHORT_VIDEO_MUSIC_LIBRARY) {
      if (!(t.moods || []).includes(mood)) continue
      scores.set(t.id, (scores.get(t.id) || 0) + 2)
    }
  }
  const ranked = SHORT_VIDEO_MUSIC_LIBRARY.slice().sort(
    (a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0),
  )
  const hit = ranked.filter((t) => (scores.get(t.id) || 0) > 0)
  return (hit.length ? hit : ranked).slice(0, 8)
}

function findMusicTrack(id) {
  if (!id) return null
  return SHORT_VIDEO_MUSIC_LIBRARY.find((t) => t.id === id) || null
}

function listMusicByMood(mood) {
  if (!mood || mood === '全部') return SHORT_VIDEO_MUSIC_LIBRARY.slice()
  return SHORT_VIDEO_MUSIC_LIBRARY.filter((t) => (t.moods || []).includes(mood))
}

const MUSIC_MOODS = ['全部','探店','美食','促销','氛围','种草','短剧','美业','健身','酒店','亲子','萌宠','城市']

module.exports = {
  SHORT_VIDEO_MUSIC_LIBRARY,
  MUSIC_MOODS,
  recommendMusicForPrompt,
  findMusicTrack,
  listMusicByMood,
}
