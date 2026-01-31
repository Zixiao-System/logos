/**
 * VS Code API Stub Implementation
 *
 * Provides a minimal implementation of the VS Code Extension API.
 * Extensions require('vscode') to get access to these APIs.
 */

import { promises as fsPromises } from 'fs'
import path from 'path'

const minimatch = require('minimatch') as (value: string, pattern: string, options?: { dot?: boolean }) => boolean
type Thenable<T> = PromiseLike<T>

type MainBridge = {
  request: (type: string, payload?: unknown) => Promise<unknown>
  notify: (type: string, payload?: unknown) => void
}

type CommandActivationHandler = (command: string) => Promise<void> | void

let mainBridge: MainBridge | null = null
let commandActivationHandler: CommandActivationHandler | null = null

export function __internalSetMainBridge(bridge: MainBridge): void {
  mainBridge = bridge
}

export function __internalSetCommandActivationHandler(handler: CommandActivationHandler): void {
  commandActivationHandler = handler
}

function requestMain<T>(type: string, payload?: unknown): Promise<T> {
  if (!mainBridge) {
    return Promise.reject(new Error('Main bridge not initialized'))
  }
  return mainBridge.request(type, payload) as Promise<T>
}

function notifyMain(type: string, payload?: unknown): void {
  if (!mainBridge) {
    return
  }
  mainBridge.notify(type, payload)
}

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
    if (value.startsWith('file://')) {
      const decoded = decodeURIComponent(value.replace(/^file:\/\//, ''))
      return new Uri('file', '', decoded)
    }
    if (value.includes('://')) {
      const [scheme, rest] = value.split('://')
      return new Uri(scheme, '', rest)
    }
    return new Uri('file', '', value)
  }

  /**
   * Create a file URI from a path
   */
  static file(path: string): Uri {
    // TODO (Phase 2): Platform-specific path handling
    return new Uri('file', '', path)
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const basePath = base.path.replace(/\/$/, '')
    const joined = [basePath, ...pathSegments].join('/')
    return new Uri(base.scheme, base.authority, joined)
  }

  get fsPath(): string {
    return this.path
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
  readonly event: (listener: (event: T) => void) => { dispose(): void }

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

  constructor() {
    this.event = (listener: (event: T) => void) => this.onEvent(listener)
  }

  dispose(): void {
    this.listeners.length = 0
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
export class Disposable {
  private readonly disposer: () => void

  constructor(disposer: () => void) {
    this.disposer = disposer
  }

  dispose(): void {
    this.disposer()
  }

  static from(...disposables: Array<{ dispose: () => void }>): Disposable {
    return new Disposable(() => {
      for (const disposable of disposables) {
        disposable.dispose()
      }
    })
  }
}

// ============================================================================
// Internal registries and helpers
// ============================================================================

type ProviderEntry<T> = {
  selector: DocumentSelector
  provider: T
  triggerCharacters?: string[]
  metadata?: CodeActionProviderMetadata
}

type InternalDocument = {
  uri: Uri
  languageId: string
  version: number
  content: string
  isDirty: boolean
  isClosed: boolean
  lineOffsets?: number[]
  textDocument?: TextDocument
}

const documents = new Map<string, InternalDocument>()
let activeTextEditorInternal: TextEditor | undefined

const commandRegistry = new Map<string, { callback: (...args: any[]) => any; thisArg?: any }>()

type ExtensionRegistryEntry = {
  id: string
  extensionPath: string
  manifest: Record<string, unknown>
  isActive: boolean
  exports?: unknown
}

const extensionRegistry = new Map<string, ExtensionRegistryEntry>()
const extensionsList: Extension[] = []

function refreshExtensionsList(): void {
  extensionsList.length = 0
  for (const entry of extensionRegistry.values()) {
    extensionsList.push({
      id: entry.id,
      extensionPath: entry.extensionPath,
      packageJSON: entry.manifest,
      extensionKind: 1 as ExtensionKind,
      isActive: entry.isActive,
      exports: entry.exports,
      activate: async () => entry.exports as any
    })
  }
}

const completionProviders: ProviderEntry<CompletionItemProvider>[] = []
const hoverProviders: ProviderEntry<HoverProvider>[] = []
const definitionProviders: ProviderEntry<DefinitionProvider>[] = []
const referenceProviders: ProviderEntry<ReferenceProvider>[] = []
const implementationProviders: ProviderEntry<ImplementationProvider>[] = []
const typeDefinitionProviders: ProviderEntry<TypeDefinitionProvider>[] = []
const declarationProviders: ProviderEntry<DeclarationProvider>[] = []
const documentSymbolProviders: ProviderEntry<DocumentSymbolProvider>[] = []
const signatureHelpProviders: ProviderEntry<SignatureHelpProvider>[] = []
const renameProviders: ProviderEntry<RenameProvider>[] = []
const formattingProviders: ProviderEntry<DocumentFormattingEditProvider>[] = []
const rangeFormattingProviders: ProviderEntry<DocumentRangeFormattingEditProvider>[] = []
const onTypeFormattingProviders: ProviderEntry<OnTypeFormattingEditProvider>[] = []
const codeActionProviders: ProviderEntry<CodeActionProvider>[] = []
const codeLensProviders: ProviderEntry<CodeLensProvider>[] = []
const documentLinkProviders: ProviderEntry<DocumentLinkProvider>[] = []
const callHierarchyProviders: ProviderEntry<CallHierarchyProvider>[] = []
const typeHierarchyProviders: ProviderEntry<TypeHierarchyProvider>[] = []
const workspaceSymbolProviders: ProviderEntry<WorkspaceSymbolProvider>[] = []
const inlayHintProviders: ProviderEntry<InlayHintsProvider>[] = []

type WebviewProviderEntry = {
  viewId: string
  provider: WebviewViewProvider
  options?: { retainContextWhenHidden?: boolean }
}

const webviewProviders = new Map<string, WebviewProviderEntry>()
const webviewsByHandle = new Map<string, WebviewImpl>()
const webviewHandleByViewId = new Map<string, string>()
const webviewResolveCache = new Map<string, { handle: string; html: string; options: WebviewOptions }>()
const webviewResolveInFlight = new Map<string, Promise<{ handle: string; html: string; options: WebviewOptions } | null>>()
let webviewHandleCounter = 0

const onDidOpenTextDocumentEmitter = new EventEmitter<TextDocument>()
const onDidCloseTextDocumentEmitter = new EventEmitter<TextDocument>()
const onDidChangeTextDocumentEmitter = new EventEmitter<TextDocumentChangeEvent>()
const onDidSaveTextDocumentEmitter = new EventEmitter<TextDocument>()
const onDidChangeWorkspaceFoldersEmitter = new EventEmitter<WorkspaceFoldersChangeEvent>()
const onDidChangeConfigurationEmitter = new EventEmitter<ConfigurationChangeEvent>()
const onDidCreateFilesEmitter = new EventEmitter<FileCreateEvent>()
const onDidDeleteFilesEmitter = new EventEmitter<FileDeleteEvent>()
const onDidRenameFilesEmitter = new EventEmitter<FileRenameEvent>()

const onDidChangeActiveTextEditorEmitter = new EventEmitter<TextEditor | undefined>()
const onDidChangeVisibleTextEditorsEmitter = new EventEmitter<TextEditor[]>()
const onDidChangeActiveColorThemeEmitter = new EventEmitter<ColorTheme>()
const onDidChangeTextEditorSelectionEmitter = new EventEmitter<TextEditorSelectionChangeEvent>()
const onDidChangeTextEditorVisibleRangesEmitter = new EventEmitter<TextEditorVisibleRangesChangeEvent>()
const onDidChangeWindowStateEmitter = new EventEmitter<WindowState>()
const onDidChangeExtensionsEmitter = new EventEmitter<void>()
const onDidChangeTerminalShellIntegrationEmitter = new EventEmitter<void>()
const onDidChangeTabGroupsEmitter = new EventEmitter<void>()

function normalizeUriKey(input: Uri | string): string {
  if (typeof input === 'string') {
    return Uri.file(input).toString()
  }
  return input.toString()
}


function ensureLineOffsets(doc: InternalDocument): number[] {
  if (doc.lineOffsets) {
    return doc.lineOffsets
  }
  const offsets = [0]
  for (let i = 0; i < doc.content.length; i += 1) {
    if (doc.content.charCodeAt(i) === 10) {
      offsets.push(i + 1)
    }
  }
  doc.lineOffsets = offsets
  return offsets
}

function positionAtOffset(doc: InternalDocument, offset: number): Position {
  const content = doc.content
  const clamped = Math.min(Math.max(offset, 0), content.length)
  const offsets = ensureLineOffsets(doc)
  let low = 0
  let high = offsets.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineOffset = offsets[mid]
    if (lineOffset === clamped) {
      return new Position(mid, 0)
    }
    if (lineOffset < clamped) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  const line = Math.max(0, low - 1)
  return new Position(line, clamped - offsets[line])
}

function offsetAtPosition(doc: InternalDocument, position: Position): number {
  const offsets = ensureLineOffsets(doc)
  const line = Math.min(Math.max(position.line, 0), offsets.length - 1)
  const lineOffset = offsets[line]
  return Math.min(lineOffset + Math.max(position.character, 0), doc.content.length)
}

function toExtensionPosition(position: Position): { line: number; character: number } {
  return { line: position.line, character: position.character }
}

function toExtensionRange(range: Range): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return {
    start: toExtensionPosition(range.start),
    end: toExtensionPosition(range.end)
  }
}

function createCancellationToken(): CancellationToken {
  const emitter = new EventEmitter<void>()
  return { isCancellationRequested: false, onCancellationRequested: emitter.event }
}

function createTextDocument(doc: InternalDocument): TextDocument {
  if (doc.textDocument) {
    return doc.textDocument
  }

  const textDocument: TextDocument = {
    uri: doc.uri,
    languageId: doc.languageId,
    version: doc.version,
    isDirty: doc.isDirty,
    isClosed: doc.isClosed,
    getText: (range?: Range) => {
      if (!range) {
        return doc.content
      }
      const start = offsetAtPosition(doc, range.start)
      const end = offsetAtPosition(doc, range.end)
      return doc.content.slice(start, end)
    },
    getWordRangeAtPosition: (position: Position, regex?: RegExp) => {
      const offsets = ensureLineOffsets(doc)
      const line = Math.min(Math.max(position.line, 0), offsets.length - 1)
      const lineStart = offsets[line]
      const lineEnd = line + 1 < offsets.length ? offsets[line + 1] - 1 : doc.content.length
      const lineText = doc.content.slice(lineStart, lineEnd)
      const targetIndex = Math.min(Math.max(position.character, 0), lineText.length)
      const pattern = regex ?? /[A-Za-z0-9_]+/g
      const matches = lineText.matchAll(pattern)
      for (const match of matches) {
        if (typeof match.index !== 'number') {
          continue
        }
        const start = match.index
        const end = match.index + match[0].length
        if (targetIndex >= start && targetIndex <= end) {
          return new Range(line, start, line, end)
        }
      }
      return undefined
    },
    offsetAt: (position: Position) => offsetAtPosition(doc, position),
    positionAt: (offset: number) => positionAtOffset(doc, offset),
    get lineCount() {
      return ensureLineOffsets(doc).length
    },
    lineAt: (lineOrPosition: number | Position) => {
      const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line
      const offsets = ensureLineOffsets(doc)
      const safeLine = Math.min(Math.max(line, 0), offsets.length - 1)
      const lineStart = offsets[safeLine]
      const lineEnd = safeLine + 1 < offsets.length ? offsets[safeLine + 1] - 1 : doc.content.length
      const text = doc.content.slice(lineStart, lineEnd)
      const range = new Range(safeLine, 0, safeLine, text.length)
      const rangeIncludingLineBreak = new Range(safeLine, 0, safeLine, lineEnd - lineStart + 1)
      const firstNonWhitespace = text.search(/\S/)
      return {
        lineNumber: safeLine,
        text,
        range,
        rangeIncludingLineBreak,
        firstNonWhitespaceCharacterIndex: firstNonWhitespace === -1 ? text.length : firstNonWhitespace,
        isEmptyOrWhitespace: text.trim().length === 0
      }
    }
  }

  doc.textDocument = textDocument
  return textDocument
}

function updateTextDocument(doc: InternalDocument, content: string, version: number): TextDocument {
  doc.content = content
  doc.version = version
  doc.isDirty = true
  doc.lineOffsets = undefined
  const textDocument = createTextDocument(doc)
  textDocument.isDirty = doc.isDirty
  textDocument.version = doc.version
  return textDocument
}

function createEditorForDocument(document: TextDocument, selection?: Selection): TextEditor {
  const editorSelection = selection ?? new Selection(0, 0, 0, 0)
  return {
    document,
    selections: [editorSelection],
    visibleRanges: [new Range(0, 0, document.lineCount, 0)],
    options: {},
    viewColumn: ViewColumn.One,
    edit: async () => false,
    setDecorations: () => {},
    revealRange: () => {}
  }
}

function matchDocumentSelector(selector: DocumentSelector, document: TextDocument): boolean {
  if (Array.isArray(selector)) {
    return selector.some(entry => matchDocumentSelector(entry, document))
  }
  if (typeof selector === 'string') {
    return selector === document.languageId
  }
  const languageMatch = !selector.language || selector.language === document.languageId
  const schemeMatch = !selector.scheme || selector.scheme === document.uri.scheme
  if (!languageMatch || !schemeMatch) {
    return false
  }
  if (!selector.pattern) {
    return true
  }
  const normalizedPath = document.uri.path.replace(/\\/g, '/')
  return minimatch(normalizedPath, selector.pattern, { dot: true })
}

function registerProvider<T>(list: ProviderEntry<T>[], entry: ProviderEntry<T>): Disposable {
  list.push(entry)
  return new Disposable(() => {
    const index = list.indexOf(entry)
    if (index >= 0) {
      list.splice(index, 1)
    }
  })
}

function getMatchingProviders<T>(list: ProviderEntry<T>[], document: TextDocument): ProviderEntry<T>[] {
  return list.filter(entry => matchDocumentSelector(entry.selector, document))
}

function normalizeQuickPickItems(items: Array<string | QuickPickItem>): QuickPickItem[] {
  return items.map(item => {
    if (typeof item === 'string') {
      return { label: item }
    }
    return item
  })
}

async function requestQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<number | number[] | undefined> {
  const payload = {
    items: items.map(item => ({ label: item.label, description: item.description })),
    placeHolder: options?.placeHolder,
    canPickMany: options?.canPickMany
  }
  try {
    return await requestMain<number | number[] | undefined>('uiRequest', { uiType: 'quickPick', payload })
  } catch {
    return undefined
  }
}

async function requestInputBox(options?: InputBoxOptions): Promise<string | undefined> {
  const payload = {
    prompt: options?.prompt,
    placeHolder: options?.placeHolder,
    value: options?.value
  }
  try {
    return await requestMain<string | undefined>('uiRequest', { uiType: 'inputBox', payload })
  } catch {
    return undefined
  }
}

async function showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined> {
  if (items.length === 0) {
    notifyMain('window:message', { level, message })
    return undefined
  }
  const pickItems = items.map(label => ({ label }))
  const result = await requestQuickPick(pickItems, { placeHolder: message })
  if (typeof result === 'number' && result >= 0 && result < items.length) {
    return items[result]
  }
  return undefined
}

function toWebviewUri(resource: Uri): Uri {
  const normalized = resource.path.replace(/\\/g, '/')
  return new Uri('logos-extension', '', `local-file${encodeURI(normalized)}`)
}

class WebviewImpl implements Webview {
  readonly handle: string
  readonly viewId: string
  private _html = ''
  options: WebviewOptions = {}
  private readonly messageEmitter = new EventEmitter<any>()
  onDidReceiveMessage = this.messageEmitter.event

  constructor(handle: string, viewId: string) {
    this.handle = handle
    this.viewId = viewId
  }

  get html(): string {
    return this._html
  }

  set html(value: string) {
    this._html = value ?? ''
    notifyMain('webviewHtml', { handle: this.handle, html: this._html })
    webviewResolveCache.set(this.viewId, { handle: this.handle, html: this._html, options: this.options })
  }

  postMessage(message: any): Promise<boolean> {
    notifyMain('webviewMessage', { handle: this.handle, message })
    return Promise.resolve(true)
  }

  fireMessage(message: any): void {
    this.messageEmitter.fire(message)
  }

  asWebviewUri(resource: Uri): Uri {
    return toWebviewUri(resource)
  }

  get cspSource(): string {
    return 'logos-extension:'
  }
}

function createWebview(handle: string, viewId: string): WebviewImpl {
  const webview = new WebviewImpl(handle, viewId)
  webviewsByHandle.set(handle, webview)
  return webview
}

function toExtensionDocumentation(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'value' in value && typeof (value as { value: unknown }).value === 'string') {
    return (value as { value: string }).value
  }
  return undefined
}

async function ensureDocumentForRequest(uri: string, languageHint?: string): Promise<TextDocument | undefined> {
  const key = normalizeUriKey(uri)
  const existing = documents.get(key)
  if (existing) {
    return createTextDocument(existing)
  }
  try {
    const content = await fsPromises.readFile(uri, 'utf-8')
    return __internalOpenDocument({ uri, languageId: languageHint ?? 'plaintext', content, version: 1 })
  } catch {
    return undefined
  }
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

export class CompletionItem {
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

  constructor(label: string, kind?: CompletionItemKind) {
    this.label = label
    this.kind = kind
  }
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

export class Location {
  uri: Uri
  range: Range

  constructor(uri: Uri, range: Range) {
    this.uri = uri
    this.range = range
  }
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

export enum InlayHintKind {
  Type = 1,
  Parameter = 2
}

export class InlayHintLabelPart {
  value: string
  tooltip?: string
  location?: Location
  command?: Command

  constructor(value: string) {
    this.value = value
  }
}

export class InlayHint {
  position: Position
  label: string | InlayHintLabelPart[]
  kind?: InlayHintKind
  tooltip?: string
  paddingLeft?: boolean
  paddingRight?: boolean

  constructor(position: Position, label: string | InlayHintLabelPart[], kind?: InlayHintKind) {
    this.position = position
    this.label = label
    this.kind = kind
  }
}

export interface InlayHintsProvider {
  provideInlayHints(document: TextDocument, range: Range, token: CancellationToken): Promise<InlayHint[]>
  resolveInlayHint?(hint: InlayHint, token: CancellationToken): Promise<InlayHint>
}

export class SymbolInformation {
  name: string
  kind: SymbolKind
  location: Location
  containerName?: string

  constructor(name: string, kind: SymbolKind, location: Location, containerName?: string) {
    this.name = name
    this.kind = kind
    this.location = location
    this.containerName = containerName
  }
}

export class WorkspaceSymbol extends SymbolInformation {
  constructor(name: string, kind: SymbolKind, location: Location, containerName?: string) {
    super(name, kind, location, containerName)
  }
}

export interface WorkspaceSymbolProvider {
  provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<SymbolInformation[] | WorkspaceSymbol[]>
  resolveWorkspaceSymbol?(symbol: SymbolInformation | WorkspaceSymbol, token: CancellationToken): Promise<SymbolInformation | WorkspaceSymbol>
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

export class WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] }
  documentChanges?: TextDocumentEdit[]

  constructor() {
    this.changes = {}
  }

  private ensureUri(uri: Uri): TextEdit[] {
    const key = uri.toString()
    if (!this.changes) {
      this.changes = {}
    }
    const existing = this.changes[key] ?? []
    this.changes[key] = existing
    return existing
  }

  replace(uri: Uri, range: Range, newText: string): void {
    this.ensureUri(uri).push({ range, newText })
  }

  insert(uri: Uri, position: Position, newText: string): void {
    this.ensureUri(uri).push({ range: new Range(position, position), newText })
  }

  delete(uri: Uri, range: Range): void {
    this.ensureUri(uri).push({ range, newText: '' })
  }
}

export interface TextDocumentEdit {
  textDocument: { uri: Uri; version: number }
  edits: TextEdit[]
}

export class CodeAction {
  title: string
  command?: Command
  kind?: CodeActionKind
  diagnostics?: Diagnostic[]
  isPreferred?: boolean
  disabled?: { reason: string }
  edit?: WorkspaceEdit

  constructor(title: string, kind?: CodeActionKind) {
    this.title = title
    this.kind = kind
  }
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

export class CodeLens {
  range: Range
  command?: Command
  isResolved?: boolean

  constructor(range: Range, command?: Command) {
    this.range = range
    this.command = command
  }
}

export interface CodeLensProvider {
  provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]>
  resolveCodeLens?(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens>
}

export class DocumentLink {
  range: Range
  target?: Uri
  tooltip?: string

  constructor(range: Range, target?: Uri) {
    this.range = range
    this.target = target
  }
}

export interface DocumentLinkProvider {
  provideDocumentLinks(document: TextDocument, token: CancellationToken): Promise<DocumentLink[]>
  resolveDocumentLink?(link: DocumentLink, token: CancellationToken): Promise<DocumentLink>
}

export class CallHierarchyItem {
  kind: SymbolKind
  name: string
  detail?: string
  uri: Uri
  range: Range
  selectionRange: Range

  constructor(kind: SymbolKind, name: string, detail: string | undefined, uri: Uri, range: Range, selectionRange: Range) {
    this.kind = kind
    this.name = name
    this.detail = detail
    this.uri = uri
    this.range = range
    this.selectionRange = selectionRange
  }
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem
  fromRanges: Range[]
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem
  fromRanges: Range[]
}

export interface CallHierarchyProvider {
  prepareCallHierarchy(document: TextDocument, position: Position, token: CancellationToken): Promise<CallHierarchyItem[] | CallHierarchyItem | undefined>
  provideCallHierarchyIncomingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyIncomingCall[]>
  provideCallHierarchyOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyOutgoingCall[]>
}

export class TypeHierarchyItem {
  kind: SymbolKind
  name: string
  detail?: string
  uri: Uri
  range: Range
  selectionRange: Range

  constructor(kind: SymbolKind, name: string, detail: string | undefined, uri: Uri, range: Range, selectionRange: Range) {
    this.kind = kind
    this.name = name
    this.detail = detail
    this.uri = uri
    this.range = range
    this.selectionRange = selectionRange
  }
}

export interface TypeHierarchySupertypes {
  item: TypeHierarchyItem
  supertypes: TypeHierarchyItem[]
}

export interface TypeHierarchySubtypes {
  item: TypeHierarchyItem
  subtypes: TypeHierarchyItem[]
}

export interface TypeHierarchyProvider {
  prepareTypeHierarchy(document: TextDocument, position: Position, token: CancellationToken): Promise<TypeHierarchyItem[] | TypeHierarchyItem | undefined>
  provideTypeHierarchySupertypes(item: TypeHierarchyItem, token: CancellationToken): Promise<TypeHierarchyItem[]>
  provideTypeHierarchySubtypes(item: TypeHierarchyItem, token: CancellationToken): Promise<TypeHierarchyItem[]>
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

export class Diagnostic {
  range: Range
  message: string
  severity?: DiagnosticSeverity
  code?: string | number | { value: string | number; target: Uri }
  source?: string
  tags?: DiagnosticTag[]
  relatedInformation?: DiagnosticRelatedInformation[]

  constructor(range: Range, message: string, severity?: DiagnosticSeverity) {
    this.range = range
    this.message = message
    this.severity = severity
  }
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

export type Event<T> = (listener: (event: T) => void) => { dispose(): void }

export interface CancellationToken {
  isCancellationRequested: boolean
  onCancellationRequested: Event<void>
}

export class CancellationTokenSource {
  private readonly emitter = new EventEmitter<void>()
  token: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: this.emitter.event
  }

  cancel(): void {
    if (this.token.isCancellationRequested) {
      return
    }
    this.token.isCancellationRequested = true
    this.emitter.fire(undefined as void)
  }

  dispose(): void {
    this.cancel()
  }
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

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export interface FileStat {
  type: FileType
  ctime: number
  mtime: number
  size: number
}

export interface FileSystemWatcher {
  onDidCreate: Event<Uri>
  onDidChange: Event<Uri>
  onDidDelete: Event<Uri>
  ignoreCreateEvents: boolean
  ignoreChangeEvents: boolean
  ignoreDeleteEvents: boolean
  dispose(): void
}

export namespace workspace {
  export let rootPath: string | undefined
  export let workspaceFolders: WorkspaceFolder[] | undefined
  export let name: string | undefined
  export let textDocuments: TextDocument[] = []

  export const fs = {
    stat: async (uri: Uri): Promise<FileStat> => {
      const stats = await fsPromises.stat(uri.fsPath)
      let type = FileType.Unknown
      if (stats.isFile()) {
        type = FileType.File
      } else if (stats.isDirectory()) {
        type = FileType.Directory
      } else if (stats.isSymbolicLink()) {
        type = FileType.SymbolicLink
      }
      return {
        type,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size
      }
    },

    readDirectory: async (uri: Uri): Promise<[string, FileType][]> => {
      const entries = await fsPromises.readdir(uri.fsPath, { withFileTypes: true })
      return entries.map((entry: import('fs').Dirent) => {
        let type = FileType.Unknown
        if (entry.isFile()) {
          type = FileType.File
        } else if (entry.isDirectory()) {
          type = FileType.Directory
        } else if (entry.isSymbolicLink()) {
          type = FileType.SymbolicLink
        }
        return [entry.name, type]
      })
    },

    createDirectory: async (uri: Uri): Promise<void> => {
      await fsPromises.mkdir(uri.fsPath, { recursive: true })
    },

    readFile: async (uri: Uri): Promise<Uint8Array> => {
      const buffer = await fsPromises.readFile(uri.fsPath)
      return new Uint8Array(buffer)
    },

    writeFile: async (uri: Uri, content: Uint8Array): Promise<void> => {
      await fsPromises.mkdir(path.dirname(uri.fsPath), { recursive: true })
      await fsPromises.writeFile(uri.fsPath, Buffer.from(content))
    },

    delete: async (uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> => {
      void options
      await fsPromises.rm(uri.fsPath, { recursive: options?.recursive ?? false, force: true })
    },

    rename: async (oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): Promise<void> => {
      if (options?.overwrite) {
        await fsPromises.rm(newUri.fsPath, { recursive: true, force: true })
      }
      await fsPromises.rename(oldUri.fsPath, newUri.fsPath)
    },

    copy: async (source: Uri, destination: Uri, options?: { overwrite?: boolean }): Promise<void> => {
      if (options?.overwrite) {
        await fsPromises.rm(destination.fsPath, { recursive: true, force: true })
      }
      await fsPromises.cp(source.fsPath, destination.fsPath, { recursive: true })
    }
  }

  // TODO (Phase 2): Implement workspace file operations
  export async function openTextDocument(uri: Uri): Promise<TextDocument>
  export async function openTextDocument(fileName: string): Promise<TextDocument>
  export async function openTextDocument(options: { language?: string; content?: string }): Promise<TextDocument>
  export async function openTextDocument(arg: Uri | string | { language?: string; content?: string }): Promise<TextDocument> {
    if (typeof arg === 'string') {
      const content = await fsPromises.readFile(arg, 'utf-8')
      const uri = Uri.file(arg)
      return __internalOpenDocument({ uri: uri.fsPath, languageId: 'plaintext', content, version: 1 })
    }
    if (arg instanceof Uri) {
      const content = await fsPromises.readFile(arg.fsPath, 'utf-8')
      return __internalOpenDocument({ uri: arg.fsPath, languageId: 'plaintext', content, version: 1 })
    }
    const content = arg.content ?? ''
    const languageId = arg.language ?? 'plaintext'
    const uri = new Uri('untitled', '', `/Untitled-${Date.now()}`)
    return __internalOpenDocument({ uri: uri.fsPath, languageId, content, version: 1 })
  }
  // export function saveAll(includeUntitled?: boolean): Promise<boolean>
  // export function applyEdit(edit: WorkspaceEdit): Promise<boolean>
  // export function findFiles(include: GlobPattern, exclude?: GlobPattern, maxResults?: number): Promise<Uri[]>
  // export function createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher

  // Events (stub definitions)
  export const onDidOpenTextDocument: Event<TextDocument> = onDidOpenTextDocumentEmitter.event
  export const onDidCloseTextDocument: Event<TextDocument> = onDidCloseTextDocumentEmitter.event
  export const onDidChangeTextDocument: Event<TextDocumentChangeEvent> = onDidChangeTextDocumentEmitter.event
  export const onDidSaveTextDocument: Event<TextDocument> = onDidSaveTextDocumentEmitter.event
  export const onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = onDidChangeWorkspaceFoldersEmitter.event
  export const onDidChangeConfiguration: Event<ConfigurationChangeEvent> = onDidChangeConfigurationEmitter.event
  export const onDidCreateFiles: Event<FileCreateEvent> = onDidCreateFilesEmitter.event
  export const onDidDeleteFiles: Event<FileDeleteEvent> = onDidDeleteFilesEmitter.event
  export const onDidRenameFiles: Event<FileRenameEvent> = onDidRenameFilesEmitter.event

  export function createFileSystemWatcher(_globPattern: GlobPattern, _ignoreCreateEvents?: boolean, _ignoreChangeEvents?: boolean, _ignoreDeleteEvents?: boolean): FileSystemWatcher {
    const onDidCreateEmitter = new EventEmitter<Uri>()
    const onDidChangeEmitter = new EventEmitter<Uri>()
    const onDidDeleteEmitter = new EventEmitter<Uri>()
    return {
      ignoreCreateEvents: _ignoreCreateEvents ?? false,
      ignoreChangeEvents: _ignoreChangeEvents ?? false,
      ignoreDeleteEvents: _ignoreDeleteEvents ?? false,
      onDidCreate: onDidCreateEmitter.event,
      onDidChange: onDidChangeEmitter.event,
      onDidDelete: onDidDeleteEmitter.event,
      dispose: () => {
        onDidCreateEmitter.dispose()
        onDidChangeEmitter.dispose()
        onDidDeleteEmitter.dispose()
      }
    }
  }

  export function registerTextDocumentContentProvider(_scheme: string, _provider: TextDocumentContentProvider): Disposable {
    return new Disposable(() => {})
  }

  // TODO (Phase 2): Implement configuration
  export function getConfiguration(_section?: string, _scope?: ConfigurationScope): { get: <T>(key: string, defaultValue?: T) => T | undefined; update: (key: string, value: any) => Promise<void> } {
    return {
      get: <T>(_key: string, defaultValue?: T) => defaultValue,
      update: async (_key: string, _value: any) => {
        return
      }
    }
  }
}

export type GlobPattern = string

export interface FileSystemWatcher {
  ignoreCreateEvents: boolean
  ignoreChangeEvents: boolean
  ignoreDeleteEvents: boolean
  onDidCreate: Event<Uri>
  onDidChange: Event<Uri>
  onDidDelete: Event<Uri>
  dispose(): void
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

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
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

export interface TextDocumentContentProvider {
  onDidChange?: Event<Uri>
  provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Promise<string>
}

// ============================================================================
// Commands API
// ============================================================================

export namespace commands {
  export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    const entry = { callback, thisArg }
    commandRegistry.set(command, entry)
    return new Disposable(() => {
      const current = commandRegistry.get(command)
      if (current === entry) {
        commandRegistry.delete(command)
      }
    })
  }

  export async function executeCommand<T = any>(command: string, ...rest: any[]): Promise<T | undefined> {
    let entry = commandRegistry.get(command)
    if (!entry && commandActivationHandler) {
      await Promise.resolve(commandActivationHandler(command))
      entry = commandRegistry.get(command)
    }
    if (!entry) {
      return undefined
    }
    return await Promise.resolve(entry.callback.apply(entry.thisArg, rest)) as T
  }

  export async function getCommands(_filterInternal?: boolean): Promise<string[]> {
    return Array.from(commandRegistry.keys())
  }
}

// ============================================================================
// Env API
// ============================================================================

export namespace env {
  export const appName = 'Logos IDE'
  export const appRoot = ''
  export const appHost = 'desktop'
  export const language = 'en'
  export const uriScheme = 'logos-extension'
  export const uiKind = 1 as UIKind
  export const isTelemetryEnabled = true
  const onDidChangeTelemetryEnabledEmitter = new EventEmitter<boolean>()
  let clipboardText = ''

  export const clipboard = {
    readText: async () => clipboardText,
    writeText: async (value: string) => {
      clipboardText = value ?? ''
    }
  }

  export async function openExternal(target: Uri | string): Promise<boolean> {
    const url = typeof target === 'string' ? target : target.toString()
    notifyMain('openExternal', { url })
    return true
  }

  export const onDidChangeTelemetryEnabled: Event<boolean> = onDidChangeTelemetryEnabledEmitter.event

  export function createTelemetryLogger(_sender: unknown, _options?: { ignoreUnhandledErrors?: boolean; ignoreUnhandledPromises?: boolean }): TelemetryLogger {
    const noop = async () => {}
    return {
      logUsage: noop,
      logError: noop,
      flush: noop,
      dispose: () => {}
    }
  }
}

// ============================================================================
// Window API
// ============================================================================

export namespace window {
  export let activeTextEditor: TextEditor | undefined
  export let visibleTextEditors: TextEditor[] = []
  export let activeColorTheme: ColorTheme = { kind: 1 as ColorThemeKind }
  export const tabGroups: TabGroups = {
    all: [],
    activeTabGroup: undefined,
    onDidChangeTabGroups: onDidChangeTabGroupsEmitter.event
  }
  let activeUriHandler: UriHandler | undefined

  export async function showTextDocument(document: TextDocument, _column?: ViewColumn, _preserveFocus?: boolean): Promise<TextEditor> {
    const editor = createEditorForDocument(document)
    activeTextEditorInternal = editor
    activeTextEditor = editor
    visibleTextEditors = [editor]
    onDidChangeActiveTextEditorEmitter.fire(editor)
    onDidChangeVisibleTextEditorsEmitter.fire(visibleTextEditors)
    return editor
  }

  export function showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return showMessage('error', message, items)
  }

  export function showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return showMessage('warning', message, items)
  }

  export function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return showMessage('info', message, items)
  }

  export async function showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
    return await requestInputBox(options)
  }

  export async function showQuickPick<T extends QuickPickItem>(
    items: T[] | string[],
    options?: QuickPickOptions
  ): Promise<T | T[] | undefined> {
    const isStringItems = items.length > 0 && typeof items[0] === 'string'
    const normalized = normalizeQuickPickItems(items as Array<string | QuickPickItem>)
    const result = await requestQuickPick(normalized, options)
    if (result === undefined) {
      return undefined
    }
    if (options?.canPickMany && Array.isArray(result)) {
      if (isStringItems) {
        return result.map(index => (items as string[])[index]).filter(Boolean) as unknown as T[]
      }
      return result.map(index => normalized[index]).filter(Boolean) as unknown as T[]
    }
    if (typeof result === 'number') {
      if (isStringItems) {
        return (items as string[])[result] as unknown as T
      }
      return normalized[result] as T
    }
    return undefined
  }

  export function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider, options?: { retainContextWhenHidden?: boolean }): Disposable {
    const entry: WebviewProviderEntry = { viewId, provider, options }
    webviewProviders.set(viewId, entry)
    return new Disposable(() => {
      const current = webviewProviders.get(viewId)
      if (current === entry) {
        webviewProviders.delete(viewId)
      }
    })
  }

  export function registerCustomEditorProvider(_viewType: string, _provider: CustomEditorProvider, _options?: { webviewOptions?: { retainContextWhenHidden?: boolean }; supportsMultipleEditorsPerDocument?: boolean }): Disposable {
    return new Disposable(() => {})
  }

  export function createOutputChannel(name: string, options?: { log?: boolean }): OutputChannel & { trace: (value: string) => void; debug: (value: string) => void; info: (value: string) => void; warn: (value: string) => void; error: (value: string) => void } {
    const logToConsole = options?.log ?? false
    const write = (level: string, value: string) => {
      if (!value) {
        return
      }
      if (logToConsole) {
        console.log(`[output:${name}:${level}] ${value}`)
      }
    }
    return {
      name,
      append: (value: string) => {
        if (value) {
          write('append', value)
        }
      },
      appendLine: (value: string) => {
        write('appendLine', value)
      },
      trace: (value: string) => write('trace', value),
      debug: (value: string) => write('debug', value),
      info: (value: string) => write('info', value),
      warn: (value: string) => write('warn', value),
      error: (value: string) => write('error', value),
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }
  }

  export function createStatusBarItem(_alignment?: StatusBarAlignment, _priority?: number): StatusBarItem {
    return {
      text: '',
      show: () => {},
      hide: () => {},
      dispose: () => {}
    }
  }

  export function createWebviewPanel(viewType: string, title: string, _showOptions?: ViewColumn | { viewColumn?: ViewColumn; preserveFocus?: boolean }, options?: WebviewOptions): WebviewPanel {
    webviewHandleCounter += 1
    const handle = `webview_panel_${viewType}_${webviewHandleCounter}`
    const webview = createWebview(handle, viewType)
    webview.options = options ?? {}

    const disposeEmitter = new EventEmitter<void>()
    const viewStateEmitter = new EventEmitter<void>()

    return {
      viewType,
      title,
      webview,
      onDidDispose: disposeEmitter.event,
      onDidChangeViewState: viewStateEmitter.event,
      reveal: () => {},
      dispose: () => {
        webviewsByHandle.delete(handle)
        disposeEmitter.fire(undefined as void)
      }
    }
  }

  export async function withProgress<T>(options: ProgressOptions, task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => Thenable<T>): Promise<T> {
    void options
    const progress: Progress<{ message?: string; increment?: number }> = {
      report: () => {}
    }
    const token = createCancellationToken()
    return await Promise.resolve(task(progress, token))
  }

  export const onDidChangeActiveTextEditor: Event<TextEditor | undefined> = onDidChangeActiveTextEditorEmitter.event
  export const onDidChangeVisibleTextEditors: Event<TextEditor[]> = onDidChangeVisibleTextEditorsEmitter.event
  export const onDidChangeActiveColorTheme: Event<ColorTheme> = onDidChangeActiveColorThemeEmitter.event
  export const onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent> = onDidChangeTextEditorSelectionEmitter.event
  export const onDidChangeTextEditorVisibleRanges: Event<TextEditorVisibleRangesChangeEvent> = onDidChangeTextEditorVisibleRangesEmitter.event
  export const onDidChangeWindowState: Event<WindowState> = onDidChangeWindowStateEmitter.event
  export const onDidChangeTerminalShellIntegration: Event<void> = onDidChangeTerminalShellIntegrationEmitter.event
  export const onDidChangeTabGroups: Event<void> = onDidChangeTabGroupsEmitter.event

  export function registerUriHandler(handler: UriHandler): Disposable {
    activeUriHandler = handler
    return new Disposable(() => {
      if (activeUriHandler === handler) {
        activeUriHandler = undefined
      }
    })
  }
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

export enum UIKind {
  Desktop = 1,
  Web = 2
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

export class CancellationError extends Error {
  constructor() {
    super('Canceled')
    this.name = 'CancellationError'
  }
}

export interface UriHandler {
  handleUri(uri: Uri): void
}

export enum ProgressLocation {
  Notification = 15,
  Window = 10,
  SourceControl = 1
}

export interface ProgressOptions {
  location: ProgressLocation
  title?: string
  cancellable?: boolean
}

export interface Progress<T> {
  report(value: T): void
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export interface StatusBarItem {
  text: string
  tooltip?: string
  command?: string | Command
  show(): void
  hide(): void
  dispose(): void
}

export interface OutputChannel {
  name: string
  append(value: string): void
  appendLine(value: string): void
  clear(): void
  show(preserveFocus?: boolean): void
  hide(): void
  dispose(): void
}

export interface QuickPickItem {
  label: string
  description?: string
  detail?: string
  picked?: boolean
  kind?: QuickPickItemKind
}

export enum QuickPickItemKind {
  Separator = -1
}

export interface QuickPickOptions {
  canPickMany?: boolean
  placeHolder?: string
}

export interface InputBoxOptions {
  prompt?: string
  placeHolder?: string
  value?: string
}

export interface CustomDocument {
  uri: Uri
  dispose(): void
}

export interface CustomEditorProvider<T extends CustomDocument = CustomDocument> {
  openCustomDocument(uri: Uri, openContext: { backupId?: string }, token: CancellationToken): Promise<T> | T
  resolveCustomEditor(document: T, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> | void
}

export class TabInputText {
  uri: Uri

  constructor(uri: Uri) {
    this.uri = uri
  }
}

export class TabInputCustom {
  uri: Uri
  viewType?: string

  constructor(uri: Uri, viewType?: string) {
    this.uri = uri
    this.viewType = viewType
  }
}

export interface Tab {
  label: string
  input: TabInputText | TabInputCustom | unknown
  isActive: boolean
  isDirty: boolean
  isPinned: boolean
}

export interface TabGroup {
  tabs: Tab[]
  activeTab?: Tab
  isActive: boolean
  viewColumn?: ViewColumn
}

export interface TabGroups {
  all: TabGroup[]
  activeTabGroup?: TabGroup
  onDidChangeTabGroups: Event<void>
}

export interface WebviewOptions {
  enableScripts?: boolean
}

export interface Webview {
  html: string
  options: WebviewOptions
  onDidReceiveMessage: Event<any>
  postMessage(message: any): Promise<boolean>
  asWebviewUri(resource: Uri): Uri
  readonly cspSource: string
}

export interface WebviewView {
  viewType: string
  webview: Webview
  title?: string
  description?: string
  onDidDispose: Event<void>
  onDidChangeVisibility: Event<void>
  show(preserveFocus?: boolean): void
}

export interface WebviewViewResolveContext {
  state?: any
}

export interface WebviewViewProvider {
  resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext, token: CancellationToken): Promise<void> | void
}

export interface WebviewPanel {
  viewType: string
  title: string
  webview: Webview
  onDidDispose: Event<void>
  onDidChangeViewState: Event<void>
  reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void
  dispose(): void
}

export interface TelemetryLogger {
  logUsage(eventName: string, data?: Record<string, unknown>): void | Promise<void>
  logError(eventName: string, data?: Record<string, unknown>): void | Promise<void>
  flush(): void | Promise<void>
  dispose(): void
}

export interface AuthenticationSession {
  id: string
  accessToken: string
  account: { id: string; label: string }
  scopes: string[]
}

export interface AuthenticationSessionsChangeEvent {
  added: AuthenticationSession[]
  removed: AuthenticationSession[]
  changed: AuthenticationSession[]
}

export interface AuthenticationProvider {
  id: string
  displayName: string
  getSessions(scopes?: string[]): Promise<AuthenticationSession[]>
  onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>
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
    return registerProvider(completionProviders, { selector, provider, triggerCharacters })
  }

  export function registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable {
    return registerProvider(hoverProviders, { selector, provider })
  }

  export function registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable {
    return registerProvider(definitionProviders, { selector, provider })
  }

  export function registerReferenceProvider(selector: DocumentSelector, provider: ReferenceProvider): Disposable {
    return registerProvider(referenceProviders, { selector, provider })
  }

  export function registerImplementationProvider(selector: DocumentSelector, provider: ImplementationProvider): Disposable {
    return registerProvider(implementationProviders, { selector, provider })
  }

  export function registerTypeDefinitionProvider(selector: DocumentSelector, provider: TypeDefinitionProvider): Disposable {
    return registerProvider(typeDefinitionProviders, { selector, provider })
  }

  export function registerDeclarationProvider(selector: DocumentSelector, provider: DeclarationProvider): Disposable {
    return registerProvider(declarationProviders, { selector, provider })
  }

  export function registerDocumentSymbolProvider(selector: DocumentSelector, provider: DocumentSymbolProvider): Disposable {
    return registerProvider(documentSymbolProviders, { selector, provider })
  }

  export function registerSignatureHelpProvider(
    selector: DocumentSelector,
    provider: SignatureHelpProvider,
    ...triggerCharacters: string[]
  ): Disposable {
    return registerProvider(signatureHelpProviders, { selector, provider, triggerCharacters })
  }

  export function registerRenameProvider(selector: DocumentSelector, provider: RenameProvider): Disposable {
    return registerProvider(renameProviders, { selector, provider })
  }

  export function registerDocumentFormattingEditProvider(selector: DocumentSelector, provider: DocumentFormattingEditProvider): Disposable {
    return registerProvider(formattingProviders, { selector, provider })
  }

  export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider): Disposable {
    return registerProvider(rangeFormattingProviders, { selector, provider })
  }

  export function registerOnTypeFormattingEditProvider(
    selector: DocumentSelector,
    provider: OnTypeFormattingEditProvider,
    ...firstTriggerCharacter: string[]
  ): Disposable {
    return registerProvider(onTypeFormattingProviders, { selector, provider, triggerCharacters: firstTriggerCharacter })
  }

  export function registerCodeActionsProvider(selector: DocumentSelector, provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): Disposable {
    return registerProvider(codeActionProviders, { selector, provider, metadata })
  }

  export function registerCodeLensProvider(selector: DocumentSelector, provider: CodeLensProvider): Disposable {
    return registerProvider(codeLensProviders, { selector, provider })
  }

  export function registerDocumentLinkProvider(selector: DocumentSelector, provider: DocumentLinkProvider): Disposable {
    return registerProvider(documentLinkProviders, { selector, provider })
  }

  export function registerInlayHintsProvider(selector: DocumentSelector, provider: InlayHintsProvider): Disposable {
    return registerProvider(inlayHintProviders, { selector, provider })
  }

  export function registerCallHierarchyProvider(selector: DocumentSelector, provider: CallHierarchyProvider): Disposable {
    return registerProvider(callHierarchyProviders, { selector, provider })
  }

  export function registerTypeHierarchyProvider(selector: DocumentSelector, provider: TypeHierarchyProvider): Disposable {
    return registerProvider(typeHierarchyProviders, { selector, provider })
  }

  export function registerWorkspaceSymbolProvider(selector: DocumentSelector, provider: WorkspaceSymbolProvider): Disposable {
    return registerProvider(workspaceSymbolProviders, { selector, provider })
  }

  export function createLanguageStatusItem(id: string, name: string): LanguageStatusItem {
    return {
      id,
      name,
      text: '',
      dispose: () => {}
    }
  }

  export function match(selector: DocumentSelector, document: TextDocument): number {
    return matchDocumentSelector(selector, document) ? 1 : 0
  }

  // TODO (Phase 2): Add more language providers
}

export interface CodeActionProviderMetadata {
  providedCodeActionKinds?: CodeActionKind[]
  documentation?: Array<{ kind: CodeActionKind; command: Command }>
}

export enum LanguageStatusSeverity {
  Information = 1,
  Warning = 2,
  Error = 3
}

export interface LanguageStatusItem {
  readonly id: string
  readonly name: string
  text: string
  detail?: string
  tooltip?: string
  severity?: LanguageStatusSeverity
  command?: Command
  selector?: DocumentSelector
  busy?: boolean
  dispose(): void
}

// ============================================================================
// Internal bridge helpers (host <-> renderer)
// ============================================================================

export function __internalOpenDocument(payload: { uri: string; languageId: string; content: string; version: number }): TextDocument {
  const uri = Uri.file(payload.uri)
  const key = normalizeUriKey(uri)
  const existing = documents.get(key)
  if (existing) {
    existing.isClosed = false
    const doc = updateTextDocument(existing, payload.content, payload.version)
    workspace.textDocuments = workspace.textDocuments.map(item => (normalizeUriKey(item.uri) === key ? doc : item))
    return doc
  }

  const entry: InternalDocument = {
    uri,
    languageId: payload.languageId,
    version: payload.version,
    content: payload.content,
    isDirty: false,
    isClosed: false
  }
  documents.set(key, entry)
  const doc = createTextDocument(entry)
  workspace.textDocuments = [...workspace.textDocuments, doc]
  onDidOpenTextDocumentEmitter.fire(doc)
  return doc
}

export function __internalChangeDocument(payload: { uri: string; languageId: string; content: string; version: number }): void {
  const uri = Uri.file(payload.uri)
  const key = normalizeUriKey(uri)
  const entry = documents.get(key)
  if (!entry) {
    __internalOpenDocument(payload)
    return
  }
  entry.languageId = payload.languageId
  entry.isClosed = false
  const doc = updateTextDocument(entry, payload.content, payload.version)
  onDidChangeTextDocumentEmitter.fire({
    document: doc,
    contentChanges: [{ text: payload.content }]
  })
}

export function __internalCloseDocument(payload: { uri: string }): void {
  const uri = Uri.file(payload.uri)
  const key = normalizeUriKey(uri)
  const entry = documents.get(key)
  if (!entry) {
    return
  }
  entry.isClosed = true
  const doc = createTextDocument(entry)
  documents.delete(key)
  workspace.textDocuments = workspace.textDocuments.filter(item => normalizeUriKey(item.uri) !== key)
  onDidCloseTextDocumentEmitter.fire(doc)
}

export function __internalSetActiveEditor(payload: { uri: string | null; selection?: { start: { line: number; character: number }; end: { line: number; character: number } } }): void {
  if (!payload.uri) {
    activeTextEditorInternal = undefined
    // keep consistent with window.visibleTextEditors
    window.activeTextEditor = undefined
    window.visibleTextEditors = []
    onDidChangeActiveTextEditorEmitter.fire(undefined)
    onDidChangeVisibleTextEditorsEmitter.fire([])
    return
  }

  const entry = documents.get(normalizeUriKey(payload.uri))
  if (!entry) {
    return
  }
  const doc = createTextDocument(entry)
  const selectionPayload = payload.selection
  const selection = selectionPayload
    ? new Selection(
        selectionPayload.start.line,
        selectionPayload.start.character,
        selectionPayload.end.line,
        selectionPayload.end.character
      )
    : new Selection(0, 0, 0, 0)
  const editor = createEditorForDocument(doc, selection)
  activeTextEditorInternal = editor
  window.activeTextEditor = editor
  window.visibleTextEditors = [editor]
  onDidChangeActiveTextEditorEmitter.fire(editor)
  onDidChangeVisibleTextEditorsEmitter.fire(window.visibleTextEditors)
  if (payload.selection) {
    onDidChangeTextEditorSelectionEmitter.fire({ textEditor: editor, selections: editor.selections })
  }
}

export function __internalSetSelection(payload: { uri: string; selection: { start: { line: number; character: number }; end: { line: number; character: number } } }): void {
  if (!activeTextEditorInternal) {
    return
  }
  const key = normalizeUriKey(payload.uri)
  if (normalizeUriKey(activeTextEditorInternal.document.uri) !== key) {
    return
  }
  const selection = new Selection(
    payload.selection.start.line,
    payload.selection.start.character,
    payload.selection.end.line,
    payload.selection.end.character
  )
  activeTextEditorInternal.selections = [selection]
  if (window.activeTextEditor) {
    window.activeTextEditor.selections = [selection]
  }
  onDidChangeTextEditorSelectionEmitter.fire({ textEditor: activeTextEditorInternal, selections: [selection] })
}

function toExtensionLocation(location: Location): { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } {
  return {
    uri: location.uri.fsPath,
    range: toExtensionRange(location.range)
  }
}

function toExtensionWorkspaceEdit(edit: WorkspaceEdit): { edits: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }> } {
  const edits: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }> = []
  if (edit.changes) {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      edits.push({
        uri,
        edits: textEdits.map(item => ({ range: toExtensionRange(item.range), newText: item.newText }))
      })
    }
  }
  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      edits.push({
        uri: change.textDocument.uri.fsPath,
        edits: change.edits.map(item => ({ range: toExtensionRange(item.range), newText: item.newText }))
      })
    }
  }
  return { edits }
}

