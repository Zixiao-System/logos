<script setup lang="ts">
/**
 * Output Log 组件
 * 显示应用程序输出日志，类似 VS Code 的 OUTPUT 面板
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useBottomPanelStore, type OutputLogEntry } from '@/stores/bottomPanel'

// 导入图标
import '@mdui/icons/delete.js'
import '@mdui/icons/search.js'
import '@mdui/icons/info.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/error.js'
import '@mdui/icons/bug-report.js'

const bottomPanelStore = useBottomPanelStore()

// 日志容器引用
const logContainer = ref<HTMLElement | null>(null)

// 筛选器状态
const filterLevel = ref<OutputLogEntry['level'] | 'all'>('all')
const filterSource = ref<string>('')
const autoScroll = ref(true)
const filterText = ref('')

// 获取所有来源
const sources = computed(() => {
  const sourceSet = new Set(bottomPanelStore.outputLogs.map(log => log.source))
  return Array.from(sourceSet).sort()
})

// 筛选后的日志
const filteredLogs = computed(() => {
  let logs = bottomPanelStore.outputLogs

  if (filterLevel.value !== 'all') {
    logs = logs.filter(log => log.level === filterLevel.value)
  }

  if (filterSource.value) {
    logs = logs.filter(log => log.source === filterSource.value)
  }

  if (filterText.value.trim()) {
    const query = filterText.value.trim().toLowerCase()
    logs = logs.filter(log => log.message.toLowerCase().includes(query))
  }

  return logs
})

// 格式化时间
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  const ms = date.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

// 获取日志级别图标和样式
function getLevelClass(level: OutputLogEntry['level']): string {
  return `log-level-${level}`
}

// 清空日志
function clearLogs() {
  bottomPanelStore.clearLogs()
}

// 自动滚动到底部
watch(() => bottomPanelStore.outputLogs.length, async () => {
  if (autoScroll.value) {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  }
})

// 检测用户滚动行为
function onScroll() {
  if (!logContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = logContainer.value
  autoScroll.value = scrollTop + clientHeight >= scrollHeight - 10
}

onMounted(() => {
  // 添加一些示例日志
  if (bottomPanelStore.outputLogs.length === 0) {
    bottomPanelStore.logInfo('System', 'Output panel initialized')
  }
})
</script>

<template>
  <div class="output-log">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="text-filter">
          <mdui-icon-search></mdui-icon-search>
          <input v-model="filterText" type="text" placeholder="筛选日志内容" />
        </div>
        <!-- 来源筛选 -->
        <mdui-select
          :value="filterSource"
          @change="(e: Event) => { filterSource = (e.target as HTMLSelectElement).value }"
          class="source-select"
          placeholder="所有来源"
          clearable
        >
          <mdui-menu-item v-for="source in sources" :key="source" :value="source">
            {{ source }}
          </mdui-menu-item>
        </mdui-select>

        <!-- 级别筛选 -->
        <div class="level-filters">
          <button
            :class="{ active: filterLevel === 'all' }"
            @click="filterLevel = 'all'"
            title="显示全部"
          >
            全部
          </button>
          <button
            :class="{ active: filterLevel === 'info' }"
            @click="filterLevel = 'info'"
            title="仅显示信息"
          >
            <mdui-icon-info></mdui-icon-info>
          </button>
          <button
            :class="{ active: filterLevel === 'warn' }"
            @click="filterLevel = 'warn'"
            title="仅显示警告"
          >
            <mdui-icon-warning></mdui-icon-warning>
            <span v-if="bottomPanelStore.warningCount > 0" class="count">
              {{ bottomPanelStore.warningCount }}
            </span>
          </button>
          <button
            :class="{ active: filterLevel === 'error' }"
            @click="filterLevel = 'error'"
            title="仅显示错误"
          >
            <mdui-icon-error></mdui-icon-error>
            <span v-if="bottomPanelStore.errorCount > 0" class="count error">
              {{ bottomPanelStore.errorCount }}
            </span>
          </button>
          <button
            :class="{ active: filterLevel === 'debug' }"
            @click="filterLevel = 'debug'"
            title="仅显示调试"
          >
            <mdui-icon-bug-report></mdui-icon-bug-report>
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <mdui-button-icon @click="clearLogs" title="清空日志">
          <mdui-icon-delete></mdui-icon-delete>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 日志列表 -->
    <div ref="logContainer" class="log-container" @scroll="onScroll">
      <div v-if="filteredLogs.length === 0" class="empty-state">
        <p>暂无日志输出</p>
      </div>
      <div
        v-else
        v-for="log in filteredLogs"
        :key="log.id"
        class="log-entry"
        :class="getLevelClass(log.level)"
      >
        <span class="log-time">{{ formatTime(log.timestamp) }}</span>
        <span class="log-level">
          <mdui-icon-info v-if="log.level === 'info'"></mdui-icon-info>
          <mdui-icon-warning v-else-if="log.level === 'warn'"></mdui-icon-warning>
          <mdui-icon-error v-else-if="log.level === 'error'"></mdui-icon-error>
          <mdui-icon-bug-report v-else-if="log.level === 'debug'"></mdui-icon-bug-report>
        </span>
        <span class="log-source">[{{ log.source }}]</span>
        <span class="log-message">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.output-log {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.text-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 4px;
  background: var(--mdui-color-surface);
  font-size: 12px;
}

.text-filter input {
  border: none;
  background: transparent;
  color: var(--mdui-color-on-surface);
  font-size: 12px;
  width: 140px;
}

.text-filter input:focus {
  outline: none;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.toolbar-right mdui-button-icon {
  --mdui-comp-button-icon-size: 28px;
}

.source-select {
  --mdui-comp-select-height: 28px;
  font-size: 12px;
  min-width: 120px;
}

.level-filters {
  display: flex;
  gap: 2px;
}

.level-filters button {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--mdui-color-on-surface-variant);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.level-filters button:hover {
  background: var(--mdui-color-surface-container-high);
}

.level-filters button.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.level-filters button mdui-icon-info,
.level-filters button mdui-icon-warning,
.level-filters button mdui-icon-error,
.level-filters button mdui-icon-bug-report {
  font-size: 16px;
}

.level-filters .count {
  padding: 0 4px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 8px;
  font-size: 10px;
}

.level-filters .count.error {
  background: var(--mdui-color-error);
  color: var(--mdui-color-on-error);
}

.log-container {
  flex: 1;
  overflow: auto;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--mdui-color-on-surface-variant);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.log-entry:hover {
  background: var(--mdui-color-surface-container);
}

.log-time {
  color: var(--mdui-color-outline);
  flex-shrink: 0;
  font-size: 11px;
}

.log-level {
  flex-shrink: 0;
  width: 16px;
  display: flex;
  align-items: center;
}

.log-level mdui-icon-info,
.log-level mdui-icon-warning,
.log-level mdui-icon-error,
.log-level mdui-icon-bug-report {
  font-size: 14px;
}

.log-source {
  color: var(--mdui-color-primary);
  flex-shrink: 0;
  font-size: 11px;
}

.log-message {
  color: var(--mdui-color-on-surface);
  word-break: break-all;
  white-space: pre-wrap;
}

/* 日志级别颜色 */
.log-level-info .log-level {
  color: var(--mdui-color-primary);
}

.log-level-warn {
  background: rgba(251, 191, 36, 0.1);
}

.log-level-warn .log-level {
  color: #f59e0b;
}

.log-level-error {
  background: rgba(239, 68, 68, 0.1);
}

.log-level-error .log-level {
  color: var(--mdui-color-error);
}

.log-level-debug .log-level {
  color: var(--mdui-color-outline);
}

.log-level-debug .log-message {
  color: var(--mdui-color-on-surface-variant);
}
</style>
