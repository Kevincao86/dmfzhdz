# AI 传统外贸培训 · 互动网页课件

生成式 AI 商业应用培训（基础篇 + 传统外贸岗位实践），讲师：曹鑫淼。

## 本地预览

```bash
cd docs/ai-trade-training-web
python3 -m http.server 8765
# 打开 http://localhost:8765
```

## Vercel 部署

1. 在 Vercel 新建项目，关联本 GitHub 仓库  
2. **Root Directory** 设为：`docs/ai-trade-training-web`  
3. Framework Preset：**Other**（静态站点，无需构建命令）  
4. Deploy  

或直接导入后使用默认静态托管；`index.html` 为入口。

## 交互说明（v2）

- 左侧目录 / 底部 ☰（移动端）切换章节  
- `←` `→` 或顶部按钮翻页；弹层打开时 `Esc` 关闭  
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
