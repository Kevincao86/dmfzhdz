/** 服务商版 — 各平台服务商接入 API 文档索引（官方链接） */

function DocTable({ rows }: { rows: { module: string; doc: string; href: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">功能模块</th>
            <th className="px-3 py-2 font-medium">说明</th>
            <th className="px-3 py-2 font-medium">链接</th>
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

export function PartnerDouyinApiSection() {
  const rows = [
    {
      module: '连接指南 · 生活服务开放平台（服务商）',
      doc: '服务商接入流程、授权与能力目录',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/connect/life-open-platform',
    },
    {
      module: 'OpenAPI · 商品查询 online.query',
      doc: '服务商代查商品请传 goods_query_type=3',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query',
    },
    {
      module: 'OpenAPI · 商品发布 save / operate',
      doc: '代运营商家发品、上下架',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save',
    },
    {
      module: '门店 · POI query',
      doc: '查询代运营商家门店',
      href: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query',
    },
  ]
  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900">抖音林客 · 服务商 OpenAPI</h4>
      <DocTable rows={rows} />
      <p className="text-xs text-gray-600">
        控制台需创建<strong>服务商应用</strong>（非「生活服务商家应用」），完成商家授权后为本系统绑定客户商家账号。网关前缀与商家版相同：
        <code className="mx-1 rounded bg-gray-100 px-1">/api/merchant/douyin/...</code>
      </p>
    </div>
  )
}

export function PartnerKuaishouApiSection() {
  const rows = [
    {
      module: '快手本地生活 · 开放平台',
      doc: '服务商/自研应用管理与授权',
      href: 'https://open.kuaishou.com/platform/open',
    },
    {
      module: '商品查询',
      doc: 'goods_query_type=3 查询服务商创建商品',
      href: 'https://open.kuaishou.com/docs/develop/OpenAPI',
    },
  ]
  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900">快手本地 · 服务商 OpenAPI</h4>
      <DocTable rows={rows} />
    </div>
  )
}
