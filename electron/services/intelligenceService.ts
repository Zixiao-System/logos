/**
 * 代码智能服务
 * 使用 TypeScript Compiler API 提供原生智能功能
 * 其他语言支持通过 Rust 守护进程 (logos-daemon) 实现
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'
import { getLanguageDaemonService } from './languageDaemonService'

// ============ 语言配置 ============

type LanguageTier = 'native' | 'daemon' | 'basic'

interface LanguageInfo {
  tier: LanguageTier
  displayName: string
  extensions: string[]
}

// 语言映射表
const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  typescript: { tier: 'native', displayName: 'TypeScript', extensions: ['.ts', '.tsx'] },
  javascript: { tier: 'native', displayName: 'JavaScript', extensions: ['.js', '.jsx'] },
  typescriptreact: { tier: 'native', displayName: 'TypeScript React', extensions: ['.tsx'] },
  javascriptreact: { tier: 'native', displayName: 'JavaScript React', extensions: ['.jsx'] },
  // 以下语言通过 Rust 守护进程 (logos-daemon) 支持
  python: { tier: 'daemon', displayName: 'Python', extensions: ['.py'] },
  go: { tier: 'daemon', displayName: 'Go', extensions: ['.go'] },
  rust: { tier: 'daemon', displayName: 'Rust', extensions: ['.rs'] },
  c: { tier: 'daemon', displayName: 'C', extensions: ['.c', '.h'] },
  cpp: { tier: 'daemon', displayName: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'] },
  java: { tier: 'daemon', displayName: 'Java', extensions: ['.java'] },
}

// 扩展名到语言 ID 的映射
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.java': 'java',
}

// ============ 类型定义 ============

interface Position {
  line: number
  column: number
}

interface Range {
  start: Position
  end: Position
}

interface CompletionItem {
  label: string
  kind: number
  detail?: string
  documentation?: string | { value: string; isTrusted?: boolean }
  insertText: string
  insertTextRules?: number
  sortText?: string
  filterText?: string
  preselect?: boolean
  range?: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}

interface CompletionResult {
  suggestions: CompletionItem[]
  incomplete?: boolean
}

interface DefinitionLocation {
  uri: string
  range: Range
}

interface ReferenceLocation {
  uri: string
  range: Range
  isDefinition?: boolean
}

interface Diagnostic {
  range: Range
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  code?: string | number
  source?: string
}

interface HoverInfo {
  contents: Array<{ value: string; language?: string }>
  range?: Range
}

interface SignatureHelp {
  signatures: Array<{
    label: string
    documentation?: string
    parameters: Array<{ label: string | [number, number]; documentation?: string }>
    activeParameter?: number
  }>
  activeSignature: number
  activeParameter: number
}

interface InlayHint {
  position: Position
  label: string
  kind: 'type' | 'parameter'
  paddingLeft?: boolean
  paddingRight?: boolean
}

interface PrepareRenameResult {
  range: Range
  placeholder: string
}

interface TextEdit {
  range: Range
  newText: string
}

interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>
}

interface RefactorAction {
  title: string
  kind: string
  description?: string
  isPreferred?: boolean
  disabled?: { reason: string }
}

interface LanguageServerStatus {
  language: string
  status: 'starting' | 'ready' | 'error' | 'stopped'
  message?: string
}

// ============ 索引进度相关 ============

type IndexingPhase = 'idle' | 'scanning' | 'parsing' | 'indexing' | 'ready'

interface IndexingProgress {
  phase: IndexingPhase
  message: string
  currentFile?: string
  processedFiles: number
  totalFiles: number
  percentage: number
  startTime?: number
  estimatedTimeRemaining?: number
}

interface AnalysisStatus {
  isAnalyzing: boolean
  currentFile?: string
  queuedFiles: number
}

interface LSPServiceStatus {
  indexing: IndexingProgress
  analysis: AnalysisStatus
  servers: LanguageServerStatus[]
  diagnostics: {
    errors: number
    warnings: number
    hints: number
  }
}

type ProgressCallback = (progress: IndexingProgress) => void

// ============ TypeScript 语言服务 ============

class TypeScriptLanguageService {
  private languageService: ts.LanguageService
  private documentRegistry: ts.DocumentRegistry
  private projectRoot: string
  private fileVersions: Map<string, { version: number; content: string }> = new Map()
  private compilerOptions: ts.CompilerOptions
  private projectFiles: Set<string> = new Set()
  private onProgress: ProgressCallback | null = null
  private indexingStartTime: number = 0

  constructor(projectRoot: string, onProgress?: ProgressCallback) {
    this.projectRoot = projectRoot
    this.onProgress = onProgress || null
    this.documentRegistry = ts.createDocumentRegistry()
    this.compilerOptions = this.loadCompilerOptions()

    // 扫描项目文件（带进度通知）
    this.scanProjectFilesWithProgress()

    // 创建语言服务
    const serviceHost = this.createServiceHost()
    this.languageService = ts.createLanguageService(serviceHost, this.documentRegistry)

    // 通知索引完成
    this.notifyProgress({
      phase: 'ready',
      message: '索引完成',
      processedFiles: this.projectFiles.size,
      totalFiles: this.projectFiles.size,
      percentage: 100
    })
  }

  private notifyProgress(progress: IndexingProgress): void {
    if (this.onProgress) {
      this.onProgress(progress)
    }
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback
  }

  private loadCompilerOptions(): ts.CompilerOptions {
    const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json')
    try {
      if (fs.existsSync(tsconfigPath)) {
        const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
        if (!configFile.error) {
          const parsed = ts.parseJsonConfigFileContent(
            configFile.config,
            ts.sys,
            this.projectRoot
          )
          return parsed.options
        }
      }
    } catch (error) {
      console.error('Failed to load tsconfig.json:', error)
    }

    // 默认配置
    return {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      baseUrl: this.projectRoot,
      paths: {
        '@/*': ['src/*']
      }
    }
  }

  private scanProjectFilesWithProgress(): void {
    this.indexingStartTime = Date.now()
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue']
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt']

    // 第一遍：收集所有文件路径
    const allFiles: string[] = []

    this.notifyProgress({
      phase: 'scanning',
      message: '正在扫描项目文件...',
      processedFiles: 0,
      totalFiles: 0,
      percentage: 0,
      startTime: this.indexingStartTime
    })

    const collectFiles = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
              collectFiles(fullPath)
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name)
            if (extensions.includes(ext)) {
              allFiles.push(fullPath)
            }
          }
        }
      } catch {
        // 忽略无法读取的目录
      }
    }

    collectFiles(this.projectRoot)

    const totalFiles = allFiles.length

    this.notifyProgress({
      phase: 'indexing',
      message: `发现 ${totalFiles} 个文件，正在建立索引...`,
      processedFiles: 0,
      totalFiles,
      percentage: 0,
      startTime: this.indexingStartTime
    })

    // 第二遍：添加文件并通知进度
    let lastNotifyTime = Date.now()
    const NOTIFY_INTERVAL = 100 // 每 100ms 最多通知一次

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i]
      this.projectFiles.add(filePath)

      const now = Date.now()
      if (now - lastNotifyTime > NOTIFY_INTERVAL || i === allFiles.length - 1) {
        const percentage = Math.round(((i + 1) / totalFiles) * 100)
        const elapsed = now - this.indexingStartTime
        const estimatedTotal = elapsed / ((i + 1) / totalFiles)
        const estimatedRemaining = Math.round(estimatedTotal - elapsed)

        this.notifyProgress({
          phase: 'indexing',
          message: `正在索引 (${i + 1}/${totalFiles})`,
          currentFile: path.basename(filePath),
          processedFiles: i + 1,
          totalFiles,
          percentage,
          startTime: this.indexingStartTime,
          estimatedTimeRemaining: estimatedRemaining > 0 ? estimatedRemaining : undefined
        })

        lastNotifyTime = now
      }
    }
  }

  private createServiceHost(): ts.LanguageServiceHost {
    return {
      getScriptFileNames: () => Array.from(this.projectFiles),
      getScriptVersion: (fileName) => {
        const file = this.fileVersions.get(fileName)
        return file ? file.version.toString() : '0'
      },
      getScriptSnapshot: (fileName) => {
        // 优先从内存获取
        const cached = this.fileVersions.get(fileName)
        if (cached) {
          return ts.ScriptSnapshot.fromString(cached.content)
        }
        // 从磁盘读取
        try {
          const content = ts.sys.readFile(fileName)
          if (content !== undefined) {
            return ts.ScriptSnapshot.fromString(content)
          }
        } catch {
          // 忽略读取错误
        }
        return undefined
      },
      getCurrentDirectory: () => this.projectRoot,
      getCompilationSettings: () => this.compilerOptions,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => {
        if (this.fileVersions.has(fileName)) return true
        return ts.sys.fileExists(fileName)
      },
      readFile: (fileName) => {
        const cached = this.fileVersions.get(fileName)
        if (cached) return cached.content
        return ts.sys.readFile(fileName)
      },
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    }
  }

  // ============ 文件同步 ============

  syncFile(filePath: string, content: string, version: number): void {
    this.fileVersions.set(filePath, { version, content })
    this.projectFiles.add(filePath)
  }

  closeFile(filePath: string): void {
    this.fileVersions.delete(filePath)
  }

  // ============ 补全 ============

  getCompletions(filePath: string, position: Position, triggerCharacter?: string): CompletionResult {
    const offset = this.positionToOffset(filePath, position)

    try {
      const completions = this.languageService.getCompletionsAtPosition(
        filePath,
        offset,
        {
          includeCompletionsForModuleExports: true,
          includeCompletionsWithInsertText: true,
          includeCompletionsWithSnippetText: true,
          includeCompletionsWithClassMemberSnippets: true,
          includeCompletionsWithObjectLiteralMethodSnippets: true,
          triggerCharacter: triggerCharacter as ts.CompletionsTriggerCharacter,
        }
      )

      if (!completions) {
        return { suggestions: [] }
      }

      const suggestions: CompletionItem[] = completions.entries.slice(0, 100).map(entry => {
        // 获取详细信息
        let detail: string | undefined
        let documentation: string | undefined

        try {
          const details = this.languageService.getCompletionEntryDetails(
            filePath,
            offset,
            entry.name,
            undefined,
            undefined,
            undefined,
            undefined
          )
          if (details) {
            detail = ts.displayPartsToString(details.displayParts)
            documentation = ts.displayPartsToString(details.documentation)
          }
        } catch {
          // 忽略详情获取错误
        }

        return {
          label: entry.name,
          kind: this.convertCompletionKind(entry.kind),
          detail: detail || entry.kindModifiers,
          documentation: documentation ? { value: documentation, isTrusted: true } : undefined,
          insertText: entry.insertText || entry.name,
          insertTextRules: entry.isSnippet ? 4 : 0, // InsertAsSnippet = 4
          sortText: entry.sortText,
          filterText: entry.filterText,
          preselect: entry.isRecommended,
        }
      })

      return {
        suggestions,
        incomplete: completions.isIncomplete,
      }
    } catch (error) {
      console.error('Completion error:', error)
      return { suggestions: [] }
    }
  }

  // ============ 定义跳转 ============

  getDefinitions(filePath: string, position: Position): DefinitionLocation[] {
    const offset = this.positionToOffset(filePath, position)

    try {
      const definitions = this.languageService.getDefinitionAtPosition(filePath, offset)
      if (!definitions) return []

      return definitions.map(def => ({
        uri: def.fileName,
        range: this.textSpanToRange(def.fileName, def.textSpan),
      }))
    } catch (error) {
      console.error('Definition error:', error)
      return []
    }
  }

  // ============ 查找引用 ============

  getReferences(filePath: string, position: Position, includeDeclaration = true): ReferenceLocation[] {
    const offset = this.positionToOffset(filePath, position)

    try {
      const references = this.languageService.findReferences(filePath, offset)
      if (!references) return []

      const result: ReferenceLocation[] = []

      for (const refGroup of references) {
        for (const ref of refGroup.references) {
          const isDefinition = ref.isDefinition === true
          if (includeDeclaration || !isDefinition) {
            result.push({
              uri: ref.fileName,
              range: this.textSpanToRange(ref.fileName, ref.textSpan),
              isDefinition,
            })
          }
        }
      }

      return result
    } catch (error) {
      console.error('References error:', error)
      return []
    }
  }

  // ============ 诊断 ============

  getDiagnostics(filePath: string): Diagnostic[] {
    try {
      const syntactic = this.languageService.getSyntacticDiagnostics(filePath)
      const semantic = this.languageService.getSemanticDiagnostics(filePath)
      const suggestion = this.languageService.getSuggestionDiagnostics(filePath)

      const allDiagnostics = [...syntactic, ...semantic, ...suggestion]

      return allDiagnostics.map(diag => ({
        range: diag.start !== undefined && diag.length !== undefined
          ? this.textSpanToRange(filePath, { start: diag.start, length: diag.length })
          : { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        severity: this.convertDiagnosticCategory(diag.category),
        code: diag.code,
        source: 'typescript',
      }))
    } catch (error) {
      console.error('Diagnostics error:', error)
      return []
    }
  }

  // ============ 悬停信息 ============

  getHover(filePath: string, position: Position): HoverInfo | null {
    const offset = this.positionToOffset(filePath, position)

    try {
      const info = this.languageService.getQuickInfoAtPosition(filePath, offset)
      if (!info) return null

      const contents: Array<{ value: string; language?: string }> = []

      // 类型信息
      if (info.displayParts) {
        contents.push({
          value: ts.displayPartsToString(info.displayParts),
          language: 'typescript'
        })
      }

      // 文档
      if (info.documentation && info.documentation.length > 0) {
        contents.push({
          value: ts.displayPartsToString(info.documentation)
        })
      }

      // 标签
      if (info.tags) {
        const tagsText = info.tags
          .map(tag => {
            const name = tag.name
            const text = tag.text ? ts.displayPartsToString(tag.text) : ''
            return `@${name} ${text}`.trim()
          })
          .join('\n')
        if (tagsText) {
          contents.push({ value: tagsText })
        }
      }

      return {
        contents,
        range: info.textSpan ? this.textSpanToRange(filePath, info.textSpan) : undefined
      }
    } catch (error) {
      console.error('Hover error:', error)
      return null
    }
  }

  // ============ 签名帮助 ============

  getSignatureHelp(filePath: string, position: Position): SignatureHelp | null {
    const offset = this.positionToOffset(filePath, position)

    try {
      const sigHelp = this.languageService.getSignatureHelpItems(filePath, offset, {})
      if (!sigHelp) return null

      return {
        signatures: sigHelp.items.map(item => ({
          label: ts.displayPartsToString(item.prefixDisplayParts) +
                 item.parameters.map(p => ts.displayPartsToString(p.displayParts)).join(', ') +
                 ts.displayPartsToString(item.suffixDisplayParts),
          documentation: item.documentation ? ts.displayPartsToString(item.documentation) : undefined,
          parameters: item.parameters.map(p => ({
            label: ts.displayPartsToString(p.displayParts),
            documentation: p.documentation ? ts.displayPartsToString(p.documentation) : undefined
          })),
          activeParameter: sigHelp.argumentIndex
        })),
        activeSignature: sigHelp.selectedItemIndex,
        activeParameter: sigHelp.argumentIndex
      }
    } catch (error) {
      console.error('Signature help error:', error)
      return null
    }
  }

  // ============ 内联提示 ============

  getInlayHints(filePath: string, range: Range): InlayHint[] {
    try {
      const startOffset = this.positionToOffset(filePath, range.start)
      const endOffset = this.positionToOffset(filePath, range.end)

      const hints = this.languageService.provideInlayHints(filePath, {
        start: startOffset,
        length: endOffset - startOffset,
      }, {
        includeInlayParameterNameHints: 'all',
        includeInlayParameterNameHintsWhenArgumentMatchesName: false,
        includeInlayFunctionParameterTypeHints: true,
        includeInlayVariableTypeHints: true,
        includeInlayVariableTypeHintsWhenTypeMatchesName: false,
        includeInlayPropertyDeclarationTypeHints: true,
        includeInlayFunctionLikeReturnTypeHints: true,
        includeInlayEnumMemberValueHints: true,
      })

      return hints.map(hint => {
        let label: string
        const hintText = hint.text as string | Array<{ text: string }> | undefined
        if (typeof hintText === 'string') {
          label = hintText
        } else if (Array.isArray(hintText)) {
          label = hintText.map((p) => p.text).join('')
        } else {
          label = ''
        }

        return {
          position: this.offsetToPosition(filePath, hint.position),
          label,
          kind: hint.kind === ts.InlayHintKind.Parameter ? 'parameter' as const : 'type' as const,
          paddingLeft: hint.whitespaceBefore,
          paddingRight: hint.whitespaceAfter,
        }
      })
    } catch (error) {
      console.error('Inlay hints error:', error)
      return []
    }
  }

  // ============ 重命名 ============

  prepareRename(filePath: string, position: Position): PrepareRenameResult | null {
    const offset = this.positionToOffset(filePath, position)

    try {
      const renameInfo = this.languageService.getRenameInfo(filePath, offset, {})
      if (!renameInfo.canRename) return null

      return {
        range: this.textSpanToRange(filePath, renameInfo.triggerSpan),
        placeholder: renameInfo.displayName
      }
    } catch (error) {
      console.error('Prepare rename error:', error)
      return null
    }
  }

  rename(filePath: string, position: Position, newName: string): WorkspaceEdit | null {
    const offset = this.positionToOffset(filePath, position)

    try {
      const renameLocations = this.languageService.findRenameLocations(
        filePath,
        offset,
        false,
        false,
        false
      )
      if (!renameLocations) return null

      const changes: Record<string, TextEdit[]> = {}

      for (const loc of renameLocations) {
        if (!changes[loc.fileName]) {
          changes[loc.fileName] = []
        }
        changes[loc.fileName].push({
          range: this.textSpanToRange(loc.fileName, loc.textSpan),
          newText: newName
        })
      }

      return { changes }
    } catch (error) {
      console.error('Rename error:', error)
      return null
    }
  }

  // ============ 重构 ============

  getRefactorActions(filePath: string, range: Range): RefactorAction[] {
    const startOffset = this.positionToOffset(filePath, range.start)
    const endOffset = this.positionToOffset(filePath, range.end)

    try {
      const refactors = this.languageService.getApplicableRefactors(
        filePath,
        { pos: startOffset, end: endOffset },
        {},
        undefined,
        undefined
      )

      const actions: RefactorAction[] = []

      for (const refactor of refactors) {
        for (const action of refactor.actions) {
          actions.push({
            title: action.description,
            kind: `refactor.${refactor.name}.${action.name}`,
            description: action.description,
            isPreferred: (action as { isPreferred?: boolean }).isPreferred,
            disabled: action.notApplicableReason ? { reason: action.notApplicableReason } : undefined
          })
        }
      }

      return actions
    } catch (error) {
      console.error('Refactor actions error:', error)
      return []
    }
  }

  applyRefactor(filePath: string, range: Range, actionKind: string): WorkspaceEdit | null {
    const startOffset = this.positionToOffset(filePath, range.start)
    const endOffset = this.positionToOffset(filePath, range.end)

    // 解析 actionKind: refactor.{refactorName}.{actionName}
    const parts = actionKind.split('.')
    if (parts.length < 3 || parts[0] !== 'refactor') return null

    const refactorName = parts[1]
    const actionName = parts.slice(2).join('.')

    try {
      const edits = this.languageService.getEditsForRefactor(
        filePath,
        {},
        { pos: startOffset, end: endOffset },
        refactorName,
        actionName,
        {}
      )
      if (!edits) return null

      const changes: Record<string, TextEdit[]> = {}

      for (const edit of edits.edits) {
        if (!changes[edit.fileName]) {
          changes[edit.fileName] = []
        }
        for (const change of edit.textChanges) {
          changes[edit.fileName].push({
            range: this.textSpanToRange(edit.fileName, change.span),
            newText: change.newText
          })
        }
      }

      return { changes }
    } catch (error) {
      console.error('Apply refactor error:', error)
      return null
    }
  }

  // ============ 辅助方法 ============

  private getFileContent(filePath: string): string {
    const cached = this.fileVersions.get(filePath)
    if (cached) return cached.content
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  }

  private positionToOffset(filePath: string, position: Position): number {
    const content = this.getFileContent(filePath)
    const lines = content.split('\n')
    let offset = 0
    for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1 // +1 for newline
    }
    offset += Math.min(position.column - 1, lines[position.line - 1]?.length || 0)
    return offset
  }

  private offsetToPosition(filePath: string, offset: number): Position {
    const content = this.getFileContent(filePath)
    const lines = content.split('\n')
    let currentOffset = 0

    for (let i = 0; i < lines.length; i++) {
      if (currentOffset + lines[i].length >= offset) {
        return { line: i + 1, column: offset - currentOffset + 1 }
      }
      currentOffset += lines[i].length + 1
    }

    return { line: lines.length, column: 1 }
  }

  private textSpanToRange(filePath: string, span: ts.TextSpan): Range {
    return {
      start: this.offsetToPosition(filePath, span.start),
      end: this.offsetToPosition(filePath, span.start + span.length)
    }
  }

  private convertCompletionKind(kind: ts.ScriptElementKind): number {
    // Monaco CompletionItemKind 映射
    const mapping: Record<string, number> = {
      [ts.ScriptElementKind.functionElement]: 3,      // Function
      [ts.ScriptElementKind.memberFunctionElement]: 2, // Method
      [ts.ScriptElementKind.classElement]: 7,         // Class
      [ts.ScriptElementKind.interfaceElement]: 8,     // Interface
      [ts.ScriptElementKind.variableElement]: 6,      // Variable
      [ts.ScriptElementKind.constElement]: 21,        // Constant
      [ts.ScriptElementKind.letElement]: 6,           // Variable
      [ts.ScriptElementKind.moduleElement]: 9,        // Module
      [ts.ScriptElementKind.keyword]: 14,             // Keyword
      [ts.ScriptElementKind.memberVariableElement]: 5, // Field
      [ts.ScriptElementKind.constructorImplementationElement]: 4, // Constructor
      [ts.ScriptElementKind.enumElement]: 13,         // Enum
      [ts.ScriptElementKind.enumMemberElement]: 20,   // EnumMember
      [ts.ScriptElementKind.typeElement]: 25,         // TypeParameter
      [ts.ScriptElementKind.typeParameterElement]: 25, // TypeParameter
      [ts.ScriptElementKind.alias]: 9,                // Module
      [ts.ScriptElementKind.directory]: 19,           // Folder
      [ts.ScriptElementKind.scriptElement]: 17,       // File
    }
    // 额外添加 property 映射（如果不在 ScriptElementKind 中）
    if (!mapping['property']) {
      mapping['property'] = 10 // Property
    }
    return mapping[kind] || 1 // Text
  }

  private convertDiagnosticCategory(category: ts.DiagnosticCategory): 'error' | 'warning' | 'info' | 'hint' {
    switch (category) {
      case ts.DiagnosticCategory.Error: return 'error'
      case ts.DiagnosticCategory.Warning: return 'warning'
      case ts.DiagnosticCategory.Suggestion: return 'hint'
      default: return 'info'
    }
  }

  dispose(): void {
    this.languageService.dispose()
  }
}

// ============ 语言检测辅助函数 ============

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath)
  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext'
}

function getLanguageTier(languageId: string): LanguageTier {
  return LANGUAGE_MAP[languageId]?.tier || 'basic'
}

function isNativeLanguage(filePath: string): boolean {
  const languageId = detectLanguage(filePath)
  return getLanguageTier(languageId) === 'native'
}

// ============ 服务管理器 ============

class IntelligenceServiceManager {
  private services: Map<string, TypeScriptLanguageService> = new Map()
  private mainWindow: (() => BrowserWindow | null) | null = null
  private currentProgress: IndexingProgress = {
    phase: 'idle',
    message: '空闲',
    processedFiles: 0,
    totalFiles: 0,
    percentage: 0
  }

  setMainWindow(getMainWindow: () => BrowserWindow | null): void {
    this.mainWindow = getMainWindow
  }

  /** 获取所有已打开项目的根目录 */
  getProjectRoots(): string[] {
    return Array.from(this.services.keys())
  }

  async openProject(rootPath: string): Promise<void> {
    // 启动 TypeScript 原生服务
    if (!this.services.has(rootPath)) {
      const service = new TypeScriptLanguageService(rootPath, (progress) => {
        this.currentProgress = progress
        this.notifyIndexingProgress(progress)
      })
      this.services.set(rootPath, service)

      // 通知前端服务已就绪
      this.notifyStatus({
        language: 'typescript',
        status: 'ready',
        message: `TypeScript service ready`
      })
    }
    // Daemon 语言服务由 languageDaemonService.ts 处理
  }

  private notifyIndexingProgress(progress: IndexingProgress): void {
    if (this.mainWindow) {
      const win = this.mainWindow()
      if (win) {
        win.webContents.send('intelligence:indexingProgress', progress)
      }
    }
  }

  getServiceStatus(): LSPServiceStatus {
    const servers: LanguageServerStatus[] = [
      {
        language: 'typescript',
        status: this.services.size > 0 ? 'ready' : 'stopped'
      }
      // Daemon 语言服务状态由 languageDaemonService.ts 提供
    ]

    return {
      indexing: this.currentProgress,
      analysis: {
        isAnalyzing: false,
        queuedFiles: 0
      },
      servers,
      diagnostics: {
        errors: 0,
        warnings: 0,
        hints: 0
      }
    }
  }

  async closeProject(rootPath: string): Promise<void> {
    // 关闭 TypeScript 服务
    const service = this.services.get(rootPath)
    if (service) {
      service.dispose()
      this.services.delete(rootPath)
    }
    // Daemon 语言服务由 languageDaemonService.ts 管理
  }

  getServiceForFile(filePath: string): TypeScriptLanguageService | null {
    // 查找文件所属的项目
    for (const [rootPath, service] of this.services) {
      if (filePath.startsWith(rootPath)) {
        return service
      }
    }
    return null
  }

  private notifyStatus(status: LanguageServerStatus): void {
    if (this.mainWindow) {
      const win = this.mainWindow()
      if (win) {
        win.webContents.send('intelligence:serverStatusChange', status)
      }
    }
  }
}

