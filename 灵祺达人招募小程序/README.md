# 灵祺达人招募小程序

供达人查看商家招募要求并报名；数据与运营管控台「小程序达人招募订单」、商家 ERP 注册表（`ops_registry_snapshot`）同步。

## 快速开始（本地）

1. 复制 `utils/config.local.example.js` 为 `utils/config.local.js`
2. 填写 `MERCHANT_API_BASE_URL`（与 Web 商家 ERP 相同，如 `http://局域网IP:5173`）
3. 微信开发者工具打开本目录 → 详情 → 本地设置 → 勾选「不校验合法域名」

## 生产部署

**GitHub + Vercel（API）与微信上架（小程序）** 分步说明见：

👉 **[DEPLOY.md](./DEPLOY.md)**

要点：

- 后端：仓库根 `vercel.json` 部署商家 ERP，小程序请求其 HTTPS 根地址下的 `/api/meoo-ops-*`
- 小程序：配置 `utils/config.release.js`（见 `config.release.example.js`）+ 微信公众平台 request 合法域名 + 开发者工具上传

## 分享路径

运营在「商家达人招募订单」选择「小程序招募」后，分享路径为：

`pages/detail/detail?id={MP-RO-订单号}`

## 功能

- **招募大厅 / 急单大厅（开环）**：达人报名 → 运营反选 → 探店寄样 → 审核发布 → 结算
- **云剪任务大厅（闭环）**：云剪成片直派 → 达人**确认接收/拒绝** → 下载成片 → 发布抖音回链 → AI 核查 → 待结算
- **灵祺达人会员注册**：资料同步至 `mpTalentMembers` 与灵祺达人库

闭环云剪 API：`/api/meoo-ops-mp-recruitment-ice-confirm`（确认/拒绝）、`/api/meoo-ops-mp-recruitment-ice-submit`（回传抖音链接）

## 上架前

在 `project.config.json` 中确认正式 `appid`，并配置 request 合法域名指向生产 API（须 HTTPS）。详见 [DEPLOY.md](./DEPLOY.md)。