export async function __internalProvideCompletions(payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string } }): Promise<{ items: Array<{ label: string; kind?: number; detail?: string; documentation?: string; insertText?: string; insertTextFormat?: number; textEdit?: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string } }>; isIncomplete?: boolean }> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return { items: [], isIncomplete: false }
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const context: CompletionContext = {
    triggerKind: payload.context?.triggerKind ?? CompletionTriggerKind.Invoke,
    triggerCharacter: payload.context?.triggerCharacter
  }
  const providers = getMatchingProviders(completionProviders, document)
  const items: Array<{ label: string; kind?: number; detail?: string; documentation?: string; insertText?: string; insertTextFormat?: number; textEdit?: { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string } }> = []
  let isIncomplete = false

  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideCompletionItems(document, position, token, context))
    if (!result) {
      continue
    }
    let completionItems: CompletionItem[] = []
    if (Array.isArray(result)) {
      completionItems = result
    } else {
      const list = result as { items?: CompletionItem[]; isIncomplete?: boolean }
      completionItems = list.items ?? []
      if (list.isIncomplete) {
        isIncomplete = true
      }
    }
    for (const item of completionItems) {
      const textEdit = (item as any).textEdit as TextEdit | undefined
      items.push({
        label: item.label,
        kind: item.kind,
        detail: item.detail,
        documentation: toExtensionDocumentation(item.documentation),
        insertText: item.insertText,
        insertTextFormat: (item as any).insertTextFormat as number | undefined,
        textEdit: textEdit
          ? { range: toExtensionRange(textEdit.range), newText: textEdit.newText }
          : item.range
            ? { range: toExtensionRange(item.range), newText: item.insertText ?? item.label }
            : undefined
      })
    }
  }

  return { items, isIncomplete }
}

