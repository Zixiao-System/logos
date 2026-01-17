<script setup lang="ts">
/**
 * Blame Hover Card
 * 显示 commit 详情的悬浮卡片
 */

import { computed } from 'vue'
import type { CommitDetails } from '@/types'

// 导入 MDUI 图标
import '@mdui/icons/person.js'
import '@mdui/icons/schedule.js'
import '@mdui/icons/commit.js'
import '@mdui/icons/add.js'
import '@mdui/icons/remove.js'
import '@mdui/icons/insert-drive-file.js'
import '@mdui/icons/content-copy.js'
import '@mdui/icons/history.js'

const props = defineProps<{
  commit: CommitDetails
  position: { x: number; y: number }
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'viewCommit', hash: string): void
  (e: 'viewFileHistory'): void
  (e: 'copyHash', hash: string): void
}>()

// 格式化日期
const formattedDate = computed(() => {
  const date = props.commit.author.date
  return date.toLocaleDateString('zh-CN', {
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
  const date = props.commit.author.date
  const diff = now.getTime() - date.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years} 年前`
  if (months > 0) return `${months} 个月前`
  if (days > 0) return `${days} 天前`
  if (hours > 0) return `${hours} 小时前`
  if (minutes > 0) return `${minutes} 分钟前`
  return '刚刚'
})

// 计算卡片位置样式
const cardStyle = computed(() => {
  const { x, y } = props.position

  // 确保卡片不超出视口
  const maxX = window.innerWidth - 400 // 卡片宽度约 380px
  const maxY = window.innerHeight - 300 // 卡片高度约 280px

  return {
    left: Math.min(x, maxX) + 'px',
    top: Math.min(y + 20, maxY) + 'px'
  }
})

// 复制 hash 到剪贴板
const copyHash = async () => {
  try {
    await navigator.clipboard.writeText(props.commit.hash)
    emit('copyHash', props.commit.hash)
  } catch (error) {
    console.error('Failed to copy hash:', error)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="blame-hover-card"
        :style="cardStyle"
        @mouseenter="$emit('close')"
      >
        <!-- 头部: commit hash 和作者 -->
        <div class="card-header">
          <div class="commit-hash">
            <mdui-icon-commit></mdui-icon-commit>
            <span class="hash">{{ commit.shortHash }}</span>
            <mdui-button-icon
              class="copy-btn"
              @click="copyHash"
              title="复制完整 hash"
            >
              <mdui-icon-content-copy></mdui-icon-content-copy>
            </mdui-button-icon>
          </div>
          <div class="author-info">
            <mdui-icon-person></mdui-icon-person>
            <span class="author">{{ commit.author.name }}</span>
            <span class="email">&lt;{{ commit.author.email }}&gt;</span>
          </div>
        </div>

        <!-- 消息 -->
        <div class="commit-message">
          <div class="message-subject">{{ commit.message }}</div>
          <div v-if="commit.body" class="message-body">{{ commit.body }}</div>
        </div>

        <!-- 时间和统计 -->
        <div class="card-meta">
          <div class="time-info">
            <mdui-icon-schedule></mdui-icon-schedule>
            <span>{{ relativeTime }}</span>
            <span class="date">({{ formattedDate }})</span>
          </div>

          <div class="stats">
            <span class="stat additions">
              <mdui-icon-add></mdui-icon-add>
              {{ commit.stats.additions }}
            </span>
            <span class="stat deletions">
              <mdui-icon-remove></mdui-icon-remove>
              {{ commit.stats.deletions }}
            </span>
            <span class="stat files">
              <mdui-icon-insert-drive-file></mdui-icon-insert-drive-file>
              {{ commit.stats.filesChanged }} 文件
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="card-actions">
          <mdui-button
            variant="text"
            @click="emit('viewCommit', commit.hash)"
          >
            <mdui-icon-commit slot="icon"></mdui-icon-commit>
            查看提交
          </mdui-button>
          <mdui-button
            variant="text"
            @click="emit('viewFileHistory')"
          >
            <mdui-icon-history slot="icon"></mdui-icon-history>
            文件历史
          </mdui-button>
        </div>

        <!-- 父节点信息 (如果是 merge commit) -->
        <div v-if="commit.parents.length > 1" class="parents-info">
          <span class="label">合并提交:</span>
          <span
            v-for="parent in commit.parents"
            :key="parent"
            class="parent-hash"
          >
            {{ parent.substring(0, 7) }}
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.blame-hover-card {
  position: fixed;
  z-index: 10000;
  width: 380px;
  background: var(--mdui-color-surface-container-high);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  pointer-events: auto;
}

.card-header {
  padding: 12px 16px;
  background: var(--mdui-color-surface-container-highest);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.commit-hash {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.commit-hash mdui-icon-commit {
  font-size: 16px;
  color: var(--mdui-color-primary);
}

.commit-hash .hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-primary);
}

.commit-hash .copy-btn {
  --mdui-comp-button-icon-size: 24px;
  margin-left: auto;
  opacity: 0.6;
}

.commit-hash .copy-btn:hover {
  opacity: 1;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--mdui-color-on-surface-variant);
}

.author-info mdui-icon-person {
  font-size: 14px;
}

.author-info .author {
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.author-info .email {
  font-size: 12px;
  opacity: 0.7;
}

.commit-message {
  padding: 12px 16px;
}

.message-subject {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--mdui-color-on-surface);
}

.message-body {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--mdui-color-on-surface-variant);
  white-space: pre-wrap;
  max-height: 80px;
  overflow-y: auto;
}

.card-meta {
  padding: 8px 16px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
}

.time-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  margin-bottom: 8px;
}

.time-info mdui-icon-schedule {
  font-size: 14px;
}

.time-info .date {
  opacity: 0.7;
}

.stats {
  display: flex;
  gap: 16px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
}

.stat mdui-icon-add,
.stat mdui-icon-remove,
.stat mdui-icon-insert-drive-file {
  font-size: 14px;
}

.stat.additions {
  color: #4caf50;
}

.stat.deletions {
  color: #f44336;
}

.stat.files {
  color: var(--mdui-color-on-surface-variant);
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--mdui-color-outline-variant);
}

.card-actions mdui-button {
  flex: 1;
  --mdui-comp-button-height: 32px;
  font-size: 12px;
}

.parents-info {
  padding: 8px 16px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  display: flex;
  align-items: center;
  gap: 8px;
}

.parents-info .label {
  opacity: 0.7;
}

.parent-hash {
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 6px;
  background: var(--mdui-color-surface-container-highest);
  border-radius: 4px;
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
