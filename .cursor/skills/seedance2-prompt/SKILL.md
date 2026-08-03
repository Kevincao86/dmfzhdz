---
name: seedance2-prompt
description: >-
  Craft effective Jimeng Seedance 2.0 multimodal video prompts (@Image/@Video/@Audio
  references, camera, e-commerce, short drama, music beat-match). Use when user mentions
  Seedance 2.0、即梦提示词、全能参考、首尾帧、多模态视频 prompt. Does NOT modify ERP product code.
---

# Seedance 2.0 通用提示词工程（Cursor 本地）

上游：[dexhunter/seedance2-skill](https://github.com/dexhunter/seedance2-skill)（~3k★）  
默认目录：`$SEEDANCE2_PROMPT_HOME` → `tools/seedance2-prompt-skill`  
中文说明：`zh/SKILL.md`

## Hard rules

1. 读上游只在 `$SEEDANCE2_PROMPT_HOME`。
2. **禁止**改商家 ERP / 小程序 / 轻量 API 代码。
3. 优先用 `@ImageN` / `@VideoN` / `@AudioN` 引用语法；输出可直接粘贴即梦。
4. 与 `seedance-product-video` 重叠时：要 **15s 产品 MG 固定模板** 用那边；要 **多模态/首尾帧/运镜复刻** 用本 skill。

## Bootstrap

```bash
bash scripts/media-promo-skills-setup.sh
test -f "${SEEDANCE2_PROMPT_HOME:-tools/seedance2-prompt-skill}/SKILL.md" && echo OK
```

## Agent workflow

1. 确认上游存在。
2. 读 `$SEEDANCE2_PROMPT_HOME/SKILL.md`（中文用户可读 `zh/SKILL.md`）。
3. 按任务选模板（电商/解说/教育/音乐卡点等），写清参考素材用途。
4. 交付：英文主 prompt + 中文简要分镜意图；提醒用户在即梦选「全能参考」并拖入素材。
