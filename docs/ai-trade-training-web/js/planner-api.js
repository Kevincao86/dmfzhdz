/**
 * Gpt 直连 API + 行业岗位方案规划
 */
(function (global) {
  const DEFAULT_BASE = 'https://api.tokenmix.ai/v1'
  const DEFAULT_TEXT_MODEL = 'gpt-4o-mini'
  const DEFAULT_IMAGE_MODEL = 'gpt-image-1'
  /** 主模型不可用时依次尝试（TokenMix 模型 ID） */
  const IMAGE_MODEL_FALLBACKS = ['gpt-image-1', 'gpt-image-1.5', 'dall-e-3', 'dall-e-2']

  /** 固定预设 34 个行业（不再 AI 刷新） */
  const PRESET_INDUSTRIES = [
    '外贸进出口',
    '制造业',
    '零售业',
    '物流与运输',
    '金融服务',
    '信息技术',
    '医疗健康',
    '教育培训',
    '房地产',
    '旅游与酒店',
    '能源与环保',
    '农业与食品',
    '建筑与工程',
    '国际贸易',
    '汽车与交通工具',
    '媒体与娱乐',
    '服务业',
    '电商与在线服务',
    '零售电商',
    '餐饮本地生活',
    '物流供应链',
    '金融保险',
    '互联网软件',
    '房地产建筑',
    '文化传媒',
    '农业食品',
    '旅游酒店',
    '能源化工',
    '汽车出行',
    '政务服务',
    '人力资源',
    '法律财税',
    '美妆个护',
    '家居建材',
  ]

  function isForeignTradeIndustry(industry) {
    return /外贸|进出口|跨境|国际贸易|出口|B2B贸易/i.test(String(industry || ''))
  }

  const STORAGE_KEY = 'planner_tokenmix_config'
  const CONFIG_API_URLS = [
    'https://mofangdianai.com/erp-api/meoo-planner-gpt-config',
    '/erp-api/meoo-planner-gpt-config',
  ]

  let cloudConfigCache = null
  let cloudInitDone = false

  function readLocalConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  function writeLocalConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  }

  function loadConfig() {
    const local = readLocalConfig()
    const cloud = cloudConfigCache && typeof cloudConfigCache === 'object' ? cloudConfigCache : {}
    const apiKey = String(cloud.apiKey || local.apiKey || '').trim()
    return {
      apiKey,
      baseUrl: cloud.baseUrl || local.baseUrl || DEFAULT_BASE,
      textModel: cloud.textModel || local.textModel || DEFAULT_TEXT_MODEL,
      imageModel: cloud.imageModel || local.imageModel || DEFAULT_IMAGE_MODEL,
    }
  }

  function saveConfig(cfg) {
    const merged = {
      apiKey: String(cfg.apiKey || '').trim(),
      baseUrl: String(cfg.baseUrl || DEFAULT_BASE).trim(),
      textModel: String(cfg.textModel || DEFAULT_TEXT_MODEL).trim(),
      imageModel: String(cfg.imageModel || DEFAULT_IMAGE_MODEL).trim(),
    }
    writeLocalConfig(merged)
    if (merged.apiKey) cloudConfigCache = { ...merged }
  }

  function hasSavedApiKey() {
    return !!String(loadConfig().apiKey || '').trim()
  }

  async function fetchCloudConfigOnce() {
    for (const url of CONFIG_API_URLS) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.ok) continue
        if (j.config && String(j.config.apiKey || '').trim()) {
          return j.config
        }
      } catch {
        /* try next */
      }
    }
    return null
  }

  async function pushCloudConfig(cfg, adminPassword) {
    const body = {
      apiKey: String(cfg.apiKey || '').trim(),
      baseUrl: String(cfg.baseUrl || DEFAULT_BASE).trim(),
      textModel: String(cfg.textModel || DEFAULT_TEXT_MODEL).trim(),
      imageModel: String(cfg.imageModel || DEFAULT_IMAGE_MODEL).trim(),
    }
    if (adminPassword) body.adminPassword = adminPassword
    for (const url of CONFIG_API_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const j = await res.json().catch(() => ({}))
        if (res.ok && j.ok) {
          if (j.config) cloudConfigCache = j.config
          return true
        }
        if (res.status === 403 && !adminPassword) return false
      } catch {
        /* try next */
      }
    }
    return false
  }

  /** 页面加载时拉取云端配置；本地有、云端无则自动上传 */
  async function initCloudConfig() {
    if (cloudInitDone) return loadConfig()
    const remote = await fetchCloudConfigOnce()
    if (remote?.apiKey) {
      cloudConfigCache = remote
      writeLocalConfig({
        apiKey: remote.apiKey,
        baseUrl: remote.baseUrl || DEFAULT_BASE,
        textModel: remote.textModel || DEFAULT_TEXT_MODEL,
        imageModel: remote.imageModel || DEFAULT_IMAGE_MODEL,
      })
    } else {
      const local = readLocalConfig()
      if (String(local.apiKey || '').trim()) {
        await pushCloudConfig(local)
      }
    }
    cloudInitDone = true
    return loadConfig()
  }

  function extractJson(text) {
    const t = String(text || '').trim()
    if (!t) return null
    const tryParse = (s) => {
      try {
        return JSON.parse(s)
      } catch {
        return null
      }
    }
    let j = tryParse(t)
    if (j) return j
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) {
      j = tryParse(fence[1].trim())
      if (j) return j
    }
    const arr = t.match(/\[[\s\S]*\]/)
    if (arr) {
      j = tryParse(arr[0])
      if (j) return j
    }
    const obj = t.match(/\{[\s\S]*\}/)
    if (obj) {
      j = tryParse(obj[0])
      if (j) return j
    }
    return null
  }

  function normalizeStringList(raw) {
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x).trim()).filter(Boolean)
    }
    if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
      return raw.items.map((x) => String(x).trim()).filter(Boolean)
    }
    return []
  }

  async function chatCompletion(messages, opts) {
    const cfg = { ...loadConfig(), ...opts }
    const apiKey = String(cfg.apiKey || '').trim()
    if (!apiKey) {
      throw new Error('请先配置 Gpt API Key（录入页「Gpt 连接」）')
    }
    const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '')
    const model = String(cfg.textModel || DEFAULT_TEXT_MODEL).trim()
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.65,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = j.error?.message || j.message || `HTTP ${res.status}`
      throw new Error(msg)
    }
    const content = j.choices?.[0]?.message?.content
    if (!content) throw new Error('模型未返回内容')
    return String(content).trim()
  }

  async function fetchRolesForIndustry(industry, opts) {
    const tradeHint = isForeignTradeIndustry(industry)
      ? '\n本行业为外贸/进出口/跨境贸易：须包含外贸业务员、单证员、报关员、跟单员、采购、货代对接、跨境电商运营等岗位。'
      : ''
    const text = await chatCompletion(
      [
        {
          role: 'system',
          content:
            '你是组织与岗位分析专家。只输出 JSON：{"roles":["岗位1","岗位2",...]}，10～18 个该行业典型业务岗位（含管理/执行/支持），中文，不要重复。',
        },
        {
          role: 'user',
          content: `行业：${industry}${tradeHint}\n请列出该行业下常见岗位，供后续 AI 解决方案与工作流规划使用。`,
        },
      ],
      opts,
    )
    const parsed = extractJson(text)
    const list = normalizeStringList(parsed?.roles || parsed)
    if (!list.length) throw new Error('未能解析岗位列表，请重试')
    return list
  }

  async function generateRoleSolution(industry, role, requirement, opts) {
    const text = await chatCompletion(
      [
        {
          role: 'system',
          content: `你是企业数字化与 AI 落地顾问。针对指定行业与岗位，根据用户痛点输出可执行方案。
只输出 JSON，字段：
{
  "summary": "一句话概述",
  "painPoints": ["痛点1","痛点2"],
  "solution": "200～400字解决方案正文",
  "workflow": ["步骤1","步骤2",...],
  "aiTools": ["可用 AI 能力/工具"],
  "kpis": ["可衡量指标"]
}
不要 Markdown，不要代码围栏外文字。`,
        },
        {
          role: 'user',
          content: `行业：${industry}\n岗位：${role}\n需求/想解决的问题：\n${requirement}`,
        },
      ],
      opts,
    )
    const parsed = extractJson(text)
    if (!parsed || !parsed.solution) {
      return {
        summary: '方案生成完成',
        painPoints: [],
        solution: text.slice(0, 1200),
        workflow: text.split('\n').filter(Boolean).slice(0, 8),
        aiTools: [],
        kpis: [],
      }
    }
    return {
      summary: String(parsed.summary || '').trim() || '—',
      painPoints: normalizeStringList(parsed.painPoints),
      solution: String(parsed.solution || '').trim(),
      workflow: normalizeStringList(parsed.workflow),
      aiTools: normalizeStringList(parsed.aiTools),
      kpis: normalizeStringList(parsed.kpis),
    }
  }

  function buildFullEntryBrief(entries) {
    const industries = new Set(entries.map((e) => e.industry))
    const roles = new Set(entries.map((e) => e.role))
    const header = `共 ${entries.length} 条岗位需求，覆盖 ${industries.size} 个行业、${roles.size} 个不同岗位。请逐条通读，不得遗漏任何一条。\n`
    const body = entries
      .map((e, i) => {
        const r = e.result || {}
        return [
          `--- 第 ${i + 1} 条 / 共 ${entries.length} 条 ---`,
          `行业：${e.industry}`,
          `岗位：${e.role}`,
          `原始需求：${e.requirement}`,
          `方案摘要：${r.summary || '—'}`,
          `完整解决方案：${r.solution || '—'}`,
          `痛点：${(r.painPoints || []).join('；') || '—'}`,
          `工作流：${(r.workflow || []).join(' → ') || '—'}`,
          `AI/工具：${(r.aiTools || []).join('；') || '—'}`,
          `指标：${(r.kpis || []).join('；') || '—'}`,
        ].join('\n')
      })
      .join('\n\n')
    return header + '\n' + body
  }

  async function digestAllRequirements(entries, opts) {
    const brief = buildFullEntryBrief(entries)
    const n = entries.length
    const text = await chatCompletion(
      [
        {
          role: 'system',
          content: `你是企业数字化顾问。用户汇总了 ${n} 条不同岗位的业务需求与 AI 落地方案。
你的任务：完整通读每一条的需求描述、痛点、解决方案与工作流，形成结构化理解。
只输出 JSON：
{
  "requirementSummary": "800～1200字：按行业/岗位/主题归纳全部需求，说明共性诉求、差异点与跨岗位协作关系",
  "roleBreakdown": [
    {"role":"岗位名","industry":"行业","entryCount":2,"keyPoints":["该岗位核心诉求1","核心诉求2"]}
  ],
  "unifiedSolutions": [
    {"title":"解决方案标题","desc":"200～400字说明","relatedRoles":["关联岗位"],"coversEntries":[1,2]}
  ]
}
要求：unifiedSolutions 至少覆盖全部 ${n} 条需求；roleBreakdown 须包含每个出现过的岗位。不要 Markdown 围栏外文字。`,
        },
        {
          role: 'user',
          content: `请通读以下全部 ${n} 条岗位需求与方案，输出需求汇总与统一解决方案列表：\n\n${brief}`,
        },
      ],
      opts,
    )
    const parsed = extractJson(text)
    if (!parsed) {
      return {
        requirementSummary: text.slice(0, 2000),
        roleBreakdown: [],
        unifiedSolutions: [],
      }
    }
    return {
      requirementSummary: String(parsed.requirementSummary || '').trim(),
      roleBreakdown: Array.isArray(parsed.roleBreakdown) ? parsed.roleBreakdown : [],
      unifiedSolutions: Array.isArray(parsed.unifiedSolutions) ? parsed.unifiedSolutions : [],
    }
  }

  async function generateProductDesign(entries, productType, opts, onProgress) {
    if (!entries?.length) throw new Error('暂无岗位需求，请先录入')
    const n = entries.length
    const brief = buildFullEntryBrief(entries)

    if (typeof onProgress === 'function') onProgress('正在通读全部岗位需求…')
    const digest = await digestAllRequirements(entries, opts)

    if (typeof onProgress === 'function') onProgress('需求已汇总，正在生成核心模块与产品设计方案…')

    const digestBlock = [
      `【需求汇总】\n${digest.requirementSummary || '—'}`,
      digest.unifiedSolutions?.length
        ? `【已归纳解决方案】\n${digest.unifiedSolutions.map((s, i) => `${i + 1}. ${s.title}：${s.desc || ''}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const text = await chatCompletion(
      [
        {
          role: 'system',
          content: `你是资深产品经理与系统架构师。用户已汇总 ${n} 条岗位需求，并完成需求通读与方案归纳。
你的任务：基于需求汇总与解决方案，输出统一的${productType === 'miniprogram' ? '微信小程序' : 'Web/桌面软件'}产品设计方案。
要求：
1. coreModules 须覆盖全部 ${n} 条岗位需求；
2. productDesignScheme 须包含信息架构、关键页面/模块、交互流程、技术选型与落地节奏；
3. 与 unifiedSolutions 呼应，合并重复能力。
只输出 JSON：
{
  "productName": "产品名",
  "productType": "${productType}",
  "positioning": "定位一句话",
  "targetUsers": ["用户群"],
  "coreModules": [{"name":"模块/功能","desc":"说明","roles":["关联岗位"],"coversEntries":[1,2]}],
  "userJourneys": ["关键用户路径"],
  "techStack": {"frontend":"","backend":"","ai":"","deploy":""},
  "dataModel": ["核心实体"],
  "mvpPhases": [{"phase":"一期","scope":"","weeks":4}],
  "integrationPlan": "与现有 ERP/AI 网关对接说明",
  "risks": ["风险与对策"],
  "productDesignScheme": "1200～1800字产品设计方案：含整体架构、模块划分、页面结构、跨岗位数据流、分期落地",
  "summaryMarkdown": "可选补充说明"
}`,
        },
        {
          role: 'user',
          content: `${digestBlock}\n\n---\n\n原始全部岗位明细（共 ${n} 条）：\n\n${brief}\n\n请输出完整${productType === 'miniprogram' ? '小程序' : '软件'}产品设计方案。`,
        },
      ],
      opts,
    )
    const parsed = extractJson(text)
    if (!parsed) {
      return {
        productName: '智能业务方案',
        productType,
        requirementSummary: digest.requirementSummary,
        unifiedSolutions: digest.unifiedSolutions,
        roleBreakdown: digest.roleBreakdown,
        productDesignScheme: text,
        summaryMarkdown: text,
        coreModules: [],
        mockupPrompts: [
          {
            title: '首页',
            prompt: `Mobile app home screen UI mockup for ${productType}, modern Chinese SaaS, dark theme`,
          },
        ],
      }
    }
    const modules = Array.isArray(parsed.coreModules) ? parsed.coreModules : []
    const mockupPrompts = modules.slice(0, 4).map((m, i) => ({
      title: String(m.name || `页面${i + 1}`),
      prompt: `Professional UI mockup, ${productType === 'miniprogram' ? 'WeChat mini program' : 'web dashboard'} screen: ${m.name}. ${m.desc || ''}. Modern Chinese enterprise SaaS, clean layout, mobile 9:16, high fidelity, no watermark text.`,
    }))
    if (!mockupPrompts.length) {
      mockupPrompts.push({
        title: '产品首页',
        prompt: `UI mockup homepage for ${parsed.productName || 'business app'}, Chinese enterprise, modern`,
      })
    }
    parsed.mockupPrompts = mockupPrompts
    parsed.requirementSummary = digest.requirementSummary
    parsed.unifiedSolutions = digest.unifiedSolutions
    parsed.roleBreakdown = digest.roleBreakdown
    if (!parsed.productDesignScheme) {
      parsed.productDesignScheme = String(parsed.summaryMarkdown || '').trim()
    }
    return parsed
  }

  function resolveImageAspect(productType) {
    return productType === 'software' ? 'landscape' : 'portrait'
  }

  function buildImageRequestBody(model, prompt, aspect) {
    const mid = String(model || '').trim()
    const isDalle3 = mid.includes('dall-e-3') || mid === 'dall-e-3'
    const isDalle2 = mid.includes('dall-e-2') || mid === 'dall-e-2'
    const body = {
      model: mid,
      prompt: String(prompt).slice(0, 3500),
      n: 1,
      response_format: 'url',
    }
    let effectiveAspect = 'square'
    if (isDalle3) {
      if (aspect === 'portrait') {
        body.size = '1024x1792'
        effectiveAspect = 'portrait'
      } else if (aspect === 'landscape') {
        body.size = '1792x1024'
        effectiveAspect = 'landscape'
      } else {
        body.size = '1024x1024'
        effectiveAspect = 'square'
      }
    } else if (isDalle2) {
      body.size = '512x512'
      effectiveAspect = 'square'
    } else {
      body.size = '1024x1024'
      effectiveAspect = 'square'
    }
    return { body, effectiveAspect }
  }

  function isModelNotFoundError(msg) {
    return /model.*not found|invalid_model|does not exist|unknown model|unsupported model/i.test(String(msg || ''))
  }

  async function generateImageOnce(base, apiKey, model, prompt, aspect) {
    const { body, effectiveAspect } = buildImageRequestBody(model, prompt, aspect)
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = j.error?.message || j.message || `HTTP ${res.status}`
      throw new Error(msg)
    }
    const url = j.data?.[0]?.url
    const b64 = j.data?.[0]?.b64_json
    if (url) return { url, aspect: effectiveAspect }
    if (b64) return { url: `data:image/png;base64,${b64}`, aspect: effectiveAspect }
    throw new Error('生图未返回图片 URL')
  }

  async function generateImage(prompt, opts) {
    const cfg = { ...loadConfig(), ...opts }
    const apiKey = String(cfg.apiKey || '').trim()
    if (!apiKey) throw new Error('请配置 Gpt API Key')
    const base = String(cfg.baseUrl || DEFAULT_BASE).replace(/\/$/, '')
    const primary = String(cfg.imageModel || DEFAULT_IMAGE_MODEL).trim()
    const candidates = [primary, ...IMAGE_MODEL_FALLBACKS.filter((m) => m !== primary)]
    const aspect = opts?.aspect || resolveImageAspect(opts?.productType)
    let lastErr = ''
    for (const model of candidates) {
      try {
        return await generateImageOnce(base, apiKey, model, prompt, aspect)
      } catch (e) {
        lastErr = e.message || '生图失败'
        if (!isModelNotFoundError(lastErr)) throw e
      }
    }
    throw new Error(lastErr || '生图模型不可用，请在配置中将文生图模型改为 gpt-image-1')
  }

  global.PlannerApi = {
    DEFAULT_BASE,
    DEFAULT_TEXT_MODEL,
    DEFAULT_IMAGE_MODEL,
    PRESET_INDUSTRIES,
    isForeignTradeIndustry,
    loadConfig,
    saveConfig,
    hasSavedApiKey,
    initCloudConfig,
    pushCloudConfig,
    fetchRolesForIndustry,
    generateRoleSolution,
    digestAllRequirements,
    generateProductDesign,
    generateImage,
    resolveImageAspect,
  }
})(typeof window !== 'undefined' ? window : globalThis)
