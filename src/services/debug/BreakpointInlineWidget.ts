/**
 * Breakpoint Inline Widget
 * IContentWidget that shows an inline editor for conditional breakpoints, logpoints, and hit counts.
 */

import * as monaco from 'monaco-editor'

export type BreakpointEditMode = 'expression' | 'hitCount' | 'logMessage'

export interface BreakpointInlineWidgetOptions {
  editor: monaco.editor.IStandaloneCodeEditor
  lineNumber: number
  mode?: BreakpointEditMode
  initialValue?: string
  onAccept: (mode: BreakpointEditMode, value: string) => void
  onCancel: () => void
}

const MODE_LABELS: Record<BreakpointEditMode, string> = {
  expression: 'Expression',
  hitCount: 'Hit Count',
  logMessage: 'Log Message'
}

const MODE_PLACEHOLDERS: Record<BreakpointEditMode, string> = {
  expression: 'Break when expression is true, e.g. x > 5',
  hitCount: 'Break when hit count matches, e.g. >= 3',
  logMessage: 'Log message, expressions in {}, e.g. value is {x}'
}

export class BreakpointInlineWidget implements monaco.editor.IContentWidget {
  private readonly domNode: HTMLElement
  private readonly selectEl: HTMLSelectElement
  private readonly inputEl: HTMLInputElement
  private readonly editor: monaco.editor.IStandaloneCodeEditor
  private readonly lineNumber: number
  private currentMode: BreakpointEditMode
  private readonly onAccept: (mode: BreakpointEditMode, value: string) => void
  private readonly onCancel: () => void
  private disposed = false

  static readonly ID = 'breakpoint.inline.widget'

  constructor(options: BreakpointInlineWidgetOptions) {
    this.editor = options.editor
    this.lineNumber = options.lineNumber
    this.currentMode = options.mode || 'expression'
    this.onAccept = options.onAccept
    this.onCancel = options.onCancel

    // Build DOM
    this.domNode = document.createElement('div')
    this.domNode.className = 'breakpoint-inline-widget'
    this.domNode.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--mdui-color-surface-container-high, #2d2d2d);
      border: 1px solid var(--mdui-color-outline-variant, #444);
      border-radius: 4px;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `

    // Mode selector
    this.selectEl = document.createElement('select')
    this.selectEl.style.cssText = `
      background: var(--mdui-color-surface-container, #1e1e1e);
      color: var(--mdui-color-on-surface, #ccc);
      border: 1px solid var(--mdui-color-outline-variant, #444);
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 12px;
      outline: none;
    `
    for (const [value, label] of Object.entries(MODE_LABELS)) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      this.selectEl.appendChild(option)
    }
    this.selectEl.value = this.currentMode
    this.selectEl.addEventListener('change', () => {
      this.currentMode = this.selectEl.value as BreakpointEditMode
      this.inputEl.placeholder = MODE_PLACEHOLDERS[this.currentMode]
    })

    // Input field
    this.inputEl = document.createElement('input')
    this.inputEl.type = 'text'
    this.inputEl.value = options.initialValue || ''
    this.inputEl.placeholder = MODE_PLACEHOLDERS[this.currentMode]
    this.inputEl.style.cssText = `
      flex: 1;
      min-width: 300px;
      background: var(--mdui-color-surface-container, #1e1e1e);
      color: var(--mdui-color-on-surface, #ccc);
      border: 1px solid var(--mdui-color-outline-variant, #444);
      border-radius: 3px;
      padding: 3px 8px;
      font-size: 12px;
      font-family: var(--mdui-typescale-body-medium-font, monospace);
      outline: none;
    `
    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        this.onAccept(this.currentMode, this.inputEl.value)
        this.hide()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.onCancel()
        this.hide()
      }
    })

    // Prevent editor from capturing events
    this.domNode.addEventListener('keydown', (e) => e.stopPropagation())
    this.domNode.addEventListener('mousedown', (e) => e.stopPropagation())

    this.domNode.appendChild(this.selectEl)
    this.domNode.appendChild(this.inputEl)
  }

  getId(): string {
    return BreakpointInlineWidget.ID
  }

  getDomNode(): HTMLElement {
    return this.domNode
  }

  getPosition(): monaco.editor.IContentWidgetPosition {
    return {
      position: { lineNumber: this.lineNumber + 1, column: 1 },
      preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
    }
  }

  show(): void {
    this.editor.addContentWidget(this)
    requestAnimationFrame(() => {
      this.inputEl.focus()
    })
  }

  hide(): void {
    if (!this.disposed) {
      this.editor.removeContentWidget(this)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.editor.removeContentWidget(this)
    this.disposed = true
  }
}
