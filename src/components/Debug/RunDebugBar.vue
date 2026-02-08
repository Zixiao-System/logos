<template>
  <div class="run-debug-bar">
    <!-- 配置选择器 -->
    <div class="config-selector">
      <mdui-select
        :value="debugStore.selectedConfigIndex.toString()"
        @change="handleConfigChange"
        size="small"
        :disabled="debugStore.isDebugging"
      >
        <mdui-menu-item
          v-for="(config, index) in debugStore.launchConfigurations"
          :key="index"
          :value="index.toString()"
        >
          <mdui-icon-bug-report v-if="config.request === 'launch'" slot="icon"></mdui-icon-bug-report>
          <mdui-icon-link v-else slot="icon"></mdui-icon-link>
          {{ config.name }}
        </mdui-menu-item>
        <mdui-divider v-if="debugStore.launchConfigurations.length > 0"></mdui-divider>
        <mdui-menu-item value="add" @click="handleAddConfig">
          <mdui-icon-add slot="icon"></mdui-icon-add>
          添加配置...
        </mdui-menu-item>
      </mdui-select>
    </div>

    <!-- 运行按钮 -->
    <mdui-button-icon
      @click="handleRun"
      title="运行 (Ctrl+F5)"
      :disabled="!canRun"
      class="run-button"
    >
      <mdui-icon-play-arrow></mdui-icon-play-arrow>
    </mdui-button-icon>

    <!-- 调试按钮 -->
    <mdui-button-icon
      @click="handleDebug"
      title="开始调试 (F5)"
      :disabled="!canRun"
      class="debug-button"
    >
      <mdui-icon-bug-report></mdui-icon-bug-report>
    </mdui-button-icon>

    <!-- 调试控制按钮（调试中显示） -->
    <template v-if="debugStore.isDebugging">
      <mdui-divider vertical></mdui-divider>

      <!-- 继续/暂停 -->
      <mdui-button-icon
        v-if="debugStore.isPaused"
        @click="handleContinue"
        title="继续 (F5)"
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
      >
        <mdui-icon-stop></mdui-icon-stop>
      </mdui-button-icon>

      <!-- 重启 -->
      <mdui-button-icon
        @click="handleRestart"
        title="重启调试"
      >
        <mdui-icon-refresh></mdui-icon-refresh>
      </mdui-button-icon>

      <mdui-divider vertical></mdui-divider>

      <!-- 单步操作 -->
      <mdui-button-icon
        @click="handleStepOver"
        title="单步跳过 (F10)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-redo></mdui-icon-redo>
      </mdui-button-icon>

      <mdui-button-icon
        @click="handleStepInto"
        title="单步进入 (F11)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-subdirectory-arrow-right></mdui-icon-subdirectory-arrow-right>
      </mdui-button-icon>

      <mdui-button-icon
        @click="handleStepOut"
        title="单步跳出 (Shift+F11)"
        :disabled="!debugStore.isPaused"
      >
        <mdui-icon-subdirectory-arrow-left></mdui-icon-subdirectory-arrow-left>
      </mdui-button-icon>
    </template>

    <!-- 编辑配置按钮 -->
    <mdui-button-icon
      @click="handleOpenConfigDialog"
      title="编辑配置"
      class="config-button"
    >
      <mdui-icon-settings></mdui-icon-settings>
    </mdui-button-icon>

    <!-- 启动配置对话框 -->
    <LaunchConfigDialog
      ref="configDialogRef"
      @config-added="handleConfigAdded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDebugStore } from '@/stores/debug'
import LaunchConfigDialog from './LaunchConfigDialog.vue'

// 图标导入
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/bug-report.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/pause.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/redo.js'
import '@mdui/icons/subdirectory-arrow-right.js'
import '@mdui/icons/subdirectory-arrow-left.js'
import '@mdui/icons/settings.js'
import '@mdui/icons/add.js'
import '@mdui/icons/link.js'

const debugStore = useDebugStore()
const configDialogRef = ref<InstanceType<typeof LaunchConfigDialog> | null>(null)

const canRun = computed(() => {
  return debugStore.hasConfigurations &&
         debugStore.selectedConfigIndex >= 0 &&
         !debugStore.isDebugging
})

function handleConfigChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = target.value
  if (value === 'add') {
    handleAddConfig()
  } else {
    debugStore.selectConfiguration(parseInt(value, 10))
  }
}

function handleAddConfig() {
  configDialogRef.value?.openForAdd()
}

function handleOpenConfigDialog() {
  configDialogRef.value?.open()
}

async function handleRun() {
  await debugStore.runConfiguration()
}

async function handleDebug() {
  await debugStore.debugConfiguration()
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

function handleConfigAdded() {
  // 配置已添加，刷新
}
</script>

<style scoped>
.run-debug-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  height: 36px;
  flex-shrink: 0;
  border-right: 1px solid var(--mdui-color-outline-variant);
}

.config-selector {
  min-width: 140px;
  max-width: 200px;
}

.config-selector mdui-select {
  --mdui-comp-select-height: 28px;
  font-size: 13px;
}

.run-button {
  color: var(--mdui-color-primary);
}

.debug-button {
  color: var(--mdui-color-tertiary);
}

.config-button {
  margin-left: 4px;
}

.run-debug-bar mdui-divider[vertical] {
  height: 20px;
  margin: 0 4px;
}

.run-debug-bar mdui-button-icon {
  --mdui-comp-icon-button-shape-corner: 4px;
  --mdui-comp-icon-button-size: 28px;
}

.run-debug-bar mdui-button-icon:disabled {
  opacity: 0.4;
}
</style>
