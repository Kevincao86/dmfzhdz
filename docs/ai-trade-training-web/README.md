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

## 交互说明

- 左侧目录 / 底部 ☰（移动端）切换章节  
- `←` `→` 或顶部按钮翻页  
- Part 1 组件页：点击标签切换 LLM / RAG / Agent 等  
- 行业场景页：点击卡片查看案例详情  
- 练习页：点击勾选完成项  

## 目录结构

```
ai-trade-training-web/
├── index.html
├── css/styles.css
├── js/app.js
├── assets/          # AI 生成配图
├── vercel.json
└── README.md
```
