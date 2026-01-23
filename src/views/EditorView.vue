<script setup lang="ts">
/**
 * 编辑器视图
 * 集成 Monaco Editor 并与 editor store 联动
 */

import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '@/stores/editor'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import { useDebugStore, type BreakpointInfo } from '@/stores/debug'
import { useIntelligenceStore } from '@/stores/intelligence'
import { useBlameStore } from '@/stores/blame'
import { useFileHistoryStore } from '@/stores/fileHistory'
import { getIntelligenceManager, destroyIntelligenceManager } from '@/services/lsp'
import { initializeMonacoLanguages } from '@/services/monaco/languageConfig'
import { InlineBlameProvider, injectBlameStyles, BlameHoverCard, FileHistoryPanel } from '@/components/GitLens'

// 初始化自定义语言支持（Vue, JSX, TSX）
initializeMonacoLanguages()

// 导入 MDUI 图标
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/folder-open.js'
import '@mdui/icons/insert-drive-file.js'

const isMac = navigator.platform.toUpperCase().includes('MAC')
const modifierKeyLabel = isMac ? '⌘' : 'Ctrl'

const editorStore = useEditorStore()
const fileExplorerStore = useFileExplorerStore()
const debugStore = useDebugStore()
const intelligenceStore = useIntelligenceStore()
const blameStore = useBlameStore()
const fileHistoryStore = useFileHistoryStore()
const editorContainer = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const models = new Map<string, monaco.editor.ITextModel>()

// 断点装饰器 ID 映射
const breakpointDecorations = new Map<string, string[]>() // filePath -> decoration IDs
const currentLineDecoration = ref<string[]>([]) // 当前执行行装饰器

// Inline Blame Provider
let blameProvider: InlineBlameProvider | null = null

// 代码智能管理器
const intelligenceManager = getIntelligenceManager()

// 诊断更新防抖定时器
let diagnosticsTimer: ReturnType<typeof setTimeout> | null = null
// Blame 更新防抖定时器
let blameTimer: ReturnType<typeof setTimeout> | null = null

