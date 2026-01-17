<script setup lang="ts">
/**
 * Git Graph 工具栏
 */

import { ref } from 'vue'
import { useGitGraphStore } from '@/stores/gitGraph'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/search.js'
import '@mdui/icons/filter-list.js'

const gitGraphStore = useGitGraphStore()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const searchQuery = ref('')

function handleSearch() {
  gitGraphStore.setSearchQuery(searchQuery.value)
}
</script>

<template>
  <div class="graph-toolbar">
    <div class="toolbar-left">
      <span class="toolbar-title">Git Graph</span>
      <span class="branch-badge" v-if="gitGraphStore.currentBranch">
        {{ gitGraphStore.currentBranch }}
      </span>
    </div>

    <div class="toolbar-center">
      <mdui-text-field
        v-model="searchQuery"
        placeholder="搜索 commit..."
        variant="outlined"
        @keyup.enter="handleSearch"
      >
        <mdui-icon-search slot="icon"></mdui-icon-search>
      </mdui-text-field>
    </div>

    <div class="toolbar-right">
      <mdui-button-icon
        @click="gitGraphStore.toggleShowRemotes()"
        :class="{ active: gitGraphStore.viewState.showRemotes }"
        title="显示远程分支"
      >
        <mdui-icon-filter-list></mdui-icon-filter-list>
      </mdui-button-icon>

      <mdui-button-icon
        @click="emit('refresh')"
        :disabled="gitGraphStore.isLoading"
        title="刷新"
      >
        <mdui-icon-refresh :class="{ spinning: gitGraphStore.isLoading }"></mdui-icon-refresh>
      </mdui-button-icon>
    </div>
  </div>
</template>

<style scoped>
.graph-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.branch-badge {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--mdui-color-primary-container);
  color: var(--mdui-color-on-primary-container);
  border-radius: 12px;
}

.toolbar-center {
  flex: 1;
  max-width: 400px;
}

.toolbar-center mdui-text-field {
  width: 100%;
  --mdui-comp-text-field-density: -3;
}

.toolbar-right {
  display: flex;
  gap: 4px;
}

.toolbar-right mdui-button-icon {
  --mdui-comp-button-icon-size: 36px;
}

.toolbar-right mdui-button-icon.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
