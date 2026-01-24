<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEditorStore } from '@/stores/editor'
import { useGitStore } from '@/stores/git'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useBottomPanelStore } from '@/stores/bottomPanel'
import { useIntelligenceStore } from '@/stores/intelligence'
import { FileExplorer } from '@/components/FileExplorer'
import { GitPanel } from '@/components/Git'
import { BottomPanel } from '@/components/BottomPanel'
import TodoPanel from '@/components/Analysis/TodoPanel.vue'
import CommitAnalysisPanel from '@/components/Analysis/CommitAnalysisPanel.vue'
import { FileHistoryPanel } from '@/components/GitLens/FileHistory'
import ExtensionsPanel from '@/components/Extensions/ExtensionsPanel.vue'
import TelemetryConsentDialog from '@/components/TelemetryConsentDialog.vue'
import LSPSetupDialog from '@/components/LSPSetupDialog.vue'
import FeedbackReportDialog from '@/components/FeedbackReportDialog.vue'
import NotificationContainer from '@/components/common/NotificationContainer.vue'
import { DebugSidebarPanel } from '@/components/Debug'
import { IntelligenceModeIndicator } from '@/components/StatusBar'
import { GitOperationIndicator } from '@/components/StatusBar'
import type { IndexingProgress, LanguageServerStatus } from '@/types/intelligence'

// 导入 MDUI 图标
import '@mdui/icons/folder.js'
import '@mdui/icons/source.js'
import '@mdui/icons/search.js'
import '@mdui/icons/terminal.js'
import '@mdui/icons/dashboard.js'
import '@mdui/icons/settings.js'
import '@mdui/icons/code.js'
import '@mdui/icons/close.js'
import '@mdui/icons/sync.js'
import '@mdui/icons/dark-mode.js'
import '@mdui/icons/light-mode.js'
import '@mdui/icons/hourglass-empty.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/error.js'
import '@mdui/icons/checklist.js'
import '@mdui/icons/analytics.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/history.js'
import '@mdui/icons/extension.js'


const router = useRouter()
const route = useRoute()
const editorStore = useEditorStore()
const gitStore = useGitStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const bottomPanelStore = useBottomPanelStore()
const intelligenceStore = useIntelligenceStore()

// 索引进度状态
const indexingProgress = ref<IndexingProgress | null>(null)
let unsubscribeProgress: (() => void) | null = null

// LSP 服务器状态
const lspServers = ref<LanguageServerStatus[]>([])
let unsubscribeLSPStatus: (() => void) | null = null

// 反馈对话框引用
const feedbackDialogRef = ref<InstanceType<typeof FeedbackReportDialog> | null>(null)

// 处理反馈快捷键 (Cmd/Ctrl + Shift + F)
const handleFeedbackShortcut = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifierKey = isMac ? event.metaKey : event.ctrlKey

  if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    feedbackDialogRef.value?.open()
  }
}

// 处理智能模式切换快捷键
// Ctrl/Cmd + Shift + I: 切换模式
// Ctrl/Cmd + Shift + B: 切换到 Basic Mode
// Ctrl/Cmd + Shift + M: 切换到 Smart Mode (避免与 Ctrl+Shift+S 保存冲突)
const handleIntelligenceModeShortcut = async (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifierKey = isMac ? event.metaKey : event.ctrlKey

  if (!modifierKey || !event.shiftKey) return

  const key = event.key.toLowerCase()

  if (key === 'i') {
    // 切换模式
    event.preventDefault()
    await intelligenceStore.toggleMode()
  } else if (key === 'b') {
    // 切换到 Basic Mode
    event.preventDefault()
    await intelligenceStore.setMode('basic')
  } else if (key === 'm') {
    // 切换到 Smart Mode
    event.preventDefault()
    await intelligenceStore.setMode('smart')
  }
}

// UI 状态
const sidebarOpen = ref(true)
const sidebarWidth = ref(260)
const activeSidebarPanel = ref<'explorer' | 'git' | 'search' | 'debug' | 'todos' | 'commitAnalysis' | 'fileHistory' | 'extensions'>('explorer')

// 导航项 (移除终端，改为底部面板)
const navItems = [
  { path: '/', icon: 'code', label: '编辑器', panel: 'explorer' as const },
  { path: '/devops', icon: 'dashboard', label: 'DevOps' },
  { path: '/settings', icon: 'settings', label: '设置' }
]

