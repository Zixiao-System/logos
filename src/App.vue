<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEditorStore } from '@/stores/editor'
import { useGitStore } from '@/stores/git'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useBottomPanelStore } from '@/stores/bottomPanel'
import { useIntelligenceStore } from '@/stores/intelligence'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import { useNotificationStore } from '@/stores/notification'
import { useDebugStore } from '@/stores/debug'
import { useRemoteStore } from '@/stores/remote'
import { FileExplorer } from '@/components/FileExplorer'
import { GitPanel } from '@/components/Git'
import { BottomPanel } from '@/components/BottomPanel'
import CommandPalette from '@/components/CommandPalette.vue'
import type { Command } from '@/components/CommandPalette.vue'
import SearchPanel from '@/components/Search/SearchPanel.vue'
import TodoPanel from '@/components/Analysis/TodoPanel.vue'
import CommitAnalysisPanel from '@/components/Analysis/CommitAnalysisPanel.vue'
import { FileHistoryPanel } from '@/components/GitLens/FileHistory'
import ExtensionsPanel from '@/components/Extensions/ExtensionsPanel.vue'
import ExtensionViewPanel from '@/components/Extensions/ExtensionViewPanel.vue'
import TelemetryConsentDialog from '@/components/TelemetryConsentDialog.vue'
import LSPSetupDialog from '@/components/LSPSetupDialog.vue'
import FeedbackReportDialog from '@/components/FeedbackReportDialog.vue'
import NotificationContainer from '@/components/common/NotificationContainer.vue'
import { DebugSidebarPanel, FloatingDebugToolbar } from '@/components/Debug'
import { RemoteExplorer } from '@/components/Remote'
import { IntelligenceModeIndicator } from '@/components/StatusBar'
import { GitOperationIndicator } from '@/components/StatusBar'
import type { IndexingProgress, LanguageServerStatus } from '@/types/intelligence'
import { useExtensionUiStore } from '@/stores/extensionUi'
import { useExtensionPanelsStore } from '@/stores/extensionPanels'
import { useExtensionStatusBarStore } from '@/stores/extensionStatusBar'
import { useProblemsStore } from '@/stores/problems'
import { createAppCommands } from '@/config/commands'
import * as monaco from 'monaco-editor'

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
import '@mdui/icons/warning.js'
import '@mdui/icons/checklist.js'
import '@mdui/icons/analytics.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/history.js'
import '@mdui/icons/extension.js'
import '@mdui/icons/cloud.js'


const router = useRouter()
const route = useRoute()
const editorStore = useEditorStore()
const fileExplorerStore = useFileExplorerStore()
const gitStore = useGitStore()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const bottomPanelStore = useBottomPanelStore()
const intelligenceStore = useIntelligenceStore()
const extensionUiStore = useExtensionUiStore()
const extensionPanelsStore = useExtensionPanelsStore()
const extensionStatusBarStore = useExtensionStatusBarStore()
const problemsStore = useProblemsStore()
const notificationStore = useNotificationStore()
const remoteStore = useRemoteStore()
const debugStore = useDebugStore()

const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const commandCenterRef = ref<HTMLElement | null>(null)
const showCommandCenterMenu = ref(false)
const commandCenterMenuStyle = ref<{ top: string; left: string }>({ top: '0', left: '0' })
const COMMAND_HISTORY_KEY = 'logos:recentCommands'
const recentCommandIds = ref<string[]>([])

const recentCommands = computed<Command[]>(() => {
  const available = commands.value
  return recentCommandIds.value
    .map(id => available.find(command => command.id === id))
    .filter((command): command is Command => command != null)
})

// 索引进度状态
const indexingProgress = ref<IndexingProgress | null>(null)
let unsubscribeProgress: (() => void) | null = null

// LSP 服务器状态
const lspServers = ref<LanguageServerStatus[]>([])
let unsubscribeLSPStatus: (() => void) | null = null

let problemsSubscription: monaco.IDisposable | null = null
let problemsRefreshTimer: ReturnType<typeof setTimeout> | null = null
let hdrCleanup: (() => void) | null = null

