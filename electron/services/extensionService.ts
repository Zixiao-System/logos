import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { fork, ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import * as os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'
import net from 'net'

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
  trusted?: boolean
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
  contributes?: {
    commands?: Array<{ command: string; title?: string; icon?: string | { light?: string; dark?: string } }>
    viewsContainers?: {
      activitybar?: Array<{ id: string; title?: string; icon?: string }>
    }
    views?: Record<string, Array<{ id: string; name?: string }>>
    menus?: Record<string, Array<{ command: string; when?: string; group?: string }>>
  }
}

interface MarketplaceExtensionInfo {
  id: string
  publisher: string
  name: string
  displayName?: string
  description?: string
  version?: string
  downloads?: number
  iconUrl?: string
  downloadUrl?: string
}

interface ExtensionStateEntry {
  enabled: boolean
  installedAt?: number
  trusted?: boolean
}

interface ExtensionStateFile {
  schemaVersion: 1
  extensions: Record<string, ExtensionStateEntry>
}

interface ExtensionViewContainer {
  id: string
  title: string
  iconPath?: string
  extensionId?: string
}

interface ExtensionView {
  id: string
  name: string
  containerId: string
  extensionId?: string
}

interface ExtensionUiContributions {
  containers: ExtensionViewContainer[]
  views: ExtensionView[]
  scmTitleActions?: ExtensionScmTitleAction[]
}

interface ExtensionScmTitleAction {
  id: string
  title: string
  group?: string
  when?: string
  command: string
  extensionId?: string
  iconPath?: string
  iconPathLight?: string
  iconPathDark?: string
}

let hostProcess: ChildProcess | null = null
let hostState: ExtensionHostState = { status: 'stopped' }
let getMainWindow: () => BrowserWindow | null = () => null
let workspaceRoot: string | null = null
let requestCounter = 0
const pendingHostRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let vscodeIpcServer: net.Server | null = null
let vscodeIpcHandle: string | null = null

const STATE_SCHEMA_VERSION = 1

type ExtensionHostMode = 'logos' | 'vscode'

const VENDOR_ENTRY_JS = 'out/vs/workbench/api/node/extensionHostProcess.js'

function getHostMode(): ExtensionHostMode {
  // Explicit mode override
  if (process.env.LOGOS_EXT_HOST_MODE === 'vscode') return 'vscode'
  if (process.env.LOGOS_EXT_HOST_MODE === 'logos') return 'logos'

  // Auto-detect vendor in development mode
  if (process.env.NODE_ENV !== 'production') {
    const vendorPath = path.resolve(process.cwd(), 'vendor', 'vscode', VENDOR_ENTRY_JS)
    if (fsSync.existsSync(vendorPath)) {
      return 'vscode'
    }
  }

  return 'logos'
}

