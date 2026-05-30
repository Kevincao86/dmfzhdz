/** 智能体日常天气简报（wttr.in，服务端/Vite 中间件共用） */

const CITY_CN: Record<string, string> = {
  Beijing: '北京',
  Shanghai: '上海',
  Guangzhou: '广州',
  Shenzhen: '深圳',
  Hangzhou: '杭州',
  Wenzhou: '温州',
  Ningbo: '宁波',
  Chengdu: '成都',
  Chongqing: '重庆',
  Wuhan: '武汉',
  "Xi'an": '西安',
  Nanjing: '南京',
}

export type DailyWeatherInput = {
  city?: string
  dayOffset?: number
}

function wmoWeatherZh(code: number): string {
  if (code === 0) return '晴'
  if (code <= 3) return '多云'
  if (code <= 48) return '雾'
  if (code <= 57) return '毛毛雨'
  if (code <= 67) return '雨'
  if (code <= 77) return '雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '阵雪'
  if (code >= 95) return '雷雨'
  return '阴'
}

async function buildWeatherFromOpenMeteo(
  city: string,
  dayOffset: number,
  dayLabel: string,
  cityCn: string,
): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
    { headers: { 'User-Agent': 'MeooERP-Agent/1.0' }, signal: AbortSignal.timeout(10000) },
  )
  if (!geoRes.ok) return { ok: false, message: `Open-Meteo 地理编码 HTTP ${geoRes.status}` }
  const geo = (await geoRes.json()) as { results?: Array<{ latitude: number; longitude: number; name?: string }> }
  const hit = geo.results?.[0]
  if (!hit) return { ok: false, message: '未找到城市坐标' }

  const fcRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&forecast_days=3&timezone=auto`,
    { headers: { 'User-Agent': 'MeooERP-Agent/1.0' }, signal: AbortSignal.timeout(10000) },
  )
  if (!fcRes.ok) return { ok: false, message: `Open-Meteo 预报 HTTP ${fcRes.status}` }
  const fc = (await fcRes.json()) as {
    daily?: {
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: number[]
    }
  }
  const d = fc.daily
  const idx = Math.min(dayOffset, (d?.weather_code?.length ?? 1) - 1)
  const desc = wmoWeatherZh(d?.weather_code?.[idx] ?? 3)
  const hi = d?.temperature_2m_max?.[idx] ?? '—'
  const lo = d?.temperature_2m_min?.[idx] ?? '—'
  const rain = d?.precipitation_probability_max?.[idx] ?? 0
  const place = hit.name || cityCn

  const reply = [
    `${place}${dayLabel}天气：${desc}。`,
    `气温约 ${lo}～${hi}°C，降水概率约 ${rain}%。`,
    dayOffset === 0
      ? '如需其它城市，可在问题里写上城市名，例如「上海明天天气」。'
      : '以上为公开气象数据参考，出行前建议再看一眼本地天气预报。',
  ].join('')

  return { ok: true, reply }
}

export async function buildWeatherDailyReply(
  input: DailyWeatherInput,
): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
  const city = String(input.city || 'Beijing').trim() || 'Beijing'
  const dayOffset = Math.min(2, Math.max(0, Number(input.dayOffset) || 0))
  const dayLabel = dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : '后天'
  const cityCn = CITY_CN[city] || city

  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`
    const wRes = await fetch(url, {
      headers: { 'User-Agent': 'MeooERP-Agent/1.0' },
      signal: AbortSignal.timeout(12000),
    })
    if (!wRes.ok) {
      const fallback = await buildWeatherFromOpenMeteo(city, dayOffset, dayLabel, cityCn)
      if (fallback.ok) return fallback
      return { ok: false, message: `天气源 HTTP ${wRes.status}` }
    }
    const data = (await wRes.json()) as {
      current_condition?: Array<{
        temp_C?: string
        weatherDesc?: Array<{ value?: string }>
        windspeedKmph?: string
      }>
      weather?: Array<{
        maxtempC?: string
        mintempC?: string
        hourly?: Array<{
          time?: string
          tempC?: string
          weatherDesc?: Array<{ value?: string }>
          chanceofrain?: string
        }>
      }>
    }

    const cur = data.current_condition?.[0]
    const day = data.weather?.[dayOffset]
    const noon =
      day?.hourly?.find((h) => String(h.time || '').padStart(4, '0') === '1200') ||
      day?.hourly?.[Math.floor((day.hourly?.length || 0) / 2)] ||
      day?.hourly?.[0]

    const desc =
      (noon?.weatherDesc?.[0]?.value || cur?.weatherDesc?.[0]?.value || '多云').trim()
    const hi = day?.maxtempC || noon?.tempC || cur?.temp_C || '—'
    const lo = day?.mintempC || cur?.temp_C || '—'
    const rain = noon?.chanceofrain || '0'
    const wind = cur?.windspeedKmph || '—'

    const reply = [
      `${cityCn}${dayLabel}天气：${desc}。`,
      `气温约 ${lo}～${hi}°C，降水概率约 ${rain}%，风速约 ${wind} km/h。`,
      dayOffset === 0
        ? '如需其它城市，可在问题里写上城市名，例如「上海明天天气」。'
        : '以上为公开气象数据参考，出行前建议再看一眼本地天气预报。',
    ].join('')

    return { ok: true, reply }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const fallback = await buildWeatherFromOpenMeteo(city, dayOffset, dayLabel, cityCn).catch(() => ({
      ok: false as const,
      message: msg.slice(0, 200),
    }))
    if (fallback.ok) return fallback
    return { ok: false, message: msg.slice(0, 200) }
  }
}
