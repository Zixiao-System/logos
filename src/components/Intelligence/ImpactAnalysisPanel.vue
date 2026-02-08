<template>
  <div class="impact-analysis-panel">
    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <div class="toolbar-title">
        <mdui-icon-analytics></mdui-icon-analytics>
        <span>Impact Analysis</span>
      </div>
      <div class="toolbar-actions">
        <!-- 分组方式切换 -->
        <mdui-select
          :value="groupBy"
          @change="(e: Event) => { groupBy = (e.target as HTMLSelectElement).value as any; store.setGroupBy(groupBy) }"
          class="group-select"
        >
          <mdui-menu-item value="category">By Category</mdui-menu-item>
          <mdui-menu-item value="file">By File</mdui-menu-item>
          <mdui-menu-item value="level">By Risk Level</mdui-menu-item>
        </mdui-select>

        <!-- 刷新按钮 -->
        <mdui-button-icon @click="handleRefresh" title="Refresh">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>

        <!-- 清除按钮 -->
        <mdui-button-icon @click="store.clear()" title="Clear">
          <mdui-icon-clear></mdui-icon-clear>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="panel-content">
      <!-- 加载状态 -->
      <div v-if="store.isAnalyzing" class="loading-state">
        <mdui-icon-sync class="spinning"></mdui-icon-sync>
        <span>Analyzing impact...</span>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="store.error" class="error-state">
        <mdui-icon-error-outline></mdui-icon-error-outline>
        <span>{{ store.error }}</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!store.hasData" class="empty-state">
        <mdui-icon-analytics class="empty-icon"></mdui-icon-analytics>
        <p>No impact analysis data</p>
        <p class="hint">
          Right-click on a function or method and select<br />
          "Analyze Impact" to see what would be affected by changes
        </p>
      </div>

      <!-- 分析结果 -->
      <div v-else class="analysis-content">
        <!-- 统计摘要 -->
        <div class="stats-summary">
          <div class="stats-header">
            <span class="target-label">Impact of changes to:</span>
            <span class="target-name">{{ store.targetSymbol?.name }}</span>
          </div>

          <div class="stats-grid">
            <!-- 总影响 -->
            <div class="stat-item">
              <div class="stat-value">{{ store.stats?.totalAffected || 0 }}</div>
              <div class="stat-label">Total Affected</div>
            </div>

            <!-- 直接影响 -->
            <div class="stat-item">
              <div class="stat-value direct">{{ store.stats?.directImpact || 0 }}</div>
              <div class="stat-label">Direct</div>
            </div>

            <!-- 间接影响 -->
            <div class="stat-item">
              <div class="stat-value indirect">{{ store.stats?.indirectImpact || 0 }}</div>
              <div class="stat-label">Indirect</div>
            </div>

            <!-- 受影响测试 -->
            <div class="stat-item">
              <div class="stat-value tests">{{ store.stats?.affectedTests || 0 }}</div>
              <div class="stat-label">Tests</div>
            </div>
          </div>

          <!-- 风险级别 -->
          <div class="risk-indicator" :class="store.stats?.riskLevel">
            <component :is="riskIcon"></component>
            <span>{{ riskLabel }} Risk</span>
          </div>
        </div>

        <!-- 分组列表 -->
        <div class="impact-groups">
          <div
            v-for="(items, group) in store.groupedImpacts"
            :key="group"
            class="impact-group"
          >
            <!-- 分组头 -->
            <div
              class="group-header"
              @click="store.toggleGroup(group)"
            >
              <mdui-icon-expand-more
                v-if="!store.isGroupExpanded(group)"
                class="expand-icon"
              ></mdui-icon-expand-more>
              <mdui-icon-expand-less
                v-else
                class="expand-icon"
              ></mdui-icon-expand-less>
              <span class="group-title">{{ getGroupTitle(group) }}</span>
              <span class="group-count">{{ items.length }}</span>
            </div>

            <!-- 分组内容 -->
            <div v-if="store.isGroupExpanded(group)" class="group-items">
              <div
                v-for="item in items"
                :key="`${item.symbol.uri}:${item.symbol.range.start.line}`"
                class="impact-item"
                :class="{ selected: isItemSelected(item) }"
                @click="store.selectItem(item)"
                @dblclick="store.navigateToSymbol(item)"
              >
                <div class="item-icon" :class="item.level">
                  <component :is="getLevelIcon(item.level)"></component>
                </div>
                <span class="item-name">{{ item.symbol.name }}</span>
                <span class="item-file">{{ getFileName(item.symbol.uri) }}</span>
                <span class="item-line">:{{ item.symbol.range.start.line + 1 }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 历史记录 -->
        <div v-if="store.history.length > 1" class="history-section">
          <div class="history-header">
            <mdui-icon-history></mdui-icon-history>
            <span>Recent Analysis</span>
          </div>
          <div class="history-list">
            <div
              v-for="record in store.history.slice(1, 5)"
              :key="record.timestamp"
              class="history-item"
              @click="store.restoreFromHistory(record)"
            >
              <span class="history-name">{{ record.symbol.name }}</span>
              <span class="history-stats">{{ record.stats.totalAffected }} affected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import {
  useImpactAnalysisStore,
  getRiskLevelIcon,
  getCategoryLabel,
  type ImpactItem,
  type ImpactLevel,
} from '@/stores/impactAnalysis'

// 导入图标
import '@mdui/icons/analytics.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/clear.js'
import '@mdui/icons/sync.js'
import '@mdui/icons/error-outline.js'
import '@mdui/icons/expand-more.js'
import '@mdui/icons/expand-less.js'
import '@mdui/icons/history.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/check-circle.js'

const store = useImpactAnalysisStore()
const groupBy = ref(store.groupBy)

/** 风险图标组件 */
const riskIcon = computed(() => {
  const iconName = getRiskLevelIcon(store.stats?.riskLevel || 'low')
  return defineAsyncComponent(async () => {
    try {
      await import(`@mdui/icons/${iconName}.js`)
      return {
        template: `<mdui-icon-${iconName}></mdui-icon-${iconName}>`,
      }
    } catch {
      return {
        template: '<mdui-icon-info></mdui-icon-info>',
      }
    }
  })
})

/** 风险标签 */
const riskLabel = computed(() => {
  const level = store.stats?.riskLevel || 'low'
  return level.charAt(0).toUpperCase() + level.slice(1)
})

/** 获取分组标题 */
const getGroupTitle = (group: string): string => {
  if (store.groupBy === 'category') {
    return getCategoryLabel(group as ImpactItem['category'])
  }
  if (store.groupBy === 'level') {
    return group.charAt(0).toUpperCase() + group.slice(1) + ' Risk'
  }
  return group
}

/** 获取级别图标 */
const getLevelIcon = (level: ImpactLevel) => {
  const iconName = getRiskLevelIcon(level)
  return defineAsyncComponent(async () => {
    try {
      await import(`@mdui/icons/${iconName}.js`)
      return {
        template: `<mdui-icon-${iconName}></mdui-icon-${iconName}>`,
      }
    } catch {
      return {
        template: '<mdui-icon-info></mdui-icon-info>',
      }
    }
  })
}

/** 获取文件名 */
const getFileName = (uri: string): string => {
  const path = uri.replace('file://', '')
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

/** 检查项是否选中 */
const isItemSelected = (item: ImpactItem): boolean => {
  if (!store.selectedItem) return false
  return (
    store.selectedItem.symbol.uri === item.symbol.uri &&
    store.selectedItem.symbol.range.start.line === item.symbol.range.start.line
  )
}

/** 处理刷新 */
const handleRefresh = async () => {
  if (store.targetSymbol) {
    const uri = store.targetSymbol.uri
    const line = store.targetSymbol.range.start.line
    const col = store.targetSymbol.range.start.character
    await store.analyzeImpact(uri, line, col)
  }
}

/** 处理外部触发的影响分析事件 */
const handleAnalyzeImpact = (event: CustomEvent) => {
  const { uri, line, column } = event.detail
  store.analyzeImpact(uri, line, column)
}

onMounted(() => {
  window.addEventListener('analyze-impact', handleAnalyzeImpact as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('analyze-impact', handleAnalyzeImpact as EventListener)
})
</script>

<style scoped>
.impact-analysis-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
}

/* 工具栏 */
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.toolbar-title mdui-icon-analytics {
  font-size: 16px;
  color: var(--mdui-color-primary);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-select {
  --mdui-comp-select-height: 28px;
  font-size: 12px;
}

.toolbar-actions mdui-button-icon {
  --mdui-comp-icon-button-shape-corner: 4px;
  --mdui-comp-icon-button-size: 28px;
}

/* 内容区域 */
.panel-content {
  flex: 1;
  overflow: auto;
}

/* 状态展示 */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.empty-state .empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  text-align: center;
}

.empty-state .hint {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
}

.spinning {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 分析结果 */
.analysis-content {
  display: flex;
  flex-direction: column;
}

/* 统计摘要 */
.stats-summary {
  padding: 12px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.target-label {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.target-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--mdui-color-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--mdui-color-on-surface);
}

.stat-value.direct {
  color: var(--mdui-color-error);
}

.stat-value.indirect {
  color: var(--mdui-color-warning, #ff9800);
}

.stat-value.tests {
  color: var(--mdui-color-tertiary, #2196f3);
}

.stat-label {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.risk-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.risk-indicator.low {
  background: var(--mdui-color-tertiary-container, rgba(76, 175, 80, 0.2));
  color: var(--mdui-color-on-tertiary-container, #4caf50);
}

.risk-indicator.medium {
  background: var(--mdui-color-warning-container, rgba(255, 193, 7, 0.2));
  color: var(--mdui-color-on-warning-container, #795500);
}

.risk-indicator.high {
  background: rgba(255, 152, 0, 0.2);
  color: #e65100;
}

.risk-indicator.critical {
  background: var(--mdui-color-error-container, rgba(244, 67, 54, 0.2));
  color: var(--mdui-color-on-error-container, #f44336);
}

/* 分组列表 */
.impact-groups {
  padding: 8px 0;
}

.impact-group {
  margin-bottom: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.group-header:hover {
  background: var(--mdui-color-surface-container);
}

.expand-icon {
  font-size: 18px;
  color: var(--mdui-color-on-surface-variant);
}

.group-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.group-count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--mdui-color-surface-container-highest);
  border-radius: 10px;
  color: var(--mdui-color-on-surface-variant);
}

.group-items {
  padding: 4px 0;
}

.impact-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 32px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.impact-item:hover {
  background: var(--mdui-color-surface-container);
}

.impact-item.selected {
  background: var(--mdui-color-secondary-container);
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.item-icon.low { color: #4caf50; }
.item-icon.medium { color: #ffc107; }
.item-icon.high { color: #ff9800; }
.item-icon.critical { color: #f44336; }

.item-icon :deep([class^="mdui-icon-"]) {
  font-size: 14px;
}

.item-name {
  font-size: 12px;
  font-weight: 500;
}

.item-file {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  margin-left: auto;
}

.item-line {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  font-family: monospace;
}

/* 历史记录 */
.history-section {
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
}

.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  margin-bottom: 8px;
}

.history-header mdui-icon-history {
  font-size: 14px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.history-item:hover {
  background: var(--mdui-color-surface-container-highest);
}

.history-name {
  font-weight: 500;
}

.history-stats {
  color: var(--mdui-color-on-surface-variant);
}
</style>
