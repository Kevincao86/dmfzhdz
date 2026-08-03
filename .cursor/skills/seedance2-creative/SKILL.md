---
name: seedance2-creative
description: >-
  Seedance 2 creative director skill: 100+ cinematography terms, creativity gates,
  zero-copy ideation from images, optional Seedance API CLI (scripts/seedance.py).
  Use when user wants 镜头语言词库、创意审核、从一张图发散视频创意、Seedance API 出片.
  Does NOT modify ERP / mini-program /erp-api.
---

# Seedance2 创意词库 + CLI（Cursor 本地）

上游：[zhanghaonan777/Seedance2-skill](https://github.com/zhanghaonan777/Seedance2-skill)  
默认目录：`$SEEDANCE2_CREATIVE_HOME` → `tools/Seedance2-skill`  
参考：`reference.md` · CLI：`scripts/seedance.py`

## Hard rules

1. 读上游只在 `$SEEDANCE2_CREATIVE_HOME`。
2. **禁止**把 API Key 写进产品 `.env` 或提交 git；密钥仅本机环境变量 / 上游本地配置。
3. **禁止**改 `web版/`、`灵祺*/`、部署脚本。
4. 调 API 前先确认用户有火山/Seedance 密钥且同意扣费。

## Bootstrap

```bash
bash scripts/media-promo-skills-setup.sh
test -f "${SEEDANCE2_CREATIVE_HOME:-tools/Seedance2-skill}/SKILL.md" && echo OK
```

## Agent workflow

1. 读 `$SEEDANCE2_CREATIVE_HOME/SKILL.md` 与 `reference.md`。
2. 创意流程：记忆点 / 意外感 / 情绪弧 / 叙事 — 不过关则重写 prompt。
3. 需要 API 出片时读 `scripts/seedance.py` 用法，在本机跑；成片落到用户指定目录或 `tools/jianying-jobs/assets/`，勿写产品 src。
4. 成片若要进剪映时间轴 → 交接 `jianying-editor`。
