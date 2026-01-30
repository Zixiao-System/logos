/**
 * VS Code API Stub Implementation
 *
 * Provides a minimal implementation of the VS Code Extension API.
 * Extensions require('vscode') to get access to these APIs.
 *
 * This is a Phase 1 stub that defines the API surface and provides
 * minimal implementations. Full implementations will be added in Phase 2.
 *
 * Supported APIs:
 * - workspace (partial)
 * - commands
 * - window (partial)
 * - languages
 * - Uri, Range, Position
 * - extensions
 *
 * Unsupported (Phase 3+):
 * - webview
 * - debug
 * - testing
 * - scm
 *
 * TODO (Phase 2):
 * - Implement file system operations
 * - Implement language provider registration
 * - Implement command execution
 * - Implement event listeners
 * - Implement configuration watchers
 * - Add error handling and logging
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Represents a URI (file path or URI)
 */
export class Uri {
  readonly scheme: string
  readonly authority: string
  readonly path: string
  readonly query: string
  readonly fragment: string

  constructor(
    scheme: string = 'file',
    authority: string = '',
    path: string = '',
    query: string = '',
    fragment: string = ''
  ) {
    this.scheme = scheme
    this.authority = authority
    this.path = path
    this.query = query
    this.fragment = fragment
  }

  /**
   * Parse a URI string into a Uri object
   */
  static parse(value: string): Uri {
    // TODO (Phase 2): Implement proper URI parsing
    // For now, treat as file path
    return new Uri('file', '', value)
  }

  /**
   * Create a file URI from a path
   */
  static file(path: string): Uri {
    // TODO (Phase 2): Platform-specific path handling
    return new Uri('file', '', path)
  }

  toString(): string {
    // TODO (Phase 2): Implement proper URI serialization
    return `${this.scheme}://${this.authority}${this.path}`
  }
}

/**
 * Represents a position in a text document (line, character)
 */
export class Position {
  readonly line: number
  readonly character: number

  constructor(line: number, character: number) {
    this.line = line
    this.character = character
  }
}

/**
 * Represents a range in a text document
 */
export class Range {
  readonly start: Position
  readonly end: Position

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number)
  constructor(start: Position, end: Position)
  constructor(startOrLine: Position | number, endOrChar: Position | number, endLine?: number, endChar?: number) {
    if (startOrLine instanceof Position) {
      this.start = startOrLine
      this.end = endOrChar as Position
    } else {
      this.start = new Position(startOrLine as number, endOrChar as number)
      this.end = new Position(endLine || 0, endChar || 0)
    }
  }
}

/**
 * Represents a selection in a text document
 */
export class Selection extends Range {
  readonly anchor: Position
  readonly active: Position

  constructor(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number)
  constructor(anchor: Position, active: Position)
  constructor(
    anchorOrLine: Position | number,
    anchorCharOrActive: Position | number,
    activeLine?: number,
    activeChar?: number
  ) {
    if (anchorOrLine instanceof Position) {
      super(anchorOrLine, anchorCharOrActive as Position)
      this.anchor = anchorOrLine
      this.active = anchorCharOrActive as Position
    } else {
      super(anchorOrLine, anchorCharOrActive as number, activeLine || 0, activeChar || 0)
      this.anchor = new Position(anchorOrLine as number, anchorCharOrActive as number)
      this.active = new Position(activeLine || 0, activeChar || 0)
    }
  }
}

/**
 * Represents a text document
 */
export interface TextDocument {
  uri: Uri
  languageId: string
  version: number
  isDirty: boolean
  isClosed: boolean
  getText(range?: Range): string
  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined
  offsetAt(position: Position): number
  positionAt(offset: number): Position
  lineCount: number
  lineAt(line: number | Position): {
    lineNumber: number
    text: string
    range: Range
    rangeIncludingLineBreak: Range
    firstNonWhitespaceCharacterIndex: number
    isEmptyOrWhitespace: boolean
  }
}

/**
 * Represents a text editor
 */
export interface TextEditor {
  document: TextDocument
  selections: Selection[]
  visibleRanges: Range[]
  options: TextEditorOptions
  viewColumn: ViewColumn
  edit(callback: (editBuilder: TextEditorEdit) => void, options?: { undoStopBefore: boolean; undoStopAfter: boolean }): Promise<boolean>
  setDecorations(decorationType: TextEditorDecorationType, rangesOrOptions: Range[] | DecorationOptions[]): void
  revealRange(range: Range, revealType?: TextEditorRevealType): void
}

