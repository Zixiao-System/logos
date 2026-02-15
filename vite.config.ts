import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import monacoEditor from 'vite-plugin-monaco-editor'
import { resolve } from 'path'

const isCI = Boolean(process.env.CI) || process.env.GITHUB_ACTIONS === 'true'
const sentryPlugin = isCI
  ? sentryVitePlugin({
      org: "zixiao-labs",
      project: "logos"
    })
  : null

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
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'shared')
          }
        },
        build: {
            sourcemap: true,
          outDir: 'dist-electron',
          rollupOptions: {
            external: ['electron', 'node-pty', 'ssh2']
          }
        }
      }
    },
    {
      entry: 'electron/extension-host.ts',
      vite: {
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'shared')
          }
        },
        build: {
          sourcemap: true,
          outDir: 'dist-electron'
        }
      }
    },
    {
      entry: 'electron/preload.ts',
      onstart: (options) => {
        options.reload()
      },
      vite: {
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'shared')
          }
        },
        build: {
            sourcemap: true,
          outDir: 'dist-electron'
        }
      }
    }
  ]), renderer(), sentryPlugin].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared')
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
