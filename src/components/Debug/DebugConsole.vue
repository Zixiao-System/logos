<template>
  <div class="debug-console">
    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div
        v-for="(msg, index) in debugStore.consoleMessages"
        :key="index"
        class="console-message"
        :class="msg.type"
      >
        <span class="message-prefix" v-if="msg.type === 'input'">&gt;</span>
        <span class="message-prefix" v-else-if="msg.type === 'output'">&lt;</span>
        <span class="message-content" v-html="parseAnsi(msg.message)"></span>
        <span class="message-source" v-if="msg.source">
          {{ getFileName(msg.source) }}{{ msg.line ? `:${msg.line}` : '' }}
        </span>
      </div>

      <div v-if="debugStore.consoleMessages.length === 0" class="empty-state">
        <p>调试控制台</p>
        <p class="hint">在下方输入表达式进行求值</p>
      </div>
    </div>

    <!-- 输入框 -->
    <div class="input-container">
      <span class="input-prefix">&gt;</span>
      <input
        ref="inputEl"
        v-model="inputValue"
        class="console-input"
        placeholder="输入表达式..."
        @keydown="handleKeydown"
        :disabled="!debugStore.isDebugging"
      />
      <!-- Autocomplete dropdown -->
      <div v-if="showCompletions" class="completions-dropdown">
        <div
          v-for="(item, index) in completionItems"
          :key="index"
          class="completion-item"
          :class="{ selected: index === selectedCompletionIndex }"
          @mousedown.prevent="acceptCompletion(item)"
        >
          <span class="completion-type" v-if="item.type">{{ item.type }}</span>
          <span class="completion-label">{{ item.label }}</span>
        </div>
      </div>
      <mdui-button-icon @click="clearConsole" title="清除控制台">
        <mdui-icon-delete></mdui-icon-delete>
      </mdui-button-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useDebugStore } from '@/stores/debug'

const debugStore = useDebugStore()

const inputValue = ref('')
const messagesContainer = ref<HTMLElement>()
const inputEl = ref<HTMLInputElement>()

// 历史记录
const history = ref<string[]>([])
const historyIndex = ref(-1)

// 自动滚动到底部
watch(() => debugStore.consoleMessages.length, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})

async function handleKeydown(event: KeyboardEvent) {
  // Completion navigation
  if (showCompletions.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedCompletionIndex.value = Math.min(selectedCompletionIndex.value + 1, completionItems.value.length - 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedCompletionIndex.value = Math.max(selectedCompletionIndex.value - 1, 0)
      return
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && completionItems.value.length > 0)) {
      event.preventDefault()
      acceptCompletion(completionItems.value[selectedCompletionIndex.value])
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      dismissCompletions()
      return
    }
  }

  if (event.key === 'Enter' && inputValue.value.trim()) {
    const command = inputValue.value.trim()

    // 添加到历史
    history.value.unshift(command)
    if (history.value.length > 100) {
      history.value.pop()
    }
    historyIndex.value = -1

    // 执行命令
    await debugStore.executeInConsole(command)

    inputValue.value = ''
  } else if (event.key === 'ArrowUp') {
    // 上一条历史
    event.preventDefault()
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      inputValue.value = history.value[historyIndex.value]
    }
  } else if (event.key === 'ArrowDown') {
    // 下一条历史
    event.preventDefault()
    if (historyIndex.value > 0) {
      historyIndex.value--
      inputValue.value = history.value[historyIndex.value]
    } else if (historyIndex.value === 0) {
      historyIndex.value = -1
      inputValue.value = ''
    }
  }
}

function clearConsole() {
  debugStore.clearConsole()
}

