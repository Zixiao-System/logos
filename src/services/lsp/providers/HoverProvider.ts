/**
 * 悬停信息 Provider
 * 支持双路径: IPC (TypeScript/JavaScript) 和 WASM (其他语言)
 */

import * as monaco from 'monaco-editor'
import { wasmService } from '@/services/language/WasmLanguageService'

export class HoverProvider implements monaco.languages.HoverProvider {
  private mode: 'ipc' | 'wasm'

  constructor(mode: 'ipc' | 'wasm' = 'ipc') {
    this.mode = mode
  }

  async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | null> {
    if (token.isCancellationRequested) return null

    const filePath = model.uri.fsPath

    try {
      if (this.mode === 'wasm') {
        return this.provideWasmHover(filePath, position, token)
      } else {
        return this.provideIpcHover(filePath, position, token)
      }
    } catch (error) {
      console.error('Hover error:', error)
      return null
    }
  }

  private async provideIpcHover(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | null> {
    const pos = { line: position.lineNumber, column: position.column }

    const hover = await window.electronAPI.intelligence.getHover(filePath, pos)

    if (token.isCancellationRequested) return null

    if (!hover || hover.contents.length === 0) return null

    const contents: monaco.IMarkdownString[] = hover.contents.map(content => ({
      value: content.language
        ? `\`\`\`${content.language}\n${content.value}\n\`\`\``
        : content.value,
      isTrusted: true,
    }))

    return {
      contents,
      range: hover.range
        ? new monaco.Range(
            hover.range.start.line,
            hover.range.start.column,
            hover.range.end.line,
            hover.range.end.column
          )
        : undefined,
    }
  }

  private provideWasmHover(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): monaco.languages.Hover | null {
    if (!wasmService.isInitialized()) return null

    // WASM 使用 0-indexed 行列号
    const hover = wasmService.getHover(
      filePath,
      position.lineNumber - 1,
      position.column - 1
    )

    if (token.isCancellationRequested) return null

    if (!hover) return null

    // WASM 返回的 contents 是字符串
    const contents: monaco.IMarkdownString[] = [{
      value: hover.contents,
      isTrusted: true,
    }]

    return {
      contents,
      range: hover.range
        ? new monaco.Range(
            hover.range.startLine + 1,
            hover.range.startColumn + 1,
            hover.range.endLine + 1,
            hover.range.endColumn + 1
          )
        : undefined,
    }
  }
}