export async function __internalProvideInlineCompletions(_payload: { uri: string; position: { line: number; character: number } }): Promise<{ items: Array<{ insertText: string; range?: { start: { line: number; character: number }; end: { line: number; character: number } } }> }> {
  return { items: [] }
}

export async function __internalProvideHover(payload: { uri: string; position: { line: number; character: number } }): Promise<{ contents: string[]; range?: { start: { line: number; character: number }; end: { line: number; character: number } } } | null> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return null
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(hoverProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideHover(document, position, token))
    if (!result) {
      continue
    }
    const contents = Array.isArray(result.contents) ? result.contents : [result.contents]
    const resolved = contents.map(item => (typeof item === 'string' ? item : item.value))
    return {
      contents: resolved,
      range: result.range ? toExtensionRange(result.range) : undefined
    }
  }
  return null
}

export async function __internalProvideDefinition(payload: { uri: string; position: { line: number; character: number } }): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(definitionProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideDefinition(document, position, token))
    if (!result) {
      continue
    }
    const locations = Array.isArray(result) ? result : [result]
    return locations.map(toExtensionLocation)
  }
  return []
}

export async function __internalProvideReferences(payload: { uri: string; position: { line: number; character: number }; context?: { includeDeclaration?: boolean } }): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const context: ReferenceContext = { includeDeclaration: payload.context?.includeDeclaration ?? true }
  const providers = getMatchingProviders(referenceProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideReferences(document, position, context, token))
    if (result) {
      return result.map(toExtensionLocation)
    }
  }
  return []
}

