<template>
  <div class="tree-node" :style="{ paddingLeft: `${depth * 16 + 8}px` }">
    <!-- 节点行 -->
    <div
      class="node-row"
      :class="{ selected: isSelected, loading: node.isLoading }"
      @click="handleClick"
      @dblclick="handleDoubleClick"
    >
      <!-- 展开/折叠图标 -->
      <button class="expand-btn" @click.stop="handleToggle">
        <mdui-icon-expand-more
          v-if="!isExpanded"
          class="expand-icon"
        ></mdui-icon-expand-more>
        <mdui-icon-expand-less
          v-else
          class="expand-icon"
        ></mdui-icon-expand-less>
      </button>

      <!-- 符号图标 -->
      <div class="symbol-icon">
        <component :is="symbolIconComponent"></component>
      </div>

      <!-- 符号名称 -->
      <span class="symbol-name">{{ node.item.name }}</span>

      <!-- 符号详情 (限定名) -->
      <span v-if="node.item.detail" class="symbol-detail">
        {{ node.item.detail }}
      </span>

      <!-- 文件位置 -->
      <span class="file-location">
        {{ fileName }}:{{ node.item.range.start.line + 1 }}
      </span>

      <!-- 加载指示器 -->
      <mdui-icon-sync v-if="node.isLoading" class="loading-icon spinning"></mdui-icon-sync>
    </div>

    <!-- 子节点 -->
    <div v-if="isExpanded && node.children.length > 0" class="children">
      <CallHierarchyTreeNode
        v-for="child in node.children"
        :key="getNodeId(child.item)"
        :node="child"
        :depth="depth + 1"
        @toggle="$emit('toggle', $event)"
        @select="$emit('select', $event)"
        @navigate="$emit('navigate', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import {
  useCallHierarchyStore,
  getNodeId,
  getSymbolIcon,
  type CallHierarchyTreeNode as TreeNodeType,
} from '@/stores/callHierarchy'

// 导入图标
import '@mdui/icons/expand-more.js'
import '@mdui/icons/expand-less.js'
import '@mdui/icons/sync.js'
import '@mdui/icons/functions.js'
import '@mdui/icons/class.js'
import '@mdui/icons/code.js'
import '@mdui/icons/label.js'
import '@mdui/icons/folder.js'
import '@mdui/icons/api.js'
import '@mdui/icons/construction.js'
import '@mdui/icons/data-object.js'

const props = defineProps<{
  node: TreeNodeType
  depth: number
}>()

const emit = defineEmits<{
  toggle: [node: TreeNodeType]
  select: [item: TreeNodeType['item']]
  navigate: [item: TreeNodeType['item']]
}>()

const store = useCallHierarchyStore()

/** 是否展开 */
const isExpanded = computed(() => store.isNodeExpanded(props.node.item))

/** 是否选中 */
const isSelected = computed(() => {
  if (!store.selectedNode) return false
  return getNodeId(store.selectedNode) === getNodeId(props.node.item)
})

/** 获取文件名 */
const fileName = computed(() => {
  const uri = props.node.item.uri
  const path = uri.replace('file://', '')
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
})

/** 获取符号图标组件 */
const symbolIconComponent = computed(() => {
  const iconName = getSymbolIcon(props.node.item.kind)
  // 动态加载图标组件
  return defineAsyncComponent(async () => {
    try {
      await import(`@mdui/icons/${iconName}.js`)
      return {
        template: `<mdui-icon-${iconName}></mdui-icon-${iconName}>`,
      }
    } catch {
      // 回退到默认图标
      return {
        template: '<mdui-icon-code></mdui-icon-code>',
      }
    }
  })
})

/** 处理点击 */
const handleClick = () => {
  emit('select', props.node.item)
}

/** 处理双击 (导航到位置) */
const handleDoubleClick = () => {
  emit('navigate', props.node.item)
}

/** 处理展开/折叠 */
const handleToggle = () => {
  emit('toggle', props.node)
}
</script>

<style scoped>
.tree-node {
  user-select: none;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.node-row:hover {
  background: var(--mdui-color-surface-container);
}

.node-row.selected {
  background: var(--mdui-color-secondary-container);
}

.node-row.loading {
  opacity: 0.7;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--mdui-color-on-surface-variant);
  border-radius: 4px;
  flex-shrink: 0;
}

.expand-btn:hover {
  background: var(--mdui-color-surface-container-highest);
}

.expand-icon {
  font-size: 18px;
}

.symbol-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--mdui-color-primary);
}

.symbol-icon :deep(mdui-icon-functions),
.symbol-icon :deep(mdui-icon-class),
.symbol-icon :deep(mdui-icon-code),
.symbol-icon :deep([class^="mdui-icon-"]) {
  font-size: 16px;
}

.symbol-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
  white-space: nowrap;
}

.symbol-detail {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.file-location {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
  margin-left: auto;
  white-space: nowrap;
  font-family: monospace;
}

.loading-icon {
  font-size: 14px;
  color: var(--mdui-color-primary);
  margin-left: 8px;
}

.spinning {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.children {
  margin-left: 0;
}
</style>
