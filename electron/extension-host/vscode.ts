/**
 * VS Code API shim for the extension host loader.
 *
 * This file provides minimal plumbing around the Phase 1 stub APIs so the
 * loader can track activation state and workspace context.
 */

import path from 'path'
import { EventEmitter, Uri, workspace, vscodeModule, __internalRegisterExtension, __internalSetCommandActivationHandler, __internalUpdateExtensionActivation } from './vscode-api-stub'

type CommandActivationHandler = (command: string) => Promise<void> | void

interface ExtensionDescription {
  extensionPath: string
  manifest: Record<string, unknown>
}

interface ExtensionActivationState {
  active: boolean
  exports?: unknown
}

const extensionDescriptions = new Map<string, ExtensionDescription>()
const extensionActivation = new Map<string, ExtensionActivationState>()
let commandActivationHandler: CommandActivationHandler | null = null

export const vscodeApi = vscodeModule

export function setWorkspaceRoot(root: string | null): void {
  workspace.rootPath = root ?? undefined
  if (root) {
    workspace.name = path.basename(root)
    workspace.workspaceFolders = [{ uri: Uri.file(root), name: workspace.name, index: 0 }]
  } else {
    workspace.name = undefined
    workspace.workspaceFolders = undefined
  }
}

export function setCommandActivationHandler(handler: CommandActivationHandler): void {
  commandActivationHandler = handler
  __internalSetCommandActivationHandler(handler)
}

export function registerExtensionDescription(id: string, extensionPath: string, manifest: Record<string, unknown>): void {
  extensionDescriptions.set(id, { extensionPath, manifest })
  __internalRegisterExtension({ id, extensionPath, manifest })
}

export function updateExtensionActivation(id: string, active: boolean, exportsValue?: unknown): void {
  extensionActivation.set(id, { active, exports: exportsValue })
  __internalUpdateExtensionActivation({ id, active, exportsValue })
}

function createMemento(): {
  get: <T>(key: string, defaultValue?: T) => T | undefined
  update: (key: string, value: unknown) => Promise<void>
} {
  const store = new Map<string, unknown>()
  return {
    get: <T>(key: string, defaultValue?: T) => {
      if (store.has(key)) {
        return store.get(key) as T
      }
      return defaultValue
    },
    update: async (key: string, value: unknown) => {
      store.set(key, value)
    }
  }
}

export function createExtensionContext(storagePath: string): {
  globalState: ReturnType<typeof createMemento>
  workspaceState: ReturnType<typeof createMemento>
  secrets: {
    get: (key: string) => Promise<string | undefined>
    store: (key: string, value: string) => Promise<void>
    delete: (key: string) => Promise<void>
  }
} {
  const globalState = createMemento()
  const workspaceState = createMemento()
  const secretStore = new Map<string, string>()
  const onDidChange = new EventEmitter<{ key: string }>()

  void storagePath
  void commandActivationHandler

  return {
    globalState,
    workspaceState,
    secrets: {
      get: async (key: string) => secretStore.get(key),
      store: async (key: string, value: string) => {
        secretStore.set(key, value)
        onDidChange.fire({ key })
      },
      delete: async (key: string) => {
        secretStore.delete(key)
        onDidChange.fire({ key })
      }
    }
  }
}
