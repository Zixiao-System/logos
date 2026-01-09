<script setup lang="ts">
/**
 * 提交分析对话框
 * 显示提交前的代码分析结果
 */

import { ref, computed, watch } from 'vue'
import { useCommitAnalysisStore } from '@/stores/commitAnalysis'
import { useFileExplorerStore } from '@/stores/fileExplorer'

// 导入图标
import '@mdui/icons/analytics.js'
import '@mdui/icons/security.js'
import '@mdui/icons/speed.js'
import '@mdui/icons/code.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/error.js'
import '@mdui/icons/info.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/close.js'
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/insert-drive-file.js'
import '@mdui/icons/add.js'
import '@mdui/icons/remove.js'
import '@mdui/icons/edit.js'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'commit'): void
}>()

const commitAnalysisStore = useCommitAnalysisStore()
const fileExplorerStore = useFileExplorerStore()

// 展开/折叠状态
const expandedSections = ref<Set<string>>(new Set(['suggestions', 'files']))

function toggleSection(section: string) {
  if (expandedSections.value.has(section)) {
    expandedSections.value.delete(section)
  } else {
    expandedSections.value.add(section)
  }
}

// 分析数据
const analysis = computed(() => commitAnalysisStore.currentAnalysis)
const isAnalyzing = computed(() => commitAnalysisStore.loading)

// 统计信息
const stats = computed(() => {
  if (!analysis.value) return null

  const suggestions = analysis.value.reviewSuggestions
  return {
    errors: suggestions.filter((s: { severity: string }) => s.severity === 'error').length,
    warnings: suggestions.filter((s: { severity: string }) => s.severity === 'warning').length,
    infos: suggestions.filter((s: { severity: string }) => s.severity === 'info').length,
    totalFiles: analysis.value.metrics.totalFilesChanged,
    linesAdded: analysis.value.metrics.totalLinesAdded,
    linesRemoved: analysis.value.metrics.totalLinesRemoved
  }
})

// 按类别分组的建议
const suggestionsByCategory = computed(() => {
  if (!analysis.value) return {}

  const grouped: Record<string, typeof analysis.value.reviewSuggestions> = {}
  for (const suggestion of analysis.value.reviewSuggestions) {
    if (!grouped[suggestion.category]) {
      grouped[suggestion.category] = []
    }
    grouped[suggestion.category].push(suggestion)
  }
  return grouped
})

// 获取类别图标
function getCategoryIcon(category: string): string {
  switch (category) {
    case 'security': return 'security'
    case 'performance': return 'speed'
    case 'style': return 'code'
    case 'complexity': return 'analytics'
    case 'test_coverage': return 'check-circle'
    default: return 'info'
  }
}

// 获取类别名称
function getCategoryName(category: string): string {
  switch (category) {
    case 'security': return '安全'
    case 'performance': return '性能'
    case 'style': return '代码风格'
    case 'complexity': return '复杂度'
    case 'test_coverage': return '测试覆盖'
    case 'duplication': return '代码重复'
    default: return category
  }
}

// 获取严重性颜色
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'error': return 'var(--mdui-color-error)'
    case 'warning': return '#ff9800'
    case 'info': return 'var(--mdui-color-primary)'
    default: return 'var(--mdui-color-outline)'
  }
}

// 获取文件变更类型图标和颜色
function getChangeTypeInfo(type: string) {
  switch (type) {
    case 'added':
      return { icon: 'add', color: '#4caf50' }
    case 'deleted':
      return { icon: 'remove', color: 'var(--mdui-color-error)' }
    case 'modified':
      return { icon: 'edit', color: '#ff9800' }
    case 'renamed':
      return { icon: 'drive-file-rename-outline', color: 'var(--mdui-color-primary)' }
    default:
      return { icon: 'insert-drive-file', color: 'var(--mdui-color-outline)' }
  }
}

