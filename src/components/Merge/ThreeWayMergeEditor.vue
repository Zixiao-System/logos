<script setup lang="ts">
/**
 * 三面板合并编辑器组件
 * 左侧: LOCAL (ours) - 只读
 * 中间: 合并结果 - 可编辑
 * 右侧: REMOTE (theirs) - 只读
 */

import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import type { ConflictHunk, ConflictResolution } from '@/types/merge'
import ConflictHunkControl from './ConflictHunkControl.vue'

// 导入 MDUI 图标
import '@mdui/icons/person.js'
import '@mdui/icons/cloud.js'
import '@mdui/icons/merge.js'

interface Props {
  oursContent: string
  theirsContent: string
  baseContent: string
  mergedContent: string
  hunks: ConflictHunk[]
  fileName: string
  language?: string
}

const props = withDefaults(defineProps<Props>(), {
  language: 'plaintext'
})

const emit = defineEmits<{
  (e: 'update:mergedContent', content: string): void
  (e: 'resolveHunk', hunkId: string, resolution: ConflictResolution): void
}>()

// DOM refs
const oursEditorContainer = ref<HTMLElement | null>(null)
const mergedEditorContainer = ref<HTMLElement | null>(null)
const theirsEditorContainer = ref<HTMLElement | null>(null)

// Monaco editors
let oursEditor: monaco.editor.IStandaloneCodeEditor | null = null
let mergedEditor: monaco.editor.IStandaloneCodeEditor | null = null
let theirsEditor: monaco.editor.IStandaloneCodeEditor | null = null

// 滚动同步
const syncScroll = ref(true)

// 检测语言
const detectLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'vue': 'html',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'sh': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql'
  }
  return languageMap[ext || ''] || 'plaintext'
}

// 创建编辑器通用配置
const getEditorOptions = (readOnly: boolean): monaco.editor.IStandaloneEditorConstructionOptions => ({
  automaticLayout: true,
  readOnly,
  minimap: { enabled: false },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
  renderWhitespace: 'selection',
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10
  }
})

// 初始化编辑器
const initEditors = async () => {
  await nextTick()

  const language = props.language !== 'plaintext' ? props.language : detectLanguage(props.fileName)

  // 左侧编辑器 (ours)
  if (oursEditorContainer.value) {
    oursEditor = monaco.editor.create(oursEditorContainer.value, {
      ...getEditorOptions(true),
      value: props.oursContent,
      language
    })
  }

  // 中间编辑器 (merged)
  if (mergedEditorContainer.value) {
    mergedEditor = monaco.editor.create(mergedEditorContainer.value, {
      ...getEditorOptions(false),
      value: props.mergedContent,
      language
    })

    // 监听内容变化
    mergedEditor.onDidChangeModelContent(() => {
      const content = mergedEditor?.getValue() || ''
      emit('update:mergedContent', content)
    })
  }

  // 右侧编辑器 (theirs)
  if (theirsEditorContainer.value) {
    theirsEditor = monaco.editor.create(theirsEditorContainer.value, {
      ...getEditorOptions(true),
      value: props.theirsContent,
      language
    })
  }

  // 设置滚动同步
  setupScrollSync()

  // 高亮冲突区域
  highlightConflicts()
}

// 设置滚动同步
const setupScrollSync = () => {
  if (!syncScroll.value) return

  const editors = [oursEditor, mergedEditor, theirsEditor].filter(Boolean)
  let isScrolling = false

  editors.forEach(editor => {
    editor?.onDidScrollChange((e) => {
      if (isScrolling) return
      isScrolling = true

      editors.forEach(other => {
        if (other !== editor) {
          other?.setScrollTop(e.scrollTop)
        }
      })

      setTimeout(() => { isScrolling = false }, 50)
    })
  })
}

// 高亮冲突区域
const highlightConflicts = () => {
  if (!mergedEditor) return

  const decorations: monaco.editor.IModelDeltaDecoration[] = []
  const model = mergedEditor.getModel()
  if (!model) return

  const content = model.getValue()
  const lines = content.split('\n')

  let inConflict = false
  let conflictStartLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('<<<<<<<')) {
      inConflict = true
      conflictStartLine = i + 1
    } else if (line.startsWith('>>>>>>>') && inConflict) {
      // 高亮整个冲突块
      decorations.push({
        range: new monaco.Range(conflictStartLine, 1, i + 1, 1),
        options: {
          isWholeLine: true,
          className: 'conflict-highlight',
          linesDecorationsClassName: 'conflict-line-decoration'
        }
      })
      inConflict = false
    }
  }

  mergedEditor.deltaDecorations([], decorations)
}

