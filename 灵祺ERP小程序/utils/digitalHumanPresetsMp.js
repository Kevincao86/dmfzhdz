/**
 * 与商家 Web `PRESET_AVATARS` 同源：OSS 静态形象库（不含 Dicebear 卡通兜底）。
 */
const OSS =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/web-static/merchant/digital-human/avatars'
const VER = 'dh20260822'

const ROWS = [
  ['av-real-1', '晓晨', '餐饮店长', '男', 'av-real-1.jpg'],
  ['av-real-2', '悦然', '门店店长', '女', 'av-real-2.jpg'],
  ['av-real-3', '明哲', '团购讲解', '男', 'av-real-3.jpg'],
  ['av-real-4', '诗涵', '探店达人', '女', 'av-real-4.jpg'],
  ['av-real-5', '俊杰', '健身教练', '男', 'av-real-5.jpg'],
  ['av-real-6', '婉清', '美业顾问', '女', 'av-real-6.jpg'],
  ['av-real-7', '浩然', '酒店接待', '男', 'av-real-7.jpg'],
  ['av-real-8', '思琪', '茶饮店员', '女', 'av-real-8.jpg'],
  ['av-real-9', '子墨', '烧烤档口', '男', 'av-real-9.jpg'],
  ['av-real-10', '静雯', '到综前台', '女', 'av-real-10.jpg'],
  ['av-real-11', '嘉伟', '火锅店长', '男', 'av-real-11.jpg'],
  ['av-real-12', '雨桐', '美甲师', '女', 'av-real-12.jpg'],
  ['cartoon-1', '小祺', '门店 IP', '女', 'cartoon-1.jpg'],
  ['cartoon-2', '阿灵', '探店达人', '女', 'cartoon-2.jpg'],
  ['cartoon-3', '团子', '茶饮导购', '女', 'cartoon-3.jpg'],
]

function libraryAvatars() {
  return ROWS.map(([id, name, tag, gender, file]) => ({
    id,
    name,
    tag,
    gender,
    file,
    url: `${OSS}/${file}?v=${VER}`,
  }))
}

function downloadToDataUrl(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new Error('形象图下载失败'))
          return
        }
        try {
          const b64 = wx.getFileSystemManager().readFileSync(res.tempFilePath, 'base64')
          resolve({ path: res.tempFilePath, dataUrl: `data:image/jpeg;base64,${b64}` })
        } catch (e) {
          reject(e instanceof Error ? e : new Error('形象图读取失败'))
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '形象图下载失败'))
      },
    })
  })
}

module.exports = {
  libraryAvatars,
  downloadToDataUrl,
}
