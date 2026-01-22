<script setup lang="ts">
/**
 * DevOps 仪表板视图
 * 显示流水线状态和监控指标
 * TODO：需要缪尔赛思CI完成  
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDevOpsStore } from '@/stores/devops'
import type { Pipeline, PipelineStatus } from '@/types'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/wifi.js'
import '@mdui/icons/trending-up.js'
import '@mdui/icons/trending-down.js'
import '@mdui/icons/trending-flat.js'
import '@mdui/icons/pending.js'
import '@mdui/icons/cancel.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/add.js'
import '@mdui/icons/source.js'
import '@mdui/icons/commit.js'
import '@mdui/icons/person.js'
import '@mdui/icons/schedule.js'
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/block.js'
import '@mdui/icons/help.js'

const devOpsStore = useDevOpsStore()

// 选中的流水线详情
const showDetailDialog = ref(false)

// 初始化
onMounted(async () => {
  await devOpsStore.init()
  startAutoRefresh()
})

// 自动刷新
let refreshInterval: ReturnType<typeof setInterval> | null = null

const startAutoRefresh = () => {
  refreshInterval = setInterval(() => {
    devOpsStore.fetchPipelines()
    devOpsStore.fetchMetrics()
  }, 30000)
}

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// 刷新
const handleRefresh = () => {
  devOpsStore.fetchPipelines()
  devOpsStore.fetchMetrics()
}

// 获取状态颜色
const getStatusColor = (status: PipelineStatus | string) => {
  switch (status) {
    case 'success': return 'var(--mdui-color-primary)'
    case 'running': return 'var(--mdui-color-tertiary)'
    case 'failed': return 'var(--mdui-color-error)'
    case 'pending': return 'var(--mdui-color-outline)'
    case 'cancelled': return 'var(--mdui-color-on-surface-variant)'
    default: return 'var(--mdui-color-outline)'
  }
}

// 获取状态文本
const getStatusText = (status: PipelineStatus | string) => {
  switch (status) {
    case 'success': return '成功'
    case 'running': return '运行中'
    case 'failed': return '失败'
    case 'pending': return '等待中'
    case 'cancelled': return '已取消'
    default: return status
  }
}

// 格式化时长
const formatDuration = (seconds: number | null) => {
  if (seconds === null) return '-'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

// 格式化时间
const formatTime = (isoString: string) => {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 触发流水线
const handleTrigger = async (pipeline: Pipeline) => {
  await devOpsStore.triggerPipeline(pipeline.id)
}

// 取消流水线
const handleCancel = async (pipeline: Pipeline) => {
  await devOpsStore.cancelPipeline(pipeline.id)
}

// 重试流水线
const handleRetry = async (pipeline: Pipeline) => {
  await devOpsStore.retryPipeline(pipeline.id)
}

// 查看详情
const handleViewDetail = (pipeline: Pipeline) => {
  devOpsStore.selectPipeline(pipeline.id)
  showDetailDialog.value = true
}

// 关闭详情
const handleCloseDetail = () => {
  showDetailDialog.value = false
  devOpsStore.selectPipeline(null)
}

// 选中的流水线
const selectedPipeline = computed(() => devOpsStore.selectedPipeline)

// 判断指标趋势是否为正向
const isPositiveTrend = (label: string, trend: string) => {
  // 这些指标 down 是好事
  const downIsGood = ['CPU 使用率', '内存使用', '平均部署时间', '响应时间']
  // 这些指标 up 是好事
  const upIsGood = ['构建成功率', '可用性', '吞吐量']

  if (downIsGood.some(k => label.includes(k))) {
    return trend === 'down'
  }
  if (upIsGood.some(k => label.includes(k))) {
    return trend === 'up'
  }
  return trend === 'up' // 默认 up 是好事
}
</script>

<template>
  <div class="devops-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <h1>DevOps 仪表板</h1>
      <div class="toolbar-actions">
        <mdui-chip v-if="devOpsStore.wsConnected">
          <mdui-icon-wifi slot="icon"></mdui-icon-wifi>
          已连接
        </mdui-chip>
        <mdui-button-icon @click="handleRefresh" :disabled="devOpsStore.loading" title="刷新">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="devOpsStore.loading && devOpsStore.pipelines.length === 0" class="loading">
      <mdui-circular-progress></mdui-circular-progress>
      <p>加载中...</p>
    </div>

    <template v-else>
      <!-- 顶部指标卡片 -->
      <div class="metrics-grid">
        <mdui-card
          v-for="metric in devOpsStore.metrics"
          :key="metric.id"
          class="metric-card"
          variant="outlined"
        >
          <div class="metric-content">
            <span class="metric-label">{{ metric.label }}</span>
            <span class="metric-value">{{ metric.value }}</span>
            <span
              class="metric-change"
              :class="{ positive: isPositiveTrend(metric.label, metric.trend), negative: !isPositiveTrend(metric.label, metric.trend) }"
            >
              <mdui-icon-trending-up v-if="metric.trend === 'up'"></mdui-icon-trending-up>
              <mdui-icon-trending-down v-else-if="metric.trend === 'down'"></mdui-icon-trending-down>
              <mdui-icon-trending-flat v-else></mdui-icon-trending-flat>
              {{ metric.change }}
            </span>
          </div>
        </mdui-card>
      </div>

      <!-- 流水线概览 -->
      <div class="overview-cards">
        <mdui-card class="overview-card" variant="filled">
          <div class="overview-content">
            <mdui-icon-pending class="overview-icon running"></mdui-icon-pending>
            <div class="overview-info">
              <span class="overview-value">{{ devOpsStore.runningCount }}</span>
              <span class="overview-label">运行中</span>
            </div>
          </div>
        </mdui-card>
        <mdui-card class="overview-card" variant="filled">
          <div class="overview-content">
            <mdui-icon-cancel class="overview-icon failed"></mdui-icon-cancel>
            <div class="overview-info">
              <span class="overview-value">{{ devOpsStore.failedCount }}</span>
              <span class="overview-label">失败</span>
            </div>
          </div>
        </mdui-card>
        <mdui-card class="overview-card" variant="filled">
          <div class="overview-content">
            <mdui-icon-check-circle class="overview-icon success"></mdui-icon-check-circle>
            <div class="overview-info">
              <span class="overview-value">{{ devOpsStore.pipelines.filter(p => p.status === 'success').length }}</span>
              <span class="overview-label">成功</span>
            </div>
          </div>
        </mdui-card>
      </div>

      <!-- 流水线列表 -->
      <div class="pipelines-section">
        <div class="section-header">
          <h2>流水线</h2>
          <mdui-button variant="tonal">
            <mdui-icon-add slot="icon"></mdui-icon-add>
            新建流水线
          </mdui-button>
        </div>

        <div class="pipeline-list">
          <div
            v-for="pipeline in devOpsStore.recentPipelines"
            :key="pipeline.id"
            class="pipeline-item"
            @click="handleViewDetail(pipeline)"
          >
            <div class="pipeline-status" :style="{ background: getStatusColor(pipeline.status) }">
              <mdui-icon-check-circle v-if="pipeline.status === 'success'"></mdui-icon-check-circle>
              <mdui-icon-pending v-else-if="pipeline.status === 'running'"></mdui-icon-pending>
              <mdui-icon-cancel v-else-if="pipeline.status === 'failed'"></mdui-icon-cancel>
              <mdui-icon-schedule v-else-if="pipeline.status === 'pending'"></mdui-icon-schedule>
              <mdui-icon-block v-else-if="pipeline.status === 'cancelled'"></mdui-icon-block>
              <mdui-icon-help v-else></mdui-icon-help>
            </div>

            <div class="pipeline-info">
              <div class="pipeline-name">{{ pipeline.name }}</div>
              <div class="pipeline-meta">
                <span class="meta-item">
                  <mdui-icon-source></mdui-icon-source>
                  {{ pipeline.branch }}
                </span>
                <span class="meta-item">
                  <mdui-icon-commit></mdui-icon-commit>
                  {{ pipeline.commit.slice(0, 7) }}
                </span>
                <span class="meta-item">
                  <mdui-icon-person></mdui-icon-person>
                  {{ pipeline.triggeredBy }}
                </span>
                <span class="meta-item">
                  <mdui-icon-schedule></mdui-icon-schedule>
                  {{ formatTime(pipeline.triggeredAt) }}
                </span>
              </div>
            </div>

            <!-- 阶段进度 -->
            <div class="pipeline-stages">
              <div
                v-for="stage in pipeline.stages"
                :key="stage.id"
                class="stage-dot"
                :class="stage.status"
                :title="`${stage.name}: ${getStatusText(stage.status)}`"
              ></div>
            </div>

            <div class="pipeline-status-text" :style="{ color: getStatusColor(pipeline.status) }">
              {{ getStatusText(pipeline.status) }}
            </div>

            <div class="pipeline-duration">
              {{ formatDuration(pipeline.duration) }}
            </div>

            <div class="pipeline-actions" @click.stop>
              <mdui-button-icon
                v-if="pipeline.status === 'pending'"
                @click="handleTrigger(pipeline)"
                title="运行"
              >
                <mdui-icon-play-arrow></mdui-icon-play-arrow>
              </mdui-button-icon>
              <mdui-button-icon
                v-else-if="pipeline.status === 'running'"
                @click="handleCancel(pipeline)"
                title="取消"
              >
                <mdui-icon-stop></mdui-icon-stop>
              </mdui-button-icon>
              <mdui-button-icon
                v-else
                @click="handleRetry(pipeline)"
                title="重试"
              >
                <mdui-icon-refresh></mdui-icon-refresh>
              </mdui-button-icon>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 错误提示 -->
    <mdui-snackbar
      v-if="devOpsStore.error"
      :open="!!devOpsStore.error"
      @closed="devOpsStore.clearError"
    >
      {{ devOpsStore.error }}
      <mdui-button slot="action" variant="text" @click="devOpsStore.clearError">
        关闭
      </mdui-button>
    </mdui-snackbar>

    <!-- 流水线详情对话框 -->
    <mdui-dialog
      :open="showDetailDialog"
      @closed="handleCloseDetail"
      class="pipeline-dialog"
    >
      <template v-if="selectedPipeline">
        <span slot="headline">
          <div class="dialog-header">
            <span class="pipeline-status-badge" :style="{ background: getStatusColor(selectedPipeline.status) }">
              <mdui-icon-check-circle v-if="selectedPipeline.status === 'success'"></mdui-icon-check-circle>
              <mdui-icon-pending v-else-if="selectedPipeline.status === 'running'"></mdui-icon-pending>
              <mdui-icon-cancel v-else-if="selectedPipeline.status === 'failed'"></mdui-icon-cancel>
              <mdui-icon-schedule v-else-if="selectedPipeline.status === 'pending'"></mdui-icon-schedule>
              <mdui-icon-block v-else-if="selectedPipeline.status === 'cancelled'"></mdui-icon-block>
              <mdui-icon-help v-else></mdui-icon-help>
            </span>
            {{ selectedPipeline.name }}
          </div>
        </span>

        <div slot="description" class="pipeline-detail">
          <!-- 基本信息 -->
          <div class="detail-section">
            <div class="detail-row">
              <span class="detail-label">分支</span>
              <span class="detail-value">{{ selectedPipeline.branch }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">提交</span>
              <span class="detail-value">{{ selectedPipeline.commit }}</span>
            </div>
            <div class="detail-row" v-if="selectedPipeline.commitMessage">
              <span class="detail-label">提交信息</span>
              <span class="detail-value">{{ selectedPipeline.commitMessage }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">触发者</span>
              <span class="detail-value">{{ selectedPipeline.triggeredBy }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">触发时间</span>
              <span class="detail-value">{{ new Date(selectedPipeline.triggeredAt).toLocaleString('zh-CN') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">执行时长</span>
              <span class="detail-value">{{ formatDuration(selectedPipeline.duration) }}</span>
            </div>
          </div>

          <!-- 阶段列表 -->
          <div class="stages-section">
            <h4>执行阶段</h4>
            <div class="stages-list">
              <div
                v-for="stage in selectedPipeline.stages"
                :key="stage.id"
                class="stage-item"
              >
                <div class="stage-header">
                  <span class="stage-status" :class="stage.status">
                    <mdui-icon-check-circle v-if="stage.status === 'success'"></mdui-icon-check-circle>
                    <mdui-icon-pending v-else-if="stage.status === 'running'"></mdui-icon-pending>
                    <mdui-icon-cancel v-else-if="stage.status === 'failed'"></mdui-icon-cancel>
                    <mdui-icon-schedule v-else-if="stage.status === 'pending'"></mdui-icon-schedule>
                    <mdui-icon-block v-else-if="stage.status === 'skipped'"></mdui-icon-block>
                    <mdui-icon-help v-else></mdui-icon-help>
                  </span>
                  <span class="stage-name">{{ stage.name }}</span>
                  <span class="stage-status-text">{{ getStatusText(stage.status) }}</span>
                </div>
                <div class="jobs-list">
                  <div
                    v-for="job in stage.jobs"
                    :key="job.id"
                    class="job-item"
                  >
                    <span class="job-status" :class="job.status">
                      <mdui-icon-check-circle v-if="job.status === 'success'"></mdui-icon-check-circle>
                      <mdui-icon-pending v-else-if="job.status === 'running'"></mdui-icon-pending>
                      <mdui-icon-cancel v-else-if="job.status === 'failed'"></mdui-icon-cancel>
                      <mdui-icon-schedule v-else-if="job.status === 'pending'"></mdui-icon-schedule>
                      <mdui-icon-block v-else-if="job.status === 'skipped'"></mdui-icon-block>
                      <mdui-icon-help v-else></mdui-icon-help>
                    </span>
                    <span class="job-name">{{ job.name }}</span>
                    <span class="job-duration" v-if="job.duration">{{ formatDuration(job.duration) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <mdui-button slot="action" variant="text" @click="handleCloseDetail">
          关闭
        </mdui-button>
        <mdui-button
          v-if="selectedPipeline.status === 'failed'"
          slot="action"
          @click="handleRetry(selectedPipeline); handleCloseDetail()"
        >
          重试
        </mdui-button>
      </template>
    </mdui-dialog>
  </div>
</template>

<style scoped>
.devops-view {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.toolbar h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 500;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px;
  color: var(--mdui-color-on-surface-variant);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric-card {
  padding: 16px;
}

.metric-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
}

.metric-value {
  font-size: 1.75rem;
  font-weight: 500;
}

.metric-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
}

.metric-change mdui-icon-trending-up,
.metric-change mdui-icon-trending-down,
.metric-change mdui-icon-trending-flat {
  font-size: 16px;
}

.metric-change.positive {
  color: var(--mdui-color-primary);
}

.metric-change.negative {
  color: var(--mdui-color-error);
}

.overview-cards {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.overview-card {
  flex: 1;
  padding: 16px;
}

.overview-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overview-icon {
  font-size: 32px;
}

.overview-icon.running {
  color: var(--mdui-color-tertiary);
}

.overview-icon.failed {
  color: var(--mdui-color-error);
}

.overview-icon.success {
  color: var(--mdui-color-primary);
}

.overview-info {
  display: flex;
  flex-direction: column;
}

.overview-value {
  font-size: 1.5rem;
  font-weight: 500;
}

.overview-label {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
}

.pipelines-section {
  background: var(--mdui-color-surface-container);
  border-radius: 12px;
  padding: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
}

.pipeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pipeline-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--mdui-color-surface);
  cursor: pointer;
  transition: background-color 0.1s;
}

.pipeline-item:hover {
  background: var(--mdui-color-surface-container-high);
}

.pipeline-status {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pipeline-status mdui-icon-check-circle,
.pipeline-status mdui-icon-pending,
.pipeline-status mdui-icon-cancel,
.pipeline-status mdui-icon-schedule,
.pipeline-status mdui-icon-block,
.pipeline-status mdui-icon-help {
  font-size: 18px;
  color: white;
}

.pipeline-info {
  flex: 1;
  min-width: 0;
}

.pipeline-name {
  font-weight: 500;
  margin-bottom: 4px;
}

.pipeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.75rem;
  color: var(--mdui-color-on-surface-variant);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-item mdui-icon-source,
.meta-item mdui-icon-commit,
.meta-item mdui-icon-person,
.meta-item mdui-icon-schedule {
  font-size: 14px;
}

.pipeline-stages {
  display: flex;
  gap: 4px;
}

.stage-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--mdui-color-outline);
}

.stage-dot.success {
  background: var(--mdui-color-primary);
}

.stage-dot.running {
  background: var(--mdui-color-tertiary);
  animation: pulse 1.5s infinite;
}

.stage-dot.failed {
  background: var(--mdui-color-error);
}

.stage-dot.skipped {
  background: var(--mdui-color-on-surface-variant);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.pipeline-status-text {
  width: 80px;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
}

.pipeline-duration {
  width: 80px;
  text-align: right;
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
}

.pipeline-actions {
  display: flex;
  gap: 4px;
}

/* 对话框样式 */
.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pipeline-status-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pipeline-status-badge mdui-icon-check-circle,
.pipeline-status-badge mdui-icon-pending,
.pipeline-status-badge mdui-icon-cancel,
.pipeline-status-badge mdui-icon-schedule,
.pipeline-status-badge mdui-icon-block,
.pipeline-status-badge mdui-icon-help {
  font-size: 16px;
  color: white;
}

