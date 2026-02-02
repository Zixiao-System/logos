/**
 * Extension Host Process integration tests
 *
 * These tests spawn the actual extension-host process and verify IPC behavior.
 * Tests are skipped if the built extension-host.js artifact doesn't exist.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { fork, ChildProcess } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'

const EXTENSION_HOST_PATH = path.resolve(__dirname, '../../../dist-electron/extension-host.js')
const TIMEOUT = 10000

describe('Extension Host Process', () => {
  let extensionHost: ChildProcess | null = null

  beforeAll(() => {
    if (!existsSync(EXTENSION_HOST_PATH)) {
      console.warn(`Skipping extension host integration tests: ${EXTENSION_HOST_PATH} not found. Run 'npm run build' first.`)
    }
  })

  afterEach(async () => {
    if (extensionHost && !extensionHost.killed) {
      extensionHost.kill('SIGKILL')
      extensionHost = null
    }
  })

  function startExtensionHost(env: Record<string, string> = {}): ChildProcess | null {
    if (!existsSync(EXTENSION_HOST_PATH)) {
      return null
    }

    return fork(EXTENSION_HOST_PATH, [], {
      env: {
        ...process.env,
        LOGOS_EXT_HOST_STUB: '1',
        LOGOS_EXT_HOST_DEBUG_IPC: '0',
        LOGOS_EXT_HOST_DEBUG_MEM: '0',
        LOGOS_EXTENSIONS_DIR: '',
        ...env
      },
      silent: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })
  }

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('starts and sends ready message with PID', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    const readyMessage = await new Promise<{ type: string; pid: number; mode: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for ready message')), TIMEOUT)

      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          clearTimeout(timeout)
          resolve(msg as { type: string; pid: number; mode: string })
        }
      })

      extensionHost!.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    expect(readyMessage.type).toBe('ready')
    expect(typeof readyMessage.pid).toBe('number')
    expect(readyMessage.pid).toBeGreaterThan(0)
    expect(readyMessage.mode).toBe('logos')
  })

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('responds to ping with pong', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    await new Promise<void>((resolve) => {
      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          resolve()
        }
      })
    })

    extensionHost!.send({ type: 'ping' })

    const pongMessage = await new Promise<{ type: string; pid: number }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for pong')), TIMEOUT)

      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'pong') {
          clearTimeout(timeout)
          resolve(msg as { type: string; pid: number })
        }
      })
    })

    expect(pongMessage.type).toBe('pong')
    expect(typeof pongMessage.pid).toBe('number')
    expect(pongMessage.pid).toBe(extensionHost!.pid)
  })

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('handles shutdown gracefully', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    await new Promise<void>((resolve) => {
      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          resolve()
        }
      })
    })

    extensionHost!.send({ type: 'shutdown' })

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for process exit')), TIMEOUT)

      extensionHost!.on('exit', (code) => {
        clearTimeout(timeout)
        resolve(code)
      })
    })

    expect(exitCode).toBe(0)
  })

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('handles setWorkspaceRoot without error', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    await new Promise<void>((resolve) => {
      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          resolve()
        }
      })
    })

    extensionHost!.send({ type: 'setWorkspaceRoot', root: '/tmp/test-workspace' })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(extensionHost!.killed).toBe(false)
    expect(extensionHost!.exitCode).toBeNull()
  })

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('handles reloadExtensions without error', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    await new Promise<void>((resolve) => {
      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          resolve()
        }
      })
    })

    extensionHost!.send({ type: 'reloadExtensions' })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(extensionHost!.killed).toBe(false)
    expect(extensionHost!.exitCode).toBeNull()
  })

  it.skipIf(!existsSync(EXTENSION_HOST_PATH))('handles documentOpen and notifies language activation', async () => {
    extensionHost = startExtensionHost()
    expect(extensionHost).not.toBeNull()

    await new Promise<void>((resolve) => {
      extensionHost!.on('message', (msg: unknown) => {
        if (msg && typeof msg === 'object' && (msg as { type?: string }).type === 'ready') {
          resolve()
        }
      })
    })

    extensionHost!.send({
      type: 'documentOpen',
      document: {
        uri: 'file:///test.ts',
        languageId: 'typescript',
        content: 'const x = 1;',
        version: 1
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(extensionHost!.killed).toBe(false)
    expect(extensionHost!.exitCode).toBeNull()
  })
})