// 反馈对话框引用
const feedbackDialogRef = ref<InstanceType<typeof FeedbackReportDialog> | null>(null)

// 处理反馈快捷键 (Ctrl + Alt + Shift + F)
const handleFeedbackShortcut = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    feedbackDialogRef.value?.open()
  }
}

// 处理智能模式快捷键
// Ctrl + Alt + I/M: Smart Mode
const handleIntelligenceModeShortcut = async (event: KeyboardEvent) => {
  if (!event.ctrlKey || !event.altKey || event.shiftKey) return

  const key = event.key.toLowerCase()

  if (key === 'i' || key === 'm') {
    event.preventDefault()
    await intelligenceStore.setMode('smart')
  }
}

// VS Code 风格的全局快捷键
// Cmd/Ctrl + B: 切换侧边栏
// Cmd/Ctrl + J: 切换底部面板
// Ctrl + `: 切换终端
// Cmd/Ctrl + Shift + E/F/G/D/X: 资源管理器/搜索/源码管理/调试/扩展
// Cmd/Ctrl + Shift + M/U: 问题/输出 面板
const handleWorkbenchShortcuts = (event: KeyboardEvent) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const primaryKey = isMac ? event.metaKey : event.ctrlKey
  const key = event.key.toLowerCase()
  const isBackquote = event.code === 'Backquote' || event.key === '`'

  if (event.ctrlKey && isBackquote) {
    event.preventDefault()
    toggleTerminalPanel()
    return
  }

  if (!primaryKey) return

  if (!event.shiftKey) {
    if (key === 'b') {
      event.preventDefault()
      sidebarOpen.value = !sidebarOpen.value
      return
    }
    if (key === 'j') {
      event.preventDefault()
      bottomPanelStore.togglePanel()
      return
    }
    if (key === 'p') {
      event.preventDefault()
      openQuickOpen()
      return
    }
    return
  }

  switch (key) {
    case 'p':
      event.preventDefault()
      openCommandPalette()
      break
    case 'e':
      event.preventDefault()
      activeSidebarPanel.value = 'explorer'
      sidebarOpen.value = true
      break
    case 'f':
      event.preventDefault()
      activeSidebarPanel.value = 'search'
      sidebarOpen.value = true
      break
    case 'g':
      event.preventDefault()
      activeSidebarPanel.value = 'git'
      sidebarOpen.value = true
      break
    case 'd':
      event.preventDefault()
      activeSidebarPanel.value = 'debug'
      sidebarOpen.value = true
      break
    case 'x':
      event.preventDefault()
      activeSidebarPanel.value = 'extensions'
      sidebarOpen.value = true
      break
    case 'm':
      event.preventDefault()
      bottomPanelStore.setActiveTab('problems')
      break
    case 'u':
      event.preventDefault()
      bottomPanelStore.setActiveTab('output')
      break
    default:
      break
  }
}

// UI 状态
const sidebarOpen = ref(true)
const sidebarWidth = ref(260)
const activeSidebarPanel = ref('explorer')

const handleExtensionOpenScm = () => {
  activeSidebarPanel.value = 'git'
  sidebarOpen.value = true
}

const handleExtensionOpenSettings = () => {
  router.push('/settings')
}

const handleExtensionShowCommands = () => {
  openCommandPalette()
}

const handleExtensionQuickOpen = () => {
  openQuickOpen()
}

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

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const openCommandPalette = () => {
  commandPaletteRef.value?.open('commands')
}

const openQuickOpen = () => {
  commandPaletteRef.value?.open('quickOpen')
}

const scheduleProblemsRefresh = () => {
  if (problemsRefreshTimer) {
    clearTimeout(problemsRefreshTimer)
  }
  problemsRefreshTimer = setTimeout(() => {
    problemsStore.refreshFromMonaco()
  }, 60)
}

const globalSearchQuery = ref('')

