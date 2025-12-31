/**
 * 语言检测工具
 * 用于判断文件应该使用哪个语言服务 (WASM vs IPC)
 */

import { WASM_EXTENSION_MAP, WASM_SUPPORTED_LANGUAGES } from '@/types/wasm'
import type { WasmSupportedLanguage } from '@/types/wasm'

/**
 * 获取文件扩展名 (不依赖 Node.js path 模块)
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filePath.length - 1) return ''
  return filePath.substring(lastDot).toLowerCase()
}

/**
 * 判断文件是否应使用 WASM 语言服务
 */
export function isWasmLanguage(filePath: string): boolean {
  const ext = getExtension(filePath)
  return ext in WASM_EXTENSION_MAP
}

/**
 * 判断文件是否应使用原生 TypeScript 语言服务 (IPC)
 */
export function isNativeLanguage(filePath: string): boolean {
  const ext = getExtension(filePath)
  const nativeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
  return nativeExtensions.includes(ext)
}

/**
 * 获取文件的语言 ID
 */
export function getLanguageId(filePath: string): string {
  const ext = getExtension(filePath)

  // WASM 语言
  if (ext in WASM_EXTENSION_MAP) {
    return WASM_EXTENSION_MAP[ext]
  }

  // 原生 TypeScript/JavaScript 语言
  const nativeMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.mts': 'typescript',
    '.cts': 'typescript'
  }

  if (ext in nativeMap) {
    return nativeMap[ext]
  }

  // 默认返回纯文本
  return 'plaintext'
}

/**
 * 获取语言服务类型
 */
export function getLanguageServiceType(filePath: string): 'wasm' | 'native' | 'none' {
  if (isWasmLanguage(filePath)) return 'wasm'
  if (isNativeLanguage(filePath)) return 'native'
  return 'none'
}

/**
 * 获取所有 WASM 支持的语言列表
 */
export function getWasmSupportedLanguages(): readonly WasmSupportedLanguage[] {
  return WASM_SUPPORTED_LANGUAGES
}

/**
 * Monaco 语言 ID 到 WASM 语言 ID 的映射
 */
export function monacoLanguageToWasm(monacoLanguage: string): string | null {
  const mapping: Record<string, WasmSupportedLanguage> = {
    'python': 'python',
    'go': 'go',
    'rust': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'java': 'java'
  }
  return mapping[monacoLanguage] || null
}
