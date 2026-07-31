# 剪映作业脚本

把 Cursor / Agent 生成的一次性剪辑 `.py` 放这里。

```bash
export JY_SKILL_ROOT="$(pwd)/tools/jianying-editor-skill"
source "$JY_SKILL_ROOT/.venv/bin/activate"
python tools/jianying-jobs/your_script.py
```

勿写入仓库根 `scripts/`（部署脚本专用）。
