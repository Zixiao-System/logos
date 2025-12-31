/**
 * 代码智能管理器
 * 负责管理 Monaco Editor 的代码智能功能
 * 支持双路径: TypeScript/JavaScript 使用 IPC, 其他语言使用 WASM
 */

import * as monaco from 'monaco-editor'
import { CompletionProvider } from './providers/CompletionProvider.ts'
import { DefinitionProvider } from './providers/DefinitionProvider.ts'
import { ReferenceProvider } from './providers/ReferenceProvider.ts'
import { HoverProvider } from './providers/HoverProvider.ts'
import { SignatureHelpProvider } from './providers/SignatureHelpProvider.ts'
import { RenameProvider } from './providers/RenameProvider.ts'
import { InlayHintsProvider } from './providers/InlayHintsProvider.ts'
import { DiagnosticsManager } from './DiagnosticsManager.ts'
import { wasmService } from '@/services/language/WasmLanguageService.ts'
import { isWasmLanguage, isNativeLanguage } from '@/services/language/utils.ts'
import type { LanguageServerStatus } from '@/types/intelligence.ts'

/** 支持的 Tier 1 语言 (TypeScript Language Service via IPC) */
const TIER1_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
]

/** WASM 支持的语言 (Monaco 语言 ID) */
const WASM_MONACO_LANGUAGES = [
  'python',
  'go',
  'rust',
  'c',
  'cpp',
  'java',
]

