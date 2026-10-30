import type { ThemeConfig } from 'antd'
import { theme } from 'antd'
import { tokens } from './tokens'

// AntD 5 三层：seed → map → alias。seed 名会被算法重算，map/alias 名会被原样钉死，
// 所以结构量写 seed，派生色显式钉 map（见 MASTER-REACT §4；colorPrimaryText 默认=主色，必须覆盖）。
export const antdTheme: ThemeConfig = {
  cssVar: true,
  hashed: false,
  algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
  token: {
    colorPrimary: tokens.color.primary,
    colorError: tokens.color.error,
    colorWarning: tokens.color.warning,
    colorSuccess: tokens.color.success,
    colorLink: tokens.color.primaryText,
    fontFamily: tokens.font.family,
    fontSize: tokens.font.sizes.base,
    borderRadius: tokens.radius.base,
    controlHeight: tokens.size.controlHeight,
    controlHeightSM: tokens.size.controlHeightSM,
    sizeUnit: 4,
    sizeStep: 4,
    colorPrimaryHover: tokens.color.primaryHover,
    colorPrimaryActive: tokens.color.primaryActive,
    colorPrimaryBg: tokens.color.primaryBg,
    colorPrimaryText: tokens.color.primaryText,
    colorPrimaryTextHover: tokens.color.primaryTextHover,
    colorPrimaryTextActive: tokens.color.primaryTextActive,
    colorBgLayout: tokens.color.bgLayout,
    colorBgContainer: tokens.color.bgContainer,
    colorBgElevated: tokens.color.bgElevated,
    colorBorder: tokens.color.border,
    colorBorderSecondary: tokens.color.borderSecondary,
    colorText: tokens.color.text,
    colorTextSecondary: tokens.color.textSecondary,
    colorTextTertiary: tokens.color.textTertiary,
    colorTextQuaternary: tokens.color.textQuaternary,
  },
  components: {
    Layout: {
      headerBg: tokens.color.bgContainer,
      siderBg: tokens.color.bgContainer,
      bodyBg: tokens.color.bgLayout,
      triggerBg: tokens.color.bgHover,
    },
    Menu: {
      darkItemBg: tokens.color.bgContainer,
      darkPopupBg: tokens.color.bgContainer,
      darkSubMenuItemBg: tokens.color.bgHover,
    },
    Rate: { starColor: tokens.color.amber },
    Table: { headerBg: tokens.color.bgHover },
  },
}