function createIpcHandle(): string {
  const token = `${Date.now()}_${Math.random().toString(16).slice(2)}`
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\logos-vscode-${token}`
  }
  return path.join(os.tmpdir(), `logos-vscode-${token}.sock`)
}

async function ensureVscodeIpcServer(): Promise<string> {
  if (vscodeIpcServer && vscodeIpcHandle) {
    return vscodeIpcHandle
  }

  const handle = createIpcHandle()
  const server = net.createServer((socket) => {
    socket.on('error', () => {
      // ignore socket errors for now
    })
    socket.on('data', () => {
      // TODO: hook VS Code IPC protocol here (init data + RPC)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(handle, () => resolve())
  })

  vscodeIpcServer = server
  vscodeIpcHandle = handle
  return handle
}

async function cleanupVscodeIpcServer(): Promise<void> {
  if (!vscodeIpcServer) {
    vscodeIpcHandle = null
    return
  }
  await new Promise<void>((resolve) => {
    vscodeIpcServer?.close(() => resolve())
  })
  vscodeIpcServer = null
  vscodeIpcHandle = null
}

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
    const migrated: ExtensionStateFile = {
      schemaVersion: STATE_SCHEMA_VERSION,
      extensions: {}
    }
    for (const [id, entry] of Object.entries(parsed.extensions)) {
      migrated.extensions[id] = {
        enabled: entry.enabled ?? true,
        installedAt: entry.installedAt,
        trusted: entry.trusted ?? true
      }
    }
    return migrated
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

  const typedMessage = message as {
    type?: string
    pid?: number
    level?: string
    message?: unknown
    requestId?: string
    ok?: boolean
    payload?: unknown
    error?: string
    url?: string
    uiType?: string
    handle?: string
    html?: string
    action?: string
    viewType?: string
    title?: string
    options?: unknown
    id?: string
    text?: string
    tooltip?: string
    command?: unknown
    visible?: boolean
    alignment?: number
    priority?: number
  }

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

  if (typedMessage.type === 'webviewMessage' && typedMessage.handle) {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('extensions:webviewMessage', {
        handle: typedMessage.handle,
        message: typedMessage.message
      })
    }
  }

  if (typedMessage.type === 'webviewHtml' && typedMessage.handle && typeof typedMessage.html === 'string') {
    const window = getMainWindow()
    console.info('[extension-host] webviewHtml', {
      handle: typedMessage.handle,
      length: typedMessage.html.length
    })
    if (window && !window.isDestroyed()) {
      window.webContents.send('extensions:webviewHtml', {
        handle: typedMessage.handle,
        html: typedMessage.html
      })
    }
  }

  if (typedMessage.type === 'webviewPanel' && typedMessage.handle) {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('extensions:webviewPanel', {
        action: typedMessage.action,
        handle: typedMessage.handle,
        viewType: typedMessage.viewType,
        title: typedMessage.title,
        options: typedMessage.options
      })
    }
  }

  if (typedMessage.type === 'statusBarItem' && typedMessage.id) {
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send('extensions:statusBarItem', typedMessage)
    }
  }

  if (typedMessage.type === 'openExternal' && typeof typedMessage.url === 'string') {
    shell.openExternal(typedMessage.url).catch((error) => {
      console.error('[extension-host] openExternal failed:', error)
    })
  }

  if (typedMessage.type === 'uiRequest' && typedMessage.requestId && typedMessage.uiType) {
    handleUiRequest(typedMessage.requestId, typedMessage.uiType, typedMessage.payload).catch((error) => {
      hostProcess?.send?.({ type: 'uiResponse', requestId: typedMessage.requestId, ok: false, error: error?.message || 'UI request failed' })
    })
  }

  if (typedMessage.type === 'rpcResponse' && typedMessage.requestId) {
    const pending = pendingHostRequests.get(typedMessage.requestId)
    if (!pending) {
      return
    }
    pendingHostRequests.delete(typedMessage.requestId)
    if (typedMessage.ok) {
      pending.resolve(typedMessage.payload)
    } else {
      pending.reject(new Error(typedMessage.error || 'Extension host request failed'))
    }
  }
}

function sendUiResponse(requestId: string, ok: boolean, result?: unknown, error?: string): void {
  hostProcess?.send?.({ type: 'uiResponse', requestId, ok, result, error })
}

async function handleUiRequest(requestId: string, uiType: string, payload?: unknown): Promise<void> {
  const window = getMainWindow()
  if (!window || window.isDestroyed()) {
    sendUiResponse(requestId, false, undefined, 'Main window unavailable')
    return
  }

  if (uiType === 'inputBox') {
    const inputPayload = payload as { prompt?: string; placeHolder?: string; value?: string }
    const promptText = inputPayload.prompt || inputPayload.placeHolder || 'Enter value'
    const defaultValue = inputPayload.value ?? ''
    const script = `window.prompt(${JSON.stringify(promptText)}, ${JSON.stringify(defaultValue)})`
    const result = await window.webContents.executeJavaScript(script, true)
    sendUiResponse(requestId, true, result ?? undefined)
    return
  }

  if (uiType === 'quickPick') {
    const pickPayload = payload as { items?: Array<{ label: string; description?: string }>; placeHolder?: string; canPickMany?: boolean }
    const items = pickPayload.items ?? []
    const header = pickPayload.placeHolder || 'Select an item'
    const lines = items.map((item, index) => {
      const description = item.description ? ` - ${item.description}` : ''
      return `${index + 1}. ${item.label}${description}`
    }).join('\n')
    const footer = pickPayload.canPickMany ? 'Enter numbers separated by commas:' : 'Enter number:'
    const promptText = `${header}\n${lines}\n${footer}`
    const rawInput = await window.webContents.executeJavaScript(`window.prompt(${JSON.stringify(promptText)}, '')`, true)
    if (!rawInput || typeof rawInput !== 'string') {
      sendUiResponse(requestId, true, undefined)
      return
    }
    const trimmed = rawInput.trim()
    if (!trimmed) {
      sendUiResponse(requestId, true, undefined)
      return
    }
    if (pickPayload.canPickMany) {
      const indices = trimmed
        .split(',')
        .map(part => Number.parseInt(part.trim(), 10) - 1)
        .filter(index => Number.isFinite(index) && index >= 0 && index < items.length)
      sendUiResponse(requestId, true, indices.length > 0 ? indices : undefined)
      return
    }
    const index = Number.parseInt(trimmed, 10) - 1
    if (Number.isFinite(index) && index >= 0 && index < items.length) {
      sendUiResponse(requestId, true, index)
      return
    }
    const matched = items.findIndex(item => item.label === trimmed)
    sendUiResponse(requestId, true, matched >= 0 ? matched : undefined)
    return
  }

  if (uiType === 'openDialog') {
    const openPayload = payload as { canSelectFiles?: boolean; canSelectFolders?: boolean; canSelectMany?: boolean; defaultPath?: string }
    const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = []
    if (openPayload.canSelectFolders) {
      properties.push('openDirectory')
    }
    if (openPayload.canSelectFiles !== false) {
      properties.push('openFile')
    }
    if (openPayload.canSelectMany) {
      properties.push('multiSelections')
    }
    const result = await dialog.showOpenDialog(window, {
      defaultPath: openPayload.defaultPath,
      properties
    })
    sendUiResponse(requestId, true, result.canceled ? undefined : result.filePaths)
    return
  }

  if (uiType === 'saveDialog') {
    const savePayload = payload as { defaultPath?: string }
    const result = await dialog.showSaveDialog(window, {
      defaultPath: savePayload.defaultPath
    })
    sendUiResponse(requestId, true, result.canceled ? undefined : result.filePath)
    return
  }

  if (uiType === 'command') {
    const commandPayload = payload as { command?: string; args?: unknown[] }
    const script = `window.__logosHandleExtensionCommand ? window.__logosHandleExtensionCommand(${JSON.stringify(commandPayload)}) : Promise.resolve(undefined)`
    const result = await window.webContents.executeJavaScript(script, true)
    sendUiResponse(requestId, true, result ?? undefined)
    return
  }

  sendUiResponse(requestId, false, undefined, `Unsupported UI request: ${uiType}`)
}

function handleHostExit(code: number | null, signal: NodeJS.Signals | null): void {
  hostProcess = null
  hostState = {
    status: 'stopped',
    error: code === 0 ? undefined : `Exited with code ${code ?? 'null'} (${signal ?? 'no-signal'})`
  }
  for (const [requestId, pending] of pendingHostRequests.entries()) {
    pending.reject(new Error('Extension host exited'))
    pendingHostRequests.delete(requestId)
  }
  publishHostState()
  cleanupVscodeIpcServer().catch((error) => {
    console.warn('[extension-host] Failed to cleanup VS Code IPC server:', error)
  })
}

function handleHostError(error: Error): void {
  hostState = { status: 'error', error: error.message }
  for (const [requestId, pending] of pendingHostRequests.entries()) {
    pending.reject(error)
    pendingHostRequests.delete(requestId)
  }
  publishHostState()
}

function requestHostReload(): void {
  if (hostProcess && hostState.status === 'running') {
    hostProcess.send?.({ type: 'reloadExtensions' })
  }
}

async function requestHost<T>(payload: Record<string, unknown>): Promise<T> {
  if (getHostMode() === 'vscode') {
    throw new Error('VS Code extension host bridge is not wired yet')
  }
  if (!hostProcess || hostState.status !== 'running') {
    throw new Error('Extension host is not running')
  }
  requestCounter += 1
  const requestId = `req_${Date.now()}_${requestCounter}`
  return new Promise<T>((resolve, reject) => {
    pendingHostRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
    hostProcess?.send?.({ ...payload, requestId })
  })
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
  const hostMode = getHostMode()

  hostState = { status: 'starting' }
  publishHostState()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    LOGOS_EXTENSIONS_DIR: extensionsRoot,
    LOGOS_WORKSPACE_ROOT: workspaceRoot ?? ''
  }

  if (hostMode === 'vscode') {
    const ipcHandle = await ensureVscodeIpcServer()
    env.LOGOS_VSCODE_ROOT = path.resolve(process.cwd(), 'vendor', 'vscode')
    env.VSCODE_EXTHOST_IPC_HOOK = ipcHandle
    env.LOGOS_EXT_HOST_STUB = ''
  } else {
    env.LOGOS_EXT_HOST_STUB = '1'
  }

  const maxOldSpace = env.LOGOS_EXT_HOST_MAX_OLD_SPACE ?? '4096'
  const nodeOptions = `--max-old-space-size=${maxOldSpace}`
  env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${nodeOptions}` : nodeOptions
  const execPath = env.LOGOS_EXT_HOST_EXEC_PATH || process.execPath
  if (execPath !== process.execPath) {
    delete env.ELECTRON_RUN_AS_NODE
  }
  const execArgv = execPath === process.execPath ? [] : [`--max-old-space-size=${maxOldSpace}`]
  hostProcess = fork(entry, [], {
    execPath,
    execArgv,
    env,
    serialization: 'advanced',
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })

  hostProcess.on('message', handleHostMessage)
  hostProcess.on('exit', handleHostExit)
  hostProcess.on('error', handleHostError)

  hostProcess.stdout?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.log(text)
    }
  })

  hostProcess.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(text)
    }
  })

  return hostState
}

