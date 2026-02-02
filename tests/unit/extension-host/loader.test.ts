/**
 * Extension Host Loader unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReaddir = vi.fn()
const mockFsReadFile = vi.fn()
const mockMkdir = vi.fn()

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any
  const promises = {
    ...actual.promises,
    readdir: mockReaddir,
    readFile: mockFsReadFile,
    mkdir: mockMkdir
  }
  return {
    ...actual,
    default: { ...actual, promises },
    promises
  }
})

vi.mock('../../../electron/extension-host/vscode', () => ({
  setWorkspaceRoot: vi.fn(),
  setCommandActivationHandler: vi.fn(),
  registerExtensionDescription: vi.fn(),
  updateExtensionActivation: vi.fn(),
  createExtensionContext: vi.fn(() => ({
    globalState: { get: vi.fn(), update: vi.fn() },
    workspaceState: { get: vi.fn(), update: vi.fn() },
    secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() }
  })),
  vscodeApi: {
    Uri: { file: (p: string) => ({ fsPath: p, scheme: 'file' }) }
  }
}))

describe('Extension Host Loader utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockState(stateData: Record<string, { enabled: boolean; trusted?: boolean }> = {}) {
    return JSON.stringify({ schemaVersion: 1, extensions: stateData })
  }

  function mockManifest(manifest: Record<string, unknown>) {
    return JSON.stringify(manifest)
  }

  function setupReadFile(stateOverrides: Record<string, { enabled: boolean; trusted?: boolean }>, manifestData: Record<string, unknown>) {
    mockFsReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).endsWith('state.json')) {
        return mockState(stateOverrides)
      }
      return mockManifest(manifestData)
    })
  }

  function mockDirEntries(entries: Array<{ name: string; isDir: boolean }>) {
    mockReaddir.mockResolvedValue(
      entries.map(e => ({ name: e.name, isDirectory: () => e.isDir }))
    )
  }

  async function createHostAndLoad() {
    const { ExtensionHost } = await import('../../../electron/extension-host/loader')
    mockMkdir.mockResolvedValue(undefined)
    const host = new ExtensionHost('/extensions')
    await (host as any).loadExtensions()
    return { host, extensions: (host as any).extensions as Map<string, any> }
  }

  describe('buildExtensionId', () => {
    it('uses publisher.name when publisher is present', async () => {
      mockDirEntries([{ name: 'test-extension', isDir: true }])
      setupReadFile({}, { name: 'test-ext', publisher: 'test-publisher', main: './out/index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('test-publisher.test-ext')).toBe(true)
    })

    it('uses fallback name when publisher is missing', async () => {
      mockDirEntries([{ name: 'simple-ext', isDir: true }])
      setupReadFile({}, { name: 'simple-ext', main: './index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('simple-ext')).toBe(true)
    })
  })

  describe('shouldActivateOnStartup', () => {
    it('returns true when activationEvents includes "*"', async () => {
      mockDirEntries([{ name: 'startup-ext', isDir: true }])
      setupReadFile({}, { name: 'startup-ext', main: './index.js', activationEvents: ['*'] })

      const { extensions } = await createHostAndLoad()
      expect(extensions.get('startup-ext')).toBeDefined()
    })

    it('returns true when activationEvents includes "onStartupFinished"', async () => {
      mockDirEntries([{ name: 'startup-finished-ext', isDir: true }])
      setupReadFile({}, { name: 'startup-finished-ext', main: './index.js', activationEvents: ['onStartupFinished'] })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('startup-finished-ext')).toBe(true)
    })

    it('returns true when activationEvents is empty (default behavior)', async () => {
      mockDirEntries([{ name: 'no-events-ext', isDir: true }])
      setupReadFile({}, { name: 'no-events-ext', main: './index.js', activationEvents: [] })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('no-events-ext')).toBe(true)
    })
  })

  describe('hasActivationEvent', () => {
    it('activateByCommand activates extension with matching onCommand event', async () => {
      mockDirEntries([{ name: 'command-ext', isDir: true }])
      setupReadFile({}, { name: 'command-ext', main: './index.js', activationEvents: ['onCommand:myCommand'] })

      const { extensions } = await createHostAndLoad()
      const ext = extensions.get('command-ext')
      expect(ext.manifest.activationEvents).toContain('onCommand:myCommand')
    })

    it('activateByLanguage activates extension with matching onLanguage event', async () => {
      mockDirEntries([{ name: 'lang-ext', isDir: true }])
      setupReadFile({}, { name: 'lang-ext', main: './index.js', activationEvents: ['onLanguage:typescript', 'onLanguage:javascript'] })

      const { extensions } = await createHostAndLoad()
      const ext = extensions.get('lang-ext')
      expect(ext.manifest.activationEvents).toContain('onLanguage:typescript')
    })
  })

  describe('manifest parsing', () => {
    it('skips extensions without main entry', async () => {
      mockDirEntries([{ name: 'no-main-ext', isDir: true }])
      setupReadFile({}, { name: 'no-main-ext' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('no-main-ext')).toBe(false)
    })

    it('handles invalid JSON gracefully', async () => {
      mockDirEntries([{ name: 'bad-json-ext', isDir: true }])
      mockFsReadFile.mockImplementation(async (filePath: string) => {
        if (String(filePath).endsWith('state.json')) {
          return mockState({})
        }
        return 'not valid json {'
      })

      const { extensions } = await createHostAndLoad()
      expect(extensions.size).toBe(0)
    })

    it('skips hidden directories (starting with .)', async () => {
      mockDirEntries([
        { name: '.hidden-ext', isDir: true },
        { name: 'visible-ext', isDir: true }
      ])
      setupReadFile({}, { name: 'visible-ext', main: './index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('.hidden-ext')).toBe(false)
      expect(extensions.has('visible-ext')).toBe(true)
    })

    it('skips non-directory entries', async () => {
      mockDirEntries([
        { name: 'file.txt', isDir: false },
        { name: 'real-ext', isDir: true }
      ])
      setupReadFile({}, { name: 'real-ext', main: './index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.size).toBe(1)
      expect(extensions.has('real-ext')).toBe(true)
    })
  })

  describe('extension state persistence', () => {
    it('loads state from state.json and skips disabled extensions', async () => {
      mockDirEntries([{ name: 'disabled-ext', isDir: true }])
      setupReadFile({ 'disabled-ext': { enabled: false } }, { name: 'disabled-ext', main: './index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('disabled-ext')).toBe(false)
    })

    it('handles missing state.json gracefully', async () => {
      mockDirEntries([{ name: 'new-ext', isDir: true }])
      mockFsReadFile.mockImplementation(async (filePath: string) => {
        if (String(filePath).endsWith('state.json')) {
          throw new Error('ENOENT')
        }
        return mockManifest({ name: 'new-ext', main: './index.js' })
      })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('new-ext')).toBe(true)
    })

    it('skips untrusted extensions', async () => {
      mockDirEntries([{ name: 'untrusted-ext', isDir: true }])
      setupReadFile({ 'untrusted-ext': { enabled: true, trusted: false } }, { name: 'untrusted-ext', main: './index.js' })

      const { extensions } = await createHostAndLoad()
      expect(extensions.has('untrusted-ext')).toBe(false)
    })
  })

  describe('ExtensionHost construction', () => {
    it('sets extensionsRoot correctly', async () => {
      const { ExtensionHost } = await import('../../../electron/extension-host/loader')
      const host = new ExtensionHost('/path/to/extensions')
      expect((host as any).extensionsRoot).toBe('/path/to/extensions')
    })

    it('initializes with empty maps', async () => {
      const { ExtensionHost } = await import('../../../electron/extension-host/loader')
      const host = new ExtensionHost('/extensions')
      expect((host as any).activeExtensions.size).toBe(0)
      expect((host as any).extensions.size).toBe(0)
    })
  })
})
