<script setup lang="ts">
/**
 * MergeToolbar - 合并冲突工具栏
 * 提供全局操作按钮
 */

import '@mdui/icons/check.js'
import '@mdui/icons/close.js'
import '@mdui/icons/keyboard-arrow-up.js'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/done-all.js'

defineProps<{
  hasUnresolved: boolean
  canContinue: boolean
  isLoading: boolean
  resolvedCount: number
  totalCount: number
}>()

const emit = defineEmits<{
  (e: 'continue'): void
  (e: 'abort'): void
  (e: 'accept-all-ours'): void
  (e: 'accept-all-theirs'): void
  (e: 'prev-conflict'): void
  (e: 'next-conflict'): void
}>()
</script>

<template>
  <div class="merge-toolbar">
    <div class="toolbar-left">
      <span class="status-text">
        <template v-if="hasUnresolved">
          解决冲突: {{ resolvedCount }} / {{ totalCount }}
        </template>
        <template v-else>
          所有冲突已解决
        </template>
      </span>
    </div>

    <div class="toolbar-center">
      <mdui-button-icon
        @click="emit('prev-conflict')"
        title="上一个冲突 (Cmd+[)"
        :disabled="isLoading"
      >
        <mdui-icon-keyboard-arrow-up></mdui-icon-keyboard-arrow-up>
      </mdui-button-icon>
      <mdui-button-icon
        @click="emit('next-conflict')"
        title="下一个冲突 (Cmd+])"
        :disabled="isLoading"
      >
        <mdui-icon-keyboard-arrow-down></mdui-icon-keyboard-arrow-down>
      </mdui-button-icon>

      <mdui-divider vertical></mdui-divider>

      <mdui-tooltip content="全部接受本地 (Ours)" placement="bottom">
        <mdui-button
          variant="outlined"
          @click="emit('accept-all-ours')"
          :disabled="isLoading || !hasUnresolved"
        >
          全部接受本地
        </mdui-button>
      </mdui-tooltip>

      <mdui-tooltip content="全部接受远程 (Theirs)" placement="bottom">
        <mdui-button
          variant="outlined"
          @click="emit('accept-all-theirs')"
          :disabled="isLoading || !hasUnresolved"
        >
          全部接受远程
        </mdui-button>
      </mdui-tooltip>
    </div>

    <div class="toolbar-right">
      <mdui-button
        variant="text"
        @click="emit('abort')"
        :disabled="isLoading"
      >
        <mdui-icon-close slot="icon"></mdui-icon-close>
        中止合并
      </mdui-button>

      <mdui-button
        variant="filled"
        @click="emit('continue')"
        :disabled="isLoading || hasUnresolved"
      >
        <mdui-icon-check slot="icon"></mdui-icon-check>
        完成合并
      </mdui-button>
    </div>
  </div>
</template>

<style scoped>
.merge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center mdui-divider[vertical] {
  height: 24px;
  margin: 0 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center mdui-button-icon {
  --mdui-comp-button-icon-size: 32px;
}

.toolbar-center mdui-button,
.toolbar-right mdui-button {
  --mdui-comp-button-container-height: 32px;
  font-size: 13px;
}
</style>
