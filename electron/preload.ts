import { contextBridge, ipcRenderer } from 'electron'

/** 文件节点接口 */
interface FileNode {
  path: string
  name: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  modifiedAt?: number
}

/** 文件信息接口 */
interface FileStat {
  isFile: boolean
  isDirectory: boolean
  size: number
  modifiedAt: number
}

/** Git 文件状态 */
type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied'

/** Git 变更文件 */
interface GitFile {
  path: string
  status: GitFileStatus
  staged: boolean
  oldPath?: string
}

/** Git 分支 */
interface GitBranch {
  name: string
  current: boolean
  remote?: string
  upstream?: string
  ahead?: number
  behind?: number
}

/** Git 提交 */
interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  authorEmail: string
  date: string
}

/** Git 状态 */
interface GitStatus {
  branch: string
  staged: GitFile[]
  unstaged: GitFile[]
  hasChanges: boolean
  hasUnpushed: boolean
  remote?: {
    ahead: number
    behind: number
  }
}

/** 文件变更事件 */
interface FileChangeEvent {
  type: 'change' | 'rename'
  path: string
}

/** 终端创建选项 */
interface TerminalCreateOptions {
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
  shell?: string
}

/** 终端数据事件 */
interface TerminalDataEvent {
  id: string
  data: string
}

/** 终端退出事件 */
interface TerminalExitEvent {
  id: string
  exitCode: number
  signal?: number
}

// ============ Extensions 相关类型 ============

type ExtensionHostStatus = 'stopped' | 'starting' | 'running' | 'error'

interface ExtensionHostState {
  status: ExtensionHostStatus
  pid?: number
  startedAt?: number
  error?: string
}

interface LocalExtensionInfo {
  id: string
  name: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  path: string
  enabled: boolean
  trusted?: boolean
  iconPath?: string
  categories?: string[]
}

// ============ WASM Extensions 相关类型 (IDE Extension Standard) ============

interface WasmPermissionGrant {
  permission: string
  granted: boolean
  grantedAt?: number
}

interface WasmExtensionManifest {
  name: string
  displayName?: string
  description?: string
  version: string
  publisher?: string
  license?: string
  repository?: string
  homepage?: string
  icon?: string
  runtime: 'wasm32-wasi'
  main: string
  standardVersion: string
  categories?: string[]
  permissions?: string[]
  activationEvents?: string[]
}

interface WasmExtensionInfo {
  id: string
  manifest: WasmExtensionManifest
  state: 'installed' | 'activated' | 'deactivated' | 'error'
  permissions: WasmPermissionGrant[]
  error?: string
}

type WasmActivationEvent =
  | { type: 'startup' }
  | { type: 'language'; languageId: string }
  | { type: 'command'; commandId: string }
  | { type: 'workspaceContains'; pattern: string }
  | { type: 'fileOpen'; pattern: string }

interface WasmNotificationPayload {
  type: 'info' | 'warning' | 'error'
  extensionId: string
  message: string
}

interface ExtensionHostMessage {
  level: 'info' | 'warning' | 'error'
  message: string
}

interface ExtensionPosition {
  line: number
  character: number
}

interface ExtensionRange {
  start: ExtensionPosition
  end: ExtensionPosition
}

interface ExtensionDocumentPayload {
  uri: string
  languageId: string
  content: string
  version: number
}

interface ExtensionDocumentChangePayload {
  uri: string
  languageId: string
  content: string
  version: number
}

interface ExtensionCompletionRequest {
  uri: string
  position: ExtensionPosition
  context?: {
    triggerKind?: number
    triggerCharacter?: string
  }
}

interface ExtensionCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string
  insertText?: string
  insertTextFormat?: number
  textEdit?: {
    range: ExtensionRange
    newText: string
  }
}

interface ExtensionCompletionResult {
  items: ExtensionCompletionItem[]
  isIncomplete?: boolean
}

interface ExtensionInlineCompletionRequest {
  uri: string
  position: ExtensionPosition
}

interface ExtensionInlineCompletionItem {
  insertText: string
  range?: ExtensionRange
}

interface ExtensionInlineCompletionResult {
  items: ExtensionInlineCompletionItem[]
}

interface ExtensionLocation {
  uri: string
  range: ExtensionRange
}

interface ExtensionHoverRequest {
  uri: string
  position: ExtensionPosition
}

interface ExtensionHoverResult {
  contents: string[]
  range?: ExtensionRange
}

interface ExtensionDefinitionRequest {
  uri: string
  position: ExtensionPosition
}

interface ExtensionReferencesRequest {
  uri: string
  position: ExtensionPosition
  context?: {
    includeDeclaration?: boolean
  }
}

interface ExtensionDocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: ExtensionRange
  selectionRange: ExtensionRange
  children?: ExtensionDocumentSymbol[]
}

interface ExtensionSignatureHelpRequest {
  uri: string
  position: ExtensionPosition
  context?: {
    triggerKind?: number
    triggerCharacter?: string
    isRetrigger?: boolean
  }
}

interface ExtensionSignatureHelpResult {
  signatures: Array<{
    label: string
    documentation?: string
    parameters?: Array<{
      label: string | [number, number]
      documentation?: string
    }>
  }>
  activeSignature?: number
  activeParameter?: number
}

interface ExtensionTextEdit {
  range: ExtensionRange
  newText: string
}

interface ExtensionWorkspaceEdit {
  edits: Array<{
    uri: string
    edits: ExtensionTextEdit[]
  }>
}

interface ExtensionRenameRequest {
  uri: string
  position: ExtensionPosition
  newName: string
}

interface ExtensionPrepareRenameResult {
  range: ExtensionRange
  placeholder?: string
}

interface ExtensionCodeAction {
  title: string
  kind?: string
  isPreferred?: boolean
  edit?: ExtensionWorkspaceEdit
  command?: { command: string; title: string; arguments?: unknown[] }
}

interface ExtensionCodeActionRequest {
  uri: string
  range: ExtensionRange
  context?: {
    only?: string
    triggerKind?: number
  }
}

interface ExtensionFormattingRequest {
  uri: string
  options?: { tabSize: number; insertSpaces: boolean }
}

interface ExtensionRangeFormattingRequest {
  uri: string
  range: ExtensionRange
  options?: { tabSize: number; insertSpaces: boolean }
}

interface ExtensionOnTypeFormattingRequest {
  uri: string
  position: ExtensionPosition
  ch: string
  options?: { tabSize: number; insertSpaces: boolean }
}

interface ExtensionViewContainer {
  id: string
  title: string
  iconPath?: string
  extensionId?: string
}

interface ExtensionView {
  id: string
  name: string
  containerId: string
  extensionId?: string
}

interface ExtensionScmTitleAction {
  id: string
  title: string
  group?: string
  when?: string
  command: string
  extensionId?: string
  iconPath?: string
  iconPathLight?: string
  iconPathDark?: string
}

type ExtensionWebviewPanelAction = 'create' | 'update' | 'reveal' | 'dispose'
type ExtensionStatusBarItemAction = 'show' | 'hide' | 'update' | 'dispose'

interface ExtensionUiContributions {
  containers: ExtensionViewContainer[]
  views: ExtensionView[]
  scmTitleActions?: ExtensionScmTitleAction[]
}

interface ExtensionWebviewPanel {
  handle: string
  viewType: string
  title: string
  options?: {
    enableScripts?: boolean
  }
  action?: ExtensionWebviewPanelAction
}

interface ExtensionWebviewResolveResult {
  handle: string
  html: string
  options?: {
    enableScripts?: boolean
  }
}

interface ExtensionWebviewMessage {
  handle: string
  message: unknown
}

interface ExtensionWebviewHtml {
  handle: string
  html: string
}

interface ExtensionStatusBarItem {
  id: string
  text: string
  tooltip?: string
  command?: { command: string; title?: string; arguments?: unknown[] }
  visible?: boolean
  alignment?: number
  priority?: number
  action?: ExtensionStatusBarItemAction
}

interface ExtensionMarketplaceItem {
  id: string
  publisher: string
  name: string
  displayName?: string
  description?: string
  version?: string
  downloads?: number
  iconUrl?: string
  downloadUrl?: string
}

// ============ Commit Analysis 相关类型 ============

/** Diff hunk */
interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
  addedLines: string[]
  removedLines: string[]
}

/** 文件变更 */
interface FileChange {
  path: string
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  linesAdded: number
  linesRemoved: number
  hunks: DiffHunk[]
}

/** 审查建议严重程度 */
type SuggestionSeverity = 'error' | 'warning' | 'info'

/** 审查建议类别 */
type SuggestionCategory = 'security' | 'performance' | 'style' | 'complexity' | 'testing' | 'documentation'

/** 审查建议 */
interface ReviewSuggestion {
  file: string
  line: number
  severity: SuggestionSeverity
  category: SuggestionCategory
  message: string
  suggestion?: string
  code?: string
}

/** 提交指标 */
interface CommitMetrics {
  totalFilesChanged: number
  totalLinesAdded: number
  totalLinesRemoved: number
  largestFile: string
  largestFileChanges: number
  testFilesChanged: number
  configFilesChanged: number
}

/** 提交分析结果 */
interface CommitAnalysis {
  commitHash: string
  commitMessage: string
  author: string
  date: string
  changedFiles: FileChange[]
  reviewSuggestions: ReviewSuggestion[]
  metrics: CommitMetrics
}

// ============ 代码智能相关类型 ============

/** 位置 */
interface Position {
  line: number
  column: number
}

/** 范围 */
interface Range {
  start: Position
  end: Position
}

/** 补全项 */
interface CompletionItem {
  label: string
  kind: number
  detail?: string
  documentation?: string | { value: string; isTrusted?: boolean }
  insertText: string
  insertTextRules?: number
  sortText?: string
  filterText?: string
  preselect?: boolean
  range?: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}

/** 补全结果 */
interface CompletionResult {
  suggestions: CompletionItem[]
  incomplete?: boolean
}

/** 定义位置 */
interface DefinitionLocation {
  uri: string
  range: Range
}

/** 引用位置 */
interface ReferenceLocation {
  uri: string
  range: Range
  isDefinition?: boolean
}

/** 诊断信息 */
interface Diagnostic {
  range: Range
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  code?: string | number
  source?: string
}

/** 悬停信息 */
interface HoverInfo {
  contents: Array<{ value: string; language?: string }>
  range?: Range
}

/** 签名帮助 */
interface SignatureHelp {
  signatures: Array<{
    label: string
    documentation?: string
    parameters: Array<{ label: string | [number, number]; documentation?: string }>
    activeParameter?: number
  }>
  activeSignature: number
  activeParameter: number
}

/** 内联提示 */
interface InlayHint {
  position: Position
  label: string
  kind: 'type' | 'parameter'
  paddingLeft?: boolean
  paddingRight?: boolean
}

/** 重命名准备结果 */
interface PrepareRenameResult {
  range: Range
  placeholder: string
}

/** 文本编辑 */
interface TextEdit {
  range: Range
  newText: string
}

/** 工作区编辑 */
interface WorkspaceEdit {
  changes: Record<string, TextEdit[]>
}

/** 重构动作 */
interface RefactorAction {
  title: string
  kind: string
  description?: string
  isPreferred?: boolean
  disabled?: { reason: string }
}

/** 语言服务器状态 */
interface LanguageServerStatus {
  language: string
  status: 'starting' | 'ready' | 'error' | 'stopped'
  message?: string
}

/** 索引阶段 */
type IndexingPhase = 'idle' | 'scanning' | 'parsing' | 'indexing' | 'ready'

/** 索引进度 */
interface IndexingProgress {
  phase: IndexingPhase
  message: string
  currentFile?: string
  processedFiles: number
  totalFiles: number
  percentage: number
  startTime?: number
  estimatedTimeRemaining?: number
}

/** 分析状态 */
interface AnalysisStatus {
  isAnalyzing: boolean
  currentFile?: string
  queuedFiles: number
}

/** Logos 服务状态 */
interface LSPServiceStatus {
  indexing: IndexingProgress
  analysis: AnalysisStatus
  servers: LanguageServerStatus[]
  diagnostics: {
    errors: number
    warnings: number
    hints: number
  }
}

// ============ 调试相关类型 ============

/** 更新状态 */
type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** 更新信息 */
interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string | Array<{ version: string; note: string }>
}

/** 下载进度 */
interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

/** 更新状态 */
interface UpdateState {
  status: UpdateStatus
  info?: UpdateInfo
  progress?: ProgressInfo
  error?: string
}

/** 调试器类型 */
type DebuggerType = 'node' | 'chrome' | 'gdb' | 'lldb' | 'python' | 'go'

/** 调试会话状态 */
type SessionState = 'initializing' | 'running' | 'stopped' | 'terminated'

/** 断点类型 */
type BreakpointType = 'line' | 'conditional' | 'logpoint' | 'function' | 'exception' | 'data'

/** 源文件 */
interface DebugSource {
  name?: string
  path?: string
  sourceReference?: number
}

/** 断点信息 */
interface BreakpointInfo {
  id: string
  verified: boolean
  source: DebugSource
  line: number
  column?: number
  enabled: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
  type: BreakpointType
}

/** 调试配置 */
interface DebugConfig {
  type: DebuggerType | string
  request: 'launch' | 'attach'
  name: string
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  [key: string]: unknown
}

/** 调试会话 */
interface DebugSession {
  id: string
  name: string
  type: DebuggerType | string
  state: SessionState
  config: DebugConfig
  threads: DebugThread[]
  currentThreadId?: number
  currentFrameId?: number
}

/** 调试线程 */
interface DebugThread {
  id: number
  name: string
}

/** 栈帧 */
interface DebugStackFrame {
  id: number
  name: string
  source?: DebugSource
  line: number
  column: number
  presentationHint?: 'normal' | 'label' | 'subtle'
  canRestart?: boolean
}

/** 作用域 */
interface DebugScope {
  name: string
  variablesReference: number
  expensive: boolean
}

/** 变量 */
interface DebugVariable {
  name: string
  value: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
}

/** 表达式求值结果 */
interface EvaluateResult {
  result: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  memoryReference?: string
}

/** 监视表达式 */
interface WatchExpression {
  id: string
  expression: string
  result?: EvaluateResult
  error?: string
}

/** 调试控制台消息 */
interface DebugConsoleMessage {
  type: 'input' | 'output' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
  source?: string
  line?: number
}

/** 启动配置文件 */
interface LaunchConfigFile {
  version: string
  configurations: DebugConfig[]
  compounds?: Array<{
    name: string
    configurations: string[]
    stopAll?: boolean
  }>
}

/** 调试适配器类型 */
type AdapterType = 'node' | 'python' | 'cppdbg' | 'lldb' | 'go'

/** 调试适配器信息 */
interface AdapterInfo {
  type: AdapterType
  displayName: string
  languages: string[]
  installed: boolean
  version?: string
  binaryPath?: string
  description?: string
}

