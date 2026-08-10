# 灵祺ERP小程序

**1:1 复刻** `docs/ui-mockups/merchant-erp-mp/index.html`（42 屏设计稿）。

## 打开方式

微信开发者工具 → 导入 **`灵祺ERP小程序`** 文件夹 → AppID `wxd3da81937eb72241` → 清缓存 → 编译。

## 结构

- `styles/mockup-base.wxss` — 从 `index.html` 内 v2 CSS 自动转换（px→rpx）
- `pages/*/*.wxml` — 按原型模板生成，每页独立布局
- `pages/*/*.js` — 业务逻辑（对齐 Web ERP / 原灵祺小程序 git 版本）
- `utils/` — API、菜单、招募、商品等

## 重新生成 UI

```bash
node scripts/build-mockup-wxss.mjs   # 更新全局 v2 样式
node scripts/build-all-pages.mjs     # 列表/概览页 mockup wxml + 复杂页从灵祺小程序复制
```

- **mockup v2**：login、functions、mine、招募导航、列表类子页
- **完整业务页**（wxml/wxss 同源灵祺小程序）：agent、商品/招募向导、GEO、语音录入等 14 页

## 设计稿对照

| 屏号 | 页面 | 截图 |
|------|------|------|
| 01 | login | screens/01-login.png |
| 02 | agent | screens/02-agent.png |
| … | … | … |

完整清单见 `docs/ui-mockups/merchant-erp-mp/pages-manifest.json`。
