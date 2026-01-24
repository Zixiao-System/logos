# Logos IDE 插件系统设计文档

## 1. 概述

本文档描述 Logos IDE 插件系统的设计方案。目标是对 VS Code 扩展保持高兼容性，支持 `.vsix` 安装，并以 Open VSX 或自建市场作为扩展来源，从而优先复用成熟生态而非重复造轮子。

## 2. 设计目标

- **安全性**: 插件运行在沙箱环境中，防止恶意代码影响系统
- **稳定性**: 插件崩溃不会影响主程序运行
- **易用性**: 对齐 VS Code 扩展 API 与 Manifest，降低迁移成本
- **性能**: 支持懒加载与按需激活
- **兼容性**: 优先兼容 VS Code API、激活事件与 `.vsix` 包结构
- **分发**: 默认支持 Open VSX，同时允许接入自建市场或离线仓库

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Logos IDE Main Process                  │
├──────────────────────┬──────────────────────────────────────┤
│   Extension Host     │              Core Services            │
│   (独立进程)         │   ┌──────────┐  ┌──────────────────┐ │
│  ┌─────────────────┐ │   │ File     │  │ Editor           │ │
│  │ VS Code API     │ │   │ Service  │  │ Service          │ │
│  │ Sandbox         │◄├──►├──────────┤  ├──────────────────┤ │
│  │ Extension A     │ │   │ Terminal │  │ Git              │ │
│  │ Extension B     │ │   │ Service  │  │ Service          │ │
│  │ Extension C     │ │   └──────────┘  └──────────────────┘ │
│  └─────────────────┘ │                                      │
└──────────────────────┴──────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Renderer       │
                    │  Process        │
                    │  (Vue App)      │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Marketplace     │
                    │ (Open VSX /     │
                    │  Self-host)     │
                    └─────────────────┘
```

### 3.2 Extension Host (扩展宿主)

- 独立的 Node 子进程
- 运行所有扩展代码
- 与主进程通过 IPC 通信
- 崩溃后可自动重启

### 3.3 VS Code 兼容 API

Logos 将扩展 API 以 `vscode` 命名空间对齐 VS Code 规范，优先支持主流扩展所需的核心能力。

```typescript
// vscode.d.ts - 插件 API 类型定义 (兼容子集)
declare namespace vscode {
  namespace window {
    function showInformationMessage(message: string): Promise<void>
    function showErrorMessage(message: string): Promise<void>
    function showInputBox(options: InputBoxOptions): Promise<string | undefined>
    function createOutputChannel(name: string): OutputChannel
    function createTerminal(options: TerminalOptions): Terminal
  }

  namespace workspace {
    const workspaceFolders: WorkspaceFolder[] | undefined
    const rootPath: string | undefined
    function getConfiguration(section: string): WorkspaceConfiguration
    function findFiles(include: string, exclude?: string): Promise<string[]>
  }

  namespace commands {
    function registerCommand(command: string, callback: (...args: any[]) => any): Disposable
    function executeCommand<T>(command: string, ...args: any[]): Promise<T>
  }

  namespace languages {
    function registerCompletionItemProvider(
      selector: DocumentSelector,
      provider: CompletionItemProvider
    ): Disposable
    function registerHoverProvider(
      selector: DocumentSelector,
      provider: HoverProvider
    ): Disposable
    function registerDefinitionProvider(
      selector: DocumentSelector,
      provider: DefinitionProvider
    ): Disposable
  }
}
```

### 3.4 Extension Manifest (VS Code Manifest)

扩展清单与 VS Code 兼容，支持 `engines.vscode`。必要时可增加 `engines.logos` 作为运行时版本约束。

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "version": "1.0.0",
  "description": "A sample extension",
  "publisher": "my-publisher",
  "engines": {
    "vscode": "^1.80.0",
    "logos": ">=2026.0.0"
  },
  "categories": ["Programming Languages", "Linters"],
  "activationEvents": [
    "onLanguage:javascript",
    "onCommand:myExtension.sayHello"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "myExtension.sayHello",
        "title": "Say Hello"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "myExtension.sayHello",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "My Extension",
      "properties": {
        "myExtension.enableFeature": {
          "type": "boolean",
          "default": true,
          "description": "Enable the feature"
        }
      }
    }
  }
}
```

