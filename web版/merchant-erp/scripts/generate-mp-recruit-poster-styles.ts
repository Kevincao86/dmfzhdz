#!/usr/bin/env npx tsx
/**
 * AI 生成招募分享海报头图背景 + 二维码装饰框，写入小程序 assets/recruit-poster-bg/
 *
 * 用法（merchant-erp 目录）：
 *   npx tsx scripts/generate-mp-recruit-poster-styles.ts
 *   npx tsx scripts/generate-mp-recruit-poster-styles.ts --only sunset-v1
 *   npx tsx scripts/generate-mp-recruit-poster-styles.ts --skip-existing
 *
 * 生成后上传 OSS：
 *   bash scripts/upload-mp-recruit-poster-bg-oss.js
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAgentFreeformTextToImage } from '../vite-plugins/merchantAiUpstream.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, '灵祺达人撮合小程序/assets/recruit-poster-bg')

type StyleSpec = {
  id: string
  label: string
  platform: string
  tags: string[]
  method: string
  bgGradient: [string, string, string]
  decor: 'blobs' | 'streak' | 'dots' | 'stars'
  qrRingColor: string
  qrCenterColor: string
  qrFgColor: string
  qrBgColor: string
  outerBg: string
  heroPrompt: string
  qrPrompt: string
}

const STYLES: StyleSpec[] = [
  {
    id: 'sunset-v1',
    label: '暮光橙·美食达人',
    platform: '抖音',
    tags: ['美食'],
    method: '达人',
    bgGradient: ['#F97316', '#FB7185', '#FDA4AF'],
    decor: 'streak',
    qrRingColor: '#EA580C',
    qrCenterColor: '#F97316',
    qrFgColor: '#431407',
    qrBgColor: '#FFF7ED',
    outerBg: '#FFF7ED',
    heroPrompt:
      '宽横幅招募海报头图背景，横向比例约5:2，无任何文字、无水印、无二维码。' +
      '主题：抖音平台美食达人探店招募。' +
      '画面：暖橙到珊瑚粉渐变，精致美食元素（火锅蒸汽、甜点、咖啡杯）以半透明剪影点缀，' +
      '现代扁平插画结合轻3D光晕，左上预留圆形平台logo空白区，中央大留白供标题，底部预留胶囊标签区。' +
      '气质：年轻、食欲感、高级小程序分享海报。',
    qrPrompt:
      '正方形二维码装饰边框插画，中心留纯白色正方形空白区占72%面积（用于放置真实二维码），四角大圆角。' +
      '主题：暖橙色美食达人风，细线描边+柔光晕，外圈有轻微美食小图标装饰（碗、筷子剪影）。' +
      '禁止：真实二维码图案、可读文字、人脸。背景纯白或透明感，适合叠加在海报右下角。',
  },
  {
    id: 'aurora-v1',
    label: '极光紫·生活记录',
    platform: '小红书',
    tags: ['生活'],
    method: '达人',
    bgGradient: ['#6366F1', '#8B5CF6', '#C084FC'],
    decor: 'blobs',
    qrRingColor: '#6366F1',
    qrCenterColor: '#7C3AED',
    qrFgColor: '#312E81',
    qrBgColor: '#EEF2FF',
    outerBg: '#EEF2FF',
    heroPrompt:
      '宽横幅招募海报头图背景，横向5:2，无文字无水印。' +
      '主题：小红书生活记录类达人招募。' +
      '画面：极光紫到薰衣草渐变，生活美学元素（咖啡、书本、绿植、胶片相机）抽象剪影，' +
      '柔和blob光斑，INS风精致感，左上预留logo位，中央留白标题区，底部标签区。' +
      '禁止：真实品牌logo、二维码、人脸特写。',
    qrPrompt:
      '正方形二维码装饰边框，中心72%纯白留空，四角圆角。' +
      '极光紫生活美学风，细紫线框+星点光晕，外圈有相机、叶子小装饰。' +
      '禁止真实二维码与文字。',
  },
  {
    id: 'mint-v1',
    label: '清新绿·探店拍摄',
    platform: '抖音',
    tags: ['美食', '生活'],
    method: '拍摄',
    bgGradient: ['#059669', '#14B8A6', '#22D3EE'],
    decor: 'dots',
    qrRingColor: '#0D9488',
    qrCenterColor: '#14B8A6',
    qrFgColor: '#064E3B',
    qrBgColor: '#ECFDF5',
    outerBg: '#ECFDF5',
    heroPrompt:
      '宽横幅招募海报头图背景，5:2，无文字。' +
      '主题：抖音探店拍摄招募，美食+生活标签。' +
      '画面：清新薄荷绿到青蓝渐变，城市街景与相机镜头光圈抽象图形，' +
      '探店氛围，圆点装饰，左上logo位，中央标题留白，底部标签区。' +
      '禁止：二维码、可读文字、真实人脸。',
    qrPrompt:
      '正方形二维码装饰边框，中心72%纯白留空。清新绿色探店拍摄风，' +
      '相机光圈与定位针小装饰，细线描边。禁止真实二维码与文字。',
  },
  {
    id: 'night-v1',
    label: '星空蓝·云剪辑',
    platform: '抖音',
    tags: ['影视'],
    method: '剪辑',
    bgGradient: ['#0F172A', '#1E3A8A', '#4338CA'],
    decor: 'stars',
    qrRingColor: '#6366F1',
    qrCenterColor: '#818CF8',
    qrFgColor: '#1E1B4B',
    qrBgColor: '#E0E7FF',
    outerBg: '#E2E8F0',
    heroPrompt:
      '宽横幅招募海报头图背景，5:2，无文字。' +
      '主题：短视频云剪辑达人招募。' +
      '画面：深邃星空蓝到靛紫渐变，时间轴、播放键、剪辑轨道抽象图形，' +
      '科技霓虹点缀，星点装饰，左上logo位，中央标题留白。' +
      '禁止：二维码、文字、人脸。',
    qrPrompt:
      '正方形二维码装饰边框，中心72%浅紫白留空。星空蓝剪辑风，' +
      '播放键与时间轴小装饰，霓虹细线框。禁止真实二维码与文字。',
  },
  {
    id: 'rose-v1',
    label: '绯红韵·小红书达人',
    platform: '小红书',
    tags: ['美妆', '时尚'],
    method: '达人',
    bgGradient: ['#FE2C55', '#FB7185', '#FECDD3'],
    decor: 'blobs',
    qrRingColor: '#E11D48',
    qrCenterColor: '#FE2C55',
    qrFgColor: '#881337',
    qrBgColor: '#FFF1F2',
    outerBg: '#FFF1F2',
    heroPrompt:
      '宽横幅招募海报头图背景，5:2，无文字。' +
      '主题：小红书美妆时尚达人招募。' +
      '画面：绯红到玫瑰粉渐变，口红、香水瓶、丝带抽象剪影，' +
      '高级女性向美妆质感，左上logo位，中央标题留白，底部标签区。' +
      '禁止：二维码、可读文字、真实品牌logo。',
    qrPrompt:
      '正方形二维码装饰边框，中心72%淡粉白留空。小红书美妆风，' +
      '玫瑰花瓣与丝带装饰，细红金线框。禁止真实二维码与文字。',
  },
  {
    id: 'gold-v1',
    label: '金辉宴·美食探店',
    platform: '大众点评',
    tags: ['美食'],
    method: '拍摄',
    bgGradient: ['#D97706', '#F59E0B', '#FDE68A'],
    decor: 'streak',
    qrRingColor: '#B45309',
    qrCenterColor: '#D97706',
    qrFgColor: '#78350F',
    qrBgColor: '#FFFBEB',
    outerBg: '#FFFBEB',
    heroPrompt:
      '宽横幅招募海报头图背景，5:2，无文字。' +
      '主题：大众点评美食探店拍摄招募。' +
      '画面：金橙到琥珀渐变，精致餐桌、星级、美食 platter 抽象剪影，' +
      '轻奢餐饮质感，左上logo位，中央标题留白。' +
      '禁止：二维码、文字、具体餐厅名。',
    qrPrompt:
      '正方形二维码装饰边框，中心72%暖白留空。金辉美食探店风，' +
      '星级与餐具小装饰，金色细线框。禁止真实二维码与文字。',
  },
]

function loadEnvFile(rel: string): Record<string, string> {
  const p = path.join(path.resolve(__dirname, '..'), rel)
  if (!fs.existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function saveAsWebp(buf: Buffer, dest: string): Promise<void> {
  const tmp = dest.replace(/\.webp$/i, '.png')
  fs.writeFileSync(tmp, buf)
  try {
    const { execSync } = await import('node:child_process')
    execSync(`sips -s format webp "${tmp}" --out "${dest}"`, { stdio: 'pipe' })
    fs.unlinkSync(tmp)
  } catch {
    fs.renameSync(tmp, dest.replace(/\.webp$/i, '.png'))
    console.warn(`  webp 转换失败，保留 PNG：${dest.replace(/\.webp$/i, '.png')}`)
  }
}

async function generateOne(
  env: Record<string, string>,
  prompt: string,
  vendor?: 'qwen' | 'doubao' | 'minimax',
): Promise<string> {
  const out = await runAgentFreeformTextToImage(env, prompt, vendor, { exactPrompt: true })
  if (!out.ok) throw new Error(out.message)
  console.log(`    ✓ ${out.vendorUsed}`)
  return out.imageUrl
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const onlyId = args.includes('--only') ? args[args.indexOf('--only') + 1] : ''
  const skipExisting = args.includes('--skip-existing')

  const env = {
    ...loadEnvFile('.env.local'),
    ...loadEnvFile('.env.merchant'),
    ...process.env,
  } as Record<string, string>

  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  const minimaxKey = (env.MERCHANT_AI_MINIMAX_KEY ?? env.MINIMAX_API_KEY ?? '').trim()
  if (!qwenKey && !doubaoKey && !minimaxKey) {
    console.error('FAIL: 缺少 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY / MERCHANT_AI_MINIMAX_KEY')
    process.exit(1)
  }
  const preferredVendor: 'qwen' | 'doubao' | 'minimax' | undefined = qwenKey
    ? 'qwen'
    : doubaoKey
      ? 'doubao'
      : minimaxKey
        ? 'minimax'
        : undefined

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const list = onlyId ? STYLES.filter((s) => s.id === onlyId) : STYLES
  if (!list.length) {
    console.error(`未找到样式：${onlyId}`)
    process.exit(1)
  }

  const manifest: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    styles: [] as unknown[],
  }

  for (const style of list) {
    const heroFile = path.join(OUT_DIR, `style-${style.id}.webp`)
    const qrFile = path.join(OUT_DIR, `qr-frame-${style.id}.webp`)
    const heroExists = fs.existsSync(heroFile) || fs.existsSync(heroFile.replace('.webp', '.png'))
    const qrExists = fs.existsSync(qrFile) || fs.existsSync(qrFile.replace('.webp', '.png'))

    console.log(`\n[${style.id}] ${style.label}（${style.platform} · ${style.method} · ${style.tags.join('/')}）`)

    if (!skipExisting || !heroExists) {
      console.log('  → 生成头图背景…')
      const url = await generateOne(env, style.heroPrompt, preferredVendor)
      const buf = await downloadImage(url)
      await saveAsWebp(buf, heroFile)
      console.log(`  → 已保存 ${path.basename(heroFile)}`)
      await sleep(1200)
    } else {
      console.log('  → 跳过头图（已存在）')
    }

    if (!skipExisting || !qrExists) {
      console.log('  → 生成二维码装饰框…')
      const url = await generateOne(env, style.qrPrompt, preferredVendor)
      const buf = await downloadImage(url)
      await saveAsWebp(buf, qrFile)
      console.log(`  → 已保存 ${path.basename(qrFile)}`)
      await sleep(1200)
    } else {
      console.log('  → 跳过 QR 框（已存在）')
    }

    ;(manifest.styles as unknown[]).push({
      id: style.id,
      label: style.label,
      platform: style.platform,
      tags: style.tags,
      method: style.method,
      heroFile: `style-${style.id}.webp`,
      qrFrameFile: `qr-frame-${style.id}.webp`,
    })
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n完成 ${list.length} 套样式 → ${OUT_DIR}`)
  console.log('上传 OSS：bash scripts/upload-mp-recruit-poster-bg-oss.js')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
