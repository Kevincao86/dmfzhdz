---
name: seedance-product-video
description: >-
  Write Seedance 2.0 / 即梦 15s one-take product promo motion-graphics prompts
  (Apple/Microsoft/Bauhaus/Vercel styles, optional reference images, Dreamina CLI).
  Use when user asks for 产品宣传动画、15秒宣传片提示词、Seedance 产品片、motion graphics prompt.
  Does NOT touch merchant ERP / mini-program /erp-api code.
---

# Seedance 产品宣传片 Prompt（Cursor 本地）

上游：[op7418/Seedance-Product-Video](https://github.com/op7418/Seedance-Product-Video)  
默认目录：`$SEEDANCE_PRODUCT_VIDEO_HOME` → `tools/Seedance-Product-Video`

## Hard rules

1. 读上游只在 `$SEEDANCE_PRODUCT_VIDEO_HOME`（含 `SKILL.md`、`references/prompt-system.md`）。
2. **禁止**改 `web版/`、`灵祺*/`、`api/`、`scripts/ecs-*` 来「方便出片」。
3. 产出是 **英文提示词**（可附中文说明）；成片在即梦 / Dreamina CLI / 商家 ERP 短视频台生成，不写进产品仓库。
4. 口播/画面勿塞微信二维码、外链网址、虚假营收承诺。

## Bootstrap

```bash
bash scripts/media-promo-skills-setup.sh
test -f "${SEEDANCE_PRODUCT_VIDEO_HOME:-tools/Seedance-Product-Video}/SKILL.md" && echo OK
```

## Agent workflow

1. 确认上游已安装；否则跑 setup。
2. **先读** `$SEEDANCE_PRODUCT_VIDEO_HOME/SKILL.md`，再读 `references/prompt-system.md`。
3. 收集：产品名、核心卖点、是否有 Logo/界面垫图、要不要口播。
4. 按上游模板输出 1000–2000 字符英文 prompt + 垫图占位说明。
5. 可选：检测 `dreamina` CLI；未装则询问是否安装（勿擅自 `curl | bash`，须用户同意）。
6. 灵祺 ERP 默认素材叙事：痛点（五处工具）→ AI 组品/招募/内容流水线 → 评论「试用」。

## 与其它 skill 边界

| 场景 | 用什么 |
|------|--------|
| 15s 产品 MG / 投流片提示词 | **本 skill** |
| 通用 Seedance 多模态提示词 | `seedance2-prompt` |
| 镜头词库 / API 出片 CLI | `seedance2-creative` |
| 进剪映时间轴精修 | `jianying-editor` |
| 本机 pipeline 不经剪映 | `openmontage` |
