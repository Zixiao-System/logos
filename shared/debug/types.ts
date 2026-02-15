/**
 * Shared Debug Types for Logos IDE
 *
 * Inlined DAP types (no dependency on @vscode/debugprotocol) plus
 * application-level types used by both main process and renderer.
 */

// ============================================================
// Inlined DAP Types
// ============================================================

/** Inlined DAP Source type */
export interface Source {
  name?: string
  path?: string
  sourceReference?: number
  presentationHint?: 'normal' | 'emphasize' | 'deemphasize'
  origin?: string
  adapterData?: unknown
}

/** Inlined DAP Thread type */
export interface Thread {
  id: number
  name: string
}

/** Inlined DAP StackFrame type */
export interface StackFrame {
  id: number
  name: string
  source?: Source
  line: number
  column: number
  endLine?: number
  endColumn?: number
  canRestart?: boolean
  presentationHint?: 'normal' | 'label' | 'subtle'
  moduleId?: number | string
}

/** Inlined DAP Scope type */
export interface Scope {
  name: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  expensive: boolean
  source?: Source
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}

/** Inlined DAP Variable type */
export interface Variable {
  name: string
  value: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  evaluateName?: string
  memoryReference?: string
  presentationHint?: VariablePresentationHint
}

export interface VariablePresentationHint {
  kind?: string
  attributes?: string[]
  visibility?: string
  lazy?: boolean
}

/** Inlined DAP Capabilities type (subset used by Logos) */
export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean
  supportsFunctionBreakpoints?: boolean
  supportsConditionalBreakpoints?: boolean
  supportsHitConditionalBreakpoints?: boolean
  supportsEvaluateForHovers?: boolean
  supportsStepBack?: boolean
  supportsSetVariable?: boolean
  supportsRestartFrame?: boolean
  supportsGotoTargetsRequest?: boolean
  supportsStepInTargetsRequest?: boolean
  supportsCompletionsRequest?: boolean
  supportsModulesRequest?: boolean
  supportsRestartRequest?: boolean
  supportsExceptionOptions?: boolean
  supportsValueFormattingOptions?: boolean
  supportsExceptionInfoRequest?: boolean
  supportTerminateDebuggee?: boolean
  supportsDelayedStackTraceLoading?: boolean
  supportsLoadedSourcesRequest?: boolean
  supportsLogPoints?: boolean
  supportsTerminateThreadsRequest?: boolean
  supportsSetExpression?: boolean
  supportsTerminateRequest?: boolean
  supportsDataBreakpoints?: boolean
  supportsReadMemoryRequest?: boolean
  supportsWriteMemoryRequest?: boolean
  supportsDisassembleRequest?: boolean
  supportsCancelRequest?: boolean
  supportsBreakpointLocationsRequest?: boolean
  supportsClipboardContext?: boolean
  supportsSteppingGranularity?: boolean
  supportsInstructionBreakpoints?: boolean
  supportsExceptionFilterOptions?: boolean
  supportsSingleThreadExecutionRequests?: boolean
  exceptionBreakpointFilters?: ExceptionBreakpointsFilter[]
  completionTriggerCharacters?: string[]
  additionalModuleColumns?: ColumnDescriptor[]
  supportedChecksumAlgorithms?: ChecksumAlgorithm[]
}

export interface ExceptionBreakpointsFilter {
  filter: string
  label: string
  description?: string
  default?: boolean
  supportsCondition?: boolean
  conditionDescription?: string
}

export interface ColumnDescriptor {
  attributeName: string
  label: string
  format?: string
  type?: 'string' | 'number' | 'boolean' | 'unixTimestampUTC'
  width?: number
}

export type ChecksumAlgorithm = 'MD5' | 'SHA1' | 'SHA256' | 'timestamp'

export interface SourceBreakpoint {
  line: number
  column?: number
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export interface Breakpoint {
  id?: number
  verified: boolean
  message?: string
  source?: Source
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}

// ============================================================
// Shared Application Types
// ============================================================

/** Debug session states */
export type SessionState = 'initializing' | 'running' | 'stopped' | 'terminated'

/** Breakpoint types */
export type BreakpointType = 'line' | 'conditional' | 'logpoint' | 'function' | 'exception' | 'data'

/** Debugger types supported by the IDE */
export type DebuggerType = 'node' | 'chrome' | 'gdb' | 'lldb' | 'python' | 'go'

/** Debug configuration (launch or attach) */
export interface DebugConfig {
  type: DebuggerType | string
  request: 'launch' | 'attach'
  name: string
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  runtimeExecutable?: string
  runtimeArgs?: string[]
  console?: 'internalConsole' | 'integratedTerminal' | 'externalTerminal'
  stopOnEntry?: boolean
  sourceMaps?: boolean
  outFiles?: string[]
  skipFiles?: string[]
  port?: number
  address?: string
  processId?: number
  url?: string
  webRoot?: string
  preLaunchTask?: string
  postDebugTask?: string
  noDebug?: boolean
  [key: string]: unknown
}

/** Breakpoint with additional metadata */
export interface BreakpointInfo {
  id: string
  verified: boolean
  source: Source
  line: number
  column?: number
  enabled: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
  type: BreakpointType
}

/** Watch expression */
export interface WatchExpression {
  id: string
  expression: string
  result?: EvaluateResult
  error?: string
}

/** Evaluate result */
export interface EvaluateResult {
  result: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  memoryReference?: string
}

/** Serializable session data for IPC */
export interface DebugSessionInfo {
  id: string
  name: string
  type: DebuggerType | string
  state: SessionState
  config: DebugConfig
  capabilities?: Capabilities
  threads: Thread[]
  currentThreadId?: number
  currentFrameId?: number
}

/** Debug console message */
export interface DebugConsoleMessage {
  type: 'input' | 'output' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
  source?: string
  line?: number
}

/** Launch configuration file format */
export interface LaunchConfigFile {
  version: string
  configurations: DebugConfig[]
  compounds?: CompoundConfig[]
}

/** Compound debug configuration */
export interface CompoundConfig {
  name: string
  configurations: string[]
  stopAll?: boolean
  preLaunchTask?: string
}

/** Function breakpoint */
export interface FunctionBreakpoint {
  id: string
  name: string
  enabled: boolean
  verified: boolean
  condition?: string
  hitCondition?: string
}

/** Exception filter state */
export interface ExceptionFilterState {
  filterId: string
  label: string
  description?: string
  enabled: boolean
  supportsCondition: boolean
  conditionDescription?: string
  condition?: string
}

/** Standardized IPC response */
export interface DebugIpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/** Stopped event data payload */
export interface StoppedEventData {
  sessionId: string
  reason: string
  threadId: number
  allThreadsStopped?: boolean
}

/** Continued event data payload */
export interface ContinuedEventData {
  sessionId: string
  threadId: number
  allThreadsContinued?: boolean
}
