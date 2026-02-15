/**
 * Debug Session - Per-session lifecycle and DAP interaction wrapper
 * Manages a single debug session's lifecycle, event handling, and DAP commands
 */
import { EventEmitter } from 'events'
import { DAPClient } from './DAPClient'
import type {
  DebugSession as DebugSessionInfo,
  DebugConfig,
  SessionState,
  Capabilities,
  StackFrame,
  Scope,
  Variable,
  Thread,
  EvaluateResult,
  Source,
  SourceBreakpoint
} from './types'

export class DebugSessionInstance extends EventEmitter {
  readonly id: string
  readonly config: DebugConfig
  readonly workspaceFolder: string
  readonly client: DAPClient

  private _state: SessionState = 'initializing' as SessionState
  private _capabilities?: Capabilities
  private _currentThreadId?: number
  private _currentFrameId?: number
  private _threads: Thread[] = []

  constructor(id: string, config: DebugConfig, workspaceFolder: string, client: DAPClient) {
    super()
    this.id = id
    this.config = config
    this.workspaceFolder = workspaceFolder
    this.client = client
  }

  // ============ State Accessors ============

  get state(): SessionState {
    return this._state
  }

  get capabilities(): Capabilities | undefined {
    return this._capabilities
  }

  get currentThreadId(): number | undefined {
    return this._currentThreadId
  }

  set currentThreadId(id: number | undefined) {
    this._currentThreadId = id
  }

  get currentFrameId(): number | undefined {
    return this._currentFrameId
  }

  set currentFrameId(id: number | undefined) {
    this._currentFrameId = id
  }

  get threads(): Thread[] {
    return this._threads
  }

  set threads(threads: Thread[]) {
    this._threads = threads
  }

  /**
   * Get serializable session info for IPC
   */
  get info(): DebugSessionInfo {
    return {
      id: this.id,
      name: this.config.name,
      type: this.config.type,
      state: this._state,
      config: this.config,
      capabilities: this._capabilities,
      threads: this._threads,
      currentThreadId: this._currentThreadId,
      currentFrameId: this._currentFrameId
    }
  }

  // ============ Lifecycle ============

  /**
   * Initialize the debug adapter
   */
  async initialize(): Promise<Capabilities> {
    const capabilities = await this.client.initialize(this.config.type)
    this._capabilities = capabilities
    return capabilities
  }

  /**
   * Launch or attach based on config
   */
  async launchOrAttach(resolvedArgs: object): Promise<void> {
    if (this.config.request === 'launch') {
      await this.client.launch(resolvedArgs)
    } else {
      await this.client.attach(resolvedArgs)
    }
  }

  /**
   * Signal configuration is done
   */
  async configurationDone(): Promise<void> {
    await this.client.configurationDone()
    this._state = 'running' as SessionState
    this.emit('stateChanged', this.id, this._state)
  }

  /**
   * Stop the session — disconnect for attach, terminate for launch
   */
  async stop(): Promise<void> {
    try {
      if (this._state !== 'terminated') {
        if (this.config.request === 'attach') {
          await this.client.disconnect(false, false)
        } else {
          await this.client.terminate()
        }
      }
    } catch {
      // Ignore errors during termination
    }

    this.client.stop()
    this._state = 'terminated' as SessionState
    this.emit('stateChanged', this.id, this._state)
  }

  /**
   * Disconnect from the debuggee without terminating
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect(false, false)
    } catch {
      // Ignore errors during disconnect
    }

    this.client.stop()
    this._state = 'terminated' as SessionState
    this.emit('stateChanged', this.id, this._state)
  }

  /**
   * Restart the session via DAP restart request
   */
  async restart(): Promise<void> {
    await this.client.restart()
    this._state = 'running' as SessionState
    this.emit('stateChanged', this.id, this._state)
  }

  // ============ Execution Control ============

  async continue(): Promise<void> {
    const threadId = this._currentThreadId ?? 1
    await this.client.continue(threadId)
  }

  async pause(): Promise<void> {
    const threadId = this._currentThreadId ?? 1
    await this.client.pause(threadId)
  }

  async stepOver(): Promise<void> {
    const threadId = this._currentThreadId ?? 1
    await this.client.next(threadId)
  }