/** 检测到的调试器 */
interface DetectedDebugger {
  type: AdapterType
  displayName: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

// ============ Remote Development Types ============

/** SSH 认证方式 */
type AuthMethod = 'password' | 'key' | 'agent'

/** 连接状态 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/** SSH 连接配置 */
interface SSHConnectionConfig {
  id?: string
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  password?: string
  privateKeyPath?: string
  passphrase?: string
  remoteWorkspacePath?: string
  keepAliveInterval?: number
}

/** 远程连接 */
interface RemoteConnection {
  id: string
  config: SSHConnectionConfig
  state: ConnectionState
  error?: string
  connectedAt?: number
  fingerprint?: string
}

/** 远程文件节点 */
interface RemoteFileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: RemoteFileNode[]
}

/** 远程文件状态 */
interface RemoteFileStat {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  size: number
  mtime: number
  atime: number
  mode: number
}

/** 远程终端选项 */
interface RemoteTerminalOptions {
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

/** 远程操作结果 */
interface RemoteOperationResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ 应用信息 ============
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  platform: process.platform,

  // ============ Shell 操作 ============
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ============ 窗口控制 ============
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // ============ 遥测控制 ============
  telemetry: {
    enable: (): Promise<boolean> => ipcRenderer.invoke('telemetry:enable'),
    disable: (): Promise<boolean> => ipcRenderer.invoke('telemetry:disable'),
    isEnabled: (): Promise<boolean> => ipcRenderer.invoke('telemetry:isEnabled')
  },

  // ============ 扩展系统 ============
  extensions: {
    getRoot: (): Promise<string> => ipcRenderer.invoke('extensions:getRoot'),
    listLocal: (): Promise<LocalExtensionInfo[]> => ipcRenderer.invoke('extensions:listLocal'),
    installVsix: (vsixPath: string): Promise<LocalExtensionInfo> =>
      ipcRenderer.invoke('extensions:installVsix', vsixPath),
    installFromUrl: (url: string): Promise<LocalExtensionInfo> =>
      ipcRenderer.invoke('extensions:installFromUrl', url),
    uninstall: (extensionId: string): Promise<boolean> =>
      ipcRenderer.invoke('extensions:uninstall', extensionId),
    setEnabled: (extensionId: string, enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('extensions:setEnabled', extensionId, enabled),
    setTrusted: (extensionId: string, trusted: boolean): Promise<boolean> =>
      ipcRenderer.invoke('extensions:setTrusted', extensionId, trusted),
    setWorkspaceRoot: (rootPath: string | null): Promise<boolean> =>
      ipcRenderer.invoke('extensions:setWorkspaceRoot', rootPath),
    notifyDocumentOpen: (payload: ExtensionDocumentPayload): Promise<boolean> =>
      ipcRenderer.invoke('extensions:notifyDocumentOpen', payload),
    notifyDocumentChange: (payload: ExtensionDocumentChangePayload): Promise<boolean> =>
      ipcRenderer.invoke('extensions:notifyDocumentChange', payload),
    notifyDocumentClose: (payload: { uri: string }): Promise<boolean> =>
      ipcRenderer.invoke('extensions:notifyDocumentClose', payload),
    notifyActiveEditorChange: (payload: { uri: string | null; selection?: ExtensionRange }): Promise<boolean> =>
      ipcRenderer.invoke('extensions:notifyActiveEditorChange', payload),
    notifySelectionChange: (payload: { uri: string; selection: ExtensionRange }): Promise<boolean> =>
      ipcRenderer.invoke('extensions:notifySelectionChange', payload),
    provideCompletions: (payload: ExtensionCompletionRequest): Promise<ExtensionCompletionResult> =>
      ipcRenderer.invoke('extensions:provideCompletions', payload),
    provideInlineCompletions: (payload: ExtensionInlineCompletionRequest): Promise<ExtensionInlineCompletionResult> =>
      ipcRenderer.invoke('extensions:provideInlineCompletions', payload),
    provideHover: (payload: ExtensionHoverRequest): Promise<ExtensionHoverResult | null> =>
      ipcRenderer.invoke('extensions:provideHover', payload),
    provideDefinition: (payload: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> =>
      ipcRenderer.invoke('extensions:provideDefinition', payload),
    provideReferences: (payload: ExtensionReferencesRequest): Promise<ExtensionLocation[]> =>
      ipcRenderer.invoke('extensions:provideReferences', payload),
    provideImplementation: (payload: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> =>
      ipcRenderer.invoke('extensions:provideImplementation', payload),
    provideTypeDefinition: (payload: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> =>
      ipcRenderer.invoke('extensions:provideTypeDefinition', payload),
    provideDeclaration: (payload: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> =>
      ipcRenderer.invoke('extensions:provideDeclaration', payload),
    provideDocumentSymbols: (payload: { uri: string }): Promise<ExtensionDocumentSymbol[]> =>
      ipcRenderer.invoke('extensions:provideDocumentSymbols', payload),
    provideSignatureHelp: (payload: ExtensionSignatureHelpRequest): Promise<ExtensionSignatureHelpResult | null> =>
      ipcRenderer.invoke('extensions:provideSignatureHelp', payload),
    provideRenameEdits: (payload: ExtensionRenameRequest): Promise<ExtensionWorkspaceEdit | null> =>
      ipcRenderer.invoke('extensions:provideRenameEdits', payload),
    prepareRename: (payload: ExtensionDefinitionRequest): Promise<ExtensionPrepareRenameResult | null> =>
      ipcRenderer.invoke('extensions:prepareRename', payload),
    provideCodeActions: (payload: ExtensionCodeActionRequest): Promise<ExtensionCodeAction[]> =>
      ipcRenderer.invoke('extensions:provideCodeActions', payload),
    provideFormattingEdits: (payload: ExtensionFormattingRequest): Promise<ExtensionTextEdit[]> =>
      ipcRenderer.invoke('extensions:provideFormattingEdits', payload),
    provideRangeFormattingEdits: (payload: ExtensionRangeFormattingRequest): Promise<ExtensionTextEdit[]> =>
      ipcRenderer.invoke('extensions:provideRangeFormattingEdits', payload),
    provideOnTypeFormattingEdits: (payload: ExtensionOnTypeFormattingRequest): Promise<ExtensionTextEdit[]> =>
      ipcRenderer.invoke('extensions:provideOnTypeFormattingEdits', payload),
    provideTextDocumentContent: (payload: { uri: string }): Promise<string | null> =>
      ipcRenderer.invoke('extensions:provideTextDocumentContent', payload),
    listUiContributions: (): Promise<ExtensionUiContributions> =>
      ipcRenderer.invoke('extensions:listUiContributions'),
    resolveWebviewView: (payload: { viewId: string }): Promise<ExtensionWebviewResolveResult | null> =>
      ipcRenderer.invoke('extensions:resolveWebviewView', payload),
    postWebviewMessage: (payload: ExtensionWebviewMessage): Promise<boolean> =>
      ipcRenderer.invoke('extensions:postWebviewMessage', payload),
    disposeWebviewView: (payload: { handle: string }): Promise<boolean> =>
      ipcRenderer.invoke('extensions:disposeWebviewView', payload),
    disposeWebviewPanel: (payload: { handle: string }): Promise<boolean> =>
      ipcRenderer.invoke('extensions:disposeWebviewPanel', payload),
    executeCommand: (payload: { command: string; args?: unknown[] }): Promise<unknown> =>
      ipcRenderer.invoke('extensions:executeCommand', payload),
    marketplaceSearch: (query: string, size?: number): Promise<ExtensionMarketplaceItem[]> =>
      ipcRenderer.invoke('extensions:marketplaceSearch', query, size),
    openRoot: (): Promise<string> => ipcRenderer.invoke('extensions:openRoot'),
    getHostStatus: (): Promise<ExtensionHostState> => ipcRenderer.invoke('extensions:hostStatus'),
    startHost: (): Promise<ExtensionHostState> => ipcRenderer.invoke('extensions:hostStart'),
    stopHost: (): Promise<ExtensionHostState> => ipcRenderer.invoke('extensions:hostStop'),
    restartHost: (): Promise<ExtensionHostState> => ipcRenderer.invoke('extensions:hostRestart'),
    onHostStatus: (callback: (state: ExtensionHostState) => void) => {
      const handler = (_: Electron.IpcRendererEvent, state: ExtensionHostState) => callback(state)
      ipcRenderer.on('extensions:hostStatus', handler)
      return () => ipcRenderer.removeListener('extensions:hostStatus', handler)
    },
    onMessage: (callback: (payload: ExtensionHostMessage) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ExtensionHostMessage) => callback(payload)
      ipcRenderer.on('extensions:message', handler)
      return () => ipcRenderer.removeListener('extensions:message', handler)
    },
    onWebviewMessage: (callback: (payload: ExtensionWebviewMessage) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ExtensionWebviewMessage) => callback(payload)
      ipcRenderer.on('extensions:webviewMessage', handler)
      return () => ipcRenderer.removeListener('extensions:webviewMessage', handler)
    },
    onWebviewHtml: (callback: (payload: ExtensionWebviewHtml) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ExtensionWebviewHtml) => callback(payload)
      ipcRenderer.on('extensions:webviewHtml', handler)
      return () => ipcRenderer.removeListener('extensions:webviewHtml', handler)
    },
    onWebviewPanel: (callback: (payload: ExtensionWebviewPanel) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ExtensionWebviewPanel) => callback(payload)
      ipcRenderer.on('extensions:webviewPanel', handler)
      return () => ipcRenderer.removeListener('extensions:webviewPanel', handler)
    },
    onStatusBarItem: (callback: (payload: ExtensionStatusBarItem) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ExtensionStatusBarItem) => callback(payload)
      ipcRenderer.on('extensions:statusBarItem', handler)
      return () => ipcRenderer.removeListener('extensions:statusBarItem', handler)
    }
  },

