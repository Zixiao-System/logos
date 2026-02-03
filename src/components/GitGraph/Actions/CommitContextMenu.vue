<script setup lang="ts">
/**
 * Commit 上下文菜单
 */

import { ref } from 'vue'
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

const dropdownRef = ref<HTMLElement | null>(null)

function handleAction(action: string) {
  emit('action', action, props.commit.hash)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <mdui-dropdown
      ref="dropdownRef"
      :open="visible"
      trigger="manual"
      placement="bottom-start"
      :style="{ position: 'fixed', left: position.x + 'px', top: position.y + 'px' }"
      @close="emit('close')"
      class="commit-context-dropdown"
    >
      <div slot="trigger"></div>
      <mdui-menu dense class="commit-context-menu">
        <!-- 头部: commit 信息 -->
        <div class="menu-header">
          <span class="hash">{{ commit.shortHash }}</span>
          <span class="message">{{ commit.message.slice(0, 30) }}{{ commit.message.length > 30 ? '...' : '' }}</span>
        </div>

        <mdui-menu-item @click="handleAction('checkout')">
          <mdui-icon-exit-to-app slot="icon"></mdui-icon-exit-to-app>
          检出此提交
        </mdui-menu-item>

        <mdui-divider></mdui-divider>

        <mdui-menu-item @click="handleAction('cherryPick')">
          <mdui-icon-content-copy slot="icon"></mdui-icon-content-copy>
          Cherry-pick
        </mdui-menu-item>
        <mdui-menu-item @click="handleAction('revert')">
          <mdui-icon-undo slot="icon"></mdui-icon-undo>
          Revert
        </mdui-menu-item>

        <mdui-divider></mdui-divider>

        <mdui-menu-item @click="handleAction('createTag')">
          <mdui-icon-sell slot="icon"></mdui-icon-sell>
          创建 Tag...
        </mdui-menu-item>
        <mdui-menu-item @click="handleAction('createBranch')">
          <mdui-icon-label slot="icon"></mdui-icon-label>
          创建分支...
        </mdui-menu-item>

        <mdui-divider></mdui-divider>

        <mdui-menu-item @click="handleAction('resetSoft')">
          <mdui-icon-restart-alt slot="icon"></mdui-icon-restart-alt>
          Reset --soft
        </mdui-menu-item>
        <mdui-menu-item @click="handleAction('resetMixed')">
          <mdui-icon-restart-alt slot="icon"></mdui-icon-restart-alt>
          Reset --mixed
        </mdui-menu-item>
        <mdui-menu-item class="danger-item" @click="handleAction('resetHard')">
          <mdui-icon-restart-alt slot="icon"></mdui-icon-restart-alt>
          Reset --hard (危险)
        </mdui-menu-item>

        <mdui-divider></mdui-divider>

        <mdui-menu-item @click="handleAction('copyHash')">
          <mdui-icon-content-copy slot="icon"></mdui-icon-content-copy>
          复制 Hash
        </mdui-menu-item>
        <mdui-menu-item @click="handleAction('copyMessage')">
          <mdui-icon-content-copy slot="icon"></mdui-icon-content-copy>
          复制消息
        </mdui-menu-item>
        <mdui-menu-item @click="handleAction('viewDiff')">
          <mdui-icon-compare slot="icon"></mdui-icon-compare>
          查看更改
        </mdui-menu-item>
      </mdui-menu>
    </mdui-dropdown>
  </Teleport>
</template>

<style scoped>
.commit-context-dropdown {
  --z-index: 10000;
}

.commit-context-menu {
  min-width: 200px;
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

.danger-item {
  color: var(--mdui-color-error);
}

.danger-item:hover {
  background: var(--mdui-color-error-container);
}

mdui-divider {
  margin: 4px 0;
}
</style>