// 文件历史面板显示状态
const showFileHistoryPanel = ref(false)

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

  // 为新打开的文件调用 openFile (用于 Daemon 语言)
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

  // 禁用 Monaco 内置的 TypeScript 诊断（避免与 LSP/Smart Mode 冲突）
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true
  })

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true
  })

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
    padding: { top: 8 },
    glyphMargin: true // 启用断点边距
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

      // 防抖更新 blame 信息
      if (blameTimer) {
        clearTimeout(blameTimer)
      }
      blameTimer = setTimeout(() => {
        updateCurrentLineBlame(e.position.lineNumber)
      }, 150)
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

  // 调试快捷键
  // F5 - 继续/开始调试
  editor.addCommand(monaco.KeyCode.F5, () => {
    if (debugStore.isDebugging) {
      if (debugStore.isPaused) {
        debugStore.continue()
      }
    } else if (debugStore.hasConfigurations && debugStore.selectedConfigIndex >= 0) {
      // 开始调试
      debugStore.debugConfiguration()
    }
  })

  // Ctrl+F5 - 运行（不调试）
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.F5, () => {
    if (!debugStore.isDebugging && debugStore.hasConfigurations && debugStore.selectedConfigIndex >= 0) {
      debugStore.runConfiguration()
    }
  })

  // F6 - 暂停
  editor.addCommand(monaco.KeyCode.F6, () => {
    if (debugStore.isRunning) {
      debugStore.pause()
    }
  })

  // Shift+F5 - 停止调试
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F5, () => {
    if (debugStore.isDebugging) {
      debugStore.stopDebugging()
    }
  })

  // F9 - 切换断点
  editor.addCommand(monaco.KeyCode.F9, () => {
    if (activeTab.value && editor) {
      const position = editor.getPosition()
      if (position) {
        toggleBreakpointAtLine(activeTab.value.path, position.lineNumber)
      }
    }
  })

  // F10 - 单步跳过
  editor.addCommand(monaco.KeyCode.F10, () => {
    if (debugStore.isPaused) {
      debugStore.stepOver()
    }
  })

  // F11 - 单步进入
  editor.addCommand(monaco.KeyCode.F11, () => {
    if (debugStore.isPaused) {
      debugStore.stepInto()
    }
  })

  // Shift+F11 - 单步跳出
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F11, () => {
    if (debugStore.isPaused) {
      debugStore.stepOut()
    }
  })

  // 监听行号点击以切换断点
  editor.onMouseDown((e) => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
      if (activeTab.value && e.target.position) {
        toggleBreakpointAtLine(activeTab.value.path, e.target.position.lineNumber)
      }
    }
  })

  // 初始加载当前标签页
  if (activeTab.value) {
    loadTabIntoEditor(activeTab.value)
  }

  // 初始化 Blame Provider
  blameProvider = new InlineBlameProvider(editor)

  // 注册重构相关的上下文菜单动作（基于 Monaco Code Actions）
  registerRefactorContextMenuActions(editor)

  // 注册 GitLens 相关的上下文菜单动作
  registerGitLensContextMenuActions(editor)
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
  // 注入 blame 样式
  injectBlameStyles()

  initEditor()

  // 初始化代码智能服务
  await intelligenceManager.initialize()

  // 如果已有项目打开，则打开项目
  if (fileExplorerStore.rootPath) {
    await intelligenceManager.openProject(fileExplorerStore.rootPath)
    // 设置调试工作区并加载配置
    debugStore.setWorkspaceFolder(fileExplorerStore.rootPath)
    await debugStore.loadLaunchConfigurations()

    // 加载 .logos 项目级智能模式设置（.logos/settings.json），项目优先
    await intelligenceStore.loadFromProject(fileExplorerStore.rootPath)

    // 分析项目并根据 autoSelect 决定是否自动切换模式
    if (intelligenceStore.autoSelect) {
      await intelligenceStore.autoDetectMode()
    } else {
      // 即使不自动切换，也分析项目以显示信息
      await intelligenceStore.analyzeProject()
    }
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

  // 加载 blame 数据
  loadBlameForFile(tab.path)
}

// ============ Blame 相关功能 ============

// 加载文件的 blame 数据
async function loadBlameForFile(filePath: string) {
  if (!fileExplorerStore.rootPath || !blameProvider) return

  // 只对 git 仓库中的文件加载 blame
  try {
    const isRepo = await window.electronAPI.git.isRepo(fileExplorerStore.rootPath)
    if (!isRepo) return

    // 检查文件是否在仓库中 (相对路径)
    const relativePath = filePath.replace(fileExplorerStore.rootPath + '/', '')
    if (relativePath.startsWith('..') || relativePath.startsWith('/')) return

    // 加载 blame 数据
    const blameData = await blameStore.loadBlame(fileExplorerStore.rootPath, relativePath)

    // 更新 provider
    if (blameStore.showInlineBlame) {
      blameProvider.setBlameData(blameData)
    }
  } catch (error) {
    console.error('Failed to load blame:', error)
  }
}

// 更新当前行的 blame 信息
async function updateCurrentLineBlame(lineNumber: number) {
  if (!activeTab.value || !fileExplorerStore.rootPath) return

  const relativePath = activeTab.value.path.replace(fileExplorerStore.rootPath + '/', '')
  await blameStore.updateCurrentLineBlame(fileExplorerStore.rootPath, relativePath, lineNumber)
}

// ============ 上下文菜单功能 ============

// 注册重构上下文菜单动作
function registerRefactorContextMenuActions(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  editorInstance.addAction({
    id: 'logos.refactorMenu',
    label: '重构...',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 10,
    run: () => {
      // 触发 Monaco 的 Code Action 菜单，并偏向 refactor 类别
      editorInstance.trigger('keyboard', 'editor.action.codeAction', { kind: 'refactor' })
    }
  })
}