export async function stopExtensionHost(): Promise<void> {
  if (!hostProcess) {
    hostState = { status: 'stopped' }
    publishHostState()
    await cleanupVscodeIpcServer()
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
      cleanupVscodeIpcServer().then(resolve).catch(() => resolve())
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

async function postJson<T>(url: string, payload: unknown, headers: Record<string, string>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Marketplace request failed (${response.statusCode})`))
          return
        }
        try {
          resolve(JSON.parse(raw) as T)
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
    request.write(JSON.stringify(payload))
    request.end()
  })
}

function extractMarketplaceExtensions(payload: unknown): MarketplaceExtensionInfo[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const results = payload as { results?: Array<{ extensions?: unknown[] }> }
  const extensions = results.results?.[0]?.extensions as Array<Record<string, unknown>> | undefined
  if (!extensions) {
    return []
  }

  return extensions.map((extension) => {
    const publisher = (extension.publisher as { publisherName?: string })?.publisherName || 'unknown'
    const name = (extension.extensionName as string) || 'unknown'
    const displayName = extension.displayName as string | undefined
    const description = extension.shortDescription as string | undefined
    const versions = (extension.versions as Array<Record<string, unknown>> | undefined) || []
    const latest = versions[0] || {}
    const version = latest.version as string | undefined
    const files = (latest.files as Array<Record<string, unknown>> | undefined) || []

    const iconAsset = files.find(file => file.assetType === 'Microsoft.VisualStudio.Services.Icons.Default')
    const vsixAsset = files.find(file => file.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')

    const statistics = (extension.statistics as Array<Record<string, unknown>> | undefined) || []
    const installs = statistics.find(stat => stat.statisticName === 'install')
    const downloads = typeof installs?.value === 'number' ? installs.value : undefined

    const downloadUrl = (vsixAsset?.source as string | undefined) || (version ? `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${version}/vspackage` : undefined)

    return {
      id: `${publisher}.${name}`,
      publisher,
      name,
      displayName,
      description,
      version,
      downloads,
      iconUrl: iconAsset?.source as string | undefined,
      downloadUrl
    }
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

export async function searchMarketplace(query: string, size = 10): Promise<MarketplaceExtensionInfo[]> {
  if (!query.trim()) {
    return []
  }

  const payload = {
    filters: [
      {
        criteria: [
          { filterType: 10, value: query },
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' }
        ],
        pageNumber: 1,
        pageSize: size,
        sortBy: 0,
        sortOrder: 0
      }
    ],
    flags: 387
  }

  const response = await postJson<Record<string, unknown>>(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    payload,
    {
      Accept: 'application/json;api-version=7.2-preview.1',
      'User-Agent': 'Logos'
    }
  )

  return extractMarketplaceExtensions(response)
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
    const trusted = state.extensions[id]?.trusted ?? false
    state.extensions[id] = {
      enabled,
      installedAt: Date.now(),
      trusted
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
      trusted,
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

export async function setExtensionTrusted(extensionId: string, trusted: boolean): Promise<void> {
  const state = await loadExtensionState()
  const entry = state.extensions[extensionId] ?? { enabled: false }
  entry.trusted = trusted
  if (!trusted) {
    entry.enabled = false
  }
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
      const trusted = state.extensions[id]?.trusted ?? true

      results.push({
        id,
        name,
        publisher,
        version: manifest.version,
        displayName: manifest.displayName,
        description: manifest.description,
        path: extensionPath,
        enabled,
        trusted,
        iconPath: await resolveIconPath(extensionPath, manifest.icon),
        categories: manifest.categories
      })
    } catch {
      results.push({
        id: entry.name,
        name: entry.name,
        path: extensionPath,
        enabled: state.extensions[entry.name]?.enabled ?? true,
        trusted: state.extensions[entry.name]?.trusted ?? true
      })
    }
  }

  return results
}

export async function listUiContributions(): Promise<ExtensionUiContributions> {
  const root = await ensureExtensionsRoot()
  const state = await loadExtensionState()
  const entries = await fs.readdir(root, { withFileTypes: true })
  const containers: ExtensionViewContainer[] = []
  const views: ExtensionView[] = []
  const scmTitleActions: ExtensionScmTitleAction[] = []

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
      const { id: extensionId } = buildExtensionId(manifest)
      const enabled = state.extensions[extensionId]?.enabled ?? true
      const trusted = state.extensions[extensionId]?.trusted ?? true
      if (!enabled || !trusted) {
        continue
      }

      const activitybar = manifest.contributes?.viewsContainers?.activitybar ?? []
      for (const container of activitybar) {
        const iconPath = container.icon ? await resolveIconPath(extensionPath, container.icon) : undefined
        containers.push({
          id: container.id,
          title: container.title || container.id,
          iconPath,
          extensionId
        })
      }

      const commandEntries = manifest.contributes?.commands ?? []
      const commandMeta = new Map<string, { title?: string; icon?: string | { light?: string; dark?: string } }>()
      for (const entry of commandEntries) {
        if (!entry?.command) {
          continue
        }
        commandMeta.set(entry.command, { title: entry.title, icon: entry.icon })
      }

      const menus = manifest.contributes?.menus ?? {}
      const scmTitle = menus['scm/title'] ?? []
      if (Array.isArray(scmTitle)) {
        for (const menuEntry of scmTitle) {
          if (!menuEntry?.command) {
            continue
          }
          const meta = commandMeta.get(menuEntry.command)
          let iconPath: string | undefined
          let iconPathLight: string | undefined
          let iconPathDark: string | undefined
          const icon = meta?.icon
          if (typeof icon === 'string') {
            iconPath = await resolveIconPath(extensionPath, icon)
          } else if (icon && typeof icon === 'object') {
            if (icon.light) {
              iconPathLight = await resolveIconPath(extensionPath, icon.light)
            }
            if (icon.dark) {
              iconPathDark = await resolveIconPath(extensionPath, icon.dark)
            }
          }
          scmTitleActions.push({
            id: `${extensionId}:${menuEntry.command}`,
            title: meta?.title || menuEntry.command,
            group: menuEntry.group,
            when: menuEntry.when,
            command: menuEntry.command,
            extensionId,
            iconPath,
            iconPathLight,
            iconPathDark
          })
        }
      }

      const contributesViews = manifest.contributes?.views ?? {}
      for (const [containerId, viewEntries] of Object.entries(contributesViews)) {
        if (!Array.isArray(viewEntries)) {
          continue
        }
        for (const viewEntry of viewEntries) {
          if (!viewEntry?.id) {
            continue
          }
          views.push({
            id: viewEntry.id,
            name: viewEntry.name || viewEntry.id,
            containerId,
            extensionId
          })
        }
      }
    } catch (error) {
      console.warn('[extension-host] failed to read UI contributions:', error)
    }
  }

  console.info('[extension-host] UI contributions', {
    containers: containers.length,
    views: views.length,
    scmTitleActions: scmTitleActions.length
  })
  return { containers, views, scmTitleActions }
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

  ipcMain.handle('extensions:listUiContributions', async () => {
    return await listUiContributions()
  })

  ipcMain.handle('extensions:installVsix', async (_event, vsixPath: string) => {
    return await installVsix(vsixPath)
  })

  ipcMain.handle('extensions:installFromUrl', async (_event, url: string) => {
    return await installVsixFromUrl(url)
  })

  ipcMain.handle('extensions:marketplaceSearch', async (_event, query: string, size?: number) => {
    return await searchMarketplace(query, size)
  })

  ipcMain.handle('extensions:uninstall', async (_event, extensionId: string) => {
    await uninstallExtension(extensionId)
    return true
  })

  ipcMain.handle('extensions:setEnabled', async (_event, extensionId: string, enabled: boolean) => {
    await setExtensionEnabled(extensionId, enabled)
    return true
  })

  ipcMain.handle('extensions:setTrusted', async (_event, extensionId: string, trusted: boolean) => {
    await setExtensionTrusted(extensionId, trusted)
    return true
  })

  ipcMain.handle('extensions:setWorkspaceRoot', async (_event, rootPath: string | null) => {
    await setWorkspaceRoot(rootPath)
    return true
  })

  ipcMain.handle('extensions:notifyDocumentOpen', async (_event, payload: { uri: string; languageId: string; content: string; version: number }) => {
    hostProcess?.send?.({ type: 'documentOpen', document: payload })
    return true
  })

  ipcMain.handle('extensions:notifyDocumentChange', async (_event, payload: { uri: string; languageId: string; content: string; version: number }) => {
    hostProcess?.send?.({ type: 'documentChange', document: payload })
    return true
  })

  ipcMain.handle('extensions:notifyDocumentClose', async (_event, payload: { uri: string }) => {
    hostProcess?.send?.({ type: 'documentClose', uri: payload.uri })
    return true
  })

  ipcMain.handle('extensions:notifyActiveEditorChange', async (_event, payload: { uri: string | null; selection?: { start: { line: number; character: number }; end: { line: number; character: number } } }) => {
    hostProcess?.send?.({ type: 'activeEditorChange', uri: payload.uri, selection: payload.selection })
    return true
  })

  ipcMain.handle('extensions:notifySelectionChange', async (_event, payload: { uri: string; selection: { start: { line: number; character: number }; end: { line: number; character: number } } }) => {
    hostProcess?.send?.({ type: 'selectionChange', uri: payload.uri, selection: payload.selection })
    return true
  })

  ipcMain.handle('extensions:provideCompletions', async (_event, payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string } }) => {
    try {
      return await requestHost({ type: 'provideCompletions', payload })
    } catch {
      return { items: [], isIncomplete: false }
    }
  })

  ipcMain.handle('extensions:provideInlineCompletions', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideInlineCompletions', payload })
    } catch {
      return { items: [] }
    }
  })

  ipcMain.handle('extensions:provideHover', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideHover', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:provideDefinition', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideDefinition', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideReferences', async (_event, payload: { uri: string; position: { line: number; character: number }; context?: { includeDeclaration?: boolean } }) => {
    try {
      return await requestHost({ type: 'provideReferences', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideImplementation', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideImplementation', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideTypeDefinition', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideTypeDefinition', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideDeclaration', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'provideDeclaration', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideDocumentSymbols', async (_event, payload: { uri: string }) => {
    try {
      return await requestHost({ type: 'provideDocumentSymbols', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideSignatureHelp', async (_event, payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string; isRetrigger?: boolean } }) => {
    try {
      return await requestHost({ type: 'provideSignatureHelp', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:provideRenameEdits', async (_event, payload: { uri: string; position: { line: number; character: number }; newName: string }) => {
    try {
      return await requestHost({ type: 'provideRenameEdits', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:prepareRename', async (_event, payload: { uri: string; position: { line: number; character: number } }) => {
    try {
      return await requestHost({ type: 'prepareRename', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:provideCodeActions', async (_event, payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; context?: { only?: string; triggerKind?: number } }) => {
    try {
      return await requestHost({ type: 'provideCodeActions', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideFormattingEdits', async (_event, payload: { uri: string; options?: { tabSize: number; insertSpaces: boolean } }) => {
    try {
      return await requestHost({ type: 'provideFormattingEdits', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideRangeFormattingEdits', async (_event, payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; options?: { tabSize: number; insertSpaces: boolean } }) => {
    try {
      return await requestHost({ type: 'provideRangeFormattingEdits', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideOnTypeFormattingEdits', async (_event, payload: { uri: string; position: { line: number; character: number }; ch: string; options?: { tabSize: number; insertSpaces: boolean } }) => {
    try {
      return await requestHost({ type: 'provideOnTypeFormattingEdits', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideCodeLenses', async (_event, payload: { uri: string }) => {
    try {
      return await requestHost({ type: 'provideCodeLenses', payload })
    } catch {
      return []
    }
  })

  ipcMain.handle('extensions:provideTextDocumentContent', async (_event, payload: { uri: string }) => {
    try {
      return await requestHost({ type: 'provideTextDocumentContent', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:resolveWebviewView', async (_event, payload: { viewId: string }) => {
    try {
      return await requestHost({ type: 'resolveWebviewView', payload })
    } catch {
      return null
    }
  })

  ipcMain.handle('extensions:postWebviewMessage', async (_event, payload: { handle: string; message: unknown }) => {
    try {
      if (process.env.LOGOS_EXT_HOST_DEBUG_IPC === '1') {
        const message = payload?.message
        if (typeof message === 'string') {
          console.info('[extension-host] webviewPostMessage', { handle: payload.handle, messageLen: message.length })
        } else if (message && typeof message === 'object') {
          const keys = Object.keys(message as Record<string, unknown>)
          const detail: Record<string, number> = {}
          for (const key of ['text', 'html', 'content', 'data', 'payload', 'body', 'value']) {
            const value = (message as Record<string, unknown>)[key]
            if (typeof value === 'string') {
              detail[`${key}Len`] = value.length
            }
          }
          console.info('[extension-host] webviewPostMessage', { handle: payload.handle, messageKeys: keys.length, ...detail })
        } else {
          console.info('[extension-host] webviewPostMessage', { handle: payload.handle, messageType: typeof message })
        }
      }
      await requestHost({ type: 'webviewPostMessage', payload })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('extensions:disposeWebviewView', async (_event, payload: { handle: string }) => {
    try {
      await requestHost({ type: 'webviewDispose', payload })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('extensions:disposeWebviewPanel', async (_event, payload: { handle: string }) => {
    try {
      await requestHost({ type: 'webviewDispose', payload })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('extensions:executeCommand', async (_event, payload: { command: string; args?: unknown[] }) => {
    try {
      return await requestHost({ type: 'executeCommand', payload })
    } catch (error) {
      console.error('[extension-host] executeCommand failed:', error)
      return null
    }
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
