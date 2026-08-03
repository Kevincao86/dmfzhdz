# 本目录说明

本地媒体/剪辑上游（多数已 gitignore），Cursor 薄包装在 `.cursor/skills/`。

| 目录 | 说明 | 安装 |
|------|------|------|
| `OpenMontage/` | AGPL 本机克隆，本地 pipeline 出片（不经剪映） | `bash scripts/openmontage-setup.sh` |
| `jianying-editor-skill/` | 剪映自动化上游，驱动剪映草稿 | `bash scripts/jianying-editor-setup.sh` |
| `jianying-jobs/` | 剪映作业脚本（**可提交**）；勿写进仓库根 `scripts/` | — |
| `Seedance-Product-Video/` | 15s 产品宣传 MG Prompt（即梦） | `bash scripts/media-promo-skills-setup.sh` |
| `seedance2-prompt-skill/` | Seedance 2.0 通用多模态提示词 | 同上 |
| `Seedance2-skill/` | 镜头词库 + 创意门禁 + API CLI | 同上 |
| `ai-image-prompts-skill/` | 1万+ 做图 Prompt 库（海报/营销/封面） | 同上 |

## Cursor Skill 对照

| 你想做… | 说 / 用 skill |
|---------|----------------|
| 剪映草稿、配音字幕 | `jianying-editor` |
| 本机不经剪映出片 | `openmontage` |
| 15 秒产品宣传片提示词 | `seedance-product-video` |
| Seedance 全能参考 / 首尾帧 | `seedance2-prompt` |
| 镜头语言 / API 出片 | `seedance2-creative` |
| 海报、封面、宣传静帧 prompt | `ai-image-prompts` |

**禁止**把上述上游嵌进商家 ERP / 小程序 / 轻量 `/erp-api` 发版包。