export async function __internalProvideImplementation(payload: { uri: string; position: { line: number; character: number } }): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(implementationProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideImplementation(document, position, token))
    if (!result) {
      continue
    }
    const locations = Array.isArray(result) ? result : [result]
    return locations.map(toExtensionLocation)
  }
  return []
}

export async function __internalProvideTypeDefinition(payload: { uri: string; position: { line: number; character: number } }): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(typeDefinitionProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideTypeDefinition(document, position, token))
    if (!result) {
      continue
    }
    const locations = Array.isArray(result) ? result : [result]
    return locations.map(toExtensionLocation)
  }
  return []
}

export async function __internalProvideDeclaration(payload: { uri: string; position: { line: number; character: number } }): Promise<Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(declarationProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideDeclaration(document, position, token))
    if (!result) {
      continue
    }
    const locations = Array.isArray(result) ? result : [result]
    return locations.map(toExtensionLocation)
  }
  return []
}

export async function __internalProvideDocumentSymbols(payload: { uri: string }): Promise<Array<{ name: string; detail?: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } }; selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }; children?: any[] }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(documentSymbolProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideDocumentSymbols(document, token))
    if (!result) {
      continue
    }
    const mapSymbol = (symbol: DocumentSymbol): any => ({
      name: symbol.name,
      detail: symbol.detail,
      kind: symbol.kind,
      range: toExtensionRange(symbol.range),
      selectionRange: toExtensionRange(symbol.selectionRange),
      children: symbol.children ? symbol.children.map(mapSymbol) : undefined
    })
    return result.map(mapSymbol)
  }
  return []
}

