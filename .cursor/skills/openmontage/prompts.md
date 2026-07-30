# 灵祺相关本地制片提示词

复制到 Cursor，并确保已加载 openmontage skill。成片落在 `tools/OpenMontage/projects/`。

## 产品讲解（explainer）

```text
用 OpenMontage 做一条 60 秒 animated explainer：
主题：灵祺达人撮合如何帮本地商家找到探店达人。
受众：餐饮/本地生活老板。
语气：专业、简洁，少术语。
需要：口播 + 字幕 + 轻音乐。优先零付费路径；若已配置 FAL/OpenAI 再用 AI 画面。
```

## 软件演示（screen-demo）

```text
用 OpenMontage screen-demo 流水线：
根据我稍后提供的商家 ERP 录屏（或先出分镜脚本），做 45 秒「发招募单 → 达人报名」走查视频。
中文旁白，字幕可读，结尾 CTA：打开灵祺商家后台试试。
```

## 品牌预告（cinematic）

```text
用 OpenMontage cinematic：30 秒情绪向预告片，关键词「本地探店、真实达人、智能撮合」。
先出 2–3 个概念方案与成本估算，我确认后再生成素材。
```

## 参考视频改编

```text
这是一条我喜欢的 YouTube Short / 抖音链接：<URL>
用 OpenMontage 参考视频分析：保留节奏与钩子，主题改成「区域服务商如何用灵祺拓商家」。
先给差异化概念，不要直接开渲。
```

## 实拍拼贴（documentary）

```text
用 documentary-montage：75 秒，城市夜景探店氛围，只要真实素材、不要 AI 生视频，可配乐、可无旁白， elegiac 气质。
```

## 注意

- 商家线上数字人口播 / Seedance 短视频 → 用产品功能，不用本 skill。
- 提示词里写清时长、受众、是否允许付费 API，可减少返工。
