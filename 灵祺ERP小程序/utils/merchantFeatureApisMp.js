/**
 * 商家 ERP 小程序 · 菜单/竞对/数字人 TTS / AI 运营方案
 * （对齐商家 Web，不含服务商分版）
 */
const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')
const sessionSync = require('./merchantSessionSyncMp.js')
const supabaseRest = require('./supabaseRest.js')
const talentCities = require('./talentCityNamesMp.js')

function postJson(path, body, timeoutMs) {
  const token = api.getBearerToken()
  return merchantRequestAuth('POST', path, {
    data: body || {},
    bearerToken: token,
    timeoutMs: timeoutMs || 120000,
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
  if (/5\+|V5\+|以上|Lv[6-8]|[6-8]级|六级|七级|八级/.test(s)) return 'v5plus'
  if (/头|V5|Lv5|^5|五级/.test(s)) return 'v5'
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
    for (let i = 0; i < count && seats.length < 80; i += 1) {
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
    const fansBit = followerBit(c)
    const tagBit = (Array.isArray(c.tags) ? c.tags : []).slice(0, 2).filter(Boolean).join(' / ')
    return {
      seatId: String(c.seatId || ''),
      talentId: String(c.talentId || ''),
      tierKey: seat.tierKey || c.tierKey || tierKeyFromLabel(c.tierLabel),
      tierLabel: String(c.tierLabel || seat.tierLabel || ''),
      unitBudgetYuan: Number(c.unitBudgetYuan || seat.unitBudgetYuan || 0),
      talentType: String(c.talentType || seat.talentType || ''),
      platform,
      nickname,
      city: String(c.city || ''),
      followers: Number(c.followers) || 0,
      quoteYuan: c.quoteYuan != null && c.quoteYuan !== '' ? Number(c.quoteYuan) : null,
      level: String(c.level || c.tierLabel || ''),
      tags: Array.isArray(c.tags) ? c.tags : [],
      source: String(c.source || ''),
      avatarUrl: empty ? '' : httpsUrl(c.avatarUrl),
      avatarInitial: (nickname || '达').slice(0, 1),
      profileLink,
      profileLabel: profileLink
        ? /\/search\//.test(profileLink)
          ? '去抖音搜这位达人'
          : talentProfileLabel(platform, profileLink)
        : '',
      line: empty
        ? `${c.tierLabel || '这一档'} · 库内暂无下一位`
        : [
            nickname || '达人',
            c.city || '',
            platform,
            fansBit,
            tagBit,
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
    if (c.talentId && c.talentId !== replaceId && String(c.talentId).indexOf('public:') !== 0) {
      seat.lockedTalentId = c.talentId
    }
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

function intentText(text) {
  return String(text || '')
    .replace(/\[引用[\s\S]*?\n\n/, '')
    .trim()
}

function nearestCity(text, anchorWords) {
  const body = String(text || '')
  if (!body.trim()) return ''
  let anchor = -1
  ;(anchorWords || []).forEach((word) => {
    anchor = Math.max(anchor, body.lastIndexOf(word))
  })
  let best = null
  talentCities.forEach((city) => {
    const short = String(city).replace(/市$/, '')
    const fullAt = body.indexOf(city)
    const shortAt = short.length >= 2 ? body.indexOf(short) : -1
    const index = fullAt >= 0 ? fullAt : shortAt
    if (index < 0) return
    const len = fullAt >= 0 ? city.length : short.length
    const dist = anchor >= 0 ? Math.abs(index - anchor) : index
    if (!best || dist < best.dist || (dist === best.dist && len > best.len)) {
      best = { dist, city, len }
    }
  })
  return best ? best.city : ''
}

function cityAskedForTalents(text) {
  return nearestCity(intentText(text), ['推荐', '达人', '找'])
}

function cityMentionedInText(text) {
  const body = String(text || '')
  if (!body.trim()) return ''
  let best = null
  talentCities.forEach((city) => {
    const short = String(city).replace(/市$/, '')
    const fullAt = body.indexOf(city)
    const shortAt = short.length >= 2 ? body.indexOf(short) : -1
    const index = fullAt >= 0 ? fullAt : shortAt
    if (index < 0) return
    const len = fullAt >= 0 ? city.length : short.length
    if (!best || index < best.index || (index === best.index && len > best.len)) {
      best = { index, city, len }
    }
  })
  return best ? best.city : ''
}

function isTalentRecommendAsk(text) {
  const x = intentText(text)
  if (/达人/.test(x) && /推荐|找|匹配|名单|有哪些|介绍/.test(x)) return true
  return /^(?:请)?(?:帮我|给我|为我)?推荐(?:一下|达人|人选|名单)?[。！!]?$/.test(x)
}

function followerBit(card) {
  const n = Number(card && card.followers) || 0
  if (n <= 0) return ''
  if (card.source === 'public' && !card.followersVerified) return ''
  if (card.source === 'public' && n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : String(Math.round(wan * 10) / 10)
    return `粉丝${text}万`
  }
  if (card.source === 'public') return `粉丝${Math.round(n)}`
  return `${Math.round(n)}粉`
}

/** 与网页 talentHeadcountFromDialogue 同一顺序：方案表总计优先。 */
function tableTalentHeadcount(text) {
  const lines = String(text || '').split(/\n/)
  let total = 0
  let tierSum = 0
  lines.forEach((line) => {
    const totalM = line.match(/(?:总计|合计|总共|一共)[^0-9]{0,16}(\d{1,2})\s*[人位]/)
    if (totalM) {
      const n = Number(totalM[1])
      if (n >= 1 && n <= 20) total = n
      return
    }
    if (/备用|投流|本地推/.test(line)) return
    if (!/(?:S级|A级|B级|C级|大V|腰部|素人|KOC|头部)/.test(line)) return
    const nM = line.match(/(\d{1,2})\s*人/)
    if (!nM) return
    const n = Number(nM[1])
    if (n >= 1 && n <= 20) tierSum += n
  })
  if (total >= 1) return total
  if (tierSum >= 1 && tierSum <= 20) return tierSum
  return 0
}

function planHeadcountFromTexts(userText, priorText) {
  const blobs = [String(userText || ''), String(priorText || '')]
  for (let i = 0; i < blobs.length; i += 1) {
    const fromTable = tableTalentHeadcount(blobs[i])
    if (fromTable > 0) return fromTable
  }
  for (let i = 0; i < blobs.length; i += 1) {
    const flat = blobs[i].replace(/,/g, '')
    const invited = flat.match(/(?:邀请|招募|安排|共|合计|总共|需要)\s*(\d{1,2})\s*位/)
    const plain = flat.match(/(\d{1,2})\s*位\s*(?:达人|探店)/)
    const n = Number((invited && invited[1]) || (plain && plain[1]) || 0)
    if (n >= 1 && n <= 20) return n
  }
  return 5
}

function douyinSearchLink(nickname) {
  return `https://www.douyin.com/search/${encodeURIComponent(`${String(nickname || '').trim()} 达人`)}`
}

function cardFromPublicSeed(seed, seatId, talentType) {
  const ready = !!(seed && seed.profileReady && seed.profileLink && !/\/search\//.test(String(seed.profileLink)))
  const followers = ready && Number(seed.followers) > 0 ? Math.round(Number(seed.followers)) : 0
  const profileLink = ready ? String(seed.profileLink) : douyinSearchLink(seed && seed.nickname)
  return {
    seatId,
    talentId: `public:${seed.nickname}`,
    nickname: String(seed.nickname || '').trim(),
    city: String(seed.city || ''),
    platform: '抖音',
    followers,
    followersVerified: followers > 0,
    level: '',
    quoteYuan: null,
    tags: Array.isArray(seed.tags) ? seed.tags.slice(0, 3) : [],
    avatarUrl: ready ? String(seed.avatarUrl || '') : '',
    profileLink,
    profileVerified: ready,
    tierLabel: '公网',
    unitBudgetYuan: 0,
    talentType: seed.direction || talentType || '',
    source: 'public',
    exploreVerified: true,
    reason: seed.direction ? `公网 · ${seed.direction}` : '公网补位',
    empty: false,
  }
}

async function fetchPublicExploreSeeds(city, industry, gap, skipNames) {
  const need = Math.max(0, Math.min(20, Number(gap) || 0))
  const region = String(city || '').trim()
  if (!region || need < 1) return []
  try {
    const r = await postJson(
      '/api/meoo-ops-novice-kol-allocation',
      {
        mode: 'talent_public_fill',
        city: region,
        industry: industry || '本地生活',
        gap: need,
        skipNames: (skipNames || []).filter(Boolean).slice(0, 40),
      },
      170000,
    )
    if (!r || r.ok === false) return []
    return Array.isArray(r.seeds) ? r.seeds : []
  } catch (_) {
    return []
  }
}

function talentRosterNote(headcount, libraryCount, publicCount) {
  const asked = `方案要 ${headcount} 位。`
  if (publicCount > 0) return `${asked}星选库接近要求的有 ${libraryCount} 位，公网补了 ${publicCount} 位。`
  if (libraryCount < headcount) return `${asked}星选库接近要求的有 ${libraryCount} 位。公网这次没有补到更多同城达人。`
  return `${asked}星选库已按门店类目配满 ${libraryCount} 位。`
}

async function buildTalentChatRoster(userText, priorText, intelText) {
  if (!isTalentRecommendAsk(userText)) return null
  const named = cityAskedForTalents(userText)
  const planCity = cityAskedForTalents(priorText)
  let city = named || planCity
  if (!city) city = intelField(intelText, '门店所在城市')
  const industryRaw = intelField(intelText, '经营类目').replace(/（.*$/, '').trim()
  const industry = industryRaw && industryRaw.indexOf('绑定接口未返回') < 0 ? industryRaw : ''
  const storeName = intelField(intelText, '当前门店')
  const talentType = industry || '本地生活到店'
  const headcount = planHeadcountFromTexts(userText, priorText)
  const library = await requestTalentRecommend({
    city,
    platform: '抖音',
    talentType,
    budgetYuan: 5000,
    headcount,
    seats: [],
    excludedIds: [],
    skipPublic: true,
  })
  const cards = (library && library.cards) || []
  const needles = requirementNeedles(industry)
  const sameCity = cards.filter((c) => !c.empty && String(c.nickname || '').trim() && cardMatchesCity(c, city))
  const matched = sameCity.filter((c) => cardMatchesStore(c, needles))
  const picked = matched.slice(0, headcount)
  const gap = Math.max(0, headcount - picked.length)
  const seeds = await fetchPublicExploreSeeds(
    city,
    talentType,
    gap,
    picked.map((c) => c.nickname).filter(Boolean),
  )
  const publicCards = seeds
    .filter((seed) => seed && String(seed.nickname || '').trim())
    .slice(0, gap)
    .map((seed, index) => cardFromPublicSeed(seed, `public-${index + 1}`, talentType))
  const all = picked.concat(publicCards)
  if (!all.length) return null
  return {
    cards: decorateTalentCards(all, []).map((card, index) =>
      Object.assign({}, card, { seatId: card.seatId || `seat-${index + 1}` }),
    ),
    city: city || '',
    talentType,
    storeName: storeName || '',
    note: talentRosterNote(headcount, picked.length, publicCards.length),
    headcount,
  }
}

async function replaceTalentChatCard(roster, nickname) {
  const current = (roster && roster.cards) || []
  const skipNames = current.map((c) => String(c.nickname || '').trim()).filter(Boolean)
  if (nickname) skipNames.push(String(nickname).trim())
  const seeds = await fetchPublicExploreSeeds(roster.city, roster.talentType, 1, skipNames)
  const seed = seeds.find((item) => item && String(item.nickname || '').trim() && skipNames.indexOf(String(item.nickname).trim()) < 0)
  if (!seed) return null
  const decorated = decorateTalentCards([cardFromPublicSeed(seed, `public-replace-${Date.now()}`, roster.talentType)], [])
  return decorated[0] || null
}

function intelField(intel, label) {
  const matched = String(intel || '').match(new RegExp(label + '：([^\\n]+)'))
  return matched ? String(matched[1]).trim() : ''
}

function requirementNeedles(industry) {
  return String(industry || '')
    .split(/[/、,，|>\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/本地生活|到店|服务|其他/.test(s))
    .slice(0, 6)
}

function cardMatchesCity(card, city) {
  const short = String(city || '').replace(/市$/, '').trim()
  if (short.length < 2) return true
  const label = String((card && card.city) || '').replace(/市$/, '').trim()
  if (!label) return false
  return label.indexOf(short) >= 0 || short.indexOf(label) >= 0
}

function cardMatchesStore(card, needles) {
  if (!needles.length) return true
  const blob = [card.nickname, card.reason, card.line].concat(card.tags || []).join(' ')
  return needles.some((n) => blob.indexOf(n) >= 0)
}

function parseFans(raw) {
  const t = String(raw || '').replace(/粉丝/g, '').trim()
  const wan = t.match(/(\d+(?:\.\d+)?)\s*万/)
  if (wan) return Math.round(Number(wan[1]) * 10000)
  const n = t.match(/(\d{2,})/)
  return n ? Number(n[1]) : 0
}

function parsePublicTalentLines(text, cityHint, limit) {
  const cap = Math.min(20, Math.max(1, limit || 1))
  const out = []
  const seen = {}
  const want = String(cityHint || '').replace(/市$/, '').trim()
  String(text || '').split(/\n+/).forEach((line) => {
    if (out.length >= cap) return
    const row = line.replace(/^[\s\d.、\-•*]+/, '').replace(/\*\*/g, '').trim()
    if (!row || /^公网暂无|^暂无符合/.test(row)) return
    const parts = row.split(/[|｜]/).map((s) => s.trim()).filter(Boolean)
    let person = null
    if (parts.length >= 2) {
      const nickname = parts[0].replace(/^昵称[:：]/, '').slice(0, 24)
      if (/^达人$|^公网$|^检索$/.test(nickname)) return
      person = {
        nickname,
        city: parts[1] || cityHint,
        followers: parseFans(parts[2] || row),
        level: parts[3] || '',
        reason: parts.slice(4).join(' ').slice(0, 80),
      }
    } else {
      if (want && row.indexOf(want) < 0 && !/粉丝|万粉|探店/.test(row)) return
      const nickname = (row.match(/[\u4e00-\u9fffA-Za-z0-9_（）()]{2,16}/) || [])[0] || ''
      if (!nickname || nickname === want || /^(达人|公网|检索|粉丝|探店|本地生活)$/.test(nickname)) return
      person = {
        nickname: nickname.replace(/[（(].*$/, '').slice(0, 24),
        city: cityHint,
        followers: parseFans(row),
        level: '',
        reason: row.slice(0, 80),
      }
    }
    const key = person.nickname.trim()
    if (key.length < 2 || seen[key]) return
    seen[key] = true
    out.push(person)
  })
  return out
}

async function fetchPublicTalents(opts) {
  const city = String(opts.city || '').trim() || '门店所在城市'
  const need = String(opts.talentType || '').trim() || '本地生活'
  const want = Math.min(20, Math.max(1, Number(opts.count) || 1))
  const skip = (opts.skipNames || []).filter(Boolean).slice(0, 24)
  try {
    const data = await postJson(
      '/api/meoo-ai-chat',
      {
        provider: 'doubao',
        stream: false,
        temperature: 0,
        webSearch: true,
        messages: [
          {
            role: 'system',
            content: `你是豆包公网达人检索。请联网搜索「${city} 抖音 探店达人」「${city} ${need} 达人」。只写${opts.platform || '抖音'}、区域在「${city}」、内容贴近「${need}」的达人，凑满 ${want} 位。不要前言。每行严格：昵称｜${city}｜粉丝数字｜等级｜内容方向。不要电话或微信。${skip.length ? `不要重复：${skip.join('、')}。` : ''}`,
          },
          {
            role: 'user',
            content: `城市：${city}\n搜索：${city} 抖音 达人 探店 ${need}\n请列出 ${want} 位达人。`,
          },
        ],
      },
      90000,
    )
    return parsePublicTalentLines(String((data && data.content) || ''), city, want)
  } catch (_) {
    return []
  }
}

async function fetchPublicTalentsUntil(opts) {
  const all = []
  const seen = {}
  ;(opts.skipNames || []).forEach((name) => {
    if (name) seen[name] = true
  })
  let left = Math.min(20, Math.max(0, Number(opts.count) || 0))
  for (let round = 0; round < 2 && left > 0; round += 1) {
    const batch = await fetchPublicTalents(
      Object.assign({}, opts, { count: left, skipNames: Object.keys(seen) }),
    )
    if (!batch.length) break
    batch.forEach((person) => {
      if (seen[person.nickname]) return
      seen[person.nickname] = true
      all.push(person)
    })
    left = Math.min(20, Number(opts.count) || 0) - all.length
  }
  return all
}

function publicCard(person, base, city, platform) {
  const seat = base || {}
  return {
    seatId: seat.seatId || '',
    empty: false,
    talentId: `public:${person.nickname}`,
    nickname: person.nickname,
    city: person.city || city,
    platform: platform || seat.platform || '抖音',
    followers: person.followers,
    level: person.level || seat.tierLabel || '',
    tierLabel: seat.tierLabel || '公网',
    tierKey: seat.tierKey || '',
    unitBudgetYuan: seat.unitBudgetYuan || 0,
    talentType: seat.talentType || '',
    quoteYuan: null,
    tags: [],
    avatarUrl: '',
    profileLink: '',
    source: 'public',
    reason: person.reason ? `公网 · ${person.reason}` : '公网补位',
  }
}

function fillEmptyCardsFromPublic(cards, people, city, platform, target) {
  let cursor = 0
  let filled = 0
  const want = String(city || '').replace(/市$/, '').trim()
  const take = () => {
    while (cursor < people.length) {
      const cityName = people[cursor] && people[cursor].city ? people[cursor].city : ''
      if (!want || !cityName || cityName.indexOf(want) >= 0) break
      cursor += 1
    }
    const person = people[cursor]
    if (!person) return null
    cursor += 1
    return person
  }
  const next = []
  ;(cards || []).forEach((card) => {
    if (card && !card.empty && card.talentId) {
      next.push(card)
      return
    }
    const person = take()
    if (!person) return
    filled += 1
    next.push(publicCard(person, card, city, platform))
  })
  const template = (cards || []).find((card) => card && !card.empty && card.talentId) || (cards || [])[0]
  while (template && next.length < target) {
    const person = take()
    if (!person) break
    filled += 1
    next.push(
      publicCard(
        person,
        Object.assign({}, template, { seatId: `public-extra-${filled}`, tierLabel: template.tierLabel || '公网' }),
        city,
        platform,
      ),
    )
  }
  return { cards: next, filled }
}

function recommendTarget(payload, libraryCards) {
  const seats = Array.isArray(payload.seats) ? payload.seats : []
  const headcount = Number(payload.headcount) || 0
  const budgetYuan = Number(payload.budgetYuan) || 0
  const count = seats.length > 0 ? seats.length : headcount > 0 ? headcount : budgetYuan > 0 ? Math.max(3, Math.min(12, Math.round(budgetYuan / 1200))) : 0
  return Math.max(count, headcount, (libraryCards || []).length)
}

async function fillTalentShortfallFromPublic(payload, libraryCards, cityNote) {
  const city = String(payload.city || '').trim()
  const platform = String(payload.platform || '抖音')
  const libraryFilled = (libraryCards || []).filter((c) => c && !c.empty && c.talentId)
  const target = recommendTarget(payload, libraryCards)
  const needPublic = Math.max(0, target - libraryFilled.length)
  if (needPublic <= 0) return { cards: libraryCards, cityNote }
  const people = await fetchPublicTalentsUntil({
    city,
    talentType: payload.talentType,
    platform,
    count: needPublic,
    skipNames: libraryFilled
      .map((c) => String(c.nickname || '').trim())
      .concat(payload.skipNames || [])
      .filter(Boolean),
  })
  const filled = fillEmptyCardsFromPublic(libraryCards, people, city, platform, target)
  const short = Math.max(0, target - filled.cards.length)
  return {
    cards: filled.cards,
    cityNote: [
      cityNote,
      `星选库 ${libraryFilled.length} 位，公网补了 ${filled.filled} 位。`,
      short > 0 ? `还差 ${short} 位，公网这次没有更多同城达人。` : '',
    ]
      .filter(Boolean)
      .join(' '),
  }
}

async function fetchDoubaoPublicTalentText(city, industry, storeName) {
  const region = city || '已绑定门店所在城市'
  const need = industry || '本地生活到店'
  try {
    const data = await postJson(
      '/api/meoo-ai-chat',
      {
        provider: 'doubao',
        stream: false,
        temperature: 0,
        webSearch: true,
        messages: [
          {
            role: 'system',
            content: `你是豆包公网达人检索。只写公网能核实的抖音本地生活达人，最多 5 位。区域只限「${region}」。内容要符合门店要求「${need}」。每人一行：昵称、城市、粉丝量级、内容方向、为何符合该门店。没有公开依据的不要写。不要编造联系方式。一个都没有就只回答「公网暂无符合条件的达人」。`,
          },
          {
            role: 'user',
            content: `门店：${storeName || '未命名'}。经营要求：${need}。请检索${region}、内容方向匹配该门店的达人。`,
          },
        ],
      },
      35000,
    )
    const text = String((data && data.content) || '').trim()
    return text ? text.slice(0, 1200) : '公网暂无符合条件的达人。'
  } catch (_) {
    return '豆包公网本次没有返回可用名单。'
  }
}

function formatLibraryLines(cards) {
  return (cards || [])
    .slice(0, 8)
    .map((c) => {
      const bits = [
        c.city,
        c.level,
        c.followers > 0 ? `粉丝${c.followers}` : '',
        c.quoteYuan != null ? `报价¥${c.quoteYuan}` : '',
        (c.tags || []).slice(0, 2).join('/'),
      ].filter(Boolean)
      return `- ${c.nickname}（${bits.join(' · ')}）`
    })
    .join('\n')
}

async function buildTalentRecommendChatBlock(userText, intelText) {
  if (!isTalentRecommendAsk(userText)) return ''
  const named = cityAskedForTalents(userText)
  let city = named
  let regionSource = named ? '用户指定' : ''
  if (!city) {
    city = intelField(intelText, '门店所在城市')
    regionSource = city ? '已绑定门店' : '未解析到'
  }
  const industryRaw = intelField(intelText, '经营类目').replace(/（.*$/, '').trim()
  const industry = industryRaw && industryRaw.indexOf('绑定接口未返回') < 0 ? industryRaw : ''
  const storeName = intelField(intelText, '当前门店')
  const needles = requirementNeedles(industry)
  const [publicText, library] = await Promise.all([
    fetchDoubaoPublicTalentText(city, industry, storeName),
    requestTalentRecommend({
      city,
      platform: '抖音',
      talentType: industry || '本地生活',
      budgetYuan: 5000,
      headcount: 8,
      seats: [],
      excludedIds: [],
      skipPublic: true,
    }),
  ])
  const cards = (library && library.cards) || []
  const sameCity = cards.filter((c) => !c.empty && String(c.nickname || '').trim() && cardMatchesCity(c, city))
  const matched = sameCity.filter((c) => cardMatchesStore(c, needles))
  const libraryLines = formatLibraryLines(matched)
  const libraryNote = libraryLines
    ? libraryLines
    : sameCity.length && needles.length
      ? `星选库在「${city || '该区域'}」有达人，但没有明显符合门店要求「${industry}」的人，本次不列入。`
      : `星选库在「${city || '该区域'}」暂无符合条件的达人。${library && library.cityNote ? `（${library.cityNote}）` : ''}`
  return [
    '【达人推荐 · 本次】',
    `区域：${city || '未解析'}（${regionSource}）。门店：${storeName || '未命名'}。门店要求：${industry || '本地生活到店'}。`,
    '作答必须分成「豆包公网」和「星选达人库」两段，只使用下面给出的人。某一路没有就说明该路没有。不要把其他城市的人说成这个区域的达人。不要编造电话或微信。不要整段拒答，不要让用户自己去蝉妈妈、飞瓜或 MCN。',
    `【豆包公网】\n${publicText}`,
    `【星选达人库】\n${libraryNote}`,
  ].join('\n')
}

async function requestTalentRecommend(body) {
  const payload = Object.assign({}, body || {})
  const skipPublic = !!payload.skipPublic
  const skipNames = Array.isArray(payload.skipNames) ? payload.skipNames : []
  delete payload.skipPublic
  delete payload.skipNames
  try {
    const r = await postJson('/api/meoo-ops-novice-kol-allocation', Object.assign({ mode: 'talent_recommend' }, payload))
    if (r && r.ok) {
      const seats = Array.isArray(r.seats) ? r.seats : []
      const libraryCards = Array.isArray(r.cards) ? r.cards : []
      const filled = skipPublic
        ? { cards: libraryCards, cityNote: String(r.cityNote || '') }
        : await fillTalentShortfallFromPublic(
            Object.assign({}, payload, { skipNames }),
            libraryCards,
            String(r.cityNote || ''),
          )
      return {
        ok: true,
        cards: decorateTalentCards(filled.cards, seats),
        seats,
        cityNote: filled.cityNote,
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
  buildTalentRecommendChatBlock,
  buildTalentChatRoster,
  replaceTalentChatCard,
  cityAskedForTalents,
  cityMentionedInText,
  isTalentRecommendAsk,
}
