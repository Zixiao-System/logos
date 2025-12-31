<script setup lang="ts">
/**
 * 编辑器视图
 * 集成 Monaco Editor 并与 editor store 联动
 */

import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '@/stores/editor'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import { getIntelligenceManager, destroyIntelligenceManager } from '@/services/lsp'

// 导入 MDUI 图标
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/folder-open.js'
import '@mdui/icons/insert-drive-file.js'

const editorStore = useEditorStore()
const fileExplorerStore = useFileExplorerStore()
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const models = new Map<string, monaco.editor.ITextModel>()

// 代码智能管理器
const intelligenceManager = getIntelligenceManager()

// 诊断更新防抖定时器
let diagnosticsTimer: ReturnType<typeof setTimeout> | null = null

// 当前活动标签页
const activeTab = computed(() => editorStore.activeTab)

// 创建或获取文件的 model
function getOrCreateModel(path: string, content: string, language: string): monaco.editor.ITextModel {
  if (models.has(path)) {
    return models.get(path)!
  }

  const model = monaco.editor.createModel(
    content,
    language,
    monaco.Uri.file(path)
  )

  models.set(path, model)

  // 为新打开的文件调用 openFile (用于 WASM 语言)
  intelligenceManager.openFile(path, content)

  return model
}

// 删除 model
function disposeModel(path: string) {
  const model = models.get(path)
  if (model) {
    model.dispose()
    models.delete(path)

    // 通知语言服务关闭文件
    intelligenceManager.closeFile(path)
  }
}

// 初始化编辑器
function initEditor() {
  if (!editorContainer.value || editor) return

  // 定义主题
  monaco.editor.defineTheme('lsp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editorCursor.foreground': '#aeafad',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#2a2d2e'
    }
  })

  // 创建编辑器
  editor = monaco.editor.create(editorContainer.value, {
    theme: editorStore.config.theme,
    fontSize: editorStore.config.fontSize,
    fontFamily: editorStore.config.fontFamily,
    fontLigatures: editorStore.config.fontLigatures,
    minimap: { enabled: editorStore.config.minimap },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: editorStore.config.tabSize,
    insertSpaces: editorStore.config.insertSpaces,
    wordWrap: editorStore.config.wordWrap,
    lineNumbers: editorStore.config.lineNumbers,
    renderWhitespace: 'selection',
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    padding: { top: 8 }
  })

  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    if (activeTab.value && editor) {
      const content = editor.getValue()
      editorStore.updateContent(activeTab.value.id, content)

      // 同步到代码智能服务
      intelligenceManager.syncFile(activeTab.value.path, content)

      // 防抖更新诊断
      if (diagnosticsTimer) {
        clearTimeout(diagnosticsTimer)
      }
      diagnosticsTimer = setTimeout(() => {
        const model = editor?.getModel()
        if (model) {
          intelligenceManager.updateDiagnostics(model)
        }
      }, 500)
    }
  })

  // 监听光标位置变化
  editor.onDidChangeCursorPosition((e) => {
    if (activeTab.value) {
      editorStore.updateCursorPosition(activeTab.value.id, {
        line: e.position.lineNumber,
        column: e.position.column
      })
    }
  })

  // 注册快捷键
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    editorStore.saveCurrentFile()
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
    if (activeTab.value) {
      editorStore.closeTab(activeTab.value.id)
    }
  })

  // 初始加载当前标签页
  if (activeTab.value) {
    loadTabIntoEditor(activeTab.value)
  }
}

// 当编辑器容器可用时初始化
watch(editorContainer, (container) => {
  if (container && !editor) {
    nextTick(() => {
      initEditor()
    })
  }
})

onMounted(async () => {
  initEditor()

  // 初始化代码智能服务
  await intelligenceManager.initialize()

  // 如果已有项目打开，则打开项目
  if (fileExplorerStore.rootPath) {
    await intelligenceManager.openProject(fileExplorerStore.rootPath)
  }
})

// 加载标签页到编辑器
function loadTabIntoEditor(tab: typeof activeTab.value) {
  if (!tab || !editor) return

  // 保存当前 model 的视图状态
  if (editorStore.activeTab) {
    const viewState = editor.saveViewState()
    if (viewState) {
      editorStore.saveViewState(editorStore.activeTabId!, viewState)
    }
  }

  // 获取或创建 model
  const model = getOrCreateModel(tab.path, tab.content, tab.language)
  editor.setModel(model)

  // 同步文件内容到代码智能服务
  intelligenceManager.syncFile(tab.path, tab.content)

  // 更新诊断
  intelligenceManager.updateDiagnostics(model)

  // 恢复视图状态
  if (tab.viewState) {
    editor.restoreViewState(tab.viewState as monaco.editor.ICodeEditorViewState)
  } else {
    // 设置光标位置
    editor.setPosition({
      lineNumber: tab.cursorPosition.line,
      column: tab.cursorPosition.column
    })
    editor.revealPositionInCenter({
      lineNumber: tab.cursorPosition.line,
      column: tab.cursorPosition.column
    })
  }

  editor.focus()
}

// 监听活动标签页变化
watch(() => editorStore.activeTabId, (newId) => {
  if (newId && activeTab.value) {
    loadTabIntoEditor(activeTab.value)
  }
})