### 3.5 激活事件 (Activation Events)

插件可声明以下激活事件（与 VS Code 对齐）：

| 事件 | 说明 |
|------|------|
| `onLanguage:<languageId>` | 打开指定语言的文件时激活 |
| `onCommand:<commandId>` | 执行指定命令时激活 |
| `workspaceContains:<glob>` | 工作区包含匹配文件时激活 |
| `onFileSystem:<scheme>` | 访问指定协议文件时激活 |
| `onView:<viewId>` | 展开指定视图时激活 |
| `onStartupFinished` | IDE 启动完成后激活 |
| `*` | 立即激活 (不推荐) |

### 3.6 VSIX 安装与市场来源

- **本地安装**: 支持通过 UI/CLI 直接安装 `.vsix` 文件
- **Open VSX**: 默认市场来源，支持搜索、安装、更新
- **自建市场**: 可部署兼容 Open VSX 的服务以支持内网与私有扩展
- **离线仓库**: 支持本地索引 + 本地 `.vsix` 包的离线安装

## 4. 实现计划

### Phase 0: 兼容性基座 (进行中)

- [ ] Extension Host 子进程基础框架
- [ ] 扩展目录结构与本地扫描
- [ ] 基础 IPC 通道与生命周期管理

### Phase 1: VSIX 本地安装与核心 API

- [ ] `.vsix` 安装/卸载/启用/禁用
- [ ] `vscode.commands` / `vscode.window` / `vscode.workspace` 基础子集
- [ ] 基础激活事件（`onCommand`、`onStartupFinished`）

### Phase 2: 语言与编辑器扩展能力

- [ ] 语言服务 API 子集（Completion/Hover/Definition）
- [ ] LSP 桥接与扩展能力统一注册
- [ ] `contributes` 中的菜单/配置/视图扩展

### Phase 3: 市场接入与更新机制

- [ ] Open VSX 搜索、安装、更新
- [ ] 自建市场 API 适配与切换
- [ ] 版本更新与兼容性校验

### Phase 4: GA 发布

- [ ] 安全审计、权限与签名策略
- [ ] 兼容性回归与性能基准
- [ ] VS Code 扩展 API 全量兼容性目标清单 (Core/UI/Webview)
- [ ] 插件市场 GA 版本目标：`v2026.6.7`

## 5. 安全考虑

### 5.1 沙箱机制

- 插件运行在独立进程中，与主进程隔离
- 使用 Node 沙箱与权限边界控制
- 限制文件系统访问范围
- 限制网络访问权限

### 5.2 权限系统

插件需要声明所需权限：

```json
{
  "permissions": [
    "filesystem:read",
    "filesystem:write",
    "network:fetch",
    "terminal:create"
  ]
}
```

### 5.3 代码签名

- 市场扩展支持签名校验
- 用户可选择仅安装签名扩展
- 支持企业内部签名证书

## 6. 示例插件

```typescript
// extension.ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext) {
  console.log('My extension is now active!')

  const disposable = vscode.commands.registerCommand('myExtension.sayHello', () => {
    vscode.window.showInformationMessage('Hello from My Extension!')
  })

  context.subscriptions.push(disposable)

  const outputChannel = vscode.window.createOutputChannel('My Extension')
  outputChannel.appendLine('Extension activated')

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'javascript' },
    {
      provideCompletionItems() {
        return [
          {
            label: 'mySnippet',
            kind: vscode.CompletionItemKind.Snippet,
            insertText: 'console.log($1);'
          }
        ]
      }
    }
  )

  context.subscriptions.push(completionProvider)
}

export function deactivate() {
  console.log('My extension is now deactivated')
}
```

## 7. 目录结构 (建议)

```
logos-ide/
├── electron/
│   ├── extension-host.ts         # 宿主进程入口
│   └── services/
│       └── extensionService.ts   # 主进程扩展服务
├── resources/
│   └── extensions/               # 内置扩展目录
├── user-data/
│   └── extensions/               # 本地安装扩展 (运行时路径)
└── types/
    └── vscode.d.ts               # 扩展 API 类型定义
```

## 8. 参考资料

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Open VSX](https://open-vsx.org/)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
