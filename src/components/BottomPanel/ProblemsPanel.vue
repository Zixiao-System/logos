<script setup lang="ts">
/**
 * Problems 面板
 * 聚合 Monaco markers 并支持筛选、分组与跳转
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useProblemsStore } from '@/stores/problems'
import { useEditorStore } from '@/stores/editor'

import '@mdui/icons/refresh.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/help.js'

const problemsStore = useProblemsStore()
const editorStore = useEditorStore()

const filterText = ref('')
const groupBy = ref<'file' | 'severity'>('file')
const expandedGroups = ref<Set<string>>(new Set())
const showSeverities = ref({
  error: true,
  warning: true,
  info: true,
  hint: false
})

const filteredItems = computed(() => {
  const text = filterText.value.trim().toLowerCase()
  return problemsStore.items.filter(item => {
    if (!showSeverities.value[item.severity]) return false
    if (!text) return true
    return (
      item.message.toLowerCase().includes(text) ||
      item.path.toLowerCase().includes(text) ||
      (item.source && item.source.toLowerCase().includes(text))
    )
  })
})

const groupedItems = computed(() => {
  const groups: Record<string, typeof filteredItems.value> = {}
  const items = filteredItems.value

  if (groupBy.value === 'file') {
    for (const item of items) {
      const key = item.path
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
  } else {
    for (const item of items) {
      const key = item.severity
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
  }

  return groups
})

const severityLabel = (severity: string) => {
  switch (severity) {
    case 'error': return '错误'
    case 'warning': return '警告'
    case 'info': return '信息'
    case 'hint': return '提示'
    default: return severity
  }
}

const getFileName = (path: string) => {
  return path.split(/[\\/]/).pop() || path
}

const toggleGroup = (key: string) => {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

const isGroupExpanded = (key: string) => expandedGroups.value.has(key)

const gotoProblem = async (item: typeof filteredItems.value[number]) => {
  await editorStore.navigateToLocation(item.path, item.line, item.column)
}

const refreshProblems = () => {
  problemsStore.refreshFromMonaco()
}

onMounted(() => {
  problemsStore.refreshFromMonaco()
})

watch(groupedItems, (groups) => {
  for (const key of Object.keys(groups)) {
    expandedGroups.value.add(key)
  }
})
</script>

<template>
  <div class="problems-panel">
    <div class="panel-toolbar">
      <div class="toolbar-left">
        <input
          v-model="filterText"
          class="filter-input"
          type="text"
          placeholder="筛选问题、文件或来源"
        />
        <div class="severity-filters">
          <button :class="{ active: showSeverities.error }" @click="showSeverities.error = !showSeverities.error" title="错误">
            <mdui-icon-error></mdui-icon-error>
            <span v-if="problemsStore.errorCount" class="count error">{{ problemsStore.errorCount }}</span>
          </button>
          <button :class="{ active: showSeverities.warning }" @click="showSeverities.warning = !showSeverities.warning" title="警告">
            <mdui-icon-warning></mdui-icon-warning>
            <span v-if="problemsStore.warningCount" class="count warn">{{ problemsStore.warningCount }}</span>
          </button>
          <button :class="{ active: showSeverities.info }" @click="showSeverities.info = !showSeverities.info" title="信息">
            <mdui-icon-info></mdui-icon-info>
          </button>
          <button :class="{ active: showSeverities.hint }" @click="showSeverities.hint = !showSeverities.hint" title="提示">
            <mdui-icon-help></mdui-icon-help>
          </button>
        </div>
        <mdui-segmented-button-group
          :value="groupBy"
          @change="(e: Event) => { groupBy = (e.target as HTMLInputElement).value as 'file' | 'severity' }"
          class="group-switch"
        >
          <mdui-segmented-button value="file">文件</mdui-segmented-button>
          <mdui-segmented-button value="severity">级别</mdui-segmented-button>
        </mdui-segmented-button-group>
      </div>
      <div class="toolbar-right">
        <mdui-button-icon @click="refreshProblems" title="刷新">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <div class="panel-body">
      <div v-if="filteredItems.length === 0" class="empty-state">
        <p v-if="problemsStore.totalCount === 0">暂无问题</p>
        <p v-else>没有匹配的结果</p>
      </div>
      <div v-else class="groups">
        <div v-for="(items, key) in groupedItems" :key="key" class="group">
          <div class="group-header" @click="toggleGroup(key)">
            <span class="group-title">
              <template v-if="groupBy === 'file'">
                {{ getFileName(key) }}
              </template>
              <template v-else>
                {{ severityLabel(key) }}
              </template>
            </span>
            <span class="group-subtitle" v-if="groupBy === 'file'">{{ key }}</span>
            <span class="group-count">{{ items.length }}</span>
          </div>
          <div v-show="isGroupExpanded(key)" class="group-items">
            <div
              v-for="item in items"
              :key="item.id"
              class="problem-item"
              :class="`severity-${item.severity}`"
              @click="gotoProblem(item)"
            >
              <div class="severity">
                <mdui-icon-error v-if="item.severity === 'error'"></mdui-icon-error>
                <mdui-icon-warning v-else-if="item.severity === 'warning'"></mdui-icon-warning>
                <mdui-icon-info v-else-if="item.severity === 'info'"></mdui-icon-info>
                <mdui-icon-help v-else></mdui-icon-help>
              </div>
              <div class="content">
                <div class="message">{{ item.message }}</div>
                <div class="meta">
                  <span class="file">{{ getFileName(item.path) }}</span>
                  <span class="location">{{ item.line }}:{{ item.column }}</span>
                  <span v-if="item.source" class="source">{{ item.source }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.problems-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-input {
  width: 220px;
  padding: 6px 8px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 6px;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
  font-size: 12px;
}

.filter-input:focus {
  outline: none;
  border-color: var(--mdui-color-primary);
}

.severity-filters {
  display: flex;
  gap: 4px;
}

.severity-filters button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--mdui-color-on-surface-variant);
  cursor: pointer;
}

.severity-filters button.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.severity-filters .count {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 10px;
  background: var(--mdui-color-surface-container-high);
}

.severity-filters .count.error {
  background: var(--mdui-color-error);
  color: var(--mdui-color-on-error);
}

.severity-filters .count.warn {
  background: var(--mdui-color-warning, #ffb300);
  color: var(--mdui-color-on-warning, #000000);
}

.group-switch {
  --mdui-comp-segmented-button-container-height: 28px;
  font-size: 12px;
}

.panel-body {
  flex: 1;
  overflow: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--mdui-color-on-surface-variant);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.group {
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--mdui-color-surface-container-high);
}

.group-title {
  font-size: 13px;
  font-weight: 600;
}

.group-subtitle {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.group-count {
  align-self: flex-start;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 12px;
  background: var(--mdui-color-surface-container);
}

.group-items {
  display: flex;
  flex-direction: column;
}

.problem-item {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  cursor: pointer;
  background: var(--mdui-color-surface);
}

.problem-item:hover {
  background: var(--mdui-color-surface-container);
}

.problem-item .severity {
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.problem-item .content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.problem-item .message {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
}

.problem-item .meta {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.problem-item.severity-error .severity {
  color: var(--mdui-color-error);
}

.problem-item.severity-warning .severity {
  color: var(--mdui-color-warning, #ffb300);
}

.problem-item.severity-info .severity,
.problem-item.severity-hint .severity {
  color: var(--mdui-color-primary);
}
</style>
