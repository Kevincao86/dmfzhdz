/** 成片后处理 ffmpeg drawtext：hook 大字（前 4 秒） */
export function escapeFfmpegDrawtext(text: string): string {
  return String(text)
    .slice(0, 36)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
}

export function hookTitleDrawtextFilter(vLabel: string, hookTitle: string, fontFilePath?: string): string {
  const t = escapeFfmpegDrawtext(hookTitle)
  const fontOpt = fontFilePath
    ? `:fontfile='${fontFilePath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
    : ''
  return `[${vLabel}]drawtext=text='${t}'${fontOpt}:fontsize=52:fontcolor=yellow:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.10:enable='between(t\\,0\\,4.2)'[vhook]`
}

export function assForceStyleForSubtitle(subtitleStyle: string): string {
  switch (subtitleStyle) {
    case 'top-minimal':
      return 'FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=8,MarginV=48'
    case 'top-news':
      return 'FontSize=22,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=8,MarginV=40,BackColour=&H80000000'
    case 'bottom-yellow':
      return 'FontSize=24,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=56'
    case 'bottom-white-large':
      return 'FontSize=30,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=72'
    case 'bottom-pink':
      return 'FontSize=26,PrimaryColour=&H00FF99FF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=60'
    case 'bottom-green':
      return 'FontSize=24,PrimaryColour=&H0000FF88,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=56'
    case 'center-white':
      return 'FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=5,MarginV=0'
    case 'cinematic':
      return 'FontSize=18,PrimaryColour=&H00E0E0E0,OutlineColour=&H40000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=88'
    case 'bottom-white':
    default:
      return 'FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=56'
  }
}

/** 成片后处理 ffmpeg zoompan：按手势预设生成轻微镜头运动 */
export function subtleMotionFilterForGesture(gesturePreset: string, vLabel: string): string {
  const id = String(gesturePreset || 'emphasis').trim() || 'emphasis'
  const tail =
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1'
  const base = `s=1080x1920:fps=30,${tail}[vzoom]`
  switch (id) {
    case 'point':
      return `[${vLabel}]zoompan=z='min(zoom+0.00035,1.04)':x='iw/2-(iw/zoom/2)+on*0.55':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'welcome':
      return `[${vLabel}]zoompan=z='if(lte(zoom,1.0),1.05,max(1,zoom-0.00038))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'explain':
      return `[${vLabel}]zoompan=z='min(zoom+0.00028,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'nod':
      return `[${vLabel}]zoompan=z='1.02':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+sin(on*0.2)*6':d=1:${base}`
    case 'thumbs':
      return `[${vLabel}]zoompan=z='1.03+0.015*sin(on*0.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'celebrate':
      return `[${vLabel}]zoompan=z='min(zoom+0.00055,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
    case 'emphasis':
    default:
      return `[${vLabel}]zoompan=z='min(zoom+0.00045,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:${base}`
  }
}
