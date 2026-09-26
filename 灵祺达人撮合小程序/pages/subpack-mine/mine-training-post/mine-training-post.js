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
    this.setData({
      view: 'form',
      editingId: course.id,
      title: course.title || '',
      mode: course.mode === 'online' ? 'online' : 'offline',
      ...parseCity(course.city),
      city: course.city || '',
      cityDisplay: cityLabel(parseCity(course.city).cityNational, parseCity(course.city).selectedCities),
      ...when,
      whenText: formatWhen(when.whenStartDate, when.whenEndDate, when.whenStartTime, when.whenEndTime) || course.whenText || '',
      seats: String(course.seats || 20),
      fee: course.fee || '',
      poster: course.poster || '',
      posterMp: course.posterMp || '',
      note: course.note || '',
      ...fieldView(Array.isArray(course.signupFields) && course.signupFields.length ? course.signupFields : blankForm().signupFields),
    })
    wx.setNavigationBarTitle({ title: '编辑培训' })
  },
  onBack() {
    this.setData({ view: 'list', ...blankForm() })
    wx.setNavigationBarTitle({ title: '发布培训' })
    this.loadMine()
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
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
  onNote(e) { this.setData({ note: e.detail.value }) },
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
  onMode(e) { this.setData({ mode: e.currentTarget.dataset.id }) },
  noop() {},
  onPoster(e) {
    const key = e.currentTarget.dataset.key === 'posterMp' ? 'posterMp' : 'poster'
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
    if (!String(this.data.poster || '').startsWith('data:image/')) {
      wx.showToast({ title: '请上传星选宣传图', icon: 'none' })
      return
    }
    if (!String(this.data.posterMp || '').startsWith('data:image/')) {
      wx.showToast({ title: '请上传小程序宣传图', icon: 'none' })
      return
    }
    if (!this.data.cityNational && !(this.data.selectedCities || []).length) {
      wx.showToast({ title: '请选择城市', icon: 'none' })
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
      if (this.data.editingId) await training.updateCourse(this.data)
      else await training.createCourse(this.data)
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
