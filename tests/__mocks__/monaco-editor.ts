/**
 * Mock for monaco-editor in tests
 * Provides minimal stubs to allow source files that import monaco-editor to load.
 */

export const languages = {
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  register: () => {},
  setMonarchTokensProvider: () => {},
  setLanguageConfiguration: () => {}
}

export const editor = {
  ContentWidgetPositionPreference: {
    EXACT: 0,
    ABOVE: 1,
    BELOW: 2
  },
  MouseTargetType: {
    UNKNOWN: 0,
    TEXTAREA: 1,
    GUTTER_GLYPH_MARGIN: 2,
    GUTTER_LINE_NUMBERS: 3
  },
  TrackedRangeStickiness: {
    AlwaysGrowsWhenTypingAtEdges: 0,
    NeverGrowsWhenTypingAtEdges: 1
  },
  createModel: () => ({}),
  create: () => ({})
}

export class Range {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number
  ) {}
}

export class Uri {
  static file(path: string) { return { scheme: 'file', fsPath: path, toString: () => path } }
  static parse(value: string) { return { scheme: 'file', fsPath: value, toString: () => value } }
}

export const KeyMod = { Shift: 1, CtrlCmd: 2, Alt: 4 }
export const KeyCode = { F5: 0, F6: 1, F9: 2, F10: 3, F11: 4 }

export default {
  languages,
  editor,
  Range,
  Uri,
  KeyMod,
  KeyCode
}
