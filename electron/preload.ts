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
      ipcRenderer.invoke('git:stashList', repoPath)
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
      ipcRenderer.invoke('github:getWorkflowRunLogsUrl', repoPath, runId, token)
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
      }
    }
  }
}
