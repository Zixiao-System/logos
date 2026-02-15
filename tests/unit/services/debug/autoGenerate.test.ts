/**
 * Auto-generation and VS Code compatibility tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test stripJsonComments as an exported utility and
// exercise the auto-generation logic through the DebugService class.
// Because DebugService depends on Electron (BrowserWindow, EventEmitter, fs),
// we mock the heavy dependencies.

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn() }
}))

vi.mock('fs', () => {
  const actual: Record<string, unknown> = {}
  return {
    ...actual,
    default: {
      promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        access: vi.fn()
      }
    },
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn()
    }
  }
})

// Adapter manager mock - shared instance
const mockDetectDebuggers = vi.fn().mockResolvedValue([])
const mockAdapterManager = {
  detectDebuggers: mockDetectDebuggers,
  resolveAdapter: vi.fn(),
  createTransport: vi.fn(),
  createSSHTransport: vi.fn(),
  getAvailableAdapters: vi.fn().mockResolvedValue([]),
  getInstalledAdapters: vi.fn().mockResolvedValue([])
}

vi.mock('../../../../electron/services/debug/adapters', () => ({
  getAdapterManager: vi.fn(() => mockAdapterManager)
}))

vi.mock('../../../../electron/services/debug/DAPClient', () => ({
  DAPClient: vi.fn()
}))

vi.mock('../../../../electron/services/debug/transports/stdioTransport', () => ({
  StdioTransport: vi.fn()
}))

import * as fs from 'fs'
import { stripJsonComments } from '../../../../electron/services/debug/debugService'

// Access fs.promises mocks
const fsMock = fs.promises as unknown as {
  readFile: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
  mkdir: ReturnType<typeof vi.fn>
  access: ReturnType<typeof vi.fn>
}

describe('stripJsonComments', () => {
  it('strips single-line comments', () => {
    const input = `{
  // This is a comment
  "name": "test"
}`
    const result = stripJsonComments(input)
    expect(JSON.parse(result)).toEqual({ name: 'test' })
  })

  it('strips block comments', () => {
    const input = `{
  /* This is a block comment */
  "name": "test"
}`
    const result = stripJsonComments(input)
    expect(JSON.parse(result)).toEqual({ name: 'test' })
  })

  it('preserves strings containing comment-like characters', () => {
    const input = `{
  "url": "http://localhost:3000" // comment
}`
    const result = stripJsonComments(input)
    expect(JSON.parse(result)).toEqual({ url: 'http://localhost:3000' })
  })

  it('handles multi-line block comments', () => {
    const input = `{
  /*
   * Multi-line
   * block comment
   */
  "key": "value"
}`
    const result = stripJsonComments(input)
    expect(JSON.parse(result)).toEqual({ key: 'value' })
  })

  it('handles empty input', () => {
    expect(stripJsonComments('')).toBe('')
  })

  it('handles input with no comments', () => {
    const input = '{"name": "test"}'
    expect(stripJsonComments(input)).toBe(input)
  })

  it('handles escaped quotes in strings', () => {
    const input = `{
  "text": "he said \\"hello\\"" // comment
}`
    const result = stripJsonComments(input)
    expect(JSON.parse(result)).toEqual({ text: 'he said "hello"' })
  })
})

describe('DebugService - readLaunchConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns logos config when .logos/launch.json exists', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    const logosConfig = { version: '0.2.0', configurations: [{ type: 'node', request: 'launch', name: 'Test' }] }
    fsMock.readFile.mockImplementation(async (path: string) => {
      if (path.includes('.logos')) return JSON.stringify(logosConfig)
      throw new Error('not found')
    })

    const service = new DebugService(() => null)
    const result = await service.readLaunchConfig('/workspace')

    expect(result.source).toBe('logos')
    expect(result.config).toEqual(logosConfig)
  })

  it('falls back to .vscode/launch.json when .logos not found', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    const vscodeConfig = { version: '0.2.0', configurations: [{ type: 'python', request: 'launch', name: 'Py' }] }
    fsMock.readFile.mockImplementation(async (path: string) => {
      if (path.includes('.logos')) throw new Error('not found')
      if (path.includes('.vscode')) return JSON.stringify(vscodeConfig)
      throw new Error('not found')
    })

    const service = new DebugService(() => null)
    const result = await service.readLaunchConfig('/workspace')

    expect(result.source).toBe('vscode')
    expect(result.config).toEqual(vscodeConfig)
  })

  it('reads VS Code JSONC with comments', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    const jsoncContent = `{
  // Launch config
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Test" /* inline */
    }
  ]
}`
    fsMock.readFile.mockImplementation(async (path: string) => {
      if (path.includes('.logos')) throw new Error('not found')
      if (path.includes('.vscode')) return jsoncContent
      throw new Error('not found')
    })

    const service = new DebugService(() => null)
    const result = await service.readLaunchConfig('/workspace')

    expect(result.source).toBe('vscode')
    expect(result.config?.configurations).toHaveLength(1)
    expect(result.config?.configurations[0].name).toBe('Test')
  })

  it('returns null when neither config exists', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    fsMock.readFile.mockRejectedValue(new Error('not found'))

    const service = new DebugService(() => null)
    const result = await service.readLaunchConfig('/workspace')

    expect(result.config).toBeNull()
    expect(result.source).toBeNull()
  })
})

describe('DebugService - getDefaultLaunchConfig', () => {
  it('returns proper Go config', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')
    const service = new DebugService(() => null)

    const result = service.getDefaultLaunchConfig('go', '/workspace')

    expect(result.success).toBe(true)
    expect(result.config.type).toBe('go')
    expect(result.config.mode).toBe('auto')
  })

  it('returns proper cppdbg config', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')
    const service = new DebugService(() => null)

    const result = service.getDefaultLaunchConfig('cppdbg', '/workspace')

    expect(result.success).toBe(true)
    expect(result.config.type).toBe('cppdbg')
    expect(result.config.MIMode).toBeDefined()
    expect(result.config.setupCommands).toBeDefined()
  })

  it('returns proper lldb config', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')
    const service = new DebugService(() => null)

    const result = service.getDefaultLaunchConfig('lldb', '/workspace')

    expect(result.success).toBe(true)
    expect(result.config.type).toBe('lldb')
  })

  it('wraps result in { success: true, config }', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')
    const service = new DebugService(() => null)

    const result = service.getDefaultLaunchConfig('node', '/workspace')

    expect(result).toHaveProperty('success', true)
    expect(result).toHaveProperty('config')
    expect(result.config.type).toBe('node')
  })
})

describe('DebugService - autoGenerateConfigurations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no debuggers detected', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    mockDetectDebuggers.mockResolvedValue([])

    const service = new DebugService(() => null)
    const configs = await service.autoGenerateConfigurations('/workspace')

    expect(configs).toEqual([])
  })

  it('generates Node.js config from package.json', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    mockDetectDebuggers.mockResolvedValue([
      { type: 'node', displayName: 'Node.js', confidence: 'high', reason: 'package.json found' }
    ])

    fsMock.readFile.mockImplementation(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('package.json')) {
        return JSON.stringify({ main: 'src/index.js', scripts: { start: 'node src/index.js', dev: 'nodemon src/index.js' } })
      }
      throw new Error('not found')
    })
    fsMock.access.mockRejectedValue(new Error('not found'))

    const service = new DebugService(() => null)
    const configs = await service.autoGenerateConfigurations('/workspace')

    expect(configs.length).toBeGreaterThanOrEqual(1)
    expect(configs[0].type).toBe('node')
    expect(configs[0].program).toContain('src/index.js')
  })

  it('generates Python config for Django project', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    mockDetectDebuggers.mockResolvedValue([
      { type: 'python', displayName: 'Python', confidence: 'high', reason: 'manage.py found' }
    ])

    fsMock.access.mockImplementation(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('manage.py')) return
      throw new Error('not found')
    })

    const service = new DebugService(() => null)
    const configs = await service.autoGenerateConfigurations('/workspace')

    expect(configs.length).toBeGreaterThanOrEqual(1)
    expect(configs.some(c => c.name?.includes('Django'))).toBe(true)
  })

  it('generates Go config from go.mod', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    mockDetectDebuggers.mockResolvedValue([
      { type: 'go', displayName: 'Go', confidence: 'high', reason: 'go.mod found' }
    ])

    fsMock.access.mockImplementation(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('go.mod')) return
      throw new Error('not found')
    })

    const service = new DebugService(() => null)
    const configs = await service.autoGenerateConfigurations('/workspace')

    expect(configs.length).toBeGreaterThanOrEqual(1)
    expect(configs[0].type).toBe('go')
  })

  it('generates C/C++ config from CMakeLists.txt', async () => {
    const { DebugService } = await import('../../../../electron/services/debug/debugService')

    mockDetectDebuggers.mockResolvedValue([
      { type: 'cppdbg', displayName: 'C/C++', confidence: 'high', reason: 'CMakeLists.txt found' }
    ])

    fsMock.readFile.mockImplementation(async (filePath: string) => {
      if (typeof filePath === 'string' && filePath.includes('CMakeLists.txt')) {
        return 'project(myapp)\nadd_executable(myapp main.cpp)'
      }
      throw new Error('not found')
    })
    fsMock.access.mockRejectedValue(new Error('not found'))

    const service = new DebugService(() => null)
    const configs = await service.autoGenerateConfigurations('/workspace')

    expect(configs.length).toBeGreaterThanOrEqual(1)
    expect(configs[0].type).toBe('cppdbg')
    expect(configs[0].program).toContain('myapp')
  })
})
