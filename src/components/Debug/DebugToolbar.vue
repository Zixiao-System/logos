<template>
  <div class="debug-toolbar">
    <!-- 会话选择器 -->
    <div class="session-selector" v-if="debugStore.sessions.length > 0">
      <mdui-select
        :value="debugStore.activeSessionId || ''"
        @change="handleSessionChange"
        size="small"
      >
        <mdui-menu-item
          v-for="session in debugStore.sessions"
          :key="session.id"
          :value="session.id"
        >
          {{ session.name }}
          <span class="session-state" :class="session.state">
            {{ getStateLabel(session.state) }}
          </span>
        </mdui-menu-item>
      </mdui-select>
    </div>

    <!-- 控制按钮 -->
    <div class="control-buttons">
      <!-- 继续/暂停 -->
      <mdui-button-icon
        v-if="debugStore.isPaused"
        @click="handleContinue"
        title="继续 (F5)"
        :disabled="!debugStore.isDebugging"
      >
        <mdui-icon-play-arrow></mdui-icon-play-arrow>
      </mdui-button-icon>
      <mdui-button-icon
        v-else
        @click="handlePause"
        title="暂停 (F6)"
        :disabled="!debugStore.isRunning"
      >
        <mdui-icon-pause></mdui-icon-pause>
      </mdui-button-icon>

      <!-- 停止 -->
      <mdui-button-icon
        @click="handleStop"
        title="停止 (Shift+F5)"
        :disabled="!debugStore.isDebugging"
      >
        <mdui-icon-stop></mdui-icon-stop>
      </mdui-button-icon>

      <!-- 重启 -->
      <mdui-button-icon
        @click="handleRestart"
        title="重启 (Ctrl+Shift+F5)"
        :disabled="!debugStore.isDebugging"
      >
        <mdui-icon-refresh></mdui-icon-refresh>
      </mdui-button-icon>

      <mdui-divider vertical></mdui-divider>

      <!-- 单步跳过 -->
      <mdui-button-icon
        @click="handleStepOver"
        title="单步跳过 (F10)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-redo></mdui-icon-redo>
      </mdui-button-icon>

      <!-- 单步进入 -->
      <mdui-button-icon
        @click="handleStepInto"
        title="单步进入 (F11)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-subdirectory-arrow-right></mdui-icon-subdirectory-arrow-right>
      </mdui-button-icon>

      <!-- 单步跳出 -->
      <mdui-button-icon
        @click="handleStepOut"
        title="单步跳出 (Shift+F11)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-subdirectory-arrow-left></mdui-icon-subdirectory-arrow-left>
      </mdui-button-icon>
    </div>

    <!-- 启动按钮（无会话时显示） -->
    <div class="start-button" v-if="!debugStore.isDebugging">
      <mdui-button @click="handleStartDebug" variant="tonal">
        <mdui-icon-play-arrow slot="icon"></mdui-icon-play-arrow>
        开始调试
      </mdui-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDebugStore } from '@/stores/debug'

const debugStore = useDebugStore()

const emit = defineEmits<{
  (e: 'start-debug'): void
}>()

function getStateLabel(state: string): string {
  switch (state) {
    case 'initializing': return '初始化中'
    case 'running': return '运行中'
    case 'stopped': return '已暂停'
    case 'terminated': return '已终止'
    default: return state
  }
}

function handleSessionChange(event: Event) {
  const target = event.target as HTMLSelectElement
  debugStore.setActiveSession(target.value)
}

async function handleContinue() {
  await debugStore.continue()
}

async function handlePause() {
  await debugStore.pause()
}

async function handleStop() {
  await debugStore.stopDebugging()
}

async function handleRestart() {
  await debugStore.restartDebugging()
}

async function handleStepOver() {
  await debugStore.stepOver()
}

async function handleStepInto() {
  await debugStore.stepInto()
}

async function handleStepOut() {
  await debugStore.stepOut()
}

function handleStartDebug() {
  emit('start-debug')
}
</script>

<style scoped>
.debug-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--mdui-color-surface-container);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.session-selector {
  min-width: 150px;
}

.session-selector mdui-select {
  --mdui-comp-select-height: 32px;
}

.session-state {
  margin-left: 8px;
  font-size: 12px;
  opacity: 0.7;
}

.session-state.running {
  color: var(--mdui-color-primary);
}

.session-state.stopped {
  color: var(--mdui-color-error);
}

.session-state.terminated {
  color: var(--mdui-color-outline);
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
}

.control-buttons mdui-button-icon {
  --mdui-comp-icon-button-shape-corner: 4px;
}

.control-buttons mdui-button-icon:disabled {
  opacity: 0.5;
}

.control-buttons mdui-divider[vertical] {
  height: 24px;
  margin: 0 4px;
}

.start-button {
  margin-left: auto;
}
</style>
