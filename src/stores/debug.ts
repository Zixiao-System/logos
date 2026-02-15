/**
 * 调试状态管理
 */

import { defineStore } from 'pinia'
import type {
  SessionState,
  BreakpointType,
  BreakpointInfo,
  DebugConfig,
  Thread,
  StackFrame,
  Scope,
  Variable,
  WatchExpression,
  FunctionBreakpoint,
  CompoundConfig,
  DebugConsoleMessage,
  DebugSessionInfo,
  ExceptionFilterState,
  Source
} from '@shared/debug/types'

// Re-export shared types for consumers that import from this module
export type {
  SessionState,
  BreakpointType,
  BreakpointInfo,
  DebugConfig,
  Thread,
  StackFrame,
  Scope,
  Variable,
  WatchExpression,
  FunctionBreakpoint,
  CompoundConfig,
  DebugConsoleMessage,
  DebugSessionInfo,
  ExceptionFilterState,
  Source
}

// Backward-compatible aliases for renamed types
export type DebugThread = Thread
export type DebugScope = Scope
export type DebugVariable = Variable
export type DebugSession = DebugSessionInfo
export type DebugSource = Source
export type LaunchConfig = DebugConfig

/** 检测到的调试器 */
export interface DetectedDebugger {
  type: string
  displayName: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/** 调试状态 */
export interface DebugState {
  // 会话
  sessions: DebugSessionInfo[]
  activeSessionId: string | null

  // 启动配置
  launchConfigurations: DebugConfig[]
  compoundConfigurations: CompoundConfig[]
  selectedConfigIndex: number
  workspaceFolder: string | null
  configSource: 'logos' | 'vscode' | null
  detectedDebuggers: DetectedDebugger[]
  autoDetectionDone: boolean

  // 断点
  breakpoints: Map<string, BreakpointInfo[]>  // filePath -> breakpoints
  functionBreakpoints: FunctionBreakpoint[]

  // 线程
  activeThreads: Thread[]
  threadStackFrames: Map<number, StackFrame[]>  // threadId -> stack frames

  // 栈帧
  currentThreadId: number | null
  currentFrameId: number | null
  stackFrames: StackFrame[]

  // 变量
  scopes: Scope[]
  variables: Map<number, Variable[]>  // variablesReference -> variables

  // 监视
  watchExpressions: WatchExpression[]

  // 异常断点过滤器
  exceptionFilters: ExceptionFilterState[]

  // 控制台
  consoleMessages: DebugConsoleMessage[]

