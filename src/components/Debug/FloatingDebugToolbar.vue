<template>
  <Teleport to="body">
    <div
      v-if="debugStore.isDebugging"
      ref="toolbarRef"
      class="floating-debug-toolbar"
      :style="{ left: positionX + 'px' }"
      @dblclick="recenter"
    >
      <!-- Session selector (multi-session) -->
      <select
        v-if="debugStore.sessions.length > 1"
        class="session-selector"
        :value="debugStore.activeSessionId"
        @change="onSessionChange"
      >
        <option
          v-for="session in activeSessions"
          :key="session.id"
          :value="session.id"
        >
          {{ session.name }}
        </option>
      </select>

      <div class="toolbar-buttons">
        <!-- Continue / Pause toggle -->
        <mdui-button-icon
          :title="debugStore.isPaused ? '继续 (F5)' : '暂停 (F6)'"
          @click="debugStore.isPaused ? debugStore.continue() : debugStore.pause()"
        >
          <mdui-icon-play-arrow v-if="debugStore.isPaused"></mdui-icon-play-arrow>
          <mdui-icon-pause v-else></mdui-icon-pause>
        </mdui-button-icon>

        <!-- Stop -->
        <mdui-button-icon
          title="停止 (Shift+F5)"
          @click="debugStore.stopDebugging()"
        >
          <mdui-icon-stop></mdui-icon-stop>
        </mdui-button-icon>

        <!-- Disconnect (for attach sessions) -->
        <mdui-button-icon
          v-if="isAttachSession"
          @click="handleDisconnect"
          title="断开连接"
        >
          <mdui-icon-link-off></mdui-icon-link-off>
        </mdui-button-icon>

        <!-- Restart -->
        <mdui-button-icon
          title="重启"
          @click="debugStore.restartDebugging()"
        >
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>

        <div class="toolbar-separator"></div>

        <!-- Step Over -->
        <mdui-button-icon
          title="单步跳过 (F10)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepOver()"
        >
          <mdui-icon-redo></mdui-icon-redo>
        </mdui-button-icon>

        <!-- Step Into -->
        <mdui-button-icon
          title="单步进入 (F11)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepInto()"
        >
          <mdui-icon-subdirectory-arrow-right></mdui-icon-subdirectory-arrow-right>
        </mdui-button-icon>

        <!-- Step Out -->
        <mdui-button-icon
          title="单步跳出 (Shift+F11)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepOut()"
        >
          <mdui-icon-subdirectory-arrow-left></mdui-icon-subdirectory-arrow-left>
        </mdui-button-icon>
      </div>

      <!-- Drag handle -->
      <div class="drag-handle" @mousedown="startDrag"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebugStore } from '@/stores/debug'

import '@mdui/icons/play-arrow.js'
import '@mdui/icons/pause.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/redo.js'
import '@mdui/icons/subdirectory-arrow-right.js'
import '@mdui/icons/subdirectory-arrow-left.js'
import '@mdui/icons/link-off.js'

const STORAGE_KEY = 'logos:debugToolbar:x'

const debugStore = useDebugStore()
const toolbarRef = ref<HTMLElement | null>(null)
const positionX = ref(getInitialX())
let dragging = false
let dragStartX = 0
let dragStartPos = 0

const activeSessions = computed(() =>
  debugStore.sessions.filter(s => s.state !== 'terminated')
)

const isAttachSession = computed(() => {
  return debugStore.activeSession?.config?.request === 'attach'
})

async function handleDisconnect() {
  await debugStore.disconnectSession()
}

function getInitialX(): number {
  if (typeof window === 'undefined') return 0
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return Number(saved)
  } catch { /* ignore */ }
  return Math.round(window.innerWidth / 2 - 150)
}

function recenter() {
  positionX.value = Math.round(window.innerWidth / 2 - 150)
  persistPosition()
}

function persistPosition() {
  try {
    localStorage.setItem(STORAGE_KEY, String(positionX.value))
  } catch { /* ignore */ }
}

function startDrag(e: MouseEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartPos = positionX.value
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

function onDrag(e: MouseEvent) {
  if (!dragging) return
  const delta = e.clientX - dragStartX
  const toolbarWidth = toolbarRef.value?.offsetWidth || 300
  const maxX = window.innerWidth - toolbarWidth
  positionX.value = Math.max(0, Math.min(maxX, dragStartPos + delta))
}

function stopDrag() {
  dragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  persistPosition()
}

function onSessionChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  debugStore.setActiveSession(value)
}

function handleResize() {
  const toolbarWidth = toolbarRef.value?.offsetWidth || 300
  const maxX = window.innerWidth - toolbarWidth
  if (positionX.value > maxX) {
    positionX.value = Math.max(0, maxX)
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<style scoped>
.floating-debug-toolbar {
  position: fixed;
  top: 38px;
  z-index: 2520;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--mdui-color-surface-container-high);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  -webkit-app-region: no-drag;
  user-select: none;
}

.session-selector {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 4px;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
  outline: none;
  max-width: 140px;
  cursor: pointer;
}

.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-buttons mdui-button-icon {
  --mdui-comp-icon-button-size: 28px;
  --mdui-comp-icon-button-shape-corner: 4px;
  color: var(--mdui-color-on-surface);
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--mdui-color-outline-variant);
  margin: 0 2px;
}

.drag-handle {
  width: 8px;
  height: 20px;
  cursor: grab;
  background-image: radial-gradient(
    circle,
    var(--mdui-color-outline) 1px,
    transparent 1px
  );
  background-size: 4px 4px;
  opacity: 0.5;
  margin-left: 2px;
}

.drag-handle:active {
  cursor: grabbing;
}
</style>