// 注册 GitLens 上下文菜单动作
function registerGitLensContextMenuActions(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  // 查看文件历史
  editorInstance.addAction({
    id: 'gitlens.viewFileHistory',
    label: 'Git: View File History',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 1,
    run: () => {
      if (activeTab.value && fileExplorerStore.rootPath) {
        const relativePath = activeTab.value.path.replace(fileExplorerStore.rootPath + '/', '')
        fileHistoryStore.loadFileHistory(fileExplorerStore.rootPath, relativePath)
        showFileHistoryPanel.value = true
      }
    }
  })

  // 查看行历史
  editorInstance.addAction({
    id: 'gitlens.viewLineHistory',
    label: 'Git: View Line History',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 2,
    run: () => {
      if (activeTab.value && fileExplorerStore.rootPath && editorInstance) {
        const selection = editorInstance.getSelection()
        if (selection) {
          const startLine = selection.startLineNumber
          const endLine = selection.endLineNumber
          const relativePath = activeTab.value.path.replace(fileExplorerStore.rootPath + '/', '')
          fileHistoryStore.loadLineHistory(fileExplorerStore.rootPath, relativePath, startLine, endLine)
          showFileHistoryPanel.value = true
        }
      }
    }
  })

  // 与上一版本比较
  editorInstance.addAction({
    id: 'gitlens.compareWithPrevious',
    label: 'Git: Compare with Previous Revision',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 3,
    run: async () => {
      if (activeTab.value && fileExplorerStore.rootPath) {
        const relativePath = activeTab.value.path.replace(fileExplorerStore.rootPath + '/', '')
        // TODO: 实现与上一版本比较功能，跳转到 diff 视图
        console.log('Compare with previous:', relativePath)
        // 这里应该打开 diff 视图，稍后实现
      }
    }
  })

  // 切换 Inline Blame 显示
  editorInstance.addAction({
    id: 'gitlens.toggleInlineBlame',
    label: 'Git: Toggle Inline Blame',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 4,
    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyB],
    run: () => {
      blameStore.toggleInlineBlame()
      if (blameProvider) {
        blameProvider.setEnabled(blameStore.showInlineBlame)
      }
    }
  })

  // 复制当前行的 Commit Hash
  editorInstance.addAction({
    id: 'gitlens.copyCommitHash',
    label: 'Git: Copy Commit Hash',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 5,
    run: async () => {
      if (blameStore.currentLineBlame && !blameStore.currentLineBlame.isUncommitted) {
        await navigator.clipboard.writeText(blameStore.currentLineBlame.commitHash)
      }
    }
  })

  // 在 Git Graph 中显示
  editorInstance.addAction({
    id: 'gitlens.showInGitGraph',
    label: 'Git: Show in Git Graph',
    contextMenuGroupId: 'gitlens',
    contextMenuOrder: 6,
    run: () => {
      if (blameStore.currentLineBlame && !blameStore.currentLineBlame.isUncommitted) {
        // TODO: 跳转到 Git Graph 并选中该 commit
        console.log('Show in Git Graph:', blameStore.currentLineBlame.commitHash)
      }
    }
  })
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
    // 更新调试工作区并加载配置
    debugStore.setWorkspaceFolder(newPath)
    await debugStore.loadLaunchConfigurations()

    // 加载 .logos 项目级智能模式设置
    await intelligenceStore.loadFromProject(newPath)

    // 分析项目并根据 autoSelect 决定是否自动切换模式
    if (intelligenceStore.autoSelect) {
      await intelligenceStore.autoDetectMode()
    } else {
      await intelligenceStore.analyzeProject()
    }
  } else {
    debugStore.setWorkspaceFolder(null)
  }
})

// ============ 断点相关功能 ============

// 切换断点
async function toggleBreakpointAtLine(filePath: string, line: number) {
  await debugStore.toggleBreakpointAtLine(filePath, line)
  updateBreakpointDecorations(filePath)
}

