import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 为什么用 @ 别名：页面与 mock 层之间的相对路径会随目录深度变化，
// 统一成 @/xxx 后，各页面文件搬动不影响 import（见 #2 工程约定）。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // DSH 的 write/edit 工具以「同目录临时目录 + rename」落盘，Vite 的文件监听会 EBUSY 崩溃；
    // 忽略这些临时目录（以及 .tmp），监听只关心真正的源码文件。
    watch: { ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/.tmp/**'] },
  },
})
