/** 商家版后台 — API 文档与接入说明（与产品规格对齐，链接为官方文档） */

export function DouyinApiSection() {
  /** 官方文档为主；含本 ERP 商品/门店流程已对齐的 goodlife 路径（经网关转发时路径段与之一致） */
  const rows = [
    {
      module: '总览 · 生活服务 OpenAPI 通用能力目录',
      doc: '商品发布、商品查询、门店、核销、退款等模块入口',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities',
    },
    {
      module: '接入准备 · OpenAPI 接口调用约定',
      doc: 'HTTPS、Header（access-token、content-type）、GET/POST、QPS 等统一约定',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/preparation/openapiinterfacecallconvention',
    },
    {
      module: '开发 · OpenAPI SDK 总览',
      doc: 'Java / Go / Node 官方 SDK 与凭证注入说明',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/sdk-overview',
    },
    {
      module: '连接指南 · 生活服务开放平台介绍',
      doc: '来客/服务商接入流程与能力说明',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/connect/life-open-platform',
    },
    {
      module: '文档指引 · 生活服务商家应用',
      doc: '按业务场景查阅接口的索引说明',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/introduction/usage-guide',
    },
    {
      module: '能力说明 · 商品发布与查询（总述）',
      doc: 'attr_key_value_map、模板、多 SKU 等与商品 save 配套的字段说明',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/capability/basic/goods-introduce',
    },
    {
      module: '商品查询 · 查询商品品类',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/category/get/（scope: life.capacity.goods.query）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/category.get',
    },
    {
      module: '商品查询 · 资质搜索',
      doc: 'POST https://open.douyin.com/goodlife/v1/account/qual/search/（scope: life.qual.search）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/qualification-search',
    },
    {
      module: '商品查询 · 查询商品模板',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/template/get/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get',
    },
    {
      module: '商品查询 · 查询商品草稿数据',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/product/draft/get/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/draft.get',
    },
    {
      module: '商品查询 · 查询商品草稿数据列表',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/product/draft/query/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/query',
    },
    {
      module: '商品查询 · 查询商品线上数据',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/product/online/get/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.get',
    },
    {
      module: '商品查询 · 查询商品线上数据列表',
      doc: 'GET https://open.douyin.com/goodlife/v1/goods/product/online/query/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query',
    },
    {
      module: '商品查询 · 批量查询 SKU',
      doc: 'SKU 批量查询',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/batch-query-sku',
    },
    {
      module: '商品查询 · 商品审核结果同步 Webhook',
      doc: '审核结果回调（SPI/Webhook）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/goods.audit',
    },
    {
      module: '商品发布 · 创建/更新商品',
      doc: 'POST https://open.douyin.com/goodlife/v1/goods/product/save/（scope: life.capacity.goods.found）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save',
    },
    {
      module: '商品发布 · 上下架商品',
      doc: 'POST https://open.douyin.com/goodlife/v1/goods/product/operate/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/operate',
    },
    {
      module: '商品发布 · 免审修改商品',
      doc: 'POST https://open.douyin.com/goodlife/v1/goods/product/free_audit/',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/free.audit',
    },
    {
      module: '商品发布 · 同步库存',
      doc: 'POST https://open.douyin.com/goodlife/v1/goods/stock/sync/（文档 slug: batch.save）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/batch.save',
    },
    {
      module: '商品发布 · 创建/更新多 SKU 商品的 SKU 列表',
      doc: 'POST …/sku/batch_save/（与 save 分步配合）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/goods.batch.save',
    },
    {
      module: '商品发布 · 商品审核结果通知 Webhook',
      doc: '发品审核结果推送',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/product-review-notice',
    },
    {
      module: '商品发布 · 商品状态变更通知 Webhook',
      doc: '上下架等状态变更推送',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/product-status-notification',
    },
    {
      module: '商品发布 · 编辑商品门店（餐饮等）',
      doc: '商品与 POI 关系维护',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/goods-poi-operate',
    },
    {
      module: '门店 · 查询门店信息（POI）',
      doc: 'GET https://open.douyin.com/goodlife/v1/shop/poi/query/（scope: life.capacity.shop）',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query',
    },
    {
      module: '方案 · 到综团购对接（行业方案）',
      doc: '到店综合团购接入说明',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/comprehensive/in-store-industry/group-buying-integration',
    },
    {
      module: '团购核销 · 推送核销状态（三方码等）',
      doc: 'push_delivery 等履约推送',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/locallife/general-ability/agency-trade-system/fulfillment/third-code/push-delivery',
    },
    {
      module: '会员 · 会员入会 SPI',
      doc: 'merchant.member.join 等',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/member/member.join.new',
    },
    {
      module: '交易系统 · 生活服务（账号融合版）',
      doc: '预下单、核销、退款流程总览',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/business-monetization/guaranteed-payment/pan-industry/intro',
    },
    {
      module: '交易系统 · 行业版（历史架构说明）',
      doc: 'KA / 行业方案架构参考',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/open-capacity/business-monetization/guaranteed-payment/historical-docs/old-version/ka-solution/architecture',
    },
    {
      module: '小程序 · 交易组件 pay-button（行业 SDK）',
      doc: '小程序内交易按钮能力',
      href: 'https://partner.open-douyin.com/docs/resource/zh-CN/mini-app/develop/component/industry/trading-system/pay-button-sdk',
    },
  ]

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900">一、抖音来客 / 抖音开放平台 · API 接口通道</h4>
      <DocTable rows={rows} />
      <p className="text-xs leading-relaxed text-gray-600">
        官方总目录：{' '}
        <a
          href="https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/
        </a>
        。开放平台 Base URL 为{' '}
        <code className="rounded bg-gray-100 px-1">https://open.douyin.com</code>
        ，需在控制台创建应用并申请 scope（如商品查询 life.capacity.goods.query、商品发布 life.capacity.goods.found、门店
        life.capacity.shop 等）。本 ERP 网关约定前缀示例：{' '}
        <code className="rounded bg-gray-100 px-1">/api/merchant/douyin/goods/...</code>、{' '}
        <code className="rounded bg-gray-100 px-1">/api/merchant/douyin/stores</code>
        （代理上述官方路径并附带商家 accessToken）。
      </p>
    </div>
  )
}

