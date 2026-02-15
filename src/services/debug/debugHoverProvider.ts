/**
 * Debug Hover Provider
 * Registers a Monaco HoverProvider that evaluates expressions when debugging is paused.
 */

import * as monaco from 'monaco-editor'
import { useDebugStore } from '@/stores/debug'

let hoverProviderDisposable: monaco.IDisposable | null = null

const MAX_RESULT_LENGTH = 500
const HOVER_TIMEOUT_MS = 2000

/**
 * Extract the expression under cursor, supporting dot chains (a.b.c) and bracket access (arr[0]).
 */
export function getExpressionAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): string | null {
  const wordInfo = model.getWordAtPosition(position)
  if (!wordInfo) return null

  const lineContent = model.getLineContent(position.lineNumber)
  let startCol = wordInfo.startColumn - 1
  let endCol = wordInfo.endColumn - 1

  // Expand left: support dot chains like obj.prop.sub
  while (startCol > 0) {
    const ch = lineContent[startCol - 1]
    if (ch === '.') {
      // Continue past the dot to find the preceding word
      let prevEnd = startCol - 1
      let prevStart = prevEnd
      while (prevStart > 0 && /[\w$]/.test(lineContent[prevStart - 1])) {
        prevStart--
      }
      if (prevStart < prevEnd) {
        startCol = prevStart
      } else {
        break
      }
    } else {
      break
    }
  }

  // Expand right: support bracket access like arr[0]
  while (endCol < lineContent.length) {
    if (lineContent[endCol] === '[') {
      const closeBracket = lineContent.indexOf(']', endCol + 1)
      if (closeBracket !== -1) {
        endCol = closeBracket + 1
      } else {
        break
      }
    } else if (lineContent[endCol] === '.') {
      // Continue with dot-chained property
      endCol++
      while (endCol < lineContent.length && /[\w$]/.test(lineContent[endCol])) {
        endCol++
      }
    } else {
      break
    }
  }

  const expression = lineContent.substring(startCol, endCol).trim()
  return expression || null
}

/**
 * Register the debug hover provider for all languages.
 */
export function registerDebugHoverProvider(): void {
  if (hoverProviderDisposable) return

  hoverProviderDisposable = monaco.languages.registerHoverProvider('*', {
    async provideHover(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): Promise<monaco.languages.Hover | null> {
      const debugStore = useDebugStore()

      if (!debugStore.isPaused) return null

      const expression = getExpressionAtPosition(model, position)
      if (!expression) return null

      try {
        const result = await Promise.race([
          debugStore.evaluate(expression, 'hover'),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), HOVER_TIMEOUT_MS)
          )
        ])

        if (!result) return null

        let displayValue = result.result || String(result)
        if (displayValue.length > MAX_RESULT_LENGTH) {
          displayValue = displayValue.substring(0, MAX_RESULT_LENGTH) + '...'
        }

        const typeInfo = result.type ? `*${result.type}*\n\n` : ''
        const contents: monaco.IMarkdownString[] = [
          { value: `${typeInfo}\`\`\`\n${expression} = ${displayValue}\n\`\`\`` }
        ]

        const wordInfo = model.getWordAtPosition(position)
        const range = wordInfo
          ? new monaco.Range(
              position.lineNumber,
              wordInfo.startColumn,
              position.lineNumber,
              wordInfo.endColumn
            )
          : new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            )

        return { contents, range }
      } catch {
        // Silently return null on evaluation failure or timeout
        return null
      }
    }
  })
}

/**
 * Dispose the debug hover provider.
 */
export function disposeDebugHoverProvider(): void {
  if (hoverProviderDisposable) {
    hoverProviderDisposable.dispose()
    hoverProviderDisposable = null
  }
}
