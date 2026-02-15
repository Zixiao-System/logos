/**
 * Debug Service - Main entry point for debugging functionality
 * Orchestrates debug sessions, breakpoints, and coordinates with UI
 * Delegates configuration management to ConfigurationManager
 */
import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import * as crypto from 'crypto'
import { DAPClient } from './DAPClient'
import { StdioTransport } from './transports/stdioTransport'
import type { ITransport } from './transports/types'
import { getAdapterManager } from './adapters'
import type { AdapterType, AdapterInfo, DetectedDebugger } from './adapters'
import { ConfigurationManager } from './configurationManager'
import type {
  DebugSession,
  DebugConfig,
  LaunchConfig,
  AttachConfig,
  SessionState,
  BreakpointInfo,
  BreakpointType,
  WatchExpression,
  EvaluateResult,
  Source,
  SourceBreakpoint,
  StackFrame,
  Scope,
  Variable,
  Thread,
  LaunchConfigFile,
  DebugConsoleMessage
} from './types'

// Re-export stripJsonComments for backward compatibility
export { stripJsonComments } from './configurationManager'

export class DebugService extends EventEmitter {
  private sessions: Map<string, { session: DebugSession; client: DAPClient; process?: ChildProcess; workspaceFolder: string }> = new Map()
  private activeSessionId?: string
  private breakpoints: Map<string, BreakpointInfo[]> = new Map() // file path -> breakpoints
  private watchExpressions: WatchExpression[] = []
  private getMainWindow: () => BrowserWindow | null
  private nextBreakpointId: number = 1
  private nextWatchId: number = 1
  private configManager: ConfigurationManager

  constructor(getMainWindow: () => BrowserWindow | null) {
    super()
    this.getMainWindow = getMainWindow
    this.configManager = new ConfigurationManager()
  }

  /**
   * Set the currently active file path for variable substitution
   */
  setActiveFile(filePath: string | null): void {
    this.configManager.setActiveFile(filePath)
  }

  /**
   * Get the currently active file path
   */
  getActiveFile(): string | null {
    return this.configManager.getActiveFile()
  }

  // ============ Session Management ============

  /**
   * Start a new debug session
   */
  async startSession(config: DebugConfig, workspaceFolder: string): Promise<DebugSession> {
    const sessionId = this.generateSessionId()

    // Create session object
    const session: DebugSession = {
      id: sessionId,
      name: config.name,
      type: config.type,
      state: 'initializing' as SessionState,
      config,
      threads: [],
      currentThreadId: undefined,
      currentFrameId: undefined
    }

    // Execute preLaunchTask if configured
    const preLaunchTask = config.preLaunchTask as string | undefined
    if (preLaunchTask) {
      await this.executePreLaunchTask(preLaunchTask, workspaceFolder)
    }

    // Start the debug adapter based on type
    const { client, process: adapterProcess } = await this.startDebugAdapter(config, workspaceFolder)

    // Store session
    this.sessions.set(sessionId, { session, client, process: adapterProcess, workspaceFolder })

    // Set up event handlers
    this.setupClientEventHandlers(sessionId, client)

    // Initialize the debug adapter
    try {
      const capabilities = await client.initialize(config.type)
      session.capabilities = capabilities

      // Set initial breakpoints before launch/attach
      await this.syncBreakpointsToAdapter(sessionId)

      // Launch or attach
      if (config.request === 'launch') {
        await client.launch(this.prepareLaunchArgs(config as LaunchConfig, workspaceFolder))
      } else {
        await client.attach(this.prepareAttachArgs(config as AttachConfig, workspaceFolder))
      }

      // Signal configuration is done
      await client.configurationDone()

      // Update session state
      session.state = 'running' as SessionState
      this.activeSessionId = sessionId

      this.emit('sessionCreated', session)
      this.emit('sessionStateChanged', sessionId, session.state)
      this.sendToRenderer('debug:sessionCreated', session)

      return session
    } catch (error) {
      // Clean up on error
      this.sessions.delete(sessionId)
      client.stop()
      throw error
    }
  }

