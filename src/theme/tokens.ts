// 设计系统 token 的**唯一来源**（对应 docs/design-system/MASTER-REACT.md §1~§3，决策见 #9/#14）。
// 数据流：本文件 → cssVars.ts 写 :root 的 --color-* → 组件用 var(--color-*)；
// 同时 → antdTheme.ts 映射进 ConfigProvider.token。两路同源，改这里即全站生效。
// 禁止在组件里写裸 hex；需要颜色时引用 var(--color-*)（核对项 DS-1）。
export const tokens = {
  color: {
    // 主色一色两档：填充用 primary，文字/链接用 primaryText（#9 Q1）
    primary: '#0D9488',
    primaryHover: '#14A89B',
    primaryActive: '#0B8C80',
    primaryText: '#0F766E',
    primaryTextHover: '#115E59',
    primaryTextActive: '#0D9488',
    primaryBg: '#CCFBF1',
    onPrimary: '#0B1220',
    // 语义色：填充 / 文字两档（#9 Q2）
    error: '#DC2626',
    errorText: '#B91C1C',
    errorBg: '#FEE2E2',
    onError: '#FFFFFF',
    warning: '#D97706',
    warningText: '#B45309',
    warningBg: '#FEF3C7',
    onWarning: '#0B1220',
    success: '#16A34A',
    successText: '#15803D',
    successBg: '#DCFCE7',
    onSuccess: '#0B1220',
    // 中性层四档：终值，不跟背景染色（#8/#14 定案）
    bgLayout: '#F8FAFC',
    bgContainer: '#FFFFFF',
    bgElevated: '#FFFFFF',
    bgHover: '#F1F5F9',
    border: '#E2E8F0',
    borderSecondary: '#EEF2F6',
    borderStrong: '#CBD5E1',
    // 文字
    foreground: '#134E4A',
    text: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#5E6E86',
    textQuaternary: '#94A3B8',
    // 非文字（SC 1.4.11 要 3:1 的那些）
    icon: '#5E6E86',
    focusRing: '#115E59',
    fillAccent: '#0D9488',
    // 琥珀强调（与 warning 撞色纪律见 MASTER §1.2）
    amber: '#D97706',
    onAmber: '#0B1220',
  },
  font: {
    // 栈里必须有显式中文字族名，结尾 sans-serif；否则部分环境中文落到宋体（#9 Q6）
    family:
      '"Fira Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", sans-serif',
    code: '"Fira Code", ui-monospace, SFMono-Regular, Consolas, monospace',
    sizes: { xs: 12, sm: 13, base: 14, md: 16, lg: 20, xl: 24, xxl: 32 },
    weights: { regular: 400, medium: 500, semibold: 600 },
  },
  space: [4, 8, 12, 16, 24, 32, 48],
  radius: { sm: 4, base: 6, lg: 8, xl: 12 },
  size: { controlHeight: 28, controlHeightSM: 24 },
  shadow: {
    card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
    popup: '0 8px 24px rgba(15, 23, 42, 0.12)',
  },
} as const

export type Tokens = typeof tokens
