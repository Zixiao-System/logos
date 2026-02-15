/**
 * Debug Store unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDebugStore, type BreakpointInfo, type DebugSession, type DetectedDebugger } from '@/stores/debug'
import { mockElectronAPI, resetAllMocks } from '../../setup'

describe('Debug Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetAllMocks()
  })

  describe('Initial state', () => {
    it('has correct initial values', () => {
      const store = useDebugStore()

      expect(store.sessions).toEqual([])
      expect(store.activeSessionId).toBeNull()
      expect(store.breakpoints.size).toBe(0)
      expect(store.currentThreadId).toBeNull()
      expect(store.currentFrameId).toBeNull()
      expect(store.stackFrames).toEqual([])
      expect(store.scopes).toEqual([])
      expect(store.watchExpressions).toEqual([])
      expect(store.consoleMessages).toEqual([])
      expect(store.exceptionFilters).toEqual([])
      expect(store.isPanelVisible).toBe(false)
      expect(store.activePanel).toBe('variables')
    })
  })

  describe('Session management', () => {
    it('addSession adds session and sets active', () => {
      const store = useDebugStore()
      const session: DebugSession = {
        id: 'session_1',
        name: 'Test',
        type: 'node',
        state: 'running',
        config: { type: 'node', request: 'launch', name: 'Test' },
        threads: []
      }

      store.addSession(session)

      expect(store.sessions).toHaveLength(1)
      expect(store.activeSessionId).toBe('session_1')
      expect(store.isPanelVisible).toBe(true)
    })

    it('removeSession removes and switches active', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })
      store.addSession({
        id: 's2', name: 'S2', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S2' }, threads: []
      })

      store.removeSession('s2')

      expect(store.sessions).toHaveLength(1)
      expect(store.activeSessionId).toBe('s1')
    })

    it('updateSessionState updates the session state', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })

      store.updateSessionState('s1', 'stopped')
      expect(store.sessions[0].state).toBe('stopped')
    })

    it('setActiveSession only sets valid session', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })

      store.setActiveSession('nonexistent')
      expect(store.activeSessionId).toBe('s1')

      store.setActiveSession('s1')
      expect(store.activeSessionId).toBe('s1')
    })
  })

  describe('Breakpoint management', () => {
    it('addBreakpoint adds to the breakpoints map', () => {
      const store = useDebugStore()
      const bp: BreakpointInfo = {
        id: 'bp_1',
        verified: true,
        source: { path: '/test.js' },
        line: 10,
        enabled: true,
        type: 'line'
      }

      store.addBreakpoint(bp)

      expect(store.breakpoints.get('/test.js')).toHaveLength(1)
      expect(store.allBreakpoints).toHaveLength(1)
    })

    it('removeBreakpoint removes from map and cleans up empty entries', () => {
      const store = useDebugStore()
      store.addBreakpoint({
        id: 'bp_1', verified: true, source: { path: '/test.js' },
        line: 10, enabled: true, type: 'line'
      })

      store.removeBreakpoint('bp_1')

      expect(store.breakpoints.has('/test.js')).toBe(false)
      expect(store.allBreakpoints).toHaveLength(0)
    })

    it('toggleBreakpointEnabled toggles the enabled state', () => {
      const store = useDebugStore()
      store.addBreakpoint({
        id: 'bp_1', verified: true, source: { path: '/test.js' },
        line: 10, enabled: true, type: 'line'
      })

      store.toggleBreakpointEnabled('bp_1')
      expect(store.breakpoints.get('/test.js')![0].enabled).toBe(false)

      store.toggleBreakpointEnabled('bp_1')
      expect(store.breakpoints.get('/test.js')![0].enabled).toBe(true)
    })

    it('getBreakpointsForFile returns breakpoints for given file', () => {
      const store = useDebugStore()
      store.addBreakpoint({
        id: 'bp_1', verified: true, source: { path: '/a.js' },
        line: 10, enabled: true, type: 'line'
      })
      store.addBreakpoint({
        id: 'bp_2', verified: true, source: { path: '/b.js' },
        line: 5, enabled: true, type: 'line'
      })

      expect(store.getBreakpointsForFile('/a.js')).toHaveLength(1)
      expect(store.getBreakpointsForFile('/b.js')).toHaveLength(1)
      expect(store.getBreakpointsForFile('/c.js')).toHaveLength(0)
    })

    it('updateBreakpoint updates existing breakpoint', () => {
      const store = useDebugStore()
      store.addBreakpoint({
        id: 'bp_1', verified: false, source: { path: '/test.js' },
        line: 10, enabled: true, type: 'line'
      })

      store.updateBreakpoint({
        id: 'bp_1', verified: true, source: { path: '/test.js' },
        line: 10, enabled: true, type: 'conditional', condition: 'x > 5'
      })

      const bp = store.breakpoints.get('/test.js')![0]
      expect(bp.verified).toBe(true)
      expect(bp.type).toBe('conditional')
      expect(bp.condition).toBe('x > 5')
    })
  })

  describe('Exception filters', () => {
    it('initExceptionFilters initializes from capabilities', () => {
      const store = useDebugStore()

      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught Exceptions', default: true, supportsCondition: true, conditionDescription: 'Expression' },
        { filter: 'uncaught', label: 'Uncaught Exceptions', default: false }
      ])

      expect(store.exceptionFilters).toHaveLength(2)
      expect(store.exceptionFilters[0].filterId).toBe('caught')
      expect(store.exceptionFilters[0].enabled).toBe(true)
      expect(store.exceptionFilters[0].supportsCondition).toBe(true)
      expect(store.exceptionFilters[1].filterId).toBe('uncaught')
      expect(store.exceptionFilters[1].enabled).toBe(false)
    })

    it('toggleExceptionFilter toggles enabled and syncs', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught Exceptions', default: false }
      ])

      store.toggleExceptionFilter('caught')

      expect(store.exceptionFilters[0].enabled).toBe(true)
      expect(mockElectronAPI.debug.setExceptionBreakpoints).toHaveBeenCalledWith(
        ['caught'],
        undefined
      )
    })

    it('updateExceptionFilterCondition updates condition and syncs', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', default: true, supportsCondition: true }
      ])

      store.updateExceptionFilterCondition('caught', 'err.code === 42')

      expect(store.exceptionFilters[0].condition).toBe('err.code === 42')
      expect(mockElectronAPI.debug.setExceptionBreakpoints).toHaveBeenCalled()
    })

    it('addSession with capabilities auto-initializes exception filters', () => {
      const store = useDebugStore()

      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' },
        threads: [],
        capabilities: {
          exceptionBreakpointFilters: [
            { filter: 'all', label: 'All Exceptions', default: false }
          ]
        }
      })

      expect(store.exceptionFilters).toHaveLength(1)
      expect(store.exceptionFilters[0].filterId).toBe('all')
    })

    it('syncExceptionFilters sends correct data via IPC', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', default: true, supportsCondition: true },
        { filter: 'uncaught', label: 'Uncaught', default: true }
      ])

      // Reset mocks from init
      resetAllMocks()

      store.exceptionFilters[0].condition = 'x > 1'
      store.syncExceptionFilters()

      expect(mockElectronAPI.debug.setExceptionBreakpoints).toHaveBeenCalledWith(
        ['caught', 'uncaught'],
        [{ filterId: 'caught', condition: 'x > 1' }]
      )
    })
  })

  describe('Getters', () => {
    it('activeSession returns correct session', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })

      expect(store.activeSession).not.toBeNull()
      expect(store.activeSession!.id).toBe('s1')
    })

    it('isDebugging returns true when sessions exist', () => {
      const store = useDebugStore()
      expect(store.isDebugging).toBe(false)

      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })

      expect(store.isDebugging).toBe(true)
    })

    it('isPaused returns true when active session is stopped', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'stopped',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })

      expect(store.isPaused).toBe(true)
    })

    it('currentFrame returns matched frame', () => {
      const store = useDebugStore()
      store.setStackFrames([
        { id: 1, name: 'main', line: 10, column: 1 },
        { id: 2, name: 'helper', line: 20, column: 1 }
      ])
      store.currentFrameId = 2

      expect(store.currentFrame).not.toBeNull()
      expect(store.currentFrame!.name).toBe('helper')
    })
  })

  describe('evaluate action', () => {
    it('calls IPC evaluate and returns result', async () => {
      const store = useDebugStore()
      const mockResult = { result: '42', type: 'number', variablesReference: 0 }
      mockElectronAPI.debug.evaluate.mockResolvedValue({
        success: true,
        data: mockResult
      })

      const result = await store.evaluate('x + 1', 'hover')

      expect(mockElectronAPI.debug.evaluate).toHaveBeenCalledWith(
        'x + 1',
        undefined,
        'hover',
        undefined
      )
      expect(result).toEqual(mockResult)
    })

    it('throws on evaluation failure', async () => {
      const store = useDebugStore()
      mockElectronAPI.debug.evaluate.mockResolvedValue({
        success: false,
        error: 'Variable not found'
      })

      await expect(store.evaluate('unknown', 'repl')).rejects.toThrow('Variable not found')
    })
  })

  describe('Stack frame management', () => {
    it('setStackFrames sets frames and auto-selects first', () => {
      const store = useDebugStore()
      store.setStackFrames([
        { id: 1, name: 'main', line: 10, column: 1 },
        { id: 2, name: 'helper', line: 20, column: 1 }
      ])

      expect(store.stackFrames).toHaveLength(2)
      expect(store.currentFrameId).toBe(1)
    })

    it('clearStackFrames resets frame state', () => {
      const store = useDebugStore()
      store.setStackFrames([{ id: 1, name: 'main', line: 10, column: 1 }])
      store.setScopes([{ name: 'Local', variablesReference: 1, expensive: false }])

      store.clearStackFrames()

      expect(store.stackFrames).toEqual([])
      expect(store.currentFrameId).toBeNull()
      expect(store.scopes).toEqual([])
    })
  })

  describe('Console management', () => {
    it('addConsoleMessage adds and limits to 1000', () => {
      const store = useDebugStore()

      for (let i = 0; i < 1005; i++) {
        store.addConsoleMessage({
          type: 'output',
          message: `msg ${i}`,
          timestamp: Date.now()
        })
      }

      expect(store.consoleMessages).toHaveLength(1000)
    })

    it('clearConsole empties messages', () => {
      const store = useDebugStore()
      store.addConsoleMessage({ type: 'output', message: 'test', timestamp: Date.now() })

      store.clearConsole()
      expect(store.consoleMessages).toEqual([])
    })
  })

  describe('reset', () => {
    it('resets all state including exception filters', () => {
      const store = useDebugStore()
      store.addSession({
        id: 's1', name: 'S1', type: 'node', state: 'running',
        config: { type: 'node', request: 'launch', name: 'S1' }, threads: []
      })
      store.initExceptionFilters([{ filter: 'caught', label: 'Caught', default: true }])
      store.addConsoleMessage({ type: 'output', message: 'test', timestamp: Date.now() })

      store.reset()

      expect(store.sessions).toEqual([])
      expect(store.activeSessionId).toBeNull()
      expect(store.exceptionFilters).toEqual([])
      expect(store.consoleMessages).toEqual([])
      expect(store.configSource).toBeNull()
      expect(store.detectedDebuggers).toEqual([])
      expect(store.autoDetectionDone).toBe(false)
    })
  })

  describe('detectDebuggers', () => {
    it('calls API and populates detectedDebuggers', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      const mockDebuggers: DetectedDebugger[] = [
        { type: 'node', displayName: 'Node.js', confidence: 'high', reason: 'package.json found' }
      ]
      mockElectronAPI.debug.detectDebuggers.mockResolvedValue({
        success: true,
        data: mockDebuggers
      })

      await store.detectDebuggers()

      expect(mockElectronAPI.debug.detectDebuggers).toHaveBeenCalledWith('/test-workspace')
      expect(store.detectedDebuggers).toEqual(mockDebuggers)
      expect(store.autoDetectionDone).toBe(true)
    })

    it('does nothing without workspace', async () => {
      const store = useDebugStore()
      await store.detectDebuggers()
      expect(mockElectronAPI.debug.detectDebuggers).not.toHaveBeenCalled()
    })

    it('sets autoDetectionDone even on error', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.detectDebuggers.mockRejectedValue(new Error('fail'))

      await store.detectDebuggers()

      expect(store.autoDetectionDone).toBe(true)
    })
  })

  describe('autoGenerateConfigurations', () => {
    it('generates and adds configurations', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.autoGenerateConfigurations.mockResolvedValue({
        success: true,
        data: [
          { type: 'node', request: 'launch', name: 'Launch Node.js', program: 'index.js' }
        ]
      })
      mockElectronAPI.debug.writeLaunchConfig.mockResolvedValue({ success: true })

      const result = await store.autoGenerateConfigurations()

      expect(result).toBe(true)
      expect(store.launchConfigurations).toHaveLength(1)
      expect(store.selectedConfigIndex).toBe(0)
      expect(mockElectronAPI.debug.autoGenerateConfigurations).toHaveBeenCalledWith('/test-workspace')
    })

    it('returns false when no configurations generated', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.autoGenerateConfigurations.mockResolvedValue({
        success: true,
        data: []
      })

      const result = await store.autoGenerateConfigurations()

      expect(result).toBe(false)
    })

    it('returns false without workspace', async () => {
      const store = useDebugStore()
      const result = await store.autoGenerateConfigurations()
      expect(result).toBe(false)
    })
  })

  describe('importFromVSCode', () => {
    it('calls import and reloads config', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.importFromVSCode.mockResolvedValue({ success: true })
      mockElectronAPI.debug.readLaunchConfig.mockResolvedValue({
        success: true,
        data: {
          config: {
            version: '0.2.0',
            configurations: [
              { type: 'node', request: 'launch', name: 'Imported' }
            ]
          },
          source: 'logos'
        }
      })

      const result = await store.importFromVSCode()

      expect(result).toBe(true)
      expect(mockElectronAPI.debug.importFromVSCode).toHaveBeenCalledWith('/test-workspace')
      expect(store.launchConfigurations).toHaveLength(1)
      expect(store.configSource).toBe('logos')
    })

    it('returns false when import fails', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.importFromVSCode.mockResolvedValue({ success: false })

      const result = await store.importFromVSCode()

      expect(result).toBe(false)
    })
  })

  describe('loadLaunchConfigurations', () => {
    it('tracks configSource from readLaunchConfig', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')

      mockElectronAPI.debug.readLaunchConfig.mockResolvedValue({
        success: true,
        data: {
          config: {
            version: '0.2.0',
            configurations: [{ type: 'python', request: 'launch', name: 'Py' }]
          },
          source: 'vscode'
        }
      })

      await store.loadLaunchConfigurations()

      expect(store.configSource).toBe('vscode')
      expect(store.launchConfigurations).toHaveLength(1)
    })

    it('resets configSource when no config found', async () => {
      const store = useDebugStore()
      store.setWorkspaceFolder('/test-workspace')
      store.configSource = 'logos'

      mockElectronAPI.debug.readLaunchConfig.mockResolvedValue({
        success: true,
        data: {
          config: null,
          source: null
        }
      })

      await store.loadLaunchConfigurations()

      expect(store.configSource).toBeNull()
    })
  })
})