export interface TextEditorOptions {
  tabSize?: number
  indentSize?: number
  insertSpaces?: boolean
  trimAutoWhitespace?: boolean
}

export interface TextEditorEdit {
  replace(location: Position | Range | Selection, value: string): void
  insert(location: Position, value: string): void
  delete(range: Range | Selection): void
  setEndOfLine(endOfLine: EndOfLine): void
}

export interface TextEditorDecorationType {
  key: string
  dispose(): void
}

export interface DecorationOptions {
  range: Range
  hoverMessage?: string
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutOfRange = 2,
  AtTop = 3
}

export enum EndOfLine {
  LF = 0,
  CRLF = 1
}

/**
 * Event emitter
 */
export class EventEmitter<T> {
  private listeners: Array<(event: T) => void> = []

  onEvent(listener: (event: T) => void): { dispose(): void } {
    this.listeners.push(listener)
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener)
        if (index >= 0) {
          this.listeners.splice(index, 1)
        }
      }
    }
  }

  fire(event: T): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[EventEmitter] Error in listener:', error)
      }
    }
  }
}

/**
 * Disposable resource
 */
export interface Disposable {
  dispose(): void
}

// ============================================================================
// Language Provider Types
// ============================================================================

export type DocumentSelector = string | DocumentFilter | Array<string | DocumentFilter>

export interface DocumentFilter {
  language?: string
  scheme?: string
  pattern?: string
}

export interface CompletionItem {
  label: string
  kind?: CompletionItemKind
  detail?: string
  documentation?: string
  sortText?: string
  filterText?: string
  insertText?: string
  range?: Range
  commitCharacters?: string[]
  preselect?: boolean
  additionalTextEdits?: TextEdit[]
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  Reference = 16,
  Folder = 17,
  EnumMember = 18,
  Constant = 19,
  Struct = 20,
  Event = 21,
  Operator = 22,
  TypeParameter = 23
}

export interface CompletionContext {
  triggerKind: CompletionTriggerKind
  triggerCharacter?: string
}

export enum CompletionTriggerKind {
  Invoke = 0,
  TriggerCharacter = 1,
  TriggerForIncompleteCompletions = 2
}

export interface CompletionItemProvider {
  provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context?: CompletionContext): Promise<CompletionItem[]>
  resolveCompletionItem?(item: CompletionItem, token: CancellationToken): Promise<CompletionItem>
}

export interface Hover {
  contents: string | Array<string | { language: string; value: string }>
  range?: Range
}

export interface HoverProvider {
  provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | undefined>
}

export interface Location {
  uri: Uri
  range: Range
}

export type Definition = Location | Location[]

export interface DefinitionProvider {
  provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition | undefined>
}

export interface ReferenceContext {
  includeDeclaration: boolean
}

export interface ReferenceProvider {
  provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): Promise<Location[]>
}

export interface ImplementationProvider {
  provideImplementation(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition | undefined>
}

export interface TypeDefinitionProvider {
  provideTypeDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition | undefined>
}

export interface DeclarationProvider {
  provideDeclaration(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition | undefined>
}

export interface DocumentSymbol {
  name: string
  detail?: string
  kind: SymbolKind
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26
}

export interface DocumentSymbolProvider {
  provideDocumentSymbols(document: TextDocument, token: CancellationToken): Promise<DocumentSymbol[]>
}

export interface SignatureHelp {
  signatures: SignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export interface SignatureInformation {
  label: string
  documentation?: string
  parameters: ParameterInformation[]
}

export interface ParameterInformation {
  label: string
  documentation?: string
}

export interface SignatureHelpContext {
  triggerKind: SignatureHelpTriggerKind
  triggerCharacter?: string
  isRetrigger: boolean
  activeSignatureHelp?: SignatureHelp
}

export enum SignatureHelpTriggerKind {
  Invoke = 0,
  TriggerCharacter = 1,
  ContentChange = 2
}

export interface SignatureHelpProvider {
  provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken, context: SignatureHelpContext): Promise<SignatureHelp | undefined>
}

export interface TextEdit {
  range: Range
  newText: string
}

export interface RenameProvider {
  provideRenameEdits(document: TextDocument, position: Position, newName: string, token: CancellationToken): Promise<WorkspaceEdit | undefined>
  prepareRename?(document: TextDocument, position: Position, token: CancellationToken): Promise<Range | { placeholder: string; range: Range } | undefined>
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] }
  documentChanges?: TextDocumentEdit[]
}

