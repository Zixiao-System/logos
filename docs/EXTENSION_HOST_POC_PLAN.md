# VS Code Extension Host PoC 实现计划

**版本**: 1.0  
**日期**: 2026-01-27  
**目标**: 集成 VS Code OSS Extension Host 到 Logos IDE，支持 VS Code 扩展市场的扩展，同时保留轻量 UI 与性能优化空间。

---

## 1. 项目概览

### 1.1 核心目标

运行未修改的 VS Code 扩展（通过 Open VSX 或本地 VSIX）在 Logos IDE 中，通过 RPC 协议连接 Extension Host 与 Logos 的 UI/Editor，实现部分 VS Code API 兼容性。

### 1.2 设计原则

- **最小化 UI 耦合**: Extension Host 与 Logos UI 完全解耦，通过 IPC 消息通信。
- **逐步兼容性**: 优先支持常见 LSP 和轻量扩展，webview / debug adapter / 原生模块暂不支持。
- **清晰的 API 边界**: 定义显式的 API stub，仅实现目标扩展依赖的子集。
- **可控的依赖**: 重用 VS Code OSS 的 extension-host 进程，避免深度代码复制。
- **法律合规**: 保留所有开源许可、移除微软商标与遥测、审查第三方依赖。
- **权限与稳定性**: 未授权扩展不加载，首次启用弹出权限确认。

### 1.3 架构概图

```
┌─────────────────────────────────────────────────────────────┐
│                    Logos Renderer (Vue 3)                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Editor (Monaco)  │  FileExplorer  │  StatusBar      │    │
│  │  Services: cmd, workspace, window, languages        │    │
│  └─────────────────────────────────────────────────────┘    │
│           │ IPC (commands, notifications)    △              │
│           │                                  │               │
└─────────────────────────────────────────────────────────────┘
          │
          │ Main Process IPC Bridge
          │
┌─────────────────────────────────────────────────────────────┐
│              Logos Main (Electron)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ExtensionHostManager (Node.js)                      │    │
│  │  - Launch/shutdown extension-host process          │    │
│  │  - Translate IPC messages ↔ Extension Host RPC     │    │
│  │  - Manage workspaceRoot, file changes, auth        │    │
│  └─────────────────────────────────────────────────────┘    │
│           │ Child Process Stdio/IPC
│           │
└─────────────────────────────────────────────────────────────┘
          │
          │ Node.js Child Process
          │
┌─────────────────────────────────────────────────────────────┐
│     VS Code Extension Host (forked from vscode OSS)         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ExtensionHostProcess                                │    │
│  │  - Load extensions from ~/.logos/extensions         │    │
│  │  - Register language providers (LSP, formatters)    │    │
│  │  - Activate on events: onLanguage, onCommand        │    │
│  │  - Respond to RPC: provideCompletion, etc           │    │
│  └─────────────────────────────────────────────────────┘    │
│           │ Stdio RPC (JSON-RPC 2.0)
│           │
└─────────────────────────────────────────────────────────────┘
          │
          │ LSP Network (TCP/Unix socket)
          │
     [LSP Servers: tsserver, gopls, pylance-core, ...]
```

---

### 1.4 OSS 代码落点（待接入）

- 建议将 VS Code OSS 源码以 vendor 方式引入（例如 `vendor/vscode/`），保留 `LICENSE.txt` 与 `ThirdPartyNotices.txt`。
- Extension Host 入口：`src/vs/workbench/api/node/extensionHostProcess.ts`
- 主进程启动器：`src/vs/platform/extensions/electron-main/extensionHostStarter.ts`
- Glue code 落点：`electron/extension-host-manager.ts`（启动/IPC）与 `electron/services/extensionService.ts`（UI/主进程桥接）

## 2. 实现范围与阶段

### 2.1 Phase 1: Stub & RPC Foundation (核心骨架)

**目标**: 建立 Extension Host 与主进程的通信管道，定义最小 API 集合。

**交付物**:
- `electron/extension-host-manager.ts` - 启动/管理 extension host 进程，RPC 消息路由。
- `electron/extension-host/rpc-protocol.ts` - JSON-RPC 2.0 实现，消息序列化/反序列化。
- `electron/extension-host/vscode-api-stub.ts` - VS Code API 最小实现（workspace、commands、window、languages）。
- `src/services/extension-api.ts` - 前端对接 extension API 的服务（向后通信）。
- `docs/EXTENSION_HOST_TESTING_GUIDE.md` - 测试指南（目标扩展、测试用例）。

