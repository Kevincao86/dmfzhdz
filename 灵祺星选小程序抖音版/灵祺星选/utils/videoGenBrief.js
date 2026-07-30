/**
 * 小程序同构：视频生成 Brief 槽位 + 意图保真（轻量，不依赖 Web TS）
 */

var SLOT_LABELS = {
  scene: '场景/门店',
  offer: '卖点/主品',
  audience: '受众',
}

var DEFAULT_MUST_AVOID = [
  '画面内出现可读字幕、标题、Logo 文字',
  '静止幻灯片式切图',
  '编造未提及的店名或价格',
]

function firstMatch(text, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    var m = String(text || '').match(patterns[i])
    if (m && m[1] && String(m[1]).trim()) return String(m[1]).trim()
  }
  return ''
}

function extractMustInclude(raw, scene, offer) {
  var out = []
  function push(s) {
    var t = String(s || '').trim()
    if (t.length >= 2 && out.indexOf(t) < 0) out.push(t)
  }
  if (scene) push(scene)
  if (offer) push(offer)
  var re = /[「『]([^」』]{2,24})[」』]/g
  var m
  while ((m = re.exec(raw))) push(m[1])
  return out.slice(0, 8)
}

/**
 * @param {string} rawInput
 * @param {{ briefSlots?: string[] }|null} skill
 */
function buildBriefFromInput(rawInput, skill) {
  var raw = String(rawInput || '').trim()
  var scene = firstMatch(raw, [
    /(?:店名|门店|门店名|商圈|品牌|酒店|民宿)[：:\s]*([^\n，,。；;]{2,40})/i,
    /(?:在|去)([^\n，,。；;]{2,24}(?:店|馆|屋|院|庄|吧))/,
  ])
  var offer = firstMatch(raw, [
    /(?:卖点|主品|招牌|必点|产品|新品|活动|福利|菜品)[：:\s]*([^\n，,。；;]{2,48})/i,
  ])
  var audience = firstMatch(raw, [
    /(?:受众|人群|适合|面向)[：:\s]*([^\n，,。；;]{2,40})/i,
  ])
  var noteBlock = raw.match(/【商家补充】\s*([\s\S]+)/)
  if (noteBlock && noteBlock[1]) {
    var lines = String(noteBlock[1])
      .split('\n')
      .map(function (l) {
        return l.trim()
      })
      .filter(Boolean)
    if (lines[0] && !scene) scene = lines[0].slice(0, 40)
    if (lines[0] && !offer) {
      var parts = lines[0].split(/[，,、／/]/).map(function (x) {
        return x.trim()
      }).filter(Boolean)
      offer = (parts[1] || parts[0] || '').slice(0, 48)
    }
  }
  var required = (skill && skill.briefSlots) || ['scene', 'offer']
  var missingSlots = []
  if (!( !skill && raw.length >= 24)) {
    var filled = {
      scene: scene.length >= 2 || /店|馆|屋|院|品牌|商圈|门店/.test(raw),
      offer: offer.length >= 2 || /卖点|招牌|必点|产品|活动|福利|菜/.test(raw),
      audience: audience.length >= 2 || /适合|人群|受众/.test(raw),
    }
    for (var i = 0; i < required.length; i++) {
      if (!filled[required[i]]) missingSlots.push(required[i])
    }
  }
  return {
    scene: scene,
    offer: offer,
    audience: audience,
    mustInclude: extractMustInclude(raw, scene, offer),
    mustAvoid: DEFAULT_MUST_AVOID.slice(),
    raw: raw,
    missingSlots: missingSlots,
  }
}

function formatMissingSlotsMessage(brief) {
  if (!brief.missingSlots || !brief.missingSlots.length) return ''
  var labels = brief.missingSlots
    .map(function (s) {
      return SLOT_LABELS[s] || s
    })
    .join('、')
  return '请先补全：' + labels + '（写明店名/卖点等后再生成）。'
}

function enrichGuidanceFromBrief(brief) {
  var lines = []
  if (brief.raw) lines.push(brief.raw)
  lines.push('')
  lines.push('【结构化执导约束·须严格遵守】')
  if (brief.scene) lines.push('- 场景/门店：' + brief.scene)
  if (brief.offer) lines.push('- 主品/卖点：' + brief.offer)
  if (brief.audience) lines.push('- 受众：' + brief.audience)
  if (brief.mustInclude && brief.mustInclude.length) {
    lines.push('- 画面或口播必须出现：' + brief.mustInclude.join('、'))
  }
  if (brief.mustAvoid && brief.mustAvoid.length) {
    lines.push('- 禁止：' + brief.mustAvoid.slice(0, 4).join('；'))
  }
  lines.push('- 前 2 秒须有明确视觉钩子；中段突出主品/卖点；收尾含行动号召。')
  return lines.join('\n').trim()
}

function validateBriefFidelity(brief, promptOrRowsText) {
  var issues = []
  var text = String(promptOrRowsText || '')
  var norm = text.replace(/\s+/g, '')
  if (brief.missingSlots && brief.missingSlots.length) {
    issues.push(formatMissingSlotsMessage(brief))
  }
  var list = brief.mustInclude || []
  for (var i = 0; i < list.length; i++) {
    var key = String(list[i] || '').trim()
    if (key.length < 2) continue
    if (norm.indexOf(key.replace(/\s+/g, '')) < 0 && text.indexOf(key) < 0) {
      issues.push('意图保真：文案未体现「' + key + '」')
    }
  }
  if (text.trim().length < 12) {
    issues.push('执导文案过短，请补充具体场景与卖点')
  }
  return { ok: issues.length === 0, issues: issues }
}

/**
 * 生成前门禁（同步）。长片 plan 由调用方在通过后另行请求。
 * @returns {{ ok: true, guidance: string, brief: object }|{ ok: false, message: string, brief: object }}
 */
function prepareBriefGate(rawPrompt, skill) {
  var brief = buildBriefFromInput(rawPrompt, skill || null)
  if (brief.missingSlots.length) {
    return { ok: false, message: formatMissingSlotsMessage(brief), brief: brief }
  }
  if (brief.raw.length < 8) {
    return {
      ok: false,
      message: '请先输入执导文案（至少写明场景与卖点）',
      brief: brief,
    }
  }
  var guidance = enrichGuidanceFromBrief(brief)
  var fidelity = validateBriefFidelity(brief, guidance)
  var hard = (fidelity.issues || []).filter(function (x) {
    return /过短|补全|意图保真/.test(x)
  })
  if (hard.length && guidance.length < 40) {
    return { ok: false, message: hard.join('；'), brief: brief }
  }
  return { ok: true, guidance: guidance, brief: brief }
}

module.exports = {
  buildBriefFromInput: buildBriefFromInput,
  enrichGuidanceFromBrief: enrichGuidanceFromBrief,
  formatMissingSlotsMessage: formatMissingSlotsMessage,
  validateBriefFidelity: validateBriefFidelity,
  prepareBriefGate: prepareBriefGate,
  SLOT_LABELS: SLOT_LABELS,
}