  // UI状态
  isPanelVisible: boolean
  activePanel: 'variables' | 'watch' | 'callStack' | 'breakpoints' | 'console'
}

export const useDebugStore = defineStore('debug', {
  state: (): DebugState => ({
    sessions: [],
    activeSessionId: null,
    launchConfigurations: [],
    compoundConfigurations: [],
    selectedConfigIndex: -1,
    workspaceFolder: null,
    configSource: null,
    detectedDebuggers: [],
    autoDetectionDone: false,
    breakpoints: new Map(),
    functionBreakpoints: [],
    activeThreads: [],
    threadStackFrames: new Map(),
    currentThreadId: null,
    currentFrameId: null,
    stackFrames: [],
    scopes: [],
    variables: new Map(),
    watchExpressions: [],
    exceptionFilters: [],
    consoleMessages: [],
    isPanelVisible: false,
    activePanel: 'variables'
  }),

  getters: {
    /** 当前激活的会话 */
    activeSession: (state): DebugSessionInfo | null => {
      if (!state.activeSessionId) return null
      return state.sessions.find(s => s.id === state.activeSessionId) || null
    },

    /** 是否正在调试 */
    isDebugging: (state): boolean => {
      return state.sessions.some(s => s.state !== 'terminated')
    },

    /** 是否暂停 */
    isPaused: (state): boolean => {
      const session = state.sessions.find(s => s.id === state.activeSessionId)
      return session?.state === 'stopped'
    },

    /** 是否正在运行 */
    isRunning: (state): boolean => {
      const session = state.sessions.find(s => s.id === state.activeSessionId)
      return session?.state === 'running'
    },

    /** 获取所有断点 */
    allBreakpoints: (state): BreakpointInfo[] => {
      const all: BreakpointInfo[] = []
      for (const breakpoints of state.breakpoints.values()) {
        all.push(...breakpoints)
      }
      return all
    },

    /** 当前帧 */
    currentFrame: (state): StackFrame | null => {
      if (!state.currentFrameId) return null
      return state.stackFrames.find(f => f.id === state.currentFrameId) || null
    },

    /** 选中的启动配置 */
    selectedConfiguration: (state): DebugConfig | null => {
      if (state.selectedConfigIndex < 0 || state.selectedConfigIndex >= state.launchConfigurations.length) {
        return null
      }
      return state.launchConfigurations[state.selectedConfigIndex]
    },

    /** 是否有配置 */
    hasConfigurations: (state): boolean => {
      return state.launchConfigurations.length > 0
    }
  },

  actions: {
    // ============ 会话管理 ============

    /** 添加会话 */
    addSession(session: DebugSessionInfo) {
      if (this.sessions.some(s => s.id === session.id)) return  // deduplicate
      this.sessions.push(session)
      this.activeSessionId = session.id
      this.isPanelVisible = true

      // Auto-initialize exception filters from capabilities
      if (session.capabilities) {
        const caps = session.capabilities as Record<string, unknown>
        const filters = caps.exceptionBreakpointFilters as Array<{ filter: string; label: string; description?: string; default?: boolean; supportsCondition?: boolean; conditionDescription?: string }> | undefined
        if (filters && filters.length > 0) {
          this.initExceptionFilters(filters)
        }
      }
    },

    /** 更新会话状态 */
    updateSessionState(sessionId: string, state: SessionState) {
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) {
        session.state = state
      }
    },

    /** 移除会话 */
    removeSession(sessionId: string) {
      const index = this.sessions.findIndex(s => s.id === sessionId)
      if (index !== -1) {
        this.sessions.splice(index, 1)
        if (this.activeSessionId === sessionId) {
          this.activeSessionId = this.sessions.length > 0 ? this.sessions[0].id : null
        }
      }
    },

    /** 设置活动会话 */
    setActiveSession(sessionId: string) {
      if (this.sessions.some(s => s.id === sessionId)) {
        this.activeSessionId = sessionId
      }
    },

    // ============ 启动配置管理 ============

    /** 设置工作区文件夹 */
    setWorkspaceFolder(folder: string | null) {
      this.workspaceFolder = folder
    },

    /** 加载启动配置 */
    async loadLaunchConfigurations() {
      if (!this.workspaceFolder) return

      const api = window.electronAPI?.debug
      if (!api) return

      try {
        const result = await api.readLaunchConfig(this.workspaceFolder)
        if (result.success && result.data && result.data.config) {
          this.launchConfigurations = result.data.config.configurations || []
          this.compoundConfigurations = (result.data.config.compounds as CompoundConfig[] | undefined) || []
          this.configSource = result.data.source ?? null
          // 如果有配置但未选中，默认选中第一个
          if (this.launchConfigurations.length > 0 && this.selectedConfigIndex < 0) {
            this.selectedConfigIndex = 0
          }
        } else {
          this.launchConfigurations = []
          this.compoundConfigurations = []
          this.selectedConfigIndex = -1
          this.configSource = null
        }
      } catch {
        this.launchConfigurations = []
        this.compoundConfigurations = []
        this.selectedConfigIndex = -1
        this.configSource = null
      }
    },

    /** 保存启动配置 */
    async saveLaunchConfigurations() {
      if (!this.workspaceFolder) return false

      const api = window.electronAPI?.debug
      if (!api) return false

      try {
        const result = await api.writeLaunchConfig(this.workspaceFolder, {
          version: '0.2.0',
          configurations: JSON.parse(JSON.stringify(this.launchConfigurations))
        })
        return result.success
      } catch {
        return false
      }
    },

    /** 添加配置 */
    async addConfiguration(config: DebugConfig) {
      this.launchConfigurations.push(config)
      this.selectedConfigIndex = this.launchConfigurations.length - 1
      await this.saveLaunchConfigurations()
    },

    /** 更新配置 */
    async updateConfiguration(index: number, config: DebugConfig) {
      if (index >= 0 && index < this.launchConfigurations.length) {
        this.launchConfigurations[index] = config
        await this.saveLaunchConfigurations()
      }
    },

    /** 删除配置 */
    async removeConfiguration(index: number) {
      if (index >= 0 && index < this.launchConfigurations.length) {
        this.launchConfigurations.splice(index, 1)
        // 调整选中索引
        if (this.selectedConfigIndex >= this.launchConfigurations.length) {
          this.selectedConfigIndex = this.launchConfigurations.length - 1
        }
        await this.saveLaunchConfigurations()
      }
    },

    /** 选择配置 */
    selectConfiguration(index: number) {
      if (index >= -1 && index < this.launchConfigurations.length) {
        this.selectedConfigIndex = index
      }
    },

    /** 获取默认配置模板 */
    async getDefaultConfiguration(type: string): Promise<DebugConfig | null> {
      const api = window.electronAPI?.debug
      if (!api || !this.workspaceFolder) return null

      try {
        const result = await api.getDefaultLaunchConfig(type, this.workspaceFolder)
        if (result.success && result.data) {
          return result.data as DebugConfig
        }
      } catch {
        // 忽略错误
      }
      return null
    },

    /** 检测调试器 */
    async detectDebuggers() {
      if (!this.workspaceFolder) return

      const api = window.electronAPI?.debug
      if (!api) return

      try {
        const result = await api.detectDebuggers(this.workspaceFolder)
        if (result.success && result.data) {
          this.detectedDebuggers = result.data as DetectedDebugger[]
        }
      } catch {
        // 忽略
      }
      this.autoDetectionDone = true
    },

    /** 自动生成配置 */
    async autoGenerateConfigurations(): Promise<boolean> {
      if (!this.workspaceFolder) return false

      const api = window.electronAPI?.debug
      if (!api) return false

      try {
        const result = await api.autoGenerateConfigurations(this.workspaceFolder)
        if (result.success && result.data && result.data.length > 0) {
          for (const config of result.data) {
            this.launchConfigurations.push(config as DebugConfig)
          }
          if (this.selectedConfigIndex < 0) {
            this.selectedConfigIndex = 0
          }
          await this.saveLaunchConfigurations()
          return true
        }
      } catch {
        // 忽略
      }
      return false
    },

    /** 从 VS Code 导入配置 */
    async importFromVSCode(): Promise<boolean> {
      if (!this.workspaceFolder) return false

      const api = window.electronAPI?.debug
      if (!api) return false

      try {
        const result = await api.importFromVSCode(this.workspaceFolder)
        if (result.success) {
          await this.loadLaunchConfigurations()
          return true
        }
      } catch {
        // 忽略
      }
      return false
    },

    /** 运行配置（不调试） */
    async runConfiguration(index?: number) {
      const configIndex = index ?? this.selectedConfigIndex
      if (configIndex < 0 || configIndex >= this.launchConfigurations.length) return null

      const config = { ...this.launchConfigurations[configIndex] }
      // 设置为不调试模式（对于Node.js，这意味着不使用inspect）
      config.noDebug = true

      if (!this.workspaceFolder) return null
      return await this.startDebugging(config, this.workspaceFolder)
    },

    /** 调试配置 */
    async debugConfiguration(index?: number) {
      const configIndex = index ?? this.selectedConfigIndex
      if (configIndex < 0 || configIndex >= this.launchConfigurations.length) return null

      const config = this.launchConfigurations[configIndex]
      if (!this.workspaceFolder) return null

      return await this.startDebugging(config, this.workspaceFolder)
    },

    /** 启动复合调试配置 */
    async startCompoundDebugging(compoundName: string) {
      const compound = this.compoundConfigurations.find(c => c.name === compoundName)
      if (!compound || !this.workspaceFolder) return null

      const sessions: DebugSessionInfo[] = []
      for (const configName of compound.configurations) {
        const config = this.launchConfigurations.find(c => c.name === configName)
        if (!config) {
          console.warn(`Compound config "${compoundName}": configuration "${configName}" not found`)
          continue
        }
        const session = await this.startDebugging(config, this.workspaceFolder)
        if (session) {
          sessions.push(session)
        }
      }
      return sessions
    },

    // ============ 断点管理 ============

    /** 添加断点 */
    addBreakpoint(breakpoint: BreakpointInfo) {
      const filePath = breakpoint.source.path
      if (!filePath) return

      let fileBreakpoints = this.breakpoints.get(filePath)
      if (!fileBreakpoints) {
        fileBreakpoints = []
        this.breakpoints.set(filePath, fileBreakpoints)
      }
      fileBreakpoints.push(breakpoint)
    },

    /** 更新断点 */
    updateBreakpoint(breakpoint: BreakpointInfo) {
      const filePath = breakpoint.source.path
      if (!filePath) return

      const fileBreakpoints = this.breakpoints.get(filePath)
      if (fileBreakpoints) {
        const index = fileBreakpoints.findIndex(bp => bp.id === breakpoint.id)
        if (index !== -1) {
          fileBreakpoints[index] = breakpoint
        }
      }
    },

    /** 移除断点 */
    removeBreakpoint(breakpointId: string) {
      for (const [filePath, breakpoints] of this.breakpoints.entries()) {
        const index = breakpoints.findIndex(bp => bp.id === breakpointId)
        if (index !== -1) {
          breakpoints.splice(index, 1)
          if (breakpoints.length === 0) {
            this.breakpoints.delete(filePath)
          }
          return
        }
      }
    },

    /** 获取文件的断点 */
    getBreakpointsForFile(filePath: string): BreakpointInfo[] {
      return this.breakpoints.get(filePath) || []
    },

    /** 切换断点 */
    toggleBreakpointEnabled(breakpointId: string) {
      for (const breakpoints of this.breakpoints.values()) {
        const bp = breakpoints.find(b => b.id === breakpointId)
        if (bp) {
          bp.enabled = !bp.enabled
          return
        }
      }
    },

    // ============ 函数断点管理 ============

    /** 添加函数断点 */
    async addFunctionBreakpoint(name: string, condition?: string, hitCondition?: string) {
      const bp: FunctionBreakpoint = {
        id: `fbp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        enabled: true,
        verified: false,
        condition,
        hitCondition
      }
      this.functionBreakpoints.push(bp)
      await this.syncFunctionBreakpoints()
    },

    /** 移除函数断点 */
    async removeFunctionBreakpoint(id: string) {
      const index = this.functionBreakpoints.findIndex(bp => bp.id === id)
      if (index !== -1) {
        this.functionBreakpoints.splice(index, 1)
        await this.syncFunctionBreakpoints()
      }
    },

    /** 切换函数断点启用状态 */
    async toggleFunctionBreakpoint(id: string) {
      const bp = this.functionBreakpoints.find(b => b.id === id)
      if (bp) {
        bp.enabled = !bp.enabled
        await this.syncFunctionBreakpoints()
      }
    },

    /** 同步函数断点到适配器 */
    async syncFunctionBreakpoints() {
      const api = window.electronAPI?.debug
      if (!api) return

      const enabledBps = this.functionBreakpoints
        .filter(bp => bp.enabled)
        .map(bp => ({
          name: bp.name,
          condition: bp.condition,
          hitCondition: bp.hitCondition
        }))

      try {
        const result = await api.setFunctionBreakpoints(enabledBps)
        if (result.success && result.data) {
          // Update verified state
          let i = 0
          for (const bp of this.functionBreakpoints) {
            if (bp.enabled && i < result.data.length) {
              bp.verified = result.data[i].verified
              i++
            }
          }
        }
      } catch {
        // Ignore sync errors
      }
    },

    // ============ 多线程管理 ============

    /** 加载所有线程 */
    async loadThreads() {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.getThreads(this.activeSessionId || undefined)
      if (result.success && result.data) {
        this.activeThreads = result.data
      }
    },

    /** 加载所有线程的栈帧 */
    async loadAllStackTraces() {
      const api = window.electronAPI?.debug
      if (!api) return

      for (const thread of this.activeThreads) {
        const result = await api.getStackTrace(thread.id, this.activeSessionId || undefined)
        if (result.success && result.data) {
          this.threadStackFrames.set(thread.id, result.data)
        }
      }
    },

    /** 设置当前线程 */
    setCurrentThread(threadId: number) {
      this.currentThreadId = threadId
      const frames = this.threadStackFrames.get(threadId)
      if (frames && frames.length > 0) {
        this.stackFrames = frames
        this.currentFrameId = frames[0].id
      }
    },

    // ============ 栈帧管理 ============

    /** 设置栈帧 */
    setStackFrames(frames: StackFrame[]) {
      this.stackFrames = frames
      if (frames.length > 0 && !this.currentFrameId) {
        this.currentFrameId = frames[0].id
      }
    },

    /** 选择栈帧 */
    selectFrame(frameId: number) {
      if (this.stackFrames.some(f => f.id === frameId)) {
        this.currentFrameId = frameId
      }
    },

    /** 清除栈帧 */
    clearStackFrames() {
      this.stackFrames = []
      this.currentFrameId = null
      this.scopes = []
      this.variables.clear()
    },

    // ============ 变量管理 ============

    /** 设置作用域 */
    setScopes(scopes: Scope[]) {
      this.scopes = scopes
    },

    /** 设置变量 */
    setVariables(variablesReference: number, variables: Variable[]) {
      this.variables.set(variablesReference, variables)
    },

    /** 获取变量 */
    getVariables(variablesReference: number): Variable[] {
      return this.variables.get(variablesReference) || []
    },

    // ============ 监视表达式 ============

    /** 添加监视表达式 */
    addWatch(watch: WatchExpression) {
      this.watchExpressions.push(watch)
    },

    /** 更新监视表达式 */
    updateWatch(watch: WatchExpression) {
      const index = this.watchExpressions.findIndex(w => w.id === watch.id)
      if (index !== -1) {
        this.watchExpressions[index] = watch
      }
    },

    /** 移除监视表达式 */
    removeWatch(watchId: string) {
      const index = this.watchExpressions.findIndex(w => w.id === watchId)
      if (index !== -1) {
        this.watchExpressions.splice(index, 1)
      }
    },

    // ============ 异常断点过滤器 ============

    /** 从 DAP capabilities 初始化异常过滤器 */
    initExceptionFilters(filters: Array<{ filter: string; label: string; description?: string; default?: boolean; supportsCondition?: boolean; conditionDescription?: string }>) {
      this.exceptionFilters = filters.map(f => ({
        filterId: f.filter,
        label: f.label,
        description: f.description,
        enabled: f.default ?? false,
        supportsCondition: f.supportsCondition ?? false,
        conditionDescription: f.conditionDescription,
        condition: undefined
      }))
    },

    /** 切换异常过滤器启用状态 */
    toggleExceptionFilter(filterId: string) {
      const filter = this.exceptionFilters.find(f => f.filterId === filterId)
      if (filter) {
        filter.enabled = !filter.enabled
        this.syncExceptionFilters()
      }
    },

    /** 更新异常过滤器条件 */
    updateExceptionFilterCondition(filterId: string, condition: string) {
      const filter = this.exceptionFilters.find(f => f.filterId === filterId)
      if (filter && filter.supportsCondition) {
        filter.condition = condition
        this.syncExceptionFilters()
      }
    },

    /** 同步异常过滤器到适配器 */
    async syncExceptionFilters() {
      const api = window.electronAPI?.debug
      if (!api) return

      const enabledFilters = this.exceptionFilters
        .filter(f => f.enabled)
        .map(f => f.filterId)

      const filterOptions = this.exceptionFilters
        .filter(f => f.enabled && f.condition)
        .map(f => ({ filterId: f.filterId, condition: f.condition! }))

      await api.setExceptionBreakpoints(
        enabledFilters,
        filterOptions.length > 0 ? filterOptions : undefined
      )
    },

    // ============ 控制台 ============

    /** 添加控制台消息 */
    addConsoleMessage(message: DebugConsoleMessage) {
      this.consoleMessages.push(message)
      // 限制消息数量
      if (this.consoleMessages.length > 1000) {
        this.consoleMessages.shift()
      }
    },

    /** 清除控制台 */
    clearConsole() {
      this.consoleMessages = []
    },

    // ============ UI 状态 ============

    /** 显示/隐藏调试面板 */
    togglePanel() {
      this.isPanelVisible = !this.isPanelVisible
    },

    /** 设置面板可见性 */
    setPanelVisible(visible: boolean) {
      this.isPanelVisible = visible
    },

    /** 切换活动面板 */
    setActivePanel(panel: DebugState['activePanel']) {
      this.activePanel = panel
    },

    // ============ 事件处理 ============

    /** 处理停止事件 */
    async handleStopped(sessionId: string, threadId: number) {
      this.updateSessionState(sessionId, 'stopped')
      this.currentThreadId = threadId
      this.activePanel = 'variables'

      // Load threads and stack traces for multi-thread support
      await this.loadThreads()
      if (this.activeThreads.length > 0) {
        await this.loadStackTrace(threadId)
        // Also load traces for stopped thread into threadStackFrames
        this.threadStackFrames.set(threadId, [...this.stackFrames])
      }
    },

    /** 处理继续事件 */
    handleContinued(sessionId: string, threadId?: number, allThreadsContinued?: boolean) {
      this.updateSessionState(sessionId, 'running')
      if (allThreadsContinued !== false) {
        this.clearStackFrames()
        this.activeThreads = []
        this.threadStackFrames.clear()
      } else if (threadId) {
        this.threadStackFrames.delete(threadId)
        if (this.currentThreadId === threadId) {
          this.clearStackFrames()
        }
      }
    },

    /** 初始化事件监听器 */
    initEventListeners() {
      const api = window.electronAPI?.debug
      if (!api) return

      // 会话事件
      api.onSessionCreated((session) => {
        this.addSession(session)
      })

      api.onSessionStateChanged((data) => {
        this.updateSessionState(data.sessionId, data.state)
      })

      api.onSessionTerminated((sessionId) => {
        this.removeSession(sessionId)
      })

      // 调试事件
      api.onStopped((data) => {
        this.handleStopped(data.sessionId, data.threadId)
      })

      api.onContinued((data) => {
        this.handleContinued(data.sessionId, data.threadId, data.allThreadsContinued)
      })

      // 断点事件
      api.onBreakpointChanged((bp) => {
        this.updateBreakpoint(bp)
      })

      api.onBreakpointValidated((bp) => {
        this.updateBreakpoint(bp)
      })

      api.onBreakpointRemoved((bpId) => {
        this.removeBreakpoint(bpId)
      })

      // 监视事件
      api.onWatchAdded((watch) => {
        this.addWatch(watch)
      })

      api.onWatchUpdated((watch) => {
        this.updateWatch(watch)
      })

      api.onWatchRemoved((watchId) => {
        this.removeWatch(watchId)
      })

      // 控制台事件
      api.onConsoleMessage((data) => {
        this.addConsoleMessage(data.message)
      })
    },

    // ============ 调试操作 ============

    /** 开始调试 */
    async startDebugging(config: DebugConfig, workspaceFolder: string) {
      const api = window.electronAPI?.debug
      if (!api) return null

      // Deep-clone to strip Vue reactive proxies — IPC structured clone can't handle them
      const plainConfig = JSON.parse(JSON.stringify(config))
      const result = await api.startSession(plainConfig, workspaceFolder)
      if (result.success && result.data) {
        this.addSession(result.data)
        return result.data
      }
      return null
    },

    /** 停止调试 */
    async stopDebugging(sessionId?: string) {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.stopSession(sessionId || this.activeSessionId || undefined)
    },

    /** 断开连接（用于 attach 会话） */
    async disconnectSession(sessionId?: string) {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.disconnectSession(sessionId || this.activeSessionId || undefined)
    },

    /** 重启调试 */
    async restartDebugging(sessionId?: string) {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.restartSession(sessionId || this.activeSessionId || undefined)
    },

    /** 继续执行 */
    async continue() {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.continue(this.activeSessionId || undefined)
    },

    /** 暂停 */
    async pause() {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.pause(this.activeSessionId || undefined)
    },

    /** 单步跳过 */
    async stepOver() {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.stepOver(this.activeSessionId || undefined)
    },

    /** 单步进入 */
    async stepInto() {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.stepInto(this.activeSessionId || undefined)
    },

    /** 单步跳出 */
    async stepOut() {
      const api = window.electronAPI?.debug
      if (!api) return

      await api.stepOut(this.activeSessionId || undefined)
    },

    /** 切换断点 */
    async toggleBreakpointAtLine(filePath: string, line: number) {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.toggleBreakpointAtLine(filePath, line)
      if (result.success) {
        if (result.data) {
          this.addBreakpoint(result.data)
        }
      }
    },

    /** 加载断点 */
    async loadBreakpoints() {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.getAllBreakpoints()
      this.breakpoints.clear()
      if (result.success && result.data) {
        for (const bp of result.data) {
          this.addBreakpoint(bp)
        }
      }
    },

    /** 加载栈帧 */
    async loadStackTrace(threadId: number) {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.getStackTrace(threadId, this.activeSessionId || undefined)
      if (result.success && result.data) {
        this.setStackFrames(result.data)
      }
    },

    /** 加载作用域 */
    async loadScopes(frameId: number) {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.getScopes(frameId, this.activeSessionId || undefined)
      if (result.success && result.data) {
        this.setScopes(result.data)
      }
    },

    /** 加载变量 */
    async loadVariables(variablesReference: number) {
      const api = window.electronAPI?.debug
      if (!api) return

      const result = await api.getVariables(variablesReference, this.activeSessionId || undefined)
      if (result.success && result.data) {
        this.setVariables(variablesReference, result.data)
      }
    },

    /** 求值表达式 */
    async evaluate(expression: string, context: 'watch' | 'repl' | 'hover' = 'repl') {
      const api = window.electronAPI?.debug
      if (!api) return null

      const result = await api.evaluate(
        expression,
        this.currentFrameId || undefined,
        context,
        this.activeSessionId || undefined
      )

      if (result.success) {
        return result.data
      }
      throw new Error(result.error || 'Evaluation failed')
    },

    /** 在控制台执行 */
    async executeInConsole(command: string) {
      const api = window.electronAPI?.debug
      if (!api) return

      // 添加输入消息
      this.addConsoleMessage({
        type: 'input',
        message: command,
        timestamp: Date.now()
      })

      try {
        const result = await api.executeInConsole(command, this.activeSessionId || undefined)
        if (result.success && result.data) {
          this.addConsoleMessage({
            type: 'output',
            message: result.data.result,
            timestamp: Date.now()
          })
        } else if (!result.success) {
          this.addConsoleMessage({
            type: 'error',
            message: result.error || 'Execution failed',
            timestamp: Date.now()
          })
        }
      } catch (error) {
        this.addConsoleMessage({
          type: 'error',
          message: (error as Error).message,
          timestamp: Date.now()
        })
      }
    },

    /** 重置状态 */
    reset() {
      this.sessions = []
      this.activeSessionId = null
      this.currentThreadId = null
      this.currentFrameId = null
      this.stackFrames = []
      this.activeThreads = []
      this.threadStackFrames.clear()
      this.scopes = []
      this.variables.clear()
      this.consoleMessages = []
      this.exceptionFilters = []
      this.configSource = null
      this.detectedDebuggers = []
      this.autoDetectionDone = false
    }
  }
})
