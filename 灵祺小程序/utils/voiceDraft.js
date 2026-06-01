const config = require('./config.js')

/**
 * @param {'product'|'shortvideo'|'recruit'} moduleKey
 * @param {string} tempFilePath - wx.chooseMedia / RecorderManager 临时路径
 * @returns {Promise<object>} 草稿对象，写入各编辑页表单
 */
function requestVoiceDraft(moduleKey, tempFilePath) {
  const url = (config.VOICE_DRAFT_URL || '').trim()
  const token = wx.getStorageSync('meoo_access_token')

  if (!url || !tempFilePath || tempFilePath === 'mock') {
    return Promise.resolve(mockDraft(moduleKey))
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath: tempFilePath,
      name: 'audio',
      header: {
        Authorization: token ? `Bearer ${token}` : '',
        apikey: config.SUPABASE_ANON_KEY,
      },
      formData: { module: moduleKey },
      success(res) {
        try {
          const body = JSON.parse(res.data || '{}')
          if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body === 'object') {
            resolve(body.draft || body)
          } else {
            reject(new Error(body.error || body.message || `HTTP ${res.statusCode}`))
          }
        } catch (e) {
          reject(e)
        }
      },
      fail: reject,
    })
  })
}

function mockDraft(moduleKey) {
  if (moduleKey === 'product') {
    return {
      categoryName: '餐饮 · 火锅（演示）',
      productType: '团购套餐',
      title: '双人尝鲜套餐 · 语音草稿',
      subtitle: '含锅底任选、荤菜三份、素菜两份（请按门店实际修改）',
      priceHint: '¥168',
      tags: '爆款,双人',
      rawText: '（未配置 VOICE_DRAFT_URL，以上为模拟识别结果）',
    }
  }
  if (moduleKey === 'shortvideo') {
    return {
      hook: '开场：这家店锅底居然能喝三碗？',
      outline: '中段：展示菜品特写与店内环境\n结尾：引导团购下单',
      durationSec: '45',
      tags: '探店,同城',
      cta: '点击定位到店团购',
      rawText: '（演示草稿）',
    }
  }
  return {
    roleTitle: '同城美食探店达人',
    budget: '面议 · 可按播放量结算',
    deliverables: '1 条 60s 短视频 + 3 张图文',
    deadline: '7 天内交付初稿',
    notes: '优先垂类账号，需到店实拍',
    rawText: '（演示草稿）',
  }
}

module.exports = { requestVoiceDraft, mockDraft }
