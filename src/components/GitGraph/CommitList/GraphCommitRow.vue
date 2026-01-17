<script setup lang="ts">
/**
 * Git Graph Commit 行
 */

import { computed } from 'vue'
import type { GraphCommit } from '@/types/gitGraph'

// 导入 MDUI 图标
import '@mdui/icons/label.js'
import '@mdui/icons/sell.js'

const props = defineProps<{
  commit: GraphCommit & { virtualIndex: number }
  isSelected: boolean
  isHead: boolean
  laneCount: number
  rowHeight: number
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

// 格式化相对时间
const relativeTime = computed(() => {
  const now = new Date()
  const date = props.commit.author.date
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years}y`
  if (months > 0) return `${months}mo`
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (minutes > 0) return `${minutes}m`
  return 'now'
})

// 图形列宽度
const graphColumnWidth = computed(() => Math.max(100, (props.laneCount + 1) * 20))
</script>

<template>
  <div
    class="commit-row"
    :class="{ selected: isSelected, head: isHead }"
    :style="{ height: rowHeight + 'px' }"
    @click="emit('select')"
  >
    <!-- 图形占位 -->
    <div class="graph-column" :style="{ width: graphColumnWidth + 'px' }"></div>

    <!-- Commit 信息 -->
    <div class="commit-info">
      <!-- Hash -->
      <span class="hash">{{ commit.shortHash }}</span>

      <!-- 消息 -->
      <span class="message">{{ commit.message }}</span>

      <!-- 分支和标签 -->
      <div class="refs" v-if="commit.branches.length > 0 || commit.tags.length > 0">
        <span
          v-for="branch in commit.branches"
          :key="branch"
          class="ref branch"
          :class="{ current: branch === 'HEAD' }"
        >
          <mdui-icon-label></mdui-icon-label>
          {{ branch }}
        </span>
        <span
          v-for="tag in commit.tags"
          :key="tag"
          class="ref tag"
        >
          <mdui-icon-sell></mdui-icon-sell>
          {{ tag }}
        </span>
      </div>
    </div>

    <!-- 作者 -->
    <div class="author">{{ commit.author.name }}</div>

    <!-- 时间 -->
    <div class="time">{{ relativeTime }}</div>
  </div>
</template>

<style scoped>
.commit-row {
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  transition: background-color 0.15s;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.commit-row:hover {
  background: var(--mdui-color-surface-container-high);
}

.commit-row.selected {
  background: var(--mdui-color-secondary-container);
}

.commit-row.head {
  border-left: 3px solid var(--mdui-color-primary);
}

.graph-column {
  flex-shrink: 0;
}

.commit-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--mdui-color-primary);
  flex-shrink: 0;
}

.message {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.refs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ref {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
}

.ref mdui-icon-label,
.ref mdui-icon-sell {
  font-size: 12px;
}

.ref.branch {
  background: var(--mdui-color-tertiary-container);
  color: var(--mdui-color-on-tertiary-container);
}

.ref.branch.current {
  background: var(--mdui-color-primary);
  color: var(--mdui-color-on-primary);
}

.ref.tag {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.author {
  width: 120px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.time {
  width: 50px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  text-align: right;
  flex-shrink: 0;
}
</style>
