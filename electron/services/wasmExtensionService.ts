/**
 * WASM Extension Service
 *
 * Implements the IDE Extension Standard for running WASM-based extensions.
 * This service provides a sandboxed runtime for WebAssembly extensions
 * with capability-based permissions.
 *
 * Features:
 * - WASI Preview 1 support via Node.js wasi module
 * - Memory management for string/data passing
 * - Capability-based permission model
 * - Extension lifecycle management
 *
 * @see https://github.com/zixiao-labs/WebAssembly-IDEs-Extension-standard
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { WASI } from 'node:wasi'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Semantic version */
export interface Version {
  major: number
  minor: number
  patch: number
  prerelease?: string
}

/** Extension manifest (extension.json) */
export interface WasmExtensionManifest {
  name: string
  displayName?: string
  description?: string
  version: string
  publisher?: string
  license?: string
  repository?: string
  homepage?: string
  icon?: string
  runtime: 'wasm32-wasi'
  main: string
  standardVersion: string
  categories?: string[]
  permissions?: string[]
  activationEvents?: string[]
  contributes?: {
    commands?: CommandContribution[]
    menus?: Record<string, MenuItemContribution[]>
    keybindings?: KeybindingContribution[]
    languages?: LanguageContribution[]
  }
}

export interface CommandContribution {
  id: string
  title: string
  category?: string
  icon?: string
}

export interface MenuItemContribution {
  command: string
  group?: string
  when?: string
  order?: number
}

export interface KeybindingContribution {
  command: string
  key: string
  mac?: string
  linux?: string
  win?: string
  when?: string
}

export interface LanguageContribution {
  id: string
  aliases?: string[]
  extensions?: string[]
  filenames?: string[]
  configuration?: string
}

/** Permission grant status */
export interface PermissionGrant {
  permission: string
  granted: boolean
  grantedAt?: number
}

/** Registered command from extension */
interface RegisteredCommand {
  id: string
  title: string
  category?: string
  extensionId: string
}

/** Loaded WASM extension instance */
export interface WasmExtensionInstance {
  id: string
  manifest: WasmExtensionManifest
  installPath: string
  permissions: PermissionGrant[]
  state: 'installed' | 'activated' | 'deactivated' | 'error'
  wasmModule?: WebAssembly.Module
  wasmInstance?: WebAssembly.Instance
  wasi?: InstanceType<typeof WASI>
  memory?: WebAssembly.Memory
  registeredCommands: RegisteredCommand[]
  error?: string
}

/** Extension activation event */
export type ActivationEvent =
  | { type: 'startup' }
  | { type: 'language'; languageId: string }
  | { type: 'command'; commandId: string }
  | { type: 'workspaceContains'; pattern: string }
  | { type: 'fileOpen'; pattern: string }

// ─────────────────────────────────────────────────────────────────────────────
// Global State
// ─────────────────────────────────────────────────────────────────────────────

/** Installed WASM extensions */
const wasmExtensions = new Map<string, WasmExtensionInstance>()

/** Permission decisions (persisted) */
let permissionDecisions: Record<string, Record<string, boolean>> = {}

/** Extension storage directory */
let extensionsDir: string

/** Current workspace root */
let workspaceRoot: string | null = null

/** Get main window callback */
let getMainWindow: (() => BrowserWindow | null) | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Memory Management Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a UTF-8 string from WASM memory
 */
function readString(memory: WebAssembly.Memory, ptr: number, len: number): string {
  const buffer = new Uint8Array(memory.buffer, ptr, len)
  return new TextDecoder('utf-8').decode(buffer)
}

/**
 * Write a UTF-8 string to WASM memory (requires malloc export)
 * Returns [ptr, len]
 */
function writeString(
  instance: WebAssembly.Instance,
  memory: WebAssembly.Memory,
  str: string
): [number, number] {
  const encoded = new TextEncoder().encode(str)
  const len = encoded.length

  // Try to use extension's allocator
  const malloc = instance.exports.malloc as ((size: number) => number) | undefined
  if (!malloc) {
    console.warn('[WASM] Extension does not export malloc, cannot write string')
    return [0, 0]
  }

  const ptr = malloc(len)
  if (ptr === 0) {
    console.warn('[WASM] malloc returned null')
    return [0, 0]
  }

  const buffer = new Uint8Array(memory.buffer, ptr, len)
  buffer.set(encoded)

  return [ptr, len]
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission Checking
// ─────────────────────────────────────────────────────────────────────────────

/** Permission categories and their risk levels */
const PERMISSION_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high' | 'dangerous'> = {
  'ui:notifications': 'low',
  'ui:commands': 'low',
  'language:hover': 'low',
  'language:completion': 'low',
  'workspace:read': 'medium',
  'editor:read': 'medium',
  'editor:write': 'medium',
  'storage:local': 'medium',
  'storage:global': 'medium',
  'workspace:write': 'high',
  'network:fetch': 'high',
  'network:websocket': 'high',
  'ui:webview': 'high',
}

