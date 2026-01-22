import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import monacoEditor from 'vite-plugin-monaco-editor'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        // 将 mdui- 开头的标签视为自定义元素
        isCustomElement: (tag) => tag.startsWith('mdui-')
      }
    }
  }), monacoEditor({
    languageWorkers: ['editorWorkerService', 'css', 'html', 'json', 'typescript']
  }), electron([
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
            sourcemap: true,
          outDir: 'dist-electron'
        }
      }
    }
  ]), renderer(), sentryVitePlugin({
    org: "zixiao-technologies",
    project: "logos"
  }), sentryVitePlugin({
    org: "zixiao-technologies",
    project: "logos"
  })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
      sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
})