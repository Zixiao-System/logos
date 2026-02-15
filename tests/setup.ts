/**
 * Vitest Test Setup
 * 全局测试配置和模拟
 */

import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// 模拟 window.electronAPI
const mockElectronAPI = {
  fileSystem: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readDirectory: vi.fn(),
    createDirectory: vi.fn(),
    deleteFile: vi.fn(),
    rename: vi.fn(),
    exists: vi.fn(),
    stat: vi.fn(),
    watch: vi.fn(),
    unwatch: vi.fn()
  },
  git: {
    // 基础 Git 操作
    getStatus: vi.fn(),
    getBranches: vi.fn(),
    getCurrentBranch: vi.fn(),
    checkout: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    fetch: vi.fn(),
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    getLog: vi.fn(),
    getDiff: vi.fn(),

    // Merge 相关
    getMergeStatus: vi.fn().mockResolvedValue({
      inMerge: false,
      mergeHead: null,
      mergeMessage: null,
      conflictCount: 0
    }),
    hasConflicts: vi.fn().mockResolvedValue(false),
    getConflictedFiles: vi.fn().mockResolvedValue([]),
    getConflictContent: vi.fn().mockResolvedValue({
      ours: '',
      theirs: '',
      base: '',
      merged: ''
    }),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    abortMerge: vi.fn().mockResolvedValue(undefined),
    continueMerge: vi.fn().mockResolvedValue(undefined),

    // Rebase 相关
    getRebaseStatus: vi.fn().mockResolvedValue({
      inProgress: false,
      currentStep: 0,
      totalSteps: 0,
      currentCommit: null,
      hasConflicts: false,
      onto: null
    }),
    getCommitsForRebase: vi.fn().mockResolvedValue([]),
    rebaseInteractiveStart: vi.fn().mockResolvedValue({ success: true }),
    rebaseContinue: vi.fn().mockResolvedValue({ success: true }),
    rebaseSkip: vi.fn().mockResolvedValue({ success: true }),
    rebaseAbort: vi.fn().mockResolvedValue({ success: true }),

    // Cherry-pick 相关
    cherryPickMultiple: vi.fn().mockResolvedValue({ success: true }),
    cherryPickPreview: vi.fn().mockResolvedValue({
      commits: [],
      affectedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0
    }),

    // Reflog 相关
    getReflog: vi.fn().mockResolvedValue([]),
    getReflogForRef: vi.fn().mockResolvedValue([])
  },
  terminal: {
    create: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn()
  },
  feedback: {
    submit: vi.fn(),
    getSystemState: vi.fn()
  },
  debug: {
    // 会话管理
    startSession: vi.fn().mockResolvedValue({ success: true, session: null }),
    stopSession: vi.fn().mockResolvedValue({ success: true }),
    restartSession: vi.fn().mockResolvedValue({ success: true }),
    getSessions: vi.fn().mockResolvedValue([]),
    getActiveSession: vi.fn().mockResolvedValue(undefined),
    setActiveSession: vi.fn().mockResolvedValue(undefined),

    // 执行控制
    continue: vi.fn().mockResolvedValue({ success: true }),
    pause: vi.fn().mockResolvedValue({ success: true }),
    stepOver: vi.fn().mockResolvedValue({ success: true }),
    stepInto: vi.fn().mockResolvedValue({ success: true }),
    stepOut: vi.fn().mockResolvedValue({ success: true }),
    restartFrame: vi.fn().mockResolvedValue({ success: true }),

    // 断点管理
    setBreakpoint: vi.fn().mockResolvedValue({ success: true, breakpoint: null }),
    removeBreakpoint: vi.fn().mockResolvedValue({ success: true }),
    toggleBreakpoint: vi.fn().mockResolvedValue({ success: true }),
    toggleBreakpointAtLine: vi.fn().mockResolvedValue({ success: true, breakpoint: null }),
    getAllBreakpoints: vi.fn().mockResolvedValue([]),
    getBreakpointsForFile: vi.fn().mockResolvedValue([]),
    editBreakpoint: vi.fn().mockResolvedValue({ success: true, breakpoint: null }),

    // 变量和栈帧
    getThreads: vi.fn().mockResolvedValue({ success: true, threads: [] }),
    getStackTrace: vi.fn().mockResolvedValue({ success: true, frames: [] }),
    getScopes: vi.fn().mockResolvedValue({ success: true, scopes: [] }),
    getVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
    setVariable: vi.fn().mockResolvedValue({ success: true, variable: null }),
    evaluate: vi.fn().mockResolvedValue({ success: true, result: null }),
    selectFrame: vi.fn().mockResolvedValue(undefined),

    // 监视表达式
    addWatch: vi.fn().mockResolvedValue({ id: 'watch_1', expression: '' }),
    removeWatch: vi.fn().mockResolvedValue(undefined),
    refreshWatch: vi.fn().mockResolvedValue(undefined),
    refreshAllWatches: vi.fn().mockResolvedValue(undefined),
    getWatchExpressions: vi.fn().mockResolvedValue([]),

    // 调试控制台
    executeInConsole: vi.fn().mockResolvedValue({ success: true, result: null }),

    // 启动配置
    readLaunchConfig: vi.fn().mockResolvedValue({ success: true, config: null, source: null }),
    writeLaunchConfig: vi.fn().mockResolvedValue({ success: true }),
    getDefaultLaunchConfig: vi.fn().mockResolvedValue({ success: true, config: null }),

    // 自动生成与导入
    autoGenerateConfigurations: vi.fn().mockResolvedValue({ success: true, configurations: [] }),
    importFromVSCode: vi.fn().mockResolvedValue({ success: true }),

    // 适配器管理
    getAvailableAdapters: vi.fn().mockResolvedValue({ success: true, adapters: [] }),
    getInstalledAdapters: vi.fn().mockResolvedValue({ success: true, adapters: [] }),
    detectDebuggers: vi.fn().mockResolvedValue({ success: true, debuggers: [] }),

    // 活动文件管理
    setActiveFile: vi.fn().mockResolvedValue(undefined),
    getActiveFile: vi.fn().mockResolvedValue(null),

    // 异常断点
    setExceptionBreakpoints: vi.fn().mockResolvedValue({ success: true }),
    getExceptionFilters: vi.fn().mockResolvedValue({ success: true, filters: [] }),

    // 事件监听
    onSessionCreated: vi.fn().mockReturnValue(() => {}),
    onSessionStateChanged: vi.fn().mockReturnValue(() => {}),
    onSessionTerminated: vi.fn().mockReturnValue(() => {}),
    onStopped: vi.fn().mockReturnValue(() => {}),
    onContinued: vi.fn().mockReturnValue(() => {}),
    onBreakpointChanged: vi.fn().mockReturnValue(() => {}),
    onBreakpointValidated: vi.fn().mockReturnValue(() => {}),
    onBreakpointRemoved: vi.fn().mockReturnValue(() => {}),
    onThreadsUpdated: vi.fn().mockReturnValue(() => {}),
    onFrameSelected: vi.fn().mockReturnValue(() => {}),
    onConsoleMessage: vi.fn().mockReturnValue(() => {}),
    onWatchAdded: vi.fn().mockReturnValue(() => {}),
    onWatchRemoved: vi.fn().mockReturnValue(() => {}),
    onWatchUpdated: vi.fn().mockReturnValue(() => {}),
    onActiveSessionChanged: vi.fn().mockReturnValue(() => {})
  }
}

