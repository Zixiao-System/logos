import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 将 mdui- 开头的标签视为自定义元素
          isCustomElement: (tag) => tag.startsWith('mdui-')
        }
      }
    }),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
              sourcemap: true,
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'node-pty']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    // 排除 WASM 模块从预优化，确保其正确加载
    exclude: ['logos-wasm']
  },
  build: {
      sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 将 WASM 语言服务单独分块
        manualChunks: {
          'lang-wasm': ['logos-wasm']
        }
      }
    }
  },
  // 确保 .wasm 文件被正确处理
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5173,
    strictPort: true
  }
})
