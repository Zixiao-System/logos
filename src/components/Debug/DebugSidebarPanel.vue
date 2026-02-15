<template>
  <div class="debug-sidebar-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <span class="title">运行和调试</span>
    </div>

    <!-- 运行控制区 -->
    <div class="run-controls">
      <!-- 自动检测横幅 -->
      <div class="auto-detect-banner" v-if="showAutoDetectBanner">
        <span class="banner-text">
          检测到 {{ detectedDebuggerNames }} 项目
        </span>
        <div class="banner-actions">
          <mdui-button variant="tonal" @click="handleAutoGenerate" :loading="isAutoGenerating">
            生成配置
          </mdui-button>
          <mdui-button-icon @click="dismissAutoDetect" title="关闭">
            <mdui-icon-close></mdui-icon-close>
          </mdui-button-icon>
        </div>
      </div>

      <!-- VS Code 来源通知 -->
      <div class="vscode-notice" v-if="debugStore.configSource === 'vscode'">
        <span class="notice-text">配置来自 .vscode/launch.json</span>
        <mdui-button variant="text" @click="handleSaveToLogos">
          保存到 .logos
        </mdui-button>
      </div>

      <!-- 配置选择器 -->
      <div class="config-row">
        <mdui-select
          :value="debugStore.selectedConfigIndex.toString()"
          @change="handleConfigChange"
          size="small"
          class="config-select"
          :disabled="debugStore.isDebugging"
        >
          <mdui-menu-item
            v-for="(config, index) in debugStore.launchConfigurations"
            :key="index"
            :value="index.toString()"
          >
            {{ config.name }}
          </mdui-menu-item>
          <mdui-divider v-if="debugStore.launchConfigurations.length > 0"></mdui-divider>
          <mdui-menu-item value="add">
            <mdui-icon-add slot="icon"></mdui-icon-add>
            添加配置...
          </mdui-menu-item>
        </mdui-select>
        <mdui-button-icon @click="openConfigDialog" title="编辑配置">
          <mdui-icon-settings></mdui-icon-settings>
        </mdui-button-icon>
      </div>

      <!-- 运行/调试按钮 -->
      <div class="action-buttons">
        <mdui-button
          variant="filled"
          @click="handleDebug"
          :disabled="!canRun"
          class="debug-btn"
        >
          <mdui-icon-bug-report slot="icon"></mdui-icon-bug-report>
          开始调试
        </mdui-button>
        <mdui-button
          variant="tonal"
          @click="handleRun"
          :disabled="!canRun"
          class="run-btn"
        >
          <mdui-icon-play-arrow slot="icon"></mdui-icon-play-arrow>
          运行
        </mdui-button>
      </div>

      <!-- 调试控制（调试中显示） -->
      <div class="debug-controls" v-if="debugStore.isDebugging">
        <div class="control-row">
          <!-- 继续/暂停 -->
          <mdui-button-icon
            v-if="debugStore.isPaused"
            @click="handleContinue"
            title="继续 (F5)"
          >
            <mdui-icon-play-arrow></mdui-icon-play-arrow>
          </mdui-button-icon>
          <mdui-button-icon
            v-else
            @click="handlePause"
            title="暂停 (F6)"
            :disabled="!debugStore.isRunning"
          >
            <mdui-icon-pause></mdui-icon-pause>
          </mdui-button-icon>

          <mdui-button-icon @click="handleStop" title="停止 (Shift+F5)">
            <mdui-icon-stop></mdui-icon-stop>
          </mdui-button-icon>

          <mdui-button-icon
            v-if="isAttachSession"
            @click="handleDisconnect"
            title="断开连接"
          >
            <mdui-icon-link-off></mdui-icon-link-off>
          </mdui-button-icon>

          <mdui-button-icon @click="handleRestart" title="重启">
            <mdui-icon-refresh></mdui-icon-refresh>
          </mdui-button-icon>

          <mdui-divider vertical></mdui-divider>

          <mdui-button-icon
            @click="handleStepOver"
            title="单步跳过 (F10)"
            :disabled="!debugStore.isPaused"
          >
            <mdui-icon-redo></mdui-icon-redo>
          </mdui-button-icon>

          <mdui-button-icon
            @click="handleStepInto"
            title="单步进入 (F11)"
            :disabled="!debugStore.isPaused"
          >
            <mdui-icon-subdirectory-arrow-right></mdui-icon-subdirectory-arrow-right>
          </mdui-button-icon>

          <mdui-button-icon
            @click="handleStepOut"
            title="单步跳出 (Shift+F11)"
            :disabled="!debugStore.isPaused"
          >
            <mdui-icon-subdirectory-arrow-left></mdui-icon-subdirectory-arrow-left>
          </mdui-button-icon>
        </div>
      </div>
    </div>

    <!-- 折叠面板区域 -->
    <div class="panels-area">
      <!-- 变量面板 -->
      <div class="collapsible-panel" :class="{ expanded: expandedPanels.variables }">
        <div class="panel-title" @click="togglePanel('variables')">
          <mdui-icon-keyboard-arrow-down v-if="expandedPanels.variables"></mdui-icon-keyboard-arrow-down>
          <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          <span>变量</span>
        </div>
        <div class="panel-content" v-if="expandedPanels.variables">
          <VariablesPanel v-if="debugStore.isPaused" />
          <div v-else class="panel-placeholder">
            <p v-if="debugStore.isDebugging">程序运行中...</p>
            <p v-else>开始调试以查看变量</p>
          </div>
        </div>
      </div>

      <!-- 监视面板 -->
      <div class="collapsible-panel" :class="{ expanded: expandedPanels.watch }">
        <div class="panel-title" @click="togglePanel('watch')">
          <mdui-icon-keyboard-arrow-down v-if="expandedPanels.watch"></mdui-icon-keyboard-arrow-down>
          <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          <span>监视</span>
        </div>
        <div class="panel-content" v-if="expandedPanels.watch">
          <WatchPanel />
        </div>
      </div>

      <!-- 调用堆栈面板 -->
      <div class="collapsible-panel" :class="{ expanded: expandedPanels.callStack }">
        <div class="panel-title" @click="togglePanel('callStack')">
          <mdui-icon-keyboard-arrow-down v-if="expandedPanels.callStack"></mdui-icon-keyboard-arrow-down>
          <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          <span>调用堆栈</span>
        </div>
        <div class="panel-content" v-if="expandedPanels.callStack">
          <CallStackPanel v-if="debugStore.isPaused" />
          <div v-else class="panel-placeholder">
            <p v-if="debugStore.isDebugging">程序运行中...</p>
            <p v-else>开始调试以查看调用堆栈</p>
          </div>
        </div>
      </div>

      <!-- 断点面板 -->
      <div class="collapsible-panel" :class="{ expanded: expandedPanels.breakpoints }">
        <div class="panel-title" @click="togglePanel('breakpoints')">
          <mdui-icon-keyboard-arrow-down v-if="expandedPanels.breakpoints"></mdui-icon-keyboard-arrow-down>
          <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          <span>断点</span>
          <span class="badge" v-if="debugStore.allBreakpoints.length > 0">
            {{ debugStore.allBreakpoints.length }}
          </span>
        </div>
        <div class="panel-content" v-if="expandedPanels.breakpoints">
          <BreakpointsPanel />
        </div>
      </div>
    </div>

    <!-- 配置对话框 -->
    <LaunchConfigDialog ref="configDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDebugStore } from '@/stores/debug'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import VariablesPanel from './VariablesPanel.vue'
