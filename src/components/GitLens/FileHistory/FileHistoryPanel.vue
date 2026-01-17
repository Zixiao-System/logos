<script setup lang="ts">
/**
 * 文件历史面板
 * 显示文件的 commit 历史时间线
 */

import { computed, watch } from 'vue'
import { useFileHistoryStore } from '@/stores/fileHistory'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import CommitListItem from './CommitListItem.vue'

// 导入 MDUI 图标
import '@mdui/icons/close.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/history.js'

const fileHistoryStore = useFileHistoryStore()
const fileExplorerStore = useFileExplorerStore()

const props = defineProps<{
  filePath?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectCommit', hash: string): void
  (e: 'compareCommit', from: string, to: string): void
}>()

// 文件名
const fileName = computed(() => {
  const path = props.filePath || fileHistoryStore.currentFilePath
  if (!path) return ''
  return path.split('/').pop() || path
})

// 相对路径
const relativePath = computed(() => {
  const path = props.filePath || fileHistoryStore.currentFilePath
  if (!path || !fileExplorerStore.rootPath) return path
  return path.replace(fileExplorerStore.rootPath + '/', '')
})

// 加载更多
async function loadMore() {
  if (!fileExplorerStore.rootPath) return
  await fileHistoryStore.loadMore(fileExplorerStore.rootPath)
}

// 刷新
async function refresh() {
  if (!fileExplorerStore.rootPath) return
  await fileHistoryStore.refresh(fileExplorerStore.rootPath)
}

// 选择 commit
async function handleSelectCommit(hash: string) {
  if (!fileExplorerStore.rootPath) return
  await fileHistoryStore.selectCommit(fileExplorerStore.rootPath, hash)
  emit('selectCommit', hash)
}

// 监听 filePath 变化
watch(() => props.filePath, (newPath) => {
  if (newPath && fileExplorerStore.rootPath) {
    const relative = newPath.replace(fileExplorerStore.rootPath + '/', '')
    fileHistoryStore.loadFileHistory(fileExplorerStore.rootPath, relative)
  }
}, { immediate: true })
</script>

<template>
  <div class="file-history-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <mdui-icon-history class="header-icon"></mdui-icon-history>
        <div class="header-title">
          <span class="title">文件历史</span>
          <span class="file-name" :title="relativePath || ''">{{ fileName }}</span>
        </div>
      </div>
      <div class="header-actions">
        <mdui-button-icon @click="refresh" :disabled="fileHistoryStore.isLoading" title="刷新">
          <mdui-icon-refresh :class="{ spinning: fileHistoryStore.isLoading }"></mdui-icon-refresh>
        </mdui-button-icon>
        <mdui-button-icon @click="emit('close')" title="关闭">
          <mdui-icon-close></mdui-icon-close>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="panel-content">
      <!-- 加载中 -->
      <div v-if="fileHistoryStore.isLoading && fileHistoryStore.commits.length === 0" class="loading-state">
        <mdui-circular-progress></mdui-circular-progress>
        <span>加载中...</span>
      </div>

      <!-- 无历史 -->
      <div v-else-if="!fileHistoryStore.hasHistory" class="empty-state">
        <mdui-icon-history class="empty-icon"></mdui-icon-history>
        <span>暂无历史记录</span>
      </div>

      <!-- Commit 列表 -->
      <div v-else class="commit-list">
        <div class="timeline">
          <CommitListItem
            v-for="commit in fileHistoryStore.commits"
            :key="commit.hash"
            :commit="commit"
            :is-selected="fileHistoryStore.selectedCommit?.hash === commit.hash"
            @select="handleSelectCommit(commit.hash)"
          />
        </div>

        <!-- 加载更多 -->
        <div v-if="fileHistoryStore.hasMore" class="load-more">
          <mdui-button
            variant="text"
            @click="loadMore"
            :loading="fileHistoryStore.isLoading"
          >
            加载更多
          </mdui-button>
        </div>
      </div>
    </div>

    <!-- 选中的 commit 详情 -->
    <div v-if="fileHistoryStore.selectedCommit" class="commit-details">
      <div class="details-header">
        <span class="hash">{{ fileHistoryStore.selectedCommit.shortHash }}</span>
        <span class="message">{{ fileHistoryStore.selectedCommit.message }}</span>
      </div>
      <div class="details-body" v-if="fileHistoryStore.selectedCommit.body">
        {{ fileHistoryStore.selectedCommit.body }}
      </div>
      <div class="details-stats">
        <span class="stat additions">+{{ fileHistoryStore.selectedCommit.stats.additions }}</span>
        <span class="stat deletions">-{{ fileHistoryStore.selectedCommit.stats.deletions }}</span>
        <span class="stat files">{{ fileHistoryStore.selectedCommit.stats.filesChanged }} 文件</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.header-icon {
  font-size: 20px;
  color: var(--mdui-color-primary);
}

.header-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
}

.file-name {
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.header-actions mdui-button-icon {
  --mdui-comp-button-icon-size: 32px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.timeline {
  position: relative;
  padding-left: 16px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--mdui-color-outline-variant);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.commit-details {
  border-top: 1px solid var(--mdui-color-outline-variant);
  padding: 12px 16px;
  background: var(--mdui-color-surface-container);
}

.details-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.details-header .hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  padding: 2px 6px;
  background: var(--mdui-color-primary-container);
  color: var(--mdui-color-on-primary-container);
  border-radius: 4px;
}

.details-header .message {
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details-body {
  font-size: 13px;
  color: var(--mdui-color-on-surface-variant);
  white-space: pre-wrap;
  margin-bottom: 8px;
  max-height: 100px;
  overflow-y: auto;
}

.details-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.stat {
  font-weight: 500;
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
</style>