export async function __internalProvideSignatureHelp(payload: { uri: string; position: { line: number; character: number }; context?: { triggerKind?: number; triggerCharacter?: string; isRetrigger?: boolean } }): Promise<{ signatures: Array<{ label: string; documentation?: string; parameters?: Array<{ label: string | [number, number]; documentation?: string }> }>; activeSignature?: number; activeParameter?: number } | null> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return null
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const context: SignatureHelpContext = {
    triggerKind: payload.context?.triggerKind ?? SignatureHelpTriggerKind.Invoke,
    triggerCharacter: payload.context?.triggerCharacter,
    isRetrigger: payload.context?.isRetrigger ?? false
  }
  const providers = getMatchingProviders(signatureHelpProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideSignatureHelp(document, position, token, context))
    if (!result) {
      continue
    }
    return {
      signatures: result.signatures.map(signature => ({
        label: signature.label,
        documentation: toExtensionDocumentation(signature.documentation),
        parameters: signature.parameters?.map(parameter => ({
          label: parameter.label as string | [number, number],
          documentation: toExtensionDocumentation(parameter.documentation)
        }))
      })),
      activeSignature: result.activeSignature,
      activeParameter: result.activeParameter
    }
  }
  return null
}

export async function __internalProvideRenameEdits(payload: { uri: string; position: { line: number; character: number }; newName: string }): Promise<{ edits: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }> } | null> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return null
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(renameProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideRenameEdits(document, position, payload.newName, token))
    if (!result) {
      continue
    }
    return toExtensionWorkspaceEdit(result)
  }
  return null
}

