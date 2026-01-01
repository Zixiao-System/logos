<script setup lang="ts">
/**
 * TODO 面板组件
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useTodoStore, type TodoItem } from '@/stores/todos'
import { useEditorStore } from '@/stores/editor'
import type { WasmTodoKind } from '@/types/wasm'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/checklist.js'
import '@mdui/icons/search.js'
import '@mdui/icons/filter-list.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/note.js'
import '@mdui/icons/expand-more.js'
import '@mdui/icons/expand-less.js'

const todoStore = useTodoStore()
const editorStore = useEditorStore()

// 搜索文本
const searchText = ref('')

// 分组方式: 'file' | 'kind'
const groupBy = ref<'file' | 'kind'>('file')

// 展开状态
const expandedGroups = ref<Set<string>>(new Set())

// TODO 类型配置
const kindConfig: Record<WasmTodoKind, { label: string; color: string; icon: string }> = {
  todo: { label: 'TODO', color: '#4CAF50', icon: 'checklist' },
  fixme: { label: 'FIXME', color: '#F44336', icon: 'warning' },
  bug: { label: 'BUG', color: '#F44336', icon: 'bug-report' },
  hack: { label: 'HACK', color: '#FF9800', icon: 'warning' },
  xxx: { label: 'XXX', color: '#FF9800', icon: 'warning' },
  note: { label: 'NOTE', color: '#2196F3', icon: 'note' },
  optimize: { label: 'OPTIMIZE', color: '#9C27B0', icon: 'info' },
  custom: { label: 'CUSTOM', color: '#607D8B', icon: 'info' }
}

// 计算属性：过滤后的 TODO
const filteredItems = computed(() => {
  let items = todoStore.filteredItems
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    items = items.filter(item =>
      item.text.toLowerCase().includes(search) ||
      item.uri.toLowerCase().includes(search)
    )
  }
  return items
})

// 计算属性：分组后的 TODO
const groupedItems = computed(() => {
  const items = filteredItems.value
  const groups: Record<string, TodoItem[]> = {}

  if (groupBy.value === 'file') {
    for (const item of items) {
      const key = item.uri
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
  } else {
    for (const item of items) {
      const key = item.kind
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
  }

  return groups
})

// 获取文件名
const getFileName = (path: string) => {
  return path.split('/').pop() || path
}

// 切换分组展开
const toggleGroup = (key: string) => {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

// 检查分组是否展开
const isGroupExpanded = (key: string) => {
  return expandedGroups.value.has(key)
}

// 跳转到 TODO 位置
const gotoTodo = async (item: TodoItem) => {
  await editorStore.openFile(item.uri)
  // TODO: 跳转到具体行号
}

// 刷新
const handleRefresh = () => {
  todoStore.refresh()
}

// 切换类型筛选
const toggleKindFilter = (kind: WasmTodoKind) => {
  todoStore.toggleKindFilter(kind)
}

// 初始化
onMounted(() => {
  todoStore.refresh()
  // 默认展开所有分组
  for (const key of Object.keys(groupedItems.value)) {
    expandedGroups.value.add(key)
  }
})

// 监听分组变化，自动展开
watch(groupedItems, (newGroups) => {
  for (const key of Object.keys(newGroups)) {
    expandedGroups.value.add(key)
  }
})
</script>

<template>
  <div class="todo-panel">
    <!-- 头部工具栏 -->
    <div class="panel-header">
      <span class="title">TODO</span>
      <div class="actions">
        <mdui-button-icon @click="handleRefresh" title="刷新" :disabled="todoStore.loading">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 统计栏 -->
    <div class="stats-bar" v-if="todoStore.stats">
      <div class="stat-item" v-for="(config, kind) in kindConfig" :key="kind"
           :class="{ active: todoStore.filter.kinds.includes(kind) }"
           @click="toggleKindFilter(kind)"
           :title="`${config.label}: ${todoStore.countByKind[kind] || 0}`">
        <span class="stat-badge" :style="{ background: config.color }">
          {{ todoStore.countByKind[kind] || 0 }}
        </span>
        <span class="stat-label">{{ config.label }}</span>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <mdui-text-field
        v-model="searchText"
        placeholder="搜索 TODO..."
        variant="outlined"
        clearable
      >
        <mdui-icon-search slot="icon"></mdui-icon-search>
      </mdui-text-field>
      <mdui-segmented-button-group v-model="groupBy">
        <mdui-segmented-button value="file" title="按文件分组">文件</mdui-segmented-button>
        <mdui-segmented-button value="kind" title="按类型分组">类型</mdui-segmented-button>
      </mdui-segmented-button-group>
    </div>

    <!-- 加载状态 -->
    <div v-if="todoStore.loading" class="loading">
      <mdui-circular-progress></mdui-circular-progress>
    </div>

    <!-- TODO 列表 -->
    <div class="todo-list" v-else-if="filteredItems.length > 0">
      <div v-for="(items, key) in groupedItems" :key="key" class="todo-group">
        <!-- 分组头 -->
        <div class="group-header" @click="toggleGroup(key)">
          <mdui-icon-expand-more v-if="isGroupExpanded(key)"></mdui-icon-expand-more>
          <mdui-icon-expand-less v-else></mdui-icon-expand-less>
          <span class="group-title" v-if="groupBy === 'file'">
            {{ getFileName(key) }}
          </span>
          <span class="group-title" v-else :style="{ color: kindConfig[key as WasmTodoKind]?.color }">
            {{ kindConfig[key as WasmTodoKind]?.label || key }}
          </span>
          <span class="group-count">{{ items.length }}</span>
        </div>

        <!-- 分组内容 -->
        <div v-if="isGroupExpanded(key)" class="group-items">
          <div
            v-for="item in items"
            :key="`${item.uri}:${item.line}`"
            class="todo-item"
            @click="gotoTodo(item)"
          >
            <span class="todo-kind" :style="{ color: kindConfig[item.kind]?.color }">
              {{ kindConfig[item.kind]?.label || item.kind }}
            </span>
            <span class="todo-text">{{ item.text }}</span>
            <span class="todo-location">
              <template v-if="groupBy === 'kind'">{{ getFileName(item.uri) }}:</template>
              {{ item.line }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无 TODO -->
    <div v-else class="no-todos">
      <mdui-icon-checklist></mdui-icon-checklist>
      <p>没有找到 TODO 项</p>
    </div>
  </div>
</template>

<style scoped>
.todo-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
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

.panel-header .actions {
  display: flex;
  gap: 2px;
}

.panel-header mdui-button-icon {
  --mdui-comp-button-icon-size: 28px;
}

.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.2s;
}

.stat-item:hover {
  background: var(--mdui-color-surface-container);
}

.stat-item.active {
  background: var(--mdui-color-primary-container);
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  color: white;
  font-size: 10px;
  font-weight: 500;
}

.stat-label {
  color: var(--mdui-color-on-surface-variant);
}

.search-bar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.search-bar mdui-text-field {
  flex: 1;
  --mdui-comp-text-field-height: 32px;
  font-size: 13px;
}

.search-bar mdui-segmented-button-group {
  --mdui-comp-segmented-button-height: 32px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
}

.todo-group {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  background: var(--mdui-color-surface-container-low);
}

.group-header:hover {
  background: var(--mdui-color-surface-container);
}

.group-header mdui-icon-expand-more,
.group-header mdui-icon-expand-less {
  font-size: 18px;
  color: var(--mdui-color-on-surface-variant);
}

.group-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--mdui-color-surface-container-highest);
  color: var(--mdui-color-on-surface-variant);
  font-size: 11px;
}

.group-items {
  background: var(--mdui-color-surface);
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 32px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:hover {
  background: var(--mdui-color-surface-container);
}

.todo-kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.todo-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mdui-color-on-surface);
}

.todo-location {
  flex-shrink: 0;
  color: var(--mdui-color-on-surface-variant);
  font-size: 11px;
}

.no-todos {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  color: var(--mdui-color-on-surface-variant);
}

.no-todos p {
  margin: 0;
  font-size: 14px;
}

.no-todos mdui-icon-checklist {
  font-size: 48px;
  opacity: 0.5;
}
</style>
