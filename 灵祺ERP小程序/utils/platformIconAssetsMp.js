/** 平台绑定 — 线条图标（透明底，按平台品牌色描边） */
const PLATFORM_COLORS = {
  douyin: '#111827',
  kuaishou: '#ff4906',
  local_promotion: '#2f6deb',
  xhs_commercial: '#ff2442',
  meituan: '#f59e0b',
  xiaohongshu: '#ff2442',
}

function svgWrap(color, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

const PLATFORM_BUILDERS = {
  douyin: (c) =>
    svgWrap(
      c,
      '<path d="M9 18V6l8 4-8 4"/><path d="M9 10l8 4"/><circle cx="7" cy="18" r="2" fill="none"/>'
    ),
  kuaishou: (c) =>
    svgWrap(
      c,
      '<rect x="5" y="7" width="14" height="12" rx="3"/><path d="M9 7l2-3h2l2 3"/><circle cx="12" cy="13" r="3"/>'
    ),
  local_promotion: (c) =>
    svgWrap(c, '<path d="M4 18V6"/><path d="M4 18h16"/><path d="M8 14l3-4 3 3 5-7"/><path d="M18 6h2v2"/>'),
  xhs_commercial: (c) =>
    svgWrap(
      c,
      '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/><path d="M9 9l6 6M15 9l-6 6" opacity=".35"/>'
    ),
  meituan: (c) =>
    svgWrap(c, '<path d="M6 8h12l-2 10H8L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/><path d="M10 13h4"/>'),
  xiaohongshu: (c) =>
    svgWrap(c, '<rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6M9 17h4"/>'),
}

function platformIconUri(platformId) {
  const color = PLATFORM_COLORS[platformId] || '#64748b'
  const build = PLATFORM_BUILDERS[platformId]
  if (!build) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(build(color))}`
}

module.exports = { platformIconUri, PLATFORM_COLORS }
