import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/electron/renderer'
import App from './App.vue'
import router from './router'

// MDUI 样式和组件
import 'mdui/mdui.css'
import 'mdui'

// MDUI 图标 - 按需导入
import '@mdui/icons/home.js'
import '@mdui/icons/search.js'
import '@mdui/icons/settings.js'
import '@mdui/icons/folder.js'
import '@mdui/icons/folder-open.js'
import '@mdui/icons/terminal.js'
import '@mdui/icons/code.js'
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/dashboard.js'
import '@mdui/icons/notifications.js'
import '@mdui/icons/account-circle.js'
import '@mdui/icons/menu.js'
import '@mdui/icons/close.js'
import '@mdui/icons/add.js'
import '@mdui/icons/remove.js'
import '@mdui/icons/edit.js'
import '@mdui/icons/delete.js'
import '@mdui/icons/save.js'
import '@mdui/icons/undo.js'
import '@mdui/icons/redo.js'
import '@mdui/icons/content-copy.js'
import '@mdui/icons/content-paste.js'
import '@mdui/icons/content-cut.js'
import '@mdui/icons/check.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/cloud.js'
import '@mdui/icons/cloud-upload.js'
import '@mdui/icons/cloud-download.js'
import '@mdui/icons/sync.js'
import '@mdui/icons/build.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/source.js'
import '@mdui/icons/commit.js'
import '@mdui/icons/merge.js'
import '@mdui/icons/call-split.js'

// 更多图标 - 文件资源管理器
import '@mdui/icons/note-add.js'
import '@mdui/icons/create-new-folder.js'
import '@mdui/icons/unfold-less.js'
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/insert-drive-file.js'
import '@mdui/icons/description.js'
import '@mdui/icons/image.js'
import '@mdui/icons/data-object.js'
import '@mdui/icons/javascript.js'
import '@mdui/icons/html.js'
import '@mdui/icons/palette.js'
import '@mdui/icons/inventory.js'
import '@mdui/icons/lock.js'
import '@mdui/icons/vpn-key.js'
import '@mdui/icons/gavel.js'
import '@mdui/icons/menu-book.js'
import '@mdui/icons/sailing.js'
import '@mdui/icons/memory.js'
import '@mdui/icons/font-download.js'
import '@mdui/icons/storage.js'
import '@mdui/icons/article.js'
import '@mdui/icons/api.js'
import '@mdui/icons/widgets.js'
import '@mdui/icons/view-module.js'
import '@mdui/icons/handyman.js'
import '@mdui/icons/library-books.js'
import '@mdui/icons/science.js'
import '@mdui/icons/folder-special.js'
import '@mdui/icons/folder-zip.js'
import '@mdui/icons/folder-shared.js'
import '@mdui/icons/perm-media.js'
import '@mdui/icons/computer.js'
import '@mdui/icons/help-outline.js'
import '@mdui/icons/drive-file-rename-outline.js'

// 主题切换图标
import '@mdui/icons/dark-mode.js'
import '@mdui/icons/light-mode.js'

// 全局样式
import './styles/main.css'

import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 初始化主题
const themeStore = useThemeStore(pinia)
themeStore.initTheme()

// 初始化设置
const settingsStore = useSettingsStore(pinia)
settingsStore.init()

// 初始化 Sentry 渲染进程 (与主进程配合工作)
// 必须在 telemetry enable 之前初始化
Sentry.init({
  dsn: 'https://adc9e827519bec3b604975a644a3282a@o4510655959072768.ingest.us.sentry.io/4510655961563136',
  integrations: [
    Sentry.replayIntegration()
  ],
  // Session Replay 配置
  replaysSessionSampleRate: 0.1, // 10% 的会话采样率
  replaysOnErrorSampleRate: 1.0  // 错误时 100% 采样
})

// 同步遥测状态到主进程
if (settingsStore.isTelemetryEnabled && window.electronAPI?.telemetry) {
  window.electronAPI.telemetry.enable()
}

app.mount('#app')
