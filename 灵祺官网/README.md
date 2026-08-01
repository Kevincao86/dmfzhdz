# 灵祺官网

温州灵祺智能科技有限公司官方网站（静态单页）。

视觉板式：**E（Live OS Playground）+ A（Split Orb）**

## 本地预览

```bash
cd 灵祺官网
npm run dev
# http://127.0.0.1:5178
```

## 板式要点

- **A**：居中胶囊导航 · 左品牌文案 · 跑马灯 · Bento 产品矩阵
- **E**：可拖拽节点图 · 左侧能力 Layer 切换 · 右侧 LIVE PANEL 实时详情

## 交互

1. 点击节点 → 右侧面板切换详情  
2. 按住拖拽节点 → 连线实时重绘  
3. 左侧 LAYER 芯片 → 高亮对应层、其余淡化  

## Vercel

Root Directory 选 `灵祺官网`；Install / Build 关闭 Override，Output = `.`
