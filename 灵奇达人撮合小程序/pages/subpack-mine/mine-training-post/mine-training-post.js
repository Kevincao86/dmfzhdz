const training = require('../../../utils/mpTraining.js')
const cityPicker = require('../../../utils/publishCityPicker.js')

function todayDate() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function cityLabel(national, cities) {
  if (national) return '全国'
  const list = cities || []
  if (!list.length) return ''
  return list.length <= 2 ? list.join('、') : `${list.slice(0, 2).join('、')} 等${list.length}城`
}

function parseCity(raw) {
  const text = String(raw || '').trim()
  if (!text) return { cityNational: false, selectedCities: [] }
  if (text === '全国' || text === '不限') return { cityNational: true, selectedCities: [] }
  return {
    cityNational: false,
    selectedCities: text.split(/[、,，/]/).map((s) => s.trim()).filter(Boolean),
  }
}

function parseWhen(raw) {
  const text = String(raw || '').trim()
  const range = text.match(/^(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})[，,\s]*每天\s*(\d{2}:\d{2})\s*[-–—至到]\s*(\d{2}:\d{2})/)
  if (range) {
    return { whenStartDate: range[1], whenEndDate: range[2], whenStartTime: range[3], whenEndTime: range[4] }
  }
  const one = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
  if (one) {
    return { whenStartDate: one[1], whenEndDate: one[1], whenStartTime: one[2] || '14:00', whenEndTime: '16:00' }
  }
  return { whenStartDate: '', whenEndDate: '', whenStartTime: '14:00', whenEndTime: '16:00' }
}

function formatWhen(startDate, endDate, startTime, endTime) {
  if (!startDate || !endDate || !startTime || !endTime) return ''
  return `${startDate} 至 ${endDate}，每天 ${startTime}-${endTime}`
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function noteToHtml(note) {
  const text = String(note || '').trim()
  if (!text) return ''
  return text.split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join('')
}

function articlePlain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 800)
}

function normalizeEditorHtml(html) {
  let src = String(html || '')
    .replace(/<h1\b([^>]*)>/gi, '<h2$1>')
    .replace(/<\/h1>/gi, '</h2>')
  src = src.replace(/<([a-z0-9]+)([^>]*)>/gi, (full, tag, attrs) => {
    const cls = /class\s*=\s*["']([^"']*)["']/i.exec(attrs)
    if (!cls) return full
    const align = /ql-align-(left|center|right|justify)/.exec(cls[1])
    const size = /ql-size-(small|large|huge)/.exec(cls[1])
    const sizePx = size ? { small: '14px', large: '20px', huge: '24px' }[size[1]] : ''
    const extra = []
    if (align) extra.push(`text-align:${align[1]}`)
    if (sizePx) extra.push(`font-size:${sizePx}`)
    let next = attrs.replace(/\sclass\s*=\s*["'][^"']*["']/i, '')
    if (extra.length) {
      const style = /style\s*=\s*["']([^"']*)["']/i.exec(next)
      if (style) next = next.replace(style[0], `style="${style[1]};${extra.join(';')}"`)
      else next += ` style="${extra.join(';')}"`
    }
    return `<${tag}${next}>`
  })
  return src
}

