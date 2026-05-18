# 墨典达人招募小程序

供达人查看商家招募要求并报名；数据与运营管控台「小程序达人招募订单」、商家 ERP dev 注册表同步。

## 配置

1. 复制 `utils/config.local.example.js` 为 `utils/config.local.js`
2. 填写 `MERCHANT_API_BASE_URL`（与 Web 商家 ERP `VITE_MERCHANT_API_BASE_URL` 相同，如 `http://局域网IP:5173`）
3. 微信开发者工具：详情 → 本地设置 → 勾选「不校验合法域名」

## 分享路径

运营在「商家达人招募订单」选择「小程序招募」后，分享路径为：

`pages/detail/detail?id={MP-RO-订单号}`

## 达人会员注册

首页可「注册墨典达人会员」：授权微信昵称头像，选择 **抖音 / 小红书 / 双平台** 并填写对应平台资料。资料保存在本机并同步至运营注册表（`mpTalentMembers` + 墨典达人库）。

## 招募大厅 / 急单大厅

首页分两个 Tab：

- **招募大厅**：常规进行中招募单
- **急单大厅**：标记为急单、文案含加急/急单，或高预算近期任务

运营创建小程序招募单时，若商家要求含急单关键词或预算较高，会自动带上 `urgent` 标记。

## 上架

在 `project.config.json` 中替换正式 `appid`，并配置 request 合法域名指向生产 API。
