/**
 * AI 传统外贸培训 · 互动课件 v2
 */
(function () {
  const STORAGE_SLIDES = 'course-slide-overrides-v1'
  const STORAGE_SIDEBAR = 'course-sidebar-collapsed-v1'

  const EDITABLE_SELECTOR = [
    '.visual-overlay .slide-tag',
    '.visual-overlay h2',
    '.visual-overlay .lead',
    '.content-body p',
    '.content-body h3',
    '.content-body h4',
    '.content-body li',
    '.content-body blockquote',
    '.content-body td',
    '.content-body th',
    '.card h4',
    '.card p',
    '.timeline-item h4',
    '.timeline-item p',
    '[data-flip-detail]',
    '.content-body > p',
  ].join(', ')

  const appRoot = document.getElementById('appRoot')
  const slides = document.querySelectorAll('.slide')
  const tocBtns = document.querySelectorAll('.toc-btn')
  const progressFill = document.getElementById('progressFill')
  const progressText = document.getElementById('progressText')
  const btnPrev = document.getElementById('btnPrev')
  const btnNext = document.getElementById('btnNext')
  const sidebar = document.getElementById('sidebar')
  const sidebarCollapse = document.getElementById('sidebarCollapse')
  const mobileToggle = document.getElementById('mobileToggle')
  const modalRoot = document.getElementById('courseModal')
  const modalTitle = document.getElementById('courseModalTitle')
  const modalBody = document.getElementById('courseModalBody')
  const modalClose = document.getElementById('courseModalClose')
  const btnEditMode = document.getElementById('btnEditMode')
  const editConfirmBar = document.getElementById('editConfirmBar')
  const btnConfirmEdit = document.getElementById('btnConfirmEdit')
  const btnDiscardEdit = document.getElementById('btnDiscardEdit')

  let current = 0
  let editMode = false
  let slideDirty = false
  const originalHtml = {}
  const confirmedHtml = {}

  slides.forEach((slide, i) => {
    const inner = slide.querySelector('.slide-inner')
    if (inner) originalHtml[i] = inner.innerHTML
  })

  function loadSavedSlides() {
    try {
      const raw = localStorage.getItem(STORAGE_SLIDES)
      if (!raw) return
      const data = JSON.parse(raw)
      Object.keys(data).forEach((key) => {
        const idx = Number(key)
        const html = data[key]
        if (Number.isNaN(idx) || !html) return
        const inner = slides[idx]?.querySelector('.slide-inner')
        if (inner) {
          inner.innerHTML = html
          confirmedHtml[idx] = html
        }
      })
    } catch {
      /* ignore corrupt storage */
    }
  }

  function persistSlides() {
    const payload = {}
    Object.keys(confirmedHtml).forEach((k) => {
      payload[k] = confirmedHtml[k]
    })
    localStorage.setItem(STORAGE_SLIDES, JSON.stringify(payload))
  }

  function getSlideInner(index) {
    return slides[index]?.querySelector('.slide-inner') || null
  }

  function getBaselineHtml(index) {
    return confirmedHtml[index] ?? originalHtml[index] ?? ''
  }

  function isSlideChanged(index) {
    const inner = getSlideInner(index)
    if (!inner) return false
    return inner.innerHTML !== getBaselineHtml(index)
  }

  function updateDirtyUI() {
    slideDirty = isSlideChanged(current)
    if (editConfirmBar) editConfirmBar.hidden = !slideDirty
  }

  function clearEditableMarks(slideEl) {
    slideEl?.querySelectorAll('.course-editable').forEach((el) => {
      el.removeAttribute('contenteditable')
      el.classList.remove('course-editable')
    })
  }

  function applyEditableMarks(slideEl) {
    if (!slideEl) return
    slideEl.querySelectorAll(EDITABLE_SELECTOR).forEach((el) => {
      if (el.closest('button, .btn-detail, .acc-trigger, .tab-btn, pre')) return
      el.classList.add('course-editable')
      el.setAttribute('contenteditable', 'true')
      el.setAttribute('spellcheck', 'true')
    })
  }

  function setEditMode(on) {
    editMode = on
    document.body.classList.toggle('edit-mode', on)
    if (btnEditMode) {
      btnEditMode.setAttribute('aria-pressed', on ? 'true' : 'false')
      btnEditMode.textContent = on ? '退出编辑' : '编辑内容'
    }
    slides.forEach((slide, i) => {
      if (on && i === current) applyEditableMarks(slide)
      else clearEditableMarks(slide)
    })
    if (!on) editConfirmBar.hidden = true
    else updateDirtyUI()
  }

  function confirmCurrentEdit() {
    const inner = getSlideInner(current)
    if (!inner) return
    confirmedHtml[current] = inner.innerHTML
    persistSlides()
    slideDirty = false
    editConfirmBar.hidden = true
    const btn = btnConfirmEdit
    if (btn) {
      const old = btn.textContent
      btn.textContent = '已保存 ✓'
      setTimeout(() => { btn.textContent = old }, 1400)
    }
  }

  function discardCurrentEdit() {
    const inner = getSlideInner(current)
    if (!inner) return
    inner.innerHTML = getBaselineHtml(current)
    slideDirty = false
    editConfirmBar.hidden = true
    if (editMode) applyEditableMarks(slides[current])
  }

  function tryLeaveEditGuard(nextIndex) {
    if (!slideDirty) return true
    const ok = window.confirm('当前页有未确认的修改，是否放弃修改并离开？')
    if (ok) {
      discardCurrentEdit()
      return true
    }
    return false
  }

  function goTo(index) {
    if (index < 0 || index >= slides.length) return
    if (index !== current && slideDirty && !tryLeaveEditGuard(index)) return

    clearEditableMarks(slides[current])
    slides[current].classList.remove('active')
    tocBtns[current]?.classList.remove('active')
    current = index
    slides[current].classList.add('active')
    tocBtns[current]?.classList.add('active')
    tocBtns[current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    updateUI()
    slides[current].scrollTop = 0
    if (editMode) applyEditableMarks(slides[current])
    updateDirtyUI()
    if (window.innerWidth <= 900) sidebar.classList.remove('open')
  }

  function updateUI() {
    const pct = Math.round(((current + 1) / slides.length) * 100)
    progressFill.style.width = `${pct}%`
    progressText.textContent = `${current + 1} / ${slides.length}`
    btnPrev.disabled = current === 0
    btnNext.disabled = current === slides.length - 1
  }

  function openModal(id) {
    if (editMode) return
    const data = window.COURSE_MODALS?.[id]
    if (!data || !modalRoot) return
    modalTitle.textContent = data.title || '详情'
    modalBody.innerHTML = data.html || ''
    modalRoot.classList.add('open')
    modalRoot.setAttribute('aria-hidden', 'false')
    document.body.classList.add('modal-open')
  }

  function closeModal() {
    if (!modalRoot) return
    modalRoot.classList.remove('open')
    modalRoot.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('modal-open')
  }

  function toggleSidebarCollapsed() {
    const collapsed = appRoot.classList.toggle('sidebar-collapsed')
    localStorage.setItem(STORAGE_SIDEBAR, collapsed ? '1' : '0')
    sidebarCollapse?.setAttribute(
      'aria-label',
      collapsed ? '展开目录' : '收起目录',
    )
  }

  function initSidebarState() {
    if (localStorage.getItem(STORAGE_SIDEBAR) === '1') {
      appRoot.classList.add('sidebar-collapsed')
      sidebarCollapse?.setAttribute('aria-label', '展开目录')
    }
  }

  btnPrev?.addEventListener('click', () => goTo(current - 1))
  btnNext?.addEventListener('click', () => goTo(current + 1))

  tocBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.slide)
      if (!Number.isNaN(idx)) goTo(idx)
    })
  })

  sidebarCollapse?.addEventListener('click', toggleSidebarCollapsed)

  btnEditMode?.addEventListener('click', () => {
    if (editMode && slideDirty) {
      if (!window.confirm('有未确认的修改，退出编辑将放弃这些修改，是否继续？')) return
      discardCurrentEdit()
    }
    setEditMode(!editMode)
  })

  btnConfirmEdit?.addEventListener('click', confirmCurrentEdit)
  btnDiscardEdit?.addEventListener('click', discardCurrentEdit)

  document.addEventListener('input', (e) => {
    if (!editMode) return
    if (!e.target.classList?.contains('course-editable')) return
    if (!slides[current]?.contains(e.target)) return
    updateDirtyUI()
  })

  document.addEventListener('keydown', (e) => {
    if (modalRoot?.classList.contains('open')) {
      if (e.key === 'Escape') closeModal()
      return
    }
    if (e.target.matches('[contenteditable="true"]')) return
    if (e.target.matches('input, textarea, select')) return
    if (slideDirty) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
      e.preventDefault()
      goTo(current + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      goTo(current - 1)
    } else if (e.key === 'Home') goTo(0)
    else if (e.key === 'End') goTo(slides.length - 1)
  })

  mobileToggle?.addEventListener('click', () => sidebar.classList.toggle('open'))

  modalClose?.addEventListener('click', closeModal)
  modalRoot?.addEventListener('click', (e) => {
    if (e.target === modalRoot || e.target.classList.contains('modal-backdrop')) closeModal()
  })

  document.addEventListener('click', (e) => {
    const modalBtn = e.target.closest('button[data-open-modal], .btn-detail[data-open-modal]')
    if (modalBtn && !editMode) {
      e.stopPropagation()
      openModal(modalBtn.dataset.openModal)
      return
    }

    const tabBtn = e.target.closest('.tab-btn')
    if (tabBtn && !editMode) {
      const group = tabBtn.closest('[data-tab-group]')
      if (!group) return
      const id = tabBtn.dataset.tab
      group.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === tabBtn))
      group.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.tab === id)
      })
    }

    const flipCard = e.target.closest('[data-flip-cards] .card.clickable')
    if (flipCard && !editMode) {
      const wrap = flipCard.closest('[data-flip-cards]')
      wrap.querySelectorAll('.card.clickable').forEach((c) => c.classList.remove('selected'))
      flipCard.classList.add('selected')
      const detail = wrap.querySelector('[data-flip-detail]')
      if (detail) detail.textContent = flipCard.dataset.detail || ''
      const modalId = flipCard.dataset.openModal
      if (modalId && flipCard.dataset.openOnClick === 'modal') openModal(modalId)
    }

    const chainStep = e.target.closest('[data-chain-step]')
    if (chainStep && !editMode) {
      document.querySelectorAll('[data-chain-step]').forEach((s) => s.classList.remove('active'))
      chainStep.classList.add('active')
      const id = chainStep.dataset.chainStep
      if (id) openModal(id)
    }

    const accTrigger = e.target.closest('.acc-trigger')
    if (accTrigger && !editMode) {
      const acc = accTrigger.closest('[data-accordion]')
      const item = accTrigger.closest('.acc-item')
      if (!acc || !item) return
      const open = item.classList.contains('open')
      acc.querySelectorAll('.acc-item').forEach((i) => i.classList.remove('open'))
      if (!open) item.classList.add('open')
    }

    const copyBtn = e.target.closest('[data-copy-prompt]')
    if (copyBtn && !editMode) {
      const sel = copyBtn.dataset.copyPrompt
      const block = sel ? document.querySelector(sel) : copyBtn.previousElementSibling
      const text = block?.textContent?.trim()
      if (!text) return
      navigator.clipboard.writeText(text).then(() => {
        const old = copyBtn.textContent
        copyBtn.textContent = '已复制 ✓'
        setTimeout(() => { copyBtn.textContent = old }, 1600)
      }).catch(() => {
        window.prompt('复制以下 Prompt：', text)
      })
    }
  })

  loadSavedSlides()
  initSidebarState()
  goTo(0)
})()