// 更新断点装饰器
function updateBreakpointDecorations(filePath: string) {
  if (!editor) return

  const model = models.get(filePath)
  if (!model || model !== editor.getModel()) return

  const breakpoints = debugStore.getBreakpointsForFile(filePath)

  const decorations: monaco.editor.IModelDeltaDecoration[] = breakpoints.map(bp => ({
    range: new monaco.Range(bp.line, 1, bp.line, 1),
    options: {
      isWholeLine: false,
      glyphMarginClassName: getBreakpointGlyphClass(bp),
      glyphMarginHoverMessage: { value: getBreakpointHoverMessage(bp) },
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }
  }))

  const oldDecorations = breakpointDecorations.get(filePath) || []
  const newDecorations = editor.deltaDecorations(oldDecorations, decorations)
  breakpointDecorations.set(filePath, newDecorations)
}

// 获取断点装饰器类名
function getBreakpointGlyphClass(bp: BreakpointInfo): string {
  if (!bp.enabled) return 'breakpoint-disabled'
  if (!bp.verified) return 'breakpoint-unverified'
  if (bp.condition) return 'breakpoint-conditional'
  if (bp.logMessage) return 'breakpoint-logpoint'
  return 'breakpoint'
}

// 获取断点悬停提示
function getBreakpointHoverMessage(bp: BreakpointInfo): string {
  let msg = `断点: 行 ${bp.line}`
  if (bp.condition) msg += `\n条件: ${bp.condition}`
  if (bp.hitCondition) msg += `\n命中条件: ${bp.hitCondition}`
  if (bp.logMessage) msg += `\n日志: ${bp.logMessage}`
  if (!bp.enabled) msg += '\n(已禁用)'
  if (!bp.verified) msg += '\n(未验证)'
  return msg
}

// 更新当前执行行
function updateCurrentLineDecoration(filePath: string, line: number | null) {
  if (!editor) return

  const model = models.get(filePath)
  if (!model || model !== editor.getModel()) return

  if (line === null) {
    // 清除执行行标记
    currentLineDecoration.value = editor.deltaDecorations(currentLineDecoration.value, [])
  } else {
    // 显示执行行标记
    currentLineDecoration.value = editor.deltaDecorations(currentLineDecoration.value, [{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'current-line-highlight',
        glyphMarginClassName: 'current-line-glyph'
      }
    }])

    // 滚动到当前行
    editor.revealLineInCenter(line)
  }
}

// 监听断点变化
watch(() => debugStore.allBreakpoints, () => {
  if (activeTab.value) {
    updateBreakpointDecorations(activeTab.value.path)
  }
}, { deep: true })

// 监听当前帧变化，更新执行行高亮
watch(() => debugStore.currentFrame, (frame) => {
  if (frame?.source?.path && activeTab.value?.path === frame.source.path) {
    updateCurrentLineDecoration(frame.source.path, frame.line)
  } else if (activeTab.value) {
    updateCurrentLineDecoration(activeTab.value.path, null)
  }
})

// 监听调试状态变化
watch(() => debugStore.isPaused, (isPaused) => {
  if (!isPaused && activeTab.value) {
    updateCurrentLineDecoration(activeTab.value.path, null)
  }
})

// 监听 inline blame 显示状态变化
watch(() => blameStore.showInlineBlame, (show) => {
  if (blameProvider) {
    blameProvider.setEnabled(show)
  }
})