  /**
   * Stop a debug session
   */
  async stopSession(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId
    if (!id) return

    const entry = this.sessions.get(id)
    if (!entry) return

    const { session, client, process: adapterProcess } = entry

    try {
      if (session.state !== 'terminated') {
        if (session.config.request === 'attach') {
          await client.disconnect(false, false)
        } else {
          await client.terminate()
        }
      }
    } catch {
      // Ignore errors during termination
    }

    client.stop()
    if (adapterProcess) {
      adapterProcess.kill()
    }

    session.state = 'terminated' as SessionState
    this.sessions.delete(id)

    if (this.activeSessionId === id) {
      // Switch to another session if available
      const remaining = Array.from(this.sessions.keys())
      this.activeSessionId = remaining.length > 0 ? remaining[0] : undefined
    }

    this.emit('sessionTerminated', id)
    this.emit('sessionStateChanged', id, 'terminated')
    this.sendToRenderer('debug:sessionTerminated', id)
  }

  /**
   * Disconnect a debug session without terminating the debuggee
   */
  async disconnectSession(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId
    if (!id) return

    const entry = this.sessions.get(id)
    if (!entry) return

    const { session, client } = entry

    try {
      if (session.state !== 'terminated') {
        await client.disconnect(false, false)
      }
    } catch {
      // Ignore errors during disconnect
    }

    client.stop()
    session.state = 'terminated' as SessionState
    this.sessions.delete(id)

    if (this.activeSessionId === id) {
      const remaining = Array.from(this.sessions.keys())
      this.activeSessionId = remaining.length > 0 ? remaining[0] : undefined
    }

    this.emit('sessionTerminated', id)
    this.emit('sessionStateChanged', id, 'terminated')
    this.sendToRenderer('debug:sessionTerminated', id)
  }

  /**
   * Restart the debug session
   */
  async restartSession(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId
    if (!id) return

    const entry = this.sessions.get(id)
    if (!entry) return

    const { session, client } = entry

    try {
      if (session.capabilities?.supportsRestartRequest) {
        await client.restart()
        session.state = 'running' as SessionState
        this.emit('sessionStateChanged', id, session.state)
        this.sendToRenderer('debug:sessionStateChanged', { sessionId: id, state: session.state })
      } else {
        // Restart by stopping and starting again
        const config = session.config
        const workspaceFolder = entry.workspaceFolder
        await this.stopSession(id)
        await this.startSession(config, workspaceFolder)
      }
    } catch (error) {
      console.error('Failed to restart session:', error)
      throw error
    }
  }

  /**
   * Get all sessions
   */
  getSessions(): DebugSession[] {
    return Array.from(this.sessions.values()).map(e => e.session)
  }

