type WindowMessageLevel = 'info' | 'warning' | 'error'

type CommandHandler = (...args: unknown[]) => unknown

class Disposable {
  private onDispose?: () => void

  constructor(onDispose?: () => void) {
    this.onDispose = onDispose
  }

  dispose(): void {
    if (this.onDispose) {
      this.onDispose()
      this.onDispose = undefined
    }
  }
}

const commandRegistry = new Map<string, CommandHandler>()

const configurationStore = new Map<string, Map<string, unknown>>()

let workspaceRoot = process.env.LOGOS_WORKSPACE_ROOT || ''

function sendWindowMessage(level: WindowMessageLevel, message: string): void {
  if (process.send) {
    process.send({ type: 'window:message', level, message })
  }
}

class WorkspaceConfiguration {
  private section: string

  constructor(section: string) {
    this.section = section
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const sectionStore = configurationStore.get(this.section)
    if (!sectionStore) {
      return defaultValue
    }
    return (sectionStore.get(key) as T | undefined) ?? defaultValue
  }

  update(key: string, value: unknown): Promise<void> {
    const sectionStore = configurationStore.get(this.section) ?? new Map<string, unknown>()
    sectionStore.set(key, value)
    configurationStore.set(this.section, sectionStore)
    return Promise.resolve()
  }
}

const commands = {
  registerCommand: (command: string, callback: CommandHandler): Disposable => {
    commandRegistry.set(command, callback)
    return new Disposable(() => {
      commandRegistry.delete(command)
    })
  },
  executeCommand: async <T>(command: string, ...args: unknown[]): Promise<T> => {
    const handler = commandRegistry.get(command)
    if (!handler) {
      throw new Error(`Command not found: ${command}`)
    }
    return handler(...args) as T
  }
}

const windowApi = {
  showInformationMessage: async (message: string): Promise<void> => {
    sendWindowMessage('info', message)
  },
  showWarningMessage: async (message: string): Promise<void> => {
    sendWindowMessage('warning', message)
  },
  showErrorMessage: async (message: string): Promise<void> => {
    sendWindowMessage('error', message)
  },
  showInputBox: async (): Promise<string | undefined> => {
    sendWindowMessage('info', 'showInputBox is not implemented yet.')
    return undefined
  },
  createOutputChannel: (name: string) => {
    return {
      name,
      append: (value: string) => {
        if (value) {
          console.log(`[output:${name}] ${value}`)
        }
      },
      appendLine: (value: string) => {
        console.log(`[output:${name}] ${value}`)
      },
      clear: () => {
        console.log(`[output:${name}] cleared`)
      },
      show: () => {
        console.log(`[output:${name}] show`)
      },
      dispose: () => {
        console.log(`[output:${name}] disposed`)
      }
    }
  },
  createTerminal: (options?: { name?: string }) => {
    const terminalName = options?.name || 'Terminal'
    return {
      name: terminalName,
      sendText: (text: string) => {
        console.log(`[terminal:${terminalName}] ${text}`)
      },
      show: () => {
        console.log(`[terminal:${terminalName}] show`)
      },
      dispose: () => {
        console.log(`[terminal:${terminalName}] disposed`)
      }
    }
  }
}

const workspaceApi = {
  get rootPath(): string | undefined {
    return workspaceRoot || undefined
  },
  get workspaceFolders(): Array<{ uri: { fsPath: string } }> | undefined {
    if (!workspaceRoot) {
      return undefined
    }
    return [{ uri: { fsPath: workspaceRoot } }]
  },
  getConfiguration: (section?: string): WorkspaceConfiguration => {
    return new WorkspaceConfiguration(section ?? '')
  },
  findFiles: async (): Promise<string[]> => {
    return []
  }
}

const vscodeApi = {
  commands,
  window: windowApi,
  workspace: workspaceApi,
  Disposable
}

let moduleRegistered = false

export function registerVscodeModule(): void {
  if (moduleRegistered) {
    return
  }
  moduleRegistered = true
  const Module = require('module') as {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown
  }
  const originalLoad = Module._load
  Module._load = function (request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === 'vscode') {
      return vscodeApi
    }
    return originalLoad(request, parent, isMain)
  }
}

export function setWorkspaceRoot(root: string | null): void {
  workspaceRoot = root ?? ''
}

export { vscodeApi }
