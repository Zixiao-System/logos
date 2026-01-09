<script setup lang="ts">
/**
 * 重构菜单组件
 * 提供代码重构操作
 */

import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'

// 导入图标
import '@mdui/icons/code.js'
import '@mdui/icons/functions.js'
import '@mdui/icons/data-object.js'
import '@mdui/icons/drive-file-rename-outline.js'
import '@mdui/icons/delete-outline.js'
import '@mdui/icons/vertical-align-center.js'
import '@mdui/icons/call-made.js'
import '@mdui/icons/keyboard-arrow-right.js'

const emit = defineEmits<{
  (e: 'action', action: RefactorAction): void
  (e: 'close'): void
}>()

interface RefactorAction {
  type: 'extractMethod' | 'extractVariable' | 'extractConstant' | 'rename' | 'inline' | 'safeDelete' | 'move'
  params?: Record<string, unknown>
}

const editorStore = useEditorStore()

// 检查是否有选中的代码
const hasSelection = computed(() => {
  // TODO: 从编辑器获取选区状态
  return true
})

// 当前语言
const currentLanguage = computed(() => {
  return editorStore.activeTab?.language || 'plaintext'
})

// 检查是否支持特定重构
const supportedRefactors = computed(() => {
  const lang = currentLanguage.value
  const jsLangs = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact']

  return {
    extractMethod: jsLangs.includes(lang),
    extractVariable: jsLangs.includes(lang),
    extractConstant: jsLangs.includes(lang),
    rename: true,
    inline: jsLangs.includes(lang),
    safeDelete: jsLangs.includes(lang),
    move: jsLangs.includes(lang)
  }
})

// 执行重构操作
function executeRefactor(type: RefactorAction['type']) {
  emit('action', { type })
  emit('close')
}

// 快捷键映射
const shortcuts: Record<string, string> = {
  extractMethod: '⌘⌥M',
  extractVariable: '⌘⌥V',
  extractConstant: '⌘⌥C',
  rename: 'F2',
  inline: '⌘⌥N',
  safeDelete: '⌘⌫',
  move: 'F6'
}
</script>

<template>
  <div class="refactor-menu">
    <div class="menu-header">
      <mdui-icon-code></mdui-icon-code>
      重构
    </div>

    <div class="menu-section">
      <div class="section-title">提取</div>

      <div
        class="menu-item"
        :class="{ disabled: !supportedRefactors.extractMethod || !hasSelection }"
        @click="supportedRefactors.extractMethod && hasSelection && executeRefactor('extractMethod')"
      >
        <mdui-icon-functions class="item-icon"></mdui-icon-functions>
        <span class="item-label">提取方法...</span>
        <span class="item-shortcut">{{ shortcuts.extractMethod }}</span>
      </div>

      <div
        class="menu-item"
        :class="{ disabled: !supportedRefactors.extractVariable || !hasSelection }"
        @click="supportedRefactors.extractVariable && hasSelection && executeRefactor('extractVariable')"
      >
        <mdui-icon-data-object class="item-icon"></mdui-icon-data-object>
        <span class="item-label">提取变量...</span>
        <span class="item-shortcut">{{ shortcuts.extractVariable }}</span>
      </div>

      <div
        class="menu-item"
        :class="{ disabled: !supportedRefactors.extractConstant || !hasSelection }"
        @click="supportedRefactors.extractConstant && hasSelection && executeRefactor('extractConstant')"
      >
        <mdui-icon-data-object class="item-icon"></mdui-icon-data-object>
        <span class="item-label">提取常量...</span>
        <span class="item-shortcut">{{ shortcuts.extractConstant }}</span>
      </div>
    </div>

    <mdui-divider></mdui-divider>

    <div class="menu-section">
      <div class="section-title">修改</div>

      <div
        class="menu-item"
        @click="executeRefactor('rename')"
      >
        <mdui-icon-drive-file-rename-outline class="item-icon"></mdui-icon-drive-file-rename-outline>
        <span class="item-label">重命名...</span>
        <span class="item-shortcut">{{ shortcuts.rename }}</span>
      </div>

      <div
        class="menu-item"
        :class="{ disabled: !supportedRefactors.inline }"
        @click="supportedRefactors.inline && executeRefactor('inline')"
      >
        <mdui-icon-vertical-align-center class="item-icon"></mdui-icon-vertical-align-center>
        <span class="item-label">内联...</span>
        <span class="item-shortcut">{{ shortcuts.inline }}</span>
      </div>

      <div
        class="menu-item"
        :class="{ disabled: !supportedRefactors.move }"
        @click="supportedRefactors.move && executeRefactor('move')"
      >
        <mdui-icon-call-made class="item-icon"></mdui-icon-call-made>
        <span class="item-label">移动...</span>
        <span class="item-shortcut">{{ shortcuts.move }}</span>
      </div>
    </div>

    <mdui-divider></mdui-divider>

    <div class="menu-section">
      <div
        class="menu-item danger"
        :class="{ disabled: !supportedRefactors.safeDelete }"
        @click="supportedRefactors.safeDelete && executeRefactor('safeDelete')"
      >
        <mdui-icon-delete-outline class="item-icon"></mdui-icon-delete-outline>
        <span class="item-label">安全删除...</span>
        <span class="item-shortcut">{{ shortcuts.safeDelete }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.refactor-menu {
  min-width: 280px;
  padding: 8px 0;
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  box-shadow: var(--mdui-elevation-level2);
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--mdui-color-on-surface);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  margin-bottom: 8px;
}

.menu-section {
  padding: 4px 0;
}

.section-title {
  padding: 4px 16px 8px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.menu-item:hover:not(.disabled) {
  background: var(--mdui-color-surface-container-highest);
}

.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item.danger:not(.disabled) .item-icon,
.menu-item.danger:not(.disabled) .item-label {
  color: var(--mdui-color-error);
}

.item-icon {
  font-size: 18px;
  color: var(--mdui-color-on-surface-variant);
}

.item-label {
  flex: 1;
  font-size: 13px;
  color: var(--mdui-color-on-surface);
}

.item-shortcut {
  font-size: 12px;
  color: var(--mdui-color-outline);
  font-family: monospace;
}

mdui-divider {
  margin: 4px 0;
}
</style>
