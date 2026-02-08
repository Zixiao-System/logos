<script setup lang="ts">
/**
 * RebaseProgressIndicator - Rebase 进度指示器
 * 在 rebase 执行过程中显示进度
 */

import { computed } from 'vue'
import type { RebaseStatus } from '@/types/rebase'

import '@mdui/icons/hourglass-top.js'
import '@mdui/icons/warning.js'

const props = defineProps<{
  status: RebaseStatus | null
  isExecuting: boolean
}>()

const progressPercent = computed(() => {
  if (!props.status || props.status.totalSteps === 0) return 0
  return Math.round((props.status.currentStep / props.status.totalSteps) * 100)
})
</script>

<template>
  <div class="rebase-progress-indicator" v-if="status?.inProgress || isExecuting">
    <!-- 执行中 -->
    <div v-if="isExecuting && !status?.hasConflicts" class="progress-content executing">
      <mdui-circular-progress></mdui-circular-progress>
      <div class="progress-info">
        <span class="progress-title">正在执行 Rebase...</span>
        <span class="progress-detail" v-if="status">
          步骤 {{ status.currentStep }} / {{ status.totalSteps }}
        </span>
      </div>
      <mdui-linear-progress :value="progressPercent" :max="100"></mdui-linear-progress>
    </div>

    <!-- 有冲突 -->
    <div v-else-if="status?.hasConflicts" class="progress-content conflict">
      <mdui-icon-warning></mdui-icon-warning>
      <div class="progress-info">
        <span class="progress-title">Rebase 遇到冲突</span>
        <span class="progress-detail">
          请解决冲突后继续，或中止 rebase
        </span>
      </div>
    </div>

    <!-- 进行中 (暂停) -->
    <div v-else-if="status?.inProgress" class="progress-content paused">
      <mdui-icon-hourglass-top></mdui-icon-hourglass-top>
      <div class="progress-info">
        <span class="progress-title">Rebase 进行中</span>
        <span class="progress-detail">
          步骤 {{ status.currentStep }} / {{ status.totalSteps }} - 等待操作
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rebase-progress-indicator {
  padding: 16px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.progress-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-content.executing mdui-circular-progress {
  --mdui-comp-circular-progress-size: 32px;
}

.progress-content.conflict mdui-icon-warning,
.progress-content.paused mdui-icon-hourglass-top {
  font-size: 32px;
}

.progress-content.conflict mdui-icon-warning {
  color: var(--mdui-color-error);
}

.progress-content.paused mdui-icon-hourglass-top {
  color: var(--mdui-color-tertiary);
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.progress-detail {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.progress-content mdui-linear-progress {
  width: 100px;
}
</style>
