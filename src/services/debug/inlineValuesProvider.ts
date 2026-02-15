/**
 * Inline Debug Values Provider
 * Shows variable values inline beside code lines when paused, like VS Code.
 */

import type * as monaco from 'monaco-editor'
import type { DebugScope, DebugVariable } from '@/stores/debug'

interface InlineValueDecoration {
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  options: {
    after?: {
      content: string
      inlineClassName: string
    }
    isWholeLine?: boolean
  }
}

/**
 * Compute inline value decorations for visible lines.
 * For each visible line, scan for identifiers that match known variable names
 * and create "after" decorations showing their values.
 */
export function computeInlineValues(
  editor: monaco.editor.IStandaloneCodeEditor,
  scopes: DebugScope[],
  variables: Map<number, DebugVariable[]>
): InlineValueDecoration[] {
  const model = editor.getModel()
  if (!model) return []

  // Collect top-level variables from all non-expensive scopes
  const varMap = new Map<string, string>()
  for (const scope of scopes) {
    if (scope.expensive) continue
    const scopeVars = variables.get(scope.variablesReference) || []
    for (const v of scopeVars) {
      // Only include leaf values (primitives), skip complex objects
      if (!varMap.has(v.name)) {
        const displayValue = v.value.length > 50 ? v.value.substring(0, 50) + '...' : v.value
        varMap.set(v.name, displayValue)
      }
    }
  }

  if (varMap.size === 0) return []

  // Get visible range
  const visibleRanges = editor.getVisibleRanges()
  if (visibleRanges.length === 0) return []

  const decorations: InlineValueDecoration[] = []
  const seenLines = new Set<number>()

  // Build a regex to match variable names as whole words
  const varNames = Array.from(varMap.keys()).filter(n => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(n))
  if (varNames.length === 0) return []

  const pattern = new RegExp(`\\b(${varNames.map(escapeRegex).join('|')})\\b`, 'g')

  for (const range of visibleRanges) {
    for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
      if (seenLines.has(line)) continue
      seenLines.add(line)

      const lineContent = model.getLineContent(line)
      if (!lineContent.trim()) continue

      // Find all variable references on this line
      const lineVars = new Map<string, string>()
      let match: RegExpExecArray | null
      pattern.lastIndex = 0
      while ((match = pattern.exec(lineContent)) !== null) {
        const name = match[1]
        const value = varMap.get(name)
        if (value !== undefined && !lineVars.has(name)) {
          lineVars.set(name, value)
        }
      }

      if (lineVars.size === 0) continue

      // Build inline text: "  varName = value, varName2 = value2"
      const parts: string[] = []
      for (const [name, value] of lineVars) {
        parts.push(`${name} = ${value}`)
      }
      const inlineText = '  ' + parts.join(', ')

      const lineLength = model.getLineMaxColumn(line)
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: lineLength,
          endLineNumber: line,
          endColumn: lineLength
        },
        options: {
          after: {
            content: inlineText,
            inlineClassName: 'debug-inline-value'
          }
        }
      })
    }
  }

  return decorations
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
