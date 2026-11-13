/** 竞品/选址：从分析接口抽出坐标，拼微信 <map> 标记 */

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function latLng(obj) {
  if (!obj || typeof obj !== 'object') return null
  const loc = obj.location && typeof obj.location === 'object' ? obj.location : obj
  const latitude = num(loc.lat != null ? loc.lat : loc.latitude)
  const longitude = num(loc.lng != null ? loc.lng : loc.longitude != null ? loc.longitude : loc.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -85 || latitude > 85 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

function pickCenter(payload) {
  return (
    latLng(payload && payload.mapMeta && payload.mapMeta.location) ||
    latLng(payload && payload.location) ||
    latLng(payload && payload.footTrafficHeat && payload.footTrafficHeat.location) ||
    null
  )
}

function peerPoints(payload) {
  const fromMeta = payload && payload.mapMeta && Array.isArray(payload.mapMeta.pois) ? payload.mapMeta.pois : []
  const fromPeer = Array.isArray(payload && payload.peerPois) ? payload.peerPois : []
  const fromComp = Array.isArray(payload && payload.competitors) ? payload.competitors : []
  const list = fromMeta.length ? fromMeta : fromPeer.length ? fromPeer : fromComp
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i]
    const pt = latLng(p)
    if (!pt) continue
    out.push({
      name: String((p && (p.name || p.storeName || p.title)) || '竞品').trim() || '竞品',
      latitude: pt.latitude,
      longitude: pt.longitude,
    })
  }
  return out.slice(0, 20)
}

function buildMapView(payload, selfLabel) {
  const center = pickCenter(payload)
  if (!center) {
    return { showMap: false, mapLat: 30, mapLng: 120, markers: [], includePoints: [] }
  }
  const peers = peerPoints(payload)
  const markers = [
    {
      id: 0,
      latitude: center.latitude,
      longitude: center.longitude,
      width: 28,
      height: 28,
      callout: {
        content: String(selfLabel || '本店').slice(0, 16),
        display: 'ALWAYS',
        padding: 8,
        borderRadius: 8,
        fontSize: 12,
        bgColor: '#1e3a5f',
        color: '#ffffff',
      },
    },
  ]
  const includePoints = [{ latitude: center.latitude, longitude: center.longitude }]
  for (let i = 0; i < peers.length; i += 1) {
    const p = peers[i]
    markers.push({
      id: i + 1,
      latitude: p.latitude,
      longitude: p.longitude,
      width: 24,
      height: 24,
      callout: {
        content: String(p.name || '竞品').slice(0, 14),
        display: 'BYCLICK',
        padding: 6,
        borderRadius: 8,
        fontSize: 11,
      },
    })
    includePoints.push({ latitude: p.latitude, longitude: p.longitude })
  }
  return {
    showMap: true,
    mapLat: center.latitude,
    mapLng: center.longitude,
    markers,
    includePoints,
  }
}

function mapSourceLabel(payload) {
  const src = String((payload && (payload.mapSource || payload.mapProvider)) || '')
  const n = payload && payload.mapMeta && typeof payload.mapMeta.poiCount === 'number' ? payload.mapMeta.poiCount : null
  if (src === 'amap') return n != null ? `高德地图实查（${n} 家）` : '高德地图实查'
  if (src === 'baidu') return n != null ? `百度地图实查（${n} 家）` : '百度地图实查'
  return ''
}

function mapBundles(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((b, i) => {
      if (!b || typeof b !== 'object') return null
      const comboLines = Array.isArray(b.comboLines) ? b.comboLines.map((x) => String(x)).filter(Boolean) : []
      return {
        id: `b-${i}`,
        title: String(b.title || b.name || '组品建议').trim(),
        combo: comboLines.join(' + '),
        price:
          b.suggestedPriceYuan != null && Number.isFinite(Number(b.suggestedPriceYuan))
            ? `建议售价 ¥${b.suggestedPriceYuan}`
            : '',
        origin:
          b.originYuan != null && Number.isFinite(Number(b.originYuan)) ? `面值 ¥${b.originYuan}` : '',
        margin: String(b.targetMarginNote || '').trim(),
        competitorRef: String(b.competitorRef || '').trim(),
        rationale: String(b.rationale || b.note || '').trim(),
      }
    })
    .filter(Boolean)
}

function mapHotProducts(list) {
  if (!Array.isArray(list)) return []
  return list.slice(0, 6).map((p, j) => {
    const name = String((p && p.name) || '').trim()
    if (!name) return null
    const price =
      p.priceYuan != null && Number.isFinite(Number(p.priceYuan)) ? `¥${p.priceYuan}` : ''
    const channel = String((p && p.channel) || '').trim()
    const note = String((p && p.note) || '').trim()
    return {
      id: `hp-${j}`,
      line: [name, price, channel].filter(Boolean).join(' · ') + (note ? ` — ${note}` : ''),
    }
  }).filter(Boolean)
}

function mapHeat(heat) {
  if (!heat || typeof heat !== 'object') return null
  const days = Array.isArray(heat.days)
    ? heat.days.slice(0, 7).map((d, i) => ({
        id: `h-${i}`,
        label: `${String(d.date || '').slice(5)} ${d.weekday || ''}`.trim(),
        avg: d.avgIndex != null ? String(d.avgIndex) : '—',
      }))
    : []
  return {
    insight: String(heat.insight || heat.summary || heat.note || '').trim(),
    disclaimer: String(heat.disclaimer || '').trim(),
    drivers: Array.isArray(heat.drivers) ? heat.drivers.map((x) => String(x)).filter(Boolean) : [],
    days,
  }
}

module.exports = {
  pickCenter,
  buildMapView,
  mapSourceLabel,
  mapBundles,
  mapHotProducts,
  mapHeat,
}
