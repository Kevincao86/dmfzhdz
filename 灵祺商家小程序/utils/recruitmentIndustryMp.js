const douyinGoods = require('./douyinGoodsMp.js')

const FALLBACK = [
  '餐饮',
  '营销卡券',
  '休闲娱乐',
  '生活服务',
  '购物',
  '丽人',
  '医疗健康',
  '家居家装',
]

async function loadIndustryL1Labels() {
  const r = await douyinGoods.fetchCategoryTree()
  if (!r.ok || !Array.isArray(r.tree) || !r.tree.length) return FALLBACK.slice()
  const names = r.tree.map((n) => String(n.name || '').trim()).filter(Boolean)
  if (!names.length) return FALLBACK.slice()
  return Array.from(new Set(names))
}

module.exports = { loadIndustryL1Labels, FALLBACK }
