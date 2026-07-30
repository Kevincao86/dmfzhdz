---
name: openmontage
description: >-
  Local OpenMontage agentic video production via Cursor. Use when the user asks
  to make/generate/render a video locally, run OpenMontage pipelines, produce
  explainers/trailers/talking-head/documentary montages, or mentions 本地生成视频 /
  OpenMontage / 本地制片. Does NOT touch merchant ERP, mini-program, or /erp-api.
---

# OpenMontage（本地制片）

用 Cursor 在本机跑 [OpenMontage](https://github.com/calesthio/OpenMontage) 端到端出片。  
**禁止**把 OpenMontage 嵌进商家 ERP / 小程序 / 轻量 API；成片只落在 OpenMontage 工程目录。

## Hard rules

1. **工作目录**必须是 `$OPENMONTAGE_HOME`（默认：仓库根下 `tools/OpenMontage`）。所有命令、`cd`、读写文件只在该目录内。
2. **禁止修改** `web版/`、`灵祺*/`、`api/`、`scripts/ecs-*` 等产品代码来「方便出片」。
3. 每次制片走 OpenMontage **pipeline**，先读其 `AGENT_GUIDE.md`，再读对应 `pipeline_defs/*.yaml` 与 `skills/pipelines/**`。
4. OpenMontage 为 **AGPL-3.0**：仅本机 Cursor 使用；勿把其源码并入产品发版包或 SaaS 运行时。
5. API Key 只写在 `$OPENMONTAGE_HOME/.env`，勿提交、勿拷进 ERP `.env`。

## Bootstrap（未安装时）

若 `$OPENMONTAGE_HOME` 不存在或缺少 `AGENT_GUIDE.md`：

```bash
bash scripts/openmontage-setup.sh
```

可选：`OPENMONTAGE_HOME=/自定义路径 bash scripts/openmontage-setup.sh`

装完后确认：

```bash
test -f "${OPENMONTAGE_HOME:-tools/OpenMontage}/AGENT_GUIDE.md" && echo OK
```

依赖：Python 3.10+、FFmpeg、Node 18+。详情见 [setup.md](setup.md)。

## Production workflow

在 `$OPENMONTAGE_HOME` 内按顺序执行：

1. **读契约**  
   - `AGENT_GUIDE.md`  
   - `PROJECT_CONTEXT.md`（若存在）
2. **能力探测**
   ```bash
   cd "$OPENMONTAGE_HOME"
   source .venv/bin/activate 2>/dev/null || true
   python -c "from tools.tool_registry import registry; import json; registry.discover(); print(json.dumps(registry.support_envelope(), indent=2))"
   ```
3. **选型 pipeline**（见下表）→ 读 `pipeline_defs/<name>.yaml`
4. **逐阶段**：读 `skills/pipelines/<name>/*-director.md` → 调 tools → checkpoint → 创意节点等人确认
5. **成片路径**：通常在 `projects/<id>/renders/`；向用户给出绝对路径

### Pipeline 速查

| 用户意图 | Pipeline |
|----------|----------|
| 解说/科普/产品讲解 | animated-explainer |
| 动效/社媒短片 | animation |
| 数字人/口播形象 | avatar-spokesperson / talking-head |
| 品牌预告/情绪片 | cinematic |
| 长视频切短 | clip-factory |
| 实拍/档案素材拼贴 | documentary-montage |
| 软件演示 | screen-demo |
| 多语言配音字幕 | localization |
| 播客切片 | podcast-repurpose |

灵祺相关示例提示词见 [prompts.md](prompts.md)。

## 与产品能力边界

| 场景 | 用什么 |
|------|--------|
| 商家 ERP 数字人/短视频（Seedance） | **产品内功能**，本 skill 不介入 |
| 团队本机宣传片、教程、BP 演示、方案讲解视频 | **本 skill + OpenMontage** |
| 用户说「部署轻量/新ECS」 | 与本 skill 无关，勿混用 |

## 失败处理

- 缺 key：引导编辑 `$OPENMONTAGE_HOME/.env`（可零 key 用 Piper + 免费素材，见 OpenMontage README）
- `make setup` 失败：按 [setup.md](setup.md) 手动步骤排障，勿改 ERP 依赖顶替
- 渲染失败：保留 checkpoint，报告阶段与日志，勿擅自跳过质检门禁

## 完成时回复用户

简要说明：选用的 pipeline、成片绝对路径、大致费用/用了哪些 provider、是否还需补 key。