// 监听标签页关闭
watch(() => editorStore.tabs.length, (newLen, oldLen) => {
  if (newLen < oldLen) {
    // 清理不再使用的 models
    const tabPaths = new Set(editorStore.tabs.map(t => t.path))
    for (const [path] of models) {
      if (!tabPaths.has(path)) {
        disposeModel(path)
      }
    }
  }
})

// 监听配置变化
watch(() => editorStore.config, (config) => {
  if (!editor) return

  editor.updateOptions({
    fontSize: config.fontSize,
    fontFamily: config.fontFamily,
    fontLigatures: config.fontLigatures,
    minimap: { enabled: config.minimap },
    tabSize: config.tabSize,
    insertSpaces: config.insertSpaces,
    wordWrap: config.wordWrap,
    lineNumbers: config.lineNumbers
  })

  monaco.editor.setTheme(config.theme)
}, { deep: true })

// 监听项目路径变化
watch(() => fileExplorerStore.rootPath, async (newPath, oldPath) => {
  if (oldPath) {
    await intelligenceManager.closeProject()
  }
  if (newPath) {
    await intelligenceManager.openProject(newPath)
  }
})

onUnmounted(() => {
  // 清理诊断定时器
  if (diagnosticsTimer) {
    clearTimeout(diagnosticsTimer)
    diagnosticsTimer = null
  }

  // 清理所有 models
  for (const [path] of models) {
    disposeModel(path)
  }

  // 销毁编辑器
  editor?.dispose()

  // 清理代码智能服务
  destroyIntelligenceManager()
})
</script>

<template>
  <div class="editor-view">
    <!-- 有打开的文件 -->
    <template v-if="editorStore.tabs.length > 0">
      <!-- 面包屑 -->
      <div class="breadcrumb" v-if="activeTab">
        <span class="breadcrumb-item">
          {{ activeTab.path.split('/').slice(-3, -1).join(' / ') }}
        </span>
        <mdui-icon-chevron-right class="separator"></mdui-icon-chevron-right>
        <span class="breadcrumb-item current">{{ activeTab.filename }}</span>
      </div>

      <!-- 编辑器容器 -->
      <div ref="editorContainer" class="editor-container"></div>
    </template>

    <!-- 无打开的文件 -->
    <div v-else class="empty-state">
      <div class="welcome">
        <h1>Logos</h1>
        <p>博士，是我的哨音惊扰了您吗？不是便好。这首曲子的名字？无名，只是闲暇时的即兴之作罢了。</p>

        <div class="actions">
          <mdui-button variant="tonal" @click="$emit('openFolder')">
            <mdui-icon-folder-open slot="icon"></mdui-icon-folder-open>
            打开文件夹
          </mdui-button>
        </div>

        <div class="recent-files" v-if="editorStore.recentFiles.length > 0">
          <h3>最近打开</h3>
          <ul>
            <li
              v-for="file in editorStore.recentFiles.slice(0, 5)"
              :key="file"
              @click="editorStore.openFile(file)"
            >
              <mdui-icon-insert-drive-file></mdui-icon-insert-drive-file>
              {{ file.split('/').pop() }}
              <span class="file-path">{{ file }}</span>
            </li>
          </ul>
        </div>

        <div class="shortcuts">
          <h3>快捷键</h3>
          <div class="shortcut-grid">
            <div class="shortcut">
              <kbd>⌘</kbd> + <kbd>S</kbd>
              <span>保存</span>
            </div>
            <div class="shortcut">
              <kbd>⌘</kbd> + <kbd>W</kbd>
              <span>关闭标签</span>
            </div>
            <div class="shortcut">
              <kbd>⌘</kbd> + <kbd>P</kbd>
              <span>快速打开</span>
            </div>
            <div class="shortcut">
              <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>
              <span>命令面板</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 16px;
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  background: var(--mdui-color-surface);
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.breadcrumb-item {
  padding: 2px 4px;
  border-radius: 4px;
}

.breadcrumb-item:not(.current):hover {
  background: var(--mdui-color-surface-container-high);
  cursor: pointer;
}

.breadcrumb-item.current {
  color: var(--mdui-color-on-surface);
}

.separator {
  font-size: 16px;
  color: var(--mdui-color-outline);
}

.editor-container {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--mdui-color-surface);
}

.welcome {
  text-align: center;
  max-width: 600px;
  padding: 32px;
}

.welcome h1 {
  font-size: 2.5rem;
  font-weight: 300;
  margin: 0 0 8px 0;
  color: var(--mdui-color-on-surface);
}

.welcome > p {
  color: var(--mdui-color-on-surface-variant);
  margin: 0 0 32px 0;
}

.actions {
  margin-bottom: 48px;
}

.recent-files,
.shortcuts {
  text-align: left;
  margin-top: 32px;
}

.recent-files h3,
.shortcuts h3 {
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
  margin: 0 0 12px 0;
}

.recent-files ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.recent-files li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.recent-files li:hover {
  background: var(--mdui-color-surface-container-high);
}

.recent-files li mdui-icon-insert-drive-file {
  font-size: 18px;
  color: var(--mdui-color-on-surface-variant);
}

.file-path {
  flex: 1;
  text-align: right;
  font-size: 12px;
  color: var(--mdui-color-outline);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  font-size: 13px;
}

.shortcut kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  color: var(--mdui-color-on-surface);
}

.shortcut span {
  margin-left: auto;
  color: var(--mdui-color-on-surface-variant);
}
</style>
