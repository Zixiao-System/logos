import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fork, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'

type AdmZipEntry = {
  entryName: string
  isDirectory: boolean
  getData: () => Buffer
}

type AdmZipInstance = {
  getEntries: () => AdmZipEntry[]
}

const AdmZip = require('adm-zip') as { new (path: string): AdmZipInstance }

export type ExtensionHostStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ExtensionHostState {
  status: ExtensionHostStatus
  pid?: number
  startedAt?: number
  error?: string
}

export interface LocalExtensionInfo {
  id: string
  name: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  path: string
  enabled: boolean
  iconPath?: string
  categories?: string[]
}

interface ExtensionManifest {
  name?: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  icon?: string
  categories?: string[]
}

interface ExtensionStateEntry {
  enabled: boolean
  installedAt?: number
}

interface ExtensionStateFile {
  schemaVersion: 1
  extensions: Record<string, ExtensionStateEntry>
}

let hostProcess: ChildProcess | null = null
let hostState: ExtensionHostState = { status: 'stopped' }
let getMainWindow: () => BrowserWindow | null = () => null
let workspaceRoot: string | null = null

const STATE_SCHEMA_VERSION = 1

function sanitizeExtensionId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function getExtensionsRoot(): string {
  return path.join(app.getPath('userData'), 'extensions')
}

async function ensureExtensionsRoot(): Promise<string> {
  const root = getExtensionsRoot()
  await fs.mkdir(root, { recursive: true })
  return root
}

async function loadExtensionState(): Promise<ExtensionStateFile> {
  const root = await ensureExtensionsRoot()
  const statePath = path.join(root, 'state.json')

  try {
    const raw = await fs.readFile(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as ExtensionStateFile
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION || !parsed.extensions) {
      throw new Error('Invalid extension state schema')
    }
    return parsed
  } catch {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      extensions: {}
    }
  }
}

async function saveExtensionState(state: ExtensionStateFile): Promise<void> {
  const root = await ensureExtensionsRoot()
  const statePath = path.join(root, 'state.json')
  const payload = JSON.stringify(state, null, 2)
  await fs.writeFile(statePath, payload, 'utf-8')
}

function getExtensionHostEntry(): string {
  return path.join(__dirname, 'extension-host.js')
}

function publishHostState(): void {
  const window = getMainWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('extensions:hostStatus', hostState)
  }
}

function handleHostMessage(message: unknown): void {
  if (!message || typeof message !== 'object') {
    return
  }

  const typedMessage = message as { type?: string; pid?: number; level?: string; message?: string }

  if (typedMessage.type === 'ready') {
    hostState = {
      status: 'running',
      pid: typedMessage.pid ?? hostProcess?.pid,
      startedAt: Date.now()
    }
    publishHostState()
    return
  }

  if (typedMessage.type === 'window:message' && typeof typedMessage.message === 'string') {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('extensions:message', {
        level: typedMessage.level ?? 'info',
        message: typedMessage.message
      })
    }
  }
}

function handleHostExit(code: number | null, signal: NodeJS.Signals | null): void {
  hostProcess = null
  hostState = {
    status: 'stopped',
    error: code === 0 ? undefined : `Exited with code ${code ?? 'null'} (${signal ?? 'no-signal'})`
  }
  publishHostState()
}

function handleHostError(error: Error): void {
  hostState = { status: 'error', error: error.message }
  publishHostState()
}

function requestHostReload(): void {
  if (hostProcess && hostState.status === 'running') {
    hostProcess.send?.({ type: 'reloadExtensions' })
  }
}

async function setWorkspaceRoot(rootPath: string | null): Promise<void> {
  workspaceRoot = rootPath
  hostProcess?.send?.({ type: 'setWorkspaceRoot', root: rootPath })
}