const recordCommand = (command: Command) => {
  recentCommandIds.value = recentCommandIds.value.filter(id => id !== command.id)
  recentCommandIds.value.unshift(command.id)
  recentCommandIds.value = recentCommandIds.value.slice(0, 8)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(recentCommandIds.value))
  }
}

const focusSearchPanel = () => {
  activeSidebarPanel.value = 'search'
  sidebarOpen.value = true
}

const commitGlobalSearch = () => {
  const query = globalSearchQuery.value.trim()
  if (!query) {
    focusSearchPanel()
    return
  }
  focusSearchPanel()
  window.dispatchEvent(new CustomEvent('search-panel:set-query', { detail: { query } }))
}

const setupHdrSupport = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const html = document.documentElement
  const dynamicRangeQuery = window.matchMedia('(dynamic-range: high)')
  const videoDynamicRangeQuery = window.matchMedia('(video-dynamic-range: high)')
  const p3Query = window.matchMedia('(color-gamut: p3)')

  const updateHdr = () => {
    const dynamic =
      (dynamicRangeQuery?.matches ?? false) || (videoDynamicRangeQuery?.matches ?? false)
    const p3 = p3Query?.matches ?? false
    const enabled = dynamic && p3
    html.classList.toggle('hdr-enabled', enabled)
  }

  updateHdr()

  const handlers: Array<[(event: MediaQueryListEvent) => void, MediaQueryList]> = []
  const listen = (query: MediaQueryList | null, handler: () => void) => {
    if (!query?.addEventListener) return
    const wrapped = () => handler()
    query.addEventListener('change', wrapped)
    handlers.push([wrapped, query])
  }

  listen(dynamicRangeQuery, updateHdr)
  listen(videoDynamicRangeQuery, updateHdr)
  listen(p3Query, updateHdr)

  hdrCleanup = () => {
    handlers.forEach(([handler, query]) => {
      query.removeEventListener('change', handler)
    })
  }
}