import WatchPanel from './WatchPanel.vue'
import CallStackPanel from './CallStackPanel.vue'
import BreakpointsPanel from './BreakpointsPanel.vue'
import LaunchConfigDialog from './LaunchConfigDialog.vue'

// 图标导入
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/pause.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/redo.js'
import '@mdui/icons/subdirectory-arrow-right.js'
import '@mdui/icons/subdirectory-arrow-left.js'
import '@mdui/icons/settings.js'
import '@mdui/icons/add.js'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/keyboard-arrow-right.js'
import '@mdui/icons/close.js'
import '@mdui/icons/link-off.js'

const debugStore = useDebugStore()
const fileExplorerStore = useFileExplorerStore()
const configDialogRef = ref<InstanceType<typeof LaunchConfigDialog> | null>(null)

const isAutoGenerating = ref(false)
const autoDetectDismissed = ref(false)

const expandedPanels = ref({
  variables: true,
  watch: false,
  callStack: true,
  breakpoints: true
})

const canRun = computed(() => {
  return debugStore.hasConfigurations &&
         debugStore.selectedConfigIndex >= 0 &&
         !debugStore.isDebugging
})

const isAttachSession = computed(() => {
  return debugStore.activeSession?.config?.request === 'attach'
})

const showAutoDetectBanner = computed(() => {
  return debugStore.autoDetectionDone &&
         !autoDetectDismissed.value &&
         debugStore.detectedDebuggers.length > 0 &&
         !debugStore.hasConfigurations
})

