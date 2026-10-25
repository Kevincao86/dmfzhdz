---
name: local-life-shop-eval
description: >-
  Analyzes a local-life store or chain the way 灵祺店铺分析 does: public-web
  six-dimension score, nearby rivals, and a lift plan. Use when the user asks
  for 店铺分析, 门店评估, 本地生活分析, 周边竞品, 国际版店铺分析, Google Maps
  store analysis, Google Business Profile, or local SEO for a restaurant, salon,
  clinic, or retail shop. China stays on 高德; international is a parallel mode.
---

# 本地生活店铺分析

国内版已经在跑，不要改成国际数据源。国际版是平行模式：同一套六维和竞品结论，换地图和搜索来源。

## 先分市场

| 市场 | 什么时候用 | 地图 | 公域前台 | 搜索可见度 |
|---|---|---|---|---|
| `cn` | 地址在中国，或用户没说海外 | 高德。现有 `POST /api/meoo-shop-eval-locate` | 抖音、美团、小红书、快手 | 现有公网检索，不新接 SEO 厂商 |
| `intl` | 用户明确说海外、国际版、Google、某个外国城市 | Google Places | Google Business Profile、Yelp、TripAdvisor；餐饮可加该国团购站 | 只接一家本地搜索聚合，不并行接 Ahrefs、Semrush、Moz |

用户没指定市场时用 `cn`。不要把中国门店改走 Google。

## 分析步骤

1. 记下店名、地址、城市、品类、单店还是连锁、有没有商家后台摘要。地址不够就停，不要编周边竞品。
2. 只读该市场的地图接口，取出坐标、营业时间、评分、评价数、价位、同品类周边店（距离、评分、评价数）。接口没配密钥时，写明缺哪一个环境变量，停止打分，不要用网页抓取补数。
3. 国际版再读搜索聚合：该城市 + 品类词在 Google 本地包里的名次、本店是否出现、前三名是谁。没有这家的密钥就跳过这一维的搜索分，并在结论里写「搜索名次未接入」。
4. 按下面六维打分。每一维都要写「现在看到的事实」和「缺什么」。没有事实的维给低分并说明缺数据，不要用行业平均值充数。
5. 输出：总分、六维、周边最多 6 家竞品、2 到 4 条可执行调整、曝光和到店的提升是估算。声明写清楚：公网分不是营收、利润或核销。

## 六维

国内单店权重沿用现有产品：预估下单 20、套餐价格 15、公域内容 20、线上运营 15、口碑 20、门店基础 10。连锁把口碑提到 25，预估下单降到 15，并看价格是否内卷、内容是否覆盖到各店。

国际版用同一权重，名称改成当地人看得懂的事实：

| 维 | 国际版看什么 | 没有时 |
|---|---|---|
| 预估到店规模 | Google 评价数、本地包名次、品类搜索量级 | 只写评价数，不编单量 |
| 价格带 | Places `price_level`，以及菜单或团购公开价相对周边 | 写「价位未知」 |
| 内容供给 | 商家照片数、近期评价、Yelp/TripAdvisor 图文 | 不把网站博客算成到店内容 |
| 运营执行 | 营业时间是否完整、问答是否回复、评价回复率、活动是否在售 | 缺回复数据就不要写「运营好」 |
| 口碑风险 | 评分、差评主题、连锁是否被某一家拖累 | 评价少于 10 条时降低这一维权重的信心，不改公式 |
| 基础可信 | 地址、电话、官网、类目是否一致，地图坐标是否落在店门口 | 坐标和地址对不上就先报这个 |

## 国际版接哪些 API

地图只用 Google 官方接口，环境变量 `GOOGLE_MAPS_API_KEY`：

- Geocoding：地址到坐标
- Places API Nearby Search：同品类、约 1.5 公里
- Place Details：`rating`、`user_ratings_total`、`price_level`、`opening_hours`、`reviews`、`photos`、`types`

商家自己的店，若已授权，再用 Google Business Profile API 读搜索展示、路线、通话、网站点击。这是店主数据，不能拿去评竞品。

搜索可见度只选一家，环境变量 `LOCAL_SEO_API_KEY`，厂商名记在 `LOCAL_SEO_VENDOR`。默认建议 DataForSEO 的 Google Maps / Local Pack 接口。不要同时接 Ahrefs、Semrush、Moz：那三家看的是网站外链，不是本地生活到店。网站外链只在用户明确要评独立站时另开一项，不进六维总分。

字段对照和请求边界见 [references/intl-sources.md](references/intl-sources.md)。

## 不要做的事

- 不要抓 Google、Yelp、美团页面来代替 API。
- 不要把国内高德结果和高德文案改成 Google。
- 不要在结论里把估算曝光写成已发生的营收。
- 不要为了国际版去改 `meoo-shop-eval-locate` 的国内返回。新接口应分开，例如 `meoo-shop-eval-locate-intl`。
- 密钥、配额文件、`.env` 不要写进技能或提交。