export async function startExtensionHost(): Promise<ExtensionHostState> {
  if (hostProcess) {
    return hostState
  }

  const extensionsRoot = await ensureExtensionsRoot()
  const entry = getExtensionHostEntry()

  hostState = { status: 'starting' }
  publishHostState()

  hostProcess = fork(entry, [], {
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      LOGOS_EXTENSIONS_DIR: extensionsRoot,
      LOGOS_WORKSPACE_ROOT: workspaceRoot ?? ''
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })

  hostProcess.on('message', handleHostMessage)
  hostProcess.on('exit', handleHostExit)
  hostProcess.on('error', handleHostError)

  hostProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.log(`[extension-host] ${text}`)
    }
  })

  hostProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[extension-host] ${text}`)
    }
  })

  return hostState
}

export async function stopExtensionHost(): Promise<void> {
  if (!hostProcess) {
    hostState = { status: 'stopped' }
    publishHostState()
    return
  }

  const processToStop = hostProcess
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!processToStop.killed) {
        processToStop.kill()
      }
      resolve()
    }, 5000)

    processToStop.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    processToStop.send?.({ type: 'shutdown' })
  })
}

async function resolveExtensionRoot(tempDir: string): Promise<string> {
  const packagedRoot = path.join(tempDir, 'extension')
  const packagedManifest = path.join(packagedRoot, 'package.json')
  try {
    await fs.access(packagedManifest)
    return packagedRoot
  } catch {
    return tempDir
  }
}

function buildExtensionId(manifest: ExtensionManifest): { id: string; name: string; publisher?: string } {
  const name = manifest.name ?? 'unknown-extension'
  const publisher = manifest.publisher
  const id = publisher ? `${publisher}.${name}` : name
  return { id, name, publisher }
}

async function resolveIconPath(extensionPath: string, icon?: string): Promise<string | undefined> {
  if (!icon) {
    return undefined
  }
  const iconPath = path.resolve(extensionPath, icon)
  try {
    await fs.access(iconPath)
    return iconPath
  } catch {
    return undefined
  }
}

function isSafeZipEntry(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.startsWith('..')) {
    return false
  }
  return !normalized.split('/').some(segment => segment === '..')
}

async function extractVsix(vsixPath: string, destination: string): Promise<void> {
  const zip = new AdmZip(vsixPath)
  const entries = zip.getEntries()

  for (const entry of entries) {
    const entryName = entry.entryName
    if (!isSafeZipEntry(entryName)) {
      throw new Error(`Unsafe VSIX entry: ${entryName}`)
    }

    const targetPath = path.resolve(destination, entryName)
    if (!targetPath.startsWith(path.resolve(destination) + path.sep)) {
      throw new Error(`VSIX entry outside destination: ${entryName}`)
    }

    if (entry.isDirectory) {
      await fs.mkdir(targetPath, { recursive: true })
      continue
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, entry.getData())
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadFile(response.headers.location, destination).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Download failed (${response.statusCode})`))
        return
      }

      const fileStream = fsSync.createWriteStream(destination)
      response.pipe(fileStream)
      fileStream.on('finish', () => {
        fileStream.close(() => resolve())
      })
      fileStream.on('error', (error) => {
        fileStream.close()
        reject(error)
      })
    })

    request.on('error', reject)
  })
}

