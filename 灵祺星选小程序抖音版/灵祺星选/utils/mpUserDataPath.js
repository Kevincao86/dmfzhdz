/** 安全读取 wx.env.USER_DATA_PATH（模块顶层不可直接访问 wx.env） */
function readUserDataPath() {
  try {
    const root = wx && wx.env && wx.env.USER_DATA_PATH
    return root ? String(root) : ''
  } catch {
    return ''
  }
}

function joinUserDataPath(...parts) {
  const root = readUserDataPath()
  if (!root) return ''
  const tail = parts
    .map((p) => String(p || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
  return tail ? `${root}/${tail}` : root
}

module.exports = {
  readUserDataPath,
  joinUserDataPath,
}