export interface TextDocumentEdit {
  textDocument: { uri: Uri; version: number }
  edits: TextEdit[]
}

export interface CodeAction {
  title: string
  command?: Command
  kind?: CodeActionKind
  diagnostics?: Diagnostic[]
  isPreferred?: boolean
  disabled?: { reason: string }
  edit?: WorkspaceEdit
}

export enum CodeActionKind {
  Empty = '',
  QuickFix = 'quickfix',
  Refactor = 'refactor',
  RefactorExtract = 'refactor.extract',
  RefactorInline = 'refactor.inline',
  RefactorRewrite = 'refactor.rewrite',
  Source = 'source',
  SourceOrganizeImports = 'source.organizeImports',
  SourceFixAll = 'source.fixAll'
}

export interface CodeActionProvider {
  provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Promise<(CodeAction | Command)[]>
  resolveCodeAction?(codeAction: CodeAction, token: CancellationToken): Promise<CodeAction>
}

export interface CodeActionContext {
  diagnostics: Diagnostic[]
  only?: CodeActionKind[]
  triggerKind?: CodeActionTriggerKind
}

export enum CodeActionTriggerKind {
  Invoke = 1,
  Automatic = 2
}

export interface DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[]>
}

export interface DocumentRangeFormattingEditProvider {
  provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]>
}

export interface OnTypeFormattingEditProvider {
  provideOnTypeFormattingEdits(
    document: TextDocument,
    position: Position,
    ch: string,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]>
}

export interface FormattingOptions {
  tabSize: number
  insertSpaces: boolean
  [key: string]: boolean | number | string
}

export interface Diagnostic {
  range: Range
  message: string
  severity?: DiagnosticSeverity
  code?: string | number | { value: string | number; target: Uri }
  source?: string
  tags?: DiagnosticTag[]
  relatedInformation?: DiagnosticRelatedInformation[]
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2
}

export interface DiagnosticRelatedInformation {
  location: Location
  message: string
}

export interface CancellationToken {
  isCancellationRequested: boolean
  onCancellationRequested: EventEmitter<void>
}

export interface Command {
  title: string
  command: string
  arguments?: unknown[]
  tooltip?: string
}

// ============================================================================
// Workspace API
// ============================================================================

export interface WorkspaceFolder {
  uri: Uri
  name: string
  index: number
}

export interface FileSystemWatcher {
  onDidCreate: EventEmitter<Uri>
  onDidChange: EventEmitter<Uri>
  onDidDelete: EventEmitter<Uri>
  ignoreCreateEvents: boolean
  ignoreChangeEvents: boolean
  ignoreDeleteEvents: boolean
  dispose(): void
}

export namespace workspace {
  export let rootPath: string | undefined
  export let workspaceFolders: WorkspaceFolder[] | undefined
  export let name: string | undefined

  // TODO (Phase 2): Implement file system operations
  // export namespace fs {
  //   export function stat(uri: Uri): Promise<FileStat>
  //   export function readDirectory(uri: Uri): Promise<[string, FileType][]>
  //   export function createDirectory(uri: Uri): Promise<void>
  //   export function readFile(uri: Uri): Promise<Uint8Array>
  //   export function writeFile(uri: Uri, content: Uint8Array): Promise<void>
  //   export function delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>
  //   export function rename(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): Promise<void>
  //   export function copy(source: Uri, destination: Uri, options?: { overwrite?: boolean }): Promise<void>
  // }

  // TODO (Phase 2): Implement workspace file operations
  // export function openTextDocument(uri: Uri): Promise<TextDocument>
  // export function openTextDocument(fileName: string): Promise<TextDocument>
  // export function openTextDocument(options: { language?: string; content?: string }): Promise<TextDocument>
  // export function saveAll(includeUntitled?: boolean): Promise<boolean>
  // export function applyEdit(edit: WorkspaceEdit): Promise<boolean>
  // export function findFiles(include: GlobPattern, exclude?: GlobPattern, maxResults?: number): Promise<Uri[]>
  // export function createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher

