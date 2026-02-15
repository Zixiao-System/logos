/**
 * Configuration Manager - Manages debug launch configurations
 * Handles reading, writing, variable substitution, and auto-generation
 */
import * as path from 'path'
import * as fs from 'fs'
import type {
  DebugConfig,
  LaunchConfig,
  AttachConfig,
  LaunchConfigFile
} from './types'
import type { DetectedDebugger } from './adapters'

/**
 * Strip JSON comments (// and /* *​/) for VS Code JSONC compatibility
 */
export function stripJsonComments(text: string): string {
  let result = ''
  let i = 0
  let inString = false
  let stringChar = ''

  while (i < text.length) {
    if (inString) {
      if (text[i] === '\\') {
        result += text[i] + (text[i + 1] || '')
        i += 2
        continue
      }
      if (text[i] === stringChar) {
        inString = false
      }
      result += text[i]
      i++
    } else if (text[i] === '"') {
      inString = true
      stringChar = '"'
      result += text[i]
      i++
    } else if (text[i] === '/' && text[i + 1] === '/') {
      // Line comment — skip to end of line
      while (i < text.length && text[i] !== '\n') {
        i++
      }
    } else if (text[i] === '/' && text[i + 1] === '*') {
      // Block comment — skip to */
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++
      }
      i += 2 // skip */
    } else {
      result += text[i]
      i++
    }
  }

  return result
}

export class ConfigurationManager {
  private activeFilePath: string | null = null

  /**
   * Set the currently active file path for variable substitution
   */
  setActiveFile(filePath: string | null): void {
    this.activeFilePath = filePath
  }

  /**
   * Get the currently active file path
   */
  getActiveFile(): string | null {
    return this.activeFilePath
  }

  /**
   * Read launch configuration file
   * Tries .logos/launch.json first, falls back to .vscode/launch.json
   */
  async readLaunchConfig(workspaceFolder: string): Promise<{ config: LaunchConfigFile | null; source: 'logos' | 'vscode' | null }> {
    // Try .logos/launch.json first
    const logosPath = path.join(workspaceFolder, '.logos', 'launch.json')
    try {
      const content = await fs.promises.readFile(logosPath, 'utf-8')
      return { config: JSON.parse(content) as LaunchConfigFile, source: 'logos' }
    } catch {
      // Fall through to VS Code path
    }

    // Fall back to .vscode/launch.json
    const vscodePath = path.join(workspaceFolder, '.vscode', 'launch.json')
    try {
      const content = await fs.promises.readFile(vscodePath, 'utf-8')
      const stripped = stripJsonComments(content)
      return { config: JSON.parse(stripped) as LaunchConfigFile, source: 'vscode' }
    } catch {
      return { config: null, source: null }
    }
  }