export async function installVsixFromUrl(url: string): Promise<LocalExtensionInfo> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logos-vsix-download-'))
  const tempFile = path.join(tempDir, 'extension.vsix')

  try {
    await downloadFile(url, tempFile)
    return await installVsix(tempFile)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

export async function installVsix(vsixPath: string): Promise<LocalExtensionInfo> {
  const root = await ensureExtensionsRoot()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logos-vsix-'))

  try {
    await extractVsix(vsixPath, tempDir)
    const extensionRoot = await resolveExtensionRoot(tempDir)
    const manifestRaw = await fs.readFile(path.join(extensionRoot, 'package.json'), 'utf-8')
    const manifest = JSON.parse(manifestRaw) as ExtensionManifest
    const { id, name, publisher } = buildExtensionId(manifest)
    const safeFolder = sanitizeExtensionId(id)
    const targetPath = path.join(root, safeFolder)

    await fs.rm(targetPath, { recursive: true, force: true })
    await fs.mkdir(targetPath, { recursive: true })
    await fs.cp(extensionRoot, targetPath, { recursive: true })

    const state = await loadExtensionState()
    const enabled = state.extensions[id]?.enabled ?? true
    state.extensions[id] = {
      enabled,
      installedAt: Date.now()
    }
    await saveExtensionState(state)

    const iconPath = await resolveIconPath(targetPath, manifest.icon)
    requestHostReload()

    return {
      id,
      name,
      publisher,
      version: manifest.version,
      displayName: manifest.displayName,
      description: manifest.description,
      path: targetPath,
      enabled,
      iconPath,
      categories: manifest.categories
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

export async function uninstallExtension(extensionId: string): Promise<void> {
  const root = await ensureExtensionsRoot()
  const safeFolder = sanitizeExtensionId(extensionId)
  const targetPath = path.join(root, safeFolder)
  await fs.rm(targetPath, { recursive: true, force: true })

  const state = await loadExtensionState()
  delete state.extensions[extensionId]
  await saveExtensionState(state)
  requestHostReload()
}

export async function setExtensionEnabled(extensionId: string, enabled: boolean): Promise<void> {
  const state = await loadExtensionState()
  const entry = state.extensions[extensionId] ?? { enabled }
  entry.enabled = enabled
  state.extensions[extensionId] = entry
  await saveExtensionState(state)
  requestHostReload()
}

export async function listLocalExtensions(): Promise<LocalExtensionInfo[]> {
  const root = await ensureExtensionsRoot()
  const state = await loadExtensionState()
  const entries = await fs.readdir(root, { withFileTypes: true })
  const results: LocalExtensionInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    if (entry.name.startsWith('.')) {
      continue
    }

    const extensionPath = path.join(root, entry.name)
    const manifestPath = path.join(extensionPath, 'package.json')

    try {
      const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestRaw) as ExtensionManifest
      const { id, name, publisher } = buildExtensionId(manifest)
      const enabled = state.extensions[id]?.enabled ?? true

      results.push({
        id,
        name,
        publisher,
        version: manifest.version,
        displayName: manifest.displayName,
        description: manifest.description,
        path: extensionPath,
        enabled,
        iconPath: await resolveIconPath(extensionPath, manifest.icon),
        categories: manifest.categories
      })
    } catch {
      results.push({
        id: entry.name,
        name: entry.name,
        path: extensionPath,
        enabled: state.extensions[entry.name]?.enabled ?? true
      })
    }
  }

  return results
}

export function registerExtensionHandlers(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow

  ipcMain.handle('extensions:getRoot', async () => {
    return await ensureExtensionsRoot()
  })

  ipcMain.handle('extensions:hostStatus', async () => {
    return hostState
  })

  ipcMain.handle('extensions:hostStart', async () => {
    return await startExtensionHost()
  })

  ipcMain.handle('extensions:hostStop', async () => {
    await stopExtensionHost()
    return hostState
  })

  ipcMain.handle('extensions:hostRestart', async () => {
    await stopExtensionHost()
    return await startExtensionHost()
  })

  ipcMain.handle('extensions:listLocal', async () => {
    return await listLocalExtensions()
  })

  ipcMain.handle('extensions:installVsix', async (_event, vsixPath: string) => {
    return await installVsix(vsixPath)
  })

  ipcMain.handle('extensions:installFromUrl', async (_event, url: string) => {
    return await installVsixFromUrl(url)
  })

  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    await uninstallExtension(extensionId)
    return true
  })

  ipcMain.handle('extensions:setEnabled', async (_event, extensionId: string, enabled: boolean) => {
    await setExtensionEnabled(extensionId, enabled)
    return true
  })

  ipcMain.handle('extensions:setWorkspaceRoot', async (_event, rootPath: string | null) => {
    await setWorkspaceRoot(rootPath)
    return true
  })

  ipcMain.handle('extensions:openRoot', async () => {
    const root = await ensureExtensionsRoot()
    await shell.openPath(root)
    return root
  })

  startExtensionHost().catch((error) => {
    console.error('[extension-host] Failed to start:', error)
  })
}

export async function cleanupExtensionHost(): Promise<void> {
  await stopExtensionHost()
}
