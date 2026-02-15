<template>
  <div class="call-stack-panel">
    <div v-if="!debugStore.isPaused" class="empty-state">
      <mdui-icon-layers></mdui-icon-layers>
      <p>程序未暂停</p>
    </div>

    <div v-else-if="debugStore.stackFrames.length === 0" class="empty-state">
      <mdui-icon-hourglass-empty></mdui-icon-hourglass-empty>
      <p>正在加载调用堆栈...</p>
    </div>

    <!-- Multi-thread view -->
    <div v-else-if="debugStore.activeThreads.length > 1" class="stack-list">
      <div v-for="thread in debugStore.activeThreads" :key="thread.id" class="thread-group">
        <div
          class="thread-header"
          :class="{ active: debugStore.currentThreadId === thread.id }"
          @click="toggleThread(thread.id); selectThread(thread.id)"
        >
          <span class="expand-icon">
            <mdui-icon-keyboard-arrow-down v-if="!collapsedThreads.has(thread.id)"></mdui-icon-keyboard-arrow-down>
            <mdui-icon-keyboard-arrow-right v-else></mdui-icon-keyboard-arrow-right>
          </span>
          <span class="thread-name">{{ thread.name }}</span>
          <span class="thread-state" :class="getThreadState(thread)">
            {{ getThreadState(thread) === 'stopped' ? '(stopped)' : '(running)' }}
          </span>
        </div>
        <div v-if="!collapsedThreads.has(thread.id)" class="thread-frames">
          <div
            v-for="(frame, index) in getThreadFrames(thread.id)"
            :key="frame.id"
            class="stack-frame"
            :class="{
              current: frame.id === debugStore.currentFrameId,
              subtle: frame.presentationHint === 'subtle'
            }"
            @click="selectThread(thread.id); selectFrame(frame.id)"
          >
            <div class="frame-index">{{ index }}</div>
            <div class="frame-info">
              <div class="frame-name">{{ frame.name }}</div>
              <div class="frame-location" v-if="frame.source?.path">
                {{ getFileName(frame.source.path) }}:{{ frame.line }}
              </div>
            </div>
            <mdui-button-icon
              v-if="frame.canRestart"
              class="restart-button"
              @click.stop="restartFrame(frame.id)"
              title="重启此帧"
            >
              <mdui-icon-refresh></mdui-icon-refresh>
            </mdui-button-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- Single-thread view (existing) -->
    <div v-else class="stack-list">
      <div
        v-for="(frame, index) in debugStore.stackFrames"
        :key="frame.id"
        class="stack-frame"
        :class="{
          current: frame.id === debugStore.currentFrameId,
          subtle: frame.presentationHint === 'subtle'
        }"
        @click="selectFrame(frame.id)"
      >
        <div class="frame-index">{{ index }}</div>
        <div class="frame-info">
          <div class="frame-name">{{ frame.name }}</div>
          <div class="frame-location" v-if="frame.source?.path">
            {{ getFileName(frame.source.path) }}:{{ frame.line }}
          </div>
        </div>
        <mdui-button-icon
          v-if="frame.canRestart"
          class="restart-button"
          @click.stop="restartFrame(frame.id)"
          title="重启此帧"
        >
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDebugStore } from '@/stores/debug'
import { useEditorStore } from '@/stores/editor'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/keyboard-arrow-right.js'

const debugStore = useDebugStore()
const editorStore = useEditorStore()

// 监听线程变化，加载栈帧
watch(() => debugStore.currentThreadId, async (threadId) => {
  if (threadId !== null) {
    await debugStore.loadStackTrace(threadId)
  }
}, { immediate: true })

watch(() => debugStore.activeThreads, async (threads) => {
  if (threads.length > 1) {
    await debugStore.loadAllStackTraces()
  }
}, { deep: true })

const collapsedThreads = ref<Set<number>>(new Set())

function toggleThread(threadId: number) {
  if (collapsedThreads.value.has(threadId)) {
    collapsedThreads.value.delete(threadId)
  } else {
    collapsedThreads.value.add(threadId)
  }
}

function selectThread(threadId: number) {
  debugStore.setCurrentThread(threadId)
}

function getThreadFrames(threadId: number): import('@/stores/debug').StackFrame[] {
  return debugStore.threadStackFrames.get(threadId) || []
}

function getThreadState(thread: import('@/stores/debug').DebugThread): string {
  if (debugStore.currentThreadId === thread.id) return 'stopped'
  return 'running'
}

function selectFrame(frameId: number) {
  debugStore.selectFrame(frameId)
  const frame = debugStore.stackFrames.find(f => f.id === frameId)
  if (frame?.source?.path) {
    editorStore.navigateToLocation(frame.source.path, frame.line, frame.column)
  }
}

async function restartFrame(frameId: number) {
  const api = window.electronAPI?.debug
  if (api) {
    await api.restartFrame(frameId)
  }
}

function getFileName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path
}
</script>

<style scoped>
.call-stack-panel {
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

.empty-state mdui-icon-layers,
.empty-state mdui-icon-hourglass-empty {
  font-size: 48px;
  opacity: 0.5;
}

.stack-list {
  padding: 4px 0;
}

.stack-frame {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 8px;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.stack-frame:hover {
  background: var(--mdui-color-surface-container-highest);
}

.stack-frame.current {
  background: var(--mdui-color-primary-container);
  border-left-color: var(--mdui-color-primary);
}

.stack-frame.subtle {
  opacity: 0.6;
}

.frame-index {
  width: 24px;
  text-align: center;
  font-size: 11px;
  color: var(--mdui-color-outline);
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.frame-info {
  flex: 1;
  overflow: hidden;
}

.frame-name {
  font-weight: 500;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-location {
  font-size: 11px;
  color: var(--mdui-color-outline);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.restart-button {
  opacity: 0;
  transition: opacity 0.2s;
  --mdui-comp-icon-button-shape-corner: 4px;
}

.stack-frame:hover .restart-button {
  opacity: 1;
}

.thread-group {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.thread-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 12px;
}

.thread-header:hover {
  background: var(--mdui-color-surface-container-highest);
}

.thread-header.active {
  background: var(--mdui-color-primary-container);
}

.thread-header .expand-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.thread-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-state {
  font-size: 11px;
  font-weight: normal;
  color: var(--mdui-color-outline);
}

.thread-state.stopped {
  color: var(--mdui-color-error);
}

.thread-frames {
  padding-left: 8px;
}
</style>
