---
name: ai-image-prompts
description: >-
  Recommend curated prompts from 10k+ image library (posters, product marketing,
  social, thumbnails) for Seedream / Midjourney / Flux / GPT-Image etc. Use when
  user asks 做海报、宣传图、封面、种草图、找生图提示词、AI 做图 prompt. Does NOT
  modify ERP product code; generation happens in 即梦/外部生图工具.
---

# AI 做图 Prompt 库（Cursor 本地）

上游：[YouMind-OpenLab/ai-image-prompts-skill](https://github.com/YouMind-OpenLab/ai-image-prompts-skill)  
默认目录：`$AI_IMAGE_PROMPTS_HOME` → `tools/ai-image-prompts-skill`  
数据：`references/*.json`（含 `poster-flyer`、`product-marketing`、`social-media-post` 等）

## Hard rules

1. 读上游 `SKILL.md` + `references/manifest.json`，再按类目打开对应 json。
2. **禁止**改产品代码；生成图用即梦 Seedream / Cursor GenerateImage / 外部工具。
3. 推荐 prompt 时尽量带样例图路径（`sourceMedia`）；无样例则跳过该条。
4. 灵祺物料：优先 `product-marketing`、`poster-flyer`、`social-media-post`、`youtube-thumbnail`；品牌色可参考紫白 `#7c83ff`，但勿抄竞品 Logo。

## Bootstrap

```bash
bash scripts/media-promo-skills-setup.sh
test -f "${AI_IMAGE_PROMPTS_HOME:-tools/ai-image-prompts-skill}/references/manifest.json" && echo OK

# 数据过期时可同步（需网络）:
# cd tools/ai-image-prompts-skill && node scripts/setup.js --force
```

## Agent workflow

1. 确认 `references/` 存在。
2. 读上游 SKILL 的检索/推荐步骤。
3. 用户说清用途（抖音封面 / 直播背景 / 公众号头图 / 投流静帧）→ 从对应类目挑 2–4 条 → 按灵祺产品改写主体文案与色调。
4. 交付：可复制的英文/中英 prompt + 建议比例（9:16 / 1:1 / 16:9）+ 建议模型（Seedream / 即梦）。
5. 若用户要「直接出图」：用 Cursor `GenerateImage` 或引导去即梦；本 skill 本身不替代生图 API。