  async stepInto(): Promise<void> {
    const threadId = this._currentThreadId ?? 1
    await this.client.stepIn(threadId)
  }

  async stepOut(): Promise<void> {
    const threadId = this._currentThreadId ?? 1
    await this.client.stepOut(threadId)
  }

  async restartFrame(frameId: number): Promise<void> {
    await this.client.restartFrame(frameId)
  }

  // ============ Data Queries ============

  async getThreads(): Promise<Thread[]> {
    const threads = await this.client.threads()
    this._threads = threads
    return threads
  }

  async getStackTrace(threadId: number): Promise<StackFrame[]> {
    const { stackFrames } = await this.client.stackTrace(threadId)
    return stackFrames
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    return await this.client.scopes(frameId)
  }

  async getVariables(variablesReference: number): Promise<Variable[]> {
    return await this.client.variables(variablesReference)
  }

  async setVariable(variablesReference: number, name: string, value: string): Promise<Variable | null> {
    return await this.client.setVariable(variablesReference, name, value)
  }

  async evaluate(expression: string, frameId?: number, context?: 'watch' | 'repl' | 'hover'): Promise<EvaluateResult | null> {
    const frame = frameId ?? this._currentFrameId
    return await this.client.evaluate(expression, frame, context)
  }

  async getCompletions(text: string, column: number, frameId?: number): Promise<Array<{ label: string; text?: string; type?: string }>> {
    const items = await this.client.completions(text, column, frameId)
    return items.map(item => ({ label: item.label, text: item.text, type: item.type }))
  }

  // ============ Breakpoint Sync ============

  async setBreakpoints(source: Source, breakpoints: SourceBreakpoint[]): Promise<Array<{ verified: boolean; line?: number; message?: string }>> {
    return await this.client.setBreakpoints(source, breakpoints)
  }

  async setFunctionBreakpoints(breakpoints: Array<{ name: string; condition?: string; hitCondition?: string }>): Promise<Array<{ verified: boolean; message?: string }>> {
    const result = await this.client.setFunctionBreakpoints(breakpoints)
    return result.map(bp => ({ verified: bp.verified, message: bp.message }))
  }

  async setExceptionBreakpoints(filters: string[], filterOptions?: Array<{ filterId: string; condition?: string }>): Promise<void> {
    await this.client.setExceptionBreakpoints(filters, filterOptions)
  }

  // ============ Frame Selection ============

  selectFrame(frameId: number): void {
    this._currentFrameId = frameId
  }

  // ============ Event Setup ============

  /**
   * Set up DAP event handlers that emit on this session instance
   */
  setupEventHandlers(): void {
    this.client.on('stopped', async (event) => {
      this._state = 'stopped' as SessionState
      this._currentThreadId = event.threadId

      // Get stack trace for stopped thread
      if (event.threadId) {
        const { stackFrames } = await this.client.stackTrace(event.threadId)
        if (stackFrames.length > 0) {
          this._currentFrameId = stackFrames[0].id
        }
        this.emit('stackTraceUpdated', this.id, event.threadId, stackFrames)
      }

      this.emit('stopped', this.id, event.reason, event.threadId, event.allThreadsStopped)
      this.emit('stateChanged', this.id, this._state)
    })

    this.client.on('continued', (event) => {
      this._state = 'running' as SessionState
      this.emit('continued', this.id, event.threadId, event.allThreadsContinued)
      this.emit('stateChanged', this.id, this._state)
    })

    this.client.on('terminated', () => {
      this._state = 'terminated' as SessionState
      this.emit('terminated', this.id)
      this.emit('stateChanged', this.id, this._state)
    })

    this.client.on('output', (event) => {
      this.emit('output', this.id, event.category || 'console', event.output, event.source, event.line)
    })

    this.client.on('breakpoint', (event) => {
      this.emit('breakpoint', this.id, event.breakpoint)
    })

    this.client.on('thread', async () => {
      const threads = await this.client.threads()
      this._threads = threads
      this.emit('thread', this.id, threads)
    })

    this.client.on('exit', () => {
      this.emit('exit', this.id)
    })
  }
}
