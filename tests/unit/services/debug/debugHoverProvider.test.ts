/**
 * Debug Hover Provider unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock module-level state tracking
const mockDisposable = { dispose: vi.fn() }
const mockRegisterHoverProvider = vi.fn().mockReturnValue(mockDisposable)

// Mock monaco-editor before any source file imports it
vi.mock('monaco-editor', () => ({
  default: {},
  languages: {
    registerHoverProvider: mockRegisterHoverProvider
  },
  Range: class MockRange {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  }
}))

// Mock the debug store
const mockDebugStore = {
  isPaused: false,
  evaluate: vi.fn()
}

vi.mock('@/stores/debug', () => ({
  useDebugStore: () => mockDebugStore
}))

// Import after mocks are set up
const { registerDebugHoverProvider, disposeDebugHoverProvider, getExpressionAtPosition } =
  await import('@/services/debug/debugHoverProvider')

describe('debugHoverProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDebugStore.isPaused = false
    mockDebugStore.evaluate.mockReset()
    // Dispose any existing provider
    disposeDebugHoverProvider()
    // Reset the registerHoverProvider mock return value
    mockDisposable.dispose.mockClear()
    mockRegisterHoverProvider.mockReturnValue(mockDisposable)
  })

  describe('registerDebugHoverProvider', () => {
    it('registers a hover provider for all languages', () => {
      registerDebugHoverProvider()

      expect(mockRegisterHoverProvider).toHaveBeenCalledWith('*', expect.any(Object))
    })

    it('does not register twice', () => {
      registerDebugHoverProvider()
      registerDebugHoverProvider()

      expect(mockRegisterHoverProvider).toHaveBeenCalledTimes(1)
    })
  })

  describe('disposeDebugHoverProvider', () => {
    it('disposes the registered provider', () => {
      registerDebugHoverProvider()
      disposeDebugHoverProvider()

      expect(mockDisposable.dispose).toHaveBeenCalled()
    })

    it('does nothing if not registered', () => {
      disposeDebugHoverProvider()
      // Should not throw
    })
  })

  describe('provideHover', () => {
    function getHoverProvider() {
      registerDebugHoverProvider()
      const call = mockRegisterHoverProvider.mock.calls[0]
      return call[1] as { provideHover: (model: unknown, position: unknown) => Promise<unknown> }
    }

    function createMockModel(lineContent: string, wordAtPos?: { word: string; startColumn: number; endColumn: number } | null) {
      return {
        getLineContent: vi.fn().mockReturnValue(lineContent),
        getWordAtPosition: vi.fn().mockReturnValue(wordAtPos ?? null)
      }
    }

    it('returns null when not paused', async () => {
      const provider = getHoverProvider()
      mockDebugStore.isPaused = false

      const result = await provider.provideHover(
        createMockModel('const x = 1'),
        { lineNumber: 1, column: 7 }
      )

      expect(result).toBeNull()
    })

    it('returns null when no word at position', async () => {
      const provider = getHoverProvider()
      mockDebugStore.isPaused = true

      const model = createMockModel('const x = 1', null)
      const result = await provider.provideHover(model, { lineNumber: 1, column: 7 })

      expect(result).toBeNull()
    })

    it('evaluates simple variable and returns hover', async () => {
      const provider = getHoverProvider()
      mockDebugStore.isPaused = true
      mockDebugStore.evaluate.mockResolvedValue({ result: '42', type: 'number' })

      const model = createMockModel('const x = 1', {
        word: 'x',
        startColumn: 7,
        endColumn: 8
      })

      const result = await provider.provideHover(model, { lineNumber: 1, column: 7 }) as { contents: Array<{ value: string }> }

      expect(mockDebugStore.evaluate).toHaveBeenCalledWith('x', 'hover')
      expect(result).not.toBeNull()
      expect(result.contents[0].value).toContain('42')
      expect(result.contents[0].value).toContain('number')
    })

    it('returns null on evaluation failure', async () => {
      const provider = getHoverProvider()
      mockDebugStore.isPaused = true
      mockDebugStore.evaluate.mockRejectedValue(new Error('not found'))

      const model = createMockModel('const x = 1', {
        word: 'x',
        startColumn: 7,
        endColumn: 8
      })

      const result = await provider.provideHover(model, { lineNumber: 1, column: 7 })

      expect(result).toBeNull()
    })

    it('truncates long results', async () => {
      const provider = getHoverProvider()
      mockDebugStore.isPaused = true
      const longValue = 'x'.repeat(600)
      mockDebugStore.evaluate.mockResolvedValue({ result: longValue })

      const model = createMockModel('const x = 1', {
        word: 'x',
        startColumn: 7,
        endColumn: 8
      })

      const result = await provider.provideHover(model, { lineNumber: 1, column: 7 }) as { contents: Array<{ value: string }> }

      expect(result).not.toBeNull()
      expect(result.contents[0].value).toContain('...')
    })
  })

  describe('getExpressionAtPosition', () => {
    function createModel(lineContent: string, wordAtPos?: { word: string; startColumn: number; endColumn: number } | null) {
      return {
        getLineContent: vi.fn().mockReturnValue(lineContent),
        getWordAtPosition: vi.fn().mockReturnValue(wordAtPos ?? null)
      } as any
    }

    function createPosition(lineNumber: number, column: number) {
      return { lineNumber, column } as any
    }

    it('returns null when no word at position', () => {
      const model = createModel('   ', null)
      expect(getExpressionAtPosition(model, createPosition(1, 2))).toBeNull()
    })

    it('returns simple variable name', () => {
      const model = createModel('const x = 1', { word: 'x', startColumn: 7, endColumn: 8 })
      expect(getExpressionAtPosition(model, createPosition(1, 7))).toBe('x')
    })

    it('extracts dot chain expression', () => {
      const model = createModel('console.log(obj.prop.value)', {
        word: 'value',
        startColumn: 22,
        endColumn: 27
      })
      expect(getExpressionAtPosition(model, createPosition(1, 22))).toBe('obj.prop.value')
    })

    it('extracts bracket access', () => {
      const model = createModel('const y = arr[0]', {
        word: 'arr',
        startColumn: 11,
        endColumn: 14
      })
      expect(getExpressionAtPosition(model, createPosition(1, 11))).toBe('arr[0]')
    })
  })
})
