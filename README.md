# tutor-workbench · 托管教师工作台前端 Demo

纯前端 + mock 的托管教务系统教师端 Demo。决策来源：GitHub 票面（默认工作区 repo）+ 本仓外的
`docs/acceptance/DEMO-CHECKLIST.md`（验收清单 v3）与 `docs/design-system/MASTER-REACT.md`（设计施工图）。

## 运行

依赖用 pnpm 安装（已锁 node_modules 为 hoisted 布局，见 `.npmrc`）：

```bash
pnpm install --ignore-scripts
pnpm run dev    # http://127.0.0.1:5173
pnpm run build  # tsc --noEmit && vite build
```

> 本机沙箱限制：安装脚本（esbuild postinstall）不能跑，所以用 `--ignore-scripts`；
> esbuild 的可执行文件由可选依赖 `@esbuild/win32-x64` 提供，Vite 构建正常。

## 技术栈

React 19 + Vite 7 + TypeScript（strict）+ Ant Design 5 + react-router-dom（hash）+ Zustand + ECharts 5。
设计 token：`src/theme/tokens.ts` 单一来源 → `cssVars.ts` 写 `:root` 的 `--color-*`（camelCase）+ `antdTheme.ts` 喂 AntD。

## 目录

```
src/
  types.ts            领域模型（10 张 mock 表）
  mock/seed.ts        固定种子生成器（数据可复现）
  mock/db.ts          内存态 + 两个 localStorage 键（twb:v1:dashboard / twb:v1:seat）
  mock/api.ts         异步门面（页面只依赖它）
  theme/ tokens / cssVars / antdTheme
  layout/AppLayout.tsx 五页导航壳
  pages/              dashboard / feedback / students / mistakes / growth
  components/         共享件（StudentAvatar/PageHeader/EmptyState/StatusTag/MistakeCard/Chart）
```

## 约定

- 颜色只用 `var(--color-*)` 或 `tokens.ts`，不写裸 hex（DS-1）。
- 注释按 `CODING_STANDARDS.md`：写清「为什么这么做」与「怎么运行」。
- 「刷新回种子」是预期行为；只有看板配置与座位落 localStorage。
- #14 定案：P1 背景自定义**不染色**，上传图只重编码存储，不做取色。