// 切换底部终端面板
const toggleTerminalPanel = () => {
  if (bottomPanelStore.activeTab === 'terminal' && bottomPanelStore.isVisible) {
    bottomPanelStore.setVisible(false)
  } else {
    bottomPanelStore.setActiveTab('terminal')
  }
}

// 侧边栏面板项
const panelItems = [
  { id: 'explorer' as const, icon: 'folder', label: '资源管理器' },
  { id: 'git' as const, icon: 'source', label: '源代码管理' },
  { id: 'search' as const, icon: 'search', label: '搜索' },
  { id: 'debug' as const, icon: 'bug-report', label: '运行和调试' },
  { id: 'todos' as const, icon: 'checklist', label: 'TODO' },
  { id: 'commitAnalysis' as const, icon: 'analytics', label: '提交分析' },
  { id: 'fileHistory' as const, icon: 'history', label: '文件历史' },
  { id: 'extensions' as const, icon: 'extension', label: '扩展' }
]

const currentRoute = computed(() => route.path)

// 状态栏信息
const statusBarInfo = computed(() => {
  const activeTab = editorStore.activeTab
  return {
    branch: gitStore.currentBranch || 'No branch',
    encoding: 'UTF-8',
    language: activeTab?.language || 'Plain Text',
    line: activeTab?.cursorPosition.line || 1,
    column: activeTab?.cursorPosition.column || 1
  }
})

const navigateTo = (path: string, panel?: 'explorer' | 'git' | 'search' | 'todos' | 'commitAnalysis') => {
  router.push(path)
  if (panel) {
    activeSidebarPanel.value = panel
    sidebarOpen.value = true
  }
}

const switchPanel = (panel: 'explorer' | 'git' | 'search' | 'debug' | 'todos' | 'commitAnalysis' | 'fileHistory' | 'extensions') => {
  if (activeSidebarPanel.value === panel && sidebarOpen.value) {
    sidebarOpen.value = false
  } else {
    activeSidebarPanel.value = panel
    sidebarOpen.value = true
  }
}

onMounted(async () => {
  // 注册反馈快捷键监听器
  window.addEventListener('keydown', handleFeedbackShortcut)
  // 注册智能模式切换快捷键监听器
  window.addEventListener('keydown', handleIntelligenceModeShortcut)

  // 从设置初始化智能模式
  await intelligenceStore.initFromSettings(settingsStore.lspMode)

  // 获取平台信息
  if (window.electronAPI) {
    const version = await window.electronAPI.getVersion()
    console.log('logos version:', version)

    // 如果用户之前同意了遥测，启用 Sentry
    if (settingsStore.telemetry.hasAsked && settingsStore.telemetry.enabled) {
      window.electronAPI.telemetry?.enable()
    }

    // 订阅索引进度
    unsubscribeProgress = window.electronAPI.intelligence.onIndexingProgress((progress) => {
      indexingProgress.value = progress
      // 同步到 intelligence store
      intelligenceStore.setIndexingProgress(progress)
    })

    // 订阅 LSP 服务器状态
    unsubscribeLSPStatus = window.electronAPI.intelligence.onLSPServerStatus((event) => {
      const index = lspServers.value.findIndex(s => s.language === event.languageId)
      const status: LanguageServerStatus = {
        language: event.languageId,
        status: event.status as 'starting' | 'ready' | 'error' | 'stopped',
        message: event.message
      }
      if (index >= 0) {
        lspServers.value[index] = status
      } else {
        lspServers.value.push(status)
      }
      // 同步到 intelligence store
      intelligenceStore.updateServerStatus(status)
    })

    // 获取初始服务状态
    try {
      const serviceStatus = await window.electronAPI.intelligence.getServiceStatus()
      lspServers.value = serviceStatus.servers
      // 同步到 intelligence store
      serviceStatus.servers.forEach(s => intelligenceStore.updateServerStatus(s))
    } catch {
      // 忽略初始化错误
    }
  }
})

onUnmounted(() => {
  // 移除反馈快捷键监听器
  window.removeEventListener('keydown', handleFeedbackShortcut)
  // 移除智能模式切换快捷键监听器
  window.removeEventListener('keydown', handleIntelligenceModeShortcut)

  if (unsubscribeProgress) {
    unsubscribeProgress()
  }
  if (unsubscribeLSPStatus) {
    unsubscribeLSPStatus()
  }
})
</script>