**关键任务**:
1. 在 `electron/main.ts` 中注册 `ExtensionHostManager`，在应用启动时创建子进程。
2. 实现双向 IPC: 主进程 → Extension Host（setWorkspaceRoot、文件变化）, Extension Host → 主进程（RPC 请求）。
3. 创建 `vscode` 模块 shim（仅 require('vscode') 可用），导出 workspace、commands、window、languages、Uri、Range 等。
4. 实现 JSON-RPC 请求/响应机制，带 timeout 和错误处理。
5. 在 Logos 主进程中实现 RPC handler 映射（如 `extensionHost.provideCompletions()` 调用 Monaco LSP 或 language daemon）。

**预期工时**: 4-6 周（包含调试与二阶段迭代）。

**关键风险**:
- Extension Host 依赖的 Node 版本与 Electron 版本不匹配 → 需测试 Electron 39.x + Node 18+ 兼容性。
- IPC 消息大小限制 → 对大 response（如完整类型定义）需做分页。
- 扩展 import 原生模块失败 → 需清单和白名单机制。

---

### 2.2 Phase 2: Core API Implementation (核心 API 实现)

**目标**: 实现 workspace、commands、window、languages、debugger 等常用 API。

**交付物**:
- `electron/extension-host/api/workspace.ts` - 文件 I/O、监听、configuration。
- `electron/extension-host/api/commands.ts` - 命令注册、执行、palette。
- `electron/extension-host/api/window.ts` - 对话框、输入框、消息、文本编辑。
- `electron/extension-host/api/languages.ts` - 语言、提供程序注册（completion、hover、format）。
- `electron/extension-host/api/debug.ts` - Debug Adapter Protocol 支持（可选，低优先级）。
- `electron/extension-host/api/webview.ts` - Webview 创建（基础实现，受限）。

**关键 API 子集**:

| API | 支持等级 | 实现方式 |
|-----|---------|--------|
| `workspace.rootPath`, `workspaceFolders` | ✅ 必须 | Logos 主进程维护状态 |
| `workspace.fs.*` (read/write/delete) | ✅ 必须 | 委托给 `fileService` |
| `workspace.findFiles()` | ⚠️ 有限 | Glob 匹配（小项目）或委托 daemon |
| `workspace.onDidChangeTextDocument` | ✅ 必须 | 编辑器变化事件推送 |
| `workspace.onDidCreateFiles` | ✅ 必须 | 文件系统事件监听 |
| `commands.registerCommand()` | ✅ 必须 | 本地注册 → UI 可执行 |
| `commands.executeCommand()` | ✅ 必须 | 查询本地或 UI 命令 |
| `window.showErrorMessage()` | ✅ 必须 | 转发到 Logos notification store |
| `window.showQuickPick()` | ⚠️ 有限 | Logos UI 对话框（基础实现） |
| `window.showInputBox()` | ⚠️ 有限 | 同上 |
| `window.createTextEditorDecorationType()` | ❌ 不支持 | 需要 Monaco editor API 深度集成 |
| `languages.registerCompletionItemProvider()` | ✅ 必须 | 注册→执行流程与 LSP 协同 |
| `languages.registerHoverProvider()` | ✅ 必须 | 同上 |
| `languages.registerDefinitionProvider()` | ✅ 必须 | 同上 |
| `languages.registerCodeActionsProvider()` | ⚠️ 有限 | 仅注册，UI 端实现触发 |
| `extensions.all`, `getExtension()` | ✅ 必须 | Extension Host 维护列表 |
| `webview.createWebviewPanel()` | ❌ 阶段 2 不实现 | Phase 3 考虑 |
| `debug.registerDebugAdapterTrackerFactory()` | ❌ 不支持 | DAP 集成复杂度高，后续 |

**预期工时**: 6-8 周。

**关键风险**:
- API 签名与 VS Code 有微妙差异 → 多个扩展会失败 → 需逐个调适。
- 文件系统操作性能 → 大项目 `workspace.findFiles()` 会卡顿 → 需缓存/异步。
- 命令执行上下文丢失（activeTextEditor、selection） → 需确保 RPC 消息带完整上下文。

---

### 2.3 Phase 3: Advanced Features (高级功能，可选)

- Webview 支持与通信（extension → webview → UI）。
- Debug Adapter Protocol 基础支持。
- 扩展市场集成（打开 Open VSX，搜索、安装、更新）。
- 插件签名与权限管理（文件访问、网络访问白名单）。

**预期工时**: 8+ 周（根据需求调整）。

---

## 3. 技术细节

### 3.1 Extension Host 进程启动

