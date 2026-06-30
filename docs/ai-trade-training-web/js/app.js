/**
 * AI 传统外贸培训 · 互动课件 v2
 */
(function () {
  const slides = document.querySelectorAll('.slide')
  const tocBtns = document.querySelectorAll('.toc-btn')
  const progressFill = document.getElementById('progressFill')
  const progressText = document.getElementById('progressText')
  const btnPrev = document.getElementById('btnPrev')
  const btnNext = document.getElementById('btnNext')
  const sidebar = document.getElementById('sidebar')
  const mobileToggle = document.getElementById('mobileToggle')
  const modalRoot = document.getElementById('courseModal')
  const modalTitle = document.getElementById('courseModalTitle')
  const modalBody = document.getElementById('courseModalBody')
  const modalClose = document.getElementById('courseModalClose')

  let current = 0

  function goTo(index) {
    if (index < 0 || index >= slides.length) return
    slides[current].classList.remove('active')
    tocBtns[current]?.classList.remove('active')
    current = index
    slides[current].classList.add('active')
    tocBtns[current]?.classList.add('active')
    tocBtns[current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    updateUI()
    slides[current].scrollTop = 0
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

  btnPrev?.addEventListener('click', () => goTo(current - 1))
  btnNext?.addEventListener('click', () => goTo(current + 1))

  tocBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.slide)
      if (!Number.isNaN(idx)) goTo(idx)
    })
  })

  document.addEventListener('keydown', (e) => {
    if (modalRoot?.classList.contains('open')) {
      if (e.key === 'Escape') closeModal()
      return
    }
    if (e.target.matches('input, textarea, select')) return
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

  document.querySelectorAll('[data-open-modal]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      openModal(el.dataset.openModal)
    })
  })

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-tab-group]')
      if (!group) return
      const id = btn.dataset.tab
      group.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn))
      group.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.tab === id)
      })
    })
  })

  document.querySelectorAll('[data-flip-cards]').forEach((wrap) => {
    wrap.querySelectorAll('.card.clickable').forEach((card) => {
      card.addEventListener('click', () => {
        wrap.querySelectorAll('.card.clickable').forEach((c) => c.classList.remove('selected'))
        card.classList.add('selected')
        const detail = wrap.querySelector('[data-flip-detail]')
        if (detail) detail.textContent = card.dataset.detail || ''
        const modalId = card.dataset.openModal
        if (modalId && card.dataset.openOnClick === 'modal') openModal(modalId)
      })
    })
  })

  document.querySelectorAll('[data-chain-step]').forEach((step) => {
    step.addEventListener('click', () => {
      document.querySelectorAll('[data-chain-step]').forEach((s) => s.classList.remove('active'))
      step.classList.add('active')
      const id = step.dataset.chainStep
      if (id) openModal(id)
    })
  })

  document.querySelectorAll('[data-accordion]').forEach((acc) => {
    acc.querySelectorAll('.acc-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.acc-item')
        const open = item.classList.contains('open')
        acc.querySelectorAll('.acc-item').forEach((i) => i.classList.remove('open'))
        if (!open) item.classList.add('open')
      })
    })
  })

  document.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sel = btn.dataset.copyPrompt
      const block = sel ? document.querySelector(sel) : btn.previousElementSibling
      const text = block?.textContent?.trim()
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        const old = btn.textContent
        btn.textContent = '已复制 ✓'
        setTimeout(() => { btn.textContent = old }, 1600)
      } catch {
        window.prompt('复制以下 Prompt：', text)
      }
    })
  })

  goTo(0)
})()