export function MeituanApiSection() {
  const rows = [
    {
      module: '美团开放平台首页',
      doc: '美团技术服务合作中心',
      href: 'https://developer.meituan.com',
    },
    {
      module: '业务能力总览',
      doc: '业务方案列表（团购核销、餐饮系统、服务零售等）',
      href: 'https://developer.meituan.com/docs/biz',
    },
    {
      module: '团购券核销——获取授权URL',
      doc: '第三方业务授权接口（授权URL生成）',
      href: 'https://developer.meituan.com/docs/biz/comm-dev-isv-auth',
    },
    {
      module: 'scope参数说明（核销权限范围控制）',
      doc: 'scope 参数说明',
      href: 'https://developer.meituan.com/docs/biz/biz_2023243_3ad0b0e7-01d4-40a8-8a3f-2e6f6ae32f23',
    },
  ]

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900">二、美团开放平台 · API 接口通道</h4>
      <DocTable rows={rows} />
      <p className="text-xs leading-relaxed text-gray-600">
        补充说明：美团团购券核销 API（POST getScopeUrl）位于美团开放平台 &gt; 生活服务 &gt; 到店综合 &gt; 团购核销分类下，具体接入文档入口为{' '}
        <a
          href="https://developer.meituan.com/docs/biz"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          https://developer.meituan.com/docs/biz
        </a>
        ，需在业务方案列表中进入对应类目的网关接口文档页查看完整的请求参数（platform、shopId）、签名规则及验券接口的详细说明。
      </p>
    </div>
  )
}

export function XhsApiSection() {
  const rows = [
    {
      module: '小红书开放平台首页',
      doc: '小红书开放平台',
      href: 'https://open.xiaohongshu.com',
    },
    {
      module: '小程序开发文档中心（消息回调、事件推送）',
      doc: '开放平台文档中心',
      href: 'https://miniapp.xiaohongshu.com/doc/DC031154',
    },
    {
      module: '商品管理——item_search / item_update',
      doc: '商品搜索曝光优化实战（含接口说明）',
      href: 'https://developer.aliyun.com/article/1679383',
    },
    {
      module: '商品关键词搜索（item_search 对接全攻略）',
      doc: 'item_search 接口对接全攻略',
      href: 'https://developer.aliyun.com/article/1691357',
    },
    {
      module: '售后/退款消息通知（msg_after_sale_update、msg_after_sale_create 等）',
      doc: '应用消息推送文档（售后消息）',
      href: 'https://xiaohongshu.apifox.cn/doc-2810938',
    },
    {
      module: '售后接入说明',
      doc: '售后接入说明（轮询售后列表、审核、确认收货）',
      href: 'https://xiaohongshu.apifox.cn',
    },
  ]

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900">三、小红书开放平台 · API 接口通道</h4>
      <DocTable rows={rows} />
      <p className="text-xs leading-relaxed text-gray-600">
        补充说明：小红书商品管理接口（item_search / item_update）需要在{' '}
        <a
          href="https://open.xiaohongshu.com"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          小红书开放平台
        </a>{' '}
        控制台创建应用后申请「商品管理」类目权限，方可调用；售后消息通知（含 msg_after_sale_create、msg_after_sale_update、msg_after_sale_transfer 等 Tag）通过在应用管理后台配置消息回调地址接收。小红书 SDK 目前仅支持 Java 版本，接口统一使用 execute 方法，通过不同 Request 对象区分业务类型。
      </p>
      <p className="text-xs leading-relaxed text-gray-600">
        售后消息 Tag：抖音和小红书的售后消息均通过 HTTP 回调（SPI）方式推送，ERP 系统需在外网部署可访问的回调地址，并按平台规定的加签/验签方式处理消息体。
      </p>
    </div>
  )
}

function DocTable({
  rows,
}: {
  rows: { module: string; doc: string; href: string }[]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">功能模块</th>
            <th className="px-3 py-2 font-medium">具体接口/文档</th>
            <th className="px-3 py-2 font-medium">网页链接</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.module}::${r.href}`} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-800">{r.module}</td>
              <td className="px-3 py-2 text-gray-700">{r.doc}</td>
              <td className="px-3 py-2">
                <a
                  href={r.href}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-blue-600 hover:underline"
                >
                  {r.href}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