onUnmounted(() => {
  // 清理诊断定时器
  if (diagnosticsTimer) {
    clearTimeout(diagnosticsTimer)
    diagnosticsTimer = null
  }

  // 清理 blame 定时器
  if (blameTimer) {
    clearTimeout(blameTimer)
    blameTimer = null
  }

  // 清理 blame provider
  if (blameProvider) {
    blameProvider.dispose()
    blameProvider = null
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

      <!-- 编辑器和文件历史并排布局 -->
      <div class="editor-with-history">
        <!-- 编辑器容器 -->
        <div ref="editorContainer" class="editor-container"></div>

        <!-- 文件历史面板 -->
        <Transition name="slide">
          <div v-if="showFileHistoryPanel" class="file-history-sidebar">
            <FileHistoryPanel
              :file-path="activeTab?.path"
              @close="showFileHistoryPanel = false"
              @select-commit="(hash) => console.log('Selected commit:', hash)"
            />
          </div>
        </Transition>
      </div>
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
              <kbd>{{ modifierKeyLabel }}</kbd> + <kbd>S</kbd>
              <span>保存</span>
            </div>
            <div class="shortcut">
              <kbd>{{ modifierKeyLabel }}</kbd> + <kbd>W</kbd>
              <span>关闭标签</span>
            </div>
            <div class="shortcut">
              <kbd>{{ modifierKeyLabel }}</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>
              <span>切换智能模式</span>
            </div>
            <div class="shortcut">
              <kbd>{{ modifierKeyLabel }}</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
              <span>反馈上报</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Blame Hover 卡片 -->
    <BlameHoverCard
      v-if="blameStore.hoveredCommit"
      :commit="blameStore.hoveredCommit"
      :position="blameStore.hoverCardPosition || { x: 0, y: 0 }"
      :visible="blameStore.showHoverCard"
      @close="blameStore.hideCommitHoverCard()"
      @view-commit="(hash) => console.log('View commit:', hash)"
      @view-file-history="() => console.log('View file history')"
      @copy-hash="(hash) => console.log('Copied hash:', hash)"
    />
  </div>
</template>

<!-- Global styles for Monaco Editor decorations (must not be scoped) -->
<style>
/* 断点装饰器样式 */
.breakpoint {
  background: #e51400;
  border-radius: 50%;
  width: 12px !important;
  height: 12px !important;
  margin-left: 4px;
  margin-top: 4px;
}

.breakpoint-disabled {
  background: #848484;
  border-radius: 50%;
  width: 12px !important;
  height: 12px !important;
  margin-left: 4px;
  margin-top: 4px;
  opacity: 0.6;
}

.breakpoint-unverified {
  background: #848484;
  border-radius: 50%;
  width: 12px !important;
  height: 12px !important;
  margin-left: 4px;
  margin-top: 4px;
  border: 1px dashed #e51400;
  box-sizing: border-box;
}

.breakpoint-conditional {
  background: #e51400;
  border-radius: 50%;
  width: 12px !important;
  height: 12px !important;
  margin-left: 4px;
  margin-top: 4px;
}

.breakpoint-conditional::after {
  content: '?';
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: white;
  height: 100%;
}

.breakpoint-logpoint {
  background: #007acc;
  border-radius: 4px;
  width: 12px !important;
  height: 12px !important;
  margin-left: 4px;
  margin-top: 4px;
}

.breakpoint-logpoint::after {
  content: 'L';
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: bold;
  color: white;
  height: 100%;
}

/* 当前执行行高亮 */
.current-line-highlight {
  background: rgba(255, 238, 0, 0.15) !important;
}

.current-line-glyph {
  background: #ffcc00;
  width: 0;
  height: 0;
  border-left: 8px solid #ffcc00;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  margin-left: 3px;
  margin-top: 5px;
}

/* 确保行号区域有足够空间显示断点 */
.monaco-editor .margin-view-overlays .line-numbers {
  padding-right: 8px;
}

/* 悬停时显示断点区域 */
.monaco-editor .margin-view-overlays .glyph-margin:hover {
  cursor: pointer;
}
</style>

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

/* 编辑器和文件历史并排布局 */
.editor-with-history {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-with-history .editor-container {
  flex: 1;
  min-width: 0;
}

/* 文件历史侧边栏 */
.file-history-sidebar {
  width: 320px;
  min-width: 280px;
  max-width: 400px;
  border-left: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface);
  overflow: hidden;
}

/* 滑入滑出动画 */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-enter-to,
.slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