// 跳转到冲突
const jumpToHunk = (hunk: ConflictHunk) => {
  mergedEditor?.revealLineInCenter(hunk.startLine + 1)
  mergedEditor?.setPosition({ lineNumber: hunk.startLine + 1, column: 1 })
  mergedEditor?.focus()
}

// 销毁编辑器
const disposeEditors = () => {
  oursEditor?.dispose()
  mergedEditor?.dispose()
  theirsEditor?.dispose()
  oursEditor = null
  mergedEditor = null
  theirsEditor = null
}

// 监听内容变化
watch(() => props.oursContent, (newContent) => {
  if (oursEditor && oursEditor.getValue() !== newContent) {
    oursEditor.setValue(newContent)
  }
})

watch(() => props.theirsContent, (newContent) => {
  if (theirsEditor && theirsEditor.getValue() !== newContent) {
    theirsEditor.setValue(newContent)
  }
})

watch(() => props.mergedContent, (newContent) => {
  if (mergedEditor && mergedEditor.getValue() !== newContent) {
    mergedEditor.setValue(newContent)
    highlightConflicts()
  }
})

onMounted(() => {
  initEditors()
})

onUnmounted(() => {
  disposeEditors()
})

defineExpose({
  jumpToHunk
})
</script>

<template>
  <div class="three-way-merge-editor">
    <!-- 冲突块控制面板 -->
    <div v-if="hunks.length > 0" class="hunks-panel">
      <ConflictHunkControl
        v-for="(hunk, index) in hunks"
        :key="hunk.id"
        :hunk="hunk"
        :index="index"
        @resolve="(resolution) => emit('resolveHunk', hunk.id, resolution)"
        @jump="jumpToHunk(hunk)"
      />
    </div>

    <!-- 编辑器面板 -->
    <div class="editors-container">
      <!-- 左侧: OURS -->
      <div class="editor-panel ours">
        <div class="panel-header">
          <mdui-icon-person></mdui-icon-person>
          <span>本地 (Ours)</span>
          <span class="readonly-badge">只读</span>
        </div>
        <div ref="oursEditorContainer" class="editor-container"></div>
      </div>

      <!-- 中间: MERGED -->
      <div class="editor-panel merged">
        <div class="panel-header">
          <mdui-icon-merge></mdui-icon-merge>
          <span>合并结果</span>
          <span class="editable-badge">可编辑</span>
        </div>
        <div ref="mergedEditorContainer" class="editor-container"></div>
      </div>

      <!-- 右侧: THEIRS -->
      <div class="editor-panel theirs">
        <div class="panel-header">
          <mdui-icon-cloud></mdui-icon-cloud>
          <span>远程 (Theirs)</span>
          <span class="readonly-badge">只读</span>
        </div>
        <div ref="theirsEditorContainer" class="editor-container"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.three-way-merge-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.hunks-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: var(--mdui-color-surface-container-low);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  max-height: 150px;
  overflow-y: auto;
}

.editors-container {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--mdui-color-outline-variant);
}

.editor-panel:last-child {
  border-right: none;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.panel-header.ours {
  background: var(--mdui-color-tertiary-container, rgba(76, 175, 80, 0.15));
}

.panel-header.merged {
  background: var(--mdui-color-primary-container, rgba(33, 150, 243, 0.15));
}

.panel-header.theirs {
  background: rgba(255, 152, 0, 0.15);
}

.ours .panel-header {
  background: var(--mdui-color-tertiary-container, rgba(76, 175, 80, 0.15));
  color: var(--mdui-color-on-tertiary-container, #1b5e20);
}

.merged .panel-header {
  background: var(--mdui-color-primary-container, rgba(33, 150, 243, 0.15));
  color: var(--mdui-color-on-primary-container, #0d47a1);
}

.theirs .panel-header {
  background: rgba(255, 152, 0, 0.15);
  color: #e65100;
}

.readonly-badge,
.editable-badge {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.readonly-badge {
  background: var(--mdui-color-surface-variant);
  color: var(--mdui-color-on-surface-variant);
}

.editable-badge {
  background: var(--mdui-color-primary-container);
  color: var(--mdui-color-on-primary-container);
}

.editor-container {
  flex: 1;
  min-height: 0;
}

/* Monaco 编辑器冲突高亮样式 */
:deep(.conflict-highlight) {
  background: rgba(255, 87, 34, 0.15);
}

:deep(.conflict-line-decoration) {
  background: var(--mdui-color-error);
  width: 4px !important;
  margin-left: 2px;
}
</style>
