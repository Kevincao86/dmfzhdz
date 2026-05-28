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
    return { ok: false, message: msg.slice(0, 200) }
  }
}
