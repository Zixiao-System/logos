import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { join, resolve, sep } from 'path'
import * as fsSync from 'fs'
import * as Sentry from '@sentry/electron/main'
import { registerFileSystemHandlers, registerFileWatcherHandlers, cleanupFileWatchers } from './services/fileService'
import { registerGitHandlers } from './services/gitService'
import { registerTerminalHandlers, cleanupTerminals } from './services/terminalService'
import { registerGitHubHandlers } from './services/githubService'
import { registerGitLabHandlers } from './services/gitlabService'
import { registerIntelligenceHandlers } from './services/intelligenceService'
import { registerCommitAnalysisHandlers } from './services/commitAnalysisService'
import { registerDebugHandlers, cleanupDebugService } from './services/debug/ipcHandlers'
import { registerRemoteHandlers, cleanupRemoteConnections } from './services/remote'
import { registerUpdateHandlers } from './services/updateService'
import { registerLanguageDaemonHandlers, cleanupLanguageDaemon } from './services/languageDaemonHandlers'
import { registerLSPHandlers, getLSPServerManager } from './services/lspServerManager'
import { registerMemoryMonitorHandlers } from './services/memoryMonitorService'
import { registerExtensionHandlers, cleanupExtensionHost } from './services/extensionService'
import { registerWasmExtensionHandlers, cleanupWasmExtensions } from './services/wasmExtensionService'

// 环境变量
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'logos-extension',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

function registerExtensionProtocol() {
  const extensionsRoot = resolve(app.getPath('userData'), 'extensions')
  let normalizedRoot = extensionsRoot

  protocol.registerFileProtocol('logos-extension', (request, callback) => {
    let rawPath = request.url.replace('logos-extension://', '')
    if (rawPath.startsWith('local-file/')) {
      rawPath = rawPath.replace(/^local-file/, '')
    } else if (!rawPath.startsWith('/')) {
      rawPath = `/${rawPath}`
    }
    const decodedPath = decodeURIComponent(rawPath)
    const resolvedPath = resolve(decodedPath)
    let normalizedPath = resolvedPath

    try {
      normalizedPath = fsSync.realpathSync(resolvedPath)
    } catch {
      // Keep resolvedPath when file is missing.
    }

    try {
      normalizedRoot = fsSync.realpathSync(extensionsRoot)
    } catch {
      normalizedRoot = extensionsRoot
    }

    const normalizedPathForCompare = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
    const normalizedRootForCompare = process.platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot

    const isAllowed =
      normalizedPathForCompare === normalizedRootForCompare ||
      normalizedPathForCompare.startsWith(normalizedRootForCompare + sep)

    if (!isAllowed) {
      callback({ error: -10 })
      return
    }

    callback({ path: resolvedPath })
  })
}

// 立即初始化 Sentry (必须在 app ready 事件之前)
// 默认禁用，等待用户同意后启用
Sentry.init({
  dsn: 'https://adc9e827519bec3b604975a644a3282a@o4510655959072768.ingest.us.sentry.io/4510655961563136',
  enabled: false, // 默认禁用，等待用户同意
  environment: isDev ? 'development' : 'production',
  beforeSend(event) {
    // 移除敏感信息
    if (event.user) {
      delete event.user.ip_address
      delete event.user.email
    }
    // 移除文件路径中的用户名
    if (event.exception?.values) {
      event.exception.values.forEach(ex => {
        if (ex.stacktrace?.frames) {
          ex.stacktrace.frames.forEach(frame => {
            if (frame.filename) {
              frame.filename = frame.filename.replace(/\/Users\/[^/]+/g, '/Users/***')
            }
          })
        }
      })
    }
    return event
  }
})

// 启用 Sentry
function enableSentry() {
  const client = Sentry.getClient()
  if (client) {
    client.getOptions().enabled = true
  }
}

// 禁用 Sentry
function disableSentry() {
  const client = Sentry.getClient()
  if (client) {
    client.getOptions().enabled = false
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'logos',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 10, y: 10 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false,
    backgroundColor: '#1e1e1e'
  })

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 外部链接在浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 加载页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 获取主窗口的辅助函数
function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