/**
 * Check if a permission matches a granted permission pattern
 */
function permissionMatches(requested: string, granted: string): boolean {
  if (requested === granted) return true

  const grantedParts = granted.split(':')
  const requestedParts = requested.split(':')

  for (let i = 0; i < grantedParts.length; i++) {
    if (grantedParts[i] === '*') return true
    if (i >= requestedParts.length) return false
    if (grantedParts[i] !== requestedParts[i]) return false
  }

  return grantedParts.length <= requestedParts.length
}

/**
 * Check if an extension has a specific permission
 */
function hasPermission(extensionId: string, permission: string): boolean {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) return false

  return ext.permissions.some(
    p => p.granted && permissionMatches(permission, p.permission)
  )
}

/**
 * Get the risk level of a permission
 */
function getPermissionRiskLevel(permission: string): 'low' | 'medium' | 'high' | 'dangerous' {
  if (PERMISSION_RISK_LEVELS[permission]) {
    return PERMISSION_RISK_LEVELS[permission]
  }

  const parts = permission.split(':')
  if (parts.length >= 2) {
    const category = `${parts[0]}:${parts[1]}`
    if (PERMISSION_RISK_LEVELS[category]) {
      return PERMISSION_RISK_LEVELS[category]
    }
  }

  return 'medium'
}

/**
 * Validate a path is within workspace boundaries
 */
function isPathInWorkspace(filePath: string): boolean {
  if (!workspaceRoot) return false

  const normalizedPath = path.resolve(filePath)
  const normalizedRoot = path.resolve(workspaceRoot)

  return normalizedPath.startsWith(normalizedRoot + path.sep) ||
         normalizedPath === normalizedRoot
}

// ─────────────────────────────────────────────────────────────────────────────
// Host Functions (WIT Interface Implementations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create host functions for WASM imports.
 * These implement the IDE Extension Standard interfaces.
 */
