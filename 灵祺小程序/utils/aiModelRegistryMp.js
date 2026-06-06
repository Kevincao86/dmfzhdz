/**
 * 与 web modelRegistry.ts + tokenmixClient 对齐的智能体模型下拉（小程序侧静态副本）
 */
/** 与 web tokenmixClient.ts TOKENMIX_FAMILY_CATALOG 一致 */
const TOKENMIX_FAMILIES = [
  {
    id: 'openai',
    label: '灵祺智能AI · 灵犀',
    models: [
      { id: 'gpt-4o', label: '旗舰对话' },
      { id: 'gpt-4o-mini', label: '轻量对话' },
      { id: 'o4-mini', label: '深度推理' },
    ],
  },
  {
    id: 'claude',
    label: '灵祺智能AI · 慧思',
    models: [
      { id: 'claude-sonnet-4.6', label: '均衡旗舰' },
      { id: 'claude-haiku-4.5', label: '迅捷轻量' },
      { id: 'claude-opus-4.7', label: '顶配深度' },
    ],
  },
  {
    id: 'gemini',
    label: '灵祺智能AI · 星鉴',
    models: [
      { id: 'gemini-2.5-flash', label: '闪速对话' },
      { id: 'gemini-2.5-pro', label: '专业对话' },
    ],
  },
  {
    id: 'grok',
    label: '灵祺智能AI · 破界',
    models: [
      { id: 'grok-4.1-fast-non-reasoning', label: '极速对话' },
      { id: 'grok-4.1-fast-reasoning', label: '极速推理' },
    ],
  },
]

