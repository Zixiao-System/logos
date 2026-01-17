<script setup lang="ts">
/**
 * Commit 详情面板
 */

import { computed } from 'vue'
import type { CommitDetails } from '@/types/gitLens'

// 导入 MDUI 图标
import '@mdui/icons/close.js'
import '@mdui/icons/person.js'
import '@mdui/icons/schedule.js'
import '@mdui/icons/content-copy.js'
import '@mdui/icons/add.js'
import '@mdui/icons/remove.js'
import '@mdui/icons/insert-drive-file.js'

const props = defineProps<{
  commit: CommitDetails
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 格式化日期
const formattedDate = computed(() => {
  return props.commit.author.date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

// 格式化相对时间
const relativeTime = computed(() => {
  const now = new Date()
  const diff = now.getTime() - props.commit.author.date.getTime()

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years} 年前`
  if (months > 0) return `${months} 个月前`
  if (days > 0) return `${days} 天前`
  return '今天'
})

// 复制 hash
async function copyHash() {
  try {
    await navigator.clipboard.writeText(props.commit.hash)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}
</script>

<template>
  <div class="commit-details-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-title">
        <span class="hash">{{ commit.shortHash }}</span>
        <mdui-button-icon @click="copyHash" title="复制完整 hash">
          <mdui-icon-content-copy></mdui-icon-content-copy>
        </mdui-button-icon>
      </div>
      <mdui-button-icon @click="emit('close')" title="关闭">
        <mdui-icon-close></mdui-icon-close>
      </mdui-button-icon>
    </div>

    <!-- 内容 -->
    <div class="panel-content">
      <!-- 消息 -->
      <div class="commit-message">
        <div class="message-subject">{{ commit.message }}</div>
        <div v-if="commit.body" class="message-body">{{ commit.body }}</div>
      </div>

      <!-- 作者信息 -->
      <div class="info-section">
        <div class="info-row">
          <mdui-icon-person></mdui-icon-person>
          <span class="label">作者:</span>
          <span class="value">{{ commit.author.name }}</span>
          <span class="email">&lt;{{ commit.author.email }}&gt;</span>
        </div>
        <div class="info-row">
          <mdui-icon-schedule></mdui-icon-schedule>
          <span class="label">时间:</span>
          <span class="value">{{ relativeTime }}</span>
          <span class="date">({{ formattedDate }})</span>
        </div>
      </div>

      <!-- 统计 -->
      <div class="stats-section">
        <div class="stat">
          <mdui-icon-add></mdui-icon-add>
          <span class="additions">{{ commit.stats.additions }}</span>
        </div>
        <div class="stat">
          <mdui-icon-remove></mdui-icon-remove>
          <span class="deletions">{{ commit.stats.deletions }}</span>
        </div>
        <div class="stat">
          <mdui-icon-insert-drive-file></mdui-icon-insert-drive-file>
          <span>{{ commit.stats.filesChanged }} 文件</span>
        </div>
      </div>

      <!-- 父节点 -->
      <div v-if="commit.parents.length > 0" class="parents-section">
        <div class="section-title">父节点</div>
        <div class="parent-list">
          <span v-for="parent in commit.parents" :key="parent" class="parent-hash">
            {{ parent.substring(0, 7) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commit-details-panel {
  width: 350px;
  border-left: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface);
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 12px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-title .hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-primary);
}

.header-title mdui-button-icon {
  --mdui-comp-button-icon-size: 28px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.commit-message {
  margin-bottom: 16px;
}

.message-subject {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--mdui-color-on-surface);
}

.message-body {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--mdui-color-on-surface-variant);
  white-space: pre-wrap;
  max-height: 150px;
  overflow-y: auto;
}

.info-section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row mdui-icon-person,
.info-row mdui-icon-schedule {
  font-size: 16px;
  color: var(--mdui-color-on-surface-variant);
}

.info-row .label {
  color: var(--mdui-color-on-surface-variant);
}

.info-row .value {
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.info-row .email,
.info-row .date {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  opacity: 0.8;
}

.stats-section {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.stat mdui-icon-add,
.stat mdui-icon-remove,
.stat mdui-icon-insert-drive-file {
  font-size: 16px;
}

.stat .additions {
  color: #4caf50;
  font-weight: 500;
}

.stat .deletions {
  color: #f44336;
  font-weight: 500;
}

.parents-section {
  border-top: 1px solid var(--mdui-color-outline-variant);
  padding-top: 16px;
}

.section-title {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
  margin-bottom: 8px;
}

.parent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.parent-hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 4px 8px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 4px;
  color: var(--mdui-color-primary);
}
</style>