export async function __internalPrepareRename(payload: { uri: string; position: { line: number; character: number } }): Promise<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; placeholder?: string } | null> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return null
  }
  const position = new Position(payload.position.line, payload.position.character)
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(renameProviders, document)
  for (const entry of providers) {
    if (!entry.provider.prepareRename) {
      continue
    }
    const result = await Promise.resolve(entry.provider.prepareRename(document, position, token))
    if (!result) {
      continue
    }
    if (result instanceof Range) {
      return { range: toExtensionRange(result) }
    }
    return { range: toExtensionRange(result.range), placeholder: result.placeholder }
  }
  return null
}

export async function __internalProvideCodeActions(payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; context?: { only?: string; triggerKind?: number } }): Promise<Array<{ title: string; kind?: string; isPreferred?: boolean; edit?: { edits: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }> }; command?: { command: string; title: string; arguments?: unknown[] } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const range = new Range(payload.range.start.line, payload.range.start.character, payload.range.end.line, payload.range.end.character)
  const token: CancellationToken = createCancellationToken()
  const context: CodeActionContext = {
    diagnostics: [],
    only: payload.context?.only ? [payload.context.only as CodeActionKind] : undefined,
    triggerKind: payload.context?.triggerKind as CodeActionTriggerKind | undefined
  }
  const providers = getMatchingProviders(codeActionProviders, document)
  const actions: Array<{ title: string; kind?: string; isPreferred?: boolean; edit?: { edits: Array<{ uri: string; edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }> }> }; command?: { command: string; title: string; arguments?: unknown[] } }> = []

  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideCodeActions(document, range, context, token))
    if (!result) {
      continue
    }
    for (const item of result) {
      if ((item as Command).command && !(item as CodeAction).title) {
        const command = item as Command
        actions.push({ title: command.title, command: { command: command.command, title: command.title, arguments: command.arguments } })
        continue
      }
      const action = item as CodeAction
      actions.push({
        title: action.title,
        kind: action.kind as string | undefined,
        isPreferred: action.isPreferred,
        edit: action.edit ? toExtensionWorkspaceEdit(action.edit) : undefined,
        command: action.command ? { command: action.command.command, title: action.command.title, arguments: action.command.arguments } : undefined
      })
    }
  }

  return actions
}

