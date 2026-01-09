<script setup lang="ts">
/**
 * 检查面板
 * 显示代码检查结果
 */

import { computed, ref } from 'vue'
import { useInspectionStore } from '@/stores/inspection'
import { useEditorStore } from '@/stores/editor'
import type { InspectionResult, InspectionSeverity } from '@/types/inspection'

// 导入图标
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/lightbulb.js'
import '@mdui/icons/filter-list.js'
import '@mdui/icons/search.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/security.js'
import '@mdui/icons/speed.js'
import '@mdui/icons/code.js'
import '@mdui/icons/psychology.js'

const inspectionStore = useInspectionStore()
const editorStore = useEditorStore()

const searchText = ref('')
const selectedSeverity = ref<InspectionSeverity | 'all'>('all')
const selectedCategory = ref<string>('all')
const groupBy = ref<'file' | 'severity' | 'category'>('file')

// 更新过滤器
function updateFilter() {
  inspectionStore.setFilter({
    severity: selectedSeverity.value,
    category: selectedCategory.value,
    searchText: searchText.value
  })
}

// 按文件分组的结果
const groupedByFile = computed(() => {
  const grouped: Record<string, InspectionResult[]> = {}
  for (const result of inspectionStore.filteredResults) {
    const file = result.range.startLine > 0 ? getFilePath(result) : 'Unknown'
    if (!grouped[file]) {
      grouped[file] = []
    }
    grouped[file].push(result)
  }
  return grouped
})

// 按严重性分组的结果
const groupedBySeverity = computed(() => {
  const grouped: Record<InspectionSeverity, InspectionResult[]> = {
    error: [],
    warning: [],
    info: [],
    hint: []
  }
  for (const result of inspectionStore.filteredResults) {
    grouped[result.severity].push(result)
  }
  return grouped
})

// 按类别分组的结果
const groupedByCategory = computed(() => {
  const grouped: Record<string, InspectionResult[]> = {}
  for (const result of inspectionStore.filteredResults) {
    if (!grouped[result.category]) {
      grouped[result.category] = []
    }
    grouped[result.category].push(result)
  }
  return grouped
})

// 获取文件路径
function getFilePath(result: InspectionResult): string {
  // 从 store 中查找对应的文件
  for (const [path, results] of Object.entries(inspectionStore.resultsByFile)) {
    if (results.includes(result)) {
      return path
    }
  }
  return 'Unknown'
}

// 获取严重性图标
function getSeverityIcon(severity: InspectionSeverity): string {
  switch (severity) {
    case 'error': return 'error'
    case 'warning': return 'warning'
    case 'info': return 'info'
    case 'hint': return 'lightbulb'
  }
}

// 获取严重性颜色
function getSeverityColor(severity: InspectionSeverity): string {
  switch (severity) {
    case 'error': return 'var(--mdui-color-error)'
    case 'warning': return 'var(--mdui-color-warning, #ff9800)'
    case 'info': return 'var(--mdui-color-primary)'
    case 'hint': return 'var(--mdui-color-outline)'
  }
}

// 获取类别图标
function getCategoryIcon(category: string): string {
  switch (category) {
    case 'security': return 'security'
    case 'performance': return 'speed'
    case 'style': return 'code'
    case 'complexity': return 'psychology'
    default: return 'info'
  }
}

// 获取类别显示名称
function getCategoryName(category: string): string {
  switch (category) {
    case 'security': return '安全'
    case 'performance': return '性能'
    case 'style': return '代码风格'
    case 'complexity': return '复杂度'
    case 'correctness': return '正确性'
    case 'maintainability': return '可维护性'
    case 'deprecated': return '废弃用法'
    case 'best-practice': return '最佳实践'
    default: return category
  }
}

// 跳转到问题位置
async function navigateToResult(result: InspectionResult) {
  const filePath = getFilePath(result)
  if (filePath && filePath !== 'Unknown') {
    await editorStore.openFile(filePath)
    // TODO: 跳转到具体行号
  }
}

