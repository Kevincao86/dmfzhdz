/** 功能页图标 — 统一深蓝线稿 */
const NAVY = '#2f6fed'

const TONE_COLORS = {
  cyan: NAVY,
  orange: NAVY,
  violet: NAVY,
  blue: NAVY,
  teal: NAVY,
  amber: NAVY,
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
      '<path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z"/><path d="M19 11a7 7 0 01-14 0"/><path d="M12 18v3"/>',
    ),
  star: (c) => svgWrap(c, '<path d="M12 2l2.9 6.9H22l-5.5 4.2 2.1 6.9L12 16.9 5.4 20l2.1-6.9L2 8.9h7.1z"/>'),
  chat: (c) => svgWrap(c, '<path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h4a8 8 0 018 8z"/>'),
  gift: (c) =>
    svgWrap(
      c,
      '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-3-6-3-6 0s4 0 6 0 6-3 6 0-4 0-6 0"/>',
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
      '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2" y="14" width="5" height="6" rx="2"/><rect x="17" y="14" width="5" height="6" rx="2"/>',
    ),
  crown: (c) => svgWrap(c, '<path d="M3 8l3 10h12l3-10-4 3-3-5-3 5-4-3z"/>'),
  bind: (c) =>
    svgWrap(c, '<path d="M10 13a5 5 0 007.5 0"/><path d="M8 11l4-6 4 6"/><path d="M4 19h16"/>'),
  switchUser: (c) =>
    svgWrap(
      c,
      '<circle cx="12" cy="8" r="3.5"/><path d="M5 19c1.2-3.5 4.5-5 7-5s5.8 1.5 7 5"/><path d="M16 3.5h3.5V7"/><path d="M19.5 3.5A7 7 0 0014 8"/><path d="M8 20.5H4.5V17"/><path d="M4.5 20.5A7 7 0 0010 16"/>',
    ),
  book: (c) =>
    svgWrap(c, '<path d="M4 5a2 2 0 012-2h11v16H6a2 2 0 00-2 2V5z"/><path d="M6 19a2 2 0 012-2h11"/>'),
  settings: (c) =>
    svgWrap(
      c,
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    ),
  storeChart: (c) =>
    svgIcon(c, '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 16v-3M12 16V8M16 16v-5"/>'),
  menu: (c) => svgIcon(c, '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  brush: (c) =>
    svgIcon(c, '<path d="M15 4l5 5-2.2 2.2-5-5z"/><path d="M12.8 11.2L6 18"/><path d="M5 19.2c1.4.2 2.6-.4 3.2-1.4"/>'),
  box: (c) => svgIcon(c, '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>'),
  talent: (c) =>
    svgIcon(
      c,
      '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c1-3.2 3.2-4.8 5.5-4.8 1.4 0 2.8.6 3.8 1.6"/><path d="M17.2 3.6l.7 1.6 1.7.2-1.3 1.2.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.2 1.7-.2z"/>',
    ),
  compare: (c) => svgIcon(c, '<path d="M4 19h16"/><path d="M7 19V12M11 19V7M15 19V14M19 19V9"/>'),
  mapPin: (c) =>
    svgIcon(
      c,
      '<path d="M12 13.2c2-2.2 3.6-3.8 3.6-5.6a3.6 3.6 0 10-7.2 0c0 1.8 1.6 3.4 3.6 5.6z"/><circle cx="12" cy="7.5" r="1.2"/><path d="M4 17.5h16M7 20.5h10"/>',
    ),
  sparkDoc: (c) =>
    svgIcon(
      c,
      '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9.5 14h5M9.5 17h3"/><path d="M17.2 10.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/>',
    ),
  frame: (c) =>
    svgIcon(c, '<rect x="3" y="4" width="18" height="15" rx="2"/><circle cx="8.5" cy="9" r="1.4"/><path d="M3 15.5l4.5-3.5 3.5 2.5 2.5-2 7 4.5"/>'),
  penDoc: (c) =>
    svgIcon(c, '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h4"/><path d="M13.5 16.5l3.2-3.2 1.4 1.4-3.2 3.2H13.5z"/>'),
  avatarMic: (c) =>
    svgIcon(
      c,
      '<circle cx="8.5" cy="8" r="3"/><path d="M3.5 18.5c.9-3 3-4.5 5-4.5"/><rect x="15" y="6" width="3.2" height="6" rx="1.6"/><path d="M14.2 10.5a3.4 3.4 0 006.6 0"/><path d="M17.5 13.8V16"/>',
    ),
  clapper: (c) =>
    svgIcon(
      c,
      '<path d="M4 9h16v9.5a2 2 0 01-2 2H6a2 2 0 01-2-2V9z"/><path d="M4 9l2.4-4.2h2.6L6.8 9M9.2 4.8h2.8L9.6 9M14.2 4.8h2.6L14.4 9M19.2 9l-1.4-4.2"/>',
    ),
  megaphone: (c) =>
    svgIcon(c, '<path d="M4 10v4h3l8 3.5V6.5L7 10H4z"/><path d="M16.2 9.2a3.2 3.2 0 010 5.6"/><path d="M7.2 14v2.2A1.4 1.4 0 008.6 17.6H9"/>'),
  userPlus: (c) =>
    svgIcon(c, '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c1-3.2 3.2-4.8 5.5-4.8s4.5 1.6 5.5 4.8"/><path d="M18 7v5M15.5 9.5h5"/>'),
  taxDoc: (c) =>
    svgIcon(c, '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9.5 13.5h5"/><path d="M10 16.5l4-4"/>'),
}

function svgIcon(color, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

function iconDataUri(tone, key) {
  const build = ICON_BUILDERS[key]
  if (!build) return ''
  const color = tone && String(tone).charAt(0) === '#' ? tone : NAVY
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(build(color))}`
}

module.exports = { iconDataUri, TONE_COLORS }