// 全局服务管理器实例
const serviceManager = new IntelligenceServiceManager()

// ============ IPC 处理程序注册 ============

export function registerIntelligenceHandlers(getMainWindow: () => BrowserWindow | null): void {
  serviceManager.setMainWindow(getMainWindow)

  // 项目管理
  ipcMain.handle('intelligence:openProject', async (_, rootPath: string) => {
    await serviceManager.openProject(rootPath)
  })

  ipcMain.handle('intelligence:closeProject', async (_, rootPath: string) => {
    await serviceManager.closeProject(rootPath)
  })

  // 文件同步
  ipcMain.on('intelligence:syncFile', (_, filePath: string, content: string, version: number) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (service) {
        service.syncFile(filePath, content, version)
      }
    }
    // Daemon 语言服务文件同步由 languageDaemonService.ts 处理
  })

  ipcMain.on('intelligence:closeFile', (_, filePath: string) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (service) {
        service.closeFile(filePath)
      }
    }
    // Daemon 语言服务文件关闭由 languageDaemonService.ts 处理
  })

  // 文件打开
  ipcMain.on('intelligence:openFile', (_, _filePath: string, _content: string) => {
    // Daemon 语言服务文件打开由 languageDaemonService.ts 处理
  })

  // 补全
  ipcMain.handle('intelligence:completions', async (_, filePath: string, position: Position, triggerCharacter?: string) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return { suggestions: [] }
      return service.getCompletions(filePath, position, triggerCharacter)
    }
    // Daemon 语言服务补全由 languageDaemonService.ts 处理
    return { suggestions: [] }
  })

  // 定义跳转
  ipcMain.handle('intelligence:definitions', async (_, filePath: string, position: Position) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return []
      return service.getDefinitions(filePath, position)
    }
    // Daemon 语言服务定义跳转由 languageDaemonService.ts 处理
    return []
  })

  // 查找引用
  ipcMain.handle('intelligence:references', async (_, filePath: string, position: Position, includeDeclaration?: boolean) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return []
      return service.getReferences(filePath, position, includeDeclaration)
    }
    // Daemon 语言服务查找引用由 languageDaemonService.ts 处理
    return []
  })

  // 诊断
  ipcMain.handle('intelligence:diagnostics', async (_, filePath: string) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return []
      return service.getDiagnostics(filePath)
    }
    // Daemon 语言服务诊断由 languageDaemonService.ts 处理
    return []
  })

  // 悬停信息
  ipcMain.handle('intelligence:hover', async (_, filePath: string, position: Position) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return null
      return service.getHover(filePath, position)
    }
    // Daemon 语言服务悬停信息由 languageDaemonService.ts 处理
    return null
  })

  // 签名帮助 (暂时只支持原生)
  ipcMain.handle('intelligence:signatureHelp', async (_, filePath: string, position: Position) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return null
      return service.getSignatureHelp(filePath, position)
    }
    // LSP 签名帮助可以后续添加
    return null
  })

  // 内联提示 (暂时只支持原生)
  ipcMain.handle('intelligence:inlayHints', async (_, filePath: string, range: Range) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return []
      return service.getInlayHints(filePath, range)
    }
    // LSP inlay hints 可以后续添加
    return []
  })

  // 重命名准备
  ipcMain.handle('intelligence:prepareRename', async (_, filePath: string, position: Position) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return null
      return service.prepareRename(filePath, position)
    }
    // LSP 重命名由 rename 方法直接处理
    return null
  })

  // 重命名
  ipcMain.handle('intelligence:rename', async (_, filePath: string, position: Position, newName: string) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return null
      return service.rename(filePath, position, newName)
    }
    // Daemon 语言服务重命名由 languageDaemonService.ts 处理
    return null
  })

  // 重构操作 (暂时只支持原生)
  ipcMain.handle('intelligence:refactorActions', async (_, filePath: string, range: Range) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return []
      return service.getRefactorActions(filePath, range)
    }
    // LSP 重构可以后续添加
    return []
  })

  // 应用重构 (暂时只支持原生)
  ipcMain.handle('intelligence:applyRefactor', async (_, filePath: string, range: Range, actionKind: string) => {
    if (isNativeLanguage(filePath)) {
      const service = serviceManager.getServiceForFile(filePath)
      if (!service) return null
      return service.applyRefactor(filePath, range, actionKind)
    }
    return null
  })

  // 服务器状态
  ipcMain.handle('intelligence:serverStatus', async (_, language: string) => {
    // TypeScript/JavaScript 原生服务
    if (language === 'typescript' || language === 'javascript' ||
        language === 'typescriptreact' || language === 'javascriptreact') {
      return {
        language,
        status: 'ready' as const,
        message: 'TypeScript Language Service is ready'
      }
    }

    // Daemon 支持的语言
    const langInfo = LANGUAGE_MAP[language]
    if (langInfo?.tier === 'daemon') {
      return {
        language,
        status: 'ready' as const,
        message: `${langInfo.displayName} support via logos-daemon`
      }
    }

    return {
      language,
      status: 'stopped' as const,
      message: `Language ${language} is not supported yet`
    }
  })

  // 服务状态（包含索引进度）
  ipcMain.handle('intelligence:serviceStatus', async () => {
    return serviceManager.getServiceStatus()
  })

  // ============ 智能模式管理 ============

  // 当前模式
  let currentMode: 'basic' | 'smart' = 'basic'

  // 设置智能模式
  ipcMain.handle('intelligence:setMode', async (_, mode: 'basic' | 'smart') => {
    const previousMode = currentMode
    currentMode = mode

    console.log(`[Intelligence] Switching mode: ${previousMode} -> ${mode}`)

    const mainWindow = getMainWindow()
    if (!mainWindow) return

    const daemon = getLanguageDaemonService(getMainWindow)

    if (mode === 'smart') {
      // 切换到 Smart Mode
      mainWindow.webContents.send('intelligence:indexingProgress', {
        phase: 'scanning',
        message: 'Starting Smart Mode indexing...',
        processedFiles: 0,
        totalFiles: 0,
        percentage: 0
      })

      try {
        // 启动 logos-daemon
        await daemon.start()
        console.log('[Intelligence] Daemon started successfully')

        mainWindow.webContents.send('intelligence:indexingProgress', {
          phase: 'ready',
          message: 'Smart Mode ready',
          processedFiles: 0,
          totalFiles: 0,
          percentage: 100
        })
      } catch (error) {
        console.error('[Intelligence] Failed to start daemon:', error)
        mainWindow.webContents.send('intelligence:indexingProgress', {
          phase: 'idle',
          message: `Failed to start daemon: ${(error as Error).message}`,
          processedFiles: 0,
          totalFiles: 0,
          percentage: 0
        })
        // 回退到 Basic 模式
        currentMode = 'basic'
      }
    } else {
      // 切换到 Basic Mode
      try {
        // 停止 Daemon
        await daemon.stop()
        console.log('[Intelligence] Daemon stopped')
      } catch (error) {
        console.warn('[Intelligence] Failed to stop daemon:', error)
      }

      mainWindow.webContents.send('intelligence:indexingProgress', {
        phase: 'idle',
        message: '',
        processedFiles: 0,
        totalFiles: 0,
        percentage: 0
      })
    }
  })

  // 分析项目
  ipcMain.handle('intelligence:analyzeProject', async () => {
    // 获取当前项目根目录
    const projectRoots = serviceManager.getProjectRoots()
    const rootPath = projectRoots[0]

    if (!rootPath) {
      return {
        fileCount: 0,
        totalSize: 0,
        estimatedMemory: 0,
        hasComplexDependencies: false,
        languages: []
      }
    }

    try {
      // 统计文件
      const stats = await analyzeProjectFiles(rootPath)
      return stats
    } catch (error) {
      console.error('[Intelligence] Failed to analyze project:', error)
      return {
        fileCount: 0,
        totalSize: 0,
        estimatedMemory: 0,
        hasComplexDependencies: false,
        languages: []
      }
    }
  })
}