const toggleCommandCenterMenu = () => {
  if (!showCommandCenterMenu.value) {
    if (commandCenterRef.value) {
      const rect = commandCenterRef.value.getBoundingClientRect()
      commandCenterMenuStyle.value = {
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`
      }
    }
  }
  showCommandCenterMenu.value = !showCommandCenterMenu.value
}

const closeCommandCenterMenu = () => {
  showCommandCenterMenu.value = false
}

const handleCommandCenterOutsideClick = (event: MouseEvent) => {
  if (!showCommandCenterMenu.value) return
  if (commandCenterRef.value && commandCenterRef.value.contains(event.target as Node)) return
  closeCommandCenterMenu()
}

const openRecentCommand = async (command: Command) => {
  await command.action()
  closeCommandCenterMenu()
}

const openRecentFile = async (path: string) => {
  await editorStore.openFile(path)
  closeCommandCenterMenu()
}

// 侧边栏面板项
type SidebarPanelItem = {
  id: string
  icon: string
  label: string
  iconUrl?: string
}

const basePanelItems: SidebarPanelItem[] = [
  { id: 'explorer', icon: 'folder', label: '资源管理器' },
  { id: 'remote', icon: 'cloud', label: '远程开发' },
  { id: 'git', icon: 'source', label: '源代码管理' },
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'debug', icon: 'bug-report', label: '运行和调试' },
  { id: 'todos', icon: 'checklist', label: 'TODO' },
  { id: 'commitAnalysis', icon: 'analytics', label: '提交分析' },
  { id: 'fileHistory', icon: 'history', label: '文件历史' },
  { id: 'extensions', icon: 'extension', label: '扩展' }
]

const panelItems = computed<SidebarPanelItem[]>(() => {
  const extensionPanels = extensionUiStore.containers.map(container => ({
    id: `ext:${container.id}`,
    icon: 'extension-custom',
    iconUrl: extensionUiStore.containerIconUrl(container.id),
    label: container.title
  }))
  return [
    ...basePanelItems.slice(0, basePanelItems.length - 1),
    ...extensionPanels,
    basePanelItems[basePanelItems.length - 1]
  ]
})

const commands = computed<Command[]>(() => {
  const baseCommands = createAppCommands({
    router,
    editorStore,
    fileExplorerStore,
    themeStore,
    notificationStore,
    toggleSidebar,
    toggleTerminalPanel,
    openCommandPalette,
    openQuickOpen
  })
  return baseCommands.map(command => {
    const action = command.action
    return {
      ...command,
      action: async () => {
        recordCommand(command)
        await action()
      }
    }
  })
})

const activeExtensionContainerId = computed(() => {
  return activeSidebarPanel.value.startsWith('ext:') ? activeSidebarPanel.value.replace('ext:', '') : null
})

const currentRoute = computed(() => route.path)
const lastNonExtensionRoute = ref('/')

watch(
  () => route.path,
  (path) => {
    if (path !== '/extension-panel') {
      lastNonExtensionRoute.value = path
    }
  }
)

watch(
  () => extensionPanelsStore.activeHandle,
  (handle) => {
    if (handle) {
      if (route.path !== '/extension-panel') {
        router.push('/extension-panel')
      }
      return
    }
    if (route.path === '/extension-panel') {
      router.push(lastNonExtensionRoute.value || '/')
    }
  }
)

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

const extensionStatusBarLeft = computed(() => extensionStatusBarStore.leftItems)

const debugStatusText = computed(() => {
  if (!debugStore.isDebugging) return ''
  const session = debugStore.activeSession
  if (debugStore.isPaused) return `Paused: ${session?.name || 'Debug'}`
  return `Debugging: ${session?.name || 'Debug'}`
})

const debugStatusTooltip = computed(() => {
  const session = debugStore.activeSession
  if (!session) return ''
  return `${session.type} - ${session.name} (${session.state})`
})
const extensionStatusBarRight = computed(() => extensionStatusBarStore.rightItems)

const handleExtensionStatusBarClick = async (item: { command?: { command: string; arguments?: unknown[] } }) => {
  const command = item.command?.command
  if (!command || !window.electronAPI?.extensions?.executeCommand) {
    return
  }
  await window.electronAPI.extensions.executeCommand({
    command,
    args: item.command?.arguments
  })
}

const lspSummary = computed(() => {
  const ready = lspServers.value.filter(s => s.status === 'ready').length
  const starting = lspServers.value.filter(s => s.status === 'starting').length
  const error = lspServers.value.filter(s => s.status === 'error').length
  if (ready + starting + error === 0) return null
  return { ready, starting, error }
})

const navigateTo = (path: string, panel?: 'explorer' | 'git' | 'search' | 'todos' | 'commitAnalysis') => {
  router.push(path)
  if (panel) {
    activeSidebarPanel.value = panel
    sidebarOpen.value = true
  }
}

const switchPanel = (panel: string) => {
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
  // 注册 VS Code 风格快捷键监听器
  window.addEventListener('keydown', handleWorkbenchShortcuts)
  document.addEventListener('click', handleCommandCenterOutsideClick)
  window.addEventListener('extensions:open-scm', handleExtensionOpenScm)
  window.addEventListener('extensions:open-settings', handleExtensionOpenSettings)
  window.addEventListener('extensions:show-commands', handleExtensionShowCommands)
  window.addEventListener('extensions:quick-open', handleExtensionQuickOpen)
  // 监听问题变化
  problemsStore.refreshFromMonaco()
  problemsSubscription = monaco.editor.onDidChangeMarkers(() => {
    scheduleProblemsRefresh()
  })

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(COMMAND_HISTORY_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed)) {
          recentCommandIds.value = parsed.filter(Boolean)
        }
      }
    } catch (error) {
      console.warn('Failed to load recent commands:', error)
    }
  }

  await editorStore.pruneRecentFiles()
  setupHdrSupport()

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

    extensionUiStore.init()
    extensionPanelsStore.init()
    extensionStatusBarStore.init()

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

watch(commands, (nextCommands) => {
  if (recentCommandIds.value.length === 0) return
  const available = new Set(nextCommands.map(command => command.id))
  recentCommandIds.value = recentCommandIds.value.filter(id => available.has(id))
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(recentCommandIds.value))
  }
})

// Auto-switch UI when debug session starts
watch(() => debugStore.isDebugging, (isDebugging) => {
  if (isDebugging) {
    activeSidebarPanel.value = 'debug'
    sidebarOpen.value = true
    bottomPanelStore.setActiveTab('debug-console')
  }
})

// Auto-navigate to paused frame location
watch(() => debugStore.currentFrame, (frame) => {
  if (!frame?.source?.path || !debugStore.isPaused) return
  const activeTab = editorStore.activeTab
  if (activeTab?.path === frame.source.path &&
      activeTab.cursorPosition.line === frame.line) {
    return
  }
  editorStore.navigateToLocation(frame.source.path, frame.line, frame.column)
})

onUnmounted(() => {
  // 移除反馈快捷键监听器
  window.removeEventListener('keydown', handleFeedbackShortcut)
  // 移除智能模式切换快捷键监听器
  window.removeEventListener('keydown', handleIntelligenceModeShortcut)
  // 移除 VS Code 风格快捷键监听器
  window.removeEventListener('keydown', handleWorkbenchShortcuts)
  document.removeEventListener('click', handleCommandCenterOutsideClick)
  window.removeEventListener('extensions:open-scm', handleExtensionOpenScm)
  window.removeEventListener('extensions:open-settings', handleExtensionOpenSettings)
  window.removeEventListener('extensions:show-commands', handleExtensionShowCommands)
  window.removeEventListener('extensions:quick-open', handleExtensionQuickOpen)

  if (problemsSubscription) {
    problemsSubscription.dispose()
    problemsSubscription = null
  }
  if (problemsRefreshTimer) {
    clearTimeout(problemsRefreshTimer)
    problemsRefreshTimer = null
  }
  if (hdrCleanup) {
    hdrCleanup()
    hdrCleanup = null
  }

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
          <img v-if="panel.iconUrl" class="extension-activity-icon" :src="panel.iconUrl" alt="" />
          <mdui-icon-folder v-else-if="panel.icon === 'folder'"></mdui-icon-folder>
          <mdui-icon-cloud v-else-if="panel.icon === 'cloud'"></mdui-icon-cloud>
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

      <!-- 远程开发面板 -->
      <RemoteExplorer v-else-if="activeSidebarPanel === 'remote'" />

      <!-- Git 面板 -->
      <GitPanel v-else-if="activeSidebarPanel === 'git'" />

      <!-- 搜索面板 -->
      <SearchPanel v-else-if="activeSidebarPanel === 'search'" />

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

      <!-- Extension Views -->
      <ExtensionViewPanel v-else-if="activeExtensionContainerId" :container-id="activeExtensionContainerId" />

      <!-- 侧边栏调整手柄 -->
      <div class="sidebar-resize-handle"></div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部命令/搜索栏 -->
      <div class="top-command-bar">
        <button
          ref="commandCenterRef"
          class="command-center"
          @click="toggleCommandCenterMenu"
          title="命令中心"
        >
          <span class="command-label">执行命令</span>
          <span class="command-shortcut">Cmd+Shift+P</span>
        </button>
        <div class="top-search">
          <input
            v-model="globalSearchQuery"
            type="text"
            placeholder="搜索 (Cmd+Shift+F)"
            @focus="focusSearchPanel"
            @keydown.enter="commitGlobalSearch"
          />
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="showCommandCenterMenu"
          class="command-center-menu"
          :style="commandCenterMenuStyle"
          @click.stop
        >
          <div class="menu-section">
            <div class="menu-title">快速入口</div>
            <button class="menu-item" @click="closeCommandCenterMenu(); openCommandPalette()">
              <span>命令面板</span>
              <span class="menu-shortcut">Cmd+Shift+P</span>
            </button>
            <button class="menu-item" @click="closeCommandCenterMenu(); openQuickOpen()">
              <span>快速打开</span>
              <span class="menu-shortcut">Cmd+P</span>
            </button>
            <button class="menu-item" @click="closeCommandCenterMenu(); focusSearchPanel()">
              <span>搜索</span>
              <span class="menu-shortcut">Cmd+Shift+F</span>
            </button>
          </div>

          <div class="menu-section">
            <div class="menu-title">最近命令</div>
            <div v-if="recentCommands.length === 0" class="menu-empty">暂无最近命令</div>
            <button
              v-for="command in recentCommands"
              :key="command.id"
              class="menu-item"
              @click="openRecentCommand(command)"
            >
              <span>{{ command.title }}</span>
              <span v-if="command.shortcut" class="menu-shortcut">{{ command.shortcut }}</span>
            </button>
          </div>

          <div class="menu-section">
            <div class="menu-title">最近文件</div>
            <div v-if="editorStore.recentFiles.length === 0" class="menu-empty">暂无最近文件</div>
            <button
              v-else
              class="menu-item"
              @click="editorStore.clearRecentFiles(); notificationStore.success('已清除最近文件'); closeCommandCenterMenu()"
            >
              <span>清除最近文件</span>
            </button>
            <button
              v-for="path in editorStore.recentFiles.slice(0, 8)"
              :key="path"
              class="menu-item menu-item-file"
              @click="openRecentFile(path)"
            >
              <div class="menu-text">
                <span class="menu-file">{{ path.split(/[\\\\/]/).pop() || path }}</span>
                <span class="menu-sub">{{ path }}</span>
              </div>
            </button>
          </div>
        </div>
      </Teleport>

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
        <span
          v-if="debugStore.isDebugging"
          class="status-item clickable debug-status"
          :class="{ paused: debugStore.isPaused }"
          @click="activeSidebarPanel = 'debug'; sidebarOpen = true"
          :title="debugStatusTooltip"
        >
          <mdui-icon-bug-report></mdui-icon-bug-report>
          {{ debugStatusText }}
        </span>
        <!-- 远程连接状态 -->
        <span
          v-if="remoteStore.isConnected"
          class="status-item clickable remote-status"
          @click="activeSidebarPanel = 'remote'; sidebarOpen = true"
          :title="remoteStore.activeConnection ? `${remoteStore.activeConnection.config.username}@${remoteStore.activeConnection.config.host}` : '远程连接'"
        >
          <mdui-icon-cloud></mdui-icon-cloud>
          SSH: {{ remoteStore.activeConnection?.config.name || '已连接' }}
        </span>
        <span class="status-item" v-if="editorStore.hasUnsavedChanges">
          <mdui-icon-sync></mdui-icon-sync>
          {{ editorStore.dirtyTabs.length }} 未保存
        </span>
        <!-- 问题统计 -->
        <span
          class="status-item clickable"
          v-if="problemsStore.totalCount > 0"
          @click="bottomPanelStore.setActiveTab('problems')"
          title="查看问题"
        >
          <mdui-icon-error></mdui-icon-error>
          {{ problemsStore.errorCount }}
          <mdui-icon-warning class="status-icon"></mdui-icon-warning>
          {{ problemsStore.warningCount }}
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
        <!-- LSP 服务器状态 (汇总) -->
        <span
          v-if="lspSummary"
          class="status-item lsp-status"
          :title="`LSP: ${lspSummary.ready} ready / ${lspSummary.starting} starting / ${lspSummary.error} error`"
        >
          <mdui-icon-check-circle v-if="lspSummary.error === 0"></mdui-icon-check-circle>
          <mdui-icon-error v-else></mdui-icon-error>
          LSP {{ lspSummary.ready }}/{{ lspSummary.starting }}/{{ lspSummary.error }}
        </span>
        <span
          v-for="item in extensionStatusBarLeft"
          :key="item.id"
          class="status-item"
          :class="{ clickable: item.command?.command }"
          :title="item.tooltip"
          @click="item.command?.command && handleExtensionStatusBarClick(item)"
        >
          {{ item.text }}
        </span>
      </div>
      <div class="status-right">
        <span
          v-for="item in extensionStatusBarRight"
          :key="item.id"
          class="status-item"
          :class="{ clickable: item.command?.command }"
          :title="item.tooltip"
          @click="item.command?.command && handleExtensionStatusBarClick(item)"
        >
          {{ item.text }}
        </span>
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

    <!-- Command Palette / Quick Open -->
    <CommandPalette ref="commandPaletteRef" :commands="commands" />

    <!-- 通知容器 -->
    <NotificationContainer />

    <!-- 浮动调试工具栏 -->
    <FloatingDebugToolbar v-if="debugStore.isDebugging" />
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

.extension-activity-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
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

/* 顶部命令/搜索栏 */
.top-command-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.command-center {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface-variant);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.command-center:hover {
  border-color: var(--mdui-color-primary);
  color: var(--mdui-color-on-surface);
}

.command-label {
  font-weight: 500;
}

.command-shortcut {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.top-search {
  display: flex;
  align-items: center;
  background: var(--mdui-color-surface);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  padding: 6px 12px;
}

.top-search input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--mdui-color-on-surface);
  font-size: 12px;
}

.top-search input:focus {
  outline: none;
}

.command-center-menu {
  position: fixed;
  z-index: 2100;
  min-width: 280px;
  max-width: 360px;
  background: var(--mdui-color-surface-container);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 10px;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.25);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.command-center-menu .menu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.command-center-menu .menu-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
  padding: 4px 6px;
}

.command-center-menu .menu-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--mdui-color-on-surface);
  cursor: pointer;
  text-align: left;
}

.command-center-menu .menu-item-file {
  justify-content: flex-start;
}

.command-center-menu .menu-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.command-center-menu .menu-item:hover {
  background: var(--mdui-color-surface-container-high);
}

.command-center-menu .menu-shortcut {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  white-space: nowrap;
}

.command-center-menu .menu-empty {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  padding: 6px 8px;
}

.command-center-menu .menu-file {
  font-weight: 500;
}

.command-center-menu .menu-sub {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

:global(html.hdr-enabled) {
  --logos-hdr-primary: color(display-p3 0.1 0.6 1);
  --logos-hdr-error: color(display-p3 1 0.2 0.2);
  --logos-hdr-warning: color(display-p3 1 0.85 0.2);
  --logos-hdr-info: color(display-p3 0.2 0.8 1);

  --mdui-color-primary: var(--logos-hdr-primary);
  --mdui-color-error: var(--logos-hdr-error);
  --mdui-color-warning: var(--logos-hdr-warning);
  --mdui-color-tertiary: var(--logos-hdr-info);
}

/* Syntax highlighting variables */
:global(:root) {
  --logos-syntax-string: #ce9178;
  --logos-syntax-number: #b5cea8;
  --logos-syntax-keyword: #569cd6;
  --logos-syntax-function: #dcdcaa;
  --logos-syntax-comment: #6a9955;
  --logos-syntax-variable: #9cdcfe;
}

/* High contrast mode for better accessibility */
@media (prefers-contrast: more) {
  :global(:root) {
    --mdui-color-outline-variant: var(--mdui-color-outline);
    --logos-syntax-string: #ffa07a;
    --logos-syntax-number: #90ee90;
    --logos-syntax-keyword: #87ceeb;
    --logos-syntax-function: #f0e68c;
  }

  :global(.risk-indicator),
  :global(.badge),
  :global(.stat) {
    font-weight: 600;
  }

  :global(.test-result),
  :global([role="alert"]) {
    border-width: 2px;
    border-style: solid;
  }

  :global(.test-result.success) {
    border-color: var(--mdui-color-tertiary);
  }

  :global(.test-result.error) {
    border-color: var(--mdui-color-error);
  }
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

.status-icon {
  margin-left: 6px;
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

/* 调试状态指示器 */
.debug-status {
  background: rgba(255, 255, 255, 0.1);
  padding: 0 8px;
  border-radius: 4px;
  color: var(--mdui-color-on-primary);
}

.debug-status.paused {
  background: rgba(255, 100, 100, 0.3);
}

.debug-status mdui-icon-bug-report {
  font-size: 14px;
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
