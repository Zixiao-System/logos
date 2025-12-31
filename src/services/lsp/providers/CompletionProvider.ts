/**
 * 补全 Provider
 * 支持双路径: IPC (TypeScript/JavaScript) 和 WASM (其他语言)
 */

import * as monaco from 'monaco-editor'
import { wasmService } from '@/services/language/WasmLanguageService'

export class CompletionProvider implements monaco.languages.CompletionItemProvider {
  triggerCharacters = ['.', '"', "'", '/', '@', '<', '{', '(']
  private mode: 'ipc' | 'wasm'

  constructor(mode: 'ipc' | 'wasm' = 'ipc') {
    this.mode = mode
  }

  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList | null> {
    if (token.isCancellationRequested) return null

    const filePath = model.uri.fsPath

    try {
      if (this.mode === 'wasm') {
        return this.provideWasmCompletions(filePath, position, token)
      } else {
        return this.provideIpcCompletions(filePath, position, context, token)
      }
    } catch (error) {
      console.error('Completion error:', error)
      return null
    }
  }

  private async provideIpcCompletions(
    filePath: string,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList | null> {
    const pos = { line: position.lineNumber, column: position.column }
    const triggerChar = context.triggerCharacter

    const result = await window.electronAPI.intelligence.getCompletions(
      filePath,
      pos,
      triggerChar
    )

    if (token.isCancellationRequested) return null

    return {
      suggestions: result.suggestions.map(item => {
        const suggestion: monaco.languages.CompletionItem = {
          label: item.label,
          kind: item.kind as monaco.languages.CompletionItemKind,
          detail: item.detail,
          documentation: item.documentation
            ? typeof item.documentation === 'string'
              ? item.documentation
              : { value: item.documentation.value, isTrusted: item.documentation.isTrusted }
            : undefined,
          insertText: item.insertText,
          insertTextRules: item.insertTextRules as monaco.languages.CompletionItemInsertTextRule,
          sortText: item.sortText,
          filterText: item.filterText,
          preselect: item.preselect,
          range: undefined as unknown as monaco.IRange,
        }

        if (item.range) {
          suggestion.range = new monaco.Range(
            item.range.startLineNumber,
            item.range.startColumn,
            item.range.endLineNumber,
            item.range.endColumn
          )
        }

        return suggestion
      }),
      incomplete: result.incomplete ?? false,
    }
  }

  private provideWasmCompletions(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): monaco.languages.CompletionList | null {
    if (!wasmService.isInitialized()) return null

    // WASM 使用 0-indexed 行列号
    const completions = wasmService.getCompletions(
      filePath,
      position.lineNumber - 1,
      position.column - 1
    )

    if (token.isCancellationRequested) return null

    return {
      suggestions: completions.map(item => ({
        label: item.label,
        kind: item.kind as monaco.languages.CompletionItemKind,
        detail: item.detail,
        insertText: item.label,
        range: undefined as unknown as monaco.IRange,
      })),
      incomplete: false,
    }
  }
}