```typescript
// electron/extension-host-manager.ts

export class ExtensionHostManager {
  private process?: ChildProcess
  private extensionsDir: string

  async start(workspaceRoot: string): Promise<void> {
    const extensionsDir = resolve(app.getPath('userData'), 'extensions')
    this.extensionsDir = extensionsDir

    this.process = fork(
      resolve(__dirname, 'extension-host-process.js'),
      [],
      {
        env: {
          ...process.env,
          LOGOS_WORKSPACE_ROOT: workspaceRoot,
          LOGOS_EXTENSIONS_DIR: extensionsDir,
          NODE_ENV: isDev ? 'development' : 'production'
        },
        // 限制内存与 CPU
        silent: false,
        stdio: ['inherit', 'pipe', 'pipe', 'ipc']
      }
    )

    this.process.on('message', (msg) => this.handleExtensionHostMessage(msg))
    this.process.on('error', (err) => console.error('[ExtHost]', err))
  }

  async shutdown(): Promise<void> {
    this.process?.kill('SIGTERM')
    // 等待进程退出，超时则强制杀死
  }
}
```

### 3.2 RPC 协议定义

基于 JSON-RPC 2.0，消息格式：

```typescript
// 请求 (Main → ExtHost)
{
  jsonrpc: '2.0',
  id: 'req-123',
  method: 'extensionHost.$provideCompletions',
  params: {
    uri: 'file:///path/to/file.ts',
    position: { line: 0, character: 5 },
    context: { triggerKind: 0 }
  }
}

// 响应 (ExtHost → Main)
{
  jsonrpc: '2.0',
  id: 'req-123',
  result: [
    { label: 'foo', kind: 5, detail: 'variable' },
    { label: 'bar', kind: 6, detail: 'function' }
  ]
}

// 推送 (ExtHost → Main)
{
  jsonrpc: '2.0',
  method: 'extensionHost.$onDidChangeTextDocument',
  params: {
    document: {
      uri: 'file:///path/to/file.ts',
      languageId: 'typescript',
      version: 2,
      content: '...'
    },
    contentChanges: [{ range: {...}, text: '...' }]
  }
}
```

### 3.3 VS Code API Shim 结构

```typescript
// electron/extension-host/api/vscode-module.ts

export const vscodeModule = {
  // Core APIs
  Uri,
  Range,
  Position,
  
  // Namespace: workspace
  workspace: {
    rootPath: string | null,
    workspaceFolders: WorkspaceFolder[],
    fs: FileSystemProvider,
    openTextDocument: (uri: Uri | string) => Promise<TextDocument>,
    findFiles: (pattern: GlobPattern, exclude?: GlobPattern, maxResults?: number) => Promise<Uri[]>,
    onDidChangeTextDocument: EventEmitter<TextDocumentChangeEvent>,
    onDidCreateFiles: EventEmitter<FileCreateEvent>,
    // ... more
  },

  // Namespace: commands
  commands: {
    registerCommand: (command: string, callback: (...args: any[]) => any) => Disposable,
    executeCommand: (command: string, ...args: any[]) => Promise<any>,
    // ...
  },

  // Namespace: window
  window: {
    activeTextEditor: TextEditor | undefined,
    showErrorMessage: (message: string, ...items: string[]) => Promise<string | undefined>,
    showQuickPick: (items: QuickPickItem[]) => Promise<QuickPickItem | undefined>,
    // ...
  },

  // Namespace: languages
  languages: {
    registerCompletionItemProvider: (selector: DocumentSelector, provider: CompletionItemProvider) => Disposable,
    registerHoverProvider: (selector: DocumentSelector, provider: HoverProvider) => Disposable,
    // ...
  },

  // Namespace: extensions
  extensions: {
    all: Extension[],
    getExtension: (extensionId: string) => Extension | undefined,
    onDidChange: EventEmitter<void>,
  }
}
```

### 3.4 前端 API 服务集成

```typescript
// src/services/extension-api.ts

export class ExtensionAPIService {
  // 接收来自 Extension Host 的 RPC 请求
  async handleProvideCompletions(
    uri: string, 
    position: { line: number; character: number }
  ): Promise<CompletionItem[]> {
    // 查询 Monaco 已注册的 completion providers
    // 或调用 LSP server (languageDaemonService)
    // 合并结果返回
    return [...]
  }

  async handleExecuteCommand(command: string, ...args: any[]): Promise<any> {
    // 查询本地命令注册表（UI 命令）
    // 或转发给扩展（扩展命令）
    return commandRegistry.execute(command, args)
  }

  async handleShowErrorMessage(message: string, items: string[]): Promise<string | undefined> {
    // 推送到 Pinia notification store
    return showNotification({ type: 'error', message, actions: items })
  }
}
```

---

## 4. 测试计划

### 4.1 目标扩展清单（PoC 验证集）

1. **Prettier** (esbenp.prettier-vscode)
   - 提供格式化命令与 DocumentFormattingEditProvider
   - 验证: 代码格式化是否可用
   - 难度: ⭐ 低（纯命令，无 webview）