<template>
  <div class="app-layout">
    <!-- 活动栏 (最左侧图标栏) -->
    <div class="activity-bar">
      <!-- 面板切换按钮 -->
      <div class="activity-bar-top">
        <mdui-button-icon
          v-for="panel in panelItems"
          :key="panel.id"
          :class="{ active: activeSidebarPanel === panel.id && sidebarOpen }"
          @click="switchPanel(panel.id)"
          :title="panel.label"
        >
          <mdui-icon-folder v-if="panel.icon === 'folder'"></mdui-icon-folder>
          <mdui-icon-source v-else-if="panel.icon === 'source'"></mdui-icon-source>
          <mdui-icon-search v-else-if="panel.icon === 'search'"></mdui-icon-search>
          <mdui-icon-bug-report v-else-if="panel.icon === 'bug-report'"></mdui-icon-bug-report>
          <mdui-icon-checklist v-else-if="panel.icon === 'checklist'"></mdui-icon-checklist>
          <mdui-icon-analytics v-else-if="panel.icon === 'analytics'"></mdui-icon-analytics>
          <mdui-icon-history v-else-if="panel.icon === 'history'"></mdui-icon-history>
          <mdui-icon-extension v-else-if="panel.icon === 'extension'"></mdui-icon-extension>
        </mdui-button-icon>
      </div>

      <!-- 底部导航 -->
      <div class="activity-bar-bottom">
        <!-- 终端切换按钮 -->
        <mdui-button-icon
          :class="{ active: bottomPanelStore.isVisible && bottomPanelStore.activeTab === 'terminal' }"
          @click="toggleTerminalPanel"
          title="终端"
        >
          <mdui-icon-terminal></mdui-icon-terminal>
        </mdui-button-icon>
        <mdui-button-icon
          v-for="item in navItems.filter(n => n.path !== '/')"
          :key="item.path"
          :class="{ active: currentRoute === item.path }"
          @click="navigateTo(item.path)"
          :title="item.label"
        >
          <mdui-icon-dashboard v-if="item.icon === 'dashboard'"></mdui-icon-dashboard>
          <mdui-icon-settings v-else-if="item.icon === 'settings'"></mdui-icon-settings>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 侧边栏 -->
    <div
      class="sidebar"
      :class="{ collapsed: !sidebarOpen }"
      :style="{ width: sidebarOpen ? sidebarWidth + 'px' : '0' }"
    >
      <!-- 资源管理器面板 -->
      <FileExplorer v-if="activeSidebarPanel === 'explorer'" />

      <!-- Git 面板 -->
      <GitPanel v-else-if="activeSidebarPanel === 'git'" />

      <!-- 搜索面板 (待实现) -->
      <div v-else-if="activeSidebarPanel === 'search'" class="panel-placeholder">
        <div class="panel-header">
          <span class="title">搜索</span>
        </div>
        <div class="panel-content">
          <mdui-text-field
            placeholder="搜索文件..."
            variant="outlined"
          >
            <mdui-icon-search slot="icon"></mdui-icon-search>
          </mdui-text-field>
        </div>
      </div>

      <!-- 调试面板 -->
      <DebugSidebarPanel v-else-if="activeSidebarPanel === 'debug'" />

      <!-- TODO 面板 -->
      <TodoPanel v-else-if="activeSidebarPanel === 'todos'" />

      <!-- Commit Analysis 面板 -->
      <CommitAnalysisPanel v-else-if="activeSidebarPanel === 'commitAnalysis'" />

      <!-- File History 面板 -->
      <FileHistoryPanel
        v-else-if="activeSidebarPanel === 'fileHistory'"
        :file-path="editorStore.activeTab?.path"
        @close="sidebarOpen = false"
      />

      <!-- Extensions 面板 -->
      <ExtensionsPanel v-else-if="activeSidebarPanel === 'extensions'" />

      <!-- 侧边栏调整手柄 -->
      <div class="sidebar-resize-handle"></div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部标签栏 (编辑器视图时显示) -->
      <div v-if="currentRoute === '/'" class="tab-bar">
        <div class="tabs-container">
          <div
            v-for="tab in editorStore.tabs"
            :key="tab.id"
            class="tab"
            :class="{ active: tab.id === editorStore.activeTabId, dirty: tab.isDirty }"
            @click="editorStore.setActiveTab(tab.id)"
            @auxclick.middle="editorStore.closeTab(tab.id)"
          >
            <mdui-icon-code class="tab-icon"></mdui-icon-code>
            <span class="tab-name">{{ tab.filename }}</span>
            <span v-if="tab.isDirty" class="dirty-dot"></span>
            <mdui-button-icon
              class="close-btn"
              @click.stop="editorStore.closeTab(tab.id)"
            >
              <mdui-icon-close></mdui-icon-close>
            </mdui-button-icon>
          </div>
        </div>
      </div>

      <!-- 编辑器和底部面板的上下分屏容器 -->
      <div class="editor-panel-container">
        <!-- 路由视图 (编辑器等) -->
        <div class="content-area">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>

        <!-- 底部面板 (终端、输出等) -->
        <BottomPanel />
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="status-bar">
      <div class="status-left">
        <span class="status-item clickable">
          <mdui-icon-source></mdui-icon-source>
          {{ statusBarInfo.branch }}
        </span>
        <!-- Git 操作状态指示器 (合并/Rebase) -->
        <GitOperationIndicator />
        <span class="status-item" v-if="editorStore.hasUnsavedChanges">
          <mdui-icon-sync></mdui-icon-sync>
          {{ editorStore.dirtyTabs.length }} 未保存
        </span>
        <!-- 索引进度 -->
        <span
          class="status-item indexing-status"
          v-if="indexingProgress && indexingProgress.phase !== 'ready' && indexingProgress.phase !== 'idle'"
          :title="indexingProgress.currentFile || indexingProgress.message"
        >
          <mdui-icon-hourglass-empty class="spinning"></mdui-icon-hourglass-empty>
          <span class="indexing-text">{{ indexingProgress.message }}</span>
          <span class="indexing-progress">{{ indexingProgress.percentage }}%</span>
        </span>
        <!-- LSP 服务器状态 -->
        <span
          v-for="server in lspServers.filter(s => s.status === 'ready')"
          :key="server.language"
          class="status-item lsp-status ready"
          :title="`${server.language} LSP ready`"
        >
          <mdui-icon-check-circle></mdui-icon-check-circle>
          {{ server.language }}
        </span>
        <span
          v-for="server in lspServers.filter(s => s.status === 'starting')"
          :key="server.language"
          class="status-item lsp-status starting"
          :title="`${server.language} LSP starting...`"
        >
          <mdui-icon-hourglass-empty class="spinning"></mdui-icon-hourglass-empty>
          {{ server.language }}
        </span>
        <span
          v-for="server in lspServers.filter(s => s.status === 'error')"
          :key="server.language"
          class="status-item lsp-status error"
          :title="server.message || `${server.language} LSP error`"
        >
          <mdui-icon-error></mdui-icon-error>
          {{ server.language }}
        </span>
      </div>
      <div class="status-right">
        <span class="status-item">{{ statusBarInfo.encoding }}</span>
        <span class="status-item">{{ statusBarInfo.language }}</span>
        <span class="status-item">
          Ln {{ statusBarInfo.line }}, Col {{ statusBarInfo.column }}
        </span>
        <!-- 智能模式指示器 -->
        <IntelligenceModeIndicator />
        <!-- 主题切换开关 -->
        <span class="status-item theme-toggle clickable" @click="themeStore.toggleTheme()" :title="themeStore.isDark ? '切换到浅色模式' : '切换到深色模式'">
          <mdui-icon-dark-mode v-if="themeStore.isDark"></mdui-icon-dark-mode>
          <mdui-icon-light-mode v-else></mdui-icon-light-mode>
        </span>
      </div>
    </div>

    <!-- 遥测同意对话框 (首次启动显示) -->
    <TelemetryConsentDialog />

    <!-- LSP 设置对话框 (遥测同意后显示) -->
    <LSPSetupDialog />

    <!-- 反馈上报对话框 (Cmd/Ctrl + Shift + F 触发) -->
    <FeedbackReportDialog ref="feedbackDialogRef" />

    <!-- 通知容器 -->
    <NotificationContainer />
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 48px auto 1fr;
  grid-template-rows: 1fr 24px;
  height: 100vh;
  background: var(--mdui-color-surface);
}

