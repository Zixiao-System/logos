<script setup lang="ts">
/**
 * 底部面板组件
 * VS Code 风格的底部面板，包含终端、输出、问题等标签页
 */

import { ref, computed, onUnmounted } from 'vue'
import { useBottomPanelStore, type BottomPanelTab } from '@/stores/bottomPanel'
import { useProblemsStore } from '@/stores/problems'
import TerminalPanel from './TerminalPanel.vue'
import OutputLog from './OutputLog.vue'
import ProblemsPanel from './ProblemsPanel.vue'
import { DebugConsole } from '@/components/Debug'

// 导入图标
import '@mdui/icons/terminal.js'
import '@mdui/icons/output.js'
import '@mdui/icons/error.js'
import '@mdui/icons/close.js'
import '@mdui/icons/expand-less.js'
import '@mdui/icons/expand-more.js'
import '@mdui/icons/bug-report.js'

const bottomPanelStore = useBottomPanelStore()
const problemsStore = useProblemsStore()

// 定义标签页配置
const tabs: { id: BottomPanelTab; label: string; icon: string }[] = [
  { id: 'terminal', label: '终端', icon: 'terminal' },
  { id: 'output', label: '输出', icon: 'output' },
  { id: 'problems', label: '问题', icon: 'error' },
  { id: 'debug-console', label: '调试控制台', icon: 'bug-report' }
]

// 拖动调整高度相关
const isResizing = ref(false)
const startY = ref(0)
const startHeight = ref(0)

const panelHeight = computed(() => bottomPanelStore.height)

// 判断是否是最大化状态
const isMaximized = computed(() => bottomPanelStore.height > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400))

function startResize(e: MouseEvent) {
  isResizing.value = true
  startY.value = e.clientY
  startHeight.value = bottomPanelStore.height
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const delta = startY.value - e.clientY
  bottomPanelStore.setHeight(startHeight.value + delta)
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

function switchTab(tab: BottomPanelTab) {
  if (bottomPanelStore.activeTab === tab && bottomPanelStore.isVisible) {
    bottomPanelStore.togglePanel()
  } else {
    bottomPanelStore.setActiveTab(tab)
  }
}

function closePanel() {
  bottomPanelStore.setVisible(false)
}

function toggleMaximize() {
  if (bottomPanelStore.height > window.innerHeight / 2) {
    bottomPanelStore.setHeight(250)
  } else {
    bottomPanelStore.setHeight(window.innerHeight - 150)
  }
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <div
    class="bottom-panel"
    :class="{ visible: bottomPanelStore.isVisible, resizing: isResizing }"
    :style="{ height: bottomPanelStore.isVisible ? panelHeight + 'px' : '0' }"
  >
    <!-- 调整手柄 -->
    <div class="resize-handle" @mousedown="startResize"></div>

    <!-- 标签栏 -->
    <div class="panel-tabs">
      <div class="tabs-left">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="panel-tab"
          :class="{ active: bottomPanelStore.activeTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          <mdui-icon-terminal v-if="tab.icon === 'terminal'"></mdui-icon-terminal>
          <mdui-icon-output v-else-if="tab.icon === 'output'"></mdui-icon-output>
          <mdui-icon-error v-else-if="tab.icon === 'error'"></mdui-icon-error>
          <mdui-icon-bug-report v-else-if="tab.icon === 'bug-report'"></mdui-icon-bug-report>
          <span class="tab-label">{{ tab.label }}</span>
          <span
            v-if="tab.id === 'problems' && problemsStore.totalCount > 0"
            class="badge warn"
          >
            {{ problemsStore.errorCount + problemsStore.warningCount }}
          </span>
          <span
            v-if="tab.id === 'output' && bottomPanelStore.errorCount > 0"
            class="badge error"
          >
            {{ bottomPanelStore.errorCount }}
          </span>
        </button>
      </div>

      <div class="tabs-right">
        <mdui-button-icon @click="toggleMaximize" title="最大化/还原">
          <mdui-icon-expand-less v-if="isMaximized"></mdui-icon-expand-less>
          <mdui-icon-expand-more v-else></mdui-icon-expand-more>
        </mdui-button-icon>
        <mdui-button-icon @click="closePanel" title="关闭面板">
          <mdui-icon-close></mdui-icon-close>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 面板内容 -->
    <div class="panel-content">
      <TerminalPanel v-show="bottomPanelStore.activeTab === 'terminal'" />
      <OutputLog v-show="bottomPanelStore.activeTab === 'output'" />
      <ProblemsPanel v-show="bottomPanelStore.activeTab === 'problems'" />
      <DebugConsole v-show="bottomPanelStore.activeTab === 'debug-console'" />
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  display: flex;
  flex-direction: column;
  background: var(--mdui-color-surface);
  border-top: 1px solid var(--mdui-color-outline-variant);
  overflow: hidden;
  transition: height 0.15s ease;
}

.bottom-panel:not(.visible) {
  border-top: none;
}

.bottom-panel.resizing {
  transition: none;
  user-select: none;
}

.resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: var(--mdui-color-primary);
}

.panel-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  padding: 0 8px;
  flex-shrink: 0;
}

.tabs-left {
  display: flex;
  gap: 4px;
}

.tabs-right {
  display: flex;
  gap: 4px;
}

.tabs-right mdui-button-icon {
  --mdui-comp-button-icon-size: 28px;
}

.panel-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--mdui-color-on-surface-variant);
  font-size: 13px;
  transition: all 0.15s;
}

.panel-tab:hover {
  background: var(--mdui-color-surface-container-high);
  color: var(--mdui-color-on-surface);
}

.panel-tab.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.panel-tab mdui-icon-terminal,
.panel-tab mdui-icon-output,
.panel-tab mdui-icon-error,
.panel-tab mdui-icon-bug-report {
  font-size: 18px;
}

.badge {
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.badge.error {
  background: var(--mdui-color-error);
  color: var(--mdui-color-on-error);
}

.badge.warn {
  background: var(--mdui-color-warning, #ffb300);
  color: var(--mdui-color-on-warning, #000000);
}

.panel-content {
  flex: 1;
  overflow: hidden;
}

</style>