2. **ESLint** (dbaeumer.vscode-eslint)
   - 诊断、代码操作、修复命令
   - 验证: 错误提示与 quick fix
   - 难度: ⭐⭐ 中（需 diagnostics、代码操作）

3. **Go** (golang.go)
   - LSP 客户端、调试器（可选）、代码概览、测试
   - 验证: 代码补全、转到定义、快速选择测试
   - 难度: ⭐⭐⭐ 高（复杂扩展，多个 provider）

### 4.2 测试环境

- **Node.js**: 18.x LTS
- **Electron**: 29.x (当前版本)
- **VS Code 版本**: OSS latest (2024.12 或更新)
- **测试项目**: Node.js、Python、TypeScript 各一个小项目

### 4.3 测试检查清单

- [ ] Extension Host 进程启动，pid 输出到日志
- [ ] 三个目标扩展加载成功，激活事件触发
- [ ] 命令可从 UI 执行（Command Palette）
- [ ] 语言提供程序可调用（补全、hover、定义跳转）
- [ ] 文件保存时触发格式化/诊断
- [ ] 无 Node 原生模块加载错误或 TypeScript 编译错误
- [ ] 内存使用在合理范围（< 200MB）
- [ ] 启动时间 < 5s

---

## 5. 依赖与兼容性

### 5.1 新增 npm 依赖

```json
{
  "vscode": "^1.95.0",
  "vscode-jsonrpc": "^8.2.1",
  "vscode-languageclient": "^9.0.1",
  "@vscode/debugadapter": "^1.68.0",
  "@vscode/debugprotocol": "^1.68.0"
}
```

### 5.2 VS Code 源代码依赖

- 集成 VS Code OSS `extension-host` 的启动器（可通过 `@vscode/vsce` 工具链或源代码片段）。
- 或者使用 `vscode-test` 的 extension host 二进制。

### 5.3 法律与许可清理

- [ ] 确认 VS Code OSS 许可符合分发要求（MIT，保留声明）。
- [ ] 审查所有 VS Code 依赖的许可（部分可能有额外限制）。
- [ ] 移除/禁用 Microsoft Telemetry、Crash Reporting。
- [ ] 移除 Microsoft 商标（logo、标语）。
- [ ] 创建 `EXTENSION_COMPATIBILITY.md` 列出已知兼容/不兼容扩展。

---

## 6. 交付清单

### Phase 1 交付物

- [x] `docs/EXTENSION_HOST_POC_PLAN.md` (本文档)
- [ ] `electron/extension-host-manager.ts` - 启动/生命周期管理
- [ ] `electron/extension-host/rpc-protocol.ts` - JSON-RPC 2.0 实现
- [ ] `electron/extension-host/vscode-api-stub.ts` - 最小 API shim
- [ ] `src/services/extension-api.ts` - 前端服务
- [ ] `docs/EXTENSION_HOST_TESTING_GUIDE.md` - 测试手册
- [ ] 所有新增代码无 TypeScript 错误
- [ ] 单元测试覆盖率 > 60% (关键路径)

---

## 7. 风险与缓解策略

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|--------|
| Extension Host 频繁 crash | 功能不可用 | 中 | 自动重启、崩溃日志分析、扩展黑名单 |
| 扩展依赖原生模块 | 扩展加载失败 | 高 | 预先检查、清单维护、告知用户 |
| IPC 消息大小超限 | 大结果被截断 | 中 | 分页/流式传输、增加缓冲 |
| VS Code API 版本漂移 | 扩展兼容性降低 | 中 | 锁定 vscode 包版本、定期测试、文档化差异 |
| 扩展安全风险（任意代码执行） | 用户数据泄露 | 低 | 沙箱隔离、权限声明、签名验证 |
| 性能退化（启动时间 > 10s） | 用户体验差 | 中 | 异步加载、扩展启用/禁用切换、性能基准测试 |

---

## 8. 后续维护与演进

### 8.1 版本管理

- 每个 Phase 对应一个小版本（v2026.6.x）。
- 记录每个版本支持的扩展列表与已知问题。

### 8.2 社区反馈

- 在 GitHub 开设 "Extension Host" milestone。
- 维护兼容性反馈表（用户报告未支持功能）。
- 定期发布兼容扩展清单。

### 8.3 上游同步

- 若可行，考虑向 VS Code 或 Theia 社区贡献通用适配器代码。
- 定期检查 VS Code 安全更新。

---

## 9. 参考资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Source (vscode repo)](https://github.com/microsoft/vscode)
- [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification)
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
- [code-server Architecture](https://github.com/cdr/code-server)
- [Theia Architecture](https://github.com/eclipse-theia/theia)

---

**文档维护者**: Engineering Team  
**最后更新**: 2026-01-27  
**状态**: 草案 (Ready for Phase 1 Implementation)
