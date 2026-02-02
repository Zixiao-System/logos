/**
 * Extension Host Process Entry
 *
 * Prefer the VS Code OSS extensionHostProcess when available.
 * Falls back to the legacy stub if the vendor entry cannot be loaded.
 */

import path from 'path'
import { existsSync, readFileSync, createWriteStream } from 'fs'
import v8 from 'v8'
import Module from 'module'
import { ExtensionHost } from './extension-host/loader'
import {
  __internalSetMainBridge,
  vscodeModule,
  __internalOpenDocument,
  __internalChangeDocument,
  __internalCloseDocument,
  __internalSetActiveEditor,
  __internalSetSelection,
  __internalProvideCompletions,
  __internalProvideInlineCompletions,
  __internalProvideHover,
  __internalProvideDefinition,
  __internalProvideReferences,
  __internalProvideImplementation,
  __internalProvideTypeDefinition,
  __internalProvideDeclaration,
  __internalProvideDocumentSymbols,
  __internalProvideSignatureHelp,
  __internalProvideRenameEdits,
  __internalPrepareRename,
  __internalProvideCodeActions,
  __internalProvideFormattingEdits,
  __internalProvideRangeFormattingEdits,
  __internalProvideOnTypeFormattingEdits,
  __internalProvideCodeLenses,
  __internalProvideTextDocumentContent,
  __internalResolveWebviewView,
  __internalWebviewPostMessage,
  __internalWebviewDispose,
  __internalExecuteCommand
} from './extension-host/vscode-api-stub'

function log(message: string, ...args: any[]): void {
  console.log(`[extension-host] ${message}`, ...args)
}

const debugMem = process.env.LOGOS_EXT_HOST_DEBUG_MEM === '1'
const debugIpc = process.env.LOGOS_EXT_HOST_DEBUG_IPC === '1'
const debugByteLength = process.env.LOGOS_EXT_HOST_DEBUG_BYTE_LENGTH === '1'
const byteLengthLimit = Number.parseInt(process.env.LOGOS_EXT_HOST_BYTE_LENGTH_LIMIT ?? '5000000', 10)

const autoHeapSnapshot = process.env.LOGOS_EXT_HOST_AUTO_HEAP_SNAPSHOT === '1'
const heapSnapshotThresholdMb = Number.parseInt(process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_THRESHOLD_MB ?? '2200', 10)
const heapSnapshotRssThresholdMb = Number.parseInt(process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_RSS_THRESHOLD_MB ?? '0', 10)
const heapSnapshotOnStartup = process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_ON_STARTUP === '1'
const stripInlineSourceMap = process.env.LOGOS_EXT_HOST_STRIP_INLINE_SOURCEMAP !== '0'
const disableSourceMapSupport =
  process.env.LOGOS_EXT_HOST_DISABLE_SOURCEMAP_SUPPORT === '1' ||
  (process.env.LOGOS_EXT_HOST_DISABLE_SOURCEMAP_SUPPORT == null && process.env.NODE_ENV !== 'production')
const blockExtensionMaps =
  process.env.LOGOS_EXT_HOST_BLOCK_EXTENSION_MAPS === '1' ||
  (process.env.LOGOS_EXT_HOST_BLOCK_EXTENSION_MAPS == null && process.env.NODE_ENV !== 'production')
const ipcMaxBytes = Number.parseInt(process.env.LOGOS_EXT_HOST_IPC_MAX_BYTES ?? '2000000', 10)
const dropLargeIpc =
  process.env.LOGOS_EXT_HOST_IPC_DROP_LARGE === '1' ||
  (process.env.LOGOS_EXT_HOST_IPC_DROP_LARGE == null && process.env.NODE_ENV !== 'production')
