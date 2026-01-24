import { registerVscodeModule } from './extension-host/vscode'
import { ExtensionHost } from './extension-host/loader'

type HostMessage =
  | { type: 'ping' }
  | { type: 'shutdown' }
  | { type: 'setWorkspaceRoot'; root?: string | null }
  | { type: 'reloadExtensions' }

type HostEvent =
  | { type: 'ready'; pid: number }
  | { type: 'pong'; pid: number }

registerVscodeModule()

const extensionsRoot = process.env.LOGOS_EXTENSIONS_DIR || ''
const host = new ExtensionHost(extensionsRoot)
host.start().catch((error) => {
  console.error('[extension-host] startup failed:', error)
})

function sendEvent(event: HostEvent): void {
  if (process.send) {
    process.send(event)
  }
}

process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object') {
    return
  }

  const typedMessage = message as HostMessage

  switch (typedMessage.type) {
    case 'ping':
      sendEvent({ type: 'pong', pid: process.pid })
      break
    case 'shutdown':
      host.shutdown().finally(() => {
        process.exit(0)
      })
      break
    case 'setWorkspaceRoot':
      host.setWorkspaceRoot(typedMessage.root ?? null)
      break
    case 'reloadExtensions':
      host.reload().catch((error) => {
        console.error('[extension-host] reload failed:', error)
      })
      break
    default:
      break
  }
})

sendEvent({ type: 'ready', pid: process.pid })
