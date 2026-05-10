/**
 * 浏览器端将多段 MP4（同源网关拉取的 blob）拼接为一段 MP4。
 * 优先 stream copy；失败时回退为 mpeg4 重编码（体积可能变大）。
 */
export async function concatVideoSegmentsToMp4(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('没有可拼接的视频片段')
  if (blobs.length === 1) return blobs[0]

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  for (let i = 0; i < blobs.length; i++) {
    await ffmpeg.writeFile(`c${i}.mp4`, await fetchFile(blobs[i]))
  }
  const listTxt = blobs.map((_, i) => `file 'c${i}.mp4'`).join('\n')
  await ffmpeg.writeFile('files.txt', listTxt)
  const outName = 'out.mp4'
  try {
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'files.txt', '-c', 'copy', outName])
  } catch {
    await ffmpeg.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'files.txt',
      '-c:v',
      'mpeg4',
      '-q:v',
      '6',
      '-pix_fmt',
      'yuv420p',
      '-an',
      outName,
    ])
  }
  const raw = await ffmpeg.readFile(outName)
  if (!(raw instanceof Uint8Array)) throw new Error('拼接输出读取异常')
  const copy = new Uint8Array(raw.length)
  copy.set(raw)
  return new Blob([copy], { type: 'video/mp4' })
}