/* 活动栏 */
.activity-bar {
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--mdui-color-surface-container);
  border-right: 1px solid var(--mdui-color-outline-variant);
  padding: 8px 0;
  padding-top: 38px; /* macOS 窗口控制按钮空间 */
}

.activity-bar-top,
.activity-bar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.activity-bar mdui-button-icon {
  --mdui-comp-button-icon-size: 40px;
  border-radius: 8px;
  color: var(--mdui-color-on-surface-variant);
}

.activity-bar mdui-button-icon.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.activity-bar mdui-button-icon:hover {
  background: var(--mdui-color-surface-container-high);
}

/* 侧边栏 */
.sidebar {
  grid-row: 1 / 2;
  position: relative;
  background: var(--mdui-color-surface);
  border-right: 1px solid var(--mdui-color-outline-variant);
  overflow: hidden;
  transition: width 0.15s ease;
  padding-top: 38px; /* macOS 窗口控制按钮空间 */
}

.sidebar.collapsed {
  border-right: none;
}

.sidebar-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
}

.sidebar-resize-handle:hover {
  background: var(--mdui-color-primary);
}

/* 面板占位 */
.panel-placeholder {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.panel-header .title {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
}

.panel-content {
  flex: 1;
  padding: 16px;
}

.panel-content p {
  color: var(--mdui-color-on-surface-variant);
  font-size: 14px;
}

/* 主内容区 */
.main-content {
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-top: 38px; /* macOS 窗口控制按钮空间 */
}

/* 编辑器和底部面板的分屏容器 */
.editor-panel-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* 内容区域 */
.content-area {
  flex: 1;
  overflow: hidden;
  min-height: 100px; /* 确保编辑器最小高度 */
}

/* 标签栏 */
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.tabs-container {
  display: flex;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 36px;
  min-width: 120px;
  max-width: 200px;
  background: var(--mdui-color-surface-container);
  border-right: 1px solid var(--mdui-color-outline-variant);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.1s;
}

.tab:hover {
  background: var(--mdui-color-surface-container-high);
}

.tab.active {
  background: var(--mdui-color-surface);
}

.tab-icon {
  font-size: 16px;
  color: var(--mdui-color-on-surface-variant);
}

.tab-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mdui-color-primary);
  flex-shrink: 0;
}

