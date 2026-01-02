<script setup lang="ts">
/**
 * Commit Analysis 面板组件
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useCommitAnalysisStore } from '@/stores/commitAnalysis'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import { useEditorStore } from '@/stores/editor'
import { useGitStore } from '@/stores/git'
import {
  categoryConfig,
  severityConfig,
  type SuggestionCategory,
  type SuggestionSeverity,
  type ReviewSuggestion
} from '@/types/commitAnalysis'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/analytics.js'
import '@mdui/icons/search.js'
import '@mdui/icons/filter-list.js'
import '@mdui/icons/expand-more.js'
import '@mdui/icons/expand-less.js'
import '@mdui/icons/security.js'
import '@mdui/icons/speed.js'
import '@mdui/icons/format-paint.js'
import '@mdui/icons/account-tree.js'
import '@mdui/icons/science.js'
import '@mdui/icons/description.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/history.js'
import '@mdui/icons/code.js'
import '@mdui/icons/insert-drive-file.js'

const commitAnalysisStore = useCommitAnalysisStore()
const fileExplorerStore = useFileExplorerStore()
const editorStore = useEditorStore()
const gitStore = useGitStore()

// 提交哈希输入
const commitHashInput = ref('')

// 分组方式: 'file' | 'category' | 'severity'
const groupBy = ref<'file' | 'category' | 'severity'>('severity')

// 展开状态
const expandedGroups = ref<Set<string>>(new Set())

// 计算属性：分组后的建议
const groupedSuggestions = computed(() => {
  const suggestions = commitAnalysisStore.filteredSuggestions
  const groups: Record<string, ReviewSuggestion[]> = {}

  if (groupBy.value === 'file') {
    for (const suggestion of suggestions) {
      const key = suggestion.file
      if (!groups[key]) groups[key] = []
      groups[key].push(suggestion)
    }
  } else if (groupBy.value === 'category') {
    for (const suggestion of suggestions) {
      const key = suggestion.category
      if (!groups[key]) groups[key] = []
      groups[key].push(suggestion)
    }
  } else {
    for (const suggestion of suggestions) {
      const key = suggestion.severity
      if (!groups[key]) groups[key] = []
      groups[key].push(suggestion)
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

// 跳转到建议位置
const gotoSuggestion = async (suggestion: ReviewSuggestion) => {
  const rootPath = fileExplorerStore.rootPath
  if (!rootPath) return

  const filePath = `${rootPath}/${suggestion.file}`
  await editorStore.openFile(filePath)
  // TODO: 跳转到具体行号
}

// 分析指定提交
const analyzeCommit = async () => {
  const rootPath = fileExplorerStore.rootPath
  if (!rootPath || !commitHashInput.value.trim()) return

  await commitAnalysisStore.analyzeCommit(rootPath, commitHashInput.value.trim())

  // 展开所有分组
  for (const key of Object.keys(groupedSuggestions.value)) {
    expandedGroups.value.add(key)
  }
}

// 分析暂存区
const analyzeStagedChanges = async () => {
  const rootPath = fileExplorerStore.rootPath
  if (!rootPath) return

  await commitAnalysisStore.analyzeStagedChanges(rootPath)

  // 展开所有分组
  for (const key of Object.keys(groupedSuggestions.value)) {
    expandedGroups.value.add(key)
  }
}

// 刷新分析
const handleRefresh = async () => {
  const rootPath = fileExplorerStore.rootPath
  if (!rootPath) return

  if (commitAnalysisStore.showStagedAnalysis) {
    await analyzeStagedChanges()
  } else if (commitAnalysisStore.selectedCommit) {
    await commitAnalysisStore.analyzeCommit(rootPath, commitAnalysisStore.selectedCommit)
  }
}

// 切换类别筛选
const toggleCategoryFilter = (category: SuggestionCategory) => {
  if (commitAnalysisStore.filterCategory === category) {
    commitAnalysisStore.setFilterCategory(null)
  } else {
    commitAnalysisStore.setFilterCategory(category)
  }
}

// 切换严重程度筛选
const toggleSeverityFilter = (severity: SuggestionSeverity) => {
  if (commitAnalysisStore.filterSeverity === severity) {
    commitAnalysisStore.setFilterSeverity(null)
  } else {
    commitAnalysisStore.setFilterSeverity(severity)
  }
}

// 获取分组标题
const getGroupTitle = (key: string): string => {
  if (groupBy.value === 'file') {
    return getFileName(key)
  } else if (groupBy.value === 'category') {
    return categoryConfig[key as SuggestionCategory]?.label || key
  } else {
    return severityConfig[key as SuggestionSeverity]?.label || key
  }
}

// 获取分组颜色
const getGroupColor = (key: string): string => {
  if (groupBy.value === 'category') {
    return categoryConfig[key as SuggestionCategory]?.color || '#607D8B'
  } else if (groupBy.value === 'severity') {
    return severityConfig[key as SuggestionSeverity]?.color || '#607D8B'
  }
  return 'var(--mdui-color-on-surface)'
}

// 初始化
onMounted(() => {
  // 默认展开所有分组
  for (const key of Object.keys(groupedSuggestions.value)) {
    expandedGroups.value.add(key)
  }
})

// 监听分组变化，自动展开
watch(groupedSuggestions, (newGroups) => {
  for (const key of Object.keys(newGroups)) {
    expandedGroups.value.add(key)
  }
})
</script>

<template>
  <div class="commit-analysis-panel">
    <!-- 头部工具栏 -->
    <div class="panel-header">
      <span class="title">COMMIT ANALYSIS</span>
      <div class="actions">
        <mdui-button-icon
          @click="handleRefresh"
          title="刷新"
          :disabled="commitAnalysisStore.loading || !commitAnalysisStore.hasAnalysis"
        >
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 提交选择器 -->
    <div class="commit-selector">
      <mdui-text-field
        v-model="commitHashInput"
        placeholder="输入提交哈希..."
        variant="outlined"
        clearable
        @keydown.enter="analyzeCommit"
      >
        <mdui-icon-history slot="icon"></mdui-icon-history>
      </mdui-text-field>
      <mdui-button variant="filled" @click="analyzeCommit" :disabled="!commitHashInput.trim()">
        分析
      </mdui-button>
      <mdui-button
        variant="tonal"
        @click="analyzeStagedChanges"
        :disabled="!gitStore.hasChanges"
        title="分析暂存区变更"
      >
        <mdui-icon-code slot="icon"></mdui-icon-code>
        暂存
      </mdui-button>
    </div>

    <!-- 严重程度统计 -->
    <div class="severity-stats" v-if="commitAnalysisStore.hasAnalysis">
      <div
        v-for="(config, severity) in severityConfig"
        :key="severity"
        class="stat-item"
        :class="{ active: commitAnalysisStore.filterSeverity === severity }"
        @click="toggleSeverityFilter(severity as SuggestionSeverity)"
        :title="`${config.label}: ${commitAnalysisStore.suggestionsBySeverity[severity as SuggestionSeverity]?.length || 0}`"
      >
        <span class="stat-badge" :style="{ background: config.color }">
          {{ commitAnalysisStore.suggestionsBySeverity[severity as SuggestionSeverity]?.length || 0 }}
        </span>
        <span class="stat-label">{{ config.label }}</span>
      </div>
    </div>

    <!-- 类别统计 -->
    <div class="category-stats" v-if="commitAnalysisStore.hasAnalysis">
      <div
        v-for="(config, category) in categoryConfig"
        :key="category"
        class="stat-chip"
        :class="{ active: commitAnalysisStore.filterCategory === category }"
        @click="toggleCategoryFilter(category as SuggestionCategory)"
        v-show="commitAnalysisStore.suggestionsByCategory[category as SuggestionCategory]?.length > 0"
      >
        <span class="chip-count" :style="{ background: config.color }">
          {{ commitAnalysisStore.suggestionsByCategory[category as SuggestionCategory]?.length || 0 }}
        </span>
        <span class="chip-label">{{ config.label }}</span>
      </div>
    </div>

    <!-- 分组选择器 -->
    <div class="group-selector" v-if="commitAnalysisStore.hasAnalysis">
      <mdui-segmented-button-group v-model="groupBy">
        <mdui-segmented-button value="severity" title="按严重程度分组">严重程度</mdui-segmented-button>
        <mdui-segmented-button value="category" title="按类别分组">类别</mdui-segmented-button>
        <mdui-segmented-button value="file" title="按文件分组">文件</mdui-segmented-button>
      </mdui-segmented-button-group>
    </div>

    <!-- 加载状态 -->
    <div v-if="commitAnalysisStore.loading" class="loading">
      <mdui-circular-progress></mdui-circular-progress>
    </div>

    <!-- 提交信息 -->
    <div v-else-if="commitAnalysisStore.hasAnalysis" class="analysis-content">
      <!-- 提交概览 -->
      <div class="commit-info">
        <div class="commit-hash">
          {{ commitAnalysisStore.currentAnalysis?.commitHash?.slice(0, 7) || 'Staged' }}
        </div>
        <div class="commit-message">
          {{ commitAnalysisStore.currentAnalysis?.commitMessage || '暂存区变更' }}
        </div>
        <div class="commit-meta" v-if="commitAnalysisStore.currentAnalysis?.author">
          {{ commitAnalysisStore.currentAnalysis.author }} •
          {{ commitAnalysisStore.currentAnalysis.date }}
        </div>
      </div>

      <!-- 指标 -->
      <div class="metrics" v-if="commitAnalysisStore.currentAnalysis?.metrics">
        <div class="metric">
          <span class="metric-value">{{ commitAnalysisStore.currentAnalysis.metrics.totalFilesChanged }}</span>
          <span class="metric-label">文件</span>
        </div>
        <div class="metric added">
          <span class="metric-value">+{{ commitAnalysisStore.currentAnalysis.metrics.totalLinesAdded }}</span>
          <span class="metric-label">新增</span>
        </div>
        <div class="metric removed">
          <span class="metric-value">-{{ commitAnalysisStore.currentAnalysis.metrics.totalLinesRemoved }}</span>
          <span class="metric-label">删除</span>
        </div>
      </div>

      <!-- 建议列表 -->
      <div class="suggestions-list" v-if="commitAnalysisStore.filteredSuggestions.length > 0">
        <div v-for="(items, key) in groupedSuggestions" :key="key" class="suggestion-group">
          <!-- 分组头 -->
          <div class="group-header" @click="toggleGroup(key)">
            <mdui-icon-expand-more v-if="isGroupExpanded(key)"></mdui-icon-expand-more>
            <mdui-icon-expand-less v-else></mdui-icon-expand-less>
            <span class="group-title" :style="{ color: getGroupColor(key) }">
              {{ getGroupTitle(key) }}
            </span>
            <span class="group-count">{{ items.length }}</span>
          </div>

          <!-- 分组内容 -->
          <div v-if="isGroupExpanded(key)" class="group-items">
            <div
              v-for="(item, index) in items"
              :key="`${item.file}:${item.line}:${index}`"
              class="suggestion-item"
              @click="gotoSuggestion(item)"
            >
              <span
                class="suggestion-severity"
                :style="{ color: severityConfig[item.severity].color }"
              >
                {{ severityConfig[item.severity].label }}
              </span>
              <span
                class="suggestion-category"
                :style="{ background: categoryConfig[item.category].color }"
              >
                {{ categoryConfig[item.category].label }}
              </span>
              <span class="suggestion-message">{{ item.message }}</span>
              <span class="suggestion-location">
                <template v-if="groupBy !== 'file'">{{ getFileName(item.file) }}:</template>
                {{ item.line }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 无问题 -->
      <div v-else class="no-issues">
        <mdui-icon-analytics></mdui-icon-analytics>
        <p>没有发现问题</p>
      </div>
    </div>

    <!-- 未分析 -->
    <div v-else class="no-analysis">
      <mdui-icon-analytics></mdui-icon-analytics>
      <p>输入提交哈希或分析暂存区变更</p>
    </div>
  </div>
</template>

<style scoped>
.commit-analysis-panel {
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

.commit-selector {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.commit-selector mdui-text-field {
  flex: 1;
  --mdui-comp-text-field-height: 32px;
  font-size: 13px;
}

.commit-selector mdui-button {
  --mdui-comp-button-height: 32px;
  font-size: 12px;
}

.severity-stats {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
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
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  color: white;
  font-size: 11px;
  font-weight: 500;
}

.stat-label {
  color: var(--mdui-color-on-surface-variant);
}

.category-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 11px;
  background: var(--mdui-color-surface-container);
  transition: all 0.2s;
}

.stat-chip:hover {
  background: var(--mdui-color-surface-container-high);
}

.stat-chip.active {
  background: var(--mdui-color-primary-container);
}

.chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  color: white;
  font-size: 9px;
  font-weight: 500;
}

.chip-label {
  color: var(--mdui-color-on-surface-variant);
}

.group-selector {
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.group-selector mdui-segmented-button-group {
  --mdui-comp-segmented-button-height: 28px;
  width: 100%;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.analysis-content {
  flex: 1;
  overflow-y: auto;
}

.commit-info {
  padding: 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container-low);
}

.commit-hash {
  font-family: monospace;
  font-size: 12px;
  color: var(--mdui-color-primary);
  margin-bottom: 4px;
}

.commit-message {
  font-size: 13px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
  margin-bottom: 4px;
}

.commit-meta {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.metrics {
  display: flex;
  gap: 16px;
  padding: 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  font-family: monospace;
}

.metric-label {
  font-size: 10px;
  color: var(--mdui-color-on-surface-variant);
  text-transform: uppercase;
}

.metric.added .metric-value {
  color: #43a047;
}

.metric.removed .metric-value {
  color: #e53935;
}

.suggestions-list {
  flex: 1;
}

.suggestion-group {
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

.suggestion-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 8px 32px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-item:hover {
  background: var(--mdui-color-surface-container);
}

.suggestion-severity {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.suggestion-category {
  flex-shrink: 0;
  padding: 1px 4px;
  border-radius: 3px;
  color: white;
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
}

.suggestion-message {
  flex: 1;
  min-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mdui-color-on-surface);
}

.suggestion-location {
  flex-shrink: 0;
  color: var(--mdui-color-on-surface-variant);
  font-size: 11px;
  font-family: monospace;
}

.no-issues,
.no-analysis {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  color: var(--mdui-color-on-surface-variant);
}

.no-issues p,
.no-analysis p {
  margin: 0;
  font-size: 14px;
}

.no-issues mdui-icon-analytics,
.no-analysis mdui-icon-analytics {
  font-size: 48px;
  opacity: 0.5;
}
</style>
