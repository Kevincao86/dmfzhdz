# AI 传统外贸培训 · 互动网页课件

生成式 AI 商业应用培训（基础篇 + 传统外贸岗位实践），讲师：曹鑫淼。

## 本地预览

```bash
cd docs/ai-trade-training-web
python3 -m http.server 8765
# 打开 http://localhost:8765
```

## Vercel 部署

1. 在 Vercel 新建项目，关联 GitHub 仓库 `Kevincao86/dmfzhdz`
2. **Root Directory**（必设）：`docs/ai-trade-training-web`
3. Framework Preset：**Other**
4. Build / Install Command：**留空**（本目录 `vercel.json` 已写死纯静态，勿用仓库根的 merchant-erp 构建）
5. Output Directory：`.`（默认即可）
6. Deploy

若未设 Root Directory，Vercel 会读仓库根 `vercel.json` 去跑 `web版/merchant-erp` 构建，约十几秒即 **Error**。

或直接导入后使用默认静态托管；`index.html` 为入口。

## 交互说明（v2）

- 左侧目录 / 底部 ☰（移动端）切换章节；**目录边缘按钮**可收起/展开侧栏，扩大右侧展示区域  
- `←` `→` 或顶部按钮翻页；弹层打开时 `Esc` 关闭  
- **编辑内容**：顶部「编辑内容」进入编辑模式，可直接改标题、正文、表格文字等；修改后须点 **「确认修改」** 才保存（写入浏览器本地存储）；「放弃修改」可还原  
- 切换页面前若有未确认修改，会提示是否放弃  
- Part 1：标签切换 LLM / RAG / Agent；**「查看详情」** 打开子页面弹层  
- 行业场景：点击卡片查看摘要；**「行业详情」** 打开完整场景清单  
- 外贸主链：点击「询盘→回款」各环节打开环节详解  
- 各岗位页：**操作手册 / Prompt 模板 / 自测题** 等按钮打开子页面  
- 手风琴区块可展开阅读案例与流程  

## 目录结构

```
ai-trade-training-web/
├── index.html
├── css/styles.css
├── js/app.js
├── js/modals.js     # 子页面弹层内容
├── assets/          # AI 生成配图（每页效果图）
├── vercel.json
└── README.md
```
