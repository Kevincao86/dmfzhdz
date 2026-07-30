# 官网投放 · 30s 玩法演示

画幅 16:9 · 单片约 30 秒。

## 已产出演示成片（商家 ERP 同源 Seedance）

| 成片 | 时长 | 说明 |
|------|------|------|
| `out/demo-canvas-30s.mp4` | ≈30.3s | 无限画布玩法 |
| `out/demo-shortfilm-30s.mp4` | ≈30.3s | 短片生成玩法 |

复现：

```bash
cd docs/demo-storyboards && python3 gen_demo_videos.py all
```

链路：`mofangdianai.com/erp-api/meoo-merchant-ai-video-seedance-*`（与商家 ERP 短片台相同）→ 关键帧 i2v 5s×6 → ffmpeg 拼接。

关键帧原图见 `canvas-30s/`、`shortfilm-30s/`；分镜口播与执导文案见下方。

---

## 片 A｜无限画布（关键帧）

| 时段 | 文件 | 口播 |
|------|------|------|
| 0–5s | canvas-01-open.png | 本地生活短片，先在无限画布里排镜头。 |
| 5–10s | canvas-02-add-shot.png | 一键新增镜头，想加几段加几段。 |
| 10–15s | canvas-03-add-media.png | 每个镜头都能挂图片和视频素材。 |
| 15–20s | canvas-04-link.png | 自由连线，流程怎么走你说了算。 |
| 20–25s | canvas-05-apply-flow.png | 应用流程，分镜立刻同步到出片区。 |
| 25–30s | canvas-06-cta.png | 灵祺 AI，从策划到成片一屏搞定。 |

## 片 B｜短片生成（关键帧）

| 时段 | 文件 | 口播 |
|------|------|------|
| 0–5s | shortfilm-01-prompt.png | 写一句执导文案，AI 听懂你的短片意图。 |
| 5–10s | shortfilm-02-plan.png | 一键规划分镜，画面和口播自动排好。 |
| 10–15s | shortfilm-03-refs.png | 再丢几张参考图，成片更贴门店调性。 |
| 15–20s | shortfilm-04-generating.png | AI 出片中，坐等成片。 |
| 20–25s | shortfilm-05-result.png | 营销短片直接出来，可预览可下载。 |
| 25–30s | shortfilm-06-cta.png | 灵祺 AI，短片一键成片，马上体验。 |
