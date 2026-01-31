import { promises as fs } from 'fs'
import path from 'path'
import {
  setWorkspaceRoot,
  setCommandActivationHandler,
  registerExtensionDescription,
  updateExtensionActivation,
  createExtensionContext,
  vscodeApi
} from './vscode'

const minimatch = require('minimatch') as (value: string, pattern: string, options?: { dot?: boolean }) => boolean

interface ExtensionManifest {
  name?: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  main?: string
  activationEvents?: string[]
  contributes?: Record<string, unknown>
}

interface ExtensionContext {
  subscriptions: Array<{ dispose: () => void }>
  extensionPath: string
  storagePath?: string
  globalStoragePath: string
  extensionUri: unknown
  globalStorageUri: unknown
  globalState: { get: <T>(key: string, defaultValue?: T) => T | undefined; update: (key: string, value: unknown) => Promise<void> }
  workspaceState: { get: <T>(key: string, defaultValue?: T) => T | undefined; update: (key: string, value: unknown) => Promise<void> }
  secrets: { get: (key: string) => Promise<string | undefined>; store: (key: string, value: string) => Promise<void>; delete: (key: string) => Promise<void> }
  asAbsolutePath: (relativePath: string) => string
}

interface ActiveExtension {
  id: string
  manifest: ExtensionManifest
  extensionPath: string
  context: ExtensionContext
  exports?: unknown
  deactivate?: () => unknown
}

interface ExtensionEntry {
  id: string
  manifest: ExtensionManifest
  extensionPath: string
  enabled: boolean
  active: boolean
  exports?: unknown
  deactivate?: () => unknown
  context?: ExtensionContext
}

interface ExtensionStateFile {
  schemaVersion: number
  extensions: Record<string, { enabled: boolean; trusted?: boolean }>
}

function buildExtensionId(manifest: ExtensionManifest, fallback: string): string {
  const name = manifest.name ?? fallback
  const publisher = manifest.publisher
  return publisher ? `${publisher}.${name}` : name
}

function sanitizeExtensionId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function shouldActivateOnStartup(manifest: ExtensionManifest): boolean {
  const activationEvents = manifest.activationEvents ?? []
  if (activationEvents.length === 0) {
    return true
  }
  return activationEvents.includes('*') || activationEvents.includes('onStartupFinished')
}

function hasActivationEvent(manifest: ExtensionManifest, predicate: (event: string) => boolean): boolean {
  return (manifest.activationEvents ?? []).some(predicate)
}

export class ExtensionHost {
  private extensionsRoot: string
  private activeExtensions = new Map<string, ActiveExtension>()
  private extensions = new Map<string, ExtensionEntry>()

  constructor(extensionsRoot: string) {
    this.extensionsRoot = extensionsRoot
    setCommandActivationHandler(this.activateByCommand.bind(this))
  }

  async start(): Promise<void> {
    await this.loadExtensions()
    await this.activateOnStartup()
    const root = process.env.LOGOS_WORKSPACE_ROOT
    if (root) {
      await this.activateByWorkspaceContains(root)
    }
  }

  async reload(): Promise<void> {
    await this.deactivateAll()
    this.extensions.clear()
    await this.loadExtensions()
    await this.activateOnStartup()
  }

  async shutdown(): Promise<void> {
    await this.deactivateAll()
  }

  setWorkspaceRoot(root: string | null): void {
    setWorkspaceRoot(root)
    if (root) {
      this.activateByWorkspaceContains(root).catch((error) => {
        console.error('[extension-host] workspaceContains activation failed:', error)
      })
    }
  }

  handleDocumentOpened(languageId: string): void {
    this.activateByLanguage(languageId).catch((error) => {
      console.error('[extension-host] onLanguage activation failed:', error)
    })
  }

  async handleViewActivated(viewId: string): Promise<void> {
    try {
      await this.activateByView(viewId)
    } catch (error) {
      console.error('[extension-host] onView activation failed:', error)
    }
  }