// 设置全局 window.electronAPI 模拟
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})

// 配置 Vue Test Utils
config.global.stubs = {
  // MDUI 组件存根
  'mdui-button': true,
  'mdui-button-icon': true,
  'mdui-icon': true,
  'mdui-select': true,
  'mdui-menu': true,
  'mdui-menu-item': true,
  'mdui-checkbox': true,
  'mdui-dropdown': true,
  'mdui-divider': true,
  'mdui-dialog': true,
  'mdui-text-field': true,
  'mdui-circular-progress': true,
  'mdui-linear-progress': true,
  'mdui-chip': true,
  'mdui-tooltip': true,
  // MDUI 图标存根
  'mdui-icon-refresh': true,
  'mdui-icon-search': true,
  'mdui-icon-filter-list': true,
  'mdui-icon-close': true,
  'mdui-icon-check': true,
  'mdui-icon-edit': true,
  'mdui-icon-delete': true,
  'mdui-icon-drag-indicator': true,
  'mdui-icon-compress': true,
  'mdui-icon-pause': true,
  'mdui-icon-play-arrow': true,
  'mdui-icon-stop': true,
  'mdui-icon-skip-next': true,
  'mdui-icon-undo': true,
  'mdui-icon-redo': true,
  'mdui-icon-content-copy': true,
  'mdui-icon-save': true,
  'mdui-icon-keyboard-arrow-down': true,
  'mdui-icon-keyboard-arrow-right': true
}

// 导出模拟对象供测试使用
export { mockElectronAPI }

// 重置所有模拟
export function resetAllMocks(): void {
  vi.clearAllMocks()
}

// 创建模拟的 Pinia store 辅助函数
export function createTestingPinia() {
  const { createPinia, setActivePinia } = require('pinia')
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
