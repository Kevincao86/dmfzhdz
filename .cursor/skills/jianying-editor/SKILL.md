---
name: jianying-editor
description: >-
  Drive desktop JianYing Pro (剪映专业版) from Cursor: build/edit drafts,
  import media, TTS+subtitles, BGM, effects, web-to-video. Use when the user
  mentions 剪映、JianYing、剪映草稿、用剪映剪辑、jianying-editor. Does NOT touch
  merchant ERP, mini-program, /erp-api, or CapCut international. macOS is
  experimental (manual export in JianYing).
---

# 剪映 Editor（Cursor 本地）

用 Cursor 驱动本机 **剪映专业版** 草稿（改 `draft_content.json` / `draft_info.json`），不是点 UI。  
上游：[luoluoluo22/jianying-editor-skill](https://github.com/luoluoluo22/jianying-editor-skill)  
**禁止**把本 skill 嵌进商家 ERP / 小程序 / 轻量 API。

## Hard rules

1. **Skill 根目录**必须是 `$JIANYING_SKILL_HOME`（默认：仓库根下 `tools/jianying-editor-skill`）。读上游 `SKILL.md` / `rules/*` / `docs/*` 只在该目录。
2. **剪辑作业脚本**只写在 `tools/jianying-jobs/`（可建子目录）。**禁止**写进仓库根 `scripts/`（那是部署/运维脚本）、`web版/`、`灵祺*/`、`api/`。
3. **禁止修改**产品代码来「方便剪辑」。成片/草稿只落剪映草稿目录或 `tools/jianying-jobs/` 产出。
4. 本机是 **macOS**：可生成/改草稿；**自动导出不支持**，须在剪映里手动导出。推荐环境仍是 Windows + 剪映 ≤5.9。
5. **只支持国内剪映专业版**；CapCut 国际版 / 手机端不支持。
6. 写草稿前确认剪映未打开同一工程（避免覆盖冲突）。生成后若列表不刷新：重启剪映或进出一次旧草稿。

## Bootstrap（未安装时）

若 `$JIANYING_SKILL_HOME` 不存在或缺少上游 `SKILL.md`：

```bash
bash scripts/jianying-editor-setup.sh
```

可选：`JIANYING_SKILL_HOME=/自定义路径 bash scripts/jianying-editor-setup.sh`

装完后确认：

```bash
test -f "${JIANYING_SKILL_HOME:-tools/jianying-editor-skill}/SKILL.md" && echo OK
```

依赖：Python 3.10+、FFmpeg（推荐）。详情见 [setup.md](setup.md)。

## 本机草稿目录（已探测）

默认 macOS：

`~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`

若探测失败，让用户给出实际草稿路径后再跑脚本。

## Agent workflow

1. 确认 `$JIANYING_SKILL_HOME` 已安装；否则先跑 setup。
2. **先读**上游契约：
   - `$JIANYING_SKILL_HOME/SKILL.md`
   - `$JIANYING_SKILL_HOME/docs/agent-playbook.md`（若存在）
   - 按任务再读对应 `rules/*.md`
3. 在 `tools/jianying-jobs/` 写一次性 Python 脚本（`JyProject` API），用 skill 内 venv 运行。  
   **必须**设置 `JY_SKILL_ROOT`（上游 bootstrap 认这个变量；本仓库默认指向 `tools/jianying-editor-skill`）：
   ```bash
   export JIANYING_SKILL_HOME="${JIANYING_SKILL_HOME:-$PWD/tools/jianying-editor-skill}"
   export JY_SKILL_ROOT="$JIANYING_SKILL_HOME"
   source "$JIANYING_SKILL_HOME/.venv/bin/activate"
   python tools/jianying-jobs/<your_script>.py
   ```
   脚本顶部按上游 `rules/setup.md` 探测 `JY_SKILL_ROOT`；也可直接 `sys.path` 加入 `$JY_SKILL_ROOT/scripts`。
4. 验收：草稿目录出现工程、`project.save()` 成功、时间轴有片段；向用户报告草稿名与路径。
5. macOS：**不要**跑 Windows 专用 `uiautomation` 自动导出；告诉用户打开剪映手动导出。

## 与 OpenMontage 的边界

| 场景 | 用什么 |
|------|--------|
| 要进 **剪映** 时间轴精修 / 用剪映素材库 | **本 skill** |
| 本机独立 pipeline 出片、不经过剪映 | **openmontage** skill |
| 商家 ERP 数字人/短视频（Seedance 等） | **产品内功能**，本 skill 不介入 |

示例提示词见 [prompts.md](prompts.md)。