  // ============ WASM 扩展 (IDE Extension Standard) ============
  wasmExtensions: {
    // 列出已安装的WASM扩展
    list: (): Promise<WasmExtensionInfo[]> =>
      ipcRenderer.invoke('wasm-ext:list'),

    // 获取扩展详情
    get: (extensionId: string): Promise<WasmExtensionInfo | null> =>
      ipcRenderer.invoke('wasm-ext:get', extensionId),

    // 安装扩展
    install: (packagePath: string): Promise<{ success: boolean; extension?: WasmExtensionInfo; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:install', packagePath),

    // 卸载扩展
    uninstall: (extensionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:uninstall', extensionId),

    // 激活扩展
    activate: (extensionId: string, event?: WasmActivationEvent): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:activate', extensionId, event),

    // 停用扩展
    deactivate: (extensionId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:deactivate', extensionId),

    // 授予权限
    grantPermission: (extensionId: string, permission: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:grant-permission', extensionId, permission),

    // 撤销权限
    revokePermission: (extensionId: string, permission: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('wasm-ext:revoke-permission', extensionId, permission),

    // 获取权限风险级别
    getPermissionRiskLevel: (permission: string): Promise<'low' | 'medium' | 'high' | 'dangerous'> =>
      ipcRenderer.invoke('wasm-ext:permission-risk', permission),

    // 检查扩展是否有权限
    hasPermission: (extensionId: string, permission: string): Promise<boolean> =>
      ipcRenderer.invoke('wasm-ext:has-permission', extensionId, permission),

    // 监听WASM扩展通知
    onNotification: (callback: (payload: WasmNotificationPayload) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: WasmNotificationPayload) => callback(payload)
      ipcRenderer.on('wasm-extension:notification', handler)
      return () => ipcRenderer.removeListener('wasm-extension:notification', handler)
    }
  },

  // ============ 反馈上报 ============
  feedback: {
    collectState: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('feedback:collectState'),

    getGitHubIssueUrl: (repoPath: string): Promise<string | null> =>
      ipcRenderer.invoke('feedback:getGitHubIssueUrl', repoPath),

    captureHeapSnapshot: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('feedback:captureHeapSnapshot'),

    submitToSentry: (data: {
      message: string
      state: Record<string, unknown>
      heapSnapshot: Record<string, unknown>
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('feedback:submitToSentry', data)
  },

  // ============ 文件系统操作 ============
  fileSystem: {
    // 对话框
    openFolderDialog: (): Promise<string | null> =>
      ipcRenderer.invoke('fs:openFolderDialog'),

    openFileDialog: (options?: {
      filters?: { name: string; extensions: string[] }[]
      multiple?: boolean
    }): Promise<string | string[] | null> =>
      ipcRenderer.invoke('fs:openFileDialog', options),

    saveFileDialog: (options?: {
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<string | null> =>
      ipcRenderer.invoke('fs:saveFileDialog', options),

    // 读取操作
    readDirectory: (dirPath: string, recursive?: boolean): Promise<FileNode[]> =>
      ipcRenderer.invoke('fs:readDirectory', dirPath, recursive),

    readFile: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:readFile', filePath),

    readFileBuffer: (filePath: string): Promise<Buffer> =>
      ipcRenderer.invoke('fs:readFileBuffer', filePath),

    // 写入操作
    writeFile: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),

    createFile: (filePath: string, content?: string): Promise<void> =>
      ipcRenderer.invoke('fs:createFile', filePath, content),

    createDirectory: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:createDirectory', dirPath),

    // 文件操作
    deleteItem: (itemPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:deleteItem', itemPath),

    renameItem: (oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:renameItem', oldPath, newPath),

    moveItem: (sourcePath: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:moveItem', sourcePath, targetPath),

    copyItem: (sourcePath: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:copyItem', sourcePath, targetPath),

    // 信息查询
    exists: (itemPath: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:exists', itemPath),

    stat: (itemPath: string): Promise<FileStat> =>
      ipcRenderer.invoke('fs:stat', itemPath),

    // 路径操作
    getHomeDir: (): Promise<string> =>
      ipcRenderer.invoke('fs:getHomeDir'),

    getPathSeparator: (): Promise<string> =>
      ipcRenderer.invoke('fs:getPathSeparator'),

    joinPath: (...parts: string[]): Promise<string> =>
      ipcRenderer.invoke('fs:joinPath', ...parts),

    dirname: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:dirname', filePath),

    basename: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:basename', filePath),

    extname: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('fs:extname', filePath),

    // 文件监听
    watchDirectory: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:watchDirectory', dirPath),

    unwatchDirectory: (dirPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:unwatchDirectory', dirPath),

    unwatchAll: (): Promise<void> =>
      ipcRenderer.invoke('fs:unwatchAll'),

    onFileChange: (callback: (event: FileChangeEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: FileChangeEvent) => callback(event)
      ipcRenderer.on('fs:change', handler)
      return () => ipcRenderer.removeListener('fs:change', handler)
    }
  },

  // ============ Git 操作 ============
  git: {
    // 仓库操作
    isRepo: (repoPath: string): Promise<boolean> =>
      ipcRenderer.invoke('git:isRepo', repoPath),

    init: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:init', repoPath),

    clone: (url: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke('git:clone', url, targetPath),

    // 状态查询
    status: (repoPath: string): Promise<GitStatus> =>
      ipcRenderer.invoke('git:status', repoPath),

    // 暂存操作
    stage: (repoPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke('git:stage', repoPath, filePath),

    unstage: (repoPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke('git:unstage', repoPath, filePath),

    stageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:stageAll', repoPath),

    unstageAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:unstageAll', repoPath),

    // 提交操作
    commit: (repoPath: string, message: string): Promise<void> =>
      ipcRenderer.invoke('git:commit', repoPath, message),

    // 更改操作
    discard: (repoPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke('git:discard', repoPath, filePath),

    discardAll: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:discardAll', repoPath),

    // 分支操作
    branches: (repoPath: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke('git:branches', repoPath),

    checkout: (repoPath: string, branchName: string): Promise<void> =>
      ipcRenderer.invoke('git:checkout', repoPath, branchName),

    createBranch: (repoPath: string, branchName: string, checkout?: boolean): Promise<void> =>
      ipcRenderer.invoke('git:createBranch', repoPath, branchName, checkout),

    deleteBranch: (repoPath: string, branchName: string, force?: boolean): Promise<void> =>
      ipcRenderer.invoke('git:deleteBranch', repoPath, branchName, force),

    // 差异查看
    diff: (repoPath: string, filePath: string, staged: boolean): Promise<string> =>
      ipcRenderer.invoke('git:diff', repoPath, filePath, staged),

    showFile: (repoPath: string, filePath: string, ref?: string): Promise<string> =>
      ipcRenderer.invoke('git:showFile', repoPath, filePath, ref),

    // 历史记录
    log: (repoPath: string, limit?: number): Promise<GitCommit[]> =>
      ipcRenderer.invoke('git:log', repoPath, limit),

    logFile: (repoPath: string, filePath: string, limit?: number): Promise<GitCommit[]> =>
      ipcRenderer.invoke('git:logFile', repoPath, filePath, limit),

    // 远程操作
    push: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke('git:push', repoPath, remote, branch),

    pull: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke('git:pull', repoPath, remote, branch),

    pullRebase: (repoPath: string, remote?: string, branch?: string): Promise<void> =>
      ipcRenderer.invoke('git:pullRebase', repoPath, remote, branch),

    remotes: (repoPath: string): Promise<string[]> =>
      ipcRenderer.invoke('git:remotes', repoPath),

    // 配置
    getConfig: (repoPath: string, key: string): Promise<string | null> =>
      ipcRenderer.invoke('git:getConfig', repoPath, key),

    setConfig: (repoPath: string, key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('git:setConfig', repoPath, key, value),

    // Blame
    blame: (repoPath: string, filePath: string): Promise<string> =>
      ipcRenderer.invoke('git:blame', repoPath, filePath),

    // Stash
    stash: (repoPath: string, message?: string): Promise<void> =>
      ipcRenderer.invoke('git:stash', repoPath, message),

    stashPop: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:stashPop', repoPath),

    stashList: (repoPath: string): Promise<string[]> =>
      ipcRenderer.invoke('git:stashList', repoPath),

    // ============ GitLens 扩展 ============

    // 获取结构化 blame 信息
    blameStructured: (repoPath: string, filePath: string): Promise<Array<{
      commitHash: string
      shortHash: string
      author: string
      authorEmail: string
      authorTime: string
      summary: string
      lineNumber: number
      lineContent: string
      isUncommitted: boolean
    }>> =>
      ipcRenderer.invoke('git:blameStructured', repoPath, filePath),

    // 获取完整 commit 详情
    getCommit: (repoPath: string, hash: string): Promise<{
      hash: string
      shortHash: string
      author: { name: string; email: string; date: string }
      committer: { name: string; email: string; date: string }
      message: string
      body: string
      parents: string[]
      stats: { additions: number; deletions: number; filesChanged: number }
    } | null> =>
      ipcRenderer.invoke('git:getCommit', repoPath, hash),

    // 获取文件历史
    getFileHistory: (
      repoPath: string,
      filePath: string,
      options?: { limit?: number; skip?: number; follow?: boolean }
    ): Promise<GitCommit[]> =>
      ipcRenderer.invoke('git:getFileHistory', repoPath, filePath, options),

    // 获取行历史
    getLineHistory: (
      repoPath: string,
      filePath: string,
      startLine: number,
      endLine: number,
      options?: { limit?: number }
    ): Promise<Array<{
      hash: string
      shortHash: string
      author: string
      authorEmail: string
      date: string
      message: string
    }>> =>
      ipcRenderer.invoke('git:getLineHistory', repoPath, filePath, startLine, endLine, options),

    // 获取指定 commit 的文件内容
    getFileAtCommit: (repoPath: string, filePath: string, commitHash: string): Promise<string> =>
      ipcRenderer.invoke('git:getFileAtCommit', repoPath, filePath, commitHash),

    // 比较两个 commit
    diffCommits: (
      repoPath: string,
      fromCommit: string,
      toCommit: string,
      options?: { path?: string }
    ): Promise<string> =>
      ipcRenderer.invoke('git:diffCommits', repoPath, fromCommit, toCommit, options),

    // ============ Git Graph 扩展 ============

    // 获取 Graph 数据
    getGraph: (
      repoPath: string,
      options?: {
        limit?: number
        skip?: number
        branches?: string[]
        includeRemotes?: boolean
        search?: string
        author?: string
        since?: Date
        until?: Date
        path?: string
      }
    ): Promise<{
      commits: Array<{
        hash: string
        shortHash: string
        parents: string[]
        author: { name: string; email: string; date: string }
        committer: { name: string; email: string; date: string }
        message: string
        refs: string[]
      }>
      branches: Array<{
        name: string
        type: 'branch' | 'remote-branch' | 'tag' | 'head'
        commitHash: string
        isHead?: boolean
        upstream?: string
        ahead?: number
        behind?: number
      }>
      tags: Array<{ name: string; hash: string }>
      currentBranch: string
      headCommit: string
    }> =>
      ipcRenderer.invoke('git:getGraph', repoPath, options),

    // 获取所有 refs
    getRefs: (repoPath: string): Promise<Array<{
      name: string
      type: 'branch' | 'remote-branch' | 'tag' | 'head'
      commitHash: string
      isHead?: boolean
      upstream?: string
      ahead?: number
      behind?: number
    }>> =>
      ipcRenderer.invoke('git:getRefs', repoPath),

    // 获取所有 tags
    getTags: (repoPath: string): Promise<Array<{
      name: string
      hash: string
      date?: string
      message?: string
    }>> =>
      ipcRenderer.invoke('git:getTags', repoPath),

    // Cherry-pick
    cherryPick: (
      repoPath: string,
      commitHash: string,
      options?: { noCommit?: boolean; recordOrigin?: boolean }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:cherryPick', repoPath, commitHash, options),

    // Revert
    revert: (
      repoPath: string,
      commitHash: string,
      options?: { noCommit?: boolean; parentNumber?: number }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:revert', repoPath, commitHash, options),

    // 创建 tag
    createTag: (
      repoPath: string,
      name: string,
      options?: { target?: string; message?: string; sign?: boolean }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:createTag', repoPath, name, options),

    // 删除 tag
    deleteTag: (repoPath: string, name: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:deleteTag', repoPath, name),

    // Reset 操作
    reset: (
      repoPath: string,
      target: string,
      mode: 'soft' | 'mixed' | 'hard'
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:reset', repoPath, target, mode),

    // Merge 操作
    merge: (
      repoPath: string,
      branch: string,
      options?: { message?: string; noFastForward?: boolean; squash?: boolean }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:merge', repoPath, branch, options),

    // 获取 commit 的变更文件列表
    getCommitFiles: (repoPath: string, commitHash: string): Promise<Array<{
      path: string
      oldPath?: string
      status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
    }>> =>
      ipcRenderer.invoke('git:getCommitFiles', repoPath, commitHash),

    // 获取 commit 统计
    getCommitStats: (repoPath: string, commitHash: string): Promise<{
      additions: number
      deletions: number
      filesChanged: number
    }> =>
      ipcRenderer.invoke('git:getCommitStats', repoPath, commitHash),

    // ============ Merge Conflict Resolution ============

    // 获取合并状态
    getMergeStatus: (repoPath: string): Promise<{
      inMerge: boolean
      mergeHead?: string
      mergeMessage?: string
      conflictCount: number
      isRebaseConflict?: boolean
    }> =>
      ipcRenderer.invoke('git:getMergeStatus', repoPath),

    // 检查是否有冲突
    hasConflicts: (repoPath: string): Promise<boolean> =>
      ipcRenderer.invoke('git:hasConflicts', repoPath),

    // 获取冲突文件列表
    getConflictedFiles: (repoPath: string): Promise<Array<{
      path: string
      resolved: boolean
      conflictCount: number
    }>> =>
      ipcRenderer.invoke('git:getConflictedFiles', repoPath),

    // 获取冲突内容
    getConflictContent: (repoPath: string, filePath: string): Promise<{
      ours: string
      base: string
      theirs: string
      merged: string
    }> =>
      ipcRenderer.invoke('git:getConflictContent', repoPath, filePath),

    // 解决冲突
    resolveConflict: (repoPath: string, filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('git:resolveConflict', repoPath, filePath, content),

    // 中止合并
    abortMerge: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:abortMerge', repoPath),

    // 继续合并
    continueMerge: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke('git:continueMerge', repoPath),

    // ============ Interactive Rebase ============

    // 获取 rebase 状态
    getRebaseStatus: (repoPath: string): Promise<{
      inProgress: boolean
      currentStep: number
      totalSteps: number
      currentCommit?: string
      onto?: string
      originalBranch?: string
      hasConflicts: boolean
    }> =>
      ipcRenderer.invoke('git:getRebaseStatus', repoPath),

    // 获取可 rebase 的提交列表
    getCommitsForRebase: (repoPath: string, onto: string): Promise<Array<{
      hash: string
      shortHash: string
      message: string
      action: string
      author: string
      authorEmail: string
      date: string
    }>> =>
      ipcRenderer.invoke('git:getCommitsForRebase', repoPath, onto),

    // 开始交互式 rebase
    rebaseInteractiveStart: (repoPath: string, options: {
      onto: string
      actions: Array<{ hash: string; action: string; message?: string }>
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:rebaseInteractiveStart', repoPath, options),

    // 继续 rebase
    rebaseContinue: (repoPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:rebaseContinue', repoPath),

    // 跳过当前提交
    rebaseSkip: (repoPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:rebaseSkip', repoPath),

    // 中止 rebase
    rebaseAbort: (repoPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('git:rebaseAbort', repoPath),

    // ============ Cherry-pick Multiple ============

    // 批量 cherry-pick
    cherryPickMultiple: (
      repoPath: string,
      commitHashes: string[],
      options?: { noCommit?: boolean; recordOrigin?: boolean }
    ): Promise<{ success: boolean; error?: string; conflictAt?: string }> =>
      ipcRenderer.invoke('git:cherryPickMultiple', repoPath, commitHashes, options),

    // Cherry-pick 预览
    cherryPickPreview: (repoPath: string, commitHash: string): Promise<{
      files: Array<{
        path: string
        oldPath?: string
        status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
      }>
      stats: { additions: number; deletions: number; filesChanged: number }
    }> =>
      ipcRenderer.invoke('git:cherryPickPreview', repoPath, commitHash),

    // ============ Reflog ============

    // 获取 reflog 条目
    getReflog: (repoPath: string, limit?: number): Promise<Array<{
      index: number
      hash: string
      shortHash: string
      operationType: string
      action: string
      message: string
      date: string
      relativeDate: string
      author: string
      authorEmail: string
      previousHash?: string
      isOrphaned?: boolean
      branch?: string
    }>> =>
      ipcRenderer.invoke('git:getReflog', repoPath, limit),

    // 获取特定 ref 的 reflog
    getReflogForRef: (repoPath: string, ref: string, limit?: number): Promise<Array<{
      index: number
      hash: string
      shortHash: string
      operationType: string
      action: string
      message: string
      date: string
      relativeDate: string
      author: string
      authorEmail: string
      previousHash?: string
      isOrphaned?: boolean
      branch?: string
    }>> =>
      ipcRenderer.invoke('git:getReflogForRef', repoPath, ref, limit)
  },

  // ============ 终端操作 ============
  terminal: {
    // 创建终端
    create: (id: string, options?: TerminalCreateOptions): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('terminal:create', id, options),

    // 写入数据
    write: (id: string, data: string): void =>
      ipcRenderer.send('terminal:write', id, data),

    // 调整大小
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('terminal:resize', id, cols, rows),

    // 销毁终端
    destroy: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('terminal:destroy', id),

    // 获取终端信息
    info: (id: string): Promise<{ cols: number; rows: number } | null> =>
      ipcRenderer.invoke('terminal:info', id),

    // 获取所有终端 ID
    list: (): Promise<string[]> =>
      ipcRenderer.invoke('terminal:list'),

    // 监听终端数据
    onData: (callback: (event: TerminalDataEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalDataEvent) => callback(event)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },

    // 监听终端退出
    onExit: (callback: (event: TerminalExitEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: TerminalExitEvent) => callback(event)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    }
  },

  // ============ GitHub Actions ============
  github: {
    // OAuth Device Flow
    deviceFlowStart: (clientId: string, scopes?: string[]): Promise<{
      deviceCode: string
      userCode: string
      verificationUri: string
      verificationUriComplete?: string
      expiresIn: number
      interval: number
    }> => ipcRenderer.invoke('github:deviceFlowStart', clientId, scopes),

    deviceFlowPoll: (clientId: string, deviceCode: string): Promise<{
      status: 'authorized' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error'
      accessToken?: string
      tokenType?: string
      scope?: string
      error?: string
      errorDescription?: string
      errorUri?: string
    }> => ipcRenderer.invoke('github:deviceFlowPoll', clientId, deviceCode),

    // 获取仓库信息
    getRepoInfo: (repoPath: string): Promise<{ owner: string; repo: string } | null> =>
      ipcRenderer.invoke('github:getRepoInfo', repoPath),

    // 获取 workflows
    getWorkflows: (repoPath: string, token?: string): Promise<any[]> =>
      ipcRenderer.invoke('github:getWorkflows', repoPath, token),

    // 获取 workflow runs
    getWorkflowRuns: (
      repoPath: string,
      token?: string,
      workflowId?: number,
      perPage?: number
    ): Promise<any[]> =>
      ipcRenderer.invoke('github:getWorkflowRuns', repoPath, token, workflowId, perPage),

    // 获取 workflow jobs
    getWorkflowJobs: (repoPath: string, runId: number, token?: string): Promise<any[]> =>
      ipcRenderer.invoke('github:getWorkflowJobs', repoPath, runId, token),

    // 触发 workflow
    triggerWorkflow: (
      repoPath: string,
      workflowId: number | string,
      ref?: string,
      inputs?: Record<string, string>,
      token?: string
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('github:triggerWorkflow', repoPath, workflowId, ref, inputs, token),

    // 取消 workflow run
    cancelWorkflowRun: (repoPath: string, runId: number, token?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('github:cancelWorkflowRun', repoPath, runId, token),

    // 重新运行 workflow
    rerunWorkflow: (repoPath: string, runId: number, token?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('github:rerunWorkflow', repoPath, runId, token),

    // 获取日志 URL
    getWorkflowRunLogsUrl: (
      repoPath: string,
      runId: number,
      token?: string
    ): Promise<{ url: string; token: string }> =>
      ipcRenderer.invoke('github:getWorkflowRunLogsUrl', repoPath, runId, token),

    // ============ Pull Requests ============
    listPRs: (
      repoPath: string,
      token?: string,
      state?: 'open' | 'closed' | 'all',
      perPage?: number
    ): Promise<any[]> =>
      ipcRenderer.invoke('github:listPRs', repoPath, token, state, perPage),

    createPR: (
      repoPath: string,
      title: string,
      body: string,
      head: string,
      base: string,
      token?: string
    ): Promise<any> =>
      ipcRenderer.invoke('github:createPR', repoPath, title, body, head, base, token),

    // ============ Issues ============
    listIssues: (
      repoPath: string,
      token?: string,
      state?: 'open' | 'closed' | 'all',
      perPage?: number
    ): Promise<any[]> =>
      ipcRenderer.invoke('github:listIssues', repoPath, token, state, perPage),

    createIssue: (
      repoPath: string,
      title: string,
      body: string,
      labels?: string[],
      token?: string
    ): Promise<any> =>
      ipcRenderer.invoke('github:createIssue', repoPath, title, body, labels, token)
  },

  // ============ GitLab CI ============
  gitlab: {
    // 获取项目信息
    getProjectInfo: (repoPath: string, baseUrl: string): Promise<{ projectPath: string } | null> =>
      ipcRenderer.invoke('gitlab:getProjectInfo', repoPath, baseUrl),

    // 获取 pipelines
    getPipelines: (
      repoPath: string,
      baseUrl: string,
      token?: string,
      perPage?: number
    ): Promise<any[]> =>
      ipcRenderer.invoke('gitlab:getPipelines', repoPath, baseUrl, token, perPage),

    // 获取 pipeline jobs
    getPipelineJobs: (
      repoPath: string,
      baseUrl: string,
      pipelineId: number,
      token?: string
    ): Promise<any[]> =>
      ipcRenderer.invoke('gitlab:getPipelineJobs', repoPath, baseUrl, pipelineId, token),

    // 触发 pipeline
    triggerPipeline: (
      repoPath: string,
      baseUrl: string,
      ref?: string,
      token?: string,
      variables?: Array<{ key: string; value: string }>
    ): Promise<any> =>
      ipcRenderer.invoke('gitlab:triggerPipeline', repoPath, baseUrl, ref, token, variables),

    // 取消 pipeline
    cancelPipeline: (
      repoPath: string,
      baseUrl: string,
      pipelineId: number,
      token?: string
    ): Promise<any> =>
      ipcRenderer.invoke('gitlab:cancelPipeline', repoPath, baseUrl, pipelineId, token),

    // 重试 pipeline
    retryPipeline: (
      repoPath: string,
      baseUrl: string,
      pipelineId: number,
      token?: string
    ): Promise<any> =>
      ipcRenderer.invoke('gitlab:retryPipeline', repoPath, baseUrl, pipelineId, token),

    // 获取 job 日志
    getJobLog: (
      repoPath: string,
      baseUrl: string,
      jobId: number,
      token?: string
    ): Promise<string> =>
      ipcRenderer.invoke('gitlab:getJobLog', repoPath, baseUrl, jobId, token)
  },

  // ============ Commit Analysis ============
  commitAnalysis: {
    // 分析指定提交
    analyze: (repoPath: string, commitHash: string): Promise<CommitAnalysis> =>
      ipcRenderer.invoke('commitAnalysis:analyze', repoPath, commitHash),

    // 分析暂存区变更
    analyzeStaged: (repoPath: string): Promise<CommitAnalysis> =>
      ipcRenderer.invoke('commitAnalysis:analyzeStaged', repoPath),

    // 获取提交差异
    getCommitDiff: (repoPath: string, commitHash: string): Promise<string> =>
      ipcRenderer.invoke('commitAnalysis:getCommitDiff', repoPath, commitHash),

    // 获取指定提交时的文件内容
    getFileAtCommit: (repoPath: string, commitHash: string, filePath: string): Promise<string> =>
      ipcRenderer.invoke('commitAnalysis:getFileAtCommit', repoPath, commitHash, filePath),

    // 分析提交范围
    analyzeRange: (repoPath: string, fromHash: string, toHash: string): Promise<CommitAnalysis[]> =>
      ipcRenderer.invoke('commitAnalysis:analyzeRange', repoPath, fromHash, toHash)
  },

  // ============ 代码智能 ============
  intelligence: {
    // ============ 补全 ============
    getCompletions: (
      filePath: string,
      position: Position,
      triggerCharacter?: string
    ): Promise<CompletionResult> =>
      ipcRenderer.invoke('intelligence:completions', filePath, position, triggerCharacter),

    // ============ 定义跳转 ============
    getDefinitions: (
      filePath: string,
      position: Position
    ): Promise<DefinitionLocation[]> =>
      ipcRenderer.invoke('intelligence:definitions', filePath, position),

    // ============ 查找引用 ============
    getReferences: (
      filePath: string,
      position: Position,
      includeDeclaration?: boolean
    ): Promise<ReferenceLocation[]> =>
      ipcRenderer.invoke('intelligence:references', filePath, position, includeDeclaration),

    // ============ 诊断信息 ============
    getDiagnostics: (filePath: string): Promise<Diagnostic[]> =>
      ipcRenderer.invoke('intelligence:diagnostics', filePath),

    // ============ 悬停信息 ============
    getHover: (
      filePath: string,
      position: Position
    ): Promise<HoverInfo | null> =>
      ipcRenderer.invoke('intelligence:hover', filePath, position),

    // ============ 签名帮助 ============
    getSignatureHelp: (
      filePath: string,
      position: Position,
      triggerCharacter?: string
    ): Promise<SignatureHelp | null> =>
      ipcRenderer.invoke('intelligence:signatureHelp', filePath, position, triggerCharacter),

    // ============ 内联提示 ============
    getInlayHints: (
      filePath: string,
      range: Range
    ): Promise<InlayHint[]> =>
      ipcRenderer.invoke('intelligence:inlayHints', filePath, range),

    // ============ 重命名 ============
    prepareRename: (
      filePath: string,
      position: Position
    ): Promise<PrepareRenameResult | null> =>
      ipcRenderer.invoke('intelligence:prepareRename', filePath, position),

    rename: (
      filePath: string,
      position: Position,
      newName: string
    ): Promise<WorkspaceEdit | null> =>
      ipcRenderer.invoke('intelligence:rename', filePath, position, newName),

    // ============ 重构 ============
    getRefactorActions: (
      filePath: string,
      range: Range
    ): Promise<RefactorAction[]> =>
      ipcRenderer.invoke('intelligence:refactorActions', filePath, range),

    applyRefactor: (
      filePath: string,
      range: Range,
      actionKind: string
    ): Promise<WorkspaceEdit | null> =>
      ipcRenderer.invoke('intelligence:applyRefactor', filePath, range, actionKind),

    // ============ 文件同步 ============
    syncFile: (filePath: string, content: string, version: number): void =>
      ipcRenderer.send('intelligence:syncFile', filePath, content, version),

    closeFile: (filePath: string): void =>
      ipcRenderer.send('intelligence:closeFile', filePath),

    // ============ 项目管理 ============
    openProject: (rootPath: string): Promise<void> =>
      ipcRenderer.invoke('intelligence:openProject', rootPath),

    closeProject: (rootPath: string): Promise<void> =>
      ipcRenderer.invoke('intelligence:closeProject', rootPath),

    // ============ 语言服务器状态 ============
    getServerStatus: (language: string): Promise<LanguageServerStatus> =>
      ipcRenderer.invoke('intelligence:serverStatus', language),

    onServerStatusChange: (callback: (status: LanguageServerStatus) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: LanguageServerStatus) =>
        callback(status)
      ipcRenderer.on('intelligence:serverStatusChange', handler)
      return () => ipcRenderer.removeListener('intelligence:serverStatusChange', handler)
    },

    // ============ 索引进度 ============
    onIndexingProgress: (callback: (progress: IndexingProgress) => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: IndexingProgress) =>
        callback(progress)
      ipcRenderer.on('intelligence:indexingProgress', handler)
      return () => ipcRenderer.removeListener('intelligence:indexingProgress', handler)
    },

    // ============ 分析状态 ============
    onAnalysisStatus: (callback: (status: AnalysisStatus) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: AnalysisStatus) =>
        callback(status)
      ipcRenderer.on('intelligence:analysisStatus', handler)
      return () => ipcRenderer.removeListener('intelligence:analysisStatus', handler)
    },

    // ============ 服务状态 ============
    getServiceStatus: (): Promise<LSPServiceStatus> =>
      ipcRenderer.invoke('intelligence:serviceStatus'),

    onServiceStatusChange: (callback: (status: LSPServiceStatus) => void) => {
      const handler = (_: Electron.IpcRendererEvent, status: LSPServiceStatus) =>
        callback(status)
      ipcRenderer.on('intelligence:serviceStatusChange', handler)
      return () => ipcRenderer.removeListener('intelligence:serviceStatusChange', handler)
    },

    // ============ LSP 诊断 ============
    onDiagnostics: (callback: (params: { filePath: string; diagnostics: Diagnostic[] }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, params: { filePath: string; diagnostics: Diagnostic[] }) =>
        callback(params)
      ipcRenderer.on('lsp:diagnostics', handler)
      return () => ipcRenderer.removeListener('lsp:diagnostics', handler)
    },

    // ============ LSP 服务器状态 ============
    onLSPServerStatus: (callback: (event: { languageId: string; status: string; message?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: { languageId: string; status: string; message?: string }) =>
        callback(event)
      ipcRenderer.on('lsp:serverStatus', handler)
      return () => ipcRenderer.removeListener('lsp:serverStatus', handler)
    },

    // ============ 智能模式切换 ============
    setMode: (mode: 'basic' | 'smart'): Promise<void> =>
      ipcRenderer.invoke('intelligence:setMode', mode),

    // ============ 项目分析 ============
    analyzeProject: (): Promise<{
      fileCount: number
      totalSize: number
      estimatedMemory: number
      hasComplexDependencies: boolean
      languages: string[]
    }> =>
      ipcRenderer.invoke('intelligence:analyzeProject'),

    // ============ 项目设置 ============
    getProjectSettings: (projectRoot: string): Promise<{
      preferredMode?: 'basic' | 'smart'
      autoSelect?: boolean
      smartModeThreshold?: {
        maxFiles?: number
        maxMemoryMB?: number
      }
      autoDowngrade?: boolean
    }> =>
      ipcRenderer.invoke('intelligence:getProjectSettings', projectRoot),

    saveProjectSettings: (projectRoot: string, settings: {
      preferredMode?: 'basic' | 'smart'
      autoSelect?: boolean
      smartModeThreshold?: {
        maxFiles?: number
        maxMemoryMB?: number
      }
      autoDowngrade?: boolean
    }): Promise<void> =>
      ipcRenderer.invoke('intelligence:saveProjectSettings', projectRoot, settings),

    loadMergedSettings: (projectRoot: string, globalSettings: {
      preferredMode?: 'basic' | 'smart'
      autoSelect?: boolean
      smartModeThreshold?: {
        maxFiles?: number
        maxMemoryMB?: number
      }
      autoDowngrade?: boolean
    }): Promise<{
      preferredMode?: 'basic' | 'smart'
      autoSelect?: boolean
      smartModeThreshold?: {
        maxFiles?: number
        maxMemoryMB?: number
      }
      autoDowngrade?: boolean
    }> =>
      ipcRenderer.invoke('intelligence:loadMergedSettings', projectRoot, globalSettings)
  },

  // ============ 调试操作 ============
  debug: {
    // 会话管理
    startSession: (config: DebugConfig, workspaceFolder: string): Promise<{ success: boolean; session?: DebugSession; error?: string }> =>
      ipcRenderer.invoke('debug:startSession', config, workspaceFolder),

    stopSession: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:stopSession', sessionId),

    restartSession: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:restartSession', sessionId),

    getSessions: (): Promise<DebugSession[]> =>
      ipcRenderer.invoke('debug:getSessions'),

    getActiveSession: (): Promise<DebugSession | undefined> =>
      ipcRenderer.invoke('debug:getActiveSession'),

    setActiveSession: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('debug:setActiveSession', sessionId),

    // 执行控制
    continue: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:continue', sessionId),

    pause: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:pause', sessionId),

    stepOver: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:stepOver', sessionId),

    stepInto: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:stepInto', sessionId),

    stepOut: (sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:stepOut', sessionId),

    restartFrame: (frameId: number, sessionId?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:restartFrame', frameId, sessionId),

    // 断点管理
    setBreakpoint: (
      filePath: string,
      line: number,
      options?: { condition?: string; hitCondition?: string; logMessage?: string }
    ): Promise<{ success: boolean; breakpoint?: BreakpointInfo; error?: string }> =>
      ipcRenderer.invoke('debug:setBreakpoint', filePath, line, options),

    removeBreakpoint: (breakpointId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:removeBreakpoint', breakpointId),

    toggleBreakpoint: (breakpointId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:toggleBreakpoint', breakpointId),

    toggleBreakpointAtLine: (filePath: string, line: number): Promise<{ success: boolean; breakpoint?: BreakpointInfo | null; error?: string }> =>
      ipcRenderer.invoke('debug:toggleBreakpointAtLine', filePath, line),

    getAllBreakpoints: (): Promise<BreakpointInfo[]> =>
      ipcRenderer.invoke('debug:getAllBreakpoints'),

    getBreakpointsForFile: (filePath: string): Promise<BreakpointInfo[]> =>
      ipcRenderer.invoke('debug:getBreakpointsForFile', filePath),

    // 变量和栈帧
    getThreads: (sessionId?: string): Promise<{ success: boolean; threads?: DebugThread[]; error?: string }> =>
      ipcRenderer.invoke('debug:getThreads', sessionId),

    getStackTrace: (threadId: number, sessionId?: string): Promise<{ success: boolean; frames?: DebugStackFrame[]; error?: string }> =>
      ipcRenderer.invoke('debug:getStackTrace', threadId, sessionId),

    getScopes: (frameId: number, sessionId?: string): Promise<{ success: boolean; scopes?: DebugScope[]; error?: string }> =>
      ipcRenderer.invoke('debug:getScopes', frameId, sessionId),

    getVariables: (variablesReference: number, sessionId?: string): Promise<{ success: boolean; variables?: DebugVariable[]; error?: string }> =>
      ipcRenderer.invoke('debug:getVariables', variablesReference, sessionId),

    setVariable: (
      variablesReference: number,
      name: string,
      value: string,
      sessionId?: string
    ): Promise<{ success: boolean; variable?: DebugVariable; error?: string }> =>
      ipcRenderer.invoke('debug:setVariable', variablesReference, name, value, sessionId),

    evaluate: (
      expression: string,
      frameId?: number,
      context?: 'watch' | 'repl' | 'hover',
      sessionId?: string
    ): Promise<{ success: boolean; result?: EvaluateResult; error?: string }> =>
      ipcRenderer.invoke('debug:evaluate', expression, frameId, context, sessionId),

    selectFrame: (frameId: number, sessionId?: string): Promise<void> =>
      ipcRenderer.invoke('debug:selectFrame', frameId, sessionId),

    // 监视表达式
    addWatch: (expression: string): Promise<WatchExpression> =>
      ipcRenderer.invoke('debug:addWatch', expression),

    removeWatch: (watchId: string): Promise<void> =>
      ipcRenderer.invoke('debug:removeWatch', watchId),

    refreshWatch: (watchId: string): Promise<void> =>
      ipcRenderer.invoke('debug:refreshWatch', watchId),

    refreshAllWatches: (): Promise<void> =>
      ipcRenderer.invoke('debug:refreshAllWatches'),

    getWatchExpressions: (): Promise<WatchExpression[]> =>
      ipcRenderer.invoke('debug:getWatchExpressions'),

    // 调试控制台
    executeInConsole: (command: string, sessionId?: string): Promise<{ success: boolean; result?: EvaluateResult; error?: string }> =>
      ipcRenderer.invoke('debug:executeInConsole', command, sessionId),

    // 启动配置
    readLaunchConfig: (workspaceFolder: string): Promise<{ success: boolean; config?: LaunchConfigFile; error?: string }> =>
      ipcRenderer.invoke('debug:readLaunchConfig', workspaceFolder),

    writeLaunchConfig: (workspaceFolder: string, config: LaunchConfigFile): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('debug:writeLaunchConfig', workspaceFolder, config),

    getDefaultLaunchConfig: (type: string, workspaceFolder: string): Promise<DebugConfig> =>
      ipcRenderer.invoke('debug:getDefaultLaunchConfig', type, workspaceFolder),

    // 适配器管理
    getAvailableAdapters: (): Promise<{ success: boolean; adapters?: AdapterInfo[]; error?: string }> =>
      ipcRenderer.invoke('debug:getAvailableAdapters'),

    getInstalledAdapters: (): Promise<{ success: boolean; adapters?: AdapterInfo[]; error?: string }> =>
      ipcRenderer.invoke('debug:getInstalledAdapters'),

    detectDebuggers: (workspaceFolder: string): Promise<{ success: boolean; debuggers?: DetectedDebugger[]; error?: string }> =>
      ipcRenderer.invoke('debug:detectDebuggers', workspaceFolder),

    // 活动文件管理
    setActiveFile: (filePath: string | null): Promise<void> =>
      ipcRenderer.invoke('debug:setActiveFile', filePath),

    getActiveFile: (): Promise<string | null> =>
      ipcRenderer.invoke('debug:getActiveFile'),

    // 事件监听
    onSessionCreated: (callback: (session: DebugSession) => void) => {
      const handler = (_: Electron.IpcRendererEvent, session: DebugSession) => callback(session)
      ipcRenderer.on('debug:sessionCreated', handler)
      return () => ipcRenderer.removeListener('debug:sessionCreated', handler)
    },

    onSessionStateChanged: (callback: (data: { sessionId: string; state: SessionState }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; state: SessionState }) => callback(data)
      ipcRenderer.on('debug:sessionStateChanged', handler)
      return () => ipcRenderer.removeListener('debug:sessionStateChanged', handler)
    },

    onSessionTerminated: (callback: (sessionId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId)
      ipcRenderer.on('debug:sessionTerminated', handler)
      return () => ipcRenderer.removeListener('debug:sessionTerminated', handler)
    },

    onStopped: (callback: (data: { sessionId: string; reason: string; threadId: number; allThreadsStopped?: boolean }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; reason: string; threadId: number; allThreadsStopped?: boolean }) => callback(data)
      ipcRenderer.on('debug:stopped', handler)
      return () => ipcRenderer.removeListener('debug:stopped', handler)
    },

    onContinued: (callback: (data: { sessionId: string; threadId: number; allThreadsContinued?: boolean }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; threadId: number; allThreadsContinued?: boolean }) => callback(data)
      ipcRenderer.on('debug:continued', handler)
      return () => ipcRenderer.removeListener('debug:continued', handler)
    },

    onBreakpointChanged: (callback: (breakpoint: BreakpointInfo) => void) => {
      const handler = (_: Electron.IpcRendererEvent, breakpoint: BreakpointInfo) => callback(breakpoint)
      ipcRenderer.on('debug:breakpointChanged', handler)
      return () => ipcRenderer.removeListener('debug:breakpointChanged', handler)
    },

    onBreakpointValidated: (callback: (breakpoint: BreakpointInfo) => void) => {
      const handler = (_: Electron.IpcRendererEvent, breakpoint: BreakpointInfo) => callback(breakpoint)
      ipcRenderer.on('debug:breakpointValidated', handler)
      return () => ipcRenderer.removeListener('debug:breakpointValidated', handler)
    },

    onBreakpointRemoved: (callback: (breakpointId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, breakpointId: string) => callback(breakpointId)
      ipcRenderer.on('debug:breakpointRemoved', handler)
      return () => ipcRenderer.removeListener('debug:breakpointRemoved', handler)
    },

    onThreadsUpdated: (callback: (data: { sessionId: string; threads: DebugThread[] }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; threads: DebugThread[] }) => callback(data)
      ipcRenderer.on('debug:threadsUpdated', handler)
      return () => ipcRenderer.removeListener('debug:threadsUpdated', handler)
    },

    onFrameSelected: (callback: (data: { sessionId: string; frameId: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; frameId: number }) => callback(data)
      ipcRenderer.on('debug:frameSelected', handler)
      return () => ipcRenderer.removeListener('debug:frameSelected', handler)
    },

    onConsoleMessage: (callback: (data: { sessionId: string; message: DebugConsoleMessage }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; message: DebugConsoleMessage }) => callback(data)
      ipcRenderer.on('debug:consoleMessage', handler)
      return () => ipcRenderer.removeListener('debug:consoleMessage', handler)
    },

    onWatchAdded: (callback: (watch: WatchExpression) => void) => {
      const handler = (_: Electron.IpcRendererEvent, watch: WatchExpression) => callback(watch)
      ipcRenderer.on('debug:watchAdded', handler)
      return () => ipcRenderer.removeListener('debug:watchAdded', handler)
    },

    onWatchRemoved: (callback: (watchId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, watchId: string) => callback(watchId)
      ipcRenderer.on('debug:watchRemoved', handler)
      return () => ipcRenderer.removeListener('debug:watchRemoved', handler)
    },

    onWatchUpdated: (callback: (watch: WatchExpression) => void) => {
      const handler = (_: Electron.IpcRendererEvent, watch: WatchExpression) => callback(watch)
      ipcRenderer.on('debug:watchUpdated', handler)
      return () => ipcRenderer.removeListener('debug:watchUpdated', handler)
    },

    onActiveSessionChanged: (callback: (sessionId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId)
      ipcRenderer.on('debug:activeSessionChanged', handler)
      return () => ipcRenderer.removeListener('debug:activeSessionChanged', handler)
    }
  },

  // ============ 远程开发 ============
  remote: {
    // 连接管理
    connect: (config: SSHConnectionConfig): Promise<RemoteOperationResult<RemoteConnection>> =>
      ipcRenderer.invoke('remote:connect', config),

    disconnect: (connectionId: string): Promise<RemoteOperationResult> =>
      ipcRenderer.invoke('remote:disconnect', connectionId),

    getConnection: (connectionId: string): Promise<RemoteConnection | undefined> =>
      ipcRenderer.invoke('remote:getConnection', connectionId),

    listConnections: (): Promise<RemoteConnection[]> =>
      ipcRenderer.invoke('remote:listConnections'),

    testConnection: (config: SSHConnectionConfig): Promise<RemoteOperationResult> =>
      ipcRenderer.invoke('remote:testConnection', config),

    // 保存的连接
    saveConnection: (config: SSHConnectionConfig): Promise<RemoteOperationResult<SSHConnectionConfig>> =>
      ipcRenderer.invoke('remote:saveConnection', config),

    deleteSavedConnection: (connectionId: string): Promise<RemoteOperationResult> =>
      ipcRenderer.invoke('remote:deleteSavedConnection', connectionId),

    getSavedConnections: (): Promise<SSHConnectionConfig[]> =>
      ipcRenderer.invoke('remote:getSavedConnections'),

    // 文件系统操作
    fs: {
      readDirectory: (connectionId: string, dirPath: string, recursive?: boolean): Promise<RemoteOperationResult<RemoteFileNode[]>> =>
        ipcRenderer.invoke('remote:fs:readDirectory', connectionId, dirPath, recursive),

      readFile: (connectionId: string, filePath: string): Promise<RemoteOperationResult<string>> =>
        ipcRenderer.invoke('remote:fs:readFile', connectionId, filePath),

      writeFile: (connectionId: string, filePath: string, content: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:fs:writeFile', connectionId, filePath, content),

      createFile: (connectionId: string, filePath: string, content?: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:fs:createFile', connectionId, filePath, content),

      createDirectory: (connectionId: string, dirPath: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:fs:createDirectory', connectionId, dirPath),

      deleteItem: (connectionId: string, itemPath: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:fs:deleteItem', connectionId, itemPath),

      renameItem: (connectionId: string, oldPath: string, newPath: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:fs:renameItem', connectionId, oldPath, newPath),

      exists: (connectionId: string, itemPath: string): Promise<boolean> =>
        ipcRenderer.invoke('remote:fs:exists', connectionId, itemPath),

      stat: (connectionId: string, itemPath: string): Promise<RemoteOperationResult<RemoteFileStat>> =>
        ipcRenderer.invoke('remote:fs:stat', connectionId, itemPath)
    },

    // 终端操作
    terminal: {
      create: (connectionId: string, terminalId: string, options?: RemoteTerminalOptions): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:terminal:create', connectionId, terminalId, options),

      write: (connectionId: string, terminalId: string, data: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:terminal:write', connectionId, terminalId, data),

      resize: (connectionId: string, terminalId: string, cols: number, rows: number): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:terminal:resize', connectionId, terminalId, cols, rows),

      destroy: (connectionId: string, terminalId: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:terminal:destroy', connectionId, terminalId)
    },

    // 端口转发
    port: {
      forward: (connectionId: string, config: { localPort: number; remoteHost: string; remotePort: number }): Promise<RemoteOperationResult<{ id: string; connectionId: string; config: { localPort: number; remoteHost: string; remotePort: number }; state: string; error?: string }>> =>
        ipcRenderer.invoke('remote:port:forward', connectionId, config),

      unforward: (forwardId: string): Promise<RemoteOperationResult> =>
        ipcRenderer.invoke('remote:port:unforward', forwardId),

      list: (connectionId: string): Promise<Array<{ id: string; connectionId: string; config: { localPort: number; remoteHost: string; remotePort: number }; state: string; error?: string }>> =>
        ipcRenderer.invoke('remote:port:list', connectionId)
    },

    // 文件监视
    watch: (connectionId: string, remotePath: string): Promise<RemoteOperationResult<string>> =>
      ipcRenderer.invoke('remote:watch', connectionId, remotePath),

    unwatch: (watchId: string): Promise<RemoteOperationResult> =>
      ipcRenderer.invoke('remote:unwatch', watchId),

    // 事件监听
    onConnectionStateChanged: (callback: (data: { connectionId: string; state: ConnectionState; error?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { connectionId: string; state: ConnectionState; error?: string }) => callback(data)
      ipcRenderer.on('remote:connectionStateChanged', handler)
      return () => ipcRenderer.removeListener('remote:connectionStateChanged', handler)
    },

    onTerminalData: (callback: (data: { connectionId: string; terminalId: string; data: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { connectionId: string; terminalId: string; data: string }) => callback(data)
      ipcRenderer.on('remote:terminal:data', handler)
      return () => ipcRenderer.removeListener('remote:terminal:data', handler)
    },

    onTerminalExit: (callback: (data: { connectionId: string; terminalId: string; exitCode?: number }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { connectionId: string; terminalId: string; exitCode?: number }) => callback(data)
      ipcRenderer.on('remote:terminal:exit', handler)
      return () => ipcRenderer.removeListener('remote:terminal:exit', handler)
    },

    onPortForwardChanged: (callback: (data: { forwardId: string; state: string; error?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { forwardId: string; state: string; error?: string }) => callback(data)
      ipcRenderer.on('remote:port:changed', handler)
      return () => ipcRenderer.removeListener('remote:port:changed', handler)
    },

    onFileChanged: (callback: (data: { connectionId: string; type: 'created' | 'changed' | 'deleted'; path: string; isDirectory: boolean }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { connectionId: string; type: 'created' | 'changed' | 'deleted'; path: string; isDirectory: boolean }) => callback(data)
      ipcRenderer.on('remote:fileChanged', handler)
      return () => ipcRenderer.removeListener('remote:fileChanged', handler)
    }
  },

  // ============ 自动更新 ============
  updater: {
    // 检查更新
    check: (): Promise<{ success: boolean; result?: unknown; error?: string }> =>
      ipcRenderer.invoke('updater:check'),

    // 下载更新
    download: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('updater:download'),

    // 安装更新（退出并安装）
    install: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('updater:install'),

    // 获取当前状态
    getStatus: (): Promise<UpdateState> =>
      ipcRenderer.invoke('updater:getStatus'),

    // 设置自动下载
    setAutoDownload: (enabled: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('updater:setAutoDownload', enabled),

    // 监听更新状态
    onStatus: (callback: (state: UpdateState) => void) => {
      const handler = (_: Electron.IpcRendererEvent, state: UpdateState) => callback(state)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  },

  // ============ LSP (Basic Mode) ============
  lsp: {
    // 服务器管理
    start: (languageId: string): Promise<boolean> =>
      ipcRenderer.invoke('lsp:start', languageId),

    stop: (languageId: string): Promise<void> =>
      ipcRenderer.invoke('lsp:stop', languageId),

    stopAll: (): Promise<void> =>
      ipcRenderer.invoke('lsp:stopAll'),

    getStatus: (languageId: string): Promise<string> =>
      ipcRenderer.invoke('lsp:getStatus', languageId),

    setProjectRoot: (rootPath: string): Promise<void> =>
      ipcRenderer.invoke('lsp:setProjectRoot', rootPath),

    getLanguageId: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('lsp:getLanguageId', filePath),

    // LSP 请求/通知
    request: (languageId: string, method: string, params: unknown): Promise<unknown> =>
      ipcRenderer.invoke('lsp:request', languageId, method, params),

    notify: (languageId: string, method: string, params: unknown): Promise<void> =>
      ipcRenderer.invoke('lsp:notify', languageId, method, params),

    // 事件监听
    onDiagnostics: (callback: (data: { languageId: string; params: unknown }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { languageId: string; params: unknown }) => callback(data)
      ipcRenderer.on('lsp:diagnostics', handler)
      return () => ipcRenderer.removeListener('lsp:diagnostics', handler)
    },

    onStatus: (callback: (data: { languageId: string; status: string; message?: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { languageId: string; status: string; message?: string }) => callback(data)
      ipcRenderer.on('lsp:status', handler)
      return () => ipcRenderer.removeListener('lsp:status', handler)
    },

    onProgress: (callback: (data: { languageId: string; params: unknown }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { languageId: string; params: unknown }) => callback(data)
      ipcRenderer.on('lsp:progress', handler)
      return () => ipcRenderer.removeListener('lsp:progress', handler)
    },

    onNotification: (callback: (data: { languageId: string; method: string; params: unknown }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { languageId: string; method: string; params: unknown }) => callback(data)
      ipcRenderer.on('lsp:notification', handler)
      return () => ipcRenderer.removeListener('lsp:notification', handler)
    }
  },

  // ============ 语言守护进程 ============
  daemon: {
    // 生命周期
    start: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('daemon:start'),

    stop: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('daemon:stop'),

    isRunning: (): Promise<boolean> =>
      ipcRenderer.invoke('daemon:isRunning'),

    // 文档管理
    openDocument: (uri: string, content: string, languageId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('daemon:openDocument', uri, content, languageId),

    updateDocument: (uri: string, content: string): void =>
      ipcRenderer.send('daemon:updateDocument', uri, content),

    closeDocument: (uri: string): void =>
      ipcRenderer.send('daemon:closeDocument', uri),

    // 代码智能
    completions: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:completions', uri, line, column),

    definition: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:definition', uri, line, column),

    references: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:references', uri, line, column),

    hover: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:hover', uri, line, column),

    documentSymbols: (uri: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:documentSymbols', uri),

    searchSymbols: (query: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:searchSymbols', query),

    diagnostics: (uri: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:diagnostics', uri),

    // 重命名
    prepareRename: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:prepareRename', uri, line, column),

    rename: (uri: string, line: number, column: number, newName: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:rename', uri, line, column, newName),

    // 重构
    getRefactorActions: (
      uri: string,
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number
    ): Promise<unknown> =>
      ipcRenderer.invoke('daemon:getRefactorActions', uri, startLine, startCol, endLine, endCol),

    extractVariable: (
      uri: string,
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number,
      variableName: string
    ): Promise<unknown> =>
      ipcRenderer.invoke('daemon:extractVariable', uri, startLine, startCol, endLine, endCol, variableName),

    extractMethod: (
      uri: string,
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number,
      methodName: string
    ): Promise<unknown> =>
      ipcRenderer.invoke('daemon:extractMethod', uri, startLine, startCol, endLine, endCol, methodName),

    canSafeDelete: (
      uri: string,
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number
    ): Promise<unknown> =>
      ipcRenderer.invoke('daemon:canSafeDelete', uri, startLine, startCol, endLine, endCol),

    safeDelete: (
      uri: string,
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number
    ): Promise<unknown> =>
      ipcRenderer.invoke('daemon:safeDelete', uri, startLine, startCol, endLine, endCol),

    // 分析
    getTodoItems: (uri: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:getTodoItems', uri),

    getAllTodoItems: (): Promise<unknown> =>
      ipcRenderer.invoke('daemon:getAllTodoItems'),

    getTodoStats: (): Promise<unknown> =>
      ipcRenderer.invoke('daemon:getTodoStats'),

    getUnusedSymbols: (uri: string): Promise<unknown> =>
      ipcRenderer.invoke('daemon:getUnusedSymbols', uri),

    // 调用层级
    prepareCallHierarchy: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:prepareCallHierarchy', uri, line, column),

    incomingCalls: (item: unknown): Promise<unknown> =>
      ipcRenderer.invoke('daemon:incomingCalls', item),

    outgoingCalls: (item: unknown): Promise<unknown> =>
      ipcRenderer.invoke('daemon:outgoingCalls', item),

    // 影响分析
    impactAnalysis: (uri: string, line: number, column: number): Promise<unknown> =>
      ipcRenderer.invoke('daemon:impactAnalysis', uri, line, column),

    // 事件
    onDiagnostics: (callback: (params: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, params: unknown) => callback(params)
      ipcRenderer.on('daemon:diagnostics', handler)
      return () => ipcRenderer.removeListener('daemon:diagnostics', handler)
    }
  },

  // ============ 内存监控 ============
  memory: {
    // 启动监控
    start: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('memory:start'),

    // 停止监控
    stop: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('memory:stop'),

    // 获取当前内存使用
    getUsage: (): Promise<{
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
      heapUsedMB: number
      heapTotalMB: number
      rssMB: number
      usagePercent: number
    }> =>
      ipcRenderer.invoke('memory:getUsage'),

    // 更新配置
    updateConfig: (config: {
      interval?: number
      moderateThreshold?: number
      highThreshold?: number
      criticalThreshold?: number
      autoGC?: boolean
      autoSuggestDowngrade?: boolean
    }): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('memory:updateConfig', config),

    // 获取配置
    getConfig: (): Promise<{
      interval: number
      moderateThreshold: number
      highThreshold: number
      criticalThreshold: number
      autoGC: boolean
      autoSuggestDowngrade: boolean
    }> =>
      ipcRenderer.invoke('memory:getConfig'),

    // 手动检查
    check: (): Promise<{
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
      heapUsedMB: number
      heapTotalMB: number
      rssMB: number
      usagePercent: number
    }> =>
      ipcRenderer.invoke('memory:check'),

    // 监听内存压力事件
    onPressure: (callback: (event: {
      pressure: 'low' | 'moderate' | 'high' | 'critical'
      usage: {
        heapUsed: number
        heapTotal: number
        external: number
        rss: number
        heapUsedMB: number
        heapTotalMB: number
        rssMB: number
        usagePercent: number
      }
      timestamp: number
      recommendation?: 'switch-to-basic' | 'gc' | 'none'
    }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: {
        pressure: 'low' | 'moderate' | 'high' | 'critical'
        usage: {
          heapUsed: number
          heapTotal: number
          external: number
          rss: number
          heapUsedMB: number
          heapTotalMB: number
          rssMB: number
          usagePercent: number
        }
        timestamp: number
        recommendation?: 'switch-to-basic' | 'gc' | 'none'
      }) => callback(event)
      ipcRenderer.on('memory:pressure', handler)
      return () => ipcRenderer.removeListener('memory:pressure', handler)
    }
  }
})

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      // 应用信息
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      platform: string

      // Shell 操作
      openExternal: (url: string) => Promise<void>

      // 窗口控制
      minimize: () => void
      maximize: () => void
      close: () => void

      // 遥测控制
      telemetry?: {
        enable: () => Promise<boolean>
        disable: () => Promise<boolean>
        isEnabled: () => Promise<boolean>
      }

      // 扩展系统
      extensions?: {
        getRoot: () => Promise<string>
        listLocal: () => Promise<LocalExtensionInfo[]>
        installVsix: (vsixPath: string) => Promise<LocalExtensionInfo>
        installFromUrl: (url: string) => Promise<LocalExtensionInfo>
        uninstall: (extensionId: string) => Promise<boolean>
        setEnabled: (extensionId: string, enabled: boolean) => Promise<boolean>
        setTrusted: (extensionId: string, trusted: boolean) => Promise<boolean>
        setWorkspaceRoot: (rootPath: string | null) => Promise<boolean>
        notifyDocumentOpen: (payload: ExtensionDocumentPayload) => Promise<boolean>
        notifyDocumentChange: (payload: ExtensionDocumentChangePayload) => Promise<boolean>
        notifyDocumentClose: (payload: { uri: string }) => Promise<boolean>
        notifyActiveEditorChange: (payload: { uri: string | null; selection?: ExtensionRange }) => Promise<boolean>
        notifySelectionChange: (payload: { uri: string; selection: ExtensionRange }) => Promise<boolean>
        provideCompletions: (payload: ExtensionCompletionRequest) => Promise<ExtensionCompletionResult>
        provideInlineCompletions: (payload: ExtensionInlineCompletionRequest) => Promise<ExtensionInlineCompletionResult>
        provideHover: (payload: ExtensionHoverRequest) => Promise<ExtensionHoverResult | null>
        provideDefinition: (payload: ExtensionDefinitionRequest) => Promise<ExtensionLocation[]>
        provideReferences: (payload: ExtensionReferencesRequest) => Promise<ExtensionLocation[]>
        provideImplementation: (payload: ExtensionDefinitionRequest) => Promise<ExtensionLocation[]>
        provideTypeDefinition: (payload: ExtensionDefinitionRequest) => Promise<ExtensionLocation[]>
        provideDeclaration: (payload: ExtensionDefinitionRequest) => Promise<ExtensionLocation[]>
        provideDocumentSymbols: (payload: { uri: string }) => Promise<ExtensionDocumentSymbol[]>
        provideSignatureHelp: (payload: ExtensionSignatureHelpRequest) => Promise<ExtensionSignatureHelpResult | null>
        provideRenameEdits: (payload: ExtensionRenameRequest) => Promise<ExtensionWorkspaceEdit | null>
        prepareRename: (payload: ExtensionDefinitionRequest) => Promise<ExtensionPrepareRenameResult | null>
        provideCodeActions: (payload: ExtensionCodeActionRequest) => Promise<ExtensionCodeAction[]>
        provideFormattingEdits: (payload: ExtensionFormattingRequest) => Promise<ExtensionTextEdit[]>
        provideRangeFormattingEdits: (payload: ExtensionRangeFormattingRequest) => Promise<ExtensionTextEdit[]>
        provideOnTypeFormattingEdits: (payload: ExtensionOnTypeFormattingRequest) => Promise<ExtensionTextEdit[]>
        provideTextDocumentContent: (payload: { uri: string }) => Promise<string | null>
        listUiContributions: () => Promise<ExtensionUiContributions>
        resolveWebviewView: (payload: { viewId: string }) => Promise<ExtensionWebviewResolveResult | null>
        postWebviewMessage: (payload: ExtensionWebviewMessage) => Promise<boolean>
        disposeWebviewView: (payload: { handle: string }) => Promise<boolean>
        disposeWebviewPanel: (payload: { handle: string }) => Promise<boolean>
        executeCommand: (payload: { command: string; args?: unknown[] }) => Promise<unknown>
        marketplaceSearch: (query: string, size?: number) => Promise<ExtensionMarketplaceItem[]>
        openRoot: () => Promise<string>
        getHostStatus: () => Promise<ExtensionHostState>
        startHost: () => Promise<ExtensionHostState>
        stopHost: () => Promise<ExtensionHostState>
        restartHost: () => Promise<ExtensionHostState>
        onHostStatus: (callback: (state: ExtensionHostState) => void) => () => void
        onMessage: (callback: (payload: ExtensionHostMessage) => void) => () => void
        onWebviewMessage: (callback: (payload: ExtensionWebviewMessage) => void) => () => void
        onWebviewHtml: (callback: (payload: ExtensionWebviewHtml) => void) => () => void
        onWebviewPanel: (callback: (payload: ExtensionWebviewPanel) => void) => () => void
        onStatusBarItem: (callback: (payload: ExtensionStatusBarItem) => void) => () => void
      }

      // WASM扩展 (IDE Extension Standard)
      wasmExtensions: {
        list: () => Promise<WasmExtensionInfo[]>
        get: (extensionId: string) => Promise<WasmExtensionInfo | null>
        install: (packagePath: string) => Promise<{ success: boolean; extension?: WasmExtensionInfo; error?: string }>
        uninstall: (extensionId: string) => Promise<{ success: boolean; error?: string }>
        activate: (extensionId: string, event?: WasmActivationEvent) => Promise<{ success: boolean; error?: string }>
        deactivate: (extensionId: string) => Promise<{ success: boolean; error?: string }>
        grantPermission: (extensionId: string, permission: string) => Promise<{ success: boolean; error?: string }>
        revokePermission: (extensionId: string, permission: string) => Promise<{ success: boolean; error?: string }>
        getPermissionRiskLevel: (permission: string) => Promise<'low' | 'medium' | 'high' | 'dangerous'>
        hasPermission: (extensionId: string, permission: string) => Promise<boolean>
        onNotification: (callback: (payload: WasmNotificationPayload) => void) => () => void
      }

      // 反馈上报
      feedback?: {
        collectState: () => Promise<Record<string, unknown>>
        getGitHubIssueUrl: (repoPath: string) => Promise<string | null>
        captureHeapSnapshot: () => Promise<Record<string, unknown>>
        submitToSentry: (data: {
          message: string
          state: Record<string, unknown>
          heapSnapshot: Record<string, unknown>
        }) => Promise<{ success: boolean; error?: string }>
      }

      // 文件系统操作
      fileSystem: {
        // 对话框
        openFolderDialog: () => Promise<string | null>
        openFileDialog: (options?: {
          filters?: { name: string; extensions: string[] }[]
          multiple?: boolean
        }) => Promise<string | string[] | null>
        saveFileDialog: (options?: {
          defaultPath?: string
          filters?: { name: string; extensions: string[] }[]
        }) => Promise<string | null>

        // 读取操作
        readDirectory: (dirPath: string, recursive?: boolean) => Promise<FileNode[]>
        readFile: (filePath: string) => Promise<string>
        readFileBuffer: (filePath: string) => Promise<Buffer>

        // 写入操作
        writeFile: (filePath: string, content: string) => Promise<void>
        createFile: (filePath: string, content?: string) => Promise<void>
        createDirectory: (dirPath: string) => Promise<void>

        // 文件操作
        deleteItem: (itemPath: string) => Promise<void>
        renameItem: (oldPath: string, newPath: string) => Promise<void>
        moveItem: (sourcePath: string, targetPath: string) => Promise<void>
        copyItem: (sourcePath: string, targetPath: string) => Promise<void>

        // 信息查询
        exists: (itemPath: string) => Promise<boolean>
        stat: (itemPath: string) => Promise<FileStat>

        // 路径操作
        getHomeDir: () => Promise<string>
        getPathSeparator: () => Promise<string>
        joinPath: (...parts: string[]) => Promise<string>
        dirname: (filePath: string) => Promise<string>
        basename: (filePath: string) => Promise<string>
        extname: (filePath: string) => Promise<string>

        // 文件监听
        watchDirectory: (dirPath: string) => Promise<void>
        unwatchDirectory: (dirPath: string) => Promise<void>
        unwatchAll: () => Promise<void>
        onFileChange: (callback: (event: FileChangeEvent) => void) => () => void
      }

      // Git 操作
      git: {
        // 仓库操作
        isRepo: (repoPath: string) => Promise<boolean>
        init: (repoPath: string) => Promise<void>
        clone: (url: string, targetPath: string) => Promise<void>

        // 状态查询
        status: (repoPath: string) => Promise<GitStatus>

        // 暂存操作
        stage: (repoPath: string, filePath: string) => Promise<void>
        unstage: (repoPath: string, filePath: string) => Promise<void>
        stageAll: (repoPath: string) => Promise<void>
        unstageAll: (repoPath: string) => Promise<void>

        // 提交操作
        commit: (repoPath: string, message: string) => Promise<void>

        // 更改操作
        discard: (repoPath: string, filePath: string) => Promise<void>
        discardAll: (repoPath: string) => Promise<void>

        // 分支操作
        branches: (repoPath: string) => Promise<GitBranch[]>
        checkout: (repoPath: string, branchName: string) => Promise<void>
        createBranch: (repoPath: string, branchName: string, checkout?: boolean) => Promise<void>
        deleteBranch: (repoPath: string, branchName: string, force?: boolean) => Promise<void>

        // 差异查看
        diff: (repoPath: string, filePath: string, staged: boolean) => Promise<string>
        showFile: (repoPath: string, filePath: string, ref?: string) => Promise<string>

        // 历史记录
        log: (repoPath: string, limit?: number) => Promise<GitCommit[]>
        logFile: (repoPath: string, filePath: string, limit?: number) => Promise<GitCommit[]>

        // 远程操作
        push: (repoPath: string, remote?: string, branch?: string) => Promise<void>
        pull: (repoPath: string, remote?: string, branch?: string) => Promise<void>
        pullRebase: (repoPath: string, remote?: string, branch?: string) => Promise<void>
        remotes: (repoPath: string) => Promise<string[]>

        // 配置
        getConfig: (repoPath: string, key: string) => Promise<string | null>
        setConfig: (repoPath: string, key: string, value: string) => Promise<void>

        // Blame
        blame: (repoPath: string, filePath: string) => Promise<string>

        // Stash
        stash: (repoPath: string, message?: string) => Promise<void>
        stashPop: (repoPath: string) => Promise<void>
        stashList: (repoPath: string) => Promise<string[]>

        // ============ GitLens 扩展 ============

        // 获取结构化 blame 信息
        blameStructured: (repoPath: string, filePath: string) => Promise<Array<{
          commitHash: string
          shortHash: string
          author: string
          authorEmail: string
          authorTime: string
          summary: string
          lineNumber: number
          lineContent: string
          isUncommitted: boolean
        }>>

        // 获取完整 commit 详情
        getCommit: (repoPath: string, hash: string) => Promise<{
          hash: string
          shortHash: string
          author: { name: string; email: string; date: string }
          committer: { name: string; email: string; date: string }
          message: string
          body: string
          parents: string[]
          stats: { additions: number; deletions: number; filesChanged: number }
        } | null>

        // 获取文件历史
        getFileHistory: (
          repoPath: string,
          filePath: string,
          options?: { limit?: number; skip?: number; follow?: boolean }
        ) => Promise<GitCommit[]>

        // 获取行历史
        getLineHistory: (
          repoPath: string,
          filePath: string,
          startLine: number,
          endLine: number,
          options?: { limit?: number }
        ) => Promise<Array<{
          hash: string
          shortHash: string
          author: string
          authorEmail: string
          date: string
          message: string
        }>>

        // 获取指定 commit 的文件内容
        getFileAtCommit: (repoPath: string, filePath: string, commitHash: string) => Promise<string>

        // 比较两个 commit
        diffCommits: (
          repoPath: string,
          fromCommit: string,
          toCommit: string,
          options?: { path?: string }
        ) => Promise<string>

        // ============ Git Graph 扩展 ============

        // 获取 Graph 数据
        getGraph: (
          repoPath: string,
          options?: {
            limit?: number
            skip?: number
            branches?: string[]
            includeRemotes?: boolean
            search?: string
            author?: string
            since?: Date
            until?: Date
            path?: string
          }
        ) => Promise<{
          commits: Array<{
            hash: string
            shortHash: string
            parents: string[]
            author: { name: string; email: string; date: string }
            committer: { name: string; email: string; date: string }
            message: string
            refs: string[]
          }>
          branches: Array<{
            name: string
            type: 'branch' | 'remote-branch' | 'tag' | 'head'
            commitHash: string
            isHead?: boolean
            upstream?: string
            ahead?: number
            behind?: number
          }>
          tags: Array<{ name: string; hash: string }>
          currentBranch: string
          headCommit: string
        }>

        // 获取所有 refs
        getRefs: (repoPath: string) => Promise<Array<{
          name: string
          type: 'branch' | 'remote-branch' | 'tag' | 'head'
          commitHash: string
          isHead?: boolean
          upstream?: string
          ahead?: number
          behind?: number
        }>>

        // 获取所有 tags
        getTags: (repoPath: string) => Promise<Array<{
          name: string
          hash: string
          date?: string
          message?: string
        }>>

        // Cherry-pick
        cherryPick: (
          repoPath: string,
          commitHash: string,
          options?: { noCommit?: boolean; recordOrigin?: boolean }
        ) => Promise<{ success: boolean; error?: string }>

        // Revert
        revert: (
          repoPath: string,
          commitHash: string,
          options?: { noCommit?: boolean; parentNumber?: number }
        ) => Promise<{ success: boolean; error?: string }>

        // 创建 tag
        createTag: (
          repoPath: string,
          name: string,
          options?: { target?: string; message?: string; sign?: boolean }
        ) => Promise<{ success: boolean; error?: string }>

        // 删除 tag
        deleteTag: (repoPath: string, name: string) => Promise<{ success: boolean; error?: string }>

        // Reset 操作
        reset: (
          repoPath: string,
          target: string,
          mode: 'soft' | 'mixed' | 'hard'
        ) => Promise<{ success: boolean; error?: string }>

        // Merge 操作
        merge: (
          repoPath: string,
          branch: string,
          options?: { message?: string; noFastForward?: boolean; squash?: boolean }
        ) => Promise<{ success: boolean; error?: string }>

        // 获取 commit 的变更文件列表
        getCommitFiles: (repoPath: string, commitHash: string) => Promise<Array<{
          path: string
          oldPath?: string
          status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
        }>>

        // 获取 commit 统计
        getCommitStats: (repoPath: string, commitHash: string) => Promise<{
          additions: number
          deletions: number
          filesChanged: number
        }>

        // ============ Merge Conflict Resolution ============

        getMergeStatus: (repoPath: string) => Promise<{
          inMerge: boolean
          mergeHead?: string
          mergeMessage?: string
          conflictCount: number
          isRebaseConflict?: boolean
        }>

        hasConflicts: (repoPath: string) => Promise<boolean>

        getConflictedFiles: (repoPath: string) => Promise<Array<{
          path: string
          resolved: boolean
          conflictCount: number
        }>>

        getConflictContent: (repoPath: string, filePath: string) => Promise<{
          ours: string
          base: string
          theirs: string
          merged: string
        }>

        resolveConflict: (repoPath: string, filePath: string, content: string) => Promise<void>

        abortMerge: (repoPath: string) => Promise<void>

        continueMerge: (repoPath: string) => Promise<void>

        // ============ Interactive Rebase ============

        getRebaseStatus: (repoPath: string) => Promise<{
          inProgress: boolean
          currentStep: number
          totalSteps: number
          currentCommit?: string
          onto?: string
          originalBranch?: string
          hasConflicts: boolean
        }>

        getCommitsForRebase: (repoPath: string, onto: string) => Promise<Array<{
          hash: string
          shortHash: string
          message: string
          action: string
          author: string
          authorEmail: string
          date: string
        }>>

        rebaseInteractiveStart: (repoPath: string, options: {
          onto: string
          actions: Array<{ hash: string; action: string; message?: string }>
        }) => Promise<{ success: boolean; error?: string }>

        rebaseContinue: (repoPath: string) => Promise<{ success: boolean; error?: string }>

        rebaseSkip: (repoPath: string) => Promise<{ success: boolean; error?: string }>

        rebaseAbort: (repoPath: string) => Promise<{ success: boolean; error?: string }>

        // ============ Cherry-pick Multiple ============

        cherryPickMultiple: (
          repoPath: string,
          commitHashes: string[],
          options?: { noCommit?: boolean; recordOrigin?: boolean }
        ) => Promise<{ success: boolean; error?: string; conflictAt?: string }>

        cherryPickPreview: (repoPath: string, commitHash: string) => Promise<{
          files: Array<{
            path: string
            oldPath?: string
            status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
          }>
          stats: { additions: number; deletions: number; filesChanged: number }
        }>

        // ============ Reflog ============

        getReflog: (repoPath: string, limit?: number) => Promise<Array<{
          index: number
          hash: string
          shortHash: string
          operationType: string
          action: string
          message: string
          date: string
          relativeDate: string
          author: string
          authorEmail: string
          previousHash?: string
          isOrphaned?: boolean
          branch?: string
        }>>

        getReflogForRef: (repoPath: string, ref: string, limit?: number) => Promise<Array<{
          index: number
          hash: string
          shortHash: string
          operationType: string
          action: string
          message: string
          date: string
          relativeDate: string
          author: string
          authorEmail: string
          previousHash?: string
          isOrphaned?: boolean
          branch?: string
        }>>
      }

      // 终端操作
      terminal: {
        create: (id: string, options?: TerminalCreateOptions) => Promise<{ success: boolean; error?: string }>
        write: (id: string, data: string) => void
        resize: (id: string, cols: number, rows: number) => void
        destroy: (id: string) => Promise<{ success: boolean }>
        info: (id: string) => Promise<{ cols: number; rows: number } | null>
        list: () => Promise<string[]>
        onData: (callback: (event: TerminalDataEvent) => void) => () => void
        onExit: (callback: (event: TerminalExitEvent) => void) => () => void
      }

      // GitHub Actions
      github: {
        deviceFlowStart: (clientId: string, scopes?: string[]) => Promise<{
          deviceCode: string
          userCode: string
          verificationUri: string
          verificationUriComplete?: string
          expiresIn: number
          interval: number
        }>
        deviceFlowPoll: (clientId: string, deviceCode: string) => Promise<{
          status: 'authorized' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error'
          accessToken?: string
          tokenType?: string
          scope?: string
          error?: string
          errorDescription?: string
          errorUri?: string
        }>
        getRepoInfo: (repoPath: string) => Promise<{ owner: string; repo: string } | null>
        getWorkflows: (repoPath: string, token?: string) => Promise<any[]>
        getWorkflowRuns: (
          repoPath: string,
          token?: string,
          workflowId?: number,
          perPage?: number
        ) => Promise<any[]>
        getWorkflowJobs: (repoPath: string, runId: number, token?: string) => Promise<any[]>
        triggerWorkflow: (
          repoPath: string,
          workflowId: number | string,
          ref?: string,
          inputs?: Record<string, string>,
          token?: string
        ) => Promise<{ success: boolean }>
        cancelWorkflowRun: (repoPath: string, runId: number, token?: string) => Promise<{ success: boolean }>
        rerunWorkflow: (repoPath: string, runId: number, token?: string) => Promise<{ success: boolean }>
        getWorkflowRunLogsUrl: (repoPath: string, runId: number, token?: string) => Promise<{ url: string; token: string }>
        listPRs: (repoPath: string, token?: string, state?: 'open' | 'closed' | 'all', perPage?: number) => Promise<any[]>
        createPR: (repoPath: string, title: string, body: string, head: string, base: string, token?: string) => Promise<any>
        listIssues: (repoPath: string, token?: string, state?: 'open' | 'closed' | 'all', perPage?: number) => Promise<any[]>
        createIssue: (repoPath: string, title: string, body: string, labels?: string[], token?: string) => Promise<any>
      }

      // GitLab CI
      gitlab: {
        getProjectInfo: (repoPath: string, baseUrl: string) => Promise<{ projectPath: string } | null>
        getPipelines: (repoPath: string, baseUrl: string, token?: string, perPage?: number) => Promise<any[]>
        getPipelineJobs: (repoPath: string, baseUrl: string, pipelineId: number, token?: string) => Promise<any[]>
        triggerPipeline: (
          repoPath: string,
          baseUrl: string,
          ref?: string,
          token?: string,
          variables?: Array<{ key: string; value: string }>
        ) => Promise<any>
        cancelPipeline: (repoPath: string, baseUrl: string, pipelineId: number, token?: string) => Promise<any>
        retryPipeline: (repoPath: string, baseUrl: string, pipelineId: number, token?: string) => Promise<any>
        getJobLog: (repoPath: string, baseUrl: string, jobId: number, token?: string) => Promise<string>
      }

      // Commit Analysis
      commitAnalysis: {
        analyze: (repoPath: string, commitHash: string) => Promise<CommitAnalysis>
        analyzeStaged: (repoPath: string) => Promise<CommitAnalysis>
        getCommitDiff: (repoPath: string, commitHash: string) => Promise<string>
        getFileAtCommit: (repoPath: string, commitHash: string, filePath: string) => Promise<string>
        analyzeRange: (repoPath: string, fromHash: string, toHash: string) => Promise<CommitAnalysis[]>
      }

      // 代码智能
      intelligence: {
        // 补全
        getCompletions: (
          filePath: string,
          position: Position,
          triggerCharacter?: string
        ) => Promise<CompletionResult>

        // 定义跳转
        getDefinitions: (filePath: string, position: Position) => Promise<DefinitionLocation[]>

        // 查找引用
        getReferences: (
          filePath: string,
          position: Position,
          includeDeclaration?: boolean
        ) => Promise<ReferenceLocation[]>

        // 诊断信息
        getDiagnostics: (filePath: string) => Promise<Diagnostic[]>

        // 悬停信息
        getHover: (filePath: string, position: Position) => Promise<HoverInfo | null>

        // 签名帮助
        getSignatureHelp: (
          filePath: string,
          position: Position,
          triggerCharacter?: string
        ) => Promise<SignatureHelp | null>

        // 内联提示
        getInlayHints: (filePath: string, range: Range) => Promise<InlayHint[]>

        // 重命名
        prepareRename: (filePath: string, position: Position) => Promise<PrepareRenameResult | null>
        rename: (filePath: string, position: Position, newName: string) => Promise<WorkspaceEdit | null>

        // 重构
        getRefactorActions: (filePath: string, range: Range) => Promise<RefactorAction[]>
        applyRefactor: (filePath: string, range: Range, actionKind: string) => Promise<WorkspaceEdit | null>

        // 文件同步
        syncFile: (filePath: string, content: string, version: number) => void
        closeFile: (filePath: string) => void

        // 项目管理
        openProject: (rootPath: string) => Promise<void>
        closeProject: (rootPath: string) => Promise<void>

        // 语言服务器状态
        getServerStatus: (language: string) => Promise<LanguageServerStatus>
        onServerStatusChange: (callback: (status: LanguageServerStatus) => void) => () => void

        // 索引进度
        onIndexingProgress: (callback: (progress: IndexingProgress) => void) => () => void

        // 分析状态
        onAnalysisStatus: (callback: (status: AnalysisStatus) => void) => () => void

        // 服务状态
        getServiceStatus: () => Promise<LSPServiceStatus>
        onServiceStatusChange: (callback: (status: LSPServiceStatus) => void) => () => void

        // LSP 诊断
        onDiagnostics: (callback: (params: { filePath: string; diagnostics: Diagnostic[] }) => void) => () => void

        // LSP 服务器状态
        onLSPServerStatus: (callback: (event: { languageId: string; status: string; message?: string }) => void) => () => void

        // 智能模式切换
        setMode: (mode: 'basic' | 'smart') => Promise<void>

        // 项目分析
        analyzeProject: () => Promise<{
          fileCount: number
          totalSize: number
          estimatedMemory: number
          hasComplexDependencies: boolean
          languages: string[]
        }>

        // 项目设置
        getProjectSettings: (projectRoot: string) => Promise<{
          preferredMode?: 'basic' | 'smart'
          autoSelect?: boolean
          smartModeThreshold?: {
            maxFiles?: number
            maxMemoryMB?: number
          }
          autoDowngrade?: boolean
        }>
        saveProjectSettings: (projectRoot: string, settings: {
          preferredMode?: 'basic' | 'smart'
          autoSelect?: boolean
          smartModeThreshold?: {
            maxFiles?: number
            maxMemoryMB?: number
          }
          autoDowngrade?: boolean
        }) => Promise<void>
        loadMergedSettings: (projectRoot: string, globalSettings: {
          preferredMode?: 'basic' | 'smart'
          autoSelect?: boolean
          smartModeThreshold?: {
            maxFiles?: number
            maxMemoryMB?: number
          }
          autoDowngrade?: boolean
        }) => Promise<{
          preferredMode?: 'basic' | 'smart'
          autoSelect?: boolean
          smartModeThreshold?: {
            maxFiles?: number
            maxMemoryMB?: number
          }
          autoDowngrade?: boolean
        }>
      }

      // 调试
      debug: {
        // 会话管理
        startSession: (config: DebugConfig, workspaceFolder: string) => Promise<{ success: boolean; session?: DebugSession; error?: string }>
        stopSession: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        restartSession: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        getSessions: () => Promise<DebugSession[]>
        getActiveSession: () => Promise<DebugSession | undefined>
        setActiveSession: (sessionId: string) => Promise<void>

        // 执行控制
        continue: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        pause: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        stepOver: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        stepInto: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        stepOut: (sessionId?: string) => Promise<{ success: boolean; error?: string }>
        restartFrame: (frameId: number, sessionId?: string) => Promise<{ success: boolean; error?: string }>

        // 断点管理
        setBreakpoint: (
          filePath: string,
          line: number,
          options?: { condition?: string; hitCondition?: string; logMessage?: string }
        ) => Promise<{ success: boolean; breakpoint?: BreakpointInfo; error?: string }>
        removeBreakpoint: (breakpointId: string) => Promise<{ success: boolean; error?: string }>
        toggleBreakpoint: (breakpointId: string) => Promise<{ success: boolean; error?: string }>
        toggleBreakpointAtLine: (filePath: string, line: number) => Promise<{ success: boolean; breakpoint?: BreakpointInfo | null; error?: string }>
        getAllBreakpoints: () => Promise<BreakpointInfo[]>
        getBreakpointsForFile: (filePath: string) => Promise<BreakpointInfo[]>

        // 变量和栈帧
        getThreads: (sessionId?: string) => Promise<{ success: boolean; threads?: DebugThread[]; error?: string }>
        getStackTrace: (threadId: number, sessionId?: string) => Promise<{ success: boolean; frames?: DebugStackFrame[]; error?: string }>
        getScopes: (frameId: number, sessionId?: string) => Promise<{ success: boolean; scopes?: DebugScope[]; error?: string }>
        getVariables: (variablesReference: number, sessionId?: string) => Promise<{ success: boolean; variables?: DebugVariable[]; error?: string }>
        setVariable: (
          variablesReference: number,
          name: string,
          value: string,
          sessionId?: string
        ) => Promise<{ success: boolean; variable?: DebugVariable; error?: string }>
        evaluate: (
          expression: string,
          frameId?: number,
          context?: 'watch' | 'repl' | 'hover',
          sessionId?: string
        ) => Promise<{ success: boolean; result?: EvaluateResult; error?: string }>
        selectFrame: (frameId: number, sessionId?: string) => Promise<void>

        // 监视表达式
        addWatch: (expression: string) => Promise<WatchExpression>
        removeWatch: (watchId: string) => Promise<void>
        refreshWatch: (watchId: string) => Promise<void>
        refreshAllWatches: () => Promise<void>
        getWatchExpressions: () => Promise<WatchExpression[]>

        // 调试控制台
        executeInConsole: (command: string, sessionId?: string) => Promise<{ success: boolean; result?: EvaluateResult; error?: string }>

        // 启动配置
        readLaunchConfig: (workspaceFolder: string) => Promise<{ success: boolean; config?: LaunchConfigFile; error?: string }>
        writeLaunchConfig: (workspaceFolder: string, config: LaunchConfigFile) => Promise<{ success: boolean; error?: string }>
        getDefaultLaunchConfig: (type: string, workspaceFolder: string) => Promise<DebugConfig>

        // 事件监听
        onSessionCreated: (callback: (session: DebugSession) => void) => () => void
        onSessionStateChanged: (callback: (data: { sessionId: string; state: SessionState }) => void) => () => void
        onSessionTerminated: (callback: (sessionId: string) => void) => () => void
        onStopped: (callback: (data: { sessionId: string; reason: string; threadId: number; allThreadsStopped?: boolean }) => void) => () => void
        onContinued: (callback: (data: { sessionId: string; threadId: number; allThreadsContinued?: boolean }) => void) => () => void
        onBreakpointChanged: (callback: (breakpoint: BreakpointInfo) => void) => () => void
        onBreakpointValidated: (callback: (breakpoint: BreakpointInfo) => void) => () => void
        onBreakpointRemoved: (callback: (breakpointId: string) => void) => () => void
        onThreadsUpdated: (callback: (data: { sessionId: string; threads: DebugThread[] }) => void) => () => void
        onFrameSelected: (callback: (data: { sessionId: string; frameId: number }) => void) => () => void
        onConsoleMessage: (callback: (data: { sessionId: string; message: DebugConsoleMessage }) => void) => () => void
        onWatchAdded: (callback: (watch: WatchExpression) => void) => () => void
        onWatchRemoved: (callback: (watchId: string) => void) => () => void
        onWatchUpdated: (callback: (watch: WatchExpression) => void) => () => void
        onActiveSessionChanged: (callback: (sessionId: string) => void) => () => void

        // 活动文件管理
        setActiveFile: (filePath: string | null) => Promise<void>
        getActiveFile: () => Promise<string | null>
      }

      // 自动更新
      updater: {
        check: () => Promise<{ success: boolean; result?: unknown; error?: string }>
        download: () => Promise<{ success: boolean; error?: string }>
        install: () => Promise<{ success: boolean }>
        getStatus: () => Promise<UpdateState>
        setAutoDownload: (enabled: boolean) => Promise<{ success: boolean }>
        onStatus: (callback: (state: UpdateState) => void) => () => void
      }

      // LSP (Basic Mode)
      lsp: {
        start: (languageId: string) => Promise<boolean>
        stop: (languageId: string) => Promise<void>
        stopAll: () => Promise<void>
        getStatus: (languageId: string) => Promise<string>
        setProjectRoot: (rootPath: string) => Promise<void>
        getLanguageId: (filePath: string) => Promise<string | null>
        request: (languageId: string, method: string, params: unknown) => Promise<unknown>
        notify: (languageId: string, method: string, params: unknown) => Promise<void>
        onDiagnostics: (callback: (data: { languageId: string; params: unknown }) => void) => () => void
        onStatus: (callback: (data: { languageId: string; status: string; message?: string }) => void) => () => void
        onProgress: (callback: (data: { languageId: string; params: unknown }) => void) => () => void
        onNotification: (callback: (data: { languageId: string; method: string; params: unknown }) => void) => () => void
      }

      // 语言守护进程
      daemon: {
        // 生命周期
        start: () => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean; error?: string }>
        isRunning: () => Promise<boolean>

        // 文档管理
        openDocument: (uri: string, content: string, languageId: string) => Promise<{ success: boolean; error?: string }>
        updateDocument: (uri: string, content: string) => void
        closeDocument: (uri: string) => void

        // 代码智能
        completions: (uri: string, line: number, column: number) => Promise<unknown>
        definition: (uri: string, line: number, column: number) => Promise<unknown>
        references: (uri: string, line: number, column: number) => Promise<unknown>
        hover: (uri: string, line: number, column: number) => Promise<unknown>
        documentSymbols: (uri: string) => Promise<unknown>
        searchSymbols: (query: string) => Promise<unknown>
        diagnostics: (uri: string) => Promise<unknown>

        // 重命名
        prepareRename: (uri: string, line: number, column: number) => Promise<unknown>
        rename: (uri: string, line: number, column: number, newName: string) => Promise<unknown>

        // 重构
        getRefactorActions: (uri: string, startLine: number, startCol: number, endLine: number, endCol: number) => Promise<unknown>
        extractVariable: (uri: string, startLine: number, startCol: number, endLine: number, endCol: number, variableName: string) => Promise<unknown>
        extractMethod: (uri: string, startLine: number, startCol: number, endLine: number, endCol: number, methodName: string) => Promise<unknown>
        canSafeDelete: (uri: string, startLine: number, startCol: number, endLine: number, endCol: number) => Promise<unknown>
        safeDelete: (uri: string, startLine: number, startCol: number, endLine: number, endCol: number) => Promise<unknown>

        // 分析
        getTodoItems: (uri: string) => Promise<unknown>
        getAllTodoItems: () => Promise<unknown>
        getTodoStats: () => Promise<unknown>
        getUnusedSymbols: (uri: string) => Promise<unknown>

        // 调用层级
        prepareCallHierarchy: (uri: string, line: number, column: number) => Promise<unknown>
        incomingCalls: (item: unknown) => Promise<unknown>
        outgoingCalls: (item: unknown) => Promise<unknown>

        // 影响分析
        impactAnalysis: (uri: string, line: number, column: number) => Promise<unknown>

        // 事件
        onDiagnostics: (callback: (params: unknown) => void) => () => void
      }

      // 内存监控
      memory: {
        start: () => Promise<{ success: boolean }>
        stop: () => Promise<{ success: boolean }>
        getUsage: () => Promise<{
          heapUsed: number
          heapTotal: number
          external: number
          rss: number
          heapUsedMB: number
          heapTotalMB: number
          rssMB: number
          usagePercent: number
        }>
        updateConfig: (config: {
          interval?: number
          moderateThreshold?: number
          highThreshold?: number
          criticalThreshold?: number
          autoGC?: boolean
          autoSuggestDowngrade?: boolean
        }) => Promise<{ success: boolean }>
        getConfig: () => Promise<{
          interval: number
          moderateThreshold: number
          highThreshold: number
          criticalThreshold: number
          autoGC: boolean
          autoSuggestDowngrade: boolean
        }>
        check: () => Promise<{
          heapUsed: number
          heapTotal: number
          external: number
          rss: number
          heapUsedMB: number
          heapTotalMB: number
          rssMB: number
          usagePercent: number
        }>
        onPressure: (callback: (event: {
          pressure: 'low' | 'moderate' | 'high' | 'critical'
          usage: {
            heapUsed: number
            heapTotal: number
            external: number
            rss: number
            heapUsedMB: number
            heapTotalMB: number
            rssMB: number
            usagePercent: number
          }
          timestamp: number
          recommendation?: 'switch-to-basic' | 'gc' | 'none'
        }) => void) => () => void
      }

      // 远程开发
      remote?: {
        // 连接管理
        connect: (config: SSHConnectionConfig) => Promise<RemoteOperationResult<RemoteConnection>>
        disconnect: (connectionId: string) => Promise<RemoteOperationResult>
        getConnection: (connectionId: string) => Promise<RemoteConnection | undefined>
        listConnections: () => Promise<RemoteConnection[]>
        testConnection: (config: SSHConnectionConfig) => Promise<RemoteOperationResult>

        // 保存的连接
        saveConnection: (config: SSHConnectionConfig) => Promise<RemoteOperationResult<SSHConnectionConfig>>
        deleteSavedConnection: (connectionId: string) => Promise<RemoteOperationResult>
        getSavedConnections: () => Promise<SSHConnectionConfig[]>

        // 文件系统操作
        fs: {
          readDirectory: (connectionId: string, dirPath: string, recursive?: boolean) => Promise<RemoteOperationResult<RemoteFileNode[]>>
          readFile: (connectionId: string, filePath: string) => Promise<RemoteOperationResult<string>>
          writeFile: (connectionId: string, filePath: string, content: string) => Promise<RemoteOperationResult>
          createFile: (connectionId: string, filePath: string, content?: string) => Promise<RemoteOperationResult>
          createDirectory: (connectionId: string, dirPath: string) => Promise<RemoteOperationResult>
          deleteItem: (connectionId: string, itemPath: string) => Promise<RemoteOperationResult>
          renameItem: (connectionId: string, oldPath: string, newPath: string) => Promise<RemoteOperationResult>
          exists: (connectionId: string, itemPath: string) => Promise<boolean>
          stat: (connectionId: string, itemPath: string) => Promise<RemoteOperationResult<RemoteFileStat>>
        }

        // 终端操作
        terminal: {
          create: (connectionId: string, terminalId: string, options?: RemoteTerminalOptions) => Promise<RemoteOperationResult>
          write: (connectionId: string, terminalId: string, data: string) => Promise<RemoteOperationResult>
          resize: (connectionId: string, terminalId: string, cols: number, rows: number) => Promise<RemoteOperationResult>
          destroy: (connectionId: string, terminalId: string) => Promise<RemoteOperationResult>
        }

        // 端口转发
        port: {
          forward: (connectionId: string, config: { localPort: number; remoteHost: string; remotePort: number }) => Promise<RemoteOperationResult<{ id: string; connectionId: string; config: { localPort: number; remoteHost: string; remotePort: number }; state: string; error?: string }>>
          unforward: (forwardId: string) => Promise<RemoteOperationResult>
          list: (connectionId: string) => Promise<Array<{ id: string; connectionId: string; config: { localPort: number; remoteHost: string; remotePort: number }; state: string; error?: string }>>
        }

        // 文件监视
        watch: (connectionId: string, remotePath: string) => Promise<RemoteOperationResult<string>>
        unwatch: (watchId: string) => Promise<RemoteOperationResult>

        // 事件监听
        onConnectionStateChanged: (callback: (data: { connectionId: string; state: ConnectionState; error?: string }) => void) => () => void
        onTerminalData: (callback: (data: { connectionId: string; terminalId: string; data: string }) => void) => () => void
        onTerminalExit: (callback: (data: { connectionId: string; terminalId: string; exitCode?: number }) => void) => () => void
        onPortForwardChanged: (callback: (data: { forwardId: string; state: string; error?: string }) => void) => () => void
        onFileChanged: (callback: (data: { connectionId: string; type: 'created' | 'changed' | 'deleted'; path: string; isDirectory: boolean }) => void) => () => void
      }
    }
  }
}
