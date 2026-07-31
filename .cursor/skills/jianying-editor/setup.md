# 剪映 Skill 安装说明

## 一键安装

在仓库根执行：

```bash
bash scripts/jianying-editor-setup.sh
```

会：

1. 克隆/更新上游到 `tools/jianying-editor-skill/`（已 gitignore，勿提交）
2. 创建 `.venv` 并 `pip install -r requirements.txt`
3. 可选安装 Playwright Chromium（Web-to-Video）

## 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `JIANYING_SKILL_HOME` | `tools/jianying-editor-skill` | 上游 skill 根目录 |
| `JIANYING_REPO_URL` | `https://github.com/luoluoluo22/jianying-editor-skill.git` | 克隆地址 |
| `JIANYING_SKIP_PLAYWRIGHT=1` | 空 | 跳过 `playwright install chromium` |

## macOS 注意

- 草稿目录常见：`~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`
- `uiautomation` 为 Windows 依赖，setup 在 Darwin 上会跳过该包
- 自动导出不可用：草稿生成后在剪映内手动导出
- 剪映 6.0+ 弹窗多，上游文档仍建议自动导出用 ≤5.9（Windows）

## 更新上游

```bash
bash scripts/jianying-editor-setup.sh
# 或
git -C tools/jianying-editor-skill pull --ff-only
```

## 作业脚本位置

一律放 `tools/jianying-jobs/`，不要写进仓库根 `scripts/`。