const detectedDebuggerNames = computed(() => {
  return debugStore.detectedDebuggers.map(d => d.displayName).join('/')
})

onMounted(async () => {
  // 设置工作区文件夹并加载配置
  if (fileExplorerStore.rootPath) {
    debugStore.setWorkspaceFolder(fileExplorerStore.rootPath)
    await debugStore.loadLaunchConfigurations()

    // If no configs, run auto-detection
    if (!debugStore.hasConfigurations) {
      await debugStore.detectDebuggers()
    }
  }
})

function togglePanel(panel: keyof typeof expandedPanels.value) {
  expandedPanels.value[panel] = !expandedPanels.value[panel]
}

function handleConfigChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = target.value
  if (value === 'add') {
    configDialogRef.value?.openForAdd()
  } else {
    debugStore.selectConfiguration(parseInt(value, 10))
  }
}

function openConfigDialog() {
  configDialogRef.value?.open()
}

async function handleRun() {
  await debugStore.runConfiguration()
}

async function handleDebug() {
  await debugStore.debugConfiguration()
}

async function handleContinue() {
  await debugStore.continue()
}

async function handlePause() {
  await debugStore.pause()
}

async function handleStop() {
  await debugStore.stopDebugging()
}

async function handleDisconnect() {
  await debugStore.disconnectSession()
}

async function handleRestart() {
  await debugStore.restartDebugging()
}

async function handleStepOver() {
  await debugStore.stepOver()
}

async function handleStepInto() {
  await debugStore.stepInto()
}

async function handleStepOut() {
  await debugStore.stepOut()
}

async function handleAutoGenerate() {
  isAutoGenerating.value = true
  try {
    await debugStore.autoGenerateConfigurations()
  } finally {
    isAutoGenerating.value = false
  }
}

function dismissAutoDetect() {
  autoDetectDismissed.value = true
}

async function handleSaveToLogos() {
  await debugStore.importFromVSCode()
}
</script>

<style scoped>
.debug-sidebar-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.run-controls {
  padding: 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.auto-detect-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--mdui-color-tertiary-container);
  border-radius: 8px;
  font-size: 12px;
}

.banner-text {
  color: var(--mdui-color-on-tertiary-container);
  flex: 1;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.banner-actions mdui-button-icon {
  --mdui-comp-icon-button-size: 24px;
}

.vscode-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  margin-bottom: 12px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 8px;
  font-size: 12px;
}

.notice-text {
  color: var(--mdui-color-on-surface-variant);
}

.config-row {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.config-select {
  flex: 1;
  --mdui-comp-select-height: 32px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-buttons mdui-button {
  flex: 1;
}

.debug-btn {
  --mdui-color-primary: var(--mdui-color-tertiary);
}

.debug-controls {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--mdui-color-outline-variant);
}

.control-row {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.control-row mdui-button-icon {
  --mdui-comp-icon-button-shape-corner: 4px;
}

.control-row mdui-divider[vertical] {
  height: 24px;
  margin: 4px 8px;
}

.panels-area {
  flex: 1;
  overflow-y: auto;
}

.collapsible-panel {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
  cursor: pointer;
  user-select: none;
}

.panel-title:hover {
  background: var(--mdui-color-surface-container-high);
}

.panel-title mdui-icon-keyboard-arrow-down,
.panel-title mdui-icon-keyboard-arrow-right {
  font-size: 18px;
}

.panel-title .badge {
  margin-left: auto;
  padding: 0 6px;
  background: var(--mdui-color-surface-container-highest);
  border-radius: 10px;
  font-size: 10px;
}

.panel-content {
  max-height: 200px;
  overflow-y: auto;
}

.collapsible-panel.expanded .panel-content {
  border-top: 1px solid var(--mdui-color-outline-variant);
}

.panel-placeholder {
  padding: 24px 16px;
  text-align: center;
  color: var(--mdui-color-outline);
  font-size: 13px;
}

.panel-placeholder p {
  margin: 0;
}
</style>
