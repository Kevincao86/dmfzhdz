/** 批量 ICE 素材上传并发池（浏览器侧限流，避免串行 N 倍耗时） */

/** 视频 OSS 直传/回退：4 路并行 */
export const ICE_VIDEO_UPLOAD_CONCURRENCY = 4

/** 图片经 ECS 压缩+写入：3 路并行 */
export const ICE_IMAGE_UPLOAD_CONCURRENCY = 3

/**
 * 固定并发 worker 池；按输入顺序返回结果（失败项由 worker 自行处理）。
 */
export async function runIceUploadPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers = Math.min(Math.max(1, concurrency), items.length)

  async function runWorker(): Promise<void> {
    for (;;) {
      const i = nextIndex
      nextIndex += 1
      if (i >= items.length) return
      results[i] = await worker(items[i]!, i)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => runWorker()))
  return results
}
