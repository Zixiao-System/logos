import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { app } from 'electron'

/**
 * ExtensionHostManager
 *
 * Manages the lifecycle of the VS Code Extension Host process.
 * This is a stub implementation for Phase 1 of the Extension Host PoC.
 *
 * Responsibilities:
 * - Launch and shutdown the extension host child process
 * - Route IPC messages between main process and extension host
 * - Handle workspace root changes and file system events
 * - Provide RPC request/response mechanism
 *
 * TODO (Phase 1):
 * - Implement actual Extension Host process launch logic
 * - Add RPC protocol implementation (JSON-RPC 2.0)
 * - Connect file system change events
 * - Test with target extensions (Prettier, ESLint, Go)
 */

interface HostMessage {
  type: string
  [key: string]: unknown
}

interface HostEvent {
  type: string
  [key: string]: unknown
}

export class ExtensionHostManager {
  private process: ChildProcess | null = null
  private workspaceRoot: string | null = null
  private extensionsDir: string
  private isDevelopment: boolean
  private messageHandlers: Map<string, (msg: HostMessage) => void> = new Map()
  private rpcCallbacks: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map()
  private nextRequestId = 0

  constructor(options: { isDevelopment: boolean }) {
    this.isDevelopment = options.isDevelopment
    this.extensionsDir = resolve(app.getPath('userData'), 'extensions')
  }

  /**
   * Start the extension host process.
   * @param workspaceRoot Path to the workspace root directory
   */
  async start(workspaceRoot: string): Promise<void> {
    if (this.process) {
      console.warn('[ExtensionHostManager] Process already running, skipping start')
      return
    }

    this.workspaceRoot = workspaceRoot

    // TODO (Phase 1): Implement extension host process startup
    // For now, this is a stub that does nothing
    console.log('[ExtensionHostManager] Starting extension host', {
      workspaceRoot,
      extensionsDir: this.extensionsDir,
      isDevelopment: this.isDevelopment
    })

    // Keep stubs referenced until the actual process wiring lands.
    void this.handleHostMessage
    void this.onProcessError

    // Planned implementation:
    // this.process = fork(
    //   resolve(__dirname, 'extension-host-process.js'),
    //   [],
    //   {
    //     env: {
    //       ...process.env,
    //       LOGOS_WORKSPACE_ROOT: workspaceRoot,
    //       LOGOS_EXTENSIONS_DIR: this.extensionsDir,
    //       NODE_ENV: this.isDevelopment ? 'development' : 'production'
    //     },
    //     silent: false,
    //     stdio: ['inherit', 'pipe', 'pipe', 'ipc']
    //   }
    // )
    //
    // this.process.on('message', (msg) => this.handleHostMessage(msg))
    // this.process.on('error', (err) => {
    //   console.error('[ExtensionHostManager] Process error:', err)
    //   this.onProcessError(err)
    // })
    // this.process.on('exit', (code) => {
    //   console.log('[ExtensionHostManager] Process exited with code:', code)
    //   this.process = null
    // })
  }

  /**
   * Shutdown the extension host process gracefully.
   */
  async shutdown(): Promise<void> {
    if (!this.process) {
      return
    }

    console.log('[ExtensionHostManager] Shutting down extension host')

    // TODO (Phase 1): Implement graceful shutdown with timeout
    // Send shutdown message to extension host
    // Wait for process to exit (with timeout)
    // Force kill if necessary

    try {
      // Placeholder: in real implementation, send 'shutdown' message
      // this.process.send({ type: 'shutdown' })

      // Wait for process to exit with timeout (3 seconds)
      // const exitPromise = new Promise<void>((resolve) => {
      //   this.process!.once('exit', () => resolve())
      // })
      // await Promise.race([
      //   exitPromise,
      //   new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timeout')), 3000))
      // ])
    } catch (error) {
      console.warn('[ExtensionHostManager] Shutdown timeout, force killing process')
      this.process?.kill('SIGKILL')
    }

    this.process = null
  }

  /**
   * Set the workspace root for extensions.
   * Triggers workspace change events in extensions.
   */
  setWorkspaceRoot(root: string | null): void {
    this.workspaceRoot = root

    if (!this.process) {
      console.warn('[ExtensionHostManager] Process not running, cannot set workspace root')
      return
    }

    // TODO (Phase 1): Send workspace root change message to extension host
    console.log('[ExtensionHostManager] Workspace root changed:', root)
    // this.process.send({
    //   type: 'setWorkspaceRoot',
    //   root
    // })
  }

  /**
   * Notify extension host of a file change event.
   */
  notifyFileChange(event: { uri: string; type: 'create' | 'change' | 'delete' }): void {
    if (!this.process) {
      return
    }

    void event

    // TODO (Phase 1): Send file change message to extension host
    // this.process.send({
    //   type: 'fileChange',
    //   event
    // })
  }

  /**
   * Execute a remote procedure call on the extension host.
   * @param method RPC method name (e.g., 'extensionHost.$provideCompletions')
   * @param params RPC parameters
   * @returns RPC result
   */
  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.process) {
      throw new Error('[ExtensionHostManager] Process not running')
    }

    void params

    const requestId = `req-${++this.nextRequestId}`

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rpcCallbacks.delete(requestId)
        reject(new Error(`[ExtensionHostManager] RPC timeout: ${method}`))
      }, 30000) // 30 second timeout

      this.rpcCallbacks.set(requestId, {
        resolve,
        reject,
        timeout
      })

      // TODO (Phase 1): Send RPC request to extension host
      // this.process!.send({
      //   jsonrpc: '2.0',
      //   id: requestId,
      //   method,
      //   params
      // })
    })
  }

  /**
   * Register a message handler for a specific message type.
   */
  onMessage(type: string, handler: (msg: HostMessage) => void): () => void {
    this.messageHandlers.set(type, handler)

    return () => {
      this.messageHandlers.delete(type)
    }
  }

  /**
   * Handle messages from extension host process.
   * @internal
   */
  private handleHostMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') {
      return
    }

    const typedMsg = msg as HostMessage

    // Handle RPC responses
    if (typedMsg.type === 'rpcResponse') {
      this.handleRpcResponse(typedMsg as HostEvent)
      return
    }

    // Handle other message types
    const handler = this.messageHandlers.get(typedMsg.type as string)
    if (handler) {
      handler(typedMsg)
    }
  }

  /**
   * Handle RPC response from extension host.
   * @internal
   */
  private handleRpcResponse(event: HostEvent): void {
    const requestId = event.requestId as string
    const callback = this.rpcCallbacks.get(requestId)

    if (!callback) {
      console.warn('[ExtensionHostManager] Received response for unknown request:', requestId)
      return
    }

    clearTimeout(callback.timeout)
    this.rpcCallbacks.delete(requestId)

    if (event.ok) {
      callback.resolve(event.payload)
    } else {
      callback.reject(new Error(event.error as string))
    }
  }

  /**
   * Handle process error.
   * @internal
   */
  private onProcessError(error: Error): void {
    console.error('[ExtensionHostManager] Process error:', error)
    // TODO (Phase 1): Implement error recovery (auto-restart, etc.)
  }

  /**
   * Get whether the extension host is running.
   */
  isRunning(): boolean {
    return this.process != null
  }

  /**
   * Get the current workspace root.
   */
  getWorkspaceRoot(): string | null {
    return this.workspaceRoot
  }

  /**
   * Get the extensions directory.
   */
  getExtensionsDir(): string {
    return this.extensionsDir
  }
}
