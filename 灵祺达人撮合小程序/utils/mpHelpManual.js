/**
 * 小程序使用手册：直连 erp-api GET /api/meoo-help-manual-public?edition=mp
 */
const api = require('./api.js')

const EDITION = 'mp'
const PUBLIC_PATHS = [
  `/api/meoo-help-manual-public?edition=${EDITION}`,
  `/erp-api/meoo-help-manual-public?edition=${EDITION}`,
]

function sortByOrder(list) {
  return (list || []).slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

function topLevelCategories(categories) {
  return sortByOrder((categories || []).filter((c) => !c.parentId))
}

function childCategories(categories, parentId) {
  return sortByOrder((categories || []).filter((c) => c.parentId === parentId))
}

/** 与 Web 帮助手册一致：有二级则选二级，否则选一级 */
function buildSelectableCategories(categories) {
  const tops = topLevelCategories(categories)
  const tabs = []
  for (const top of tops) {
    const children = childCategories(categories, top.id)
    if (children.length) {
      for (const child of children) {
        tabs.push({
          id: child.id,
          title: child.title,
          group: top.title,
        })
      }
    } else {
      tabs.push({ id: top.id, title: top.title, group: '' })
    }
  }
  return tabs
}

function firstSelectableCategoryId(categories) {
  const tabs = buildSelectableCategories(categories)
  return tabs[0]?.id || ''
}

async function fetchMpHelpManual() {
  const raw = await api.tryPaths('GET', PUBLIC_PATHS)
  if (!raw || raw.ok !== true) {
    const err = raw && raw.error ? String(raw.error) : 'help_manual_load_failed'
    throw new Error(err)
  }
  const categories = sortByOrder(raw.categories || [])
  const articles = sortByOrder(raw.articles || [])
  return {
    edition: raw.edition || EDITION,
    categories,
    articles,
    productName: '灵祺星选小程序',
  }
}

/** @deprecated 使用 fetchMpHelpManual */
async function fetchFulfillmentHelpManual() {
  return fetchMpHelpManual()
}

module.exports = {
  EDITION,
  fetchMpHelpManual,
  fetchFulfillmentHelpManual,
  buildSelectableCategories,
  firstSelectableCategoryId,
  topLevelCategories,
  childCategories,
}
