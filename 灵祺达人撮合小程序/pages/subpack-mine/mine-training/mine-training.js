const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    filter: 'all',
    cityFilter: '全部',
    cities: [],
    courses: [],
    shown: [],
    enrolled: [],
    loading: true,
    lecturerStatus: 'none',
    lecturerLabel: '未申请',
  },
  onShow() {
    this.load()
    this.loadProfile()
  },
  async loadProfile() {
    const profile = await training.syncProfile()
    const lecturerStatus = training.lecturerState(profile)
    const lecturerLabel = lecturerStatus === 'approved' ? '已通过' : lecturerStatus === 'pending' ? '审核中' : lecturerStatus === 'rejected' ? '未通过' : profile && profile.lecturerStatus === 'none' ? '未认证' : '未申请'
    this.setData({ lecturerStatus, lecturerLabel })
  },
  async load() {
    this.setData({ loading: true })
    try {
      const courses = await training.listCourses()
      const enrolled = await training.myEnrollments()
      this.setData({ courses, enrolled, loading: false }, () => this.applyFilter())
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },
  applyFilter() {
    const f = this.data.filter
    const city = this.data.cityFilter || '全部'
    const upcoming = (this.data.courses || []).filter((c) => training.isUpcomingCourse(c))
    const cities = []
    upcoming.forEach((c) => {
      if (c.mode !== 'offline') return
      String(c.city || '')
        .split(/[、,，/\s]+/)
        .forEach((part) => {
          const key = String(part || '').replace(/市$/, '').trim()
          if (key && key !== '全国' && cities.indexOf(key) < 0) cities.push(key)
        })
    })
    const shown = upcoming.filter((c) => {
      if (f !== 'all' && c.mode !== f) return false
      if (f === 'offline' && !training.courseMatchesCity(c, city)) return false
      return true
    })
    this.setData({ shown, cities })
  },
  onFilter(e) {
    const filter = e.currentTarget.dataset.id
    this.setData({ filter, cityFilter: filter === 'offline' ? this.data.cityFilter : '全部' }, () => this.applyFilter())
  },
  onCity(e) {
    this.setData({ cityFilter: e.currentTarget.dataset.city || '全部', filter: 'offline' }, () => this.applyFilter())
  },
  onOpen(e) {
    wx.navigateTo({
      url: `/pages/subpack-mine/mine-training-detail/mine-training-detail?id=${e.currentTarget.dataset.id}`,
    })
  },
  onApply() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
  },
})
