# 塔塔的小工具 · 企微智能表格对接

独立小工具：商务/运营在**企业微信智能表格**里填数，本地定时任务读表，经**群机器人 Webhook** 发提醒与周/月报。

不接灵祺 ERP、不写 Postgres；本机或自备进程跑，默认不部署轻量/新ECS。

## 三个功能

| # | 智能表格 | 行为 |
|---|---------|------|
| 1 | 新签客户跟进表 | 商务新签填行，运营勾选事项；工作日 09:30 提醒未完成项 |
| 2 | 客户业绩表 | TOP10 + 新运营客户；周一发周报、每月 1 号发月报 |
| 3 | 共享文件表 | 全员登记企微文件链接；可发「近 7 天新增」摘要 |

## 快速演示（无需凭证）

```bash
cd 塔塔的小工具
npm install
npm run demo
```

会读取 `data/demo/*.json`，在控制台打印三类 Markdown 文案（`DRY_RUN=1`）。

## 配置真实企微

1. 复制环境变量：`cp env.example .env`
2. **自建应用**：企微管理后台 → 应用管理 → 自建 → 拿到 `CorpID` / `Secret`，并在「协作 → 文档 → API」把该应用加入可调用列表。
3. **三张智能表格**：在企微里按下方列名建表（标题须一致），把每张表的 `docid`、`sheet_id` 填进 `.env`。
4. **群机器人**：目标群 → 添加群机器人 → 复制 Webhook，填 `WECOM_WEBHOOK_URL`（或只填 `WECOM_WEBHOOK_KEY`）。
5. 设 `DRY_RUN=0`，再跑：

```bash
npm run job:reminder
npm run job:rank:week
npm run job:rank:month
npm run job:files
```

常驻定时：

```bash
npm run schedule
```

## 智能表格列名（须与 schema 一致）

列名约定见 [`config/sheets.schema.json`](config/sheets.schema.json)。

### 新签客户跟进表

客户名称、签约日期、商务、运营、开通账号、资料收集、方案确认、首单启动、培训完成、备注  
（后 5 项建议用「勾选」类型）

### 客户业绩表

客户名称、类型（`TOP` / `新运营`）、周期（`周` / `月`）、周期起止、指标名、指标值、负责人

### 共享文件表

文件名、分类、企微链接、上传人、更新日期、备注  
人在企微上传/共享文件后，把链接登记到本表即可（不接微盘上传 API）。

## 命令

| 命令 | 说明 |
|------|------|
| `npm run demo` | 三类任务 dry-run |
| `npm run job:reminder` | 每日跟进提醒 |
| `npm run job:rank:week` | 周报 |
| `npm run job:rank:month` | 月报 |
| `npm run job:files` | 共享文件摘要 |
| `npm run schedule` | 挂起 cron |

## 官方文档

- [文档 / 智能表格概述](https://developer.work.weixin.qq.com/document/path/97392)
- [消息推送（群机器人）](https://developer.work.weixin.qq.com/document/path/91770)
