<template>
  <div class="watch-panel">
    <!-- 添加监视表达式 -->
    <div class="add-watch">
      <mdui-text-field
        v-model="newExpression"
        placeholder="添加表达式..."
        size="small"
        @keydown.enter="addWatch"
      >
        <mdui-button-icon slot="end-icon" @click="addWatch" :disabled="!newExpression">
          <mdui-icon-add></mdui-icon-add>
        </mdui-button-icon>
      </mdui-text-field>
    </div>

    <!-- 监视列表 -->
    <div class="watch-list">
      <div
        v-for="watch in debugStore.watchExpressions"
        :key="watch.id"
        class="watch-item"
      >
        <div class="watch-row">
          <span class="watch-expression">{{ watch.expression }}</span>
          <span class="watch-value" v-if="watch.result" :class="getValueClass(watch.result.result)">
            {{ watch.result.result }}
          </span>
          <span class="watch-error" v-else-if="watch.error">
            {{ watch.error }}
          </span>
          <span class="watch-value pending" v-else>
            等待求值...
          </span>
          <mdui-button-icon
            class="remove-button"
            @click="removeWatch(watch.id)"
          >
            <mdui-icon-close></mdui-icon-close>
          </mdui-button-icon>
        </div>
      </div>

      <div v-if="debugStore.watchExpressions.length === 0" class="empty-state">
        <p>没有监视表达式</p>
        <p class="hint">输入表达式来监视变量或值</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDebugStore } from '@/stores/debug'

const debugStore = useDebugStore()

const newExpression = ref('')

async function addWatch() {
  if (!newExpression.value.trim()) return

  const api = window.electronAPI?.debug
  if (api) {
    await api.addWatch(newExpression.value.trim())
  }
  newExpression.value = ''
}

async function removeWatch(watchId: string) {
  const api = window.electronAPI?.debug
  if (api) {
    await api.removeWatch(watchId)
  }
  debugStore.removeWatch(watchId)
}

function getValueClass(value: string): string {
  if (value.startsWith('"') || value.startsWith("'")) return 'string'
  if (!isNaN(Number(value))) return 'number'
  if (value === 'true' || value === 'false') return 'boolean'
  if (value === 'null' || value === 'undefined') return 'null'
  return 'object'
}
</script>

<style scoped>
.watch-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.add-watch {
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.add-watch mdui-text-field {
  width: 100%;
}

.watch-list {
  flex: 1;
  overflow: auto;
}

.watch-item {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.watch-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 12px;
}

.watch-row:hover .remove-button {
  opacity: 1;
}

.watch-expression {
  color: var(--mdui-color-primary);
  flex-shrink: 0;
}

.watch-value {
  margin-left: auto;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watch-value.string { color: var(--logos-debug-string, #ce9178); }
.watch-value.number { color: var(--logos-debug-number, #b5cea8); }
.watch-value.boolean { color: var(--logos-debug-boolean, #569cd6); }
.watch-value.null { color: var(--logos-debug-null, #808080); font-style: italic; }
.watch-value.pending { color: var(--mdui-color-outline); font-style: italic; }

.watch-error {
  margin-left: auto;
  color: var(--mdui-color-error);
  font-size: 11px;
}

.remove-button {
  opacity: 0;
  transition: opacity 0.2s;
  --mdui-comp-icon-button-shape-corner: 4px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--mdui-color-outline);
  text-align: center;
  padding: 24px;
}

.empty-state .hint {
  font-size: 12px;
  opacity: 0.7;
}
</style>
