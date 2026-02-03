<template>
  <div class="variable-item" :style="{ paddingLeft: `${depth * 16 + 8}px` }">
    <div class="variable-row" @click="handleClick">
      <!-- 展开/折叠图标 -->
      <span class="expand-icon" v-if="hasChildren">
        <mdui-icon-keyboard-arrow-down v-if="expanded"></mdui-icon-keyboard-arrow-down>
        <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
      </span>
      <span class="expand-icon placeholder" v-else></span>

      <!-- 变量名 -->
      <span class="variable-name">{{ variable.name }}</span>

      <!-- 类型 -->
      <span class="variable-type" v-if="variable.type">{{ variable.type }}</span>

      <!-- 值 -->
      <span class="variable-value" :class="valueClass">{{ displayValue }}</span>
    </div>

    <!-- 子变量 -->
    <div v-if="expanded && children.length > 0" class="children">
      <VariableItem
        v-for="child in children"
        :key="child.name"
        :variable="child"
        :depth="depth + 1"
        @expand="$emit('expand', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDebugStore, type DebugVariable } from '@/stores/debug'

const props = defineProps<{
  variable: DebugVariable
  depth: number
}>()

const emit = defineEmits<{
  (e: 'expand', variablesRef: number): void
}>()

const debugStore = useDebugStore()

const expanded = ref(false)

const hasChildren = computed(() => {
  return props.variable.variablesReference > 0
})

const children = computed(() => {
  if (!hasChildren.value || !expanded.value) return []
  return debugStore.getVariables(props.variable.variablesReference)
})

const displayValue = computed(() => {
  const value = props.variable.value
  // 截断过长的值
  if (value.length > 100) {
    return value.substring(0, 100) + '...'
  }
  return value
})

const valueClass = computed(() => {
  const value = props.variable.value
  const type = props.variable.type?.toLowerCase() || ''

  if (type.includes('string') || value.startsWith('"') || value.startsWith("'")) {
    return 'string'
  }
  if (type.includes('number') || type.includes('int') || type.includes('float') || !isNaN(Number(value))) {
    return 'number'
  }
  if (value === 'true' || value === 'false' || type.includes('bool')) {
    return 'boolean'
  }
  if (value === 'null' || value === 'undefined' || value === 'None') {
    return 'null'
  }
  if (type.includes('function') || value.startsWith('ƒ') || value.startsWith('function')) {
    return 'function'
  }
  return 'object'
})

function handleClick() {
  if (hasChildren.value) {
    expanded.value = !expanded.value
    if (expanded.value) {
      emit('expand', props.variable.variablesReference)
    }
  }
}
</script>

<style scoped>
.variable-item {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 12px;
}

.variable-row {
  display: flex;
  align-items: center;
  padding: 2px 4px;
  cursor: default;
  gap: 4px;
}

.variable-row:hover {
  background: var(--mdui-color-surface-container-highest);
}

.expand-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.expand-icon.placeholder {
  visibility: hidden;
}

.variable-name {
  color: var(--mdui-color-primary);
  flex-shrink: 0;
}

.variable-type {
  color: var(--mdui-color-outline);
  font-size: 10px;
  margin-left: 4px;
}

.variable-value {
  margin-left: auto;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.variable-value.string {
  color: var(--logos-syntax-string, #ce9178);
}

.variable-value.number {
  color: var(--logos-syntax-number, #b5cea8);
}

.variable-value.boolean {
  color: var(--logos-syntax-keyword, #569cd6);
}

.variable-value.null {
  color: var(--mdui-color-on-surface-variant, #808080);
  font-style: italic;
}

.variable-value.function {
  color: var(--logos-syntax-function, #dcdcaa);
}

.variable-value.object {
  color: var(--mdui-color-on-surface);
}

.children {
  border-left: 1px solid var(--mdui-color-outline-variant);
  margin-left: 12px;
}
</style>
