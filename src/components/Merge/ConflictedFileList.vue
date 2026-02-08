<script setup lang="ts">
/**
 * 冲突文件列表组件
 * 显示所有有冲突的文件及其状态
 */

import { computed } from 'vue'
import type { ConflictedFile } from '@/types/merge'

// 导入 MDUI 图标
import '@mdui/icons/description.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'

interface Props {
  files: ConflictedFile[]
  currentFile: string | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  (e: 'select', path: string): void
}>()

// 计算统计
const stats = computed(() => {
  const resolved = props.files.filter(f => f.resolved).length
  const total = props.files.length
  return { resolved, total, remaining: total - resolved }
})

// 获取文件图标颜色
const getStatusColor = (file: ConflictedFile): string => {
  if (file.resolved) return 'var(--mdui-color-primary)'
  return 'var(--mdui-color-error)'
}

// 获取文件名
const getFileName = (path: string): string => {
  return path.split('/').pop() || path
}

// 获取文件目录
const getFileDir = (path: string): string => {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}
</script>

<template>
  <div class="conflicted-file-list">
    <!-- 头部 -->
    <div class="list-header">
      <span class="title">冲突文件</span>
      <span class="stats">
        <mdui-icon-check-circle class="resolved-icon"></mdui-icon-check-circle>
        {{ stats.resolved }} / {{ stats.total }}
      </span>
    </div>

    <!-- 进度条 -->
    <mdui-linear-progress :value="stats.resolved" :max="stats.total" class="resolve-progress"></mdui-linear-progress>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      <mdui-circular-progress></mdui-circular-progress>
    </div>

    <!-- 文件列表 -->
    <div v-else class="file-list">
      <div
        v-for="file in files"
        :key="file.path"
        class="file-item"
        :class="{
          'resolved': file.resolved,
          'selected': file.path === currentFile
        }"
        @click="emit('select', file.path)"
      >
        <span class="status-icon" :style="{ color: getStatusColor(file) }">
          <mdui-icon-check-circle v-if="file.resolved"></mdui-icon-check-circle>
          <mdui-icon-warning v-else></mdui-icon-warning>
        </span>

        <div class="file-info">
          <span class="file-name">{{ getFileName(file.path) }}</span>
          <span v-if="getFileDir(file.path)" class="file-dir">
            {{ getFileDir(file.path) }}
          </span>
        </div>

        <span v-if="!file.resolved" class="conflict-count">
          {{ file.conflictCount }} conflict{{ file.conflictCount > 1 ? 's' : '' }}
        </span>
      </div>

      <!-- 空状态 -->
      <div v-if="files.length === 0" class="empty-state">
        <mdui-icon-description></mdui-icon-description>
        <p>没有冲突文件</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflicted-file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.list-header .title {
  font-size: 14px;
  font-weight: 500;
}

.list-header .stats {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.resolved-icon {
  font-size: 14px;
  color: var(--mdui-color-primary);
}

.resolve-progress {
  --shape-corner: 0;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--mdui-color-surface-variant);
}

.file-item.selected {
  background: var(--mdui-color-secondary-container);
}

.file-item.resolved {
  opacity: 0.7;
}

.status-icon {
  flex-shrink: 0;
  font-size: 18px;
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-dir {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conflict-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--mdui-color-error);
  padding: 2px 6px;
  background: var(--mdui-color-error-container);
  border-radius: 10px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  color: var(--mdui-color-on-surface-variant);
}

.empty-state mdui-icon-description {
  font-size: 32px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}
</style>