  // Events (stub definitions)
  export const onDidOpenTextDocument = new EventEmitter<TextDocument>()
  export const onDidCloseTextDocument = new EventEmitter<TextDocument>()
  export const onDidChangeTextDocument = new EventEmitter<TextDocumentChangeEvent>()
  export const onDidSaveTextDocument = new EventEmitter<TextDocument>()
  export const onDidChangeWorkspaceFolders = new EventEmitter<WorkspaceFoldersChangeEvent>()
  export const onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>()
  export const onDidCreateFiles = new EventEmitter<FileCreateEvent>()
  export const onDidDeleteFiles = new EventEmitter<FileDeleteEvent>()
  export const onDidRenameFiles = new EventEmitter<FileRenameEvent>()

  // TODO (Phase 2): Implement configuration
  // export function getConfiguration(section?: string, scope?: ConfigurationScope): WorkspaceConfiguration
}

export interface TextDocumentChangeEvent {
  document: TextDocument
  contentChanges: TextDocumentContentChangeEvent[]
}

export interface TextDocumentContentChangeEvent {
  range?: Range
  rangeOffset?: number
  rangeLength?: number
  text: string
}

export interface WorkspaceFoldersChangeEvent {
  added: WorkspaceFolder[]
  removed: WorkspaceFolder[]
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string, scope?: ConfigurationScope): boolean
}

export type ConfigurationScope = Uri | WorkspaceFolder | { workspaceFolder: WorkspaceFolder }

export interface FileCreateEvent {
  files: Uri[]
}

export interface FileDeleteEvent {
  files: Uri[]
}

export interface FileRenameEvent {
  files: Array<{ oldUri: Uri; newUri: Uri }>
}

// ============================================================================
// Commands API
// ============================================================================

export namespace commands {
  // TODO (Phase 2): Implement command registry
  // export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable
  // export function executeCommand<T = any>(command: string, ...rest: any[]): Promise<T | undefined>
  // export function getCommands(filterInternal?: boolean): Promise<string[]>

  // Stub: Fire on error, full implementation in Phase 2
  export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    console.warn(`[VS Code API Stub] commands.registerCommand('${command}') - Not fully implemented in Phase 1`)
    void callback
    void thisArg
    return { dispose: () => {} }
  }

  export async function executeCommand<T = any>(command: string, ...rest: any[]): Promise<T | undefined> {
    console.warn(`[VS Code API Stub] commands.executeCommand('${command}') - Not fully implemented in Phase 1`)
    void rest
    return undefined
  }
}

// ============================================================================
// Window API
// ============================================================================

export namespace window {
  // TODO (Phase 2): Implement window operations
  // export let activeTextEditor: TextEditor | undefined
  // export let visibleTextEditors: TextEditor[]
  // export let activeColorTheme: ColorTheme
  // export let activeNotebookEditor: NotebookEditor | undefined

  // export function showTextDocument(document: TextDocument, column?: ViewColumn, preserveFocus?: boolean): Promise<TextEditor>
  // export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>
  // export function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>
  // export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>
  // export function showInputBox(options?: InputBoxOptions): Promise<string | undefined>
  // export function showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined>
  // export function showOpenDialog(options?: OpenDialogOptions): Promise<Uri[] | undefined>
  // export function showSaveDialog(options?: SaveDialogOptions): Promise<Uri | undefined>

  export const onDidChangeActiveTextEditor = new EventEmitter<TextEditor | undefined>()
  export const onDidChangeVisibleTextEditors = new EventEmitter<TextEditor[]>()
  export const onDidChangeActiveColorTheme = new EventEmitter<ColorTheme>()
  export const onDidChangeTextEditorSelection = new EventEmitter<TextEditorSelectionChangeEvent>()
  export const onDidChangeTextEditorVisibleRanges = new EventEmitter<TextEditorVisibleRangesChangeEvent>()
  export const onDidChangeWindowState = new EventEmitter<WindowState>()
}

export interface ColorTheme {
  kind: ColorThemeKind
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4
}

export interface TextEditorSelectionChangeEvent {
  textEditor: TextEditor
  selections: Selection[]
  kind?: TextEditorSelectionChangeKind
}

export enum TextEditorSelectionChangeKind {
  Keyboard = 1,
  Mouse = 2,
  Command = 3
}

export interface TextEditorVisibleRangesChangeEvent {
  textEditor: TextEditor
  visibleRanges: Range[]
}

export interface WindowState {
  focused: boolean
}

// ============================================================================
// Languages API
// ============================================================================

export namespace languages {
  // TODO (Phase 2): Implement language provider registration
  // export function registerCompletionItemProvider(selector: DocumentSelector, provider: CompletionItemProvider, ...triggerCharacters: string[]): Disposable
  // export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable
  // export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable
  // ... more providers

