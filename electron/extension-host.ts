/**
 * Extension Host Process Stub
 *
 * This is the entry point for the VS Code Extension Host child process.
 * It receives IPC messages from the main process and delegates to the ExtensionHost.
 *
 * This is a Phase 1 stub implementation.
 *
 * TODO (Phase 1):
 * - Complete ExtensionHost implementation
 * - Implement message handlers for all RPC types
 * - Add error handling and logging
 * - Add graceful shutdown logic
 *
 * Message Flow:
 *   Main Process -> Fork -> extension-host.ts -> ExtensionHost
 *        ^                                           |
 *        |___________ IPC messages (bi-directional) |
 */

/**
 * Type definitions for host messages from main process
 */
type HostMessage =
  | { type: 'ping' }
  | { type: 'shutdown' }
  | { type: 'setWorkspaceRoot'; root?: string | null }
  | { type: 'reloadExtensions' }

/**
 * Type definitions for host events sent to main process
 */
type HostEvent =
  | { type: 'ready'; pid: number }
  | { type: 'pong'; pid: number }
  | { type: 'rpcResponse'; requestId: string; ok: boolean; payload?: unknown; error?: string }

/**
 * Send event to main process
 */
function sendEvent(event: HostEvent): void {
  if (process.send) {
    process.send(event)
  }
}

/**
 * Log function for extension host process
 */
function log(message: string, ...args: any[]): void {
  console.log(`[extension-host] ${message}`, ...args)
}

// ============================================================================
// Phase 1 Stub Implementation
// ============================================================================

// TODO (Phase 1): Initialize vscode module shim
// import { vscodeModule } from './extension-host/vscode-api-stub'

// TODO (Phase 1): Initialize ExtensionHost
// const extensionsRoot = process.env.LOGOS_EXTENSIONS_DIR || ''
// const host = new ExtensionHost(extensionsRoot)

// TODO (Phase 1): Start loading extensions
// host.start().catch((error) => {
//   logError('startup failed:', error)
//   process.exit(1)
// })

log('Extension Host process started (pid: %d)', process.pid)
log('LOGOS_WORKSPACE_ROOT:', process.env.LOGOS_WORKSPACE_ROOT)
log('LOGOS_EXTENSIONS_DIR:', process.env.LOGOS_EXTENSIONS_DIR)

// Send ready signal to main process
sendEvent({ type: 'ready', pid: process.pid })

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle messages from main process
 */
process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') {
    return
  }

  const typedMessage = message as HostMessage

  switch (typedMessage.type) {
    case 'ping':
      log('Received ping from main process')
      sendEvent({ type: 'pong', pid: process.pid })
      break

    case 'shutdown':
      log('Received shutdown signal, exiting...')
      // TODO (Phase 1): Graceful shutdown logic
      // host.shutdown().then(() => {
      //   log('Shutdown complete')
      //   process.exit(0)
      // }).catch((error) => {
      //   logError('Shutdown error:', error)
      //   process.exit(1)
      // })
      process.exit(0)
      break

    case 'setWorkspaceRoot':
      log('Workspace root changed:', typedMessage.root)
      // TODO (Phase 1): Update workspace root in ExtensionHost
      // host.setWorkspaceRoot(typedMessage.root ?? null)
      break
    case 'reloadExtensions':
      log('Received extension reload request')
      // TODO (Phase 1): Reload extensions
      break

    default:
      log('Received unknown message type:', (typedMessage as any).type)
      break
  }
})

// Log completion
log('Extension Host IPC listener registered')
