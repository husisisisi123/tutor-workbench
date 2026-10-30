// 背景预设（#6 定案：4 套纯 CSS 渐变、零位图、零计算；#14 后不再「绑手调色板」，
// 预设只负责背景本身，不驱动中性层染色）。上传图走 image 态，只存重编码后的 dataURL。
export interface BackgroundPreset {
  id: string
  name: string
  gradient: string
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'fog-teal', name: '雾青', gradient: 'linear-gradient(135deg, #DCEEE9 0%, #C7E3DD 48%, #EAF4F1 100%)' },
  { id: 'ink-blue', name: '墨蓝', gradient: 'linear-gradient(135deg, #DCE5F2 0%, #C4D3E7 48%, #EDF2F9 100%)' },
  { id: 'warm-sand', name: '暖沙', gradient: 'linear-gradient(135deg, #F4E9DB 0%, #E8D5C1 48%, #F9F2E9 100%)' },
  { id: 'stone-cyan', name: '石青', gradient: 'linear-gradient(135deg, #DDE7E4 0%, #C5D5D1 48%, #EEF4F2 100%)' },
]

/** 看板背景样式：default 落回雾青；preset 取渐变；image 用作 background-image。 */
export function backgroundCss(background: { kind: string; presetId?: string; imageDataUrl?: string }): string {
  if (background.kind === 'image' && background.imageDataUrl) {
    return 'url(' + background.imageDataUrl + ') center / cover no-repeat'
  }
  if (background.kind === 'default') return 'linear-gradient(180deg, #F8FAFC 0%, #F8FAFC 100%)'
  const preset = BACKGROUND_PRESETS.find((p) => p.id === background.presetId) ?? BACKGROUND_PRESETS[0]
  return preset.gradient
}