function resolveImageSrc(src, map) {
  const raw = String(src || '').trim().replace(/&amp;/g, '&')
  if (/^https:\/\/[^\s"'<>]+$/i.test(raw) && raw.length < 500) return raw
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(raw)) return raw.length <= 280000 ? raw : ''
  const bag = map || {}
  if (bag[raw]) return bag[raw]
  const name = raw.split('/').pop()
  const key = Object.keys(bag).find((item) => item === raw || (name && item.endsWith(name)))
  if (key) return bag[key]
  if (!/^wxfile:|^https?:\/\/tmp|USER_DATA|train-img-/i.test(raw) && raw.indexOf('tmp') < 0) return ''
  try {
    const b64 = wx.getFileSystemManager().readFileSync(raw, 'base64')
    const url = `data:image/jpeg;base64,${b64}`
    return url.length <= 280000 ? url : ''
  } catch (_) {
    return ''
  }
}

function meetingCodeOf(text) {
  const raw = String(text || '')
  const compact = raw.replace(/[\s-]/g, '')
  if (/^\d{9,12}$/.test(compact)) return compact
  const labeled = raw.match(/会议号[:：\s]*([\d\s-]{9,24})/)
  if (!labeled) return ''
  const digits = labeled[1].replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 12 ? digits : ''
}

function guessLivePlatform(saved, value) {
  if (saved === 'meeting' || saved === 'channels' || saved === 'douyin') return saved
  const text = String(value || '')
  if (/meeting\.tencent\.com/i.test(text) || meetingCodeOf(text)) return 'meeting'
  if (/sph[a-zA-Z0-9_-]{3,}/.test(text)) return 'channels'
  if (/douyin\.com|iesdouyin\.com/i.test(text)) return 'douyin'
  return ''
}

function liveInputError(platform, value) {
  const text = String(value || '').trim()
  if (!platform) return '请选择直播平台'
  if (!text) return platform === 'channels' ? '请填写视频号 ID' : '请填写直播间链接'
  if (platform === 'meeting' && !/meeting\.tencent\.com/i.test(text) && !meetingCodeOf(text)) return '请填写会议链接或会议号'
  if (platform === 'channels' && !/sph[a-zA-Z0-9_-]{3,}/.test(text)) return '请填写视频号 ID'
  if (platform === 'douyin' && !/^https?:\/\/(?:[a-z0-9-]+\.)?(?:douyin\.com|iesdouyin\.com)\/\S+$/i.test(text)) return '请填写抖音直播链接'
  return ''
}

function restoreArticleImages(html, map) {
  let error = ''
  const next = String(html || '').replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi, (full, src) => {
    const data = resolveImageSrc(src, map)
    if (!data) {
      error = '有图片未能保存，请重新插入'
      return ''
    }
    if (data.length > 280000) {
      error = '有图片过大，请换一张较小的图'
      return ''
    }
    return `<img src="${data}" alt="">`
  })
  return { html: next, error }
}

function fieldView(fields) {
  const list = Array.isArray(fields) ? fields : []
  return {
    signupFields: list,
    signupOn: {
      name: list.some((field) => field.key === 'name'),
      idNo: list.some((field) => field.key === 'idNo'),
      phone: list.some((field) => field.key === 'phone'),
    },
    customFields: list.filter((field) => field.kind === 'text'),
  }
}

function blankForm() {
  return {
    editingId: '',
    title: '',
    mode: 'offline',
    city: '',
    address: '',
    contactName: '',
    contactWay: '',
    cityNational: false,
    selectedCities: [],
    cityDisplay: '',
    whenText: '',
    whenStartDate: '',
    whenEndDate: '',
    whenStartTime: '14:00',
    whenEndTime: '16:00',
    seats: '20',
    fee: '',
    poster: '',
    posterMp: '',
    detailCover: '',
    detailBody: '',
    liveUrl: '',
    livePlatform: 'meeting',
    note: '',
    ...fieldView([
      { key: 'name', label: '姓名', kind: 'name' },
      { key: 'idNo', label: '身份证号', kind: 'idNo' },
      { key: 'phone', label: '手机号', kind: 'phone' },
    ]),
    fieldDraft: '',
    cityOpen: false,
    cityKeyword: '',
    cityActiveProvince: '',
    cityProvinceRows: [],
    cityCheckGrid: [],
  }
}

function statusText(course) {
  if (course.reviewStatus === 'rejected') return '未通过'
  if (course.reviewStatus === 'pending') return '审核中'
  return '已通过'
}

