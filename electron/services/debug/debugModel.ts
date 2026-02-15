/**
 * Debug Model - Central data model for debug state
 * Manages sessions, breakpoints, and watch expressions
 */
import { EventEmitter } from 'events'
import { ChildProcess } from 'child_process'
import { DAPClient } from './DAPClient'
import type {
  DebugSession,
  BreakpointInfo,
  WatchExpression,
  Source,
  SourceBreakpoint
} from './types'

export interface DebugSessionData {
  session: DebugSession
  client: DAPClient
  process?: ChildProcess
  workspaceFolder: string
}

export class DebugModel extends EventEmitter {
  private sessions: Map<string, DebugSessionData> = new Map()
  private breakpoints: Map<string, BreakpointInfo[]> = new Map() // file path -> breakpoints
  private watchExpressions: WatchExpression[] = []
  private _activeSessionId?: string
  private nextBreakpointId: number = 1
  private nextWatchId: number = 1

  // ============ Session Management ============

  get activeSessionId(): string | undefined {
    return this._activeSessionId
  }

  set activeSessionId(id: string | undefined) {
    this._activeSessionId = id
  }

  addSession(data: DebugSessionData): void {
    this.sessions.set(data.session.id, data)
    this.emit('sessionAdded', data.session)
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    if (this._activeSessionId === sessionId) {
      const remaining = Array.from(this.sessions.keys())
      this._activeSessionId = remaining.length > 0 ? remaining[0] : undefined
    }
    this.emit('sessionRemoved', sessionId)
  }

  getSessionData(sessionId?: string): DebugSessionData | undefined {
    const id = sessionId ?? this._activeSessionId
    return id ? this.sessions.get(id) : undefined
  }

  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values()).map(e => e.session)
  }

  getActiveSession(): DebugSession | undefined {
    return this._activeSessionId ? this.sessions.get(this._activeSessionId)?.session : undefined
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  updateSessionState(sessionId: string, state: string): void {
    const data = this.sessions.get(sessionId)
    if (data) {
      data.session.state = state as DebugSession['state']
      this.emit('sessionStateChanged', sessionId, state)
    }
  }

  // ============ Breakpoint Management ============

  generateBreakpointId(): string {
    return `bp_${this.nextBreakpointId++}`
  }

  setBreakpoints(filePath: string, breakpoints: BreakpointInfo[]): void {
    this.breakpoints.set(filePath, breakpoints)
    this.emit('breakpointChanged', filePath)
  }

  addBreakpoint(filePath: string, bp: BreakpointInfo): void {
    const fileBreakpoints = this.breakpoints.get(filePath) || []
    fileBreakpoints.push(bp)
    this.breakpoints.set(filePath, fileBreakpoints)
    this.emit('breakpointChanged', bp)
  }

  removeBreakpoint(breakpointId: string): string | null {
    for (const [filePath, breakpoints] of this.breakpoints.entries()) {
      const index = breakpoints.findIndex(bp => bp.id === breakpointId)
      if (index !== -1) {
        breakpoints.splice(index, 1)
        if (breakpoints.length === 0) {
          this.breakpoints.delete(filePath)
        }
        this.emit('breakpointRemoved', breakpointId)
        return filePath
      }
    }
    return null
  }

  getBreakpointsForFile(filePath: string): BreakpointInfo[] {
    return this.breakpoints.get(filePath) || []
  }

  getAllBreakpoints(): BreakpointInfo[] {
    const all: BreakpointInfo[] = []
    for (const breakpoints of this.breakpoints.values()) {
      all.push(...breakpoints)
    }
    return all
  }

  getBreakpointFiles(): string[] {
    return Array.from(this.breakpoints.keys())
  }

  findBreakpoint(breakpointId: string): { bp: BreakpointInfo; filePath: string } | null {
    for (const [filePath, breakpoints] of this.breakpoints.entries()) {
      const bp = breakpoints.find(b => b.id === breakpointId)
      if (bp) {
        return { bp, filePath }
      }
    }
    return null
  }

  getEnabledBreakpointsForFile(filePath: string): SourceBreakpoint[] {
    const breakpoints = this.breakpoints.get(filePath) || []
    return breakpoints
      .filter(bp => bp.enabled)
      .map(bp => ({
        line: bp.line,
        column: bp.column,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage
      }))
  }

  getSourceForFile(filePath: string): Source {
    return { path: filePath }
  }

  // ============ Watch Expression Management ============

  generateWatchId(): string {
    return `watch_${this.nextWatchId++}`
  }

  addWatch(watch: WatchExpression): void {
    this.watchExpressions.push(watch)
    this.emit('watchAdded', watch)
  }

  removeWatch(watchId: string): void {
    const index = this.watchExpressions.findIndex(w => w.id === watchId)
    if (index !== -1) {
      this.watchExpressions.splice(index, 1)
      this.emit('watchRemoved', watchId)
    }
  }

  getWatch(watchId: string): WatchExpression | undefined {
    return this.watchExpressions.find(w => w.id === watchId)
  }

  getAllWatches(): WatchExpression[] {
    return [...this.watchExpressions]
  }

  updateWatch(watch: WatchExpression): void {
    const index = this.watchExpressions.findIndex(w => w.id === watch.id)
    if (index !== -1) {
      this.watchExpressions[index] = watch
    }
    this.emit('watchUpdated', watch)
  }
}
