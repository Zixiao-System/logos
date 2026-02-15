/**
 * BreakpointInlineWidget unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Must mock monaco-editor before any source file that imports it
vi.mock('monaco-editor', () => ({
  default: {},
  editor: {
    ContentWidgetPositionPreference: {
      BELOW: 2
    }
  }
}))

// Import after mock is set up
const { BreakpointInlineWidget } = await import('@/services/debug/BreakpointInlineWidget')

function createMockEditor() {
  return {
    addContentWidget: vi.fn(),
    removeContentWidget: vi.fn()
  }
}

describe('BreakpointInlineWidget', () => {
  let mockEditor: ReturnType<typeof createMockEditor>

  beforeEach(() => {
    mockEditor = createMockEditor()
  })

  it('creates correct DOM structure', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    const dom = widget.getDomNode()
    expect(dom.className).toBe('breakpoint-inline-widget')
    expect(dom.querySelector('select')).not.toBeNull()
    expect(dom.querySelector('input')).not.toBeNull()
  })

  it('has correct ID', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    expect(widget.getId()).toBe('breakpoint.inline.widget')
  })

  it('returns correct position', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 10,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    const pos = widget.getPosition()
    expect(pos.position.lineNumber).toBe(11) // lineNumber + 1
    expect(pos.position.column).toBe(1)
  })

  it('show() adds content widget', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    widget.show()

    expect(mockEditor.addContentWidget).toHaveBeenCalledWith(widget)
  })

  it('hide() removes content widget', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    widget.show()
    widget.hide()

    expect(mockEditor.removeContentWidget).toHaveBeenCalledWith(widget)
  })

  it('Enter key triggers onAccept with correct values', () => {
    const onAccept = vi.fn()
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      mode: 'expression',
      onAccept,
      onCancel: vi.fn()
    })

    widget.show()

    const input = widget.getDomNode().querySelector('input')!
    input.value = 'x > 5'

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    input.dispatchEvent(event)

    expect(onAccept).toHaveBeenCalledWith('expression', 'x > 5')
  })

  it('Escape key triggers onCancel', () => {
    const onCancel = vi.fn()
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel
    })

    widget.show()

    const input = widget.getDomNode().querySelector('input')!
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    input.dispatchEvent(event)

    expect(onCancel).toHaveBeenCalled()
  })

  it('mode selector changes update placeholder', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      mode: 'expression',
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    const select = widget.getDomNode().querySelector('select')!
    const input = widget.getDomNode().querySelector('input')!

    // Initially expression placeholder
    expect(input.placeholder).toContain('expression is true')

    // Change to logMessage
    select.value = 'logMessage'
    select.dispatchEvent(new Event('change'))

    expect(input.placeholder).toContain('Log message')
  })

  it('initializes with provided mode and value', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      mode: 'logMessage',
      initialValue: 'Hello {name}',
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    const select = widget.getDomNode().querySelector('select')! as HTMLSelectElement
    const input = widget.getDomNode().querySelector('input')! as HTMLInputElement

    expect(select.value).toBe('logMessage')
    expect(input.value).toBe('Hello {name}')
  })

  it('dispose cleans up', () => {
    const widget = new BreakpointInlineWidget({
      editor: mockEditor as any,
      lineNumber: 5,
      onAccept: vi.fn(),
      onCancel: vi.fn()
    })

    widget.show()
    widget.dispose()

    // Should have removed the widget
    expect(mockEditor.removeContentWidget).toHaveBeenCalled()

    // Double dispose should not throw
    widget.dispose()
  })
})