export async function __internalProvideFormattingEdits(payload: { uri: string; options?: { tabSize: number; insertSpaces: boolean } }): Promise<Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const token: CancellationToken = createCancellationToken()
  const options = payload.options ?? { tabSize: 4, insertSpaces: true }
  const providers = getMatchingProviders(formattingProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideDocumentFormattingEdits(document, options, token))
    if (!result) {
      continue
    }
    return result.map(edit => ({ range: toExtensionRange(edit.range), newText: edit.newText }))
  }
  return []
}

export async function __internalProvideRangeFormattingEdits(payload: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; options?: { tabSize: number; insertSpaces: boolean } }): Promise<Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const token: CancellationToken = createCancellationToken()
  const options = payload.options ?? { tabSize: 4, insertSpaces: true }
  const range = new Range(payload.range.start.line, payload.range.start.character, payload.range.end.line, payload.range.end.character)
  const providers = getMatchingProviders(rangeFormattingProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideDocumentRangeFormattingEdits(document, range, options, token))
    if (!result) {
      continue
    }
    return result.map(edit => ({ range: toExtensionRange(edit.range), newText: edit.newText }))
  }
  return []
}

export async function __internalProvideOnTypeFormattingEdits(payload: { uri: string; position: { line: number; character: number }; ch: string; options?: { tabSize: number; insertSpaces: boolean } }): Promise<Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const token: CancellationToken = createCancellationToken()
  const options = payload.options ?? { tabSize: 4, insertSpaces: true }
  const position = new Position(payload.position.line, payload.position.character)
  const providers = getMatchingProviders(onTypeFormattingProviders, document)
  for (const entry of providers) {
    const result = await Promise.resolve(entry.provider.provideOnTypeFormattingEdits(document, position, payload.ch, options, token))
    if (!result) {
      continue
    }
    return result.map(edit => ({ range: toExtensionRange(edit.range), newText: edit.newText }))
  }
  return []
}

