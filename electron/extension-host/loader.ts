import { promises as fs } from 'fs'
import path from 'path'
import { setWorkspaceRoot } from './vscode'

interface ExtensionManifest {
  name?: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  main?: string
  activationEvents?: string[]
}

interface ExtensionContext {
  subscriptions: Array<{ dispose: () => void }>
  extensionPath: string
  globalStoragePath: string
}

interface ActiveExtension {
  id: string
  manifest: ExtensionManifest
  extensionPath: string
  context: ExtensionContext
  deactivate?: () => unknown
}

interface ExtensionStateFile {
  schemaVersion: number
  extensions: Record<string, { enabled: boolean }>
}

function buildExtensionId(manifest: ExtensionManifest, fallback: string): string {
  const name = manifest.name ?? fallback
  const publisher = manifest.publisher
  return publisher ? `${publisher}.${name}` : name
}

function sanitizeExtensionId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function shouldActivate(manifest: ExtensionManifest): boolean {
  const activationEvents = manifest.activationEvents ?? []
  if (activationEvents.length === 0) {
    return true
  }
  return activationEvents.includes('*') || activationEvents.includes('onStartupFinished')
}

export class ExtensionHost {
  private extensionsRoot: string
  private activeExtensions = new Map<string, ActiveExtension>()

  constructor(extensionsRoot: string) {
    this.extensionsRoot = extensionsRoot
  }

  async start(): Promise<void> {
    await this.loadExtensions()
  }

  async reload(): Promise<void> {
    await this.deactivateAll()
    await this.loadExtensions()
  }

  async shutdown(): Promise<void> {
    await this.deactivateAll()
  }

  setWorkspaceRoot(root: string | null): void {
    setWorkspaceRoot(root)
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

        if (!enabled) {
          continue
        }

        if (!manifest.main) {
          console.warn(`[extension-host] missing main entry: ${id}`)
          continue
        }

        const mainPath = path.resolve(extensionPath, manifest.main)
        const moduleExports = require(mainPath) as {
          activate?: (context: ExtensionContext) => unknown
          deactivate?: () => unknown
        }

        const context = await this.createContext(id, extensionPath)

        if (shouldActivate(manifest) && typeof moduleExports.activate === 'function') {
          await Promise.resolve(moduleExports.activate(context))
          console.log(`[extension-host] activated: ${id}`)
        } else {
          console.log(`[extension-host] loaded: ${id}`)
        }

        this.activeExtensions.set(id, {
          id,
          manifest,
          extensionPath,
          context,
          deactivate: moduleExports.deactivate
        })
      } catch (error) {
        console.error(`[extension-host] failed to load extension ${entry.name}:`, error)
      }
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

    return {
      subscriptions: [],
      extensionPath,
      globalStoragePath: storagePath
    }
  }
}
