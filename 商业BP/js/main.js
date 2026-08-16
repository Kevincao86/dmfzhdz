/**
 * 灵祺商业计划书 · 交互脚本
 */
(function () {
  const PITCH =
    '我们是本地生活商户的 AI 经营操作系统，并用可验证达人履约网络锁住合作数据与结算依据——不是通告墙，也不是高客单代运营人力公司。'

  const SECTIONS = [
    'hero', 'market', 'solution', 'product', 'business', 'region', 'fund', 'team',
  ]
  /* milestones 在 goals 与 hero 之间，不单独占 rail */

  const TL_TEXT = {
    q1: 'M1–M3：主链路打通，标杆案例沉淀；付费门店 Base 约 30–80',
    q3: 'M4–M6：服务商导入 ≥3 家，冲刺 Base 200–500 店',
    q4: 'M7–M12：杭甬温密度成型，Base 1,500–3,000 店，MRR ≥100 万',
    y2: 'M13–M24：浙江溢出 + Pre-A 数据包，Base 8,000–15,000 店，MRR ≥500 万',
  }

  const MILESTONE_DETAIL = {
    m3: {
      title: 'M3 · 平台与 SaaS 主链路打通',
      biz: '商家 ERP、达人小程序、服务商版与 /erp-api 一体化；灰测能力产品化；Base 付费约 30–80 家。',
      fund: '资金投向 ¥220 万 — 研发核心系统',
    },
    m6: {
      title: 'M6 · 运营标准化 + Base 200–500 家门店',
      biz: '交付 SOP、≥3 家服务商导入、达人供给与履约协同跑通；月留存可披露。',
      fund: '资金投向 ¥150 万 — 交付团队建设与运营支持',
    },
    m12: {
      title: 'M12 · Base 1,500–3,000 付费门店 · MRR ≥100 万',
      biz: '杭甬温密度成型；订阅+履约 ARPU 稳定；渠道超预期时再谈 Stretch。',
      fund: '资金投向 ¥80 万 — 市场渠道拓展与销售团队扩招',
    },
    m24: {
      title: 'M24 · Base 8,000–15,000 付费门店 · MRR ≥500 万',
      biz: '浙江溢出、开放平台筹备、单位经济可复制后谈下一城。',
      fund: '资金投向 ¥50 万 — 长期运营服务费与风险储备金',
    },
  }

  const FUND_DETAIL = {
    rd: ['研发核心系统 · ¥220 万（M3）', 'AI 智能体、主链路 ERP/小程序/服务商版、云资源与稳定性'],
    delivery: ['交付与运营支持 · ¥150 万（M6）', '交付团队、达人供给、履约 SOP、客服与培训'],
    market: ['市场销售扩招 · ¥80 万（M12）', '渠道拓展、地推、案例会、销售团队'],
    reserve: ['运营储备与风险金 · ¥50 万（M24）', '长期服务费、合规、灾备与战略储备'],
  }

  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

  /* ── Particles ── */
  function initParticles() {
    const canvas = $('#hero-particles')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w, h, pts

    function resize() {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      pts = Array.from({ length: 55 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
      }))
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      ctx.clearRect(0, 0, w, h)
      pts.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(124, 92, 255, 0.45)'
        ctx.fill()
      })
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          if (dx * dx + dy * dy < 12000) {
            ctx.strokeStyle = 'rgba(255, 107, 53, 0.08)'
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.stroke()
          }
        }
      }
      requestAnimationFrame(draw)
    }
    draw()
  }

  /* ── Cursor glow ── */
  function initCursor() {
    const glow = $('#cursor-glow')
    if (!window.matchMedia('(pointer: fine)').matches) {
      glow.style.display = 'none'
      return
    }
    document.addEventListener('mousemove', (e) => {
      glow.style.left = e.clientX + 'px'
      glow.style.top = e.clientY + 'px'
    })
  }

  /* ── Section rail ── */
  function buildRail() {
    const rail = $('#section-rail')
    SECTIONS.forEach((id) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rail-dot'
      btn.dataset.section = id
      btn.title = id
      btn.addEventListener('click', () => scrollToSection(id))
      rail.appendChild(btn)
    })
  }

  function scrollToSection(id) {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function updateActiveSection() {
    const dots = $$('.rail-dot')
    const navBtns = $$('.nav-links button')
    let current = SECTIONS[0]
    for (const id of SECTIONS) {
      const el = document.getElementById(id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.top <= window.innerHeight * 0.4) current = id
    }
    dots.forEach((d) => d.classList.toggle('active', d.dataset.section === current))
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.section === current))
  }

  /* ── Counters ── */
  function animateCount(el, target, opts = {}) {
    const { prefix = '', suffix = '', duration = 1400 } = opts
    const start = performance.now()
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      const val = Math.round(target * ease)
      el.textContent = prefix + val.toLocaleString() + suffix
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function initCounters() {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || e.target.dataset.counted) return
          e.target.dataset.counted = '1'
          const card = e.target
          const valEl = card.querySelector('.stat-val, .goal-num')
          if (!valEl) return
          const target = Number(card.dataset.count || valEl.dataset.count || 0)
          const prefix = valEl.dataset.prefix || card.dataset.prefix || ''
          const suffix = valEl.dataset.suffix || card.dataset.suffix || ''
          if (card.classList.contains('cities')) return
          animateCount(valEl, target, { prefix, suffix })
        })
      },
      { threshold: 0.3 },
    )
    $$('[data-count], .goal-item').forEach((el) => obs.observe(el))
    $$('.goal-item').forEach((item) => {
      const num = item.querySelector('.goal-num')
      if (num) item.dataset.count = num.dataset.count
    })
  }

  /* ── Chart play buttons ── */
  const PLAY_LABEL = '▶ 播放增长动画'
  const PLAYING_LABEL = '⟳ 播放中…'
  const MARKET_MAX = 1952

  /* ── Market growth curve (SVG) ── */
  function buildMarketCurvePaths() {
    const path = $('#market-curve-path')
    const area = $('#market-curve-area')
    const bars = $$('#market-chart .bar')
    if (!path || !bars.length) return path

    const W = 520
    const H = 200
    const padX = 36
    const padTop = 14
    const padBot = 6
    const plotW = W - padX * 2
    const plotH = H - padTop - padBot
    const n = bars.length

    const pts = bars.map((bar, i) => {
      const val = Number(bar.dataset.val)
      const x = padX + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
      const y = padTop + plotH - (val / MARKET_MAX) * plotH
      return { x, y }
    })

    let lineD = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const cx = ((prev.x + cur.x) / 2).toFixed(1)
      lineD += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${cur.y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`
    }
    path.setAttribute('d', lineD)
    if (area) {
      area.setAttribute(
        'd',
        `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`,
      )
    }
    return path
  }

  function resetMarketCurve() {
    const path = buildMarketCurvePaths()
    const area = $('#market-curve-area')
    if (!path) return
    const len = path.getTotalLength() || 0
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
    path.style.opacity = '1'
    if (area) {
      area.style.opacity = '0'
      area.style.clipPath = 'inset(0 100% 0 0)'
    }
  }

  function animateMarketCurve(duration = 1500) {
    const path = $('#market-curve-path')
    const area = $('#market-curve-area')
    if (!path) return
    const len = path.getTotalLength() || 0
    path.style.strokeDasharray = `${len}`
    const start = performance.now()

    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      path.style.strokeDashoffset = `${len * (1 - ease)}`
      if (area) {
        area.style.opacity = String(0.18 * ease)
        area.style.clipPath = `inset(0 ${((1 - ease) * 100).toFixed(1)}% 0 0)`
      }
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function animateMarketBars() {
    $$('#market-chart .bar').forEach((bar) => {
      const val = Number(bar.dataset.val)
      const pct = (val / MARKET_MAX) * 100
      bar.querySelector('span').style.height = pct + '%'
    })
  }

  function playMarketGrowth() {
    const btn = $('#btn-animate-chart')
    if (!btn || btn.classList.contains('playing')) return
    btn.classList.add('playing')
    btn.textContent = PLAYING_LABEL

    resetMarketCurve()
    $$('#market-chart .bar span').forEach((s) => {
      s.style.height = '0'
    })

    requestAnimationFrame(() => {
      setTimeout(() => {
        animateMarketBars()
        animateMarketCurve(1500)
      }, 80)
    })

    setTimeout(() => {
      btn.classList.remove('playing')
      btn.textContent = PLAY_LABEL
      toast('增长曲线描绘完成')
    }, 1700)
  }

  /* ── Pain flip ── */
  function initPainCards() {
    $$('.pain-card').forEach((card) => {
      const flip = () => card.classList.toggle('flipped')
      card.querySelector('.flip-btn')?.addEventListener('click', (e) => {
        e.stopPropagation()
        flip()
      })
      card.addEventListener('click', flip)
    })
  }

  /* ── Tabs ── */
  function initTabs(containerSel, btnSel, panelSel, attr = 'tab') {
    const container = $(containerSel)?.parentElement || document
    $$(btnSel, container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset[attr]
        $$(btnSel, container).forEach((b) => b.classList.toggle('active', b === btn))
        $$(panelSel).forEach((p) => {
          const match =
            p.id === `tab-${key}` ||
            p.dataset.panel === key
          p.classList.toggle('active', match)
        })
      })
    })
  }

  /* ── City switcher ── */
  function initCities() {
    $$('.city-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const city = btn.dataset.city
        $$('.city-btn').forEach((b) => b.classList.toggle('active', b === btn))
        $$('.city-panel').forEach((p) =>
          p.classList.toggle('active', p.dataset.cityPanel === city),
        )
      })
    })
    $$('.tl-node').forEach((node) => {
      node.addEventListener('click', () => {
        $$('.tl-node').forEach((n) => n.classList.toggle('active', n === node))
        const desc = $('#tl-desc')
        if (desc) desc.textContent = TL_TEXT[node.dataset.tl] || ''
      })
    })
  }

  /* ── Fund slices ── */
  function initMilestones() {
    const detail = $('#milestone-detail')
    $$('.ms-node').forEach((node) => {
      node.addEventListener('click', () => {
        const key = node.dataset.ms
        const d = MILESTONE_DETAIL[key]
        if (!d || !detail) return
        $$('.ms-node').forEach((n) => n.classList.toggle('active', n === node))
        detail.innerHTML = `<h3>${d.title}</h3><p class="ms-biz">${d.biz}</p><p class="ms-fund"><strong>${d.fund}</strong></p>`
      })
    })
  }

  function initFund() {
    const detail = $('#fund-detail')
    $$('.fund-slice').forEach((slice) => {
      slice.addEventListener('click', () => {
        $$('.fund-slice').forEach((s) => s.classList.toggle('active', s === slice))
        const key = slice.dataset.fund
        const [title, body] = FUND_DETAIL[key] || ['', '']
        if (detail) {
          detail.innerHTML = `<h3>${title}</h3><p>${body}</p><p class="team-size">种子期团队 10–12 人：研发 4–5 · 产品运营 2 · BD 2–3 · 创始人 2</p>`
        }
      })
    })
  }

  /* ── Donut ── */
  function initDonut() {
    const C = 2 * Math.PI * 48
    const segs = [
      { el: $('.seg-saas'), pct: 45 },
      { el: $('.seg-fee'), pct: 35 },
      { el: $('.seg-partner'), pct: 20 },
    ]
    let offsetAcc = 0
    segs.forEach(({ el, pct }) => {
      if (!el) return
      const len = (pct / 100) * C
      el.style.strokeDasharray = `${len} ${C - len}`
      el.style.strokeDashoffset = String(-offsetAcc)
      offsetAcc += len
    })
  }

  /* ── Radar ── */
  const radarDefaults = [92, 88, 95, 80, 85]
  const radarLabels = ['AI智能化', 'ERP集成', '履约验证', '跨平台', '易用性']

  function drawRadar(values, compare = [55, 50, 45, 60, 58]) {
    const canvas = $('#radar-chart')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = 200
    const cy = 200
    const R = 140
    const n = values.length
    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2

    ctx.clearRect(0, 0, 400, 400)
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--panel') || '#141422'
    ctx.fillRect(0, 0, 400, 400)

    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const r = (R * ring) / 4
        const x = cx + r * Math.cos(angle(i % n))
        const y = cy + r * Math.sin(angle(i % n))
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.stroke()
    }

    function poly(vals, fill, stroke) {
      ctx.beginPath()
      vals.forEach((v, i) => {
        const r = (v / 100) * R
        const x = cx + r * Math.cos(angle(i))
        const y = cy + r * Math.sin(angle(i))
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.stroke()
    }

    poly(compare, 'rgba(139,135,152,0.2)', 'rgba(139,135,152,0.5)')
    poly(values, 'rgba(124, 92, 255, 0.35)', '#7c5cff')

    ctx.fillStyle = '#8b8798'
    ctx.font = '12px Noto Sans SC'
    values.forEach((_, i) => {
      const x = cx + (R + 22) * Math.cos(angle(i))
      const y = cy + (R + 22) * Math.sin(angle(i))
      ctx.fillText(radarLabels[i], x - 24, y + 4)
    })
  }

  function initRadar() {
    const sliders = $$('.radar-controls input[type="range"]')
    const update = () => {
      const vals = sliders.map((s) => Number(s.value))
      drawRadar(vals)
    }
    sliders.forEach((s) => s.addEventListener('input', update))
    $('#btn-reset-radar')?.addEventListener('click', () => {
      sliders.forEach((s, i) => {
        s.value = radarDefaults[i]
      })
      update()
    })
    update()
  }

  /* ── Finance curve + bars ── */
  const FIN_MAX = 6000

  function buildFinCurvePath() {
    const path = $('#fin-curve-path')
    const groups = $$('.fin-bars .fin-group')
    if (!path || !groups.length) return path

    const W = 400
    const H = 180
    const padX = 50
    const padTop = 20
    const padBot = 10
    const plotW = W - padX * 2
    const plotH = H - padTop - padBot
    const n = groups.length

    const pts = groups.map((g, i) => {
      const val = Number(g.dataset.val)
      const x = padX + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
      const y = padTop + plotH - (val / FIN_MAX) * plotH
      return { x, y }
    })

    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const cx = ((prev.x + cur.x) / 2).toFixed(1)
      d += ` C ${cx} ${prev.y.toFixed(1)}, ${cx} ${cur.y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`
    }
    path.setAttribute('d', d)
    return path
  }

  function resetFinCurve() {
    const path = buildFinCurvePath()
    if (!path) return
    const len = path.getTotalLength() || 0
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
  }

  function animateFinCurve(duration = 1400) {
    const path = $('#fin-curve-path')
    if (!path) return
    const len = path.getTotalLength() || 0
    path.style.strokeDasharray = `${len}`
    const start = performance.now()
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      path.style.strokeDashoffset = `${len * (1 - ease)}`
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  function animateFinanceBars() {
    $$('.fin-stack i').forEach((i) => {
      const h = i.style.getPropertyValue('--h') || getComputedStyle(i).getPropertyValue('--h')
      i.style.height = h.trim() || '0'
    })
  }

  function playFinGrowth() {
    const btn = $('#btn-fin-animate')
    if (!btn || btn.classList.contains('playing')) return
    btn.classList.add('playing')
    btn.textContent = PLAYING_LABEL

    resetFinCurve()
    $$('.fin-stack i').forEach((i) => {
      i.style.height = '0'
    })

    requestAnimationFrame(() => {
      setTimeout(() => {
        animateFinanceBars()
        animateFinCurve(1400)
      }, 80)
    })

    setTimeout(() => {
      btn.classList.remove('playing')
      btn.textContent = PLAY_LABEL
      toast('MRR 增长曲线描绘完成')
    }, 1600)
  }

  /* ── Roadshow ── */
  let roadshowTimer = null
  function startRoadshow() {
    if (roadshowTimer) {
      clearInterval(roadshowTimer)
      roadshowTimer = null
      $('#btn-roadshow').textContent = '▶ 路演播放'
      return
    }
    let i = 0
    $('#btn-roadshow').textContent = '■ 停止路演'
    scrollToSection(SECTIONS[i])
    roadshowTimer = setInterval(() => {
      i = (i + 1) % SECTIONS.length
      scrollToSection(SECTIONS[i])
    }, 6000)
  }

  /* ── Toast ── */
  function toast(msg) {
    const el = $('#toast')
    el.textContent = msg
    el.classList.remove('hidden')
    setTimeout(() => el.classList.add('hidden'), 2800)
  }

  /* ── Modal ── */
  function initModal() {
    const modal = $('#modal')
    const close = () => modal?.classList.add('hidden')
    $$('[data-close]').forEach((el) => el.addEventListener('click', close))
    $('#btn-contact')?.addEventListener('click', () => {
      modal?.classList.remove('hidden')
    })
    modal?.querySelector('.modal-box')?.addEventListener('click', (e) => e.stopPropagation())
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close()
    })
  }

  /* ── Theme & investor mode ── */
  function initToggles() {
    $('#btn-theme')?.addEventListener('click', () => {
      const light = document.body.dataset.theme === 'light'
      document.body.dataset.theme = light ? '' : 'light'
      $('#btn-theme').textContent = light ? '☀' : '🌙'
    })
    $('#btn-investor-mode')?.addEventListener('click', () => {
      document.body.classList.toggle('investor-mode')
      toast(document.body.classList.contains('investor-mode') ? '投资人模式已开启' : '投资人模式已关闭')
    })
  }

  /* ── Nav & CTA ── */
  function initNav() {
    $$('[data-section]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.section
        if (id) scrollToSection(id)
      })
    })
    $$('.nav-links button').forEach((btn) => {
      btn.addEventListener('click', () => scrollToSection(btn.dataset.section))
    })
    $('#btn-copy-pitch')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(PITCH)
        toast('投资一句话已复制')
      } catch {
        toast(PITCH)
      }
    })
    $('[data-toggle="engines"]')?.addEventListener('click', () => {
      $('#engines-panel')?.classList.toggle('hidden')
    })
    $('#btn-roadshow')?.addEventListener('click', startRoadshow)
    $('#btn-animate-chart')?.addEventListener('click', playMarketGrowth)
    $('#btn-fin-animate')?.addEventListener('click', playFinGrowth)
  }

  /* ── Scroll hide bar ── */
  let lastY = 0
  window.addEventListener(
    'scroll',
    () => {
      updateActiveSection()
      const bar = $('#top-bar')
      const y = window.scrollY
      if (y > lastY && y > 80) bar?.classList.add('hidden-bar')
      else bar?.classList.remove('hidden-bar')
      lastY = y
    },
    { passive: true },
  )

  /* ── Init ── */
  buildRail()
  initParticles()
  initCursor()
  initCounters()
  initPainCards()
  initTabs('.tab-switcher', '.tab-switcher button', '.tab-panel')
  initTabs('.product-tabs', '.product-tabs button', '.product-panel', 'product')
  initCities()
  initMilestones()
  initFund()
  initDonut()
  initRadar()
  initModal()
  initToggles()
  initNav()
  resetMarketCurve()
  resetFinCurve()
  let chartResizeT
  window.addEventListener('resize', () => {
    clearTimeout(chartResizeT)
    chartResizeT = setTimeout(() => {
      resetMarketCurve()
      resetFinCurve()
    }, 150)
  })
  updateActiveSection()
})()
