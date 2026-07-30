# OpenMontage 本机安装

默认安装目录（AGPL 源码，已 gitignore，不进产品仓）：

```text
<仓库根>/tools/OpenMontage
```

可用环境变量覆盖：`OPENMONTAGE_HOME`。

## 一键

在仓库根执行：

```bash
bash scripts/openmontage-setup.sh
```

脚本会：

1. `git clone` https://github.com/calesthio/OpenMontage.git（已存在则 `git pull --ff-only`）
2. 优先跑 `make setup`；无 make 则走 venv + pip + remotion `npm install`
3. 从 `.env.example` 生成 `.env`（已存在不覆盖）

## 前置依赖

| 依赖 | 检查 |
|------|------|
| Python 3.10+ | `python3 --version` |
| FFmpeg | `ffmpeg -version` |
| Node.js 18+ | `node -v` |
| Git | `git --version` |

macOS 示例：

```bash
brew install ffmpeg python@3.12 node
```

## 可选 API Key

编辑 `tools/OpenMontage/.env`。零 key 也可出片（Piper TTS + 免费素材）。常用：

```bash
FAL_KEY=
PEXELS_API_KEY=
PIXABAY_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
ELEVENLABS_API_KEY=
```

完整列表见上游 `docs/PROVIDERS.md`。

## 验证

```bash
cd tools/OpenMontage
source .venv/bin/activate
python -c "from tools.tool_registry import registry; registry.discover(); print('tools ok', len(registry._tools) if hasattr(registry,'_tools') else 'discovered')"
test -d remotion-composer/node_modules && echo remotion ok
```

或打开 Cursor 说：「用 OpenMontage 做一条 30 秒产品解说，主题是灵祺达人撮合」。

`make setup` 末尾的 HyperFrames `npx` 预热可跳过（网络慢时常挂起）；Remotion + Python 工具链就绪即可先出片。

## 许可

OpenMontage = **AGPL-3.0**。仅本机 Cursor 制片；禁止并入 ERP 发版或作为 `/erp-api` 服务端依赖。