// 分析项目文件
async function analyzeProjectFiles(rootPath: string): Promise<{
  fileCount: number
  totalSize: number
  estimatedMemory: number
  hasComplexDependencies: boolean
  languages: string[]
}> {
  const languageSet = new Set<string>()
  let fileCount = 0
  let totalSize = 0

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        // 跳过 node_modules, .git 等目录
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.next', 'target'].includes(entry.name)) {
            await walkDir(fullPath)
          }
          continue
        }

        if (entry.isFile()) {
          const ext = path.extname(entry.name)
          const langId = EXTENSION_TO_LANGUAGE[ext]
          if (langId) {
            languageSet.add(langId)
            fileCount++
            try {
              const stat = await fs.promises.stat(fullPath)
              totalSize += stat.size
            } catch {
              // 忽略无法访问的文件
            }
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  await walkDir(rootPath)

  // 检查是否有复杂依赖 (package.json 中的依赖数量)
  let hasComplexDependencies = false
  try {
    const pkgPath = path.join(rootPath, 'package.json')
    const pkgContent = await fs.promises.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgContent)
    const depCount = Object.keys(pkg.dependencies || {}).length +
                     Object.keys(pkg.devDependencies || {}).length
    hasComplexDependencies = depCount > 50
  } catch {
    // 无 package.json 或解析失败
  }

  return {
    fileCount,
    totalSize,
    // 估算内存需求 (每个文件约 1KB symbol table)
    estimatedMemory: Math.ceil(fileCount * 1.5 / 1024), // MB
    hasComplexDependencies,
    languages: Array.from(languageSet)
  }
}

export { serviceManager }
