/**
 * 商家 ERP 小程序 · 菜单/竞对/数字人 TTS / AI 运营方案
 * （对齐商家 Web，不含服务商分版）
 */
const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')
const sessionSync = require('./merchantSessionSyncMp.js')
const supabaseRest = require('./supabaseRest.js')

function postJson(path, body) {
  const token = api.getBearerToken()
  return merchantRequestAuth('POST', path, {
    data: body || {},
    bearerToken: token,
    timeoutMs: 120000,
  }).then((r) => r || {})
}

function tenantId() {
  try {
    return String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {
    return ''
  }
}

function menuStorageKey() {
  const tid = tenantId()
  return tid ? `meoo_store_menu_v1@${tid}` : 'meoo_store_menu_v1'
}

function marginStorageKey() {
  const tid = tenantId()
  return tid ? `meoo_store_margin_config_v1@${tid}` : 'meoo_store_margin_config_v1'
}

function readJson(key) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (_) {
    return null
  }
}

function readStoreMenu() {
  const menu = readJson(menuStorageKey()) || {}
  const items = Array.isArray(menu.items) ? menu.items : []
  return {
    storeName: String(menu.storeName || '').trim(),
    items,
    updatedAt: menu.updatedAt || '',
  }
}

function writeStoreMenuLocal(rec) {
  const payload = {
    id: rec.id || `menu-mp-${Date.now()}`,
    storeName: String(rec.storeName || '').trim(),
    images: Array.isArray(rec.images) ? rec.images : [],
    items: Array.isArray(rec.items) ? rec.items : [],
    updatedAt: new Date().toISOString(),
  }
  try {
    wx.setStorageSync(menuStorageKey(), JSON.stringify(payload))
  } catch (_) {}
  return payload
}

/** 本地 + 云端双写（对齐 Web saveStoreMenuRecordAsync） */
async function saveStoreMenu(rec) {
  const payload = writeStoreMenuLocal(rec)
  const tid = tenantId()
  if (!tid) return { ok: true, localOnly: true, payload }
  try {
    await supabaseRest.upsertTenantStoreMenu(tid, {
      items: payload.items,
      storeName: payload.storeName,
    })
    return { ok: true, payload }
  } catch (e) {
    return {
      ok: false,
      payload,
      message: (e && e.message) || '云端保存失败（本地已更新）',
    }
  }
}

function mergeMenuItems(existing, incoming) {
  const key = (it) =>
    `${String((it && it.category) || '').trim()}|${String((it && it.name) || '').trim()}|${it && it.productCode ? it.productCode : ''}|${it && it.priceYuan != null ? it.priceYuan : ''}`
  const seen = new Set((existing || []).map(key))
  const out = (existing || []).slice()
  for (let i = 0; i < (incoming || []).length; i++) {
    const it = incoming[i]
    if (!it || !String(it.name || '').trim()) continue
    const k = key(it)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

function parseCsvToRows(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!String(line || '').trim()) continue
    const cells = []
    let cur = ''
    let inQ = false
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (inQ) {
        if (ch === '"' && line[j + 1] === '"') {
          cur += '"'
          j++
        } else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',' || ch === '\t' || ch === ';') {
        cells.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    cells.push(cur.trim())
    if (cells.some((c) => c)) rows.push(cells)
  }
  return rows
}

async function recognizeStoreMenuImage(imageDataUrl, storeName) {
  try {
    const r = await postJson('/api/meoo-store-menu-recognize', {
      imageDataUrl,
      storeName: storeName || '',
    })
    if (r.ok && Array.isArray(r.items) && r.items.length) {
      return { ok: true, items: r.items, notes: r.notes || '' }
    }
    return {
      ok: false,
      message: String(r.notes || r.detail || r.error || r.message || '未识别到价目条目'),
    }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '识别失败' }
  }
}

async function recognizeStoreMenuExcel(body) {
  try {
    const r = await postJson('/api/meoo-store-menu-excel-recognize', body || {})
    if (r.ok && Array.isArray(r.items) && r.items.length) {
      return { ok: true, items: r.items, notes: r.notes || '' }
    }
    return {
      ok: false,
      message: String(r.notes || r.detail || r.error || r.message || '未识别到价目条目'),
    }
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'Excel 识别失败' }
  }
}

function readMargins() {
  const margin = readJson(marginStorageKey())
  const m = margin && margin.margins ? margin.margins : {}
  return {
    douyin: typeof m.douyin === 'number' ? m.douyin : 38,
    meituan: typeof m.meituan === 'number' ? m.meituan : 35,
    xhs: typeof m.xhs === 'number' ? m.xhs : 32,
  }
}

