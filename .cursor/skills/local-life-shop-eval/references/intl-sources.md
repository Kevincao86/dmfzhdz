# 国际版本地生活数据源

国内版继续走高德与 `meoo-shop-eval-locate`。本文件只给 `market=intl`。

## 环境变量

| 变量 | 用途 | 没有时 |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Geocoding、Nearby Search、Place Details | 停止打分，提示未配置 Google 地图 |
| `LOCAL_SEO_VENDOR` | `dataforseo` 或 `serpapi` | 跳过本地包名次 |
| `LOCAL_SEO_API_KEY` | 上面这家的密钥 | 同上 |
| `GOOGLE_BUSINESS_PROFILE_*` | 仅店主已授权的本店展示、路线、通话 | 不评竞品，六维里注明「无店主后台」 |

## Google

- Geocoding：`address` + 国家/城市。多个候选时把候选列给用户，不要自己挑一个。
- Nearby Search：以本店坐标为圆心，半径 1500 米，`type` 或 `includedTypes` 对上品类。丢掉本店自己。最多 6 家，按距离排序，附评分和评价数。
- Place Details 字段只取：`id`、`displayName`、`formattedAddress`、`location`、`rating`、`userRatingCount`、`priceLevel`、`regularOpeningHours`、`reviews`、`photos`、`types`、`nationalPhoneNumber`、`websiteUri`。
- 评价只摘主题（菜品、排队、服务、卫生），不整段复制长评。

## 本地搜索聚合

用 DataForSEO Google Maps 或 SerpAPI Google Maps，查询「城市 + 品类」和「城市 + 店名」。记录：

- 本店是否出现在本地包
- 出现时的名次
- 本地包前三名的店名、评分、评价数

查不到本店就写「该词本地包未见本店」，不要写成第 20 名。

## 和国内六维的对应

| 国内 | 国际版事实 |
|---|---|
| 套餐预估下单 | 评价数 + 本地包名次。不写「预计每月 N 单」 |
| 套餐结构与价格 | `priceLevel` 与周边价位 |
| 公域内容 | 照片数、近期评价、Yelp/TripAdvisor 是否有主页 |
| 线上运营 | 营业时间、评价回复、问答 |
| 口碑 | 评分与差评主题；连锁看最低的一家 |
| 门店基础 | 地址、电话、官网、坐标是否一致 |

## 输出必须带上的声明

公网六维只用于同商圈对比。评分、评价数和本地包名次不是营收、利润或到店人数。店主后台若接入，只用于本店提升建议，不拿去和竞品的后台比较。
