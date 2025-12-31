/**
 * WASM 语言服务封装
 * 在 Renderer 进程中直接调用 WASM 模块，无需 IPC 通信
 */

import type {
  WasmCompletionItem,
  WasmLocation,
  WasmHoverInfo,
  WasmDiagnostic,
  WasmDocumentSymbol,
  WasmPrepareRenameResult,
  WasmWorkspaceEdit,
  WasmSearchSymbol
} from '@/types/wasm'

// 动态导入 WASM 模块
let wasmModule: typeof import('logos-wasm') | null = null
let LanguageServiceClass: typeof import('logos-wasm').LanguageService | null = null

export class WasmLanguageService {
  private service: InstanceType<typeof import('logos-wasm').LanguageService> | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null

  /**
   * 初始化 WASM 模块
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    try {
      // 动态导入 WASM 模块
      console.log('[WasmLanguageService] 正在加载 WASM 模块...')
      wasmModule = await import('logos-wasm')

      // 初始化 WASM - 需要显式传入 WASM 文件 URL
      // 在 Vite 开发模式下，WASM 文件需要通过正确的 URL 加载
      const wasmUrl = new URL('logos-wasm/logos-lang_bg.wasm', import.meta.url)
      console.log('[WasmLanguageService] WASM URL:', wasmUrl.href)

      try {
        await wasmModule.default(wasmUrl)
      } catch (urlError) {
        // 如果 URL 方式失败，尝试让模块自己解析路径
        console.warn('[WasmLanguageService] URL 加载失败，尝试默认方式:', urlError)
        await wasmModule.default()
      }

      // 获取 LanguageService 类
      LanguageServiceClass = wasmModule.LanguageService

      // 创建服务实例
      this.service = new LanguageServiceClass()
      this.initialized = true

      console.log('[WasmLanguageService] WASM 模块初始化成功')
    } catch (error) {
      console.error('[WasmLanguageService] WASM 初始化失败:', error)
      this.initialized = false
      throw error
    }
  }

  /**
   * 检查服务是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized && this.service !== null
  }

  /**
   * 打开文档
   */
  openDocument(uri: string, content: string, languageId: string): void {
    if (!this.service) {
      console.warn('[WasmLanguageService] 服务未初始化')
      return
    }
    try {
      this.service.openDocument(uri, content, languageId)
    } catch (error) {
      console.error('[WasmLanguageService] openDocument 失败:', error)
    }
  }

  /**
   * 更新文档内容
   */
  updateDocument(uri: string, content: string): void {
    if (!this.service) return
    try {
      this.service.updateDocument(uri, content)
    } catch (error) {
      console.error('[WasmLanguageService] updateDocument 失败:', error)
    }
  }

  /**
   * 关闭文档
   */
  closeDocument(uri: string): void {
    if (!this.service) return
    try {
      this.service.closeDocument(uri)
    } catch (error) {
      console.error('[WasmLanguageService] closeDocument 失败:', error)
    }
  }

  /**
   * 获取补全建议
   */
  getCompletions(uri: string, line: number, column: number): WasmCompletionItem[] {
    if (!this.service) return []
    try {
      const json = this.service.getCompletions(uri, line, column)
      return JSON.parse(json) as WasmCompletionItem[]
    } catch (error) {
      console.error('[WasmLanguageService] getCompletions 失败:', error)
      return []
    }
  }

  /**
   * 获取定义位置
   */
  getDefinition(uri: string, line: number, column: number): WasmLocation | null {
    if (!this.service) return null
    try {
      const json = this.service.getDefinition(uri, line, column)
      const result = JSON.parse(json)
      return result === 'null' || result === null ? null : result as WasmLocation
    } catch (error) {
      console.error('[WasmLanguageService] getDefinition 失败:', error)
      return null
    }
  }

  /**
   * 获取所有引用
   */
  getReferences(uri: string, line: number, column: number): WasmLocation[] {
    if (!this.service) return []
    try {
      const json = this.service.getReferences(uri, line, column)
      return JSON.parse(json) as WasmLocation[]
    } catch (error) {
      console.error('[WasmLanguageService] getReferences 失败:', error)
      return []
    }
  }

  /**
   * 获取悬停信息
   */
  getHover(uri: string, line: number, column: number): WasmHoverInfo | null {
    if (!this.service) return null
    try {
      const json = this.service.getHover(uri, line, column)
      const result = JSON.parse(json)
      return result === 'null' || result === null ? null : result as WasmHoverInfo
    } catch (error) {
      console.error('[WasmLanguageService] getHover 失败:', error)
      return null
    }
  }

  /**
   * 获取诊断信息
   */
  getDiagnostics(uri: string): WasmDiagnostic[] {
    if (!this.service) return []
    try {
      const json = this.service.getDiagnostics(uri)
      return JSON.parse(json) as WasmDiagnostic[]
    } catch (error) {
      console.error('[WasmLanguageService] getDiagnostics 失败:', error)
      return []
    }
  }

  /**
   * 获取文档符号
   */
  getDocumentSymbols(uri: string): WasmDocumentSymbol[] {
    if (!this.service) return []
    try {
      const json = this.service.getDocumentSymbols(uri)
      return JSON.parse(json) as WasmDocumentSymbol[]
    } catch (error) {
      console.error('[WasmLanguageService] getDocumentSymbols 失败:', error)
      return []
    }
  }

  /**
   * 准备重命名
   */
  prepareRename(uri: string, line: number, column: number): WasmPrepareRenameResult | null {
    if (!this.service) return null
    try {
      const json = this.service.prepareRename(uri, line, column)
      const result = JSON.parse(json)
      return result === 'null' || result === null ? null : result as WasmPrepareRenameResult
    } catch (error) {
      console.error('[WasmLanguageService] prepareRename 失败:', error)
      return null
    }
  }

  /**
   * 执行重命名
   */
  rename(uri: string, line: number, column: number, newName: string): WasmWorkspaceEdit | null {
    if (!this.service) return null
    try {
      const json = this.service.rename(uri, line, column, newName)
      const result = JSON.parse(json)
      return result === 'null' || result === null ? null : result as WasmWorkspaceEdit
    } catch (error) {
      console.error('[WasmLanguageService] rename 失败:', error)
      return null
    }
  }

  /**
   * 搜索符号
   */
  searchSymbols(query: string): WasmSearchSymbol[] {
    if (!this.service) return []
    try {
      const json = this.service.searchSymbols(query)
      return JSON.parse(json) as WasmSearchSymbol[]
    } catch (error) {
      console.error('[WasmLanguageService] searchSymbols 失败:', error)
      return []
    }
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.service) {
      try {
        this.service.free()
      } catch {
        // 忽略释放错误
      }
      this.service = null
    }
    this.initialized = false
    this.initPromise = null
  }
}

// 导出单例实例
export const wasmService = new WasmLanguageService()