// 执行分析
async function runAnalysis() {
  if (fileExplorerStore.rootPath) {
    await commitAnalysisStore.analyzeStagedChanges(fileExplorerStore.rootPath)
  }
}

// 关闭对话框
function handleClose() {
  emit('close')
}

// 确认提交
function handleCommit() {
  emit('commit')
  emit('close')
}

// 打开时自动分析
watch(() => props.open, (isOpen) => {
  if (isOpen && !analysis.value && !isAnalyzing.value) {
    runAnalysis()
  }
})
</script>

<template>
  <mdui-dialog
    :open="open"
    @close="handleClose"
    class="commit-analysis-dialog"
  >
    <div slot="headline" class="dialog-header">
      <mdui-icon-analytics></mdui-icon-analytics>
      提交分析
    </div>

    <div slot="description" class="dialog-content">
      <!-- 加载状态 -->
      <div v-if="isAnalyzing" class="loading-state">
        <mdui-circular-progress></mdui-circular-progress>
        <span>正在分析变更...</span>
      </div>

      <!-- 无变更 -->
      <div v-else-if="!analysis" class="empty-state">
        <mdui-icon-info></mdui-icon-info>
        <span>没有待提交的变更</span>
      </div>

      <!-- 分析结果 -->
      <template v-else>
        <!-- 统计摘要 -->
        <div class="stats-summary">
          <div class="stat-item">
            <span class="stat-value">{{ stats?.totalFiles }}</span>
            <span class="stat-label">文件</span>
          </div>
          <div class="stat-item additions">
            <span class="stat-value">+{{ stats?.linesAdded }}</span>
            <span class="stat-label">新增</span>
          </div>
          <div class="stat-item deletions">
            <span class="stat-value">-{{ stats?.linesRemoved }}</span>
            <span class="stat-label">删除</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item" v-if="stats?.errors">
            <mdui-icon-error style="color: var(--mdui-color-error)"></mdui-icon-error>
            <span class="stat-value error">{{ stats.errors }}</span>
          </div>
          <div class="stat-item" v-if="stats?.warnings">
            <mdui-icon-warning style="color: #ff9800"></mdui-icon-warning>
            <span class="stat-value warning">{{ stats.warnings }}</span>
          </div>
          <div class="stat-item" v-if="stats?.infos">
            <mdui-icon-info style="color: var(--mdui-color-primary)"></mdui-icon-info>
            <span class="stat-value">{{ stats.infos }}</span>
          </div>
          <div class="stat-item" v-if="!stats?.errors && !stats?.warnings && !stats?.infos">
            <mdui-icon-check-circle style="color: #4caf50"></mdui-icon-check-circle>
            <span class="stat-label">无问题</span>
          </div>
        </div>

        <!-- 建议列表 -->
        <div
          v-if="Object.keys(suggestionsByCategory).length > 0"
          class="section"
        >
          <div
            class="section-header"
            @click="toggleSection('suggestions')"
          >
            <mdui-icon-chevron-right
              :class="{ rotated: expandedSections.has('suggestions') }"
            ></mdui-icon-chevron-right>
            <span>审查建议</span>
            <span class="count">{{ analysis.reviewSuggestions.length }}</span>
          </div>

          <div
            v-if="expandedSections.has('suggestions')"
            class="section-content"
          >
            <div
              v-for="(suggestions, category) in suggestionsByCategory"
              :key="category"
              class="category-group"
            >
              <div class="category-header">
                <component :is="`mdui-icon-${getCategoryIcon(category)}`"></component>
                <span>{{ getCategoryName(category) }}</span>
                <span class="count">{{ suggestions.length }}</span>
              </div>

              <div
                v-for="(suggestion, index) in suggestions"
                :key="index"
                class="suggestion-item"
              >
                <div
                  class="severity-indicator"
                  :style="{ backgroundColor: getSeverityColor(suggestion.severity) }"
                ></div>
                <div class="suggestion-content">
                  <div class="suggestion-message">{{ suggestion.message }}</div>
                  <div class="suggestion-meta">
                    <span class="file-path">{{ suggestion.file }}</span>
                    <span v-if="suggestion.line" class="line-number">行 {{ suggestion.line }}</span>
                  </div>
                  <div v-if="suggestion.suggestion" class="suggestion-fix">
                    {{ suggestion.suggestion }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件列表 -->
        <div class="section">
          <div
            class="section-header"
            @click="toggleSection('files')"
          >
            <mdui-icon-chevron-right
              :class="{ rotated: expandedSections.has('files') }"
            ></mdui-icon-chevron-right>
            <span>变更文件</span>
            <span class="count">{{ analysis.changedFiles.length }}</span>
          </div>

          <div
            v-if="expandedSections.has('files')"
            class="section-content"
          >
            <div
              v-for="file in analysis.changedFiles"
              :key="file.path"
              class="file-item"
            >
              <component
                :is="`mdui-icon-${getChangeTypeInfo(file.changeType).icon}`"
                :style="{ color: getChangeTypeInfo(file.changeType).color }"
              ></component>
              <span class="file-path">{{ file.path }}</span>
              <span class="file-stats">
                <span class="additions">+{{ file.linesAdded }}</span>
                <span class="deletions">-{{ file.linesRemoved }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div slot="action">
      <mdui-button variant="text" @click="handleClose">取消</mdui-button>
      <mdui-button
        variant="filled"
        @click="handleCommit"
        :disabled="isAnalyzing || (stats?.errors ?? 0) > 0"
      >
        继续提交
      </mdui-button>
    </div>
  </mdui-dialog>
</template>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-content {
  min-width: 500px;
  max-height: 60vh;
  overflow-y: auto;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
  color: var(--mdui-color-on-surface-variant);
}

.stats-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  margin-bottom: 16px;
  background: var(--mdui-color-surface-container-low);
  border-radius: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--mdui-color-on-surface);
}

