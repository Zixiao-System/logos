<script setup lang="ts">
/**
 * Command Palette / Quick Open
 */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FileNode } from '@/types'
import { useEditorStore } from '@/stores/editor'
import { useFileExplorerStore } from '@/stores/fileExplorer'


export interface Command {
  id: string
  title: string
  description?: string
  category?: string
  shortcut?: string
  when?: () => boolean
  action: () => void | Promise<void>
}

interface FileEntry {
  path: string
  relativePath: string
  label: string
}

const props = defineProps<{ commands: Command[] }>()

const editorStore = useEditorStore()
const fileExplorerStore = useFileExplorerStore()

const isOpen = ref(false)
const mode = ref<'commands' | 'quickOpen'>('commands')
const query = ref('')
const selectedIndex = ref(0)
const fileIndex = ref<FileEntry[]>([])
const isIndexing = ref(false)
const indexRoot = ref<string | null>(null)

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const close = () => {
  isOpen.value = false
  query.value = ''
  selectedIndex.value = 0
}

const open = async (openMode: 'commands' | 'quickOpen') => {
  mode.value = openMode
  isOpen.value = true
  query.value = ''
  selectedIndex.value = 0
  if (openMode === 'quickOpen') {
    await refreshFileIndex()
  }
  await nextTick()
  inputRef.value?.focus()
}

defineExpose({ open, close })

const flattenFiles = (nodes: FileNode[]): FileNode[] => {
  const files: FileNode[] = []
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (node.type === 'file') {
      files.push(node)
    } else if (node.children && node.children.length) {
      stack.push(...node.children)
    }
  }
  return files
}

const getRelativePath = (path: string) => {
  const root = fileExplorerStore.rootPath
  if (!root) return path
  const normalizedRoot = root.replace(/\\/g, '/')
  const normalizedPath = path.replace(/\\/g, '/')
  if (normalizedPath.startsWith(normalizedRoot)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }
  return path
}

const refreshFileIndex = async () => {
  if (!fileExplorerStore.rootPath) {
    fileIndex.value = []
    indexRoot.value = null
    return
  }
  if (indexRoot.value === fileExplorerStore.rootPath && fileIndex.value.length > 0) return

  isIndexing.value = true
  try {
    const tree = await window.electronAPI.fileSystem.readDirectory(fileExplorerStore.rootPath, true)
    const files = flattenFiles(tree)
    fileIndex.value = files.map(file => ({
      path: file.path,
      relativePath: getRelativePath(file.path),
      label: file.name
    }))
    indexRoot.value = fileExplorerStore.rootPath
  } finally {
    isIndexing.value = false
  }
}

const visibleCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.commands.filter(cmd => {
    if (cmd.when && !cmd.when()) return false
    if (!q) return true
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.description && cmd.description.toLowerCase().includes(q)) ||
      (cmd.category && cmd.category.toLowerCase().includes(q))
    )
  })
})

const scoreMatch = (q: string, target: string) => {
  const lower = target.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return null
  return idx + target.length * 0.01
}

const visibleFiles = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) {
    return editorStore.recentFiles.slice(0, 8).map(path => ({
      path,
      relativePath: getRelativePath(path),
      label: path.split(/[\\/]/).pop() || path
    }))
  }

  const matches = fileIndex.value
    .map(entry => ({ entry, score: scoreMatch(q, entry.relativePath) }))
    .filter((item): item is { entry: FileEntry; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 50)
    .map(item => item.entry)

  return matches
})

const visibleItems = computed(() => {
  if (mode.value === 'commands') {
    return visibleCommands.value.map(cmd => ({ type: 'command' as const, data: cmd }))
  }
  return visibleFiles.value.map(file => ({ type: 'file' as const, data: file }))
})

const runSelected = async () => {
  const item = visibleItems.value[selectedIndex.value]
  if (!item) return

  if (item.type === 'command') {
    const reopen = item.data.id === 'workbench.action.quickOpen' || item.data.id === 'workbench.action.showCommands'
    if (reopen) {
      close()
      await nextTick()
      await item.data.action()
      return
    }
    await item.data.action()
    close()
    return
  }
  await editorStore.navigateToLocation(item.data.path, 1, 1)
  close()
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!isOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (visibleItems.value.length === 0) return
    selectedIndex.value = Math.min(selectedIndex.value + 1, visibleItems.value.length - 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (visibleItems.value.length === 0) return
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    runSelected()
  }
}

