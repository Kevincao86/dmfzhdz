# 行业岗位 AI 方案规划器（TokenMix）

原「AI 传统外贸培训课件」已备份为 [`courseware-legacy.html`](./courseware-legacy.html)。  
当前入口 [`index.html`](./index.html) 为 **TokenMix 驱动的行业岗位需求 → 解决方案 → 工作流 → 小程序/软件设计方案** 规划工具。

## 功能流程

1. **配置 TokenMix**：填入 API Key、Base URL、文本/文生图模型 → **保存后密钥自动隐藏**，仅显示「已连接 · 修改」
2. **选择行业**：固定预设 **34 个行业**（含外贸进出口置顶），无需 AI 刷新
3. **选择岗位**：选定行业后，AI 预设该行业下 10～18 个典型岗位
4. **输入需求**：描述该岗位想解决的问题 → **生成方案并加入汇总**
5. **多人协作**：顶栏设置昵称与 **6 位房间码**，同房间成员的需求/方案/设计稿自动同步（云端 + 同浏览器多标签）
6. **汇总列表**：主区域展示每条记录（需求、方案、痛点、落地工作流、AI 工具建议）
7. **一键生成设计方案**：汇总全部岗位后，生成小程序或 Web/软件整体方案
8. **文生图展示页**：基于方案模块自动生成 UI 展示图（TokenMix `/images/generations`）

## 本地预览

```bash
cd docs/ai-trade-training-web
python3 -m http.server 8765
# 打开 http://localhost:8765
```

## TokenMix 配置

| 项 | 默认 |
|----|------|
| Base URL | `https://api.tokenmix.ai/v1` |
| 文本模型 | `gpt-4o-mini` |
| 文生图模型 | `dall-e-3` |

Key 仅保存在本机浏览器，不会上传至灵祺服务器（页面为纯静态，直连 TokenMix）。

协作同步通过 `GET/POST /erp-api/meoo-planner-room-sync` 暂存房间状态（48h TTL）；部署 **轻量** 后跨设备可用，未部署时同浏览器多标签仍可通过 BroadcastChannel 同步。

## 多人协作

| 操作 | 说明 |
|------|------|
| 新建房间 | 生成随机 6 位房间码，分享给同事 |
| 加入 | 输入相同房间码即可同步需求与方案 |
| 昵称 | 显示在同步状态中，便于识别编辑者 |

## Vercel 部署

1. Root Directory：`docs/ai-trade-training-web`
2. Framework：**Other**，Build Command **留空**
3. 入口：`index.html`

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | 方案规划器入口 |
| `courseware-legacy.html` | 原培训课件（只读备份） |
| `js/planner-api.js` | TokenMix chat / 生图 API + 34 行业预设 |
| `js/planner-app.js` | 交互、密钥隐藏、协作同步 |
| `js/planner-sync.js` | 多人协作（BroadcastChannel + 云端轮询） |
| `css/planner.css` | 玻璃态深色 UI |

## 原课件（legacy）

培训课件 v2 交互说明见 [`courseware-legacy.html`](./courseware-legacy.html) 对应资源；`css/styles.css`、`js/app.js` 等仍保留供 legacy 使用。
