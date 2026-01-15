<template>
  <div class="call-hierarchy-panel">
    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <div class="toolbar-title">
        <mdui-icon-account-tree></mdui-icon-account-tree>
        <span>Call Hierarchy</span>
      </div>
      <div class="toolbar-actions">
        <!-- 方向切换 -->
        <div class="direction-toggle">
          <button
            class="toggle-btn"
            :class="{ active: store.direction === 'incoming' }"
            @click="store.setDirection('incoming')"
            title="Show Callers (Who calls this?)"
          >
            <mdui-icon-call-received></mdui-icon-call-received>
          </button>
          <button
            class="toggle-btn"
            :class="{ active: store.direction === 'outgoing' }"
            @click="store.setDirection('outgoing')"
            title="Show Callees (What does this call?)"
          >
            <mdui-icon-call-made></mdui-icon-call-made>
          </button>
        </div>

        <!-- 刷新按钮 -->
        <button class="icon-btn" @click="store.refresh()" title="Refresh">
          <mdui-icon-refresh></mdui-icon-refresh>
        </button>

        <!-- 清除按钮 -->
        <button class="icon-btn" @click="store.clear()" title="Clear">
          <mdui-icon-clear></mdui-icon-clear>
        </button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="panel-content">
      <!-- 加载状态 -->
      <div v-if="store.isLoading" class="loading-state">
        <mdui-icon-sync class="spinning"></mdui-icon-sync>
        <span>Loading call hierarchy...</span>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="store.error" class="error-state">
        <mdui-icon-error-outline></mdui-icon-error-outline>
        <span>{{ store.error }}</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!store.hasData" class="empty-state">
        <mdui-icon-account-tree class="empty-icon"></mdui-icon-account-tree>
        <p>No call hierarchy data</p>
        <p class="hint">
          Right-click on a function or method and select<br />
          "Show Call Hierarchy" to view callers/callees
        </p>
      </div>

      <!-- 调用层级树 -->
      <div v-else class="hierarchy-tree">
        <!-- 根节点信息 -->
        <div class="root-info">
          <span class="direction-label">
            {{ store.direction === 'incoming' ? 'Callers of' : 'Calls from' }}
          </span>
          <span class="root-name">{{ store.rootItem?.name }}</span>
          <span class="root-file">({{ store.rootFileName }})</span>
        </div>

        <!-- 树节点 -->
        <div class="tree-container">
          <CallHierarchyTreeNode
            v-for="node in store.currentTree"
            :key="getNodeId(node.item)"
            :node="node"
            :depth="0"
            @toggle="handleToggle"
            @select="handleSelect"
            @navigate="handleNavigate"
          />

          <!-- 无结果 -->
          <div v-if="store.currentTree.length === 0" class="no-results">
            <span>No {{ store.direction === 'incoming' ? 'callers' : 'callees' }} found</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
  useCallHierarchyStore,
  getNodeId,
  type CallHierarchyItem,
  type CallHierarchyTreeNode as TreeNodeType,
} from '@/stores/callHierarchy'
import CallHierarchyTreeNode from './CallHierarchyTreeNode.vue'

// 导入图标
import '@mdui/icons/account-tree.js'
import '@mdui/icons/call-received.js'
import '@mdui/icons/call-made.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/clear.js'
import '@mdui/icons/sync.js'
import '@mdui/icons/error-outline.js'

const store = useCallHierarchyStore()

/** 处理节点展开/折叠 */
const handleToggle = async (node: TreeNodeType) => {
  await store.toggleNode(node.item, node.depth)
}

/** 处理节点选择 */
const handleSelect = (item: CallHierarchyItem) => {
  store.selectNode(item)
}

/** 处理导航到符号 */
const handleNavigate = (item: CallHierarchyItem) => {
  store.navigateToSymbol(item)
}

/** 处理右键菜单中的 "Show Call Hierarchy" 事件 */
const handleShowCallHierarchy = (event: CustomEvent) => {
  const { uri, line, column } = event.detail
  store.prepareCallHierarchy(uri, line, column)
}

onMounted(() => {
  // 监听外部触发的调用层级请求
  window.addEventListener('show-call-hierarchy', handleShowCallHierarchy as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('show-call-hierarchy', handleShowCallHierarchy as EventListener)
})
</script>

<style scoped>
.call-hierarchy-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
}

/* 工具栏 */
.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container);
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.toolbar-title mdui-icon-account-tree {
  font-size: 16px;
  color: var(--mdui-color-primary);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.direction-toggle {
  display: flex;
  background: var(--mdui-color-surface-container-highest);
  border-radius: 4px;
  padding: 2px;
  margin-right: 8px;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  color: var(--mdui-color-on-surface-variant);
  transition: all 0.15s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.toggle-btn.active {
  background: var(--mdui-color-primary);
  color: var(--mdui-color-on-primary);
}

.toggle-btn mdui-icon-call-received,
.toggle-btn mdui-icon-call-made {
  font-size: 16px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--mdui-color-on-surface-variant);
  transition: background-color 0.15s;
}

.icon-btn:hover {
  background: var(--mdui-color-surface-container-highest);
}

.icon-btn mdui-icon-refresh,
.icon-btn mdui-icon-clear {
  font-size: 18px;
}

/* 内容区域 */
.panel-content {
  flex: 1;
  overflow: auto;
}

/* 状态展示 */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.loading-state mdui-icon-sync,
.error-state mdui-icon-error-outline {
  font-size: 32px;
}

.error-state mdui-icon-error-outline {
  color: var(--mdui-color-error);
}

.empty-state .empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  text-align: center;
}

.empty-state .hint {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
}

.spinning {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 调用层级树 */
.hierarchy-tree {
  display: flex;
  flex-direction: column;
}

.root-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  font-size: 12px;
}

.direction-label {
  color: var(--mdui-color-on-surface-variant);
}

.root-name {
  font-weight: 600;
  color: var(--mdui-color-primary);
}

.root-file {
  color: var(--mdui-color-on-surface-variant);
  font-size: 11px;
}

.tree-container {
  padding: 4px 0;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: var(--mdui-color-on-surface-variant);
  font-size: 12px;
}
</style>
