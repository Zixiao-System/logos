/**
 * Debug Adapter Protocol (DAP) Types for Logos IDE — Backend
 *
 * Re-exports all shared types and defines backend-only types.
 */
import { DebugProtocol } from '@vscode/debugprotocol'

// Re-export everything from shared types
export type {
  Source,
  Thread,
  StackFrame,
  Scope,
  Variable,
  VariablePresentationHint,
  Capabilities,
  ExceptionBreakpointsFilter,
  ColumnDescriptor,
  ChecksumAlgorithm,
  SourceBreakpoint,
  Breakpoint,
  SessionState,
  BreakpointType,
  DebuggerType,
  DebugConfig,
  BreakpointInfo,
  WatchExpression,
  EvaluateResult,
  DebugSessionInfo,
  DebugConsoleMessage,
  LaunchConfigFile,
  CompoundConfig,
  FunctionBreakpoint,
  ExceptionFilterState,
  DebugIpcResult,
  StoppedEventData,
  ContinuedEventData
} from '@shared/debug/types'

import type { DebugSessionInfo } from '@shared/debug/types'

/** Backward-compatible alias */
export type DebugSession = DebugSessionInfo

// ============================================================
// Backend-Only Types
// ============================================================

/** Remote debugging configuration */
export interface RemoteDebugConfig {
  /** SSH connection ID */
  connectionId: string
  /** Remote host where the DAP server is running */
  remoteHost: string
  /** Remote port where the DAP server is running */
  remotePort: number
  /** Local workspace root for path mapping */
  localRoot?: string
  /** Remote workspace root for path mapping */
  remoteRoot?: string
}

/** Launch request configuration (extended with language-specific fields) */
export interface LaunchConfig {
  type: string
  request: 'launch'
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
  // Node.js specific
  port?: number
  // C/C++ specific
  MIMode?: 'gdb' | 'lldb'
  miDebuggerPath?: string
  setupCommands?: Array<{ description?: string; text: string; ignoreFailures?: boolean }>
  // Python specific
  python?: string
  justMyCode?: boolean
  // Chrome specific
  url?: string
  webRoot?: string
  // Common
  preLaunchTask?: string
  postDebugTask?: string
  // Remote debugging
  remote?: RemoteDebugConfig
  [key: string]: unknown
}

/** Attach request configuration (extended) */
export interface AttachConfig {
  type: string
  request: 'attach'
  name: string
  port?: number
  address?: string
  processId?: number
  sourceMaps?: boolean
  localRoot?: string
  remoteRoot?: string
  sourceMapPathOverrides?: Record<string, string>
  preLaunchTask?: string
  postDebugTask?: string
  [key: string]: unknown
}

/** Debug event types (uses DebugProtocol event bodies) */
export interface DebugEvents {
  initialized: void
  stopped: DebugProtocol.StoppedEvent['body']
  continued: DebugProtocol.ContinuedEvent['body']
  terminated: DebugProtocol.TerminatedEvent['body'] | undefined
  output: DebugProtocol.OutputEvent['body']
  breakpoint: DebugProtocol.BreakpointEvent['body']
  thread: DebugProtocol.ThreadEvent['body']
  exited: DebugProtocol.ExitedEvent['body']
  module: DebugProtocol.ModuleEvent['body']
  loadedSource: DebugProtocol.LoadedSourceEvent['body']
  process: DebugProtocol.ProcessEvent['body']
  capabilities: DebugProtocol.CapabilitiesEvent['body']
  progressStart: DebugProtocol.ProgressStartEvent['body']
  progressUpdate: DebugProtocol.ProgressUpdateEvent['body']
  progressEnd: DebugProtocol.ProgressEndEvent['body']
  invalidated: DebugProtocol.InvalidatedEvent['body']
  memory: DebugProtocol.MemoryEvent['body']
}

/** Variable tree node for UI */
export interface VariableNode {
  name: string
  value: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
  children?: VariableNode[]
  expanded?: boolean
}

/** Call stack frame for UI */
export interface CallStackFrame {
  id: number
  name: string
  source?: import('@shared/debug/types').Source
  line: number
  column: number
  presentationHint?: 'normal' | 'label' | 'subtle'
  canRestart?: boolean
  current?: boolean
}