.tab .close-btn {
  --mdui-comp-button-icon-size: 20px;
  opacity: 0;
  transition: opacity 0.1s;
}

.tab:hover .close-btn,
.tab.active .close-btn {
  opacity: 1;
}

.tab .close-btn:hover {
  background: var(--mdui-color-surface-container-highest);
}

.tab.dirty .tab-name {
  font-style: italic;
}

/* 状态栏 */
.status-bar {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  background: var(--mdui-color-primary);
  color: var(--mdui-color-on-primary);
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-item.clickable {
  cursor: pointer;
  padding: 0 4px;
  border-radius: 2px;
}

.status-item.clickable:hover {
  background: rgba(255, 255, 255, 0.1);
}

.status-item mdui-icon-source,
.status-item mdui-icon-sync,
.status-item mdui-icon-hourglass-empty {
  font-size: 14px;
}

/* 索引进度样式 */
.indexing-status {
  background: rgba(255, 255, 255, 0.1);
  padding: 0 8px;
  border-radius: 4px;
}

.indexing-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indexing-progress {
  font-weight: 500;
  margin-left: 4px;
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* LSP 服务器状态样式 */
.lsp-status {
  background: rgba(255, 255, 255, 0.1);
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
}

.lsp-status.ready {
  opacity: 0.8;
}

.lsp-status.starting {
  opacity: 0.6;
}

.lsp-status.error {
  background: rgba(255, 100, 100, 0.2);
}

.lsp-status mdui-icon-check-circle,
.lsp-status mdui-icon-error,
.lsp-status mdui-icon-hourglass-empty {
  font-size: 12px;
}

/* 主题切换开关 */
.theme-toggle {
  padding: 0 6px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.15);
}

.theme-toggle mdui-icon-dark-mode,
.theme-toggle mdui-icon-light-mode {
  font-size: 16px;
}

/* 路由过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
