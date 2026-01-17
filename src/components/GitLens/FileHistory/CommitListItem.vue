<script setup lang="ts">
/**
 * Commit 列表项组件
 * 显示单个 commit 的信息
 */

import { computed } from 'vue'

// 导入 MDUI 图标
import '@mdui/icons/commit.js'
import '@mdui/icons/person.js'

interface GitCommit {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: Date
  message: string
}

const props = defineProps<{
  commit: GitCommit
  isSelected?: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

// 格式化相对时间
const relativeTime = computed(() => {
  const now = new Date()
  const diff = now.getTime() - props.commit.date.getTime()

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

// 格式化日期
const formattedDate = computed(() => {
  return props.commit.date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})
</script>

<template>
  <div
    class="commit-list-item"
    :class="{ selected: isSelected }"
    @click="emit('select')"
    :title="formattedDate"
  >
    <!-- 时间线圆点 -->
    <div class="timeline-dot">
      <div class="dot" :class="{ selected: isSelected }"></div>
    </div>

    <!-- 内容 -->
    <div class="commit-content">
      <!-- 头部: hash 和时间 -->
      <div class="commit-header">
        <span class="hash">{{ commit.shortHash }}</span>
        <span class="time">{{ relativeTime }}</span>
      </div>

      <!-- 消息 -->
      <div class="commit-message">{{ commit.message }}</div>

      <!-- 作者 -->
      <div class="commit-author">
        <mdui-icon-person></mdui-icon-person>
        <span class="author-name">{{ commit.author }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commit-list-item {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 8px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.commit-list-item:hover {
  background: var(--mdui-color-surface-container-high);
}

.commit-list-item.selected {
  background: var(--mdui-color-secondary-container);
}

.timeline-dot {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding-top: 4px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mdui-color-outline);
  position: relative;
  z-index: 1;
  transition: all 0.15s;
}

.dot.selected {
  background: var(--mdui-color-primary);
  box-shadow: 0 0 0 3px var(--mdui-color-primary-container);
}

.commit-list-item:hover .dot {
  background: var(--mdui-color-on-surface-variant);
}

.commit-content {
  flex: 1;
  min-width: 0;
}

.commit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--mdui-color-primary);
}

.time {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.commit-message {
  font-size: 13px;
  line-height: 1.4;
  color: var(--mdui-color-on-surface);
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.commit-author {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.commit-author mdui-icon-person {
  font-size: 12px;
}

.author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