const DIRECT = [
  { provider: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', fallback: 'deepseek-reasoner' },
  { provider: 'kimi', label: 'Kimi / Moonshot', defaultModel: 'moonshot-v1-8k', fallback: 'moonshot-v1-32k' },
  { provider: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-M2', fallback: 'MiniMax-M2.1' },
]

const QWEN = [
  { id: 'qwen-turbo', label: 'qwen-turbo' },
  { id: 'qwen-plus', label: 'qwen-plus' },
  { id: 'qwen-max', label: 'qwen-max' },
]
const DOUBAO = [
  { id: 'doubao-pro-32k', label: 'doubao-pro-32k' },
  { id: 'doubao-seed-character-251128', label: 'Doubao-Seed-Character' },
]

/** 与 web modelRegistry.ts AGENT_TOKENMIX_T2I_BY_FAMILY 一致 */
const T2I_BY_FAMILY = {
  openai: [
    { id: 'gpt-image-1', label: '绘境 Pro' },
    { id: 'dall-e-3', label: '绘境 Classic' },
  ],
  claude: [{ id: 'claude-image-gen', label: '慧思绘境' }],
  gemini: [
    { id: 'gemini-2.5-flash-image', label: '星鉴绘境' },
    { id: 'imagen-3', label: '星鉴绘境 Pro' },
  ],
  grok: [{ id: 'grok-image', label: '破界绘境' }],
}

const PICKER_KEY_STORAGE = 'meoo_ai_model_picker_key'

function listAiModelPickerOptions() {
  const out = []
  for (const fam of TOKENMIX_FAMILIES) {
    out.push({
      key: `tokenmix::${fam.id}::__default__`,
      provider: 'tokenmix',
      modelFamily: fam.id,
      model: '',
      label: `${fam.label} · 默认`,
      capability: 'chat',
    })
    for (const m of fam.models) {
      out.push({
        key: `tokenmix::${fam.id}::${m.id}`,
        provider: 'tokenmix',
        modelFamily: fam.id,
        model: m.id,
        label: `${fam.label} · ${m.label}`,
        capability: 'chat',
      })
    }
    const t2i = T2I_BY_FAMILY[fam.id]
    if (t2i) {
      for (const m of t2i) {
        out.push({
          key: `img::m::${fam.id}::${m.id}`,
          provider: 'tokenmix',
          modelFamily: fam.id,
          model: m.id,
          label: `${fam.label} · ${m.label}（文生图）`,
          capability: 'image',
        })
      }
    }
  }
  for (const r of DIRECT) {
    out.push({
      key: `${r.provider}::__default__`,
      provider: r.provider,
      model: '',
      label: `${r.label} · 默认`,
      capability: 'chat',
    })
    out.push({
      key: `${r.provider}::${r.defaultModel}`,
      provider: r.provider,
      model: r.defaultModel,
      label: `${r.label} · ${r.defaultModel}`,
      capability: 'chat',
    })
    if (r.fallback) {
      out.push({
        key: `${r.provider}::${r.fallback}`,
        provider: r.provider,
        model: r.fallback,
        label: `${r.label} · ${r.fallback}`,
        capability: 'chat',
      })
    }
    if (r.provider === 'deepseek') {
      out.push({
        key: 'img::b::deepseek::t2i',
        provider: 'deepseek',
        model: '',
        label: `${r.label} · 文生图（灵祺引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'kimi') {
      out.push({
        key: 'img::b::kimi::t2i',
        provider: 'kimi',
        model: '',
        label: `${r.label} · 文生图（灵祺引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'minimax') {
      out.push({
        key: 'img::v::minimax',
        provider: 'minimax',
        model: 'image-01',
        label: `${r.label} · 文生图（image-01 · 首选 MiniMax）`,
        capability: 'image',
      })
    }
  }
  out.push({
    key: 'qwen::__default__',
    provider: 'qwen',
    model: '',
    label: '通义千问 · 默认',
    capability: 'chat',
  })
  for (const m of QWEN) {
    out.push({
      key: `qwen::${m.id}`,
      provider: 'qwen',
      model: m.id,
      label: `通义千问 · ${m.label}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::qwen',
    provider: 'qwen',
    model: 'wanx',
    label: '通义千问 · 文生图（万相 · 首选通义）',
    capability: 'image',
  })
  out.push({
    key: 'doubao::__default__',
    provider: 'doubao',
    model: '',
    label: '豆包 · 默认',
    capability: 'chat',
  })
  for (const m of DOUBAO) {
    out.push({
      key: `doubao::${m.id}`,
      provider: 'doubao',
      model: m.id,
      label: `豆包 · ${m.label}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::doubao',
    provider: 'doubao',
    model: 'seedream',
    label: '豆包 · 文生图（Seedream · 首选豆包）',
    capability: 'image',
  })
  out.push({
    key: 'img::v::auto',
    provider: 'qwen',
    model: '',
    label: '文生图 · 自动（按环境变量轮询万相/豆包/MiniMax）',
    capability: 'image',
  })
  return out
}

function parseAiModelPickerKey(key) {
  const parts = String(key || '').split('::')
  if (parts[0] === 'tokenmix' && parts.length >= 3) {
    const family = parts[1]
    const rest = parts.slice(2).join('::')
    return { provider: 'tokenmix', modelFamily: family, model: rest === '__default__' ? '' : rest }
  }
  if (parts.length >= 2) {
    const p = parts[0]
    if (p === 'deepseek' || p === 'kimi' || p === 'minimax' || p === 'qwen' || p === 'doubao') {
      const rest = parts.slice(1).join('::')
      return { provider: p, model: rest === '__default__' ? '' : rest }
    }
  }
  return null
}

function parseAgentImagePickerKey(key) {
  const parts = String(key || '').split('::')
  if (parts[0] !== 'img' || parts.length < 3) return null
  if (parts[1] === 'v') {
    const v = parts[2]
    if (v === 'qwen' || v === 'doubao' || v === 'minimax' || v === 'auto') return { kind: 'vendor', vendor: v }
    return null
  }
  if (parts[1] === 'm' && parts[2]) {
    return { kind: 'style', family: parts[2], modelId: parts.slice(3).join('::') }
  }
  if (parts[1] === 'b' && (parts[2] === 'kimi' || parts[2] === 'deepseek')) {
    return { kind: 'brand', slug: parts[2] }
  }
  return null
}

function isAgentImagePickerKey(key) {
  return parseAgentImagePickerKey(key) != null
}

function effectiveChatPickerKey(modelPickerKey) {
  if (!isAgentImagePickerKey(modelPickerKey)) return modelPickerKey
  const p = parseAgentImagePickerKey(modelPickerKey)
  if (!p) return 'qwen::__default__'
  if (p.kind === 'vendor') {
    if (p.vendor === 'qwen') return 'qwen::__default__'
    if (p.vendor === 'doubao') return 'doubao::__default__'
    if (p.vendor === 'minimax') return 'minimax::__default__'
    return 'tokenmix::openai::__default__'
  }
  if (p.kind === 'style') return `tokenmix::${p.family}::__default__`
  return p.slug === 'kimi' ? 'kimi::__default__' : 'deepseek::__default__'
}

function defaultModelIdForFamily(family) {
  const fam = TOKENMIX_FAMILIES.find((f) => f.id === family)
  return fam && fam.models[0] ? fam.models[0].id : 'gpt-4o'
}

function defaultPickerKey() {
  return 'qwen::__default__'
}

function loadPickerKey() {
  try {
    const raw = wx.getStorageSync(PICKER_KEY_STORAGE)
    if (raw && typeof raw === 'string') return raw
  } catch (_) {}
  return defaultPickerKey()
}

function savePickerKey(key) {
  try {
    wx.setStorageSync(PICKER_KEY_STORAGE, key)
  } catch (_) {}
}

function filterOptions(options, tab) {
  if (tab === 'all') return options
  if (tab === 'chat') return options.filter((o) => o.capability !== 'image')
  return options.filter((o) => o.capability === 'image')
}

/** 与 web AiAgentComposerBar shortModelLabel 一致 */
function shortLabel(label) {
  const head = String(label).split(/[·\-–|]/)[0]?.trim() ?? String(label)
  if (head.length <= 10) return head
  return `${head.slice(0, 9)}…`
}

module.exports = {
  listAiModelPickerOptions,
  parseAiModelPickerKey,
  isAgentImagePickerKey,
  effectiveChatPickerKey,
  defaultModelIdForFamily,
  loadPickerKey,
  savePickerKey,
  filterOptions,
  shortLabel,
  PICKER_KEY_STORAGE,
}