  /**
   * Get active session
   */
  getActiveSession(): DebugSession | undefined {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId)?.session : undefined
  }

  /**
   * Set active session
   */
  setActiveSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.activeSessionId = sessionId
      this.sendToRenderer('debug:activeSessionChanged', sessionId)
    }
  }

  // ============ Execution Control ============

  /**
   * Continue execution
   */
  async continue(sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const { session, client } = entry
    const threadId = session.currentThreadId ?? 1
    await client.continue(threadId)
  }

  /**
   * Pause execution
   */
  async pause(sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const { session, client } = entry
    const threadId = session.currentThreadId ?? 1
    await client.pause(threadId)
  }

  /**
   * Step over (next line)
   */
  async stepOver(sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const { session, client } = entry
    const threadId = session.currentThreadId ?? 1
    await client.next(threadId)
  }

  /**
   * Step into
   */
  async stepInto(sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const { session, client } = entry
    const threadId = session.currentThreadId ?? 1
    await client.stepIn(threadId)
  }

  /**
   * Step out
   */
  async stepOut(sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const { session, client } = entry
    const threadId = session.currentThreadId ?? 1
    await client.stepOut(threadId)
  }

  /**
   * Restart frame
   */
  async restartFrame(frameId: number, sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    await entry.client.restartFrame(frameId)
  }

  // ============ Breakpoint Management ============

  /**
   * Set a line breakpoint
   */
  async setBreakpoint(
    filePath: string,
    line: number,
    options?: { condition?: string; hitCondition?: string; logMessage?: string }
  ): Promise<BreakpointInfo> {
    const bp: BreakpointInfo = {
      id: `bp_${this.nextBreakpointId++}`,
      verified: false,
      source: { path: filePath },
      line,
      enabled: true,
      condition: options?.condition,
      hitCondition: options?.hitCondition,
      logMessage: options?.logMessage,
      type: options?.logMessage ? 'logpoint' as BreakpointType :
            options?.condition ? 'conditional' as BreakpointType :
            'line' as BreakpointType
    }

    // Add to local storage
    const fileBreakpoints = this.breakpoints.get(filePath) || []
    fileBreakpoints.push(bp)
    this.breakpoints.set(filePath, fileBreakpoints)

    // Sync with active session
    await this.syncBreakpointsToAdapterForFile(filePath)

    this.emit('breakpointChanged', bp)
    this.sendToRenderer('debug:breakpointChanged', bp)

    return bp
  }

  /**
   * Remove a breakpoint
   */
  async removeBreakpoint(breakpointId: string): Promise<void> {
    for (const [filePath, breakpoints] of this.breakpoints.entries()) {
      const index = breakpoints.findIndex(bp => bp.id === breakpointId)
      if (index !== -1) {
        breakpoints.splice(index, 1)
        if (breakpoints.length === 0) {
          this.breakpoints.delete(filePath)
        }
        await this.syncBreakpointsToAdapterForFile(filePath)
        this.sendToRenderer('debug:breakpointRemoved', breakpointId)
        return
      }
    }
  }

  /**
   * Toggle breakpoint enabled state
   */
  async toggleBreakpoint(breakpointId: string): Promise<void> {
    for (const [filePath, breakpoints] of this.breakpoints.entries()) {
      const bp = breakpoints.find(b => b.id === breakpointId)
      if (bp) {
        bp.enabled = !bp.enabled
        await this.syncBreakpointsToAdapterForFile(filePath)
        this.emit('breakpointChanged', bp)
        this.sendToRenderer('debug:breakpointChanged', bp)
        return
      }
    }
  }

  /**
   * Toggle breakpoint at a specific line (add if not exists, remove if exists)
   */
  async toggleBreakpointAtLine(filePath: string, line: number): Promise<BreakpointInfo | null> {
    const fileBreakpoints = this.breakpoints.get(filePath) || []
    const existing = fileBreakpoints.find(bp => bp.line === line)

    if (existing) {
      await this.removeBreakpoint(existing.id)
      return null
    } else {
      return await this.setBreakpoint(filePath, line)
    }
  }

  /**
   * Edit an existing breakpoint's properties
   */
  async editBreakpoint(
    breakpointId: string,
    options: { condition?: string; hitCondition?: string; logMessage?: string }
  ): Promise<BreakpointInfo | null> {
    for (const [filePath, breakpoints] of this.breakpoints.entries()) {
      const bp = breakpoints.find(b => b.id === breakpointId)
      if (bp) {
        bp.condition = options.condition
        bp.hitCondition = options.hitCondition
        bp.logMessage = options.logMessage
        bp.type = options.logMessage ? 'logpoint' as BreakpointType :
                  options.condition ? 'conditional' as BreakpointType :
                  'line' as BreakpointType

        await this.syncBreakpointsToAdapterForFile(filePath)
        this.emit('breakpointChanged', bp)
        this.sendToRenderer('debug:breakpointChanged', bp)
        return bp
      }
    }
    return null
  }

  /**
   * Set exception breakpoints for the active session
   */
  async setExceptionBreakpoints(
    filters: string[],
    filterOptions?: Array<{ filterId: string; condition?: string }>,
    sessionId?: string
  ): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    await entry.client.setExceptionBreakpoints(filters, filterOptions)
  }

  /**
   * Get exception filters from session capabilities
   */
  getExceptionFilters(sessionId?: string): Array<{ filter: string; label: string; description?: string; default?: boolean; supportsCondition?: boolean; conditionDescription?: string }> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry?.session.capabilities) return []

    return (entry.session.capabilities.exceptionBreakpointFilters || []).map(f => ({
      filter: f.filter,
      label: f.label,
      description: f.description,
      default: f.default,
      supportsCondition: f.supportsCondition,
      conditionDescription: f.conditionDescription
    }))
  }

  /**
   * Get all breakpoints
   */
  getAllBreakpoints(): BreakpointInfo[] {
    const all: BreakpointInfo[] = []
    for (const breakpoints of this.breakpoints.values()) {
      all.push(...breakpoints)
    }
    return all
  }

  /**
   * Get breakpoints for a file
   */
  getBreakpointsForFile(filePath: string): BreakpointInfo[] {
    return this.breakpoints.get(filePath) || []
  }

  // ============ Function Breakpoints ============

  /**
   * Set function breakpoints
   */
  async setFunctionBreakpoints(
    breakpoints: Array<{ name: string; condition?: string; hitCondition?: string }>,
    sessionId?: string
  ): Promise<Array<{ verified: boolean; message?: string }>> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    const result = await entry.client.setFunctionBreakpoints(breakpoints)
    return result.map(bp => ({ verified: bp.verified, message: bp.message }))
  }

  // ============ Debug Console Completions ============

  /**
   * Get completions for the debug console
   */
  async getCompletions(
    text: string,
    column: number,
    frameId?: number,
    sessionId?: string
  ): Promise<Array<{ label: string; text?: string; type?: string }>> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    const items = await entry.client.completions(text, column, frameId)
    return items.map(item => ({ label: item.label, text: item.text, type: item.type }))
  }

  // ============ Variables & Evaluation ============

  /**
   * Get threads for a session
   */
  async getThreads(sessionId?: string): Promise<Thread[]> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    const threads = await entry.client.threads()
    entry.session.threads = threads
    return threads
  }

  /**
   * Get stack trace for a thread
   */
  async getStackTrace(threadId: number, sessionId?: string): Promise<StackFrame[]> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    const { stackFrames } = await entry.client.stackTrace(threadId)
    return stackFrames
  }

  /**
   * Get scopes for a frame
   */
  async getScopes(frameId: number, sessionId?: string): Promise<Scope[]> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    return await entry.client.scopes(frameId)
  }

  /**
   * Get variables for a scope
   */
  async getVariables(variablesReference: number, sessionId?: string): Promise<Variable[]> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return []

    return await entry.client.variables(variablesReference)
  }

  /**
   * Set a variable's value
   */
  async setVariable(
    variablesReference: number,
    name: string,
    value: string,
    sessionId?: string
  ): Promise<Variable | null> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return null

    return await entry.client.setVariable(variablesReference, name, value)
  }

  /**
   * Evaluate an expression
   */
  async evaluate(
    expression: string,
    frameId?: number,
    context?: 'watch' | 'repl' | 'hover',
    sessionId?: string
  ): Promise<EvaluateResult | null> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return null

    const frame = frameId ?? entry.session.currentFrameId
    return await entry.client.evaluate(expression, frame, context)
  }

  /**
   * Select a stack frame (set as current)
   */
  selectFrame(frameId: number, sessionId?: string): void {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    entry.session.currentFrameId = frameId
    this.sendToRenderer('debug:frameSelected', { sessionId: entry.session.id, frameId })
  }

  // ============ Watch Expressions ============

  /**
   * Add a watch expression
   */
  addWatch(expression: string): WatchExpression {
    const watch: WatchExpression = {
      id: `watch_${this.nextWatchId++}`,
      expression
    }
    this.watchExpressions.push(watch)
    this.refreshWatch(watch.id)
    this.sendToRenderer('debug:watchAdded', watch)
    return watch
  }

  /**
   * Remove a watch expression
   */
  removeWatch(watchId: string): void {
    const index = this.watchExpressions.findIndex(w => w.id === watchId)
    if (index !== -1) {
      this.watchExpressions.splice(index, 1)
      this.sendToRenderer('debug:watchRemoved', watchId)
    }
  }

  /**
   * Refresh a watch expression
   */
  async refreshWatch(watchId: string): Promise<void> {
    const watch = this.watchExpressions.find(w => w.id === watchId)
    if (!watch) return

    try {
      const result = await this.evaluate(watch.expression, undefined, 'watch')
      watch.result = result || undefined
      watch.error = undefined
    } catch (error) {
      watch.result = undefined
      watch.error = (error as Error).message
    }

    this.sendToRenderer('debug:watchUpdated', watch)
  }

  /**
   * Refresh all watch expressions
   */
  async refreshAllWatches(): Promise<void> {
    for (const watch of this.watchExpressions) {
      await this.refreshWatch(watch.id)
    }
  }

  /**
   * Get all watch expressions
   */
  getWatchExpressions(): WatchExpression[] {
    return [...this.watchExpressions]
  }

  // ============ Debug Console ============

  /**
   * Execute a command in the debug console
   */
  async executeInConsole(command: string, sessionId?: string): Promise<EvaluateResult | null> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return null

    // Log the input
    this.addConsoleMessage(entry.session.id, 'input', command)

    try {
      const result = await entry.client.evaluate(command, entry.session.currentFrameId, 'repl')
      this.addConsoleMessage(entry.session.id, 'output', result.result)
      return result
    } catch (error) {
      this.addConsoleMessage(entry.session.id, 'error', (error as Error).message)
      throw error
    }
  }

  // ============ Launch Configuration (delegated to ConfigurationManager) ============

  async readLaunchConfig(workspaceFolder: string): Promise<{ config: LaunchConfigFile | null; source: 'logos' | 'vscode' | null }> {
    return this.configManager.readLaunchConfig(workspaceFolder)
  }

  async importFromVSCode(workspaceFolder: string): Promise<boolean> {
    return this.configManager.importFromVSCode(workspaceFolder)
  }

  async autoGenerateConfigurations(workspaceFolder: string): Promise<DebugConfig[]> {
    const detectedDebuggers = await this.detectDebuggers(workspaceFolder)
    return this.configManager.autoGenerateConfigurations(workspaceFolder, detectedDebuggers)
  }

  async writeLaunchConfig(workspaceFolder: string, config: LaunchConfigFile): Promise<void> {
    return this.configManager.writeLaunchConfig(workspaceFolder, config)
  }

  getDefaultLaunchConfig(type: string, workspaceFolder: string): { success: true; config: DebugConfig } {
    return this.configManager.getDefaultLaunchConfig(type, workspaceFolder)
  }

  // ============ Private Methods ============

  private generateSessionId(): string {
    // Use cryptographically secure randomness for session identifiers
    const randomPart = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex')
    return `session_${Date.now()}_${randomPart}`
  }

  private getSessionEntry(sessionId?: string) {
    const id = sessionId ?? this.activeSessionId
    return id ? this.sessions.get(id) : undefined
  }

  private async startDebugAdapter(config: DebugConfig, workspaceFolder: string): Promise<{ client: DAPClient; process?: ChildProcess }> {
    const adapterManager = getAdapterManager()
    const adapterType = config.type as AdapterType

    // Check for remote debugging configuration
    if ('remote' in config && config.remote) {
      const remoteConfig = config.remote as {
        connectionId: string
        remoteHost: string
        remotePort: number
        localRoot?: string
        remoteRoot?: string
      }

      const transport = adapterManager.createSSHTransport({
        connectionId: remoteConfig.connectionId,
        remoteHost: remoteConfig.remoteHost,
        remotePort: remoteConfig.remotePort,
        localRoot: remoteConfig.localRoot || workspaceFolder,
        remoteRoot: remoteConfig.remoteRoot
      })

      const client = new DAPClient(transport)
      await client.start()
      return { client }
    }

    // Try to create transport via AdapterManager
    try {
      const transport = await adapterManager.createTransport(adapterType, workspaceFolder)
      const client = new DAPClient(transport)
      await client.start()
      return { client }
    } catch (err) {
      // Fallback for Node.js
      if (config.type === 'node') {
        return await this.startNodeDebugAdapter(config, workspaceFolder)
      }
      throw err
    }
  }

  private async startNodeDebugAdapter(_config: DebugConfig, _workspaceFolder: string): Promise<{ client: DAPClient; process?: ChildProcess }> {
    // Fallback: Create a stdio transport for the Node.js debug adapter
    const transport: ITransport = new StdioTransport({
      adapterPath: 'node',
      adapterArgs: ['--inspect-brk']
    })

    const client = new DAPClient(transport)

    // Start the adapter
    await client.start()

    return { client }
  }

  // ============ Adapter Management Methods ============

  /**
   * Get available debug adapters
   */
  async getAvailableAdapters(): Promise<AdapterInfo[]> {
    const adapterManager = getAdapterManager()
    return adapterManager.getAvailableAdapters()
  }

  /**
   * Get installed debug adapters
   */
  async getInstalledAdapters(): Promise<AdapterInfo[]> {
    const adapterManager = getAdapterManager()
    return adapterManager.getInstalledAdapters()
  }

  /**
   * Detect debuggers for a workspace
   */
  async detectDebuggers(workspaceFolder: string): Promise<DetectedDebugger[]> {
    const adapterManager = getAdapterManager()
    return adapterManager.detectDebuggers(workspaceFolder)
  }

  private setupClientEventHandlers(sessionId: string, client: DAPClient): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return

    client.on('stopped', async (event) => {
      const session = entry.session
      session.state = 'stopped' as SessionState
      session.currentThreadId = event.threadId

      // Get stack trace
      if (event.threadId) {
        const { stackFrames } = await client.stackTrace(event.threadId)
        if (stackFrames.length > 0) {
          session.currentFrameId = stackFrames[0].id
        }
        this.emit('stackTraceUpdated', sessionId, event.threadId, stackFrames)
      }

      // Refresh watches
      await this.refreshAllWatches()

      this.emit('stopped', sessionId, event.reason, event.threadId, event.allThreadsStopped)
      this.emit('sessionStateChanged', sessionId, session.state)
      this.sendToRenderer('debug:stopped', {
        sessionId,
        reason: event.reason,
        threadId: event.threadId,
        allThreadsStopped: event.allThreadsStopped
      })
    })

    client.on('continued', (event) => {
      entry.session.state = 'running' as SessionState
      this.emit('continued', sessionId, event.threadId, event.allThreadsContinued)
      this.emit('sessionStateChanged', sessionId, entry.session.state)
      this.sendToRenderer('debug:continued', {
        sessionId,
        threadId: event.threadId,
        allThreadsContinued: event.allThreadsContinued
      })
    })

    client.on('terminated', () => {
      entry.session.state = 'terminated' as SessionState
      this.emit('sessionTerminated', sessionId)
      this.emit('sessionStateChanged', sessionId, entry.session.state)
      this.sendToRenderer('debug:sessionTerminated', sessionId)
    })

    client.on('output', (event) => {
      this.emit('output', sessionId, event.category || 'console', event.output, event.source, event.line)
      this.addConsoleMessage(
        sessionId,
        event.category === 'stderr' ? 'error' : 'output',
        event.output,
        event.source?.path,
        event.line
      )
    })

    client.on('breakpoint', (event) => {
      const bp = event.breakpoint
      if (bp.source?.path && bp.line) {
        const fileBps = this.breakpoints.get(bp.source.path) || []
        const existing = fileBps.find(b => b.line === bp.line)
        if (existing) {
          existing.verified = bp.verified ?? false
          this.emit('breakpointValidated', existing)
          this.sendToRenderer('debug:breakpointValidated', existing)
        }
      }
    })

    client.on('thread', async (_event) => {
      const threads = await client.threads()
      entry.session.threads = threads
      this.emit('threadsUpdated', sessionId, threads)
      this.sendToRenderer('debug:threadsUpdated', { sessionId, threads })
    })

    client.on('exit', () => {
      this.stopSession(sessionId)
    })
  }

  private async syncBreakpointsToAdapter(sessionId: string): Promise<void> {
    for (const filePath of this.breakpoints.keys()) {
      await this.syncBreakpointsToAdapterForFile(filePath, sessionId)
    }
  }

  private async syncBreakpointsToAdapterForFile(filePath: string, sessionId?: string): Promise<void> {
    const entry = this.getSessionEntry(sessionId)
    if (!entry) return

    const breakpoints = this.breakpoints.get(filePath) || []
    const enabledBps = breakpoints.filter(bp => bp.enabled)

    const source: Source = { path: filePath }
    const sourceBps: SourceBreakpoint[] = enabledBps.map(bp => ({
      line: bp.line,
      column: bp.column,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage
    }))

    try {
      const verifiedBps = await entry.client.setBreakpoints(source, sourceBps)

      // Update verification status
      for (let i = 0; i < enabledBps.length; i++) {
        if (verifiedBps[i]) {
          enabledBps[i].verified = verifiedBps[i].verified ?? false
          if (verifiedBps[i].line) {
            enabledBps[i].line = verifiedBps[i].line!
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync breakpoints:', error)
    }
  }

  private prepareLaunchArgs(config: LaunchConfig, workspaceFolder: string): object {
    return this.configManager.prepareLaunchArgs(config, workspaceFolder)
  }

  private prepareAttachArgs(config: AttachConfig, workspaceFolder: string): object {
    return this.configManager.prepareAttachArgs(config, workspaceFolder)
  }

  /**
   * Execute a preLaunchTask before starting the debug session.
   * Supports "npm: <script>" format and raw shell commands.
   */
  private async executePreLaunchTask(task: string, workspaceFolder: string): Promise<void> {
    const npmMatch = task.match(/^npm:\s*(.+)$/)
    const command = npmMatch ? `npm run ${npmMatch[1].trim()}` : task

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(command, [], {
        cwd: workspaceFolder,
        shell: true,
        stdio: 'pipe'
      })

      let stderr = ''
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.stdout?.on('data', (data: Buffer) => {
        this.sendToRenderer('debug:taskProgress', { task, output: data.toString() })
      })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error(`preLaunchTask "${task}" timed out after 120 seconds`))
      }, 120_000)

      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`preLaunchTask "${task}" failed with exit code ${code}: ${stderr}`))
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        reject(new Error(`preLaunchTask "${task}" failed: ${err.message}`))
      })
    })
  }

  private addConsoleMessage(sessionId: string, type: 'input' | 'output' | 'error' | 'warning' | 'info', message: string, source?: string, line?: number): void {
    const msg: DebugConsoleMessage = {
      type,
      message,
      timestamp: Date.now(),
      source,
      line
    }
    this.emit('consoleMessage', sessionId, msg)
    this.sendToRenderer('debug:consoleMessage', { sessionId, message: msg })
  }

  private sendToRenderer(channel: string, data: unknown): void {
    const mainWindow = this.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // ============ Cleanup ============

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.stopSession(sessionId)
    }
  }
}

// Singleton instance
let debugServiceInstance: DebugService | null = null

export function getDebugService(getMainWindow: () => BrowserWindow | null): DebugService {
  if (!debugServiceInstance) {
    debugServiceInstance = new DebugService(getMainWindow)
  }
  return debugServiceInstance
}

export function cleanupDebugService(): void {
  if (debugServiceInstance) {
    debugServiceInstance.cleanup()
    debugServiceInstance = null
  }
}
