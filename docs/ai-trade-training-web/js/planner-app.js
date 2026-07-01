/**
 * 录入页 — 行业 / 岗位 / 需求 · 本页展示方案 · 配置修改需密码
 */
(function () {
  const $ = (id) => document.getElementById(id)
  const CONFIG_EDIT_PASSWORD = 'kaiyedaji888'

  let industries = []
  let roles = []
  let configEditAuthorized = false
  let roomBridge = null

  function apiOpts() {
    const cfg = PlannerApi.loadConfig()
    return {
      apiKey: cfg.apiKey || '',
      baseUrl: $('cfgBaseUrl')?.value?.trim() || cfg.baseUrl,
      textModel: $('cfgTextModel')?.value?.trim() || cfg.textModel,
      imageModel: $('cfgImageModel')?.value?.trim() || cfg.imageModel,
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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

  function fillSelect(sel, items, placeholder) {
    if (!sel) return
    sel.innerHTML = ''
    const ph = document.createElement('option')
    ph.value = ''
    ph.textContent = placeholder
    sel.appendChild(ph)
    for (const item of items) {
      const o = document.createElement('option')
      o.value = item
      o.textContent = item
      sel.appendChild(o)
    }
  }

  function entryCardHtml(e) {
    const wf = (e.result?.workflow || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
    const tools = (e.result?.aiTools || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
    const pains = (e.result?.painPoints || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
    const kpis = (e.result?.kpis || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')
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
          ${kpis ? `<div class="req-block"><h4>衡量指标</h4><ul>${kpis}</ul></div>` : ''}
        </div>
      </article>`
  }

  function myEntries(entries) {
    const mine = PlannerSync.clientId()
    return entries.filter((e) => e.clientId === mine)
  }

  function renderInputResults(scrollToLatest) {
    const panel = $('resultPanel')
    const list = $('inputResultList')
    if (!panel || !list) return
    const entries = myEntries(PlannerStore.loadEntries())
    if (!entries.length) {
      panel.hidden = true
      list.innerHTML = ''
      return
    }
    panel.hidden = false
    list.innerHTML = entries.map(entryCardHtml).join('')
    if (scrollToLatest) {
      const first = list.querySelector('.req-card')
      first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  function showConfigForm() {
    $('configForm').hidden = false
    $('configSummary').hidden = true
    const cfg = PlannerApi.loadConfig()
    if ($('cfgApiKey')) $('cfgApiKey').value = cfg.apiKey || ''
    if ($('cfgBaseUrl')) $('cfgBaseUrl').value = cfg.baseUrl || PlannerApi.DEFAULT_BASE
    if ($('cfgTextModel')) $('cfgTextModel').value = cfg.textModel || PlannerApi.DEFAULT_TEXT_MODEL
    if ($('cfgImageModel')) $('cfgImageModel').value = cfg.imageModel || PlannerApi.DEFAULT_IMAGE_MODEL
  }

  function hideConfigForm() {
    const cfg = PlannerApi.loadConfig()
    $('configForm').hidden = true
    $('configSummary').hidden = false
    if ($('cfgApiKey')) $('cfgApiKey').value = ''
    const meta = $('configSummaryMeta')
    if (meta) {
      meta.textContent = `${cfg.textModel || PlannerApi.DEFAULT_TEXT_MODEL} · ${cfg.imageModel || PlannerApi.DEFAULT_IMAGE_MODEL}`
    }
  }

  function openPwdModal() {
    const modal = $('pwdModal')
    if (!modal) return
    modal.hidden = false
    modal.setAttribute('aria-hidden', 'false')
    $('pwdInput').value = ''
    setStatus($('pwdStatus'), '')
    setTimeout(() => $('pwdInput')?.focus(), 50)
  }

  function closePwdModal() {
    const modal = $('pwdModal')
    if (!modal) return
    modal.hidden = true
    modal.setAttribute('aria-hidden', 'true')
    $('pwdInput').value = ''
    setStatus($('pwdStatus'), '')
  }

  function tryEditConfig() {
    if ($('configForm')?.hidden === false) return
    openPwdModal()
  }

  function confirmPwdEdit() {
    const pwd = $('pwdInput')?.value || ''
    if (pwd !== CONFIG_EDIT_PASSWORD) {
      setStatus($('pwdStatus'), '密码错误', 'error')
      return
    }
    closePwdModal()
    configEditAuthorized = true
    showConfigForm()
  }

  function initConfig() {
    const cfg = PlannerApi.loadConfig()
    if ($('cfgBaseUrl')) $('cfgBaseUrl').value = cfg.baseUrl || PlannerApi.DEFAULT_BASE
    if ($('cfgTextModel')) $('cfgTextModel').value = cfg.textModel || PlannerApi.DEFAULT_TEXT_MODEL
    if ($('cfgImageModel')) $('cfgImageModel').value = cfg.imageModel || PlannerApi.DEFAULT_IMAGE_MODEL
    if (PlannerApi.hasSavedApiKey()) hideConfigForm()
    else showConfigForm()
  }

  function saveConfigFromForm() {
    const existing = PlannerApi.loadConfig()
    const keyInput = $('cfgApiKey')?.value?.trim()
    PlannerApi.saveConfig({
      apiKey: keyInput || existing.apiKey || '',
      baseUrl: $('cfgBaseUrl')?.value?.trim() || PlannerApi.DEFAULT_BASE,
      textModel: $('cfgTextModel')?.value?.trim() || PlannerApi.DEFAULT_TEXT_MODEL,
      imageModel: $('cfgImageModel')?.value?.trim() || PlannerApi.DEFAULT_IMAGE_MODEL,
    })
  }

  function initIndustries() {
    industries = [...PlannerApi.PRESET_INDUSTRIES]
    fillSelect($('selIndustry'), industries, '请选择行业')
  }

  async function onIndustryChange() {
    const industry = $('selIndustry')?.value
    fillSelect($('selRole'), [], '请先选择行业')
    $('reqInput').disabled = true
    $('btnAddEntry').disabled = true
    roles = []
    if (!industry) {
      setStatus($('roleStatus'), '')
      return
    }
    if (!PlannerApi.hasSavedApiKey()) {
      setStatus($('roleStatus'), '请先保存 Gpt 配置', 'error')
      return
    }
    setStatus($('roleStatus'), 'AI 正在预设岗位…')
    setBusy($('btnReloadRoles'), true, '加载中')
    $('selRole').disabled = true
    try {
      roles = await PlannerApi.fetchRolesForIndustry(industry, apiOpts())
      fillSelect($('selRole'), roles, '请选择岗位')
      setStatus($('roleStatus'), `已加载 ${roles.length} 个岗位`, 'ok')
    } catch (e) {
      setStatus($('roleStatus'), e.message || '岗位加载失败', 'error')
    } finally {
      $('selRole').disabled = false
      setBusy($('btnReloadRoles'), false)
    }
  }

  function onRoleChange() {
    const ok = !!($('selIndustry')?.value && $('selRole')?.value && PlannerApi.hasSavedApiKey())
    $('reqInput').disabled = !ok
    $('btnAddEntry').disabled = !ok
  }

  async function addEntry() {
    const industry = $('selIndustry')?.value
    const role = $('selRole')?.value
    const requirement = $('reqInput')?.value?.trim()
    if (!industry || !role || !requirement) {
      setStatus($('addStatus'), '请完整填写行业、岗位与需求', 'error')
      return
    }
    setStatus($('addStatus'), 'AI 正在生成方案与工作流…')
    setBusy($('btnAddEntry'), true, '生成中')
    try {
      const result = await PlannerApi.generateRoleSolution(industry, role, requirement, apiOpts())
      const entry = {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        clientId: PlannerSync.clientId(),
        industry,
        role,
        requirement,
        result,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      const entries = PlannerStore.loadEntries()
      entries.unshift(entry)
      PlannerStore.saveEntries(entries)
      $('reqInput').value = ''
      renderInputResults(true)
      roomBridge?.pushNow()
      setStatus($('addStatus'), '方案已生成并展示于下方', 'ok')
    } catch (e) {
      setStatus($('addStatus'), e.message || '生成失败', 'error')
    } finally {
      setBusy($('btnAddEntry'), false)
    }
  }

  function bindEvents() {
    $('btnSaveConfig')?.addEventListener('click', () => void (async () => {
      const key = $('cfgApiKey')?.value?.trim()
      const existing = PlannerApi.loadConfig()
      if (!key && !existing.apiKey) {
        setStatus($('configStatus'), '请填写 API Key', 'error')
        return
      }
      saveConfigFromForm()
      const cfg = PlannerApi.loadConfig()
      const pwd = configEditAuthorized ? CONFIG_EDIT_PASSWORD : undefined
      const synced = await PlannerApi.pushCloudConfig(cfg, pwd)
      configEditAuthorized = false
      hideConfigForm()
      if (synced) {
        setStatus($('configStatus'), '已保存，全设备同步', 'ok')
      } else if (PlannerApi.hasSavedApiKey()) {
        setStatus($('configStatus'), '已本地保存，云端同步失败', 'error')
      } else {
        setStatus($('configStatus'), '')
      }
      onRoleChange()
    })())
    $('btnEditConfig')?.addEventListener('click', tryEditConfig)
    $('btnPwdCancel')?.addEventListener('click', closePwdModal)
    $('btnPwdConfirm')?.addEventListener('click', confirmPwdEdit)
    $('pwdInput')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') confirmPwdEdit()
      if (ev.key === 'Escape') closePwdModal()
    })
    $('pwdModal')?.addEventListener('click', (ev) => {
      if (ev.target === $('pwdModal')) closePwdModal()
    })
    $('selIndustry')?.addEventListener('change', () => void onIndustryChange())
    $('btnReloadRoles')?.addEventListener('click', () => void onIndustryChange())
    $('selRole')?.addEventListener('change', onRoleChange)
    $('btnAddEntry')?.addEventListener('click', () => void addEntry())
  }

  async function init() {
    await PlannerApi.initCloudConfig()
    initConfig()
    initIndustries()
    bindEvents()
    roomBridge = PlannerRoom.initRoomBar({
      onUpdate: () => renderInputResults(false),
    })
    renderInputResults(false)
    onRoleChange()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init())
  } else {
    void init()
  }
})()
