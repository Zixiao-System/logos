/**
 * 重命名 Provider
 * 支持双路径: IPC (TypeScript/JavaScript) 和 WASM (其他语言)
 */

import * as monaco from 'monaco-editor'
import { wasmService } from '@/services/language/WasmLanguageService'

export class RenameProvider implements monaco.languages.RenameProvider {
  private mode: 'ipc' | 'wasm'

  constructor(mode: 'ipc' | 'wasm' = 'ipc') {
    this.mode = mode
  }

  async provideRenameEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    newName: string,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.WorkspaceEdit | null> {
    if (token.isCancellationRequested) return null

    const filePath = model.uri.fsPath

    try {
      if (this.mode === 'wasm') {
        return this.provideWasmRenameEdits(filePath, position, newName, token)
      } else {
        return this.provideIpcRenameEdits(filePath, position, newName, token)
      }
    } catch (error) {
      console.error('Rename error:', error)
      return null
    }
  }

  async resolveRenameLocation(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.RenameLocation | null> {
    if (token.isCancellationRequested) return null

    const filePath = model.uri.fsPath

    try {
      if (this.mode === 'wasm') {
        return this.resolveWasmRenameLocation(filePath, position, token)
      } else {
        return this.resolveIpcRenameLocation(filePath, position, token)
      }
    } catch (error) {
      console.error('Prepare rename error:', error)
      return null
    }
  }

  private async provideIpcRenameEdits(
    filePath: string,
    position: monaco.Position,
    newName: string,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.WorkspaceEdit | null> {
    const pos = { line: position.lineNumber, column: position.column }

    const workspaceEdit = await window.electronAPI.intelligence.rename(
      filePath,
      pos,
      newName
    )

    if (token.isCancellationRequested) return null

    if (!workspaceEdit) return null

    const edits: monaco.languages.IWorkspaceTextEdit[] = []

    for (const [uri, textEdits] of Object.entries(workspaceEdit.changes)) {
      for (const edit of textEdits) {
        edits.push({
          resource: monaco.Uri.file(uri),
          textEdit: {
            range: new monaco.Range(
              edit.range.start.line,
              edit.range.start.column,
              edit.range.end.line,
              edit.range.end.column
            ),
            text: edit.newText,
          },
          versionId: undefined,
        })
      }
    }

    return { edits }
  }

  private provideWasmRenameEdits(
    filePath: string,
    position: monaco.Position,
    newName: string,
    token: monaco.CancellationToken
  ): monaco.languages.WorkspaceEdit | null {
    if (!wasmService.isInitialized()) return null

    // WASM 使用 0-indexed 行列号
    const workspaceEdit = wasmService.rename(
      filePath,
      position.lineNumber - 1,
      position.column - 1,
      newName
    )

    if (token.isCancellationRequested) return null

    if (!workspaceEdit) return null

    const edits: monaco.languages.IWorkspaceTextEdit[] = []

    for (const [uri, textEdits] of Object.entries(workspaceEdit.changes)) {
      for (const edit of textEdits) {
        edits.push({
          resource: monaco.Uri.file(uri),
          textEdit: {
            range: new monaco.Range(
              edit.range.startLine + 1,
              edit.range.startColumn + 1,
              edit.range.endLine + 1,
              edit.range.endColumn + 1
            ),
            text: edit.newText,
          },
          versionId: undefined,
        })
      }
    }

    return { edits }
  }

  private async resolveIpcRenameLocation(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.RenameLocation | null> {
    const pos = { line: position.lineNumber, column: position.column }

    const result = await window.electronAPI.intelligence.prepareRename(filePath, pos)

    if (token.isCancellationRequested) return null

    if (!result) return null

    return {
      range: new monaco.Range(
        result.range.start.line,
        result.range.start.column,
        result.range.end.line,
        result.range.end.column
      ),
      text: result.placeholder,
    }
  }

  private resolveWasmRenameLocation(
    filePath: string,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): monaco.languages.RenameLocation | null {
    if (!wasmService.isInitialized()) return null

    // WASM 使用 0-indexed 行列号
    const result = wasmService.prepareRename(
      filePath,
      position.lineNumber - 1,
      position.column - 1
    )

    if (token.isCancellationRequested) return null

    if (!result) return null

    return {
      range: new monaco.Range(
        result.range.startLine + 1,
        result.range.startColumn + 1,
        result.range.endLine + 1,
        result.range.endColumn + 1
      ),
      text: result.placeholder,
    }
  }
}
