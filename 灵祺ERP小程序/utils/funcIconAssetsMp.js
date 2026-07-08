/** 功能页图标 — 1:1 对齐 page-templates-v2.js ICONS，按 tone 着色 */
const TONE_COLORS = {
  cyan: '#0284c7',
  orange: '#ea580c',
  violet: '#7c3aed',
  blue: '#2563eb',
  teal: '#0d9488',
  amber: '#d97706',
}

function svgWrap(color, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8">${inner}</svg>`
}

const ICON_BUILDERS = {
  shop: (c) => svgWrap(c, '<path d="M3 10h18l-2 9H5L3 10z"/><path d="M7 10V7a5 5 0 0110 0v3"/>'),
  paint: (c) => svgWrap(c, '<path d="M14 3l7 7-8 8H6v-6l8-9z"/>'),
  chart: (c) => svgWrap(c, '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-3M12 15V8M16 15v-5"/>'),
  plus: (c) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  list: (c) => svgWrap(c, '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  mic: (c) =>
    svgWrap(
      c,
      '<path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z"/><path d="M19 11a7 7 0 01-14 0"/><path d="M12 18v3"/>'
    ),
  star: (c) => svgWrap(c, '<path d="M12 2l2.9 6.9H22l-5.5 4.2 2.1 6.9L12 16.9 5.4 20l2.1-6.9L2 8.9h7.1z"/>'),
  chat: (c) => svgWrap(c, '<path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h4a8 8 0 018 8z"/>'),
  gift: (c) =>
    svgWrap(
      c,
      '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-3-6-3-6 0s4 0 6 0 6-3 6 0-4 0-6 0"/>'
    ),
  pin: (c) => svgWrap(c, '<path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  ai: (c) =>
    svgWrap(c, '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h2v6H9zM13 9h2l-1 3 1 3h-2l-1-3z"/>'),
  play: (c) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z" fill="${c}" stroke="none"/></svg>`,
  trend: (c) => svgWrap(c, '<path d="M3 17l6-6 4 4 7-10"/><path d="M14 5h7v7"/>'),
  user: (c) => svgWrap(c, '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 6-6 8-6s6.5 2 8 6"/>'),
  wallet: (c) => svgWrap(c, '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M17 12h4"/>'),
  bell: (c) =>
    svgWrap(c, '<path d="M18 16H6l1.5-2V10a5.5 5.5 0 1111 0v4L18 16z"/><path d="M10 19a2 2 0 004 0"/>'),
  headset: (c) =>
    svgWrap(
      c,
      '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2" y="14" width="5" height="6" rx="2"/><rect x="17" y="14" width="5" height="6" rx="2"/>'
    ),
  crown: (c) => svgWrap(c, '<path d="M3 8l3 10h12l3-10-4 3-3-5-3 5-4-3z"/>'),
  bind: (c) =>
    svgWrap(c, '<path d="M10 13a5 5 0 007.5 0"/><path d="M8 11l4-6 4 6"/><path d="M4 19h16"/>'),
  switchUser: (c) =>
    svgWrap(
      c,
      '<circle cx="12" cy="8" r="3.5"/><path d="M5 19c1.2-3.5 4.5-5 7-5s5.8 1.5 7 5"/><path d="M16 3.5h3.5V7"/><path d="M19.5 3.5A7 7 0 0014 8"/><path d="M8 20.5H4.5V17"/><path d="M4.5 20.5A7 7 0 0010 16"/>'
    ),
}

function iconDataUri(tone, key) {
  const color = TONE_COLORS[tone] || '#334155'
  const build = ICON_BUILDERS[key]
  if (!build) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(build(color))}`
}

module.exports = { iconDataUri, TONE_COLORS }
