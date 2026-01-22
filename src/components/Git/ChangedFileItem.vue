<script setup lang="ts">
/**
 * 单个变更文件项组件
 */

import { computed } from 'vue'
import type { GitFile } from '@/types'
import { getGitStatusLabel } from '@/utils/fileIcons'

// 导入 MDUI 图标
import '@mdui/icons/undo.js'
import '@mdui/icons/add.js'
import '@mdui/icons/remove.js'

const props = defineProps<{
  /** 文件信息 */
  file: GitFile
  /** 是否可以暂存 */
  canStage?: boolean
  /** 是否可以取消暂存 */
  canUnstage?: boolean
}>()

const emit = defineEmits<{
  /** 暂存文件 */
  stage: [path: string]
  /** 取消暂存文件 */
  unstage: [path: string]
  /** 放弃更改 */
  discard: [path: string]
  /** 查看差异 */
  diff: [path: string, staged: boolean]
  /** 打开文件 */
  open: [path: string]
}>()

const statusLabel = computed(() => getGitStatusLabel(props.file.status))
const statusClass = computed(() => props.file.status)
const fileName = computed(() => props.file.path.split('/').pop() || props.file.path)
const dirPath = computed(() => {
  const parts = props.file.path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
})

const handleClick = () => {
  emit('diff', props.file.path, props.file.staged)
}

const handleDoubleClick = () => {
  emit('open', props.file.path)
}

const handleStage = (e: Event) => {
  e.stopPropagation()
  emit('stage', props.file.path)
}

const handleUnstage = (e: Event) => {
  e.stopPropagation()
  emit('unstage', props.file.path)
}

const handleDiscard = (e: Event) => {
  e.stopPropagation()
  emit('discard', props.file.path)
}
</script>

<template>
  <div
    class="changed-file-item"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    :title="file.path"
  >
    <!-- 状态图标 -->
    <span class="status-icon" :class="statusClass">
      {{ statusLabel }}
    </span>

    <!-- 文件名 -->
    <span class="file-name" :class="statusClass">{{ fileName }}</span>

    <!-- 目录路径 -->
    <span v-if="dirPath" class="dir-path">{{ dirPath }}</span>

    <!-- 状态标签 -->
    <span class="status-badge" :class="statusClass">
      <span v-if="file.status === 'added'">新增</span>
      <span v-else-if="file.status === 'modified'">修改</span>
      <span v-else-if="file.status === 'deleted'">删除</span>
      <span v-else-if="file.status === 'renamed'">重命名</span>
      <span v-else-if="file.status === 'untracked'">未跟踪</span>
    </span>

    <!-- 操作按钮 -->
    <div class="actions">
      <!-- 放弃更改 (仅未暂存文件) -->
      <mdui-button-icon
        v-if="canStage && file.status !== 'untracked'"
        @click="handleDiscard"
        title="放弃更改"
      >
        <mdui-icon-undo></mdui-icon-undo>
      </mdui-button-icon>

      <!-- 暂存按钮 -->
      <mdui-button-icon
        v-if="canStage"
        @click="handleStage"
        title="暂存"
      >
        <mdui-icon-add></mdui-icon-add>
      </mdui-button-icon>

      <!-- 取消暂存按钮 -->
      <mdui-button-icon
        v-if="canUnstage"
        @click="handleUnstage"
        title="取消暂存"
      >
        <mdui-icon-remove></mdui-icon-remove>
      </mdui-button-icon>
    </div>
  </div>
</template>

<style scoped>
.changed-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.1s;
}

.changed-file-item:hover {
  background: var(--mdui-color-surface-container-high);
}

.status-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  border-radius: 2px;
  flex-shrink: 0;
}

.status-icon.modified {
  color: var(--mdui-color-tertiary);
}

.status-icon.added {
  color: #4caf50;
}

.status-icon.deleted {
  color: var(--mdui-color-error);
}

.status-icon.untracked {
  color: var(--mdui-color-on-surface-variant);
}

.status-icon.renamed {
  color: var(--mdui-color-primary);
}

.file-name {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  flex-shrink: 0;
  font-weight: 500;
}

.file-name.added {
  color: #4caf50;
}

.file-name.modified {
  color: var(--mdui-color-tertiary);
}

.file-name.deleted {
  color: var(--mdui-color-error);
}

.file-name.renamed {
  color: var(--mdui-color-primary);
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
  opacity: 0.8;
}

.status-badge.added {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.status-badge.modified {
  background: rgba(var(--mdui-color-tertiary-rgb), 0.15);
  color: var(--mdui-color-tertiary);
}

.status-badge.deleted {
  background: rgba(var(--mdui-color-error-rgb), 0.15);
  color: var(--mdui-color-error);
}

.status-badge.renamed {
  background: rgba(var(--mdui-color-primary-rgb), 0.15);
  color: var(--mdui-color-primary);
}

.status-badge.untracked {
  background: var(--mdui-color-surface-container-high);
  color: var(--mdui-color-on-surface-variant);
}

.dir-path {
  flex: 1;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s;
}

.changed-file-item:hover .actions {
  opacity: 1;
}

.actions mdui-button-icon {
  --mdui-comp-button-icon-size: 24px;
}
</style>
