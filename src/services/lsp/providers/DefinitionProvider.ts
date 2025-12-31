/**
 * 定义跳转 Provider
 * 支持双路径: IPC (TypeScript/JavaScript) 和 WASM (其他语言)
 */

import * as monaco from 'monaco-editor'
import { wasmService } from '@/services/language/WasmLanguageService'

export class DefinitionProvider implements monaco.languages.DefinitionProvider {
  private mode: 'ipc' | 'wasm'

  constructor(mode: 'ipc' | 'wasm' = 'ipc') {
    this.mode = mode
  }

  async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Definition | null> {
    if (token.isCancellationRequested) return null

    const filePath = model.uri.fsPath

    try {
      if (this.mode === 'wasm') {
        return this.provideWasmDefinition(filePath, position, token)
      } else {
        return this.provideIpcDefinition(filePath, position, token)
      }
    } catch (error) {
      console.error('Definition error:', error)
      return null
    }
  }

  private async provideIpcDefinition(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Definition | null> {
    const pos = { line: position.lineNumber, column: position.column }

    const definitions = await window.electronAPI.intelligence.getDefinitions(filePath, pos)

    if (token.isCancellationRequested) return null

    if (!definitions || definitions.length === 0) return null

    return definitions.map(def => ({
      uri: monaco.Uri.file(def.uri),
      range: new monaco.Range(
        def.range.start.line,
        def.range.start.column,
        def.range.end.line,
        def.range.end.column
      ),
    }))
  }

  private provideWasmDefinition(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): monaco.languages.Definition | null {
    if (!wasmService.isInitialized()) return null

    // WASM 使用 0-indexed 行列号
    const definition = wasmService.getDefinition(
      filePath,
      position.lineNumber - 1,
      position.column - 1
    )

    if (token.isCancellationRequested) return null

    if (!definition) return null

    return {
      uri: monaco.Uri.file(definition.uri),
      range: new monaco.Range(
        definition.range.startLine + 1,
        definition.range.startColumn + 1,
        definition.range.endLine + 1,
        definition.range.endColumn + 1
      ),
    }
  }
}