export async function __internalProvideCodeLenses(payload: { uri: string }): Promise<Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; command?: { title: string; command: string; arguments?: unknown[] } }>> {
  const document = await ensureDocumentForRequest(payload.uri)
  if (!document) {
    return []
  }
  const token: CancellationToken = createCancellationToken()
  const providers = getMatchingProviders(codeLensProviders, document)
  const results: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; command?: { title: string; command: string; arguments?: unknown[] } }> = []
  for (const entry of providers) {
    const lenses = await Promise.resolve(entry.provider.provideCodeLenses(document, token))
    if (!lenses) {
      continue
    }
    for (const lens of lenses) {
      results.push({
        range: toExtensionRange(lens.range),
        command: lens.command ? { title: lens.command.title, command: lens.command.command, arguments: lens.command.arguments } : undefined
      })
    }
  }
  return results
}

export async function __internalResolveWebviewView(payload: { viewId: string }): Promise<{ handle: string; html: string; options?: { enableScripts?: boolean } } | null> {
  const cached = webviewResolveCache.get(payload.viewId)
  if (cached) {
    return cached
  }
  const inFlight = webviewResolveInFlight.get(payload.viewId)
  if (inFlight) {
    return await inFlight
  }
  const providerEntry = webviewProviders.get(payload.viewId)
  if (!providerEntry) {
    return null
  }

  const resolver = (async () => {
    let handle = webviewHandleByViewId.get(payload.viewId)
    if (!handle) {
      webviewHandleCounter += 1
      handle = `webview_${payload.viewId}_${webviewHandleCounter}`
      webviewHandleByViewId.set(payload.viewId, handle)
    }
    let webview = webviewsByHandle.get(handle)
    if (!webview) {
      webview = createWebview(handle, payload.viewId)
    }

    const disposeEmitter = new EventEmitter<void>()
    const visibilityEmitter = new EventEmitter<void>()

    const webviewView: WebviewView = {
      viewType: payload.viewId,
      webview,
      onDidDispose: disposeEmitter.event,
      onDidChangeVisibility: visibilityEmitter.event,
      show: () => {}
    }

    await Promise.resolve(providerEntry.provider.resolveWebviewView(webviewView, {}, createCancellationToken()))
    const result = { handle, html: webview.html, options: webview.options }
    webviewResolveCache.set(payload.viewId, result)
    return result
  })()

  webviewResolveInFlight.set(payload.viewId, resolver)
  try {
    return await resolver
  } finally {
    webviewResolveInFlight.delete(payload.viewId)
  }
}

export function __internalWebviewPostMessage(payload: { handle: string; message: any }): boolean {
  const webview = webviewsByHandle.get(payload.handle)
  if (!webview) {
    return false
  }
  webview.fireMessage(payload.message)
  return true
}

export function __internalWebviewDispose(payload: { handle: string }): boolean {
  const webview = webviewsByHandle.get(payload.handle)
  if (!webview) {
    return false
  }
  webviewsByHandle.delete(payload.handle)
  for (const [viewId, handle] of webviewHandleByViewId.entries()) {
    if (handle === payload.handle) {
      webviewHandleByViewId.delete(viewId)
      webviewResolveCache.delete(viewId)
      webviewResolveInFlight.delete(viewId)
      break
    }
  }
  return true
}

export async function __internalExecuteCommand(payload: { command: string; args?: unknown[] }): Promise<unknown> {
  return await commands.executeCommand(payload.command, ...(payload.args ?? []))
}

export function __internalRegisterExtension(payload: { id: string; extensionPath: string; manifest: Record<string, unknown> }): void {
  const existing = extensionRegistry.get(payload.id)
  extensionRegistry.set(payload.id, {
    id: payload.id,
    extensionPath: payload.extensionPath,
    manifest: payload.manifest,
    isActive: existing?.isActive ?? false,
    exports: existing?.exports
  })
  refreshExtensionsList()
  onDidChangeExtensionsEmitter.fire(undefined as void)
}

export function __internalUpdateExtensionActivation(payload: { id: string; active: boolean; exportsValue?: unknown }): void {
  const existing = extensionRegistry.get(payload.id)
  extensionRegistry.set(payload.id, {
    id: payload.id,
    extensionPath: existing?.extensionPath ?? '',
    manifest: existing?.manifest ?? {},
    isActive: payload.active,
    exports: payload.exportsValue
  })
  refreshExtensionsList()
  onDidChangeExtensionsEmitter.fire(undefined as void)
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

  export const all: Extension[] = extensionsList
  export const onDidChange = onDidChangeExtensionsEmitter.event

  export function getExtension(extensionId: string): Extension | undefined {
    return extensionsList.find(extension => extension.id === extensionId)
  }
}

// ============================================================================
// Chat API
// ============================================================================

export interface ChatSessionItem {
  id: string
  label: string
  description?: string
}

export interface ChatSessionItemProvider {
  provideChatSessionItems(token: CancellationToken): Promise<ChatSessionItem[]>
}

export namespace chat {
  export function registerChatSessionItemProvider(_viewId: string, _provider: ChatSessionItemProvider): Disposable {
    return new Disposable(() => {})
  }
}

// ============================================================================
// Authentication API
// ============================================================================

export namespace authentication {
  const onDidChangeSessionsEmitter = new EventEmitter<AuthenticationSessionsChangeEvent>()
  export const onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = onDidChangeSessionsEmitter.event

  export async function getSession(_providerId: string, _scopes: string[], _options?: { createIfNone?: boolean; silent?: boolean }): Promise<AuthenticationSession | undefined> {
    return undefined
  }

  export function registerAuthenticationProvider(_id: string, _displayName: string, _provider: AuthenticationProvider): Disposable {
    return new Disposable(() => {})
  }
}

// ============================================================================
// Export all as module
// ============================================================================

export const vscodeModule = {
  version: '1.109.0',
  Uri,
  Position,
  Range,
  Selection,
  Location,
  WorkspaceEdit,
  CompletionItem,
  CompletionItemKind,
  CodeAction,
  DocumentLink,
  CallHierarchyItem,
  TypeHierarchyItem,
  CodeLens,
  SymbolKind,
  InlayHint,
  InlayHintKind,
  InlayHintLabelPart,
  SymbolInformation,
  WorkspaceSymbol,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  CodeActionKind,
  ColorThemeKind,
  QuickPickItemKind,
  UIKind,
  ProgressLocation,
  LanguageStatusSeverity,
  ConfigurationTarget,
  StatusBarAlignment,
  ViewColumn,
  FileType,
  TabInputText,
  TabInputCustom,
  Disposable,
  CancellationError,
  CancellationTokenSource,
  ExtensionKind,
  ExtensionMode,
  EventEmitter,
  workspace,
  commands,
  env,
  window,
  languages,
  extensions,
  chat,
  authentication
}