const webviewMsgRateLimit = Number.parseInt(process.env.LOGOS_EXT_HOST_WEBVIEW_MSG_RATE_LIMIT ?? '60', 10)
const webviewMsgBurst = Number.parseInt(process.env.LOGOS_EXT_HOST_WEBVIEW_MSG_BURST ?? '120', 10)
const logLargeModules = process.env.LOGOS_EXT_HOST_LOG_MODULES === '1'
const largeModuleThreshold = Number.parseInt(process.env.LOGOS_EXT_HOST_LARGE_MODULE_THRESHOLD ?? '5000000', 10)
let heapSnapshotCaptured = false

function takeHeapSnapshot(reason: string): void {
  if (heapSnapshotCaptured) return
  heapSnapshotCaptured = true
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '')
    const filename = `Heap-${ts}-${process.pid}.heapsnapshot`
    const outPath = path.join(process.cwd(), filename)
    log(`heapSnapshot start reason=${reason} path=${outPath}`)
    const stream = v8.getHeapSnapshot()
    const out = createWriteStream(outPath)
    stream.pipe(out)
    out.on('finish', () => {
      log(`heapSnapshot done path=${outPath}`)
    })
    out.on('error', (err) => {
      log(`heapSnapshot error ${err instanceof Error ? err.message : String(err)}`)
    })
  } catch (error) {
    log(`heapSnapshot failed ${error instanceof Error ? error.message : String(error)}`)
  }
}

function maybeSnapshotOnMemory(reason: string): void {
  if (!autoHeapSnapshot || heapSnapshotCaptured) return
  const mem = process.memoryUsage()
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024)
  const rssMb = Math.round(mem.rss / 1024 / 1024)
  if (heapUsedMb >= heapSnapshotThresholdMb) {
    takeHeapSnapshot(`${reason}-heapUsedMb=${heapUsedMb}`)
    return
  }
  if (heapSnapshotRssThresholdMb > 0 && rssMb >= heapSnapshotRssThresholdMb) {
    takeHeapSnapshot(`${reason}-rssMb=${rssMb}`)
  }
}

