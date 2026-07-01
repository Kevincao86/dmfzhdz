/**
 * 汇总页 — 需求列表 · 通读全部岗位后生成整体设计
 */
(function () {
  const $ = (id) => document.getElementById(id)

  let entries = []
  let designResult = null
  let mockups = []
  let roomBridge = null

  function apiOpts() {
    return PlannerApi.loadConfig()
  }

  function setStatus(el, text, kind) {
    if (!el) return
    el.textContent = text || ''
    el.classList.remove('error', 'ok')
    if (kind) el.classList.add(kind)
  }

  function setBusy(btn, busy, labelBusy) {
    if (!btn) return
    btn.disabled = busy
    if (busy) {
      btn.dataset.prevLabel = btn.textContent
      btn.innerHTML = `<span class="spinner"></span> ${labelBusy || '处理中…'}`
    } else if (btn.dataset.prevLabel) {
      btn.textContent = btn.dataset.prevLabel
      delete btn.dataset.prevLabel
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function loadState() {
    entries = PlannerStore.loadEntries()
    designResult = PlannerStore.loadDesign()
    mockups = PlannerStore.loadMockups()
    const pt = PlannerStore.loadProductType()
    if ($('selProductType')) $('selProductType').value = pt
  }

  function renderStats() {
    const indSet = new Set(entries.map((e) => e.industry))
    const roleSet = new Set(entries.map((e) => e.role))
    $('statEntries').textContent = String(entries.length)
    $('statIndustries').textContent = String(indSet.size)
    $('statRoles').textContent = String(roleSet.size)
    $('btnGenerateDesign').disabled = entries.length === 0
  }

  function renderEntries() {
    const list = $('reqList')
    if (!list) return
    if (!entries.length) {
      const room = PlannerSync.loadRoomId()
      const roomQ = room ? `?room=${encodeURIComponent(room)}` : ''
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" aria-hidden="true">📋</div>
          <strong>暂无岗位需求记录</strong>
          <p>请先在 <a href="index.html${roomQ}">录入需求</a> 页选择行业与岗位，生成方案后会显示在这里。</p>
        </div>`
      renderStats()
      return
    }

    list.innerHTML = entries
      .map((e) => {
        const wf = (e.result?.workflow || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
        const tools = (e.result?.aiTools || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
        const pains = (e.result?.painPoints || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
        return `
        <article class="req-card" data-id="${e.id}">
          <div class="req-card-head">
            <div class="tags">
              <span class="tag">${escapeHtml(e.industry)}</span>
              <span class="tag role">${escapeHtml(e.role)}</span>
            </div>
            <span class="req-time">${escapeHtml(e.createdAt || '')}</span>
          </div>
          <div class="req-card-body">
            <div class="req-block">
              <h4>需求描述</h4>
              <p>${escapeHtml(e.requirement)}</p>
            </div>
            <div class="req-block">
              <h4>方案概述</h4>
              <p><strong>${escapeHtml(e.result?.summary || '—')}</strong></p>
              <p>${escapeHtml(e.result?.solution || '')}</p>
            </div>
            ${pains ? `<div class="req-block"><h4>痛点分析</h4><ul>${pains}</ul></div>` : ''}
            ${wf ? `<div class="req-block"><h4>落地工作流</h4><ol>${wf}</ol></div>` : ''}
            ${tools ? `<div class="req-block"><h4>AI / 工具建议</h4><ul>${tools}</ul></div>` : ''}
          </div>
          <div class="req-card-actions">
            <button type="button" class="btn btn-ghost btn-sm btn-delete" data-id="${e.id}">删除</button>
          </div>
        </article>`
      })
      .join('')

    list.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id')
        entries = entries.filter((x) => x.id !== id)
        PlannerStore.saveEntries(entries)
        renderEntries()
        renderDesignSection()
        roomBridge?.pushNow()
      })
    })

    renderStats()
  }

  function renderDesignSection() {
    const sec = $('designSection')
    if (!sec) return
    if (!designResult) {
      sec.hidden = true
      return
    }
    sec.hidden = false
    const d = designResult
    const modules = Array.isArray(d.coreModules)
      ? d.coreModules
          .map(
            (m) =>
              `<li><strong>${escapeHtml(m.name)}</strong>：${escapeHtml(m.desc || '')}${m.roles?.length ? `（岗位：${escapeHtml(m.roles.join('、'))}）` : ''}</li>`,
          )
          .join('')
      : ''
    const phases = Array.isArray(d.mvpPhases)
      ? d.mvpPhases
          .map((p) => `<li>${escapeHtml(p.phase)}：${escapeHtml(p.scope || '')}（约 ${p.weeks || '?'} 周）</li>`)
          .join('')
      : ''

    $('designBody').innerHTML = `
      <p><strong>${escapeHtml(d.productName || '产品方案')}</strong> · ${d.productType === 'miniprogram' ? '小程序' : '软件'}</p>
      <p>${escapeHtml(d.positioning || '')}</p>
      ${modules ? `<h4 class="design-sub">核心模块</h4><ul>${modules}</ul>` : ''}
      ${phases ? `<h4 class="design-sub">分期落地</h4><ul>${phases}</ul>` : ''}
      <div class="design-prose-inner">${escapeHtml(d.summaryMarkdown || '')}</div>`

    renderMockups()
  }

  function mockupAspectClass() {
    const pt = $('selProductType')?.value || PlannerStore.loadProductType()
    return PlannerApi.resolveImageAspect(pt)
  }

  function aspectCssClass(aspect) {
    if (aspect === 'landscape') return 'aspect-landscape'
    if (aspect === 'square') return 'aspect-square'
    return 'aspect-portrait'
  }

  function renderMockups() {
    const grid = $('mockupGrid')
    if (!grid) return
    const fallbackAspect = aspectCssClass(mockupAspectClass())
    if (!mockups.length && designResult?.mockupPrompts?.length) {
      grid.innerHTML = designResult.mockupPrompts
        .map(
          (p) => `
        <div class="mockup-card">
          <div class="mockup-placeholder ${fallbackAspect}">待生成：${escapeHtml(p.title)}</div>
          <div class="cap">${escapeHtml(p.title)}</div>
        </div>`,
        )
        .join('')
      return
    }
    grid.innerHTML = mockups
      .map(
        (m) => `
      <div class="mockup-card">
        ${
          m.url
            ? `<div class="mockup-frame ${aspectCssClass(m.aspect || mockupAspectClass())}"><img src="${m.url}" alt="${escapeHtml(m.title)}" loading="lazy" /></div>`
            : `<div class="mockup-placeholder ${aspectCssClass(m.aspect || mockupAspectClass())}">${escapeHtml(m.error || '生成失败')}</div>`
        }
        <div class="cap">${escapeHtml(m.title)}</div>
      </div>`,
      )
      .join('')
  }

  async function generateDesign() {
    if (!entries.length) return
    if (!PlannerApi.hasSavedApiKey()) {
      setStatus($('designStatus'), '请先在录入页配置 Gpt API Key', 'error')
      return
    }
    const productType = $('selProductType')?.value || 'miniprogram'
    PlannerStore.saveProductType(productType)
    const n = entries.length
    setStatus($('designStatus'), `正在通读全部 ${n} 条岗位需求并生成整体设计…`)
    setBusy($('btnGenerateDesign'), true, '通读生成中')
    designResult = null
    mockups = []
    PlannerStore.saveDesign(null)
    PlannerStore.saveMockups([])
    renderDesignSection()
    $('designSection').hidden = false
    try {
      designResult = await PlannerApi.generateProductDesign(entries, productType, apiOpts())
      PlannerStore.saveDesign(designResult)
      renderDesignSection()
      roomBridge?.pushNow()
      setStatus($('designStatus'), `已通读 ${n} 条岗位需求，设计方案已生成`, 'ok')
    } catch (e) {
      setStatus($('designStatus'), e.message || '生成失败', 'error')
    } finally {
      setBusy($('btnGenerateDesign'), false)
    }
  }

  async function generateAllMockups() {
    if (!designResult?.mockupPrompts?.length) {
      setStatus($('designStatus'), '请先生成设计方案', 'error')
      return
    }
    setBusy($('btnGenMockups'), true, '生图中')
    setStatus($('designStatus'), '文生图模型正在生成展示页面…')
    const productType = $('selProductType')?.value || PlannerStore.loadProductType()
    mockups = []
    renderMockups()
    for (const p of designResult.mockupPrompts) {
      try {
        const out = await PlannerApi.generateImage(p.prompt, { ...apiOpts(), productType })
        mockups.push({ title: p.title, url: out.url, aspect: out.aspect })
      } catch (e) {
        mockups.push({
          title: p.title,
          error: e.message || '失败',
          aspect: PlannerApi.resolveImageAspect(productType),
        })
      }
      renderMockups()
    }
    PlannerStore.saveMockups(mockups)
    roomBridge?.pushNow()
    setStatus($('designStatus'), `已生成 ${mockups.filter((m) => m.url).length} 张展示图`, 'ok')
    setBusy($('btnGenMockups'), false)
  }

  function bindEvents() {
    $('btnGenerateDesign')?.addEventListener('click', () => void generateDesign())
    $('btnGenMockups')?.addEventListener('click', () => void generateAllMockups())
    $('selProductType')?.addEventListener('change', () => {
      PlannerStore.saveProductType($('selProductType').value)
      renderMockups()
      roomBridge?.pushNow()
    })
    $('btnClearAll')?.addEventListener('click', () => {
      if (!entries.length || !window.confirm('确定清空全部岗位需求记录？')) return
      PlannerStore.clearAll()
      entries = []
      designResult = null
      mockups = []
      renderEntries()
      renderDesignSection()
      roomBridge?.pushNow()
    })
  }

  function refreshFromStore() {
    loadState()
    renderEntries()
    renderDesignSection()
  }

  async function init() {
    await PlannerApi.initCloudConfig()
    loadState()
    bindEvents()
    roomBridge = PlannerRoom.initRoomBar({ onUpdate: refreshFromStore })
    renderEntries()
    renderDesignSection()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init())
  } else {
    void init()
  }
})()