function createHostFunctions(extensionId: string): WebAssembly.Imports {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  // Helper to get memory
  const getMemory = (): WebAssembly.Memory | null => ext.memory || null
  const getInstance = (): WebAssembly.Instance | null => ext.wasmInstance || null

  return {
    // ─────────────────────────────────────────────────────────────────────────
    // Core: Logging (always available)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:core/logging@0.1.0': {
      log: (level: number, messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return

        const message = readString(memory, messagePtr, messageLen)
        const levels = ['trace', 'debug', 'info', 'warn', 'error']
        const levelName = levels[level] || 'info'

        switch (levelName) {
          case 'trace': console.trace(`[${ext.manifest.name}]`, message); break
          case 'debug': console.debug(`[${ext.manifest.name}]`, message); break
          case 'info': console.info(`[${ext.manifest.name}]`, message); break
          case 'warn': console.warn(`[${ext.manifest.name}]`, message); break
          case 'error': console.error(`[${ext.manifest.name}]`, message); break
        }
      },
      trace: (messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return
        console.trace(`[${ext.manifest.name}]`, readString(memory, messagePtr, messageLen))
      },
      debug: (messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return
        console.debug(`[${ext.manifest.name}]`, readString(memory, messagePtr, messageLen))
      },
      info: (messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return
        console.info(`[${ext.manifest.name}]`, readString(memory, messagePtr, messageLen))
      },
      warn: (messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return
        console.warn(`[${ext.manifest.name}]`, readString(memory, messagePtr, messageLen))
      },
      error: (messagePtr: number, messageLen: number) => {
        const memory = getMemory()
        if (!memory) return
        console.error(`[${ext.manifest.name}]`, readString(memory, messagePtr, messageLen))
      },
      'get-level': () => 2, // info
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Context (always available)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:core/context@0.1.0': {
      'get-extension-info': (outPtr: number) => {
        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const info = JSON.stringify({
          id: ext.id,
          name: ext.manifest.displayName || ext.manifest.name,
          version: ext.manifest.version,
          publisher: ext.manifest.publisher || 'unknown',
        })

        const [ptr, len] = writeString(instance, memory, info)
        if (outPtr && ptr) {
          // Write ptr and len to outPtr
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'get-host-info': (outPtr: number) => {
        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const info = JSON.stringify({
          name: 'Logos',
          version: app.getVersion(),
          standardVersion: '0.1.0',
        })

        const [ptr, len] = writeString(instance, memory, info)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'get-extension-path': (outPtr: number) => {
        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const [ptr, len] = writeString(instance, memory, ext.installPath)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'get-storage-path': (outPtr: number) => {
        if (!hasPermission(extensionId, 'storage:local')) return 0

        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const storagePath = path.join(ext.installPath, '.storage')
        const [ptr, len] = writeString(instance, memory, storagePath)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'get-global-storage-path': (outPtr: number) => {
        if (!hasPermission(extensionId, 'storage:global')) return 0

        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const storagePath = path.join(extensionsDir, '.global-storage', ext.id)
        const [ptr, len] = writeString(instance, memory, storagePath)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'has-permission': (permissionPtr: number, permissionLen: number) => {
        const memory = getMemory()
        if (!memory) return 0

        const permission = readString(memory, permissionPtr, permissionLen)
        return hasPermission(extensionId, permission) ? 1 : 0
      },
      'get-permissions': (outPtr: number) => {
        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return 0

        const permissions = ext.permissions
          .filter(p => p.granted)
          .map(p => p.permission)
        const json = JSON.stringify(permissions)

        const [ptr, len] = writeString(instance, memory, json)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // UI: Notifications (requires ui:notifications)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:ui/notifications@0.1.0': {
      'show-info': (messagePtr: number, messageLen: number) => {
        if (!hasPermission(extensionId, 'ui:notifications')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const message = readString(memory, messagePtr, messageLen)
        const mainWindow = getMainWindow?.()
        if (mainWindow) {
          mainWindow.webContents.send('wasm-extension:notification', {
            type: 'info',
            extensionId,
            message,
          })
        }
        return 0
      },
      'show-warning': (messagePtr: number, messageLen: number) => {
        if (!hasPermission(extensionId, 'ui:notifications')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const message = readString(memory, messagePtr, messageLen)
        const mainWindow = getMainWindow?.()
        if (mainWindow) {
          mainWindow.webContents.send('wasm-extension:notification', {
            type: 'warning',
            extensionId,
            message,
          })
        }
        return 0
      },
      'show-error': (messagePtr: number, messageLen: number) => {
        if (!hasPermission(extensionId, 'ui:notifications')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const message = readString(memory, messagePtr, messageLen)
        const mainWindow = getMainWindow?.()
        if (mainWindow) {
          mainWindow.webContents.send('wasm-extension:notification', {
            type: 'error',
            extensionId,
            message,
          })
        }
        return 0
      },
      'show-notification': () => -1,
      'start-progress': () => -1,
      'report-progress': () => -1,
      'end-progress': () => -1,
      'set-status-bar-message': (messagePtr: number, messageLen: number, _timeoutMs: number) => {
        if (!hasPermission(extensionId, 'ui:notifications')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const message = readString(memory, messagePtr, messageLen)
        const mainWindow = getMainWindow?.()
        if (mainWindow) {
          mainWindow.webContents.send('wasm-extension:statusbar', {
            extensionId,
            message,
          })
        }
        return 0
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // UI: Commands (requires ui:commands)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:ui/commands@0.1.0': {
      'register-command': (
        idPtr: number, idLen: number,
        titlePtr: number, titleLen: number,
        categoryPtr: number, categoryLen: number
      ) => {
        if (!hasPermission(extensionId, 'ui:commands')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const id = readString(memory, idPtr, idLen)
        const title = readString(memory, titlePtr, titleLen)
        const category = categoryLen > 0 ? readString(memory, categoryPtr, categoryLen) : undefined

        // Register command
        ext.registeredCommands.push({ id, title, category, extensionId })

        // Notify renderer
        const mainWindow = getMainWindow?.()
        if (mainWindow) {
          mainWindow.webContents.send('wasm-extension:command-registered', {
            extensionId,
            command: { id, title, category },
          })
        }

        console.log(`[WASM Extension] Registered command: ${id}`)
        return 0
      },
      'unregister-command': (idPtr: number, idLen: number) => {
        if (!hasPermission(extensionId, 'ui:commands')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const id = readString(memory, idPtr, idLen)
        const index = ext.registeredCommands.findIndex(c => c.id === id)
        if (index >= 0) {
          ext.registeredCommands.splice(index, 1)
        }
        return 0
      },
      'execute-command': () => 0,
      'get-commands': () => 0,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Workspace: Filesystem (requires workspace:read/write)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:workspace/filesystem@0.1.0': {
      'get-workspace-root': (outPtr: number) => {
        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance || !workspaceRoot) return 0

        const [ptr, len] = writeString(instance, memory, workspaceRoot)
        if (outPtr && ptr) {
          const view = new DataView(memory.buffer)
          view.setUint32(outPtr, ptr, true)
          view.setUint32(outPtr + 4, len, true)
        }
        return ptr ? 1 : 0
      },
      'get-workspace-folders': () => 0,
      exists: (pathPtr: number, pathLen: number) => {
        if (!hasPermission(extensionId, 'workspace:read')) return 0

        const memory = getMemory()
        if (!memory) return 0

        const filePath = readString(memory, pathPtr, pathLen)
        if (!isPathInWorkspace(filePath)) return 0

        try {
          fsSync.accessSync(filePath)
          return 1
        } catch {
          return 0
        }
      },
      stat: () => {
        if (!hasPermission(extensionId, 'workspace:read')) return -1
        return 0
      },
      'read-file': (
        pathPtr: number, pathLen: number,
        outPtr: number
      ) => {
        if (!hasPermission(extensionId, 'workspace:read')) return -1

        const memory = getMemory()
        const instance = getInstance()
        if (!memory || !instance) return -1

        const filePath = readString(memory, pathPtr, pathLen)
        if (!isPathInWorkspace(filePath)) return -1

        try {
          const content = fsSync.readFileSync(filePath, 'utf-8')
          const [ptr, len] = writeString(instance, memory, content)
          if (outPtr && ptr) {
            const view = new DataView(memory.buffer)
            view.setUint32(outPtr, ptr, true)
            view.setUint32(outPtr + 4, len, true)
          }
          return ptr ? 0 : -1
        } catch {
          return -1
        }
      },
      'read-file-binary': () => {
        if (!hasPermission(extensionId, 'workspace:read')) return -1
        return 0
      },
      'write-file': (
        pathPtr: number, pathLen: number,
        contentPtr: number, contentLen: number
      ) => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const filePath = readString(memory, pathPtr, pathLen)
        if (!isPathInWorkspace(filePath)) return -1

        const content = readString(memory, contentPtr, contentLen)

        try {
          fsSync.writeFileSync(filePath, content, 'utf-8')
          return 0
        } catch {
          return -1
        }
      },
      'write-file-binary': () => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1
        return 0
      },
      delete: (pathPtr: number, pathLen: number, recursive: number) => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const filePath = readString(memory, pathPtr, pathLen)
        if (!isPathInWorkspace(filePath)) return -1

        try {
          fsSync.rmSync(filePath, { recursive: recursive !== 0 })
          return 0
        } catch {
          return -1
        }
      },
      rename: (
        oldPathPtr: number, oldPathLen: number,
        newPathPtr: number, newPathLen: number
      ) => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const oldPath = readString(memory, oldPathPtr, oldPathLen)
        const newPath = readString(memory, newPathPtr, newPathLen)

        if (!isPathInWorkspace(oldPath) || !isPathInWorkspace(newPath)) return -1

        try {
          fsSync.renameSync(oldPath, newPath)
          return 0
        } catch {
          return -1
        }
      },
      'create-directory': (pathPtr: number, pathLen: number) => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1

        const memory = getMemory()
        if (!memory) return -1

        const dirPath = readString(memory, pathPtr, pathLen)
        if (!isPathInWorkspace(dirPath)) return -1

        try {
          fsSync.mkdirSync(dirPath, { recursive: true })
          return 0
        } catch {
          return -1
        }
      },
      'read-directory': () => {
        if (!hasPermission(extensionId, 'workspace:read')) return -1
        return 0
      },
      copy: () => {
        if (!hasPermission(extensionId, 'workspace:write')) return -1
        return 0
      },
      watch: () => {
        if (!hasPermission(extensionId, 'workspace:read')) return -1
        return 0
      },
      unwatch: () => -1,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Network: Fetch (requires network:fetch)
    // ─────────────────────────────────────────────────────────────────────────
    'ide-extension:network/fetch@0.1.0': {
      fetch: () => {
        if (!hasPermission(extensionId, 'network:fetch')) return -1
        return 0
      },
      get: () => {
        if (!hasPermission(extensionId, 'network:fetch')) return -1
        return 0
      },
      'post-json': () => {
        if (!hasPermission(extensionId, 'network:fetch')) return -1
        return 0
      },
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and parse extension manifest
 */
async function loadManifest(extensionPath: string): Promise<WasmExtensionManifest> {
  const manifestPath = path.join(extensionPath, 'extension.json')
  const content = await fs.readFile(manifestPath, 'utf-8')
  return JSON.parse(content) as WasmExtensionManifest
}

/**
 * Install a WASM extension from a package path
 */
async function installWasmExtension(packagePath: string): Promise<WasmExtensionInstance> {
  const manifest = await loadManifest(packagePath)

  if (manifest.runtime !== 'wasm32-wasi') {
    throw new Error(`Unsupported runtime: ${manifest.runtime}`)
  }

  const installPath = path.join(extensionsDir, manifest.name)
  await fs.mkdir(installPath, { recursive: true })
  await fs.cp(packagePath, installPath, { recursive: true })

  const instance: WasmExtensionInstance = {
    id: manifest.name,
    manifest,
    installPath,
    permissions: (manifest.permissions || []).map(p => ({
      permission: p,
      granted: false,
    })),
    state: 'installed',
    registeredCommands: [],
  }

  wasmExtensions.set(manifest.name, instance)
  return instance
}

/**
 * Uninstall a WASM extension
 */
async function uninstallWasmExtension(extensionId: string): Promise<void> {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  if (ext.state === 'activated') {
    await deactivateWasmExtension(extensionId)
  }

  await fs.rm(ext.installPath, { recursive: true })
  wasmExtensions.delete(extensionId)

  delete permissionDecisions[extensionId]
  await savePermissionDecisions()
}

/**
 * Activate a WASM extension
 */
async function activateWasmExtension(
  extensionId: string,
  _event: ActivationEvent
): Promise<void> {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  if (ext.state === 'activated') {
    return
  }

  const ungrantedPermissions = ext.permissions.filter(p => !p.granted)
  if (ungrantedPermissions.length > 0) {
    throw new Error(
      `Missing permissions: ${ungrantedPermissions.map(p => p.permission).join(', ')}`
    )
  }

  try {
    const wasmPath = path.join(ext.installPath, ext.manifest.main)
    const wasmBuffer = await fs.readFile(wasmPath)

    // Create WASI instance with sandboxed preopens
    const storagePath = path.join(ext.installPath, '.storage')
    await fs.mkdir(storagePath, { recursive: true })

    const preopens: Record<string, string> = {
      '/extension': ext.installPath,
    }

    if (hasPermission(extensionId, 'storage:local')) {
      preopens['/storage'] = storagePath
    }

    if (workspaceRoot && hasPermission(extensionId, 'workspace:read')) {
      preopens['/workspace'] = workspaceRoot
    }

    ext.wasi = new WASI({
      version: 'preview1',
      preopens,
      env: {
        EXTENSION_ID: ext.id,
        EXTENSION_VERSION: ext.manifest.version,
        HOST_NAME: 'Logos',
        HOST_VERSION: app.getVersion(),
      },
    })

    // Compile module
    ext.wasmModule = await WebAssembly.compile(wasmBuffer)

    // Get WASI imports and merge with our host functions
    const wasiImports = ext.wasi.getImportObject()
    const hostFunctions = createHostFunctions(extensionId)

    const imports = {
      ...wasiImports,
      ...hostFunctions,
    }

    // Instantiate module
    ext.wasmInstance = await WebAssembly.instantiate(ext.wasmModule, imports)

    // Store memory reference for host functions
    ext.memory = ext.wasmInstance.exports.memory as WebAssembly.Memory

    // Initialize WASI
    ext.wasi.initialize(ext.wasmInstance)

    // Call activate function if exported
    const exports = ext.wasmInstance.exports
    if (typeof exports.activate === 'function') {
      (exports.activate as () => void)()
    }

    ext.state = 'activated'
    console.log(`[WASM Extension] Activated: ${extensionId}`)

    // Notify renderer
    const mainWindow = getMainWindow?.()
    if (mainWindow) {
      mainWindow.webContents.send('wasm-extension:activated', { extensionId })
    }
  } catch (error) {
    ext.state = 'error'
    ext.error = (error as Error).message
    console.error(`[WASM Extension] Activation failed for ${extensionId}:`, error)
    throw error
  }
}

/**
 * Deactivate a WASM extension
 */
async function deactivateWasmExtension(extensionId: string): Promise<void> {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  if (ext.state !== 'activated') {
    return
  }

  try {
    if (ext.wasmInstance) {
      const exports = ext.wasmInstance.exports
      if (typeof exports.deactivate === 'function') {
        (exports.deactivate as () => void)()
      }
    }

    // Clear registered commands
    ext.registeredCommands = []

    // Clean up
    ext.wasmModule = undefined
    ext.wasmInstance = undefined
    ext.wasi = undefined
    ext.memory = undefined
    ext.state = 'deactivated'

    console.log(`[WASM Extension] Deactivated: ${extensionId}`)

    // Notify renderer
    const mainWindow = getMainWindow?.()
    if (mainWindow) {
      mainWindow.webContents.send('wasm-extension:deactivated', { extensionId })
    }
  } catch (error) {
    ext.state = 'error'
    ext.error = (error as Error).message
    throw error
  }
}

/**
 * Execute a command registered by a WASM extension
 */
async function executeWasmCommand(commandId: string, args?: unknown[]): Promise<unknown> {
  for (const ext of wasmExtensions.values()) {
    const cmd = ext.registeredCommands.find(c => c.id === commandId)
    if (cmd && ext.wasmInstance) {
      const exports = ext.wasmInstance.exports
      const handler = exports[`command_${commandId.replace(/\./g, '_')}`] as Function | undefined
      if (handler) {
        return handler(...(args || []))
      }

      // Try generic command handler
      const genericHandler = exports.handle_command as Function | undefined
      if (genericHandler && ext.memory) {
        const [cmdPtr, cmdLen] = writeString(ext.wasmInstance, ext.memory, commandId)
        if (cmdPtr) {
          return genericHandler(cmdPtr, cmdLen)
        }
      }
    }
  }
  throw new Error(`Command not found: ${commandId}`)
}

/**
 * Grant a permission to an extension
 */
async function grantPermission(extensionId: string, permission: string): Promise<void> {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  const perm = ext.permissions.find(p => p.permission === permission)
  if (!perm) {
    throw new Error(`Permission not declared: ${permission}`)
  }

  perm.granted = true
  perm.grantedAt = Date.now()

  if (!permissionDecisions[extensionId]) {
    permissionDecisions[extensionId] = {}
  }
  permissionDecisions[extensionId][permission] = true
  await savePermissionDecisions()
}

/**
 * Revoke a permission from an extension
 */
async function revokePermission(extensionId: string, permission: string): Promise<void> {
  const ext = wasmExtensions.get(extensionId)
  if (!ext) {
    throw new Error(`Extension not found: ${extensionId}`)
  }

  const perm = ext.permissions.find(p => p.permission === permission)
  if (perm) {
    perm.granted = false
    perm.grantedAt = undefined
  }

  if (permissionDecisions[extensionId]) {
    permissionDecisions[extensionId][permission] = false
  }
  await savePermissionDecisions()

  if (ext.state === 'activated') {
    await deactivateWasmExtension(extensionId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

async function loadPermissionDecisions(): Promise<void> {
  const permissionsPath = path.join(extensionsDir, 'wasm-permissions.json')
  try {
    const content = await fs.readFile(permissionsPath, 'utf-8')
    permissionDecisions = JSON.parse(content)
  } catch {
    permissionDecisions = {}
  }
}

async function savePermissionDecisions(): Promise<void> {
  const permissionsPath = path.join(extensionsDir, 'wasm-permissions.json')
  await fs.writeFile(permissionsPath, JSON.stringify(permissionDecisions, null, 2))
}

async function loadInstalledExtensions(): Promise<void> {
  try {
    const entries = await fs.readdir(extensionsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue

      try {
        const extPath = path.join(extensionsDir, entry.name)
        const manifest = await loadManifest(extPath)

        if (manifest.runtime !== 'wasm32-wasi') continue

        const instance: WasmExtensionInstance = {
          id: manifest.name,
          manifest,
          installPath: extPath,
          permissions: (manifest.permissions || []).map(p => ({
            permission: p,
            granted: permissionDecisions[manifest.name]?.[p] ?? false,
          })),
          state: 'installed',
          registeredCommands: [],
        }

        wasmExtensions.set(manifest.name, instance)
      } catch {
        // Skip invalid extensions
      }
    }
  } catch {
    // Extensions directory doesn't exist yet
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register IPC handlers for WASM extension service
 */
export function registerWasmExtensionHandlers(
  getWindow: () => BrowserWindow | null
): void {
  getMainWindow = getWindow
  extensionsDir = path.join(app.getPath('userData'), 'wasm-extensions')

  fs.mkdir(extensionsDir, { recursive: true })
    .then(() => loadPermissionDecisions())
    .then(() => loadInstalledExtensions())
    .catch(console.error)

  // List installed WASM extensions
  ipcMain.handle('wasm-ext:list', async () => {
    return Array.from(wasmExtensions.values()).map(ext => ({
      id: ext.id,
      manifest: ext.manifest,
      state: ext.state,
      permissions: ext.permissions,
      registeredCommands: ext.registeredCommands,
      error: ext.error,
    }))
  })

  // Get extension details
  ipcMain.handle('wasm-ext:get', async (_, extensionId: string) => {
    const ext = wasmExtensions.get(extensionId)
    if (!ext) return null

    return {
      id: ext.id,
      manifest: ext.manifest,
      state: ext.state,
      permissions: ext.permissions,
      registeredCommands: ext.registeredCommands,
      error: ext.error,
    }
  })

  // Install extension
  ipcMain.handle('wasm-ext:install', async (_, packagePath: string) => {
    try {
      const instance = await installWasmExtension(packagePath)
      return { success: true, extension: instance }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Uninstall extension
  ipcMain.handle('wasm-ext:uninstall', async (_, extensionId: string) => {
    try {
      await uninstallWasmExtension(extensionId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Activate extension
  ipcMain.handle(
    'wasm-ext:activate',
    async (_, extensionId: string, event?: ActivationEvent) => {
      try {
        await activateWasmExtension(extensionId, event || { type: 'startup' })
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Deactivate extension
  ipcMain.handle('wasm-ext:deactivate', async (_, extensionId: string) => {
    try {
      await deactivateWasmExtension(extensionId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Grant permission
  ipcMain.handle(
    'wasm-ext:grant-permission',
    async (_, extensionId: string, permission: string) => {
      try {
        await grantPermission(extensionId, permission)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Revoke permission
  ipcMain.handle(
    'wasm-ext:revoke-permission',
    async (_, extensionId: string, permission: string) => {
      try {
        await revokePermission(extensionId, permission)
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Get permission risk level
  ipcMain.handle('wasm-ext:permission-risk', async (_, permission: string) => {
    return getPermissionRiskLevel(permission)
  })

  // Check if extension has permission
  ipcMain.handle(
    'wasm-ext:has-permission',
    async (_, extensionId: string, permission: string) => {
      return hasPermission(extensionId, permission)
    }
  )

  // Execute a WASM extension command
  ipcMain.handle(
    'wasm-ext:execute-command',
    async (_, commandId: string, args?: unknown[]) => {
      try {
        const result = await executeWasmCommand(commandId, args)
        return { success: true, result }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Set workspace root for file access
  ipcMain.handle('wasm-ext:set-workspace', async (_, rootPath: string | null) => {
    workspaceRoot = rootPath
    return { success: true }
  })

  // Get all registered commands
  ipcMain.handle('wasm-ext:list-commands', async () => {
    const commands: RegisteredCommand[] = []
    for (const ext of wasmExtensions.values()) {
      commands.push(...ext.registeredCommands)
    }
    return commands
  })
}

/**
 * Cleanup WASM extension service
 */
export async function cleanupWasmExtensions(): Promise<void> {
  for (const [id, ext] of wasmExtensions) {
    if (ext.state === 'activated') {
      try {
        await deactivateWasmExtension(id)
      } catch (error) {
        console.error(`Failed to deactivate ${id}:`, error)
      }
    }
  }

  wasmExtensions.clear()
}
