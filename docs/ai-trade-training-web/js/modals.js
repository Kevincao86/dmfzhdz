/**
 * 互动课件 · 子页面 / 弹层内容库
 */
window.COURSE_MODALS = {
  'speaker-method': {
    title: '讲师方法论 · AI 落地五步法',
    html: `
      <p>在阿里本地生活数据中台与字节区域负责经历中，总结出适用于外贸与传统 B2B 的落地路径：</p>
      <ol>
        <li><strong>选场景：</strong>找「高频 + 重复 + 有标准答案」环节（询盘摘要、单证核对、跟进邮件）。</li>
        <li><strong>定边界：</strong>明确 AI 只起草、人审批；价格/交期/法律条款永不自动发送。</li>
        <li><strong>备知识：</strong>产品规格书、Incoterms 说明、历史 PI 模板、FAQ 整理成可检索资料（RAG 基础）。</li>
        <li><strong>小试点：</strong>1～2 个岗位、1 周、可量化（回复时效、差错率、加班时长）。</li>
        <li><strong>扩复制：</strong>沉淀 Prompt 模板与 SOP，纳入新人培训与 ERP 附件规范。</li>
      </ol>
      <blockquote class="quote">外贸企业的 AI 价值不在「写得多漂亮」，而在「少漏一项、少错一个数字、少查半小时邮件」。</blockquote>
    `,
  },
  'agenda-part1': {
    title: 'Part 1 详解 · AI 认知（12 分钟）',
    html: `
      <div class="table-wrap"><table>
        <thead><tr><th>分钟</th><th>内容</th><th>互动</th></tr></thead>
        <tbody>
          <tr><td>0–3</td><td>AI 是什么 / 不是什么；与传统软件差异</td><td>举手：谁用过 ChatGPT 写邮件？</td></tr>
          <tr><td>3–6</td><td>LLM 与市面产品；公有云 vs 企业版</td><td>讨论：公司允许用哪些工具？</td></tr>
          <tr><td>6–9</td><td>LLM + RAG + Agent + 工作流组合</td><td>点击 Tab 看组件案例</td></tr>
          <tr><td>9–12</td><td>跨行业场景 + 三种落地模式</td><td>行业卡片展开详情</td></tr>
        </tbody>
      </table></div>
    `,
  },
  'agenda-part2': {
    title: 'Part 2 详解 · 传统外贸岗位（40 分钟）',
    html: `
      <div class="table-wrap"><table>
        <thead><tr><th>分钟</th><th>模块</th><th>要点</th></tr></thead>
        <tbody>
          <tr><td>12–18</td><td>外贸主链 + 痛点地图</td><td>点击主链各环节看 AI 切入点</td></tr>
          <tr><td>18–24</td><td>销售与客服</td><td>询盘结构化、多语种、CRM 摘要</td></tr>
          <tr><td>24–30</td><td>跟单与单证</td><td>合同 diff、单证清单、一致性核对</td></tr>
          <tr><td>30–34</td><td>采购与计划</td><td>需求汇总、报价比价表、交期跟进</td></tr>
          <tr><td>34–38</td><td>仓储物流</td><td>出运 checklist、监装报告、物流话术</td></tr>
          <tr><td>38–48</td><td>数据合规 + 安全底线</td><td>分级策略、四条红线、责任归属</td></tr>
          <tr><td>48–52</td><td>Q&A</td><td>现场 Prompt 演示（脱敏样例）</td></tr>
        </tbody>
      </table></div>
    `,
  },
  'ai-myths': {
    title: '常见误区 · 培训必纠',
    html: `
      <div class="card-grid">
        <div class="card compare-bad"><h4>误区 1</h4><p>「AI 说得很专业就一定对」→ 型号、港口、HS 编码、日期必须人工核对。</p></div>
        <div class="card compare-bad"><h4>误区 2</h4><p>「把合同全文丢进免费网页就没事」→ 客户名、价格、条款可能进入模型训练或日志。</p></div>
        <div class="card compare-bad"><h4>误区 3</h4><p>「上了 AI 就能少招人」→ 初期往往要加「审核岗」；价值在产能与差错率。</p></div>
        <div class="card compare-bad"><h4>误区 4</h4><p>「Prompt 越长越好」→ 结构化指令 + 示例 + 约束 比堆砌形容词有效。</p></div>
      </div>
    `,
  },
  'llm-compare': {
    title: 'LLM 产品选型对照（外贸团队参考）',
    html: `
      <div class="table-wrap"><table>
        <thead><tr><th>形态</th><th>适用场景</th><th>数据风险</th><th>外贸示例</th></tr></thead>
        <tbody>
          <tr><td>公有云对话</td><td>个人练笔、公开资料检索</td><td>高 — 禁传合同/客户名单</td><td>写通用开发信结构、学 Incoterms 概念</td></tr>
          <tr><td>企业订阅版</td><td>部门日常使用</td><td>中 — 看供应商 DPA</td><td>内部 FAQ、产品参数问答（接知识库）</td></tr>
          <tr><td>私有化 / 专有云</td><td>财务、法务、大客户资料</td><td>低 — 仍要权限控制</td><td>合同条款库检索、历史订单分析</td></tr>
          <tr><td>Office Copilot</td><td>Excel/Word/Outlook</td><td>取决于租户配置</td><td>邮件润色、PI 表格公式说明</td></tr>
          <tr><td>垂直外贸 SaaS</td><td>CRM/单证系统内置</td><td>相对可控</td><td>询盘分配、交期提醒（若厂商已集成）</td></tr>
        </tbody>
      </table></div>
    `,
  },
  'tab-llm-detail': {
    title: 'LLM 组件 · 深度说明与 Prompt 示例',
    html: `
      <h3>能力边界</h3>
      <ul>
        <li>强：语言理解、改写、分类、摘要、多语言、格式转换（邮件→表格）。</li>
        <li>弱：精确计算、实时运价、未提供的内部库存、「猜」客户真实意图。</li>
      </ul>
      <h3>外贸 Prompt 骨架（可复制）</h3>
      <pre class="prompt-block">角色：你是有 10 年经验的外贸业务助理。
任务：将以下询盘邮件整理为结构化字段。
输出 JSON：country, product, qty, target_price, incoterm, delivery, payment, questions[]
约束：不确定的字段填 null，不要编造。
---
[粘贴脱敏邮件]</pre>
    `,
  },
  'tab-rag-detail': {
    title: 'RAG · 检索增强 · 外贸知识库建设',
    html: `
      <p><strong>RAG</strong> = 先在你的 PDF/Excel/SharePoint 里检索相关段落，再让 LLM 组织答案。适合：产品目录、认证证书摘要、公司 MOQ/付款条款、Historical PI。</p>
      <h3>建议入库资料（优先级）</h3>
      <ol>
        <li>产品规格书 + 包装尺寸 + HS 编码表</li>
        <li>标准 PI/CI/PL 模板与字段说明</li>
        <li>各目的国标签/认证要求（FDA、CE、LFGB 等摘要）</li>
        <li>客户分级政策、信用证条款解读备忘</li>
        <li>历史索赔案例与标准回复（脱敏）</li>
      </ol>
      <h3>落地注意</h3>
      <ul>
        <li>版本号：规格书 v3.2 过期必须下架，避免 AI 引用旧参数。</li>
        <li>权限：底价、佣金政策仅销售经理角色可见。</li>
        <li>引用溯源：答案应标注「来自哪份文件第几页」便于人工复核。</li>
      </ul>
    `,
  },
  'tab-agent-detail': {
    title: 'Agent · 多步骤自动化（外贸谨慎使用）',
    html: `
      <p>Agent 可串联：读邮件 → 查 ERP 库存 → 生成 PI 草稿 → 创建 CRM 任务。适合<strong>内部</strong>流程，对外发送前必须人工节点。</p>
      <h3>可试点 Agent 流程</h3>
      <ul>
        <li>新询盘 → 自动打标签（国家/产品族/紧急度）→ 分配业务员</li>
        <li>PO 确认 → 生成采购需求单草稿 → 计划员确认</li>
        <li>到港前 7 天 → 汇总单证状态 → 推送给单证员</li>
      </ul>
      <h3>不建议全自动</h3>
      <ul>
        <li>自动回复报价、自动确认交期、自动签发 BL 指示</li>
      </ul>
    `,
  },
  'tab-multi-detail': {
    title: '多模态 · 图片 / PDF / 语音',
    html: `
      <ul>
        <li><strong>PDF 单证：</strong>扫描件 OCR + 字段抽取（Invoice No.、GW/NW、HS Code）— 人工复核关键金额。</li>
        <li><strong>产品图：</strong>生成营销文案、识别包装语种是否与客户要求一致（辅助）。</li>
        <li><strong>语音：</strong>广交会/电话会议录音 → 纪要 → 待办（确认报价有效期等 action items）。</li>
        <li><strong>标签图：</strong>对比客户 artwork 与印刷稿差异（需高质量图 + 人工终审）。</li>
      </ul>
    `,
  },
  'tab-flow-detail': {
    title: '工作流 · 人机协同节点设计',
    html: `
      <div class="flow">
        <span class="flow-step">触发（邮件/ERP 状态）</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">AI 预处理</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">人工审批门</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">系统写入/发送</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">审计日志</span>
      </div>
      <p>外贸典型审批门：报价发出、PI 盖章、采购下单、BL 指示、索赔函发出。</p>
    `,
  },
  'industry-retail': {
    title: '零售 / 电商 · AI 场景清单',
    html: `<ul>
      <li>智能客服：尺码、库存、退换货政策（接 OMS）</li>
      <li>Listing 多语言：标题、五点描述、A+ 页面大纲</li>
      <li>评论分析：差评主题、竞品对比词云</li>
      <li>选品辅助：趋势报告摘要（非最终选品决策）</li>
    </ul>`,
  },
  'industry-local': {
    title: '本地生活 · AI 场景清单',
    html: `<ul>
      <li>团购套餐文案、短视频脚本、商户 FAQ</li>
      <li>评价摘要与改进建议（运营复盘）</li>
      <li>区域经营周报：流量、核销、差评自动归纳</li>
    </ul>`,
  },
  'industry-finance': {
    title: '金融 / 保险 · AI 场景清单',
    html: `<ul>
      <li>产品条款问答（RAG + 合规审核）</li>
      <li>理赔材料 OCR 与缺失项提示</li>
      <li>报告摘要 — 禁止 AI 直接给出投资建议</li>
    </ul>`,
  },
  'industry-mfg': {
    title: '制造 / 工业 · AI 场景清单',
    html: `<ul>
      <li>设备手册问答、维保工单摘要</li>
      <li>质检图像辅助（缺陷分类）</li>
      <li>自然语言问 MES/ERP 报表（需接真实数仓）</li>
    </ul>`,
  },
  'industry-health': {
    title: '医疗 / 健康 · AI 场景清单',
    html: `<ul>
      <li>导诊 FAQ、预约说明（非诊断）</li>
      <li>文献检索辅助 — 严格合规与免责声明</li>
    </ul>`,
  },
  'industry-edu': {
    title: '教育 / 培训 · AI 场景清单',
    html: `<ul>
      <li>课件大纲、试题、案例改写</li>
      <li>学习答疑（基于指定教材 RAG）</li>
      <li>作业反馈草稿 — 教师终审</li>
    </ul>`,
  },
  'deploy-personal': {
    title: '模式 ① · 个人提效 · 实施清单',
    html: `
      <ol>
        <li>IT/合规发布《AI 工具白名单》与禁止上传的数据类型。</li>
        <li>每岗位 3 个「标准 Prompt 模板」上墙（SharePoint/飞书）。</li>
        <li>周会分享 1 个「省时间」案例（5 分钟）。</li>
        <li>统计：使用前/后处理一封询盘平均耗时（抽样 10 单）。</li>
      </ol>
    `,
  },
  'deploy-dept': {
    title: '模式 ② · 部门知识库 · 实施清单',
    html: `
      <ol>
        <li>指定资料 Owner（产品、单证、法务各 1 人）。</li>
        <li>整理 Top50 FAQ + 规格书 + 模板（Markdown/PDF 索引）。</li>
        <li>选型 RAG 平台或企业版 Copilot + SharePoint。</li>
        <li>试点 2 周：回答准确率、引用是否正确、用户满意度。</li>
      </ol>
    `,
  },
  'deploy-system': {
    title: '模式 ③ · 系统级集成 · 实施清单',
    html: `
      <ol>
        <li>流程梳理：询盘→CRM→ERP→单证，找 3 个最高 ROI 接口点。</li>
        <li>API 安全：OAuth、字段脱敏、操作审计。</li>
        <li>与 ERP 厂商或自研 middleware 对接（订单状态、库存只读）。</li>
        <li>分阶段上线：只读助手 → 草稿写入 → 人工批准后自动发送。</li>
      </ol>
    `,
  },
  'chain-inquiry': {
    title: '环节 · 询盘（Inquiry）',
    html: `
      <p><strong>典型动作：</strong>阿里/展会/官网/代理转介绍收到邮件或 RFQ。</p>
      <h3>痛点</h3>
      <ul>
        <li>多语言、信息不全、同一客户多线程邮件</li>
        <li>Spam 与真实 RFQ 混杂</li>
      </ul>
      <h3>AI 可做</h3>
      <ul>
        <li>结构化提取：产品、数量、目的港、Incoterm 意向、认证要求</li>
        <li>客户背景公开信息摘要（LinkedIn/官网 — 注意隐私政策）</li>
        <li>相似历史订单匹配（若接 CRM）</li>
      </ul>
      <h3>人工必做</h3>
      <p>是否回复、是否投入、初步报价策略、防钓鱼/防欺诈识别。</p>
    `,
  },
  'chain-quote': {
    title: '环节 · 报价 / PI（Quotation & Proforma Invoice）',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>基于产品库生成 PI 字段草稿（描述、包装、港口、付款方式占位）</li>
        <li>多语言报价邮件正文、条款说明翻译</li>
        <li>检查 PI 与报价邮件是否数量/型号一致</li>
      </ul>
      <h3>人工必做</h3>
      <ul>
        <li>单价、折扣、MOQ、validity、交期、是否含运保费</li>
        <li>特殊客户条款（exclusive、penalty）</li>
      </ul>
    `,
  },
  'chain-contract': {
    title: '环节 · 合同 / PO 确认',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>客户 PO vs 我方 PI 差异对比表</li>
        <li>合同 v1/v2 修订痕迹摘要（付款、检验、仲裁地）</li>
        <li>L/C 条款草稿解读（不能替代银行审证）</li>
      </ul>
      <h3>人工必做</h3>
      <p>法务/负责人签字、信用证条款确认、产能与交期承诺。</p>
    `,
  },
  'chain-procure': {
    title: '环节 · 采购排产',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>销售订单 → BOM 需求汇总、缺料提示（接 ERP 时）</li>
        <li>工厂交期跟进邮件模板、多工厂报价比价表结构</li>
      </ul>
      <h3>人工必做</h3>
      <p>选厂、议价、插单决策、质量风险放行。</p>
    `,
  },
  'chain-booking': {
    title: '环节 · 订舱 / 装箱',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>Booking 信息 checklist（柜型、货好时间、VGM）</li>
        <li>装箱计划 vs 订单明细差异</li>
        <li>SI 补料字段从 PI/PL 抽取草稿</li>
      </ul>
      <h3>人工必做</h3>
      <p>运价选择、截关截港时间、特种柜/危品申报。</p>
    `,
  },
  'chain-docs': {
    title: '环节 · 单证 / 报关 / 交单',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>Invoice / PL / BL / CO / Insurance 齐全性检查</li>
        <li>数量重量件数交叉验证</li>
        <li>议付单据 discrepancy 说明信草稿</li>
      </ul>
      <h3>人工必做</h3>
      <p>报关申报、原产地规则、L/C 单证符点终审、寄单。</p>
    `,
  },
  'chain-payment': {
    title: '环节 · 回款 / 索赔',
    html: `
      <h3>AI 可做</h3>
      <ul>
        <li>账龄分析摘要、催款邮件分级模板（友好→严肃）</li>
        <li>短装/质损索赔函结构与中英双语草稿</li>
      </ul>
      <h3>人工必做</h3>
      <p>是否起诉/仲裁、坏账计提、理赔金额确认。</p>
    `,
  },
  'sales-playbook': {
    title: '销售与客服 · 完整操作手册',
    html: `
      <h3>场景 A：新询盘 30 分钟响应</h3>
      <ol>
        <li>AI 摘要邮件 → CRM 建档</li>
        <li>查产品库/RAG 确认规格与认证</li>
        <li>生成英文回复草稿（感谢+澄清问题+公司介绍简版）</li>
        <li>业务补价格与交期 → 主管抽查 → 发送</li>
      </ol>
      <h3>场景 B：老客户复购</h3>
      <p>AI 汇总过去 3 单 PI 的包装/标签/港口偏好 → 新 PI 预填 → 人工确认变更点。</p>
      <h3>场景 C：投诉/质量反馈</h3>
      <p>AI 起草安抚与信息收集清单；赔偿方案必须人工定。</p>
      <h3>KPI 建议</h3>
      <p>首次响应时间、报价差错率、样品转单率 — 试点前后对比。</p>
    `,
  },
  'sales-prompts': {
    title: '销售 Prompt 模板库',
    html: `
      <pre class="prompt-block">【询盘摘要】
请从邮件提取：Buyer, Country, Product, Spec, Qty, Target price, Incoterm, Port, Payment, Cert, Deadline
不确定填 N/A

【英文回复草稿】
语气：professional, warm
包含：thank you, 2 clarifying questions, our MOQ lead time placeholder [人工填写]
禁止：具体价格、法律承诺

【PI 描述段】
根据附件规格书，写 80 词英文 product description for ceramic mug, food contact, LFGB compliant</pre>
      <p class="muted">使用时替换 [人工填写] 段，发送前双人核对。</p>
    `,
  },
  'docs-playbook': {
    title: '跟单与单证 · 完整操作手册',
    html: `
      <h3>单证套装（常见 L/C 项下）</h3>
      <ul>
        <li>Commercial Invoice、Packing List、Bill of Lading、Certificate of Origin</li>
        <li>Insurance Policy、Inspection Cert、Beneficiary Statement</li>
        <li>植检/熏蒸证（木包装）、FDA/COC 等按目的国</li>
      </ul>
      <h3>AI 核对清单（示例）</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>字段</th><th>Invoice</th><th>P/L</th><th>B/L</th><th>一致？</th></tr></thead>
        <tbody>
          <tr><td>Shipper</td><td>✓</td><td>✓</td><td>✓</td><td>AI 标差异</td></tr>
          <tr><td>Description</td><td>✓</td><td>✓</td><td>—</td><td>人工看 HS 一致</td></tr>
          <tr><td>Total GW/NW</td><td>—</td><td>✓</td><td>✓</td><td>± 允许范围公司定</td></tr>
        </tbody>
      </table></div>
      <h3>Incoterms 2020 速查（AI 易混，人必确认）</h3>
      <p>FOB / CIF / CFR / DAP / DDP — 费用与风险分界点不同；AI 解释仅供参考，以合同为准。</p>
    `,
  },
  'procure-playbook': {
    title: '采购与计划 · 完整操作手册',
    html: `
      <h3>流程</h3>
      <ol>
        <li>销售 PO 确认 → ERP 生成 MRP 建议</li>
        <li>AI 汇总多 SKU 需求给同一工厂的一封询价邮件</li>
        <li>工厂回价 → AI 制表 → 采购员定标</li>
        <li>下单 → AI 生成交期跟进节奏（T-14/T-7/T-3 模板）</li>
      </ol>
      <h3>注意</h3>
      <ul>
        <li>Alternative material Substitution 必须工程/质量签字</li>
        <li>价格涉及原材料联动（铜、塑料粒子）— AI 不预测期货</li>
      </ul>
    `,
  },
  'logistics-playbook': {
    title: '仓储物流 · 完整操作手册',
    html: `
      <h3>出运前 48h Checklist</h3>
      <ul>
        <li>订单号 / 柜号 / 封号 / 件数 / 毛净重</li>
        <li>标签语言、条形码、唛头与 PI 一致</li>
        <li>照片存档：空柜、半柜、满柜、封条</li>
      </ul>
      <h3>监装报告 AI 结构</h3>
      <pre class="prompt-block">将以下现场笔记转为监装报告：
时间、地点、柜号、封号、货物描述、装载过程、异常（变形/短装/包装破损）、照片编号、结论建议</pre>
      <h3>物流问询</h3>
      <p>AI 只使用货代提供的官方 ETA/ETD；禁止编造船期。</p>
    `,
  },
  'compliance-playbook': {
    title: '数据分级与合规 · 操作手册',
    html: `
      <div class="table-wrap"><table>
        <thead><tr><th>级别</th><th>示例</th><th>AI 策略</th></tr></thead>
        <tbody>
          <tr><td>L1 公开</td><td>官网产品页、展会公开资料</td><td>可用公有云</td></tr>
          <tr><td>L2 内部</td><td>SOP、非保密规格</td><td>企业版 + 知识库</td></tr>
          <tr><td>L3 机密</td><td>底价、佣金、客户名单</td><td>私有化 + 权限 + 审计</td></tr>
          <tr><td>L4 法定敏感</td><td>个人数据、银行账号、合同全文</td><td>脱敏后使用或禁止上传</td></tr>
        </tbody>
      </table></div>
      <h3>出口合规提醒</h3>
      <p>制裁名单、两用物项、目的国禁运 — AI 可辅助检索公开清单摘要，<strong>出口合规官终审</strong>。</p>
    `,
  },
  'safety-quiz': {
    title: '安全底线 · 自测题',
    html: `
      <ol>
        <li>客户发来 L/C 草稿，能否整份上传免费 ChatGPT 分析？<br><strong>答：</strong>否 — 含交易金额与客户信息，用授权工具或脱敏。</li>
        <li>AI 生成的 PI 数量与邮件一致，是否可直接盖章？<br><strong>答：</strong>否 — 需与订单、库存、BOM 三方核对。</li>
        <li>货代邮件说 ETA 延后，AI 能否自动回复客户？<br><strong>答：</strong>否 — 需核实船期后再由负责人发送。</li>
        <li>采购报价比 AI 汇总低 15%，能否直接下单？<br><strong>答：</strong>否 — 需样品/验厂/质量条款确认。</li>
      </ol>
    `,
  },
}
