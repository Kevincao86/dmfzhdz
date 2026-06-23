(function () {
  const params = new URLSearchParams(location.search)
  const scrollMode = params.get('scroll') === '1' || params.get('mode') === 'scroll'

  const slides = Array.from(document.querySelectorAll('.deck .slide'))
  if (!slides.length) return

  const titles = slides.map((el, i) => {
    const h = el.querySelector('.slide-head h2, .cover h1')
    const text = h ? h.textContent.replace(/\s+/g, ' ').trim() : `第 ${i + 1} 页`
    el.dataset.deckTitle = text
    return text
  })

  let index = 0
  const hashMatch = location.hash.match(/^#(?:slide-)?(\d+)$/i)
  if (hashMatch) index = Math.min(slides.length - 1, Math.max(0, parseInt(hashMatch[1], 10) - 1))

  const $count = document.getElementById('deck-count')
  const $title = document.getElementById('deck-title')
  const $progress = document.getElementById('deck-progress-bar')
  const $sidebar = document.getElementById('deck-sidebar')
  const $thumbList = document.getElementById('deck-thumb-list')

  function buildThumbs() {
    if (!$thumbList) return
    $thumbList.innerHTML = slides
      .map(
        (el, i) =>
          `<button type="button" class="deck-thumb" data-i="${i}"><strong>${String(i + 1).padStart(2, '0')}</strong> ${titles[i]}<small>${el.querySelector('.slide-head .tag')?.textContent || (i === 0 ? '封面' : i === slides.length - 1 ? '结束' : '')}</small></button>`,
      )
      .join('')
    $thumbList.querySelectorAll('.deck-thumb').forEach((btn) => {
      btn.addEventListener('click', () => go(parseInt(btn.dataset.i, 10)))
    })
  }

  function render() {
    slides.forEach((el, i) => el.classList.toggle('is-active', i === index))
    if ($count) $count.textContent = `${index + 1} / ${slides.length}`
    if ($title) $title.textContent = titles[index]
    if ($progress) $progress.style.width = `${((index + 1) / slides.length) * 100}%`
    if ($thumbList) {
      $thumbList.querySelectorAll('.deck-thumb').forEach((btn, i) => btn.classList.toggle('active', i === index))
    }
    if (!scrollMode) history.replaceState(null, '', `#slide-${index + 1}`)
  }

  function go(i) {
    index = Math.min(slides.length - 1, Math.max(0, i))
    render()
    if ($sidebar) $sidebar.classList.remove('open')
  }

  function next() { go(index + 1) }
  function prev() { go(index - 1) }

  document.getElementById('deck-prev')?.addEventListener('click', prev)
  document.getElementById('deck-next')?.addEventListener('click', next)
  document.getElementById('deck-toggle-sidebar')?.addEventListener('click', () => $sidebar?.classList.toggle('open'))
  document.getElementById('deck-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  })
  document.getElementById('deck-scroll-mode')?.addEventListener('click', () => {
    location.search = '?scroll=1'
  })

  document.addEventListener('keydown', (e) => {
    if (scrollMode) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      prev()
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(slides.length - 1)
    } else if (e.key === 'f' || e.key === 'F') {
      document.getElementById('deck-fullscreen')?.click()
    } else if (e.key === 'o' || e.key === 'O') {
      $sidebar?.classList.toggle('open')
    } else if (e.key === 'Escape') {
      $sidebar?.classList.remove('open')
    }
  })

  let touchX = 0
  document.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX }, { passive: true })
  document.addEventListener('touchend', (e) => {
    if (scrollMode) return
    const dx = e.changedTouches[0].clientX - touchX
    if (Math.abs(dx) < 50) return
    if (dx < 0) next()
    else prev()
  }, { passive: true })

  buildThumbs()
  if (scrollMode) {
    document.documentElement.classList.add('deck-scroll')
  } else {
    document.documentElement.classList.add('deck-present')
    render()
  }
})()