/** 文件扩展名到语言 ID 的映射 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  // WASM 语言
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.hh': 'cpp',
  '.java': 'java',
}

export class IntelligenceManager {
  private disposables: monaco.IDisposable[] = []
  private diagnosticsManager: DiagnosticsManager
  private projectRoot: string | null = null
  private fileVersions: Map<string, number> = new Map()
  private statusListenerCleanup: (() => void) | null = null
  private wasmInitialized = false

  constructor() {
    this.diagnosticsManager = new DiagnosticsManager()
  }

  /**
   * 初始化代码智能服务
   */
  async initialize(): Promise<void> {
    // 为 Tier 1 语言注册所有 Provider (使用 IPC) - 优先确保基础功能可用
    for (const languageId of TIER1_LANGUAGES) {
      this.registerProvidersForLanguage(languageId, 'ipc')
    }

    // 监听服务器状态变化
    this.statusListenerCleanup = window.electronAPI.intelligence.onServerStatusChange(
      this.handleServerStatusChange.bind(this)
    )

    // 异步初始化 WASM 服务 (失败不影响主流程)
    this.initializeWasm().catch(error => {
      console.warn('[IntelligenceManager] WASM 初始化跳过:', error?.message || error)
    })
  }

  /**
   * 异步初始化 WASM 服务
   */
  private async initializeWasm(): Promise<void> {
    try {
      await wasmService.initialize()
      this.wasmInitialized = true
      console.log('[IntelligenceManager] WASM 服务初始化成功')

      // 为 WASM 语言注册 Provider
      for (const languageId of WASM_MONACO_LANGUAGES) {
        this.registerProvidersForLanguage(languageId, 'wasm')
      }
    } catch (error) {
      console.error('[IntelligenceManager] WASM 服务初始化失败:', error)
      this.wasmInitialized = false
      // 不抛出错误，让应用继续运行
    }
  }

  /**
   * 打开项目
   */
  async openProject(rootPath: string): Promise<void> {
    this.projectRoot = rootPath
    await window.electronAPI.intelligence.openProject(rootPath)
  }

  /**
   * 关闭项目
   */
  async closeProject(): Promise<void> {
    if (this.projectRoot) {
      await window.electronAPI.intelligence.closeProject(this.projectRoot)
      this.projectRoot = null
    }
  }

  /**
   * 为指定语言注册所有 Provider
   * @param languageId Monaco 语言 ID
   * @param mode 服务模式: 'ipc' 使用 IPC 通信, 'wasm' 使用 WASM
   */
  private registerProvidersForLanguage(languageId: string, mode: 'ipc' | 'wasm'): void {
    // 补全 Provider
    this.disposables.push(
      monaco.languages.registerCompletionItemProvider(
        languageId,
        new CompletionProvider(mode)
      )
    )

    // 定义跳转 Provider
    this.disposables.push(
      monaco.languages.registerDefinitionProvider(
        languageId,
        new DefinitionProvider(mode)
      )
    )

    // 引用查找 Provider
    this.disposables.push(
      monaco.languages.registerReferenceProvider(
        languageId,
        new ReferenceProvider(mode)
      )
    )

    // 悬停提示 Provider
    this.disposables.push(
      monaco.languages.registerHoverProvider(
        languageId,
        new HoverProvider(mode)
      )
    )

    // 签名帮助 Provider (仅 IPC 模式支持)
    if (mode === 'ipc') {
      this.disposables.push(
        monaco.languages.registerSignatureHelpProvider(
          languageId,
          new SignatureHelpProvider()
        )
      )
    }

    // 重命名 Provider
    this.disposables.push(
      monaco.languages.registerRenameProvider(
        languageId,
        new RenameProvider(mode)
      )
    )

    // 内联提示 Provider (仅 IPC 模式支持)
    if (mode === 'ipc') {
      this.disposables.push(
        monaco.languages.registerInlayHintsProvider(
          languageId,
          new InlayHintsProvider()
        )
      )
    }
  }

  /**
   * 同步文件内容到语言服务
   */
  syncFile(filePath: string, content: string): void {
    // 检查是否是支持的语言
    if (!this.isSupported(filePath)) return

    // 判断使用哪种服务
    if (this.isWasmLanguage(filePath) && this.wasmInitialized) {
      // WASM 语言: 直接同步到 WASM 服务
      wasmService.updateDocument(filePath, content)
    } else if (this.isNativeLanguage(filePath)) {
      // 原生语言: 通过 IPC 同步
      const currentVersion = this.fileVersions.get(filePath) || 0
      const newVersion = currentVersion + 1
      this.fileVersions.set(filePath, newVersion)
      window.electronAPI.intelligence.syncFile(filePath, content, newVersion)
    }
  }

  /**
   * 打开文件 (用于 WASM 语言)
   */
  openFile(filePath: string, content: string): void {
    if (!this.isSupported(filePath)) return

    if (this.isWasmLanguage(filePath) && this.wasmInitialized) {
      const ext = filePath.substring(filePath.lastIndexOf('.'))
      const languageId = EXT_TO_LANGUAGE[ext] || 'plaintext'
      wasmService.openDocument(filePath, content, languageId)
    }
  }

  /**
   * 关闭文件
   */
  closeFile(filePath: string): void {
    this.fileVersions.delete(filePath)

    if (this.isWasmLanguage(filePath) && this.wasmInitialized) {
      wasmService.closeDocument(filePath)
    } else {
      window.electronAPI.intelligence.closeFile(filePath)
    }
  }

  /**
   * 更新诊断信息
   */
  async updateDiagnostics(model: monaco.editor.ITextModel): Promise<void> {
    const filePath = model.uri.fsPath
    if (!this.isSupported(filePath)) return

    try {
      if (this.isWasmLanguage(filePath) && this.wasmInitialized) {
        // WASM 语言诊断
        const diagnostics = wasmService.getDiagnostics(filePath)
        // 转换为 Monaco 格式
        const converted = diagnostics.map(d => ({
          range: {
            start: { line: d.range.startLine, column: d.range.startColumn },
            end: { line: d.range.endLine, column: d.range.endColumn }
          },
          message: d.message,
          severity: d.severity
        }))
        this.diagnosticsManager.setDiagnostics(model, converted)
      } else {
        // IPC 语言诊断
        const diagnostics = await window.electronAPI.intelligence.getDiagnostics(filePath)
        this.diagnosticsManager.setDiagnostics(model, diagnostics)
      }
    } catch (error) {
      console.error('Failed to update diagnostics:', error)
    }
  }

  /**
   * 检查文件是否支持代码智能
   */
  isSupported(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    return ext in EXT_TO_LANGUAGE
  }

  /**
   * 检查文件是否是 WASM 语言
   */
  isWasmLanguage(filePath: string): boolean {
    return isWasmLanguage(filePath)
  }

  /**
   * 检查文件是否是原生语言 (TypeScript/JavaScript)
   */
  isNativeLanguage(filePath: string): boolean {
    return isNativeLanguage(filePath)
  }

  /**
   * 获取 WASM 服务实例 (供 Provider 使用)
   */
  getWasmService() {
    return this.wasmInitialized ? wasmService : null
  }

  /**
   * 获取文件的语言 ID
   */
  getLanguageId(filePath: string): string | null {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    return EXT_TO_LANGUAGE[ext] || null
  }

  /**
   * 处理服务器状态变化
   */
  private handleServerStatusChange(status: LanguageServerStatus): void {
    console.log(`Language server status: ${status.language} - ${status.status}`, status.message)
  }

  /**
   * 获取诊断管理器
   */
  getDiagnosticsManager(): DiagnosticsManager {
    return this.diagnosticsManager
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    // 清理所有 Provider
    this.disposables.forEach(d => d.dispose())
    this.disposables = []

    // 清理诊断管理器
    this.diagnosticsManager.dispose()

    // 清理状态监听器
    if (this.statusListenerCleanup) {
      this.statusListenerCleanup()
      this.statusListenerCleanup = null
    }

    // 清理 WASM 服务
    if (this.wasmInitialized) {
      wasmService.dispose()
      this.wasmInitialized = false
    }

    // 关闭项目
    this.closeProject()
  }
}

// 单例实例
let instance: IntelligenceManager | null = null

/**
 * 获取 IntelligenceManager 单例
 */
export function getIntelligenceManager(): IntelligenceManager {
  if (!instance) {
    instance = new IntelligenceManager()
  }
  return instance
}

/**
 * 销毁 IntelligenceManager 单例
 */
export function destroyIntelligenceManager(): void {
  if (instance) {
    instance.dispose()
    instance = null
  }
}
