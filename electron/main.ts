import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { registerFileSystemHandlers, registerFileWatcherHandlers, cleanupFileWatchers } from './services/fileService'
import { registerGitHandlers } from './services/gitService'
import { registerTerminalHandlers, cleanupTerminals } from './services/terminalService'
import { registerGitHubHandlers } from './services/githubService'
import { registerGitLabHandlers } from './services/gitlabService'
import { registerIntelligenceHandlers } from './services/intelligenceService'
import { registerCommitAnalysisHandlers } from './services/commitAnalysisService'

// 环境变量
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
}

// 应用准备好后创建窗口
app.whenReady().then(() => {
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
app.on('before-quit', () => {
  // 清理文件监听器
  cleanupFileWatchers()
  // 清理终端
  cleanupTerminals()
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
