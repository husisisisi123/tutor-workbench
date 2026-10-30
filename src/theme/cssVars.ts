import { tokens } from './tokens'

// 把 tokens.color 的 camelCase 键映射成 --color-* 变量写进 :root。
// 为什么运行时写而不是在 css 里手抄：token 只允许一份（DS-1），
// 手抄两处迟早分叉出现两种 teal（#9 核对项 1 的反例）。
export function applyCssVars() {
  const root = document.documentElement
  for (const [key, value] of Object.entries(tokens.color)) {
    // 变量名保持 camelCase（--color-bgLayout），与全站 var(--color-xxx) 调用一致；
    // CSS 自定义属性区分大小写，转 kebab 会导致所有 var() 取不到值（p2 本轮发现的 bug）。
    root.style.setProperty('--color-' + key, value)
  }
  root.style.setProperty('--font-family', tokens.font.family)
  root.style.setProperty('--font-family-code', tokens.font.code)
  root.style.setProperty('--radius-base', tokens.radius.base + 'px')
  root.style.setProperty('--shadow-card', tokens.shadow.card)
  root.style.setProperty('--shadow-popup', tokens.shadow.popup)
}
