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
        <button
          class="toolbar-btn"
          :title="debugStore.isPaused ? '继续 (F5)' : '暂停 (F6)'"
          @click="debugStore.isPaused ? debugStore.continue() : debugStore.pause()"
        >
          <svg v-if="debugStore.isPaused" viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M3.5 2v12l10-6z" />
          </svg>
          <svg v-else viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M4 2h3v12H4zm5 0h3v12H9z" />
          </svg>
        </button>

        <!-- Stop -->
        <button
          class="toolbar-btn"
          title="停止 (Shift+F5)"
          @click="debugStore.stopDebugging()"
        >
          <svg viewBox="0 0 16 16" class="toolbar-icon">
            <rect fill="currentColor" x="3" y="3" width="10" height="10" />
          </svg>
        </button>

        <!-- Restart -->
        <button
          class="toolbar-btn"
          title="重启"
          @click="debugStore.restartDebugging()"
        >
          <svg viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M12.75 8a4.75 4.75 0 0 1-8.53 2.86l1.06-1.06A3.25 3.25 0 0 0 11.25 8h-2l2.75-3L14.75 8h-2zm-9.5 0a4.75 4.75 0 0 1 8.53-2.86l-1.06 1.06A3.25 3.25 0 0 0 4.75 8h2L4 11 1.25 8h2z" />
          </svg>
        </button>

        <div class="toolbar-separator"></div>

        <!-- Step Over -->
        <button
          class="toolbar-btn"
          title="单步跳过 (F10)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepOver()"
        >
          <svg viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M14.25 5.75a3.25 3.25 0 0 0-6.5 0H9l-3 3.5L3 5.75h1.25a4.75 4.75 0 0 1 9.5 0h.5zm-7 6.5h8v1.5h-8z" />
          </svg>
        </button>

        <!-- Step Into -->
        <button
          class="toolbar-btn"
          title="单步进入 (F11)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepInto()"
        >
          <svg viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M8 1v6.5L5 5l-.75.75L8 9.5l3.75-3.75L11 5 8 7.5V1zm0 10a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
          </svg>
        </button>

        <!-- Step Out -->
        <button
          class="toolbar-btn"
          title="单步跳出 (Shift+F11)"
          :disabled="!debugStore.isPaused"
          @click="debugStore.stepOut()"
        >
          <svg viewBox="0 0 16 16" class="toolbar-icon">
            <path fill="currentColor" d="M8 15V8.5L5 11l-.75-.75L8 6.5l3.75 3.75L11 11 8 8.5V15zm0-10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
          </svg>
        </button>
      </div>

      <!-- Drag handle -->
      <div class="drag-handle" @mousedown="startDrag"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebugStore } from '@/stores/debug'

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

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--mdui-color-on-surface);
  cursor: pointer;
  padding: 0;
  transition: background-color 0.1s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--mdui-color-surface-container-highest);
}

.toolbar-btn:active:not(:disabled) {
  background: var(--mdui-color-outline-variant);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.toolbar-icon {
  width: 16px;
  height: 16px;
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