if (debugByteLength) {
  const originalByteLength = Buffer.byteLength
  Buffer.byteLength = function patchedByteLength(value: string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView, encoding?: BufferEncoding): number {
    if (typeof value === 'string' && value.length > byteLengthLimit) {
      log(`byteLength large string len=${value.length}`)
      if (process.env.LOGOS_EXT_HOST_DEBUG_BYTE_LENGTH_STACK === '1') {
        const stack = new Error().stack
        if (stack) {
          log(`byteLength stack:\\n${stack}`)
        }
      }
      return value.length
    }
    return originalByteLength(value as any, encoding as any)
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return `${bytes}`
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(1)} ${units[idx]}`
}

function truncateString(value: string, limit: number): string {
  if (value.length <= limit) {
    return value
  }
  return `${value.slice(0, limit)}…[truncated len=${value.length}]`
}

function sanitizePayloadForIpc(payload: unknown): { payload: unknown; truncated: boolean } {
  if (!dropLargeIpc) {
    return { payload, truncated: false }
  }
  if (payload == null) {
    return { payload, truncated: false }
  }
  if (typeof payload === 'string') {
    if (payload.length > ipcMaxBytes) {
      return { payload: truncateString(payload, ipcMaxBytes), truncated: true }
    }
    return { payload, truncated: false }
  }
  if (Buffer.isBuffer(payload)) {
    if (payload.length > ipcMaxBytes) {
      return { payload: { __logosOmittedBinary: payload.length }, truncated: true }
    }
    return { payload, truncated: false }
  }
  if (ArrayBuffer.isView(payload)) {
    const len = payload.byteLength ?? 0
    if (len > ipcMaxBytes) {
      return { payload: { __logosOmittedBinary: len }, truncated: true }
    }
    return { payload, truncated: false }
  }
  if (payload instanceof ArrayBuffer) {
    if (payload.byteLength > ipcMaxBytes) {
      return { payload: { __logosOmittedBinary: payload.byteLength }, truncated: true }
    }
    return { payload, truncated: false }
  }
  if (Array.isArray(payload)) {
    if (payload.length > 1000) {
      return { payload: { __logosOmittedArray: payload.length }, truncated: true }
    }
    return { payload, truncated: false }
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    let truncated = false
    const sanitized: Record<string, unknown> = { ...obj }
    for (const key of ['html', 'text', 'content', 'data', 'payload', 'body', 'value', 'message']) {
      const value = obj[key]
      if (typeof value === 'string' && value.length > ipcMaxBytes) {
        sanitized[key] = truncateString(value, ipcMaxBytes)
        sanitized[`${key}Len`] = value.length
        truncated = true
      }
    }
    return { payload: truncated ? sanitized : payload, truncated }
  }
  return { payload, truncated: false }
}

function summarizePayload(payload: unknown): string {
  if (payload == null) return 'payload=null'
  if (typeof payload === 'string') {
    return `payload=string(len=${payload.length})`
  }
  if (Buffer.isBuffer(payload)) {
    return `payload=buffer(${formatBytes(payload.length)})`
  }
  if (Array.isArray(payload)) {
    return `payload=array(len=${payload.length})`
  }
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const keys = Object.keys(obj)
    const details: string[] = []
    if (typeof obj.html === 'string') {
      details.push(`htmlLen=${obj.html.length}`)
    }
    if (typeof obj.text === 'string') {
      details.push(`textLen=${obj.text.length}`)
    }
    if (typeof obj.content === 'string') {
      details.push(`contentLen=${obj.content.length}`)
    }
    if (obj.message != null && typeof obj.message === 'string') {
      details.push(`messageLen=${obj.message.length}`)
    }
    if (obj.data != null && typeof obj.data === 'string') {
      details.push(`dataLen=${obj.data.length}`)
    }
    return `payload=object(keys=${keys.length}${details.length ? `, ${details.join(', ')}` : ''})`
  }
  return `payload=${typeof payload}`
}

type WebviewRateState = { count: number; windowStart: number; dropped: number }
const webviewRateByHandle = new Map<string, WebviewRateState>()

function shouldDropWebviewMessage(handle: string): boolean {
  if (webviewMsgRateLimit <= 0) {
    return false
  }
  const now = Date.now()
  const state = webviewRateByHandle.get(handle)
  if (!state) {
    webviewRateByHandle.set(handle, { count: 1, windowStart: now, dropped: 0 })
    return false
  }
  if (now - state.windowStart >= 1000) {
    state.count = 1
    state.windowStart = now
    state.dropped = 0
    return false
  }
  state.count += 1
  if (state.count > webviewMsgRateLimit + webviewMsgBurst) {
    state.dropped += 1
    if (state.dropped === 1 || state.dropped % 100 === 0) {
      log(`webviewPostMessage dropped handle=${handle} dropped=${state.dropped}`)
    }
    return true
  }
  return false
}

const VENDOR_ENTRY_TS = 'src/vs/workbench/api/node/extensionHostProcess.ts'
const VENDOR_ENTRY_JS = 'out/vs/workbench/api/node/extensionHostProcess.js'
const FALLBACK_ENV = 'LOGOS_EXT_HOST_STUB'

const candidateRoots = [
  process.env.LOGOS_VSCODE_ROOT,
  path.resolve(process.cwd(), 'vendor', 'vscode'),
  path.resolve(process.cwd(), '..', 'vscode')
].filter((value): value is string => Boolean(value))

const vendorEntry = findVendorEntry(candidateRoots)
const vendorLoaded = process.env[FALLBACK_ENV] ? false : loadVendorEntry(vendorEntry)

if (vendorLoaded) {
  sendEvent({ type: 'ready', pid: process.pid, mode: 'vscode' })
} else {
  startStub()
}

function findVendorEntry(roots: string[]): string | null {
  for (const root of roots) {
    const jsEntry = path.join(root, VENDOR_ENTRY_JS)
    if (existsSync(jsEntry)) {
      return jsEntry
    }
    const tsEntry = path.join(root, VENDOR_ENTRY_TS)
    if (existsSync(tsEntry)) {
      return tsEntry
    }
  }
  return null
}

function loadVendorEntry(entry: string | null): boolean {
  if (!entry) {
    return false
  }

  if (entry.endsWith('.ts')) {
    if (!safeRequire('ts-node/register/transpile-only')) {
      console.error('[extension-host] ts-node/register/transpile-only not available; cannot load TS entry.')
      return false
    }
  }

  if (!safeRequire(entry)) {
    console.error('[extension-host] Failed to load VS Code extension host entry:', entry)
    return false
  }

  return true
}

function safeRequire(modulePath: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(modulePath)
    return true
  } catch (error) {
    console.error('[extension-host] require failed:', modulePath, error)
    return false
  }
}

// ============================================================================
// Legacy stub (kept as fallback until VS Code vendor tree is fully wired)
// ============================================================================

/**
 * Type definitions for host messages from main process
 */
type HostMessage =
  | { type: 'ping' }
  | { type: 'shutdown' }
  | { type: 'setWorkspaceRoot'; root?: string | null }
  | { type: 'reloadExtensions' }
  | { type: 'documentOpen'; document: { uri: string; languageId: string; content: string; version: number } }
  | { type: 'documentChange'; document: { uri: string; languageId: string; content: string; version: number } }
  | { type: 'documentClose'; uri: string }
  | { type: 'activeEditorChange'; uri: string | null; selection?: { start: { line: number; character: number }; end: { line: number; character: number } } }
  | { type: 'selectionChange'; uri: string; selection: { start: { line: number; character: number }; end: { line: number; character: number } } }
  | { type: 'provideCompletions'; requestId: string; payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string } } }
  | { type: 'provideInlineCompletions'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideHover'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideDefinition'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideReferences'; requestId: string; payload: { uri: string; position: { line: number; character: number }; context?: { includeDeclaration?: boolean } } }
  | { type: 'provideImplementation'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideTypeDefinition'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideDeclaration'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideDocumentSymbols'; requestId: string; payload: { uri: string } }
  | { type: 'provideSignatureHelp'; requestId: string; payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string; isRetrigger?: boolean } } }
  | { type: 'provideRenameEdits'; requestId: string; payload: { uri: string; position: { line: number; character: number }; newName: string } }
  | { type: 'prepareRename'; requestId: string; payload: { uri: string; position: { line: number; character: number } } }
  | { type: 'provideCodeActions'; requestId: string; payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; context?: { only?: string; triggerKind?: number } } }
  | { type: 'provideFormattingEdits'; requestId: string; payload: { uri: string; options?: { tabSize: number; insertSpaces: boolean } } }
  | { type: 'provideRangeFormattingEdits'; requestId: string; payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; options?: { tabSize: number; insertSpaces: boolean } } }
  | { type: 'provideOnTypeFormattingEdits'; requestId: string; payload: { uri: string; position: { line: number; character: number }; ch: string; options?: { tabSize: number; insertSpaces: boolean } } }
  | { type: 'provideCodeLenses'; requestId: string; payload: { uri: string } }
  | { type: 'provideTextDocumentContent'; requestId: string; payload: { uri: string } }
  | { type: 'resolveWebviewView'; requestId: string; payload: { viewId: string } }
  | { type: 'webviewPostMessage'; requestId: string; payload: { handle: string; message: unknown } }
  | { type: 'webviewDispose'; requestId: string; payload: { handle: string } }
  | { type: 'executeCommand'; requestId: string; payload: { command: string; args?: unknown[] } }
  | { type: 'uiResponse'; requestId: string; ok: boolean; result?: unknown; error?: string }

/**
 * Type definitions for host events sent to main process
 */
type HostEvent =
  | { type: 'ready'; pid: number; mode?: 'vscode' | 'logos' }
  | { type: 'pong'; pid: number }
  | { type: 'rpcResponse'; requestId: string; ok: boolean; payload?: unknown; error?: string }

/**
 * Send event to main process
 */
function sendEvent(event: HostEvent): void {
  if (process.send) {
    let payload = (event as { payload?: unknown }).payload
    if ('payload' in event) {
      const sanitized = sanitizePayloadForIpc(payload)
      payload = sanitized.payload
      if (sanitized.truncated) {
        log(`IPC payload truncated for event=${event.type}`)
      }
      ;(event as { payload?: unknown }).payload = payload
    }
    if (debugIpc) {
      const info = 'payload' in event ? summarizePayload((event as { payload?: unknown }).payload) : 'payload=none'
      log(`IPC send ${event.type} ${info}`)
    }
    process.send(event)
  }
}

function startStub(): void {
  log('Extension Host process started (pid: %d)', process.pid)
  log('LOGOS_WORKSPACE_ROOT:', process.env.LOGOS_WORKSPACE_ROOT)
  log('LOGOS_EXTENSIONS_DIR:', process.env.LOGOS_EXTENSIONS_DIR)
  log('CWD:', process.cwd())
  log('AUTO_HEAP_SNAPSHOT:', process.env.LOGOS_EXT_HOST_AUTO_HEAP_SNAPSHOT ?? 'unset')
  log('HEAP_SNAPSHOT_THRESHOLD_MB:', process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_THRESHOLD_MB ?? 'unset')
  log('HEAP_SNAPSHOT_RSS_THRESHOLD_MB:', process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_RSS_THRESHOLD_MB ?? 'unset')
  log('HEAP_SNAPSHOT_ON_STARTUP:', process.env.LOGOS_EXT_HOST_HEAP_SNAPSHOT_ON_STARTUP ?? 'unset')
  log('DISABLE_SOURCEMAP_SUPPORT:', process.env.LOGOS_EXT_HOST_DISABLE_SOURCEMAP_SUPPORT ?? 'unset')
  log('BLOCK_EXTENSION_MAPS:', process.env.LOGOS_EXT_HOST_BLOCK_EXTENSION_MAPS ?? 'unset')
  log('IPC_DROP_LARGE:', process.env.LOGOS_EXT_HOST_IPC_DROP_LARGE ?? 'unset')
  log('IPC_MAX_BYTES:', process.env.LOGOS_EXT_HOST_IPC_MAX_BYTES ?? 'unset')
  log('WEBVIEW_MSG_RATE_LIMIT:', process.env.LOGOS_EXT_HOST_WEBVIEW_MSG_RATE_LIMIT ?? 'unset')
  log('WEBVIEW_MSG_BURST:', process.env.LOGOS_EXT_HOST_WEBVIEW_MSG_BURST ?? 'unset')
  if (autoHeapSnapshot) {
    if (heapSnapshotOnStartup) {
      takeHeapSnapshot('startup-immediate')
    }
    process.on('uncaughtException', (error) => {
      takeHeapSnapshot(`uncaughtException:${error?.name ?? 'Error'}`)
      throw error
    })
    process.on('unhandledRejection', (reason) => {
      takeHeapSnapshot('unhandledRejection')
      log(`unhandledRejection ${reason instanceof Error ? reason.message : String(reason)}`)
    })
  }
  if (debugMem || autoHeapSnapshot) {
    setInterval(() => {
      const mem = process.memoryUsage()
      if (debugMem) {
        log(
          `mem rss=${formatBytes(mem.rss)} heapUsed=${formatBytes(mem.heapUsed)} heapTotal=${formatBytes(mem.heapTotal)} external=${formatBytes(mem.external)} arrayBuffers=${formatBytes(mem.arrayBuffers)}`
        )
      }
      maybeSnapshotOnMemory('interval')
    }, 2000)
  }

  const extensionsRoot = process.env.LOGOS_EXTENSIONS_DIR ?? ''
  const extensionsRootResolved = extensionsRoot ? path.resolve(extensionsRoot) : ''
  const extensionHost = new ExtensionHost(extensionsRoot)
  let readySent = false
  const pendingMainRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let mainRequestCounter = 0
  const originalLoad = (Module as any)._load as (request: string, parent: NodeModule | null, isMain: boolean) => unknown
  const originalJsLoader = (Module as any)._extensions['.js'] as (module: NodeModule, filename: string) => void
  const originalCjsLoader = (Module as any)._extensions['.cjs'] as ((module: NodeModule, filename: string) => void) | undefined

  if (blockExtensionMaps && extensionsRootResolved) {
    const fsModule = require('fs') as typeof import('fs')
    const originalReadFileSync = fsModule.readFileSync.bind(fsModule)
    const originalReadFile = fsModule.readFile.bind(fsModule)
    const originalReadFilePromise = fsModule.promises.readFile.bind(fsModule.promises)
    const minimalMap = JSON.stringify({ version: 3, sources: [], names: [], mappings: '' })
    const minimalMapBuffer = Buffer.from(minimalMap, 'utf8')
    const shouldBlockMap = (filename: string) => {
      const resolved = path.resolve(filename)
      return resolved.startsWith(extensionsRootResolved) && resolved.endsWith('.map')
    }
    fsModule.readFileSync = ((pathOrFd: any, options?: any) => {
      if (typeof pathOrFd === 'string' && shouldBlockMap(pathOrFd)) {
        if (options == null || options === 'utf8' || (typeof options === 'object' && options.encoding)) {
          return minimalMap
        }
        return minimalMapBuffer
      }
      return originalReadFileSync(pathOrFd, options)
    }) as typeof fsModule.readFileSync
    fsModule.readFile = ((pathOrFd: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback
      if (typeof pathOrFd === 'string' && shouldBlockMap(pathOrFd)) {
        const usesEncoding =
          options == null ||
          typeof options === 'string' ||
          (typeof options === 'object' && options.encoding)
        process.nextTick(() => cb?.(null, usesEncoding ? minimalMap : minimalMapBuffer))
        return undefined as any
      }
      return originalReadFile(pathOrFd, options as any, callback as any)
    }) as typeof fsModule.readFile
    fsModule.promises.readFile = (async (pathOrFd: any, options?: any) => {
      if (typeof pathOrFd === 'string' && shouldBlockMap(pathOrFd)) {
        const usesEncoding =
          options == null ||
          typeof options === 'string' ||
          (typeof options === 'object' && (options as { encoding?: string }).encoding)
        return usesEncoding ? minimalMap : minimalMapBuffer
      }
      return await originalReadFilePromise(pathOrFd, options as any)
    }) as typeof fsModule.promises.readFile
  }

  ;(Module as any)._load = function load(request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === 'vscode') {
      return vscodeModule
    }
    if (disableSourceMapSupport) {
      if (request === 'source-map-support' || request === 'source-map-support/register' || request === '@cspotcode/source-map-support') {
        return { install: () => undefined }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  if (extensionsRootResolved) {
    const loadAndMaybeStrip = (module: NodeModule, filename: string, fallback: (module: NodeModule, filename: string) => void) => {
      const resolved = path.resolve(filename)
      if (!resolved.startsWith(extensionsRootResolved)) {
        return fallback(module, filename)
      }
      const content = readFileSync(filename, 'utf8')
      if (logLargeModules && content.length >= largeModuleThreshold) {
        log(`large module ${resolved} len=${content.length}`)
        if (autoHeapSnapshot) {
          takeHeapSnapshot(`large-module:${path.basename(resolved)}`)
        }
      }
      if (stripInlineSourceMap && content.includes('sourceMappingURL=data:application/json;base64,')) {
        const stripped = content.replace(/\n?\/\/#[@]? sourceMappingURL=data:application\/json;base64,[^\n]+\n?/g, '\n')
        return (module as any)._compile(stripped, filename)
      }
      return (module as any)._compile(content, filename)
    }

    ;(Module as any)._extensions['.js'] = function patchedJsLoader(module: NodeModule, filename: string) {
      return loadAndMaybeStrip(module, filename, originalJsLoader)
    }
    if (originalCjsLoader) {
      ;(Module as any)._extensions['.cjs'] = function patchedCjsLoader(module: NodeModule, filename: string) {
        return loadAndMaybeStrip(module, filename, originalCjsLoader)
      }
    }
  }

  __internalSetMainBridge({
    request: (type: string, payload?: unknown) => {
      mainRequestCounter += 1
      const requestId = `main_${Date.now()}_${mainRequestCounter}`
      return new Promise((resolve, reject) => {
        pendingMainRequests.set(requestId, { resolve, reject })
        if (!process.send) {
          pendingMainRequests.delete(requestId)
          reject(new Error('Main process unavailable'))
          return
        }
        if (type === 'uiRequest' && payload && typeof payload === 'object') {
          process.send({ type, requestId, ...(payload as Record<string, unknown>) })
        } else {
          process.send({ type, requestId, payload })
        }
      })
    },
    notify: (type: string, payload?: unknown) => {
      if (!process.send) {
        return
      }
      const sanitized = sanitizePayloadForIpc(payload)
      if (sanitized.truncated) {
        log(`IPC notify payload truncated type=${type}`)
      }
      const safePayload = sanitized.payload
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        process.send({ type, ...(safePayload as Record<string, unknown>) })
      } else if (safePayload !== undefined) {
        process.send({ type, payload: safePayload })
      } else {
        process.send({ type })
      }
    }
  })

  void extensionHost.start().then(() => {
    const root = process.env.LOGOS_WORKSPACE_ROOT
    if (root) {
      extensionHost.setWorkspaceRoot(root)
    }
    if (!readySent) {
      readySent = true
      sendEvent({ type: 'ready', pid: process.pid, mode: 'logos' })
    }
  }).catch((error) => {
    console.error('[extension-host] failed to start extension host:', error)
    if (!readySent) {
      readySent = true
      sendEvent({ type: 'ready', pid: process.pid, mode: 'logos' })
    }
  })

  /**
   * Handle messages from main process
   */
  process.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') {
      return
    }

    const typedMessage = message as HostMessage
    if (debugIpc && typedMessage?.type) {
      const info = 'payload' in typedMessage ? summarizePayload((typedMessage as { payload?: unknown }).payload) : 'payload=none'
      log(`IPC recv ${typedMessage.type} ${info}`)
    }

    if (debugIpc && typedMessage.type === 'webviewPostMessage') {
      const payload = (typedMessage as { payload?: { message?: unknown } }).payload
      const message = payload?.message
      if (typeof message === 'string') {
        log(`webviewPostMessage messageLen=${message.length}`)
      } else if (message && typeof message === 'object') {
        const keys = Object.keys(message as Record<string, unknown>)
        log(`webviewPostMessage messageKeys=${keys.length}`)
        for (const key of ['text', 'html', 'content', 'data', 'payload', 'body', 'value']) {
          const value = (message as Record<string, unknown>)[key]
          if (typeof value === 'string') {
            log(`webviewPostMessage ${key}Len=${value.length}`)
          }
        }
      }
    }

    if (typedMessage.type === 'uiResponse' && typedMessage.requestId) {
      const pending = pendingMainRequests.get(typedMessage.requestId)
      if (pending) {
        pendingMainRequests.delete(typedMessage.requestId)
        if (typedMessage.ok) {
          pending.resolve(typedMessage.result)
        } else {
          pending.reject(new Error(typedMessage.error || 'UI request failed'))
        }
      }
      return
    }

    switch (typedMessage.type) {
      case 'ping':
        log('Received ping from main process')
        sendEvent({ type: 'pong', pid: process.pid })
        break

      case 'shutdown':
        log('Received shutdown signal, exiting...')
        void extensionHost.shutdown().finally(() => process.exit(0))
        break

      case 'setWorkspaceRoot':
        log('Workspace root changed:', typedMessage.root)
        extensionHost.setWorkspaceRoot(typedMessage.root ?? null)
        break

      case 'reloadExtensions':
        log('Received extension reload request')
        void extensionHost.reload()
        break

      case 'documentOpen':
        __internalOpenDocument(typedMessage.document)
        extensionHost.handleDocumentOpened(typedMessage.document.languageId)
        break

      case 'documentChange':
        __internalChangeDocument(typedMessage.document)
        break

      case 'documentClose':
        __internalCloseDocument({ uri: typedMessage.uri })
        break

      case 'activeEditorChange':
        __internalSetActiveEditor({ uri: typedMessage.uri, selection: typedMessage.selection })
        break

      case 'selectionChange':
        __internalSetSelection({ uri: typedMessage.uri, selection: typedMessage.selection })
        break

      case 'provideCompletions':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideCompletions(typedMessage.payload))
        break

      case 'provideInlineCompletions':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideInlineCompletions(typedMessage.payload))
        break

      case 'provideHover':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideHover(typedMessage.payload))
        break

      case 'provideDefinition':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideDefinition(typedMessage.payload))
        break

      case 'provideReferences':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideReferences(typedMessage.payload))
        break

      case 'provideImplementation':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideImplementation(typedMessage.payload))
        break

      case 'provideTypeDefinition':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideTypeDefinition(typedMessage.payload))
        break

      case 'provideDeclaration':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideDeclaration(typedMessage.payload))
        break

      case 'provideDocumentSymbols':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideDocumentSymbols(typedMessage.payload))
        break

      case 'provideSignatureHelp':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideSignatureHelp(typedMessage.payload))
        break

      case 'provideRenameEdits':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideRenameEdits(typedMessage.payload))
        break

      case 'prepareRename':
        void handleRequest(typedMessage.requestId, async () => await __internalPrepareRename(typedMessage.payload))
        break

      case 'provideCodeActions':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideCodeActions(typedMessage.payload))
        break

      case 'provideFormattingEdits':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideFormattingEdits(typedMessage.payload))
        break

      case 'provideRangeFormattingEdits':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideRangeFormattingEdits(typedMessage.payload))
        break

      case 'provideOnTypeFormattingEdits':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideOnTypeFormattingEdits(typedMessage.payload))
        break

      case 'provideCodeLenses':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideCodeLenses(typedMessage.payload))
        break

      case 'provideTextDocumentContent':
        void handleRequest(typedMessage.requestId, async () => await __internalProvideTextDocumentContent(typedMessage.payload))
        break

      case 'resolveWebviewView':
        void handleRequest(typedMessage.requestId, async () => {
          await extensionHost.handleViewActivated(typedMessage.payload.viewId)
          return await __internalResolveWebviewView(typedMessage.payload)
        })
        break

      case 'webviewPostMessage':
        if (typedMessage.payload?.handle && shouldDropWebviewMessage(typedMessage.payload.handle)) {
          sendEvent({ type: 'rpcResponse', requestId: typedMessage.requestId, ok: true, payload: false })
          break
        }
        void handleRequest(typedMessage.requestId, async () => __internalWebviewPostMessage(typedMessage.payload))
        break

      case 'webviewDispose':
        void handleRequest(typedMessage.requestId, async () => __internalWebviewDispose(typedMessage.payload))
        break

      case 'executeCommand':
        void handleRequest(typedMessage.requestId, async () => await __internalExecuteCommand(typedMessage.payload))
        break

      default:
        log('Received unknown message type:', (typedMessage as { type?: string }).type)
        break
    }
  })

  log('Extension Host IPC listener registered')
}

async function handleRequest(requestId: string | undefined, handler: () => Promise<unknown>): Promise<void> {
  if (!requestId) {
    return
  }
  try {
    const payload = await handler()
    sendEvent({ type: 'rpcResponse', requestId, ok: true, payload })
  } catch (error) {
    sendEvent({ type: 'rpcResponse', requestId, ok: false, error: (error as Error).message })
  }
}