.pipeline-detail {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.detail-label {
  width: 100px;
  flex-shrink: 0;
  color: var(--mdui-color-on-surface-variant);
  font-size: 0.875rem;
}

.detail-value {
  flex: 1;
  font-size: 0.875rem;
}

.stages-section h4 {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--mdui-color-on-surface-variant);
}

.stages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-item {
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  padding: 12px;
}

.stage-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.stage-status {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mdui-color-outline);
}

.stage-status mdui-icon-check-circle,
.stage-status mdui-icon-pending,
.stage-status mdui-icon-cancel,
.stage-status mdui-icon-schedule,
.stage-status mdui-icon-block,
.stage-status mdui-icon-help {
  font-size: 14px;
  color: white;
}

.stage-status.success {
  background: var(--mdui-color-primary);
}

.stage-status.running {
  background: var(--mdui-color-tertiary);
}

.stage-status.failed {
  background: var(--mdui-color-error);
}

.stage-name {
  flex: 1;
  font-weight: 500;
}

.stage-status-text {
  font-size: 0.75rem;
  color: var(--mdui-color-on-surface-variant);
}

.jobs-list {
  padding-left: 32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.job-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}

.job-status {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mdui-color-outline);
}

.job-status mdui-icon-check-circle,
.job-status mdui-icon-pending,
.job-status mdui-icon-cancel,
.job-status mdui-icon-schedule,
.job-status mdui-icon-block,
.job-status mdui-icon-help {
  font-size: 12px;
  color: white;
}

.job-status.success {
  background: var(--mdui-color-primary);
}

.job-status.running {
  background: var(--mdui-color-tertiary);
}

.job-status.failed {
  background: var(--mdui-color-error);
}

.job-name {
  flex: 1;
}

.job-duration {
  color: var(--mdui-color-on-surface-variant);
  font-size: 0.75rem;
}
</style>
