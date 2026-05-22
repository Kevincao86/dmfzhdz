/**
 * 与 web modelRegistry.ts + tokenmixClient 对齐的智能体模型下拉（小程序侧静态副本）
 */
const TOKENMIX_FAMILIES = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    models: [
      { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  {
    id: 'grok',
    label: 'Grok',
    models: [{ id: 'grok-4.1-fast-non-reasoning', label: 'Grok 4.1 Fast' }],
  },
]

const DIRECT = [
  { provider: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', fallback: 'deepseek-reasoner' },
  { provider: 'kimi', label: 'Kimi', defaultModel: 'moonshot-v1-8k', fallback: 'moonshot-v1-32k' },
  { provider: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-M2', fallback: 'MiniMax-M2.1' },
]

const QWEN = ['qwen-turbo', 'qwen-plus', 'qwen-max']
const DOUBAO = ['doubao-pro-32k', 'doubao-seed-1-6-251015']

const T2I_BY_FAMILY = {
  openai: [
    { id: 'gpt-image-1', label: 'GPT Image 1' },
    { id: 'dall-e-3', label: 'DALL·E 3' },
  ],
  gemini: [{ id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash（图像）' }],
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
        label: `${r.label} · 文生图（墨典引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'kimi') {
      out.push({
        key: 'img::b::kimi::t2i',
        provider: 'kimi',
        model: '',
        label: `${r.label} · 文生图（墨典引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'minimax') {
      out.push({
        key: 'img::v::minimax',
        provider: 'minimax',
        model: 'image-01',
        label: `${r.label} · 文生图（image-01）`,
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
  for (const id of QWEN) {
    out.push({
      key: `qwen::${id}`,
      provider: 'qwen',
      model: id,
      label: `通义千问 · ${id}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::qwen',
    provider: 'qwen',
    model: 'wanx',
    label: '通义千问 · 文生图（万相）',
    capability: 'image',
  })
  out.push({
    key: 'doubao::__default__',
    provider: 'doubao',
    model: '',
    label: '豆包 · 默认',
    capability: 'chat',
  })
  for (const id of DOUBAO) {
    out.push({
      key: `doubao::${id}`,
      provider: 'doubao',
      model: id,
      label: `豆包 · ${id}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::doubao',
    provider: 'doubao',
    model: 'seedream',
    label: '豆包 · 文生图（Seedream）',
    capability: 'image',
  })
  out.push({
    key: 'img::v::auto',
    provider: 'qwen',
    model: '',
    label: '文生图 · 自动',
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

function shortLabel(label) {
  const head = String(label).split(/[·\-–|]/)[0].trim()
  return head.length <= 8 ? head : `${head.slice(0, 7)}…`
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