Page({
  data: {
    view: 'list',
    depositOnly: false,
    paid: false,
    yuan: training.DEPOSIT_YUAN,
    todayDate: todayDate(),
    advanced: false,
    loading: true,
    mine: [],
    ...blankForm(),
  },
  onLoad(q) {
    this.setData({
      depositOnly: q.deposit === '1',
      paid: training.depositPaid(),
      advanced: training.isAdvancedMember(),
    })
  },
  async onShow() {
    let paid = training.depositPaid()
    try { paid = await training.syncDeposit() } catch (_) {}
    this.setData({
      paid,
      advanced: training.isAdvancedMember(),
    })
    if (this.data.view !== 'form') this.loadMine()
  },
  async loadMine() {
    this.setData({ loading: true })
    try {
      const mine = await training.listMine()
      this.setData({
        loading: false,
        mine: (mine || []).map((c) => ({
          ...c,
          statusText: statusText(c),
          statusKey: c.reviewStatus === 'rejected' || c.reviewStatus === 'pending' ? c.reviewStatus : 'approved',
          modeText: c.mode === 'offline' ? '线下' : '线上',
        })),
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },
  onOpenMember() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
  },
  onOpenWallet() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-wallet/mine-wallet' })
  },
  onSettle() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-settle/mine-training-settle' })
  },
  onCreate() {
    const reason = training.publishBlockReason()
    if (reason) {
      if (reason.indexOf('保证金') >= 0) {
        this.onOpenWallet()
        return
      }
      wx.showToast({ title: reason.slice(0, 18), icon: 'none' })
      return
    }
    this.editorCtx = null
    this._imgMap = {}
    this.setData({ view: 'form', ...blankForm() })
    wx.setNavigationBarTitle({ title: '新增培训' })
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title || '这门课程'
    wx.showModal({
      title: '删除课程',
      content: `删除「${title}」？删除后首页不再展示。已有学员报名的不能删除。`,
      confirmText: '删除',
      confirmColor: '#b42318',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        try {
          await training.deleteCourse(id)
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadMine()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: String((err && err.message) || '删除失败').slice(0, 18), icon: 'none' })
        }
      },
    })
  },
  onEdit(e) {
    const course = (this.data.mine || []).find((c) => c.id === e.currentTarget.dataset.id)
    if (!course) return
    const when = parseWhen(course.whenText)
    const online = course.mode === 'online'
    const city = online ? { cityNational: true, selectedCities: [], city: '全国', cityDisplay: '全国' } : (() => {
      const parsed = parseCity(course.city)
      return { ...parsed, city: course.city || '', cityDisplay: cityLabel(parsed.cityNational, parsed.selectedCities) }
    })()
    this.editorCtx = null
    this._imgMap = {}
    this.setData({
      view: 'form',
      editingId: course.id,
      title: course.title || '',
      mode: online ? 'online' : 'offline',
      ...city,
      address: course.address || '',
      contactName: course.contactName || '',
      contactWay: course.contactWay || '',
      liveUrl: course.liveUrl || '',
      livePlatform: guessLivePlatform(course.livePlatform, course.liveUrl || ''),
      ...when,
      whenText: formatWhen(when.whenStartDate, when.whenEndDate, when.whenStartTime, when.whenEndTime) || course.whenText || '',
      seats: String(course.seats || 20),
      fee: course.fee || '',
      poster: course.poster || '',
      posterMp: course.posterMp || '',
      detailCover: course.detailCover || '',
      detailBody: course.detailBody || '',
      note: course.note || '',
      ...fieldView(Array.isArray(course.signupFields) && course.signupFields.length ? course.signupFields : blankForm().signupFields),
    })
    wx.setNavigationBarTitle({ title: '编辑培训' })
  },
  onBack() {
    this.editorCtx = null
    this._imgMap = {}
    this.setData({ view: 'list', ...blankForm() })
    wx.setNavigationBarTitle({ title: '发布培训' })
    this.loadMine()
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onAddress(e) { this.setData({ address: e.detail.value }) },
  onContactName(e) { this.setData({ contactName: e.detail.value }) },
  onContactWay(e) { this.setData({ contactWay: e.detail.value }) },
  refreshCityUi(activeProvinceHint) {
    const hint = activeProvinceHint != null ? activeProvinceHint : this.data.cityActiveProvince
    const st = cityPicker.initModalState(this.data.cityKeyword, hint, this.data.selectedCities || [])
    this.setData({
      cityActiveProvince: st.activeProvince,
      cityProvinceRows: st.provinceRows,
      cityCheckGrid: st.cityCheckGrid,
    })
  },
  syncCity() {
    const national = !!this.data.cityNational
    const cities = this.data.selectedCities || []
    const city = national ? '全国' : cities.join('、')
    this.setData({ city, cityDisplay: cityLabel(national, cities) })
  },
  onOpenCity() {
    this.setData({ cityOpen: true, cityKeyword: '' }, () => this.refreshCityUi(''))
  },
  onCloseCity() {
    this.setData({ cityOpen: false })
  },
  onCityNational() {
    this.setData({ cityNational: true, selectedCities: [] }, () => {
      this.syncCity()
      this.refreshCityUi()
    })
  },
  onCityKeyword(e) {
    this.setData({ cityKeyword: e.detail.value }, () => this.refreshCityUi())
  },
  onCityProvinceTap(e) {
    const province = e.currentTarget.dataset.name
    if (!province || province === this.data.cityActiveProvince) return
    this.refreshCityUi(province)
  },
  onCityCheckTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const cities = [...(this.data.selectedCities || [])]
    const idx = cities.indexOf(name)
    if (idx >= 0) cities.splice(idx, 1)
    else cities.push(name)
    this.setData({ selectedCities: cities, cityNational: false }, () => {
      this.syncCity()
      this.refreshCityUi()
    })
  },
  onRemoveCity(e) {
    const name = e.currentTarget.dataset.name
    const cities = (this.data.selectedCities || []).filter((c) => c !== name)
    this.setData({ selectedCities: cities, cityNational: false }, () => {
      this.syncCity()
      this.refreshCityUi()
    })
  },
  onConfirmCity() {
    if (!this.data.cityNational && !(this.data.selectedCities || []).length) {
      wx.showToast({ title: '请选择全国或添加城市', icon: 'none' })
      return
    }
    this.syncCity()
    this.setData({ cityOpen: false })
  },
  syncWhen(patch) {
    const next = Object.assign({}, this.data, patch)
    next.whenText = formatWhen(next.whenStartDate, next.whenEndDate, next.whenStartTime, next.whenEndTime)
    this.setData({
      whenStartDate: next.whenStartDate,
      whenEndDate: next.whenEndDate,
      whenStartTime: next.whenStartTime,
      whenEndTime: next.whenEndTime,
      whenText: next.whenText,
    })
  },
  onWhenStartDate(e) {
    const whenStartDate = e.detail.value
    const whenEndDate = this.data.whenEndDate && this.data.whenEndDate < whenStartDate ? whenStartDate : this.data.whenEndDate
    this.syncWhen({ whenStartDate, whenEndDate })
  },
  onWhenEndDate(e) {
    this.syncWhen({ whenEndDate: e.detail.value })
  },
  onWhenStartTime(e) {
    this.syncWhen({ whenStartTime: e.detail.value })
  },
  onWhenEndTime(e) {
    this.syncWhen({ whenEndTime: e.detail.value })
  },
  onSeats(e) { this.setData({ seats: e.detail.value }) },
  onFee(e) { this.setData({ fee: e.detail.value }) },
  onLiveUrl(e) { this.setData({ liveUrl: e.detail.value }) },
  onLivePlatform(e) { this.setData({ livePlatform: e.currentTarget.dataset.id || 'meeting' }) },
  onEditorReady() {
    wx.createSelectorQuery().in(this).select('#articleEditor').context((res) => {
      this.editorCtx = res && res.context
      const html = this.editorHtmlForShow(this.data.detailBody || noteToHtml(this.data.note))
      if (this.editorCtx && html) this.editorCtx.setContents({ html })
    }).exec()
  },
  editorHtmlForShow(html) {
    const fs = wx.getFileSystemManager()
    const dir = wx.env && wx.env.USER_DATA_PATH
    if (!dir) return html
    let i = 0
    return String(html || '').replace(/src="(data:image\/(?:jpeg|jpg|png|webp);base64,[^"]+)"/gi, (full, src) => {
      if (src.length > 280000) return full
      const ext = /png/i.test(src.slice(0, 30)) ? 'png' : 'jpg'
      const filePath = `${dir}/train-img-${Date.now()}-${i}.${ext}`
      i += 1
      try {
        fs.writeFileSync(filePath, src.slice(src.indexOf(',') + 1), 'base64')
        if (!this._imgMap) this._imgMap = {}
        this._imgMap[filePath] = src
        return `src="${filePath}"`
      } catch (_) {
        return full
      }
    })
  },
  onFormat(e) {
    const name = e.currentTarget.dataset.name
    const value = e.currentTarget.dataset.value
    if (!this.editorCtx || !name) return
    if (name === 'image') {
      this.onInsertImage()
      return
    }
    if (name === 'divider') {
      this.editorCtx.insertDivider()
      return
    }
    if (value) this.editorCtx.format(name, value)
    else this.editorCtx.format(name)
  },
  onInsertImage() {
    if (!this.editorCtx) return
    this.editorCtx.getContents({
      success: (res) => {
        const count = ((res && res.html) || '').match(/<img\b/gi)
        if (count && count.length >= 8) {
          wx.showToast({ title: '最多 8 张图片', icon: 'none' })
          return
        }
        this.pickArticleImage()
      },
      fail: () => this.pickArticleImage(),
    })
  },
  pickArticleImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const path = (res.tempFilePaths || [])[0]
        if (!path || !this.editorCtx) return
        const finish = (filePath) => {
          wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (file) => {
              const dataUrl = `data:image/jpeg;base64,${file.data}`
              if (dataUrl.length > 280000) {
                wx.showToast({ title: '图片过大，请换一张', icon: 'none' })
                return
              }
              if (!this._imgMap) this._imgMap = {}
              this._imgMap[filePath] = dataUrl
              this._imgMap[path] = dataUrl
              this.editorCtx.insertImage({ src: filePath, width: '100%' })
            },
            fail: () => wx.showToast({ title: '图片读取失败', icon: 'none' }),
          })
        }
        if (wx.compressImage) {
          wx.compressImage({ src: path, quality: 40, success: (c) => finish(c.tempFilePath || path), fail: () => finish(path) })
        } else {
          finish(path)
        }
      },
    })
  },
  readArticleHtml() {
    if (!this.editorCtx) return Promise.resolve(String(this.data.detailBody || ''))
    return new Promise((resolve) => {
      this.editorCtx.getContents({
        success: (res) => resolve((res && res.html) || ''),
        fail: () => resolve(String(this.data.detailBody || '')),
      })
    })
  },
  onToggleField(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'name') return
    const presets = {
      idNo: { key: 'idNo', label: '身份证号', kind: 'idNo' },
      phone: { key: 'phone', label: '手机号', kind: 'phone' },
    }
    const fields = [...(this.data.signupFields || [])]
    const idx = fields.findIndex((field) => field.key === key)
    if (idx >= 0) fields.splice(idx, 1)
    else if (presets[key]) fields.push(presets[key])
    this.setData(fieldView(fields))
  },
  onRemoveField(e) {
    const key = e.currentTarget.dataset.key
    this.setData(fieldView((this.data.signupFields || []).filter((field) => field.key !== key)))
  },
  onFieldDraft(e) { this.setData({ fieldDraft: e.detail.value }) },
  onAddField() {
    const label = String(this.data.fieldDraft || '').trim()
    const fields = this.data.signupFields || []
    if (!label || fields.length >= 8 || fields.some((field) => field.label === label)) return
    this.setData({ ...fieldView(fields.concat({ key: `c${Date.now()}`, label, kind: 'text' })), fieldDraft: '' })
  },
  onMode(e) {
    const mode = e.currentTarget.dataset.id
    if (mode === 'online') {
      this.setData({ mode: 'online', city: '全国', cityNational: true, selectedCities: [], cityDisplay: '全国' })
      return
    }
    const wasNational = this.data.cityNational || this.data.city === '全国'
    this.setData({
      mode: 'offline',
      cityNational: wasNational ? false : this.data.cityNational,
      selectedCities: wasNational ? [] : this.data.selectedCities,
      city: wasNational ? '' : this.data.city,
      cityDisplay: wasNational ? '' : this.data.cityDisplay,
    })
  },
  noop() {},
  onPoster(e) {
    const asked = e.currentTarget.dataset.key
    const key = asked === 'posterMp' ? 'posterMp' : asked === 'detailCover' ? 'detailCover' : 'poster'
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const path = (res.tempFilePaths || [])[0]
        if (!path) return
        const finish = (filePath) => {
          wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (file) => this.setData({ [key]: `data:image/jpeg;base64,${file.data}` }),
            fail: () => wx.showToast({ title: '海报读取失败', icon: 'none' }),
          })
        }
        if (wx.compressImage) {
          wx.compressImage({ src: path, quality: 60, success: (c) => finish(c.tempFilePath || path), fail: () => finish(path) })
        } else {
          finish(path)
        }
      },
    })
  },
  async onSubmit() {
    const reason = training.publishBlockReason()
    if (reason) {
      wx.showToast({ title: reason.slice(0, 18), icon: 'none' })
      return
    }
    if (!String(this.data.title || '').trim()) {
      wx.showToast({ title: '请填写课程名称', icon: 'none' })
      return
    }
    const feeNum = Number(this.data.fee)
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      wx.showToast({ title: '请填写大于 0 的课时费', icon: 'none' })
      return
    }
    if (!String(this.data.poster || '').startsWith('data:image/')) {
      wx.showToast({ title: '请上传星选宣传图', icon: 'none' })
      return
    }
    if (!String(this.data.posterMp || '').startsWith('data:image/')) {
      wx.showToast({ title: '请上传小程序宣传图', icon: 'none' })
      return
    }
    if (this.data.mode === 'online') {
      const liveErr = liveInputError(this.data.livePlatform, this.data.liveUrl)
      if (liveErr) {
        wx.showToast({ title: liveErr.slice(0, 18), icon: 'none' })
        return
      }
    } else if (this.data.cityNational || this.data.city === '全国' || !(this.data.selectedCities || []).length) {
      wx.showToast({ title: '请选择城市', icon: 'none' })
      return
    }
    if (this.data.mode === 'offline' && !String(this.data.address || '').trim()) {
      wx.showToast({ title: '请填写具体地址', icon: 'none' })
      return
    }
    if (this.data.mode === 'offline' && !String(this.data.contactName || '').trim()) {
      wx.showToast({ title: '请填写项目联系人', icon: 'none' })
      return
    }
    if (this.data.mode === 'offline' && !String(this.data.contactWay || '').trim()) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' })
      return
    }
    if (!this.data.whenStartDate || !this.data.whenEndDate) {
      wx.showToast({ title: '请选择上课日期', icon: 'none' })
      return
    }
    if (this.data.whenEndDate < this.data.whenStartDate) {
      wx.showToast({ title: '结束日期不能早于开始', icon: 'none' })
      return
    }
    if (!this.data.whenStartTime || !this.data.whenEndTime || this.data.whenEndTime <= this.data.whenStartTime) {
      wx.showToast({ title: '请设置每天的起止时间', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中', mask: true })
    try {
      const restored = restoreArticleImages(normalizeEditorHtml(await this.readArticleHtml()), this._imgMap)
      if (restored.error) {
        wx.hideLoading()
        wx.showToast({ title: restored.error.slice(0, 18), icon: 'none' })
        return
      }
      const input = Object.assign({}, this.data, {
        detailBody: restored.html,
        note: articlePlain(restored.html),
        city: this.data.mode === 'online' ? '全国' : this.data.city,
        liveUrl: this.data.mode === 'online' ? String(this.data.liveUrl || '').trim() : '',
        livePlatform: this.data.mode === 'online' ? this.data.livePlatform || '' : '',
      })
      if (this.data.editingId) await training.updateCourse(input)
      else await training.createCourse(input)
      wx.hideLoading()
      wx.showToast({ title: '已提交审核', icon: 'success' })
      this.setData({ view: 'list', ...blankForm() })
      wx.setNavigationBarTitle({ title: '发布培训' })
      this.loadMine()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: String(e.message || '提交失败').slice(0, 18), icon: 'none' })
    }
  },
})