// 刷新检查
function refreshInspection() {
  const tab = editorStore.activeTab
  if (tab) {
    inspectionStore.inspectFile(tab.path, tab.content, tab.language)
  }
}

// 获取文件名
function getFileName(path: string): string {
  return path.split('/').pop() || path
}

// 折叠状态
const collapsedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string) {
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key)
  } else {
    collapsedGroups.value.add(key)
  }
}
</script>

<template>
  <div class="inspection-panel">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="search-box">
        <mdui-icon-search class="search-icon"></mdui-icon-search>
        <input
          v-model="searchText"
          @input="updateFilter"
          type="text"
          placeholder="搜索问题..."
        />
      </div>

      <div class="toolbar-actions">
        <mdui-button-icon @click="refreshInspection" title="刷新检查">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>

        <mdui-dropdown>
          <mdui-button-icon slot="trigger" title="过滤">
            <mdui-icon-filter-list></mdui-icon-filter-list>
          </mdui-button-icon>
          <mdui-menu>
            <mdui-menu-item @click="selectedSeverity = 'all'; updateFilter()">
              全部严重性
            </mdui-menu-item>
            <mdui-menu-item @click="selectedSeverity = 'error'; updateFilter()">
              <mdui-icon-error slot="icon" style="color: var(--mdui-color-error)"></mdui-icon-error>
              错误
            </mdui-menu-item>
            <mdui-menu-item @click="selectedSeverity = 'warning'; updateFilter()">
              <mdui-icon-warning slot="icon" style="color: #ff9800"></mdui-icon-warning>
              警告
            </mdui-menu-item>
            <mdui-menu-item @click="selectedSeverity = 'info'; updateFilter()">
              <mdui-icon-info slot="icon" style="color: var(--mdui-color-primary)"></mdui-icon-info>
              信息
            </mdui-menu-item>
            <mdui-divider></mdui-divider>
            <mdui-menu-item @click="groupBy = 'file'">
              按文件分组
            </mdui-menu-item>
            <mdui-menu-item @click="groupBy = 'severity'">
              按严重性分组
            </mdui-menu-item>
            <mdui-menu-item @click="groupBy = 'category'">
              按类别分组
            </mdui-menu-item>
          </mdui-menu>
        </mdui-dropdown>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span class="stat error" v-if="inspectionStore.errorCount > 0">
        <mdui-icon-error></mdui-icon-error>
        {{ inspectionStore.errorCount }}
      </span>
      <span class="stat warning" v-if="inspectionStore.warningCount > 0">
        <mdui-icon-warning></mdui-icon-warning>
        {{ inspectionStore.warningCount }}
      </span>
      <span class="stat hint" v-if="inspectionStore.hintCount > 0">
        <mdui-icon-lightbulb></mdui-icon-lightbulb>
        {{ inspectionStore.hintCount }}
      </span>
      <span v-if="inspectionStore.allResults.length === 0" class="no-issues">
        没有发现问题
      </span>
    </div>

    <!-- 结果列表 -->
    <div class="results-list">
      <!-- 按文件分组 -->
      <template v-if="groupBy === 'file'">
        <div
          v-for="(results, filePath) in groupedByFile"
          :key="filePath"
          class="result-group"
        >
          <div
            class="group-header"
            @click="toggleGroup(filePath)"
          >
            <mdui-icon-chevron-right
              :class="{ rotated: !collapsedGroups.has(filePath) }"
            ></mdui-icon-chevron-right>
            <span class="file-name">{{ getFileName(filePath) }}</span>
            <span class="count">{{ results.length }}</span>
          </div>

          <div
            v-if="!collapsedGroups.has(filePath)"
            class="group-content"
          >
            <div
              v-for="(result, index) in results"
              :key="index"
              class="result-item"
              @click="navigateToResult(result)"
            >
              <component
                :is="`mdui-icon-${getSeverityIcon(result.severity)}`"
                :style="{ color: getSeverityColor(result.severity) }"
              ></component>
              <div class="result-content">
                <div class="result-message">{{ result.message }}</div>
                <div class="result-meta">
                  <span class="rule-name">{{ result.ruleName }}</span>
                  <span class="location">行 {{ result.range.startLine }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 按严重性分组 -->
      <template v-else-if="groupBy === 'severity'">
        <div
          v-for="(results, severity) in groupedBySeverity"
          :key="severity"
          class="result-group"
          v-show="results.length > 0"
        >
          <div
            class="group-header"
            @click="toggleGroup(severity)"
          >
            <mdui-icon-chevron-right
              :class="{ rotated: !collapsedGroups.has(severity) }"
            ></mdui-icon-chevron-right>
            <component
              :is="`mdui-icon-${getSeverityIcon(severity as InspectionSeverity)}`"
              :style="{ color: getSeverityColor(severity as InspectionSeverity) }"
            ></component>
            <span class="severity-name">
              {{ severity === 'error' ? '错误' : severity === 'warning' ? '警告' : severity === 'info' ? '信息' : '提示' }}
            </span>
            <span class="count">{{ results.length }}</span>
          </div>

          <div
            v-if="!collapsedGroups.has(severity)"
            class="group-content"
          >
            <div
              v-for="(result, index) in results"
              :key="index"
              class="result-item"
              @click="navigateToResult(result)"
            >
              <div class="result-content">
                <div class="result-message">{{ result.message }}</div>
                <div class="result-meta">
                  <span class="rule-name">{{ result.ruleName }}</span>
                  <span class="file-path">{{ getFileName(getFilePath(result)) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 按类别分组 -->
      <template v-else>
        <div
          v-for="(results, category) in groupedByCategory"
          :key="category"
          class="result-group"
        >
          <div
            class="group-header"
            @click="toggleGroup(category)"
          >
            <mdui-icon-chevron-right
              :class="{ rotated: !collapsedGroups.has(category) }"
            ></mdui-icon-chevron-right>
            <component
              :is="`mdui-icon-${getCategoryIcon(category)}`"
            ></component>
            <span class="category-name">{{ getCategoryName(category) }}</span>
            <span class="count">{{ results.length }}</span>
          </div>

          <div
            v-if="!collapsedGroups.has(category)"
            class="group-content"
          >
            <div
              v-for="(result, index) in results"
              :key="index"
              class="result-item"
              @click="navigateToResult(result)"
            >
              <component
                :is="`mdui-icon-${getSeverityIcon(result.severity)}`"
                :style="{ color: getSeverityColor(result.severity) }"
              ></component>
              <div class="result-content">
                <div class="result-message">{{ result.message }}</div>
                <div class="result-meta">
                  <span class="rule-name">{{ result.ruleName }}</span>
                  <span class="file-path">{{ getFileName(getFilePath(result)) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.inspection-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--mdui-color-on-surface);
}

.search-icon {
  color: var(--mdui-color-outline);
  font-size: 18px;
}

.toolbar-actions {
  display: flex;
  gap: 4px;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  font-size: 13px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat.error {
  color: var(--mdui-color-error);
}

.stat.warning {
  color: #ff9800;
}

.stat.hint {
  color: var(--mdui-color-outline);
}

.no-issues {
  color: var(--mdui-color-on-surface-variant);
}

.results-list {
  flex: 1;
  overflow-y: auto;
}

.result-group {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.group-header:hover {
  background: var(--mdui-color-surface-container-low);
}

.group-header mdui-icon-chevron-right {
  transition: transform 0.2s;
}

.group-header mdui-icon-chevron-right.rotated {
  transform: rotate(90deg);
}

.file-name,
.severity-name,
.category-name {
  flex: 1;
}

.count {
  padding: 2px 8px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 10px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.group-content {
  padding-left: 16px;
}

.result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.result-item:hover {
  background: var(--mdui-color-surface-container-low);
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-message {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  word-break: break-word;
}

.result-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.rule-name {
  color: var(--mdui-color-primary);
}

.file-path,
.location {
  color: var(--mdui-color-outline);
}
</style>
