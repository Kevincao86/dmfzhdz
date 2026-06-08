const MAX_DATA_URL_LEN = 120000

export function compressCoverFileToDataUrl(file: File, maxDim = 750, startQuality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      const scale = Math.min(1, maxDim / Math.max(w, h, 1))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('图片处理失败'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      let q = startQuality
      let dataUrl = canvas.toDataURL('image/jpeg', q)
      while (dataUrl.length > MAX_DATA_URL_LEN && q > 0.32) {
        q -= 0.08
        dataUrl = canvas.toDataURL('image/jpeg', q)
      }
      if (dataUrl.length > MAX_DATA_URL_LEN) {
        reject(new Error('封面图过大，请换一张更小的图片'))
        return
      }
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('读取图片失败'))
    }
    img.src = url
  })
}

export async function pickCoverImageDataUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('未选择图片'))
        return
      }
      try {
        resolve(await compressCoverFileToDataUrl(file))
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}
