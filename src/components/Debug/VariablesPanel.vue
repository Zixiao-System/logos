<template>
  <div class="variables-panel">
    <div v-if="!debugStore.isPaused" class="empty-state">
      <mdui-icon-code></mdui-icon-code>
      <p>程序未暂停</p>
    </div>

    <div v-else-if="debugStore.scopes.length === 0" class="empty-state">
      <mdui-icon-hourglass-empty></mdui-icon-hourglass-empty>
      <p>正在加载变量...</p>
    </div>

    <div v-else class="scopes-list">
      <div v-for="scope in debugStore.scopes" :key="scope.variablesReference" class="scope-section">
        <div class="scope-header" @click="toggleScope(scope.variablesReference)">
          <mdui-icon-keyboard-arrow-down
            v-if="expandedScopes.has(scope.variablesReference)"
          ></mdui-icon-keyboard-arrow-down>
          <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          <span class="scope-name">{{ scope.name }}</span>
        </div>

        <div v-if="expandedScopes.has(scope.variablesReference)" class="variables-list">
          <VariableItem
            v-for="variable in getVariables(scope.variablesReference)"
            :key="variable.name"
            :variable="variable"
            :depth="0"
            :parent-variables-ref="scope.variablesReference"
            @expand="loadChildVariables"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebugStore, type DebugVariable } from '@/stores/debug'
import VariableItem from './VariableItem.vue'

const debugStore = useDebugStore()

const expandedScopes = ref<Set<number>>(new Set())

// 监听当前帧变化，加载作用域
watch(() => debugStore.currentFrameId, async (frameId) => {
  if (frameId !== null) {
    await debugStore.loadScopes(frameId)
    // 自动展开 Locals 作用域
    for (const scope of debugStore.scopes) {
      if (scope.name === 'Locals' || scope.name === 'Local') {
        expandedScopes.value.add(scope.variablesReference)
        await debugStore.loadVariables(scope.variablesReference)
      }
    }
  }
}, { immediate: true })

function toggleScope(variablesRef: number) {
  if (expandedScopes.value.has(variablesRef)) {
    expandedScopes.value.delete(variablesRef)
  } else {
    expandedScopes.value.add(variablesRef)
    debugStore.loadVariables(variablesRef)
  }
}

function getVariables(variablesRef: number): DebugVariable[] {
  return debugStore.getVariables(variablesRef)
}

async function loadChildVariables(variablesRef: number) {
  await debugStore.loadVariables(variablesRef)
}
</script>

<style scoped>
.variables-panel {
  height: 100%;
  overflow: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--mdui-color-outline);
  gap: 8px;
}

.empty-state mdui-icon-code,
.empty-state mdui-icon-hourglass-empty {
  font-size: 48px;
  opacity: 0.5;
}

.scopes-list {
  padding: 4px 0;
}

.scope-section {
  margin-bottom: 4px;
}

.scope-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  font-weight: 500;
  background: var(--mdui-color-surface-container);
}

.scope-header:hover {
  background: var(--mdui-color-surface-container-high);
}

.scope-name {
  margin-left: 4px;
}

.variables-list {
  padding-left: 8px;
}
</style>
