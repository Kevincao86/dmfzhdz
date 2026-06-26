/** 成片后处理样式（无 DOM，可供 Node ffmpeg 与浏览器共用） */

const SUBTITLE_SIDE_MARGIN = 'MarginL=48,MarginR=48'

export function assForceStyleForSubtitle(subtitleStyle: string): string {
  switch (subtitleStyle) {
    case 'top-minimal':
      return `FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=8,MarginV=48,${SUBTITLE_SIDE_MARGIN}`
    case 'top-news':
      return `FontSize=22,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=8,MarginV=40,BackColour=&H80000000,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-yellow':
      return `FontSize=22,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=100,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-white-large':
      return `FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=120,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-pink':
      return `FontSize=22,PrimaryColour=&H00FF99FF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=100,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-green':
      return `FontSize=22,PrimaryColour=&H0000FF88,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=100,${SUBTITLE_SIDE_MARGIN}`
    case 'center-white':
      return `FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=5,MarginV=0,${SUBTITLE_SIDE_MARGIN}`
    case 'cinematic':
      return `FontSize=18,PrimaryColour=&H00E0E0E0,OutlineColour=&H40000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=88,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-safe':
      /** 竖屏 9:16 安全区：小字、高边距，避免出屏 */
      return `FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=150,${SUBTITLE_SIDE_MARGIN}`
    case 'bottom-white':
    default:
      return `FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=100,${SUBTITLE_SIDE_MARGIN}`
  }
}

/** 竖屏成片字幕烧录前统一规范为 1080×1920，避免口型模型输出比例不一致导致字幕出屏 */
export function verticalPadFilterForSubtitles(vLabel: string, outLabel = 'vpad'): string {
  return `[${vLabel}]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[${outLabel}]`
}

const KNOWN_SUBTITLE_STYLE_IDS = new Set([
  'bottom-safe',
  'bottom-white',
  'bottom-white-large',
  'bottom-yellow',
  'bottom-pink',
  'bottom-green',
  'center-white',
  'top-minimal',
  'top-news',
  'cinematic',
])

/** 尊重用户在步骤 3 选择的字幕样式（全部 10 种均可烧录） */
export function resolveDhSubtitleStyleForBurn(subtitleStyle: string): string {
  const id = String(subtitleStyle || '').trim()
  if (KNOWN_SUBTITLE_STYLE_IDS.has(id)) return id
  return 'bottom-safe'
}

/** 成片后处理 ffmpeg zoompan：按手势预设生成镜头运动（口型模型无肢体动作，此处补偿） */
export function subtleMotionFilterForGesture(gesturePreset: string, vLabel: string): string {
  const id = String(gesturePreset || 'emphasis').trim() || 'emphasis'
  const tail =
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1'
  const base = `s=1080x1920:fps=30,${tail}[vzoom]`
  switch (id) {
    case 'point':
      return `[${vLabel}]zoompan=z='min(zoom+0.00055,1.06)':x='iw/2-(iw/zoom/2)+on*1.1':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'welcome':
      return `[${vLabel}]zoompan=z='if(lte(zoom,1.0),1.08,max(1,zoom-0.00055))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'explain':
      return `[${vLabel}]zoompan=z='min(zoom+0.00042,1.05)':x='iw/2-(iw/zoom/2)+sin(on*0.08)*8':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'nod':
      return `[${vLabel}]zoompan=z='1.03':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+sin(on*0.25)*10':d=1:${base}`
    case 'thumbs':
      return `[${vLabel}]zoompan=z='1.04+0.022*sin(on*0.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'celebrate':
      return `[${vLabel}]zoompan=z='min(zoom+0.00075,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'emphasis':
    default:
      return `[${vLabel}]zoompan=z='min(zoom+0.00065,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*0.35':d=1:${base}`
  }
}