  private async loadExtensions(): Promise<void> {
    if (!this.extensionsRoot) {
      console.warn('[extension-host] extensions root missing')
      return
    }

    const state = await this.loadState()
    const entries = await fs.readdir(this.extensionsRoot, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      if (entry.name.startsWith('.')) {
        continue
      }

      const extensionPath = path.join(this.extensionsRoot, entry.name)
      const manifestPath = path.join(extensionPath, 'package.json')

      try {
        const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestRaw) as ExtensionManifest
      const id = buildExtensionId(manifest, entry.name)
      const enabled = state.extensions[id]?.enabled ?? true
      const trusted = state.extensions[id]?.trusted ?? true

      if (!manifest.main) {
        console.warn(`[extension-host] missing main entry: ${id}`)
        continue
      }

      if (!enabled || !trusted) {
        continue
      }

        registerExtensionDescription(id, extensionPath, manifest as Record<string, unknown>)

        this.extensions.set(id, {
          id,
          manifest,
          extensionPath,
          enabled,
          active: false
        })
      } catch (error) {
        console.error(`[extension-host] failed to load extension ${entry.name}:`, error)
      }
    }
  }

  private async activateOnStartup(): Promise<void> {
    const activations = Array.from(this.extensions.values()).filter(entry => shouldActivateOnStartup(entry.manifest))
    for (const entry of activations) {
      await this.activateExtension(entry)
    }
  }

  private async activateByCommand(command: string): Promise<void> {
    const targets = Array.from(this.extensions.values()).filter(entry =>
      hasActivationEvent(entry.manifest, event => event === `onCommand:${command}`)
    )
    for (const entry of targets) {
      await this.activateExtension(entry)
    }
  }

  private async activateByLanguage(languageId: string): Promise<void> {
    const targets = Array.from(this.extensions.values()).filter(entry =>
      hasActivationEvent(entry.manifest, event => event === `onLanguage:${languageId}`)
    )
    for (const entry of targets) {
      await this.activateExtension(entry)
    }
  }

  private async activateByWorkspaceContains(root: string): Promise<void> {
    const targets = Array.from(this.extensions.values()).filter(entry =>
      hasActivationEvent(entry.manifest, event => event.startsWith('workspaceContains:'))
    )

    for (const entry of targets) {
      const patterns = (entry.manifest.activationEvents ?? [])
        .filter(event => event.startsWith('workspaceContains:'))
        .map(event => event.replace('workspaceContains:', '').trim())

      for (const pattern of patterns) {
        if (!pattern) {
          continue
        }
        if (await this.workspaceContains(root, pattern)) {
          await this.activateExtension(entry)
          break
        }
      }
    }
  }

  private async activateByView(viewId: string): Promise<void> {
    const targets = Array.from(this.extensions.values()).filter(entry =>
      hasActivationEvent(entry.manifest, event => event === `onView:${viewId}`)
    )
    for (const entry of targets) {
      await this.activateExtension(entry)
    }
  }

  private async workspaceContains(root: string, pattern: string): Promise<boolean> {
    const normalizedRoot = root
    const queue: string[] = [normalizedRoot]

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) {
        continue
      }
      const entries = await fs.readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue
        }
        const entryPath = path.join(current, entry.name)
        const relativePath = path.relative(normalizedRoot, entryPath).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          queue.push(entryPath)
          continue
        }
        if (minimatch(relativePath, pattern, { dot: true })) {
          return true
        }
      }
    }

    return false
  }

  private async activateExtension(entry: ExtensionEntry): Promise<void> {
    if (entry.active) {
      return
    }

    try {
      const mainPath = path.resolve(entry.extensionPath, entry.manifest.main ?? '')
      const moduleExports = require(mainPath) as {
        activate?: (context: ExtensionContext) => unknown
        deactivate?: () => unknown
      }

      const context = await this.createContext(entry.id, entry.extensionPath)

      if (typeof moduleExports.activate === 'function') {
        const exportsValue = await Promise.resolve(moduleExports.activate(context))
        entry.exports = exportsValue
      }

      entry.active = true
      entry.deactivate = moduleExports.deactivate
      entry.context = context

      updateExtensionActivation(entry.id, true, entry.exports)

      this.activeExtensions.set(entry.id, {
        id: entry.id,
        manifest: entry.manifest,
        extensionPath: entry.extensionPath,
        context,
        exports: entry.exports,
        deactivate: entry.deactivate
      })

      console.log(`[extension-host] activated: ${entry.id}`)
    } catch (error) {
      console.error(`[extension-host] failed to activate extension ${entry.id}:`, error)
    }
  }

  private async deactivateAll(): Promise<void> {
    for (const [id, extension] of this.activeExtensions.entries()) {
      try {
        if (extension.deactivate) {
          await Promise.resolve(extension.deactivate())
        }
        for (const disposable of extension.context.subscriptions) {
          disposable.dispose()
        }
        updateExtensionActivation(id, false)
        const entry = this.extensions.get(id)
        if (entry) {
          entry.active = false
        }
        console.log(`[extension-host] deactivated: ${id}`)
      } catch (error) {
        console.error(`[extension-host] failed to deactivate ${id}:`, error)
      }
    }

    this.activeExtensions.clear()
  }

  private async loadState(): Promise<ExtensionStateFile> {
    const statePath = path.join(this.extensionsRoot, 'state.json')
    try {
      const raw = await fs.readFile(statePath, 'utf-8')
      const parsed = JSON.parse(raw) as ExtensionStateFile
      if (parsed && typeof parsed === 'object' && parsed.extensions) {
        return parsed
      }
    } catch {
      // ignore
    }

    return { schemaVersion: 1, extensions: {} }
  }

  private async createContext(id: string, extensionPath: string): Promise<ExtensionContext> {
    const storagePath = path.join(this.extensionsRoot, '.storage', sanitizeExtensionId(id))
    await fs.mkdir(storagePath, { recursive: true })
    const storage = createExtensionContext(storagePath)

    return {
      subscriptions: [],
      extensionPath,
      storagePath,
      globalStoragePath: storagePath,
      extensionUri: vscodeApi.Uri.file(extensionPath),
      globalStorageUri: vscodeApi.Uri.file(storagePath),
      globalState: storage.globalState,
      workspaceState: storage.workspaceState,
      secrets: storage.secrets,
      asAbsolutePath: (relativePath: string) => path.join(extensionPath, relativePath)
    }
  }
}