const switchModeIfNeeded = () => {
  if (mode.value === 'quickOpen' && query.value.startsWith('>')) {
    mode.value = 'commands'
    query.value = query.value.replace(/^>\s?/, '')
    selectedIndex.value = 0
  }
}

watch(query, () => {
  switchModeIfNeeded()
  selectedIndex.value = 0
  if (mode.value === 'quickOpen' && fileExplorerStore.rootPath && fileIndex.value.length === 0) {
    void refreshFileIndex()
  }
})

watch(visibleItems, () => {
  nextTick(() => {
    const list = listRef.value
    const active = list?.querySelector<HTMLElement>('.palette-item.active')
    active?.scrollIntoView({ block: 'nearest' })
  })
})

watch(() => fileExplorerStore.rootPath, () => {
  fileIndex.value = []
  indexRoot.value = null
})

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <mdui-dialog
    :open="isOpen"
    close-on-esc
    close-on-overlay-click
    @close="close"
    class="command-palette-dialog"
  >
    <div class="palette">
      <div class="palette-header">
        <span class="mode">{{ mode === 'commands' ? '命令面板' : '快速打开' }}</span>
        <span class="hint" v-if="mode === 'quickOpen'">输入 &gt; 切换到命令</span>
      </div>
      <input
        ref="inputRef"
        v-model="query"
        class="palette-input"
        :placeholder="mode === 'commands' ? '输入命令名称' : '输入文件名…'"
        type="text"
        aria-label="搜索"
      />
      <div class="palette-list" ref="listRef" role="listbox">
        <div v-if="mode === 'commands' && visibleCommands.length === 0" class="empty" role="status">
          没有匹配的命令
        </div>
        <div v-else-if="mode === 'quickOpen' && visibleFiles.length === 0" class="empty" role="status">
          {{ isIndexing ? '正在索引文件…' : '没有匹配的文件' }}
        </div>
        <div
          v-else
          v-for="(item, index) in visibleItems"
          :key="item.type === 'command' ? item.data.id : item.data.path"
          class="palette-item"
          :class="{ active: index === selectedIndex }"
          role="option"
          :aria-selected="index === selectedIndex"
          @click="selectedIndex = index; runSelected()"
        >
          <div v-if="item.type === 'command'" class="item-content">
            <div class="title">{{ item.data.title }}</div>
            <div class="meta">
              <span v-if="item.data.category" class="category">{{ item.data.category }}</span>
              <span v-if="item.data.description" class="description">{{ item.data.description }}</span>
            </div>
          </div>
          <div v-else class="item-content">
            <div class="title">{{ item.data.label }}</div>
            <div class="meta">
              <span class="description">{{ item.data.relativePath }}</span>
            </div>
          </div>
          <div v-if="item.type === 'command' && item.data.shortcut" class="shortcut">
            {{ item.data.shortcut }}
          </div>
        </div>
      </div>
    </div>
  </mdui-dialog>
</template>

<style scoped>
.command-palette-dialog {
  --mdui-dialog-max-width: min(700px, 90vw);
}

.command-palette-dialog::part(overlay) {
  background: rgba(0, 0, 0, 0.35);
}

.command-palette-dialog::part(panel) {
  margin-top: 12vh;
  margin-bottom: auto;
  padding: 0;
  overflow: hidden;
}

.palette {
  background: var(--mdui-color-surface-container);
  border-radius: 14px;
  overflow: hidden;
}

.palette-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  background: var(--mdui-color-surface-container-high);
}

.palette-input {
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
  font-size: 14px;
}

.palette-input:focus {
  outline: none;
}

.palette-list {
  max-height: 50vh;
  overflow: auto;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  cursor: pointer;
}

.palette-item.active {
  background: var(--mdui-color-secondary-container);
  color: var(--mdui-color-on-secondary-container);
}

.item-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 13px;
}

.meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.palette-item.active .meta {
  color: inherit;
}

.shortcut {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.palette-item.active .shortcut {
  color: inherit;
}

.empty {
  padding: 16px;
  color: var(--mdui-color-on-surface-variant);
}
</style>