  /**
   * Write launch configuration file
   */
  async writeLaunchConfig(workspaceFolder: string, config: LaunchConfigFile): Promise<void> {
    const configDir = path.join(workspaceFolder, '.logos')
    const configPath = path.join(configDir, 'launch.json')

    await fs.promises.mkdir(configDir, { recursive: true })
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Import launch.json from .vscode/ to .logos/
   */
  async importFromVSCode(workspaceFolder: string): Promise<boolean> {
    const vscodePath = path.join(workspaceFolder, '.vscode', 'launch.json')
    try {
      const content = await fs.promises.readFile(vscodePath, 'utf-8')
      const stripped = stripJsonComments(content)
      const config = JSON.parse(stripped) as LaunchConfigFile
      await this.writeLaunchConfig(workspaceFolder, config)
      return true
    } catch {
      return false
    }
  }

  /**
   * Auto-generate debug configurations based on detected project type
   */
  async autoGenerateConfigurations(workspaceFolder: string, detectedDebuggers: DetectedDebugger[]): Promise<DebugConfig[]> {
    const configs: DebugConfig[] = []

    for (const detected of detectedDebuggers) {
      const typeConfigs = await this.generateConfigsForType(detected.type, workspaceFolder)
      configs.push(...typeConfigs)
    }

    return configs
  }

  /**
   * Get default launch configuration for a debugger type
   */
  getDefaultLaunchConfig(type: string, workspaceFolder: string): { success: true; config: DebugConfig } {
    let config: DebugConfig
    switch (type) {
      case 'node':
        config = {
          type: 'node',
          request: 'launch',
          name: 'Launch Node.js',
          program: '${workspaceFolder}/index.js',
          cwd: workspaceFolder,
          console: 'integratedTerminal',
          skipFiles: ['<node_internals>/**']
        }
        break
      case 'python':
        config = {
          type: 'python',
          request: 'launch',
          name: 'Launch Python',
          program: '${file}',
          console: 'integratedTerminal',
          cwd: workspaceFolder,
          justMyCode: true
        }
        break
      case 'chrome':
        config = {
          type: 'chrome',
          request: 'launch',
          name: 'Launch Chrome',
          url: 'http://localhost:3000',
          webRoot: '${workspaceFolder}/src',
          sourceMaps: true
        }
        break
      case 'go':
        config = {
          type: 'go',
          request: 'launch',
          name: 'Launch Go',
          mode: 'auto',
          program: '${workspaceFolder}',
          cwd: workspaceFolder
        }
        break
      case 'cppdbg':
        config = {
          type: 'cppdbg',
          request: 'launch',
          name: 'Launch C/C++ (GDB/LLDB)',
          program: '${workspaceFolder}/a.out',
          args: [],
          stopOnEntry: false,
          cwd: workspaceFolder,
          MIMode: process.platform === 'darwin' ? 'lldb' : 'gdb',
          setupCommands: [
            { description: 'Enable pretty-printing for gdb', text: '-enable-pretty-printing', ignoreFailures: true }
          ]
        }
        break
      case 'lldb':
        config = {
          type: 'lldb',
          request: 'launch',
          name: 'Launch C/C++ (LLDB)',
          program: '${workspaceFolder}/a.out',
          args: [],
          cwd: workspaceFolder,
          stopOnEntry: false
        }
        break
      default:
        config = {
          type,
          request: 'launch',
          name: `Launch ${type}`,
          program: '${workspaceFolder}/main'
        }
        break
    }
    return { success: true, config }
  }

  /**
   * Resolve variables in config (${workspaceFolder}, ${file}, etc.)
   */
  resolveConfig(config: DebugConfig, workspaceFolder: string): object {
    return this.replaceVariablesInConfig({ ...config } as unknown as Record<string, unknown>, workspaceFolder)
  }

  /**
   * Replace VS Code-style variables in a config object.
   */
  private replaceVariablesInConfig(config: Record<string, unknown>, workspaceFolder: string): Record<string, unknown> {
    const activeFile = this.activeFilePath || ''

    // Compute file-related variables
    const fileBasename = activeFile ? path.basename(activeFile) : ''
    const fileExtname = activeFile ? path.extname(activeFile) : ''
    const fileBasenameNoExtension = fileBasename ? fileBasename.slice(0, -fileExtname.length || fileBasename.length) : ''
    const fileDirname = activeFile ? path.dirname(activeFile) : ''
    const relativeFile = activeFile && workspaceFolder
      ? path.relative(workspaceFolder, activeFile)
      : ''

    // Replace variables in string values
    const replaceVars = (str: string): string => {
      return str
        .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
        .replace(/\$\{file\}/g, activeFile)
        .replace(/\$\{fileBasename\}/g, fileBasename)
        .replace(/\$\{fileBasenameNoExtension\}/g, fileBasenameNoExtension)
        .replace(/\$\{fileDirname\}/g, fileDirname)
        .replace(/\$\{fileExtname\}/g, fileExtname)
        .replace(/\$\{relativeFile\}/g, relativeFile)
        .replace(/\$\{relativeFileDirname\}/g, relativeFile ? path.dirname(relativeFile) : '')
        .replace(/\$\{env:(\w+)\}/g, (_, varName) => process.env[varName] || '')
        .replace(/\$\{pathSeparator\}/g, path.sep)
    }

    // Recursively replace variables in object values
    const replaceInObject = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          result[key] = replaceVars(value)
        } else if (Array.isArray(value)) {
          result[key] = value.map(item =>
            typeof item === 'string' ? replaceVars(item) :
            (item !== null && typeof item === 'object' ? replaceInObject(item as Record<string, unknown>) : item)
          )
        } else if (value !== null && typeof value === 'object') {
          result[key] = replaceInObject(value as Record<string, unknown>)
        } else {
          result[key] = value
        }
      }
      return result
    }

    return replaceInObject(config)
  }

  /**
   * Prepare launch arguments with variable substitution
   */
  prepareLaunchArgs(config: LaunchConfig, workspaceFolder: string): object {
    return this.replaceVariablesInConfig({ ...config } as unknown as Record<string, unknown>, workspaceFolder)
  }

  /**
   * Prepare attach arguments with variable substitution
   */
  prepareAttachArgs(config: AttachConfig, workspaceFolder: string): object {
    return this.replaceVariablesInConfig({ ...config } as unknown as Record<string, unknown>, workspaceFolder)
  }

  /**
   * Generate debug configurations for a specific debugger type
   */
  private async generateConfigsForType(type: string, workspaceFolder: string): Promise<DebugConfig[]> {
    const configs: DebugConfig[] = []

    switch (type) {
      case 'node': {
        // Read package.json for smart config
        try {
          const pkgContent = await fs.promises.readFile(path.join(workspaceFolder, 'package.json'), 'utf-8')
          const pkg = JSON.parse(pkgContent) as Record<string, unknown>
          const scripts = pkg.scripts as Record<string, string> | undefined

          // Detect TypeScript
          let hasTypeScript = false
          try {
            await fs.promises.access(path.join(workspaceFolder, 'tsconfig.json'))
            hasTypeScript = true
          } catch { /* not TS */ }

          // Main entry
          const main = (pkg.main as string) || 'index.js'
          configs.push({
            type: 'node',
            request: 'launch',
            name: hasTypeScript ? 'Launch TypeScript' : 'Launch Node.js',
            program: `\${workspaceFolder}/${main}`,
            cwd: workspaceFolder,
            console: 'integratedTerminal',
            skipFiles: ['<node_internals>/**'],
            ...(hasTypeScript ? { outFiles: ['${workspaceFolder}/dist/**/*.js'], sourceMaps: true } : {})
          })

          // scripts.start
          if (scripts?.start) {
            configs.push({
              type: 'node',
              request: 'launch',
              name: 'npm start',
              runtimeExecutable: 'npm',
              runtimeArgs: ['run', 'start'],
              cwd: workspaceFolder,
              console: 'integratedTerminal'
            })
          }

          // scripts.dev
          if (scripts?.dev) {
            configs.push({
              type: 'node',
              request: 'launch',
              name: 'npm run dev',
              runtimeExecutable: 'npm',
              runtimeArgs: ['run', 'dev'],
              cwd: workspaceFolder,
              console: 'integratedTerminal'
            })
          }
        } catch {
          // No package.json, use basic config
          configs.push(this.getDefaultLaunchConfig('node', workspaceFolder).config)
        }
        break
      }

      case 'python': {
        // Check for Django
        try {
          await fs.promises.access(path.join(workspaceFolder, 'manage.py'))
          configs.push({
            type: 'python',
            request: 'launch',
            name: 'Django',
            program: '${workspaceFolder}/manage.py',
            args: ['runserver'],
            console: 'integratedTerminal',
            cwd: workspaceFolder,
            justMyCode: true
          })
        } catch { /* not Django */ }

        // Check for Flask
        try {
          await fs.promises.access(path.join(workspaceFolder, 'app.py'))
          configs.push({
            type: 'python',
            request: 'launch',
            name: 'Flask',
            program: '${workspaceFolder}/app.py',
            console: 'integratedTerminal',
            cwd: workspaceFolder,
            justMyCode: true,
            env: { FLASK_APP: 'app.py', FLASK_DEBUG: '1' }
          })
        } catch { /* not Flask */ }

        // Check for main.py
        try {
          await fs.promises.access(path.join(workspaceFolder, 'main.py'))
          configs.push({
            type: 'python',
            request: 'launch',
            name: 'Launch main.py',
            program: '${workspaceFolder}/main.py',
            console: 'integratedTerminal',
            cwd: workspaceFolder,
            justMyCode: true
          })
        } catch { /* no main.py */ }

        // If no specific configs, add current file
        if (configs.length === 0) {
          configs.push(this.getDefaultLaunchConfig('python', workspaceFolder).config)
        }
        break
      }

      case 'go': {
        // Read go.mod for module name
        try {
          await fs.promises.access(path.join(workspaceFolder, 'go.mod'))

          configs.push({
            type: 'go',
            request: 'launch',
            name: 'Launch Package',
            mode: 'auto',
            program: '${workspaceFolder}',
            cwd: workspaceFolder
          })

          configs.push({
            type: 'go',
            request: 'launch',
            name: 'Test Package',
            mode: 'test',
            program: '${workspaceFolder}',
            cwd: workspaceFolder
          })
        } catch {
          configs.push(this.getDefaultLaunchConfig('go', workspaceFolder).config)
        }
        break
      }

      case 'cppdbg':
      case 'lldb': {
        const miMode: 'gdb' | 'lldb' = process.platform === 'darwin' ? 'lldb' : 'gdb'
        const useType = type === 'lldb' ? 'lldb' : 'cppdbg'

        // Detect CMake
        try {
          const cmakeContent = await fs.promises.readFile(path.join(workspaceFolder, 'CMakeLists.txt'), 'utf-8')
          const projectMatch = cmakeContent.match(/project\s*\(\s*(\w+)/i)
          const projectName = projectMatch ? projectMatch[1] : 'app'

          configs.push({
            type: useType,
            request: 'launch',
            name: `Launch CMake (${projectName})`,
            program: `\${workspaceFolder}/build/${projectName}`,
            args: [],
            stopOnEntry: false,
            cwd: workspaceFolder,
            ...(useType === 'cppdbg' ? {
              MIMode: miMode,
              setupCommands: [
                { description: 'Enable pretty-printing for gdb', text: '-enable-pretty-printing', ignoreFailures: true }
              ]
            } : {})
          })
        } catch { /* no CMake */ }

        // Detect Makefile
        try {
          await fs.promises.access(path.join(workspaceFolder, 'Makefile'))
          if (configs.length === 0) {
            configs.push({
              type: useType,
              request: 'launch',
              name: 'Launch (Makefile)',
              program: '${workspaceFolder}/a.out',
              args: [],
              stopOnEntry: false,
              cwd: workspaceFolder,
              ...(useType === 'cppdbg' ? {
                MIMode: miMode,
                setupCommands: [
                  { description: 'Enable pretty-printing for gdb', text: '-enable-pretty-printing', ignoreFailures: true }
                ]
              } : {})
            })
          }
        } catch { /* no Makefile */ }

        if (configs.length === 0) {
          configs.push(this.getDefaultLaunchConfig(useType, workspaceFolder).config)
        }
        break
      }
    }

    return configs
  }
}