function readIndustryPath() {
  const margin = readJson(marginStorageKey())
  const industry = margin && margin.industry ? margin.industry : {}
  return String(industry.path || industry.name || '').trim()
}

function menuSummaryLines(items, max) {
  const limit = max || 40
  const list = Array.isArray(items) ? items : []
  const lines = list
    .slice(0, limit)
    .map((it) => {
      const name = String((it && it.name) || '').trim()
      if (!name) return ''
      const p =
        it && typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan)
          ? ` ¥${it.priceYuan}`
          : ''
      const cat = it && it.category ? `[${it.category}] ` : ''
      return `${cat}${name}${p}`
    })
    .filter(Boolean)
  if (list.length > limit) lines.push(`…共 ${list.length} 项`)
  return lines.join('\n')
}

async function runCompetitorAnalysis(body) {
  try {
    const r = await postJson('/api/meoo-competitor-analysis', body)
    if (r.ok && r.summary) {
      return {
        ok: true,
        summary: String(r.summary),
        industryHint: r.industryHint,
        competitors: Array.isArray(r.competitors) ? r.competitors : [],
        suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
        bundleSuggestions: Array.isArray(r.bundleSuggestions) ? r.bundleSuggestions : [],
        mapSource: r.mapSource || '',
        mapProvider: r.mapProvider || r.mapSource || '',
        mapMeta: r.mapMeta && typeof r.mapMeta === 'object' ? r.mapMeta : null,
        peerPois: Array.isArray(r.peerPois) ? r.peerPois : [],
        heatMapGrid: Array.isArray(r.heatMapGrid) ? r.heatMapGrid : [],
        footTrafficHeat: r.footTrafficHeat || null,
        location: (r.mapMeta && r.mapMeta.location) || (r.footTrafficHeat && r.footTrafficHeat.location) || null,
      }
    }
    return { ok: false, message: String(r.error || r.message || r.detail || '分析失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '分析失败' }
  }
}

async function fetchDigitalHumanDouyinLink(url) {
  try {
    const r = await postJson('/api/meoo-digital-human-douyin-link', {
      url: String(url || '').trim(),
      tenantId: tenantId() || undefined,
    })
    if (r.ok && (r.script || r.text || r.copy)) {
      return {
        ok: true,
        script: String(r.script || r.text || r.copy || '').trim(),
        motion: String(r.motionInstructions || r.motion || r.action || '').trim(),
        title: String(r.title || r.sourceTitle || '').trim(),
      }
    }
    return { ok: false, message: String(r.message || r.error || r.detail || '链接解析失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '链接解析失败' }
  }
}

async function transcribeOralAudio(filePath) {
  const lower = String(filePath || '').toLowerCase()
  const mime = lower.endsWith('.wav')
    ? 'audio/wav'
    : lower.endsWith('.mp3')
      ? 'audio/mpeg'
      : lower.endsWith('.m4a')
        ? 'audio/mp4'
        : 'audio/aac'
  let audioBase64 = ''
  try {
    audioBase64 = wx.getFileSystemManager().readFileSync(filePath, 'base64')
  } catch (e) {
    return { ok: false, message: (e && e.message) || '读取音频失败' }
  }
  if (!audioBase64) return { ok: false, message: '音频文件为空' }
  try {
    const r = await postJson('/api/meoo-ai-asr', { audioBase64, mime })
    const text = String((r && (r.text || r.script || r.content)) || '').trim()
    if (!text) return { ok: false, message: '没有识别到口播内容，请换一段清晰人声' }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '语音识别失败' }
  }
}

async function synthesizeDigitalHumanTts(body) {
  try {
    const payload = Object.assign({ tenantId: tenantId() || undefined }, body || {})
    const r = await postJson('/api/meoo-digital-human-tts', payload)
    if (r.ok && r.audioBase64) {
      return {
        ok: true,
        audioBase64: String(r.audioBase64),
        mimeType: String(r.mimeType || 'audio/mpeg'),
      }
    }
    return { ok: false, message: String(r.message || r.error || r.detail || '合成失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '合成失败' }
  }
}

function tierKeyFromLabel(tier) {
  const s = String(tier || '').trim()
  if (/5\+|V5\+|以上/.test(s)) return 'v5plus'
  if (/头|V5|^5|五级/.test(s)) return 'v5'
  if (/腰|V4|^4|四级/.test(s)) return 'v4'
  return 'v3'
}

function seatsFromTalentBudget(budget, fallbackPlatform) {
  const seats = []
  const rows = budget && Array.isArray(budget.talentRows) ? budget.talentRows : []
  const lines = budget && Array.isArray(budget.budgetLines) ? budget.budgetLines : []
  const push = (row, kind) => {
    const count = Math.max(0, Math.floor(Number(row.headcount) || 0))
    if (count < 1) return
    const tierLabel = String(row.tier || '').trim()
    const platform = String(row.platform || fallbackPlatform || '抖音').trim() || '抖音'
    const talentType = String(row.talentType || row.category || kind || '').trim()
    for (let i = 0; i < count && seats.length < 24; i += 1) {
      seats.push({
        seatId: `${kind}-${seats.length + 1}`,
        tierKey: tierKeyFromLabel(tierLabel),
        tierLabel: tierLabel || tierKeyFromLabel(tierLabel),
        unitBudgetYuan: Math.max(0, Math.round(Number(row.unitBudgetYuan) || 0)),
        talentType,
        platform,
      })
    }
  }
  rows.forEach((row) => {
    if (/投流/.test(`${row.contentForm || ''}${row.talentType || ''}`)) return
    push(row, 'row')
  })
  if (!seats.length) {
    lines.forEach((line) => {
      const category = String(line.category || '')
      if (/投流|本地推/.test(category) || !/达人/.test(category)) return
      push(Object.assign({}, line, { talentType: category }), 'line')
    })
  }
  return seats
}

function textLines(list, mapFn) {
  if (!Array.isArray(list)) return []
  return list.map(mapFn).map((s) => String(s || '').trim()).filter(Boolean)
}

function httpsUrl(raw) {
  const s = String(raw || '').trim()
  return /^https:\/\//i.test(s) ? s : ''
}

function talentProfileLabel(platform, url) {
  const host = String(url || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/^www\./, '')
  const plat = String(platform || '')
  if (plat === '抖音' || /douyin/.test(host)) return '复制抖音主页'
  if (plat === '小红书' || /xhs|xiaohongshu/.test(host)) return '复制小红书主页'
  if (plat === '大众点评' || /dianping/.test(host)) return '复制大众点评主页'
  if (plat === '快手' || /kuaishou|chenzhong/.test(host)) return '复制快手主页'
  if (plat === '微信视频号' || /weixin|channels/.test(host)) return '复制视频号主页'
  return '复制主页链接'
}

function decorateTalentCards(cards, seats) {
  const byId = {}
  ;(seats || []).forEach((s) => {
    if (s && s.seatId) byId[s.seatId] = s
  })
  return (cards || []).map((c) => {
    const seat = byId[c.seatId] || {}
    const nickname = String(c.nickname || '').trim()
    const empty = !!c.empty || !c.talentId
    const platform = String(c.platform || seat.platform || '抖音')
    const profileLink = empty ? '' : httpsUrl(c.profileLink)
    return {
      seatId: String(c.seatId || ''),
      talentId: String(c.talentId || ''),
      tierKey: seat.tierKey || c.tierKey || tierKeyFromLabel(c.tierLabel),
      tierLabel: String(c.tierLabel || seat.tierLabel || ''),
      unitBudgetYuan: Number(c.unitBudgetYuan || seat.unitBudgetYuan || 0),
      talentType: String(c.talentType || seat.talentType || ''),
      platform,
      nickname,
      avatarUrl: empty ? '' : httpsUrl(c.avatarUrl),
      avatarInitial: (nickname || '达').slice(0, 1),
      profileLink,
      profileLabel: profileLink ? talentProfileLabel(platform, profileLink) : '',
      line: empty
        ? `${c.tierLabel || '这一档'} · 库内暂无下一位`
        : [
            nickname || '达人',
            c.city || '',
            platform,
            `${Number(c.followers) || 0}粉`,
            c.quoteYuan != null && c.quoteYuan !== '' ? `¥${c.quoteYuan}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
      reason: String(c.reason || ''),
      empty,
    }
  })
}

function seatsForTalentReplace(cards, replaceId) {
  return (cards || []).map((c) => {
    const seat = {
      seatId: c.seatId,
      tierKey: c.tierKey || tierKeyFromLabel(c.tierLabel),
      tierLabel: c.tierLabel || '',
      unitBudgetYuan: Number(c.unitBudgetYuan) || 0,
      talentType: c.talentType || '',
      platform: c.platform || '抖音',
    }
    if (c.talentId && c.talentId !== replaceId) seat.lockedTalentId = c.talentId
    return seat
  })
}

function normalizeOpsPlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const ops = plan.opsPlan || {}
  const exec = plan.executionPlan || {}
  const budget = plan.marketingBudget || {}
  const talent = plan.talentBudget || {}
  const insight = talent.libraryInsight && typeof talent.libraryInsight === 'object' ? talent.libraryInsight : null
  const talentRows = Array.isArray(talent.talentRows) ? talent.talentRows : []
  const budgetLines = Array.isArray(talent.budgetLines) ? talent.budgetLines : []
  const platform =
    (insight && insight.platform) ||
    (talentRows[0] && talentRows[0].platform) ||
    (budgetLines[0] && budgetLines[0].platform) ||
    '抖音'
  const peopleLine = budgetLines.find(
    (r) => r && /达人/.test(String(r.category || '')) && !/投流|本地推/.test(String(r.category || '')),
  )
  return {
    planEdition: String(plan.planEdition || '').trim() || 'standard',
    simplePlan: plan.simplePlan && typeof plan.simplePlan === 'object' ? plan.simplePlan : null,
    background: String(ops.background || '').trim(),
    backgroundDetail: String(ops.backgroundDetail || '').trim(),
    positioning: String(ops.positioning || '').trim(),
    activities: String(ops.activities || '').trim(),
    targetAudience: String(ops.targetAudience || '').trim(),
    goals: Array.isArray(ops.goals) ? ops.goals.map((x) => String(x)).filter(Boolean) : [],
    risks: Array.isArray(ops.risks) ? ops.risks.map((x) => String(x)).filter(Boolean) : [],
    contentPillars: Array.isArray(ops.contentPillars)
      ? ops.contentPillars.map((x) => String(x)).filter(Boolean)
      : [],
    monthlyThemes: Array.isArray(ops.monthlyThemes)
      ? ops.monthlyThemes.map((x) => String(x)).filter(Boolean)
      : [],
    platformLines: textLines(ops.platformStrategy, (p) =>
      p && p.platform ? `${p.platform}：${p.approach || ''} ${p.publishFreq || ''} ${p.kpi || ''}`.trim() : '',
    ),
    overview: String(exec.overview || '').trim(),
    phases: textLines(exec.phases, (p) =>
      p && (p.phase || p.actions) ? `${p.phase || '阶段'}${p.dateRange ? `（${p.dateRange}）` : ''}：${p.actions || ''}` : '',
    ),
    weekly: textLines(exec.weeklyActions, (w) =>
      w && (w.week || w.focus) ? `${w.week || ''} ${w.dateRange || ''}：${w.focus || ''} ${w.tasks || ''}`.trim() : '',
    ),
    totalBudget: typeof budget.totalBudget === 'number' ? budget.totalBudget : 0,
    roiSummary: String(budget.roiSummary || '').trim(),
    assumptions: String(budget.assumptions || '').trim(),
    channels: textLines(budget.channels, (c) =>
      c && c.channel
        ? `${c.channel}${c.month ? ` ${c.month}` : ''} ¥${Number(c.amountYuan) || 0}（${Number(c.ratioPct) || 0}%）${c.note ? ` ${c.note}` : ''}`
        : '',
    ),
    roiRows: textLines(budget.roiAnalysis, (r) =>
      r && r.channel
        ? `${r.channel} 投入¥${Number(r.investYuan) || 0} 预计GMV¥${Number(r.expectedGmvYuan) || 0} ROI ${r.roi || '—'}`
        : '',
    ),
    milestones: textLines(plan.calendar && plan.calendar.milestones, (m) =>
      m && (m.item || m.date) ? `${m.date || ''} ${m.time || ''} ${m.item || ''}`.trim() : '',
    ),
    budgetLineTexts: textLines(budgetLines, (l) =>
      l && l.category
        ? `${l.category} ${l.platform || ''} ${l.tier || ''} ${Number(l.headcount) || 0}人 单人¥${Number(l.unitBudgetYuan) || 0} 小计¥${Number(l.subtotalYuan) || 0}`
        : '',
    ),
    talentRowTexts: textLines(talentRows, (t) =>
      t && (t.platform || t.talentType)
        ? `${t.platform || ''} ${t.tier || ''} ${t.talentType || ''} ${Number(t.headcount) || 0}人 单场¥${Number(t.unitBudgetYuan) || 0}`
        : '',
    ),
    libraryNote: insight
      ? [
          insight.sourceLabel || '',
          insight.tierAvgSummary || '',
          insight.headSamples && insight.headSamples.length ? `头部：${insight.headSamples.join('、')}` : '',
          insight.midTailSamples && insight.midTailSamples.length ? `腰尾：${insight.midTailSamples.join('、')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    combos: textLines(plan.productBoard && plan.productBoard.combos, (c) =>
      c && c.name ? `${c.name} ¥${Number(c.priceYuan) || 0}${c.sellingPoint ? ` ${c.sellingPoint}` : ''}` : '',
    ),
    talentSeats: seatsFromTalentBudget(talent, platform),
    talentCity: insight && insight.filterCity ? String(insight.filterCity) : '',
    talentPlatform: String(platform || '抖音'),
    talentType: String(
      (talentRows[0] && talentRows[0].talentType) || (peopleLine && peopleLine.category) || ops.positioning || '',
    ),
  }
}

async function requestTalentRecommend(body) {
  try {
    const r = await postJson('/api/meoo-ops-novice-kol-allocation', Object.assign({ mode: 'talent_recommend' }, body || {}))
    if (r && r.ok) {
      const seats = Array.isArray(r.seats) ? r.seats : []
      return {
        ok: true,
        cards: decorateTalentCards(Array.isArray(r.cards) ? r.cards : [], seats),
        seats,
        cityNote: String(r.cityNote || ''),
      }
    }
    return { ok: false, message: String((r && (r.error || r.message || r.detail)) || '推荐名单暂时取不到') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '推荐名单暂时取不到' }
  }
}

async function generateAiOpsPlan(body) {
  try {
    const r = await postJson('/api/meoo-ai-ops-plan', body)
    if (r.ok && r.plan) {
      const plan = normalizeOpsPlan(r.plan)
      const simpleOk =
        plan &&
        plan.simplePlan &&
        ((Array.isArray(plan.simplePlan.steps) && plan.simplePlan.steps.length) ||
          (plan.simplePlan.hero && (plan.simplePlan.hero.title || plan.simplePlan.hero.headline)))
      if (plan && (simpleOk || plan.background || plan.positioning || plan.goals.length)) {
        return {
          ok: true,
          plan,
          pointsCharged: typeof r.pointsCharged === 'number' ? r.pointsCharged : undefined,
          pointsBalance: typeof r.pointsBalance === 'number' ? r.pointsBalance : undefined,
        }
      }
      return { ok: false, message: '方案内容不完整，请重试' }
    }
    return { ok: false, message: String(r.message || r.error || r.detail || '生成失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '生成失败' }
  }
}

/** 对齐 Web storeIntelApi.runSiteSelection */
async function runSiteSelection(body) {
  try {
    const r = await postJson('/api/meoo-site-selection', body)
    if (r.ok && r.summary && r.score) {
      return {
        ok: true,
        summary: String(r.summary || ''),
        score: r.score,
        scoreStory: r.scoreStory || '',
        brandUnderstanding: r.brandUnderstanding || '',
        footTrafficHeat: r.footTrafficHeat || null,
        recommendations: Array.isArray(r.recommendations) ? r.recommendations : [],
        checklist: Array.isArray(r.checklist) ? r.checklist : [],
        nearby: r.nearby || null,
        location: r.location || null,
        heatMapGrid: Array.isArray(r.heatMapGrid) ? r.heatMapGrid : [],
        mapProvider: r.mapProvider || r.mapSource || '',
        mapSource: r.mapSource || r.mapProvider || '',
        competitors: Array.isArray(r.competitors) ? r.competitors : [],
        mapMeta: r.mapMeta && typeof r.mapMeta === 'object' ? r.mapMeta : null,
      }
    }
    return { ok: false, message: String(r.error || r.message || r.detail || '选址评估失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '选址评估失败' }
  }
}

module.exports = {
  tenantId,
  readStoreMenu,
  writeStoreMenuLocal,
  saveStoreMenu,
  mergeMenuItems,
  parseCsvToRows,
  recognizeStoreMenuImage,
  recognizeStoreMenuExcel,
  readMargins,
  readIndustryPath,
  menuSummaryLines,
  runCompetitorAnalysis,
  synthesizeDigitalHumanTts,
  fetchDigitalHumanDouyinLink,
  transcribeOralAudio,
  generateAiOpsPlan,
  runSiteSelection,
  requestTalentRecommend,
  seatsForTalentReplace,
}