// 注册所有 IPC 处理程序
function registerAllHandlers() {
  // ============ 应用信息 ============
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:platform', () => {
    return process.platform
  })

  // ============ Shell 操作 ============
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    return shell.openExternal(url)
  })

  // ============ 窗口控制 ============
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  // ============ 文件系统操作 ============
  registerFileSystemHandlers()
  registerFileWatcherHandlers(getMainWindow)

  // ============ Git 操作 ============
  registerGitHandlers()

  // ============ Commit Analysis ============
  registerCommitAnalysisHandlers()

  // ============ 终端操作 ============
  registerTerminalHandlers(getMainWindow)

  // ============ GitHub Actions ============
  registerGitHubHandlers()

  // ============ GitLab CI ============
  registerGitLabHandlers()

  // ============ 代码智能 ============
  registerIntelligenceHandlers(getMainWindow)

  // ============ 调试 ============
  registerDebugHandlers(getMainWindow)

  // ============ 远程开发 ============
  registerRemoteHandlers()

  // ============ 自动更新 ============
  registerUpdateHandlers(getMainWindow)

  // ============ 语言守护进程 ============
  registerLanguageDaemonHandlers(getMainWindow)

  // ============ LSP 服务器 (Basic Mode) ============
  registerLSPHandlers(mainWindow)

  // ============ 内存监控 ============
  registerMemoryMonitorHandlers(getMainWindow)

  // ============ 扩展系统 ============
  registerExtensionHandlers(getMainWindow)

  // ============ WASM 扩展系统 ============
  registerWasmExtensionHandlers(getMainWindow)

  // ============ 遥测控制 ============
  ipcMain.handle('telemetry:enable', () => {
    enableSentry()
    return true
  })

  ipcMain.handle('telemetry:disable', () => {
    disableSentry()
    return true
  })

  ipcMain.handle('telemetry:isEnabled', () => {
    const client = Sentry.getClient()
    return client ? client.getOptions().enabled : false
  })

  // ============ 反馈上报 ============
  registerFeedbackHandlers()
}

// 应用准备好后创建窗口
app.whenReady().then(() => {
  registerExtensionProtocol()

  // 注册所有 IPC 处理程序
  registerAllHandlers()

  // 创建主窗口
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
app.on('before-quit', async () => {
  // 清理文件监听器
  cleanupFileWatchers()
  // 清理终端
  cleanupTerminals()
  // 清理调试会话
  cleanupDebugService()
  // 清理远程连接
  cleanupRemoteConnections()
  // 清理语言守护进程
  await cleanupLanguageDaemon()
  await getLSPServerManager().stopAll()
  await cleanupExtensionHost()
  // 清理 WASM 扩展
  await cleanupWasmExtensions()
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// ============ 反馈上报相关函数 ============
import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as v8 from 'v8'

const execAsync = promisify(exec)

// 收集系统状态
async function collectSystemState(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    app: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      osVersion: os.release(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }
  }

  // 获取 V8 堆统计
  try {
    state.v8HeapStats = v8.getHeapStatistics()
  } catch {
    // 忽略错误
  }

  return state
}

// 获取 Git 远程 URL
async function getGitRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf-8'
    })
    return stdout.trim()
  } catch {
    return null
  }
}

// 从 Git URL 解析 GitHub Issue URL
function parseGitHubIssueUrl(gitUrl: string): string | null {
  // 支持 SSH 和 HTTPS 格式
  // git@github.com:user/repo.git
  // https://github.com/user/repo.git
  const sshMatch = gitUrl.match(/git@github\.com:([^/]+)\/([^.]+)\.git/)
  const httpsMatch = gitUrl.match(/https:\/\/github\.com\/([^/]+)\/([^.]+)(\.git)?/)

  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}/issues/new`
  }
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}/issues/new`
  }
  return null
}

// 捕获 JS 堆快照信息
function captureHeapSnapshot(): Record<string, unknown> {
  const heapStats = v8.getHeapStatistics()
  return {
    totalHeapSize: heapStats.total_heap_size,
    usedHeapSize: heapStats.used_heap_size,
    heapSizeLimit: heapStats.heap_size_limit,
    totalAvailableSize: heapStats.total_available_size,
    mallocedMemory: heapStats.malloced_memory,
    peakMallocedMemory: heapStats.peak_malloced_memory
  }
}

// 注册反馈上报 IPC 处理程序
function registerFeedbackHandlers() {
  // 收集反馈数据
  ipcMain.handle('feedback:collectState', async () => {
    return await collectSystemState()
  })

  // 获取 GitHub Issue URL
  ipcMain.handle('feedback:getGitHubIssueUrl', async (_, repoPath: string) => {
    const gitUrl = await getGitRemoteUrl(repoPath)
    if (gitUrl) {
      return parseGitHubIssueUrl(gitUrl)
    }
    return null
  })

  // 捕获堆快照
  ipcMain.handle('feedback:captureHeapSnapshot', () => {
    return captureHeapSnapshot()
  })

  // 提交反馈到 Sentry
  ipcMain.handle('feedback:submitToSentry', async (_, data: {
    message: string
    state: Record<string, unknown>
    heapSnapshot: Record<string, unknown>
  }) => {
    const client = Sentry.getClient()
    if (!client || !client.getOptions().enabled) {
      return { success: false, error: 'Sentry not enabled' }
    }

    try {
      Sentry.withScope((scope) => {
        scope.setLevel('info')
        scope.setTag('feedback', 'manual')
        scope.setContext('systemState', data.state)
        scope.setContext('heapSnapshot', data.heapSnapshot)
        Sentry.captureMessage(`[User Feedback] ${data.message}`)
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