.stat-value.error {
  color: var(--mdui-color-error);
}

.stat-value.warning {
  color: #ff9800;
}

.stat-label {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.stat-item.additions .stat-value {
  color: #4caf50;
}

.stat-item.deletions .stat-value {
  color: var(--mdui-color-error);
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: var(--mdui-color-outline-variant);
}

.section {
  margin-bottom: 8px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  cursor: pointer;
  font-weight: 500;
}

.section-header:hover {
  background: var(--mdui-color-surface-container-low);
}

.section-header mdui-icon-chevron-right {
  transition: transform 0.2s;
}

.section-header mdui-icon-chevron-right.rotated {
  transform: rotate(90deg);
}

.section-header span {
  flex: 1;
}

.count {
  padding: 2px 8px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 10px;
  font-size: 11px;
  font-weight: normal;
  color: var(--mdui-color-on-surface-variant);
}

.section-content {
  padding: 0 12px 12px;
}

.category-group {
  margin-top: 12px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--mdui-color-on-surface-variant);
}

.category-header span {
  flex: 1;
}

.suggestion-item {
  display: flex;
  gap: 12px;
  padding: 8px;
  margin: 4px 0;
  background: var(--mdui-color-surface-container-low);
  border-radius: 8px;
}

.severity-indicator {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}

.suggestion-content {
  flex: 1;
  min-width: 0;
}

.suggestion-message {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
}

.suggestion-meta {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--mdui-color-outline);
}

.suggestion-fix {
  margin-top: 8px;
  padding: 8px;
  background: var(--mdui-color-surface-container-highest);
  border-radius: 4px;
  font-size: 12px;
  color: var(--mdui-color-primary);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.file-item:last-child {
  border-bottom: none;
}

.file-item .file-path {
  flex: 1;
  font-size: 13px;
  color: var(--mdui-color-on-surface);
}

.file-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-family: monospace;
}

.file-stats .additions {
  color: #4caf50;
}

.file-stats .deletions {
  color: var(--mdui-color-error);
}
</style>
