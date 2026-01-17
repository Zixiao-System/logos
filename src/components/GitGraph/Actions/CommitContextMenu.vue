<script setup lang="ts">
/**
 * Commit 上下文菜单
 */

import type { GraphCommit } from '@/types/gitGraph'

// 导入 MDUI 图标
import '@mdui/icons/exit-to-app.js'
import '@mdui/icons/content-copy.js'
import '@mdui/icons/undo.js'
import '@mdui/icons/sell.js'
import '@mdui/icons/label.js'
import '@mdui/icons/compare.js'
import '@mdui/icons/restart-alt.js'

const props = defineProps<{
  commit: GraphCommit
  visible: boolean
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string, hash: string): void
}>()

// 菜单项
const menuItems = [
  { id: 'checkout', label: '检出此提交', icon: 'exit-to-app' },
  { id: 'divider1', divider: true },
  { id: 'cherryPick', label: 'Cherry-pick', icon: 'content-copy' },
  { id: 'revert', label: 'Revert', icon: 'undo' },
  { id: 'divider2', divider: true },
  { id: 'createTag', label: '创建 Tag...', icon: 'sell' },
  { id: 'createBranch', label: '创建分支...', icon: 'label' },
  { id: 'divider3', divider: true },
  { id: 'resetSoft', label: 'Reset --soft', icon: 'restart-alt' },
  { id: 'resetMixed', label: 'Reset --mixed', icon: 'restart-alt' },
  { id: 'resetHard', label: 'Reset --hard (危险)', icon: 'restart-alt', danger: true },
  { id: 'divider4', divider: true },
  { id: 'copyHash', label: '复制 Hash', icon: 'content-copy' },
  { id: 'copyMessage', label: '复制消息', icon: 'content-copy' },
  { id: 'viewDiff', label: '查看更改', icon: 'compare' }
]

function handleAction(action: string) {
  emit('action', action, props.commit.hash)
  emit('close')
}

// 点击菜单外部关闭
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.commit-context-menu')) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="context-menu-overlay"
        @click="handleClickOutside"
        @contextmenu.prevent="emit('close')"
      >
        <div
          class="commit-context-menu"
          :style="{ left: position.x + 'px', top: position.y + 'px' }"
        >
          <!-- 头部: commit 信息 -->
          <div class="menu-header">
            <span class="hash">{{ commit.shortHash }}</span>
            <span class="message">{{ commit.message.slice(0, 30) }}{{ commit.message.length > 30 ? '...' : '' }}</span>
          </div>

          <!-- 菜单项 -->
          <div class="menu-items">
            <template v-for="item in menuItems" :key="item.id">
              <div v-if="item.divider" class="menu-divider"></div>
              <div
                v-else
                class="menu-item"
                :class="{ danger: item.danger }"
                @click="handleAction(item.id)"
              >
              <mdui-icon-exit-to-app v-if="item.icon === 'exit-to-app'"></mdui-icon-exit-to-app>
                <mdui-icon-content-copy v-else-if="item.icon === 'content-copy'"></mdui-icon-content-copy>
                <mdui-icon-undo v-else-if="item.icon === 'undo'"></mdui-icon-undo>
                <mdui-icon-sell v-else-if="item.icon === 'sell'"></mdui-icon-sell>
                <mdui-icon-label v-else-if="item.icon === 'label'"></mdui-icon-label>
                <mdui-icon-compare v-else-if="item.icon === 'compare'"></mdui-icon-compare>
                <mdui-icon-restart-alt v-else-if="item.icon === 'restart-alt'"></mdui-icon-restart-alt>
                <span>{{ item.label }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

.commit-context-menu {
  position: fixed;
  min-width: 200px;
  background: var(--mdui-color-surface-container-high);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.menu-header {
  padding: 12px 16px;
  background: var(--mdui-color-surface-container-highest);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-header .hash {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--mdui-color-primary);
  padding: 2px 6px;
  background: var(--mdui-color-primary-container);
  border-radius: 4px;
}

.menu-header .message {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-items {
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  cursor: pointer;
  transition: background-color 0.15s;
}

.menu-item:hover {
  background: var(--mdui-color-surface-container-highest);
}

.menu-item.danger {
  color: var(--mdui-color-error);
}

.menu-item.danger:hover {
  background: var(--mdui-color-error-container);
}

.menu-item mdui-icon-exit-to-app,
.menu-item mdui-icon-content-copy,
.menu-item mdui-icon-undo,
.menu-item mdui-icon-sell,
.menu-item mdui-icon-label,
.menu-item mdui-icon-compare,
.menu-item mdui-icon-restart-alt {
  font-size: 18px;
  opacity: 0.7;
}

.menu-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--mdui-color-outline-variant);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
