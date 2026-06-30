/**
 * AI 传统外贸培训 · 互动课件
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

  btnPrev?.addEventListener('click', () => goTo(current - 1))
  btnNext?.addEventListener('click', () => goTo(current + 1))

  tocBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.slide)
      if (!Number.isNaN(idx)) goTo(idx)
    })
  })

  document.addEventListener('keydown', (e) => {
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

  mobileToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open')
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

  document.querySelectorAll('.checklist[data-checklist]').forEach((list) => {
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => {
        li.classList.toggle('done')
        const box = li.querySelector('.check-box')
        box.textContent = li.classList.contains('done') ? '✓' : ''
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
      })
    })
  })

  goTo(0)
})()