function getFileName(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseAnsi(text: string): string {
  const escaped = escapeHtml(text)
  let result = ''
  let i = 0
  const openSpans: string[] = []

  while (i < escaped.length) {
    if (escaped[i] === '\x1b' && escaped[i + 1] === '[') {
      // Find the end of the escape sequence
      let j = i + 2
      while (j < escaped.length && escaped[j] !== 'm') j++
      if (j < escaped.length) {
        const codes = escaped.substring(i + 2, j).split(';').map(Number)
        for (const code of codes) {
          if (code === 0) {
            // Reset
            while (openSpans.length > 0) {
              result += '</span>'
              openSpans.pop()
            }
          } else {
            const cls = ansiCodeToClass(code)
            if (cls) {
              result += `<span class="${cls}">`
              openSpans.push(cls)
            }
          }
        }
        i = j + 1
        continue
      }
    }
    result += escaped[i]
    i++
  }
  while (openSpans.length > 0) {
    result += '</span>'
    openSpans.pop()
  }
  return result
}

function ansiCodeToClass(code: number): string | null {
  const map: Record<number, string> = {
    1: 'ansi-bold',
    3: 'ansi-italic',
    30: 'ansi-black', 31: 'ansi-red', 32: 'ansi-green', 33: 'ansi-yellow',
    34: 'ansi-blue', 35: 'ansi-magenta', 36: 'ansi-cyan', 37: 'ansi-white',
    90: 'ansi-bright-black', 91: 'ansi-bright-red', 92: 'ansi-bright-green',
    93: 'ansi-bright-yellow', 94: 'ansi-bright-blue', 95: 'ansi-bright-magenta',
    96: 'ansi-bright-cyan', 97: 'ansi-bright-white'
  }
  return map[code] ?? null
}

// Autocomplete state
const completionItems = ref<Array<{ label: string; text?: string; type?: string }>>([])
const showCompletions = ref(false)
const selectedCompletionIndex = ref(0)
let completionTimer: ReturnType<typeof setTimeout> | null = null

async function fetchCompletions() {
  if (!inputValue.value || !debugStore.isPaused) {
    showCompletions.value = false
    return
  }

  const api = window.electronAPI?.debug
  if (!api?.completions) return

  try {
    const result = await api.completions(
      inputValue.value,
      inputValue.value.length + 1,
      debugStore.currentFrameId || undefined
    )
    if (result.success && result.data && result.data.length > 0) {
      completionItems.value = result.data
      selectedCompletionIndex.value = 0
      showCompletions.value = true
    } else {
      showCompletions.value = false
    }
  } catch {
    showCompletions.value = false
  }
}

function acceptCompletion(item: { label: string; text?: string }) {
  inputValue.value = item.text || item.label
  showCompletions.value = false
  inputEl.value?.focus()
}

function dismissCompletions() {
  showCompletions.value = false
}

watch(inputValue, () => {
  if (completionTimer) clearTimeout(completionTimer)
  completionTimer = setTimeout(fetchCompletions, 300)
})
</script>

<style scoped>
.debug-console {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 12px;
}

.messages-container {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.console-message {
  display: flex;
  align-items: flex-start;
  padding: 2px 0;
  gap: 8px;
}

.console-message.error {
  color: var(--mdui-color-error);
  background: rgba(var(--mdui-color-error-rgb), 0.1);
  padding: 4px 8px;
  margin: 2px -8px;
}

.console-message.warning {
  color: var(--mdui-color-tertiary);
  background: rgba(var(--mdui-color-tertiary-rgb), 0.1);
  padding: 4px 8px;
  margin: 2px -8px;
}

.console-message.input {
  color: var(--mdui-color-primary);
}

.console-message.output {
  color: var(--mdui-color-on-surface);
}

.message-prefix {
  color: var(--mdui-color-outline);
  flex-shrink: 0;
  width: 16px;
}

.message-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-source {
  color: var(--mdui-color-outline);
  font-size: 10px;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--mdui-color-outline);
  text-align: center;
}

.empty-state .hint {
  font-size: 11px;
  opacity: 0.7;
}

.input-container {
  display: flex;
  align-items: center;
  padding: 8px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  gap: 8px;
}

.input-prefix {
  color: var(--mdui-color-primary);
  font-weight: bold;
}

.console-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--mdui-color-on-surface);
  font-family: inherit;
  font-size: inherit;
}

.console-input::placeholder {
  color: var(--mdui-color-outline);
}

.console-input:disabled {
  opacity: 0.5;
}

/* ANSI color classes */
:deep(.ansi-bold) { font-weight: bold; }
:deep(.ansi-italic) { font-style: italic; }
:deep(.ansi-black) { color: var(--logos-ansi-black, #555); }
:deep(.ansi-red) { color: var(--logos-ansi-red, var(--mdui-color-error, #cd3131)); }
:deep(.ansi-green) { color: var(--logos-ansi-green, #0dbc79); }
:deep(.ansi-yellow) { color: var(--logos-ansi-yellow, #e5e510); }
:deep(.ansi-blue) { color: var(--logos-ansi-blue, var(--mdui-color-primary, #2472c8)); }
:deep(.ansi-magenta) { color: var(--logos-ansi-magenta, #bc3fbc); }
:deep(.ansi-cyan) { color: var(--logos-ansi-cyan, #11a8cd); }
:deep(.ansi-white) { color: var(--logos-ansi-white, #e5e5e5); }
:deep(.ansi-bright-black) { color: var(--logos-ansi-bright-black, #666); }
:deep(.ansi-bright-red) { color: var(--logos-ansi-bright-red, #f14c4c); }
:deep(.ansi-bright-green) { color: var(--logos-ansi-bright-green, #23d18b); }
:deep(.ansi-bright-yellow) { color: var(--logos-ansi-bright-yellow, #f5f543); }
:deep(.ansi-bright-blue) { color: var(--logos-ansi-bright-blue, #3b8eea); }
:deep(.ansi-bright-magenta) { color: var(--logos-ansi-bright-magenta, #d670d6); }
:deep(.ansi-bright-cyan) { color: var(--logos-ansi-bright-cyan, #29b8db); }
:deep(.ansi-bright-white) { color: var(--logos-ansi-bright-white, #ffffff); }

/* Autocomplete dropdown */
.input-container {
  position: relative;
}

.completions-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: var(--mdui-color-surface-container);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 4px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.2);
  z-index: 100;
}

.completion-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
}

.completion-item:hover,
.completion-item.selected {
  background: var(--mdui-color-surface-container-highest);
}

.completion-type {
  font-size: 10px;
  color: var(--mdui-color-outline);
  min-width: 48px;
}

.completion-label {
  color: var(--mdui-color-on-surface);
}
</style>
