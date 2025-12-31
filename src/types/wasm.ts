/**
 * WASM 语言服务类型定义
 * 用于解析 Rust WASM 模块返回的 JSON 数据
 */

/** 位置信息 */
export interface WasmPosition {
  line: number
  column: number
}

/** 范围信息 */
export interface WasmRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/** 补全项 */
export interface WasmCompletionItem {
  label: string
  kind: number
  detail?: string
}

/** 位置引用 */
export interface WasmLocation {
  uri: string
  range: WasmRange
}

/** 悬停信息 */
export interface WasmHoverInfo {
  contents: string
  range?: WasmRange
}

/** 文档符号 */
export interface WasmDocumentSymbol {
  name: string
  kind: number
  range: WasmRange
  selectionRange: WasmRange
}

/** 诊断信息 */
export interface WasmDiagnostic {
  range: WasmRange
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
}

/** 准备重命名结果 */
export interface WasmPrepareRenameResult {
  range: WasmRange
  placeholder: string
}

/** 文本编辑 */
export interface WasmTextEdit {
  range: WasmRange
  newText: string
}

/** 工作区编辑 */
export interface WasmWorkspaceEdit {
  changes: Record<string, WasmTextEdit[]>
}

/** 搜索结果符号 */
export interface WasmSearchSymbol {
  name: string
  kind: number
  uri: string
  range: WasmRange
}

/** WASM 支持的语言列表 */
export const WASM_SUPPORTED_LANGUAGES = ['python', 'go', 'rust', 'c', 'cpp', 'java'] as const
export type WasmSupportedLanguage = typeof WASM_SUPPORTED_LANGUAGES[number]

/** 文件扩展名到语言 ID 的映射 */
export const WASM_EXTENSION_MAP: Record<string, WasmSupportedLanguage> = {
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
  '.java': 'java'
}
