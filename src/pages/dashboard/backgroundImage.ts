// 上传背景的「只重编码、不取色」管线（#6 Q7；取色算法已被 #14 定案删除）。
// 为什么必须重编码：原图读成 dataURL 动辄 2MB，localStorage 总量约 5MiB，一份背景就能顶爆配额；
// 而演示要求「刷新后背景保持」，所以存进去的必须是压小的 WebP。
// 怎么运行：createImageBitmap 解码 → 按长边等比缩到 ≤1600 → canvas.toBlob('image/webp', q)，
// 依次试 (1600,0.82)/(1600,0.6)/(1280,0.45)/(1024,0.4)，第一个 <400KB 的就返回；
// 解码失败返回 null，调用方静默保留当前背景、不弹框（01-06：原五级降级只剩「解码失败」一级）。
const TARGET_BYTES = 400 * 1024
const ATTEMPTS: Array<[edge: number, quality: number]> = [
  [1600, 0.82],
  [1600, 0.6],
  [1280, 0.45],
  [1024, 0.4],
]

export interface EncodedImage {
  dataUrl: string
  bytes: number
  /** 实际命中的长边（验收时用于确认 ≤1600） */
  edge: number
  quality: number
}

function canvasToWebp(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  // 先缩到目标尺寸再编码：直接对大图调 toBlob 会先占一大块 canvas 内存，低端机容易卡。
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function encodeBackgroundImage(file: File): Promise<EncodedImage | null> {
  // 非图片先挡掉：避免 createImageBitmap 抛错进控制台（GL-29 要求 console 无报错）。
  if (!file.type.startsWith('image/')) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    let best: EncodedImage | null = null
    for (const [edge, quality] of ATTEMPTS) {
      let blob: Blob | null = null
      try {
        blob = await canvasToWebp(bitmap, edge, quality)
      } catch {
        continue
      }
      if (!blob) continue
      const dataUrl = await blobToDataUrl(blob)
      const candidate: EncodedImage = { dataUrl, bytes: blob.size, edge, quality }
      if (!best || candidate.bytes < best.bytes) best = candidate
      if (blob.size <= TARGET_BYTES) return candidate
    }
    // 极端纹理（满屏噪点照片）到 1024/q0.4 仍可能略超 400KB：
    // 返回体积最小的一档保证配置存得下，而不是把「目标值」升级成错误弹框（01-06 静默回退）。
    return best
  } finally {
    bitmap.close()
  }
}