  export function registerCompletionItemProvider(
    selector: DocumentSelector,
    provider: CompletionItemProvider,
    ...triggerCharacters: string[]
  ): Disposable {
    console.warn('[VS Code API Stub] languages.registerCompletionItemProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    void triggerCharacters
    return { dispose: () => {} }
  }

  export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerHoverProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerDefinitionProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerReferenceProvider(selector: DocumentSelector, provider: ReferenceProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerReferenceProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerImplementationProvider(selector: DocumentSelector, provider: ImplementationProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerImplementationProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerTypeDefinitionProvider(selector: DocumentSelector, provider: TypeDefinitionProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerTypeDefinitionProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerDeclarationProvider(selector: DocumentSelector, provider: DeclarationProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerDeclarationProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerDocumentSymbolProvider(selector: DocumentSelector, provider: DocumentSymbolProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerDocumentSymbolProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerSignatureHelpProvider(
    selector: DocumentSelector,
    provider: SignatureHelpProvider,
    ...triggerCharacters: string[]
  ): Disposable {
    console.warn('[VS Code API Stub] languages.registerSignatureHelpProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    void triggerCharacters
    return { dispose: () => {} }
  }

  export function registerRenameProvider(selector: DocumentSelector, provider: RenameProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerRenameProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerDocumentFormattingEditProvider(selector: DocumentSelector, provider: DocumentFormattingEditProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerDocumentFormattingEditProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider): Disposable {
    console.warn('[VS Code API Stub] languages.registerDocumentRangeFormattingEditProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    return { dispose: () => {} }
  }

  export function registerOnTypeFormattingEditProvider(
    selector: DocumentSelector,
    provider: OnTypeFormattingEditProvider,
    ...firstTriggerCharacter: string[]
  ): Disposable {
    console.warn('[VS Code API Stub] languages.registerOnTypeFormattingEditProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    void firstTriggerCharacter
    return { dispose: () => {} }
  }

  export function registerCodeActionsProvider(selector: DocumentSelector, provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): Disposable {
    console.warn('[VS Code API Stub] languages.registerCodeActionsProvider - Not fully implemented in Phase 1')
    void selector
    void provider
    void metadata
    return { dispose: () => {} }
  }

  // TODO (Phase 2): Add more language providers
}

export interface CodeActionProviderMetadata {
  providedCodeActionKinds?: CodeActionKind[]
  documentation?: Array<{ kind: CodeActionKind; command: Command }>
}

// ============================================================================
// Extensions API
// ============================================================================

export interface Extension<T = any> {
  id: string
  extensionPath: string
  packageJSON: any
  extensionKind: ExtensionKind
  isActive: boolean
  exports?: T
  activate(): Promise<T>
}

export enum ExtensionKind {
  UI = 1,
  Workspace = 2,
  Web = 3
}

export interface ExtensionContext {
  subscriptions: Disposable[]
  workspaceState: Memento
  globalState: Memento
  extensionPath: string
  extensionUri: Uri
  storagePath?: string
  storageUri?: Uri
  globalStoragePath: string
  globalStorageUri: Uri
  logPath: string
  logUri: Uri
  extensionMode: ExtensionMode
  extension: Extension
  asAbsolutePath(relativePath: string): string
  secrets: SecretStorage
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3
}

export interface Memento {
  get<T>(key: string, defaultValue?: T): T | undefined
  update(key: string, value: any): Promise<void>
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>
  store(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  onDidChange: EventEmitter<SecretStorageChangeEvent>
}

export interface SecretStorageChangeEvent {
  key: string
}

export namespace extensions {
  // TODO (Phase 2): Implement extension discovery
  // export let all: Extension[]
  // export function getExtension(extensionId: string): Extension | undefined
  // export let onDidChange: EventEmitter<void>

  export const all: Extension[] = []
  export const onDidChange = new EventEmitter<void>()

  export function getExtension(extensionId: string): Extension | undefined {
    console.warn(`[VS Code API Stub] extensions.getExtension('${extensionId}') - Not fully implemented in Phase 1`)
    return undefined
  }
}

// ============================================================================
// Export all as module
// ============================================================================

export const vscodeModule = {
  Uri,
  Position,
  Range,
  Selection,
  EventEmitter,
  workspace,
  commands,
  window,
  languages,
  extensions
}
