# VS Code 运行和调试 (Run & Debug) 架构文档

> 本文档供 Claude Code 实例参考实现，详细描述 VS Code 的调试功能架构、关键文件、接口、数据流和设计模式。

---

## 目录

1. [总体架构概览](#1-总体架构概览)
2. [目录结构](#2-目录结构)
3. [核心接口与类型](#3-核心接口与类型)
4. [DebugService - 调试服务（核心协调器）](#4-debugservice---调试服务)
5. [DebugSession - 调试会话与 DAP 协议](#5-debugsession---调试会话与-dap-协议)
6. [DebugModel - 数据模型层](#6-debugmodel---数据模型层)
7. [断点系统](#7-断点系统)
8. [配置管理](#8-配置管理)
9. [调试控制台 / REPL](#9-调试控制台--repl)
10. [UI 视图与 Viewlet](#10-ui-视图与-viewlet)
11. [调试工具栏](#11-调试工具栏)
12. [关键数据流](#12-关键数据流)
13. [设计模式与约定](#13-设计模式与约定)
14. [Context Keys 一览](#14-context-keys-一览)
15. [实现参考要点](#15-实现参考要点)

---

## 1. 总体架构概览

VS Code 的调试系统采用**分层、事件驱动**架构，遵循 [Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/)：

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层 (UI)                          │
│  DebugViewlet │ CallStackView │ VariablesView │ REPL │ Toolbar  │
├─────────────────────────────────────────────────────────────────┤
│                    服务层 (Service Layer)                        │
│        DebugService  │  ConfigurationManager  │  AdapterManager │
├─────────────────────────────────────────────────────────────────┤
│                    会话层 (Session Layer)                        │
│              DebugSession  │  RawDebugSession                   │
├─────────────────────────────────────────────────────────────────┤
│                    适配器层 (Adapter Layer)                      │
│    AbstractDebugAdapter │ StreamDebugAdapter │ ExecutableAdapter │
├─────────────────────────────────────────────────────────────────┤
│                    数据模型层 (Model Layer)                      │
│   DebugModel │ Thread │ StackFrame │ Breakpoint │ ReplModel     │
└─────────────────────────────────────────────────────────────────┘
```

**核心原则：**
- **依赖注入** — 所有服务通过构造函数注入
- **事件驱动** — Emitter/Event 模式贯穿全部层
- **懒加载** — 变量、作用域、调用栈按需获取
- **多会话** — 支持同时运行多个调试会话
- **适配器抽象** — 通过 DAP 支持任意语言的调试器

---

## 2. 目录结构

```
src/vs/workbench/contrib/debug/
├── browser/                          # 浏览器/工作台层实现 (约46个文件)
│   ├── debug.contribution.ts         # ★ 主注册入口 (~712行)
│   ├── debugService.ts               # ★ IDebugService 实现 (~1523行)
│   ├── debugSession.ts               # ★ DebugSession 实现 (~1682行)
│   ├── rawDebugSession.ts            # DAP 协议传输层
│   ├── debugAdapterManager.ts        # 适配器生命周期管理
│   ├── debugConfigurationManager.ts  # launch.json 配置管理
│   ├── debugTaskRunner.ts            # preLaunchTask 执行
│   │
│   │  # ─── UI 视图 ───
│   ├── debugViewlet.ts               # 调试侧边栏容器
│   ├── callStackView.ts              # 调用栈视图 (~1147行)
│   ├── variablesView.ts              # 变量视图 (~852行)
│   ├── watchExpressionsView.ts       # 监视表达式视图 (~695行)
│   ├── breakpointsView.ts            # 断点视图 (~2471行)
│   ├── loadedScriptsView.ts          # 已加载脚本视图
│   ├── disassemblyView.ts            # 反汇编视图
│   ├── repl.ts                       # ★ 调试控制台/REPL (~1232行)
│   ├── replViewer.ts                 # REPL 树渲染器 (~474行)
│   │
│   │  # ─── UI 组件 ───
│   ├── debugToolBar.ts               # 浮动调试工具栏
│   ├── debugHover.ts                 # 编辑器内变量悬浮
│   ├── exceptionWidget.ts            # 异常信息组件
│   ├── breakpointWidget.ts           # 断点编辑组件
│   ├── debugActionViewItems.ts       # 启动按钮/会话选择器
│   │
│   │  # ─── 编辑器贡献 ───
│   ├── debugEditorContribution.ts    # 编辑器调试装饰
│   ├── breakpointEditorContribution.ts # 断点编辑器装饰
│   ├── callStackEditorContribution.ts  # 调用栈编辑器装饰
│   │
│   │  # ─── 其他 ───
│   ├── debugCommands.ts              # 调试命令注册
│   ├── debugColors.ts                # 调试相关颜色定义
│   ├── debugStatus.ts                # 状态栏贡献
│   ├── debugProgress.ts              # 进度条贡献
│   ├── debugQuickAccess.ts           # 快速启动调试
│   ├── debugMemory.ts                # 内存查看
│   └── debugExpressionRenderer.ts    # 表达式值渲染 (ANSI, 着色等)
│
├── common/                           # 平台无关的共享代码 (约25个文件)
│   ├── debug.ts                      # ★ 核心接口定义 (~1438行)
│   ├── debugModel.ts                 # ★ 数据模型 (~2126行)
│   ├── debugViewModel.ts             # UI 状态模型 (ViewModel)
│   ├── debugSource.ts                # Source 文件抽象
│   ├── debugStorage.ts               # 持久化存储 (断点、监视等)
│   ├── replModel.ts                  # ★ REPL 数据模型 (~500行)
│   ├── breakpoints.ts                # 断点模型补充
│   ├── debugSchemas.ts               # launch.json JSON Schema
│   ├── debugUtils.ts                 # 工具函数
│   ├── debugVisualizers.ts           # 自定义可视化 API
│   ├── debugCompoundRoot.ts          # 组合启动根节点
│   ├── debugTelemetry.ts             # 遥测
│   ├── abstractDebugAdapter.ts       # ★ 抽象适配器基类
│   └── debugger.ts                   # 调试器注册
│
├── node/                             # Node 进程实现
│   ├── debugAdapter.ts               # ★ 进程/Socket/管道适配器
│   └── terminals.ts                  # 终端管理
│
├── electron-browser/                 # Electron 特有
│   └── extensionHostDebugService.ts  # 扩展宿主调试
│
└── test/                             # 测试
    ├── browser/                      # 浏览器测试 (13个文件)
    ├── common/                       # 通用测试 (2个文件)
    └── node/                         # Node 测试 (3个文件)
```

---

## 3. 核心接口与类型

**定义文件：** `src/vs/workbench/contrib/debug/common/debug.ts`

### 3.1 调试状态枚举

```typescript
export const enum State {
    Inactive,      // 无活动会话
    Initializing,  // 正在初始化
    Stopped,       // 执行暂停（命中断点等）
    Running        // 调试目标正在运行
}
```

### 3.2 IDebugService — 核心服务接口

```typescript
export interface IDebugService {
    // ─── 状态 ───
    readonly state: State;
    readonly onDidChangeState: Event<State>;
    readonly onWillNewSession: Event<IDebugSession>;
    readonly onDidNewSession: Event<IDebugSession>;
    readonly onDidEndSession: Event<{ session: IDebugSession; restart: boolean }>;

    // ─── 子系统访问 ───
    getModel(): IDebugModel;
    getViewModel(): IViewModel;
    getConfigurationManager(): IConfigurationManager;
    getAdapterManager(): IAdapterManager;

    // ─── 会话控制 ───
    startDebugging(launch: ILaunch | undefined,
                   configOrName?: IConfig | string,
                   options?: IDebugSessionOptions): Promise<boolean>;
    stopSession(session: IDebugSession | undefined, disconnect?: boolean): Promise<void>;
    restartSession(session: IDebugSession, restartData?: unknown): Promise<void>;

    // ─── 断点管理 ───
    addBreakpoints(uri: uri, rawBreakpoints: IBreakpointData[]): Promise<IBreakpoint[]>;
    updateBreakpoints(uri: uri, data: Map<string, IBreakpointUpdateData>): Promise<void>;
    removeBreakpoints(id?: string | string[]): Promise<void>;

    // ─── 监视表达式 ───
    addWatchExpression(name?: string): void;
    renameWatchExpression(id: string, newName: string): void;

    // ─── 焦点管理 ───
    focusStackFrame(stackFrame: IStackFrame | undefined,
                    thread?: IThread, session?: IDebugSession, options?: object): Promise<void>;
}
```

### 3.3 IDebugSession — 会话接口

```typescript
export interface IDebugSession extends ITreeElement, IDisposable {
    readonly configuration: IConfig;
    readonly state: State;
    readonly parentSession: IDebugSession | undefined;
    readonly name: string;

    // ─── 生命周期 ───
    initialize(dbgr: IDebugger): Promise<void>;
    launchOrAttach(config: IConfig): Promise<void>;
    restart(): Promise<void>;
    terminate(restart?: boolean): Promise<void>;
    disconnect(restart?: boolean): Promise<void>;

    // ─── 线程/帧 ───
    getThread(threadId: number): IThread | undefined;
    getAllThreads(): IThread[];

    // ─── DAP 请求 ───
    stackTrace(threadId: number, startFrame: number, levels: number): Promise<DebugProtocol.StackTraceResponse>;
    scopes(frameId: number): Promise<DebugProtocol.ScopesResponse>;
    variables(variablesReference: number, threadId?: number): Promise<DebugProtocol.VariablesResponse>;
    evaluate(expression: string, frameId?: number, context?: string): Promise<DebugProtocol.EvaluateResponse>;

    // ─── 执行控制 ───
    continue(threadId: number): Promise<void>;
    next(threadId: number): Promise<void>;
    stepIn(threadId: number, targetId?: number): Promise<void>;
    stepOut(threadId: number): Promise<void>;
    pause(threadId: number): Promise<void>;

    // ─── 断点 ───
    sendBreakpoints(modelUri: uri, bpts: IBreakpoint[]): Promise<void>;
    sendFunctionBreakpoints(fbps: IFunctionBreakpoint[]): Promise<void>;
    sendExceptionBreakpoints(exbps: IExceptionBreakpoint[]): Promise<void>;

    // ─── 事件 ───
    readonly onDidChangeState: Event<void>;
    readonly onDidLoadedSource: Event<LoadedSourceEvent>;
    readonly onDidCustomEvent: Event<DebugProtocol.Event>;
}
```

### 3.4 IDebugModel — 数据模型接口

```typescript
export interface IDebugModel extends ITreeElement {
    getSessions(): IDebugSession[];
    getSession(sessionId: string | undefined): IDebugSession | undefined;

    // ─── 断点 ───
    getBreakpoints(): ReadonlyArray<IBreakpoint>;
    getFunctionBreakpoints(): ReadonlyArray<IFunctionBreakpoint>;
    getDataBreakpoints(): ReadonlyArray<IDataBreakpoint>;
    getExceptionBreakpoints(): ReadonlyArray<IExceptionBreakpoint>;
    getInstructionBreakpoints(): ReadonlyArray<IInstructionBreakpoint>;
    areBreakpointsActivated(): boolean;

    // ─── 监视 ───
    getWatchExpressions(): ReadonlyArray<IExpression & IEvaluate>;

    // ─── 事件 ───
    readonly onDidChangeBreakpoints: Event<IBreakpointsChangeEvent | undefined>;
    readonly onDidChangeCallStack: Event<void>;
}
```

### 3.5 IViewModel — UI 状态接口

```typescript
export interface IViewModel extends ITreeElement {
    readonly focusedSession: IDebugSession | undefined;
    readonly focusedThread: IThread | undefined;
    readonly focusedStackFrame: IStackFrame | undefined;

    isMultiSessionView(): boolean;
    getSelectedExpression(): { expression: IExpression; settingWatch: boolean } | undefined;
    setSelectedExpression(expression: IExpression | undefined, settingWatch: boolean): void;
}
```

### 3.6 IThread / IStackFrame / IScope

```typescript
export interface IThread extends ITreeElement {
    readonly session: IDebugSession;
    readonly threadId: number;
    readonly name: string;
    readonly stopped: boolean;
    readonly stoppedDetails: IRawStoppedDetails | undefined;

    getCallStack(): ReadonlyArray<IStackFrame>;
    getTopStackFrame(): IStackFrame | undefined;

    continue(): Promise<void>;
    next(): Promise<void>;
    stepIn(): Promise<void>;
    stepOut(): Promise<void>;
    pause(): Promise<void>;
}

export interface IStackFrame extends ITreeElement {
    readonly thread: IThread;
    readonly frameId: number;
    readonly name: string;
    readonly range: IRange;
    readonly source: Source;
    readonly canRestart: boolean;

    getScopes(): Promise<IScope[]>;
    getMostSpecificScopes(range: IRange): Promise<ReadonlyArray<IScope>>;
    restart(): Promise<void>;
}

export interface IScope extends IExpressionContainer {
    readonly name: string;
    readonly expensive: boolean;
    readonly range?: IRange;
}
```

---

## 4. DebugService — 调试服务

**文件：** `src/vs/workbench/contrib/debug/browser/debugService.ts` (~1523行)

### 4.1 服务注册

```typescript
// debug.contribution.ts
registerSingleton(IDebugService, DebugService, InstantiationType.Delayed);
```

### 4.2 核心组成

```typescript
class DebugService implements IDebugService {
    private model: DebugModel;                    // 数据模型
    private viewModel: ViewModel;                 // UI 状态
    private configurationManager: ConfigurationManager;  // 配置管理
    private adapterManager: AdapterManager;       // 适配器管理
    private taskRunner: DebugTaskRunner;          // 任务运行器
    private debugStorage: DebugStorage;           // 持久化存储
    private sessionCancellationTokens: Map<string, CancellationTokenSource>;
}
```

### 4.3 启动调试流程 (`startDebugging`)

```
startDebugging(launch, configOrName, options)
    │
    ├─ 1. 检查工作区信任 (Workspace Trust)
    ├─ 2. 触发 'onDebug' 扩展激活事件
    ├─ 3. 保存所有文件 (如果 saveBeforeStart)
    ├─ 4. 解析配置 (按名称或 selectedConfiguration)
    │
    ├─ 5a. 如果是组合启动 (Compound):
    │   ├─ 运行 compound.preLaunchTask
    │   ├─ 创建 CompoundRoot (如果 stopAll=true)
    │   └─ Promise.all() 并行启动所有配置
    │
    └─ 5b. 如果是单个配置:
        └─ createSession(config)
            ├─ 解析调试器类型 (如果无 type，从编辑器猜测)
            ├─ resolveConfigurationByProviders()  ← 扩展提供/修改配置
            ├─ substituteVariables()  ← ${workspaceFolder} 等替换
            ├─ 检查并发会话冲突
            ├─ 运行 preLaunchTask
            ├─ resolveDebugConfigurationWithSubstitutedVariables()
            ├─ 验证适配器和 request 类型
            └─ doCreateSession()
                ├─ new DebugSession(...)
                ├─ model.addSession(session)
                ├─ 打开调试视图 (openDebug 设置)
                └─ launchOrAttachToSession(session)
                    ├─ 注册会话监听器
                    ├─ session.initialize(debugger)  ← DAP initialize
                    ├─ session.launchOrAttach(config) ← DAP launch/attach
                    └─ 设置焦点到新会话
```

### 4.4 会话监听与终止

```typescript
// 注册事件监听 (registerSessionListeners)
session.onDidChangeState  → 更新状态、context keys、焦点
session.onDidEndAdapter   → 清理、运行 postDebugTask、重新聚焦

// 终止流程
stopSession(session)
    ├─ session.terminate() 或 session.disconnect()
    ├─ 清除线程/帧数据
    ├─ 触发 onDidEndSession
    └─ 更新 context keys
```

### 4.5 多会话管理

- **父子关系**：通过 `parentSession` 选项，子会话可由父会话管理
- **组合启动**：`compound.configurations` 数组中的配置并行启动
- **CompoundRoot**：当 `stopAll=true` 时，任一会话终止会触发全部终止
- **生命周期托管**：`lifecycleManagedByParent=true` 时父会话终止级联到子会话

### 4.6 重启处理

```
restartSession(session)
    │
    ├─ 路径1: 适配器支持 supportsRestartRequest
    │   ├─ 运行 pre/post-restart 任务
    │   └─ 发送 DAP restart 请求
    │
    └─ 路径2: 手动重启 (传统方式)
        ├─ 终止当前会话
        ├─ 等待 300ms
        ├─ 重新读取/解析 launch.json
        └─ 重新启动会话
```

---

## 5. DebugSession — 调试会话与 DAP 协议

### 5.1 DebugSession 类

**文件：** `src/vs/workbench/contrib/debug/browser/debugSession.ts` (~1682行)

```typescript
class DebugSession implements IDebugSession {
    private raw: RawDebugSession | undefined;     // DAP 协议层
    private model: DebugModel;                     // 数据模型引用
    private threads = new Map<number, Thread>();  // 线程映射
    private sources = new Map<string, Source>();  // 源文件映射
    private repl: ReplModel;                       // REPL 数据
    private stoppedDetails: IRawStoppedDetails[];  // 停止事件信息
}
```

### 5.2 初始化序列

```
session.initialize(debugger)
    │
    ├─ 1. 创建 IDebugAdapter (通过 debugger.createDebugAdapter)
    ├─ 2. 包装为 RawDebugSession
    ├─ 3. 发送 DAP "initialize" 请求
    │     ├─ 声明客户端能力 (supportsVariableType, supportsProgressReporting 等)
    │     └─ 接收适配器能力 (Capabilities)
    ├─ 4. 存储 capabilities
    └─ 5. 设置异常断点

session.launchOrAttach(config)
    │
    ├─ 发送 DAP "launch" 或 "attach" 请求
    ├─ 等待 "initialized" 事件
    │     ├─ 发送所有断点 (setBreakpoints)
    │     ├─ 发送异常断点 (setExceptionBreakpoints)
    │     ├─ 发送函数断点 (setFunctionBreakpoints)
    │     └─ 发送 configurationDone
    └─ 调试目标开始执行
```

### 5.3 RawDebugSession — DAP 传输层

**文件：** `src/vs/workbench/contrib/debug/browser/rawDebugSession.ts`

- 包装 `IDebugAdapter`，路由 DAP 事件和请求/响应
- 管理适配器能力合并（从 initialize 响应和 capabilities 事件）
- 事件分发：`stopped`, `continued`, `thread`, `output`, `breakpoint` 等

### 5.4 AbstractDebugAdapter — 协议基类

**文件：** `src/vs/workbench/contrib/debug/common/abstractDebugAdapter.ts`

```
消息流:
sendRequest(command, args) → internalSend('request') → sendMessage()
                                                        ↓ (传输)
acceptMessage(response) → processQueue() → pendingRequests.get(seq)(response)
```

- **序列号管理**：单调递增 seq 用于请求/响应关联
- **消息队列**：保证消息处理顺序
- **任务边界**：事件间插入 `await timeout(0)` 确保微任务顺序
- **超时处理**：可配置的请求超时

### 5.5 适配器实现

**文件：** `src/vs/workbench/contrib/debug/node/debugAdapter.ts`

| 适配器类型 | 通信方式 | 用途 |
|-----------|---------|------|
| `ExecutableDebugAdapter` | 子进程 stdin/stdout | 最常用，启动调试适配器进程 |
| `SocketDebugAdapter` | TCP Socket | 远程调试 |
| `NamedPipeDebugAdapter` | 命名管道/Unix Socket | Windows/Unix 本地通信 |

**StreamDebugAdapter** 处理 DAP 消息帧格式：
```
Content-Length: <字节数>\r\n\r\n<JSON 负载>
```

### 5.6 线程状态管理

- 使用 `ThreadStatusScheduler` 串行化线程操作（防止竞态）
- 每个线程有独立的取消令牌
- 调用栈懒获取：第一帧立即获取，其余异步
- 停止事件处理：`allThreadsStopped=true` 时标记所有线程停止

---

## 6. DebugModel — 数据模型层

**文件：** `src/vs/workbench/contrib/debug/common/debugModel.ts` (~2126行)

### 6.1 类层次结构

```
DebugModel
├── sessions: IDebugSession[]
├── breakpoints: Breakpoint[]
├── functionBreakpoints: FunctionBreakpoint[]
├── exceptionBreakpoints: ExceptionBreakpoint[]
├── dataBreakpoints: DataBreakpoint[]
├── instructionBreakpoints: InstructionBreakpoint[]
└── watchExpressions: Expression[]

ExpressionContainer (基类)
├── reference: number (variablesReference)
├── namedVariables / indexedVariables
├── getChildren(): Promise<IExpression[]>
└── evaluateLazy(): Promise<void>
    │
    ├── Expression (监视表达式)
    │   ├── name: string
    │   ├── available: boolean
    │   └── evaluate(): Promise<void>
    │
    ├── Variable (变量)
    │   ├── name / evaluateName / type
    │   └── parent: ExpressionContainer
    │
    └── Scope (作用域)
        ├── name: string
        ├── expensive: boolean
        └── range?: IRange

Thread
├── callStack: IStackFrame[]
├── session: IDebugSession
├── threadId: number
├── stoppedDetails: IRawStoppedDetails
└── getCallStack(): IStackFrame[]

StackFrame
├── thread: Thread
├── frameId: number
├── source: Source
├── range: IRange
└── getScopes(): Promise<IScope[]> (懒加载)
```

### 6.2 变量分块策略

大数组自动分块避免一次加载过多：

```
10,000 个索引变量:
├── [0..99]      ← 点击展开时才获取
├── [100..199]
├── [200..299]
└── ...
```

`ExpressionContainer.BASE_CHUNK_SIZE = 100`

### 6.3 会话无关设计

断点存储每个会话的独立验证数据：
```typescript
breakpoint.setBreakpointSessionData(sessionId, data: DebugProtocol.Breakpoint)
```

同一断点可以在不同会话中有不同的验证状态和行号。

---

## 7. 断点系统

### 7.1 断点类型

| 类型 | 类 | DAP 请求 | 描述 |
|------|-----|---------|------|
| 行断点 | `Breakpoint` | `setBreakpoints` | 源文件特定行/列 |
| 函数断点 | `FunctionBreakpoint` | `setFunctionBreakpoints` | 函数入口 |
| 数据断点 | `DataBreakpoint` | `setDataBreakpoints` | 内存/变量变化 |
| 指令断点 | `InstructionBreakpoint` | `setInstructionBreakpoints` | 汇编级 |
| 异常断点 | `ExceptionBreakpoint` | `setExceptionBreakpoints` | 异常抛出时 |

### 7.2 断点属性

所有断点共享 `BaseBreakpoint` 基类：
- `enabled` — 是否启用
- `condition` — 条件表达式 (如 `x > 5`)
- `hitCondition` — 命中次数条件 (如 `>= 3`)
- `logMessage` — 日志点消息 (如 `"value is {x}"`)
- `mode` / `modeLabel` — 断点模式
- `triggeredBy` — 触发器断点 ID

行断点额外属性：
- `originalUri` / `uri` — 文件位置
- `lineNumber` / `column` — 行列号
- `sessionAgnosticData` — 会话无关的原始行列号

### 7.3 断点生命周期

```
用户设置断点 (行100)
    │
    ├─ IDebugService.addBreakpoints(uri, [{ lineNumber: 100 }])
    ├─ DebugModel.addBreakpoints() → 创建 Breakpoint 对象
    ├─ DebugStorage 持久化到 workspace
    │
    └─ 对每个活动会话:
        ├─ session.sendBreakpoints(uri, breakpoints)
        │   ├─ breakpoint.toDAP() → DebugProtocol.SourceBreakpoint
        │   └─ RawDebugSession → DAP "setBreakpoints" 请求
        │
        └─ 适配器验证断点
            ├─ 返回 verified=true/false
            ├─ 可能调整行号 (line → actualLine)
            └─ setBreakpointSessionData() 存储会话数据
```

### 7.4 触发器断点 (Triggered Breakpoints)

```
断点 A: condition="x > 5"
断点 B: triggeredBy=A

流程:
1. 断点 A 命中 → enableDependentBreakpoints(hitBreakpointIds)
2. 找到断点 B (triggeredBy == A)
3. 重新发送断点 B 到适配器 (SessionDidTrigger 标志)
4. 等待最多 1500ms (waitToResume promise)
5. 所有步进命令需先 await waitForTriggeredBreakpoints()
```

### 7.5 断点发送策略

```typescript
sendAllBreakpoints(session)
    ├─ 行断点     → sendBreakpoints() (按 URI 分组)
    ├─ 函数断点   → sendFunctionBreakpoints() (需 supportsFunctionBreakpoints)
    ├─ 数据断点   → sendDataBreakpoints() (需 supportsDataBreakpoints)
    ├─ 指令断点   → sendInstructionBreakpoints() (需 supportsInstructionBreakpoints)
    └─ 异常断点   → sendExceptionBreakpoints()
```

文件变更时延迟发送：`updateBreakpoints(..., sendOnResourceSaved=true)` 在文件保存时才真正发送。

---

## 8. 配置管理

**文件：** `src/vs/workbench/contrib/debug/browser/debugConfigurationManager.ts`

### 8.1 配置源

按优先级排列：
1. **文件夹级** — `{workspace}/.vscode/launch.json`
2. **工作区级** — `.code-workspace` 文件中的 launch 配置
3. **用户级** — 用户全局设置

### 8.2 配置解析管线

```
launch.json 原始配置
    │
    ├─ resolveConfigurationByProviders(type, config)
    │   ├─ 扩展 resolveDebugConfiguration(folderUri, config)
    │   └─ 支持类型特定 (type='python') 和通配符 (type='*')
    │
    ├─ substituteVariables()
    │   └─ ${workspaceFolder}, ${file}, ${env:VAR}, ${command:xxx} 等
    │
    └─ resolveDebugConfigurationWithSubstitutedVariables()
        └─ 扩展最终修改机会
```

### 8.3 动态配置

扩展可通过 `IDebugConfigurationProvider` (triggerKind=Dynamic) 提供动态配置，无需 launch.json。

### 8.4 组合启动 (Compound)

```json
{
    "compounds": [{
        "name": "Full Stack",
        "configurations": ["Server", "Client"],
        "preLaunchTask": "build-all",
        "stopAll": true
    }]
}
```

---

## 9. 调试控制台 / REPL

### 9.1 架构概览

```
Repl (ViewPane, 主UI组件)
├── replInput: CodeEditorWidget (Monaco 编辑器，用户输入)
├── tree: WorkbenchAsyncDataTree (输出显示)
├── filter: ReplFilter (过滤器)
├── history: HistoryNavigator<string> (历史记录，最多100条)
└── repl: ReplModel (数据模型)
```

### 9.2 REPL 数据模型

**文件：** `src/vs/workbench/contrib/debug/common/replModel.ts` (~500行)

**元素类型层次：**

```typescript
IReplElement (基础接口)
├── ReplEvaluationInput    // 用户输入的表达式文本
├── ReplEvaluationResult   // 表达式求值结果 (extends ExpressionContainer)
│   └── 可展开子节点 (通过 variablesReference)
├── ReplOutputElement      // 调试目标的控制台输出
│   ├── value: string      // 输出文本
│   ├── severity: Severity // Error/Warning/Info/Ignore
│   ├── count: number      // 重复输出折叠计数
│   └── expression?        // 可选的对象检查
├── ReplVariableElement    // 无文本的变量输出
├── ReplGroup              // 可折叠分组容器
│   └── children: IReplElement[] (递归嵌套)
└── RawObjectReplElement   // 原始 JS 对象
```

### 9.3 输出处理 (`appendToRepl`)

```typescript
ReplModel.appendToRepl(session, { output, expression, sev, source })
```

关键行为：
- **ANSI 清屏** — `\u001b[2J` 清除之前的输出
- **相同行折叠** — 如果 `debug.console.collapseIdenticalLines` 启用，连续相同输出增加 `count` 而非新建元素
- **多行处理** — 按 `\n` 拆分，每行独立处理
- **行连接** — 不以 `\n` 结尾的输出与前一个元素连接
- **最大行数** — 超过 `maximumLines` 时 FIFO 删除旧元素

### 9.4 表达式求值流程

```
用户输入 "myVar + 5" 并按 Enter
    │
    ├─ repl.acceptReplInput()
    ├─ session.addReplExpression(stackFrame, "myVar + 5")
    │
    ├─ ReplModel.addReplExpression()
    │   ├─ 创建 ReplEvaluationInput("myVar + 5")  ← 显示用户输入
    │   └─ 创建 ReplEvaluationResult("myVar + 5") ← 等待求值
    │
    ├─ ReplEvaluationResult.evaluateExpression()
    │   └─ session.evaluate("myVar + 5", frameId, "repl")
    │       └─ RawDebugSession → DAP "evaluate" 请求
    │
    └─ 响应: { result: "27", variablesReference: 0 }
        ├─ ReplEvaluationResult.value = "27"
        └─ 树重新渲染
```

### 9.5 DAP 输出事件处理

```
DAP OutputEvent { output: "Error: file not found", category: 'stderr', line: 42, source: {...} }
    │
    ├─ RawDebugSession._onDidOutput 触发
    ├─ DebugSession 事件处理器
    │   ├─ 映射 severity (stderr → Error)
    │   ├─ 记录源位置 (file:line)
    │   └─ 分组处理 (group: 'start'/'startCollapsed'/'end')
    │
    ├─ session.appendToRepl({ output, sev, source })
    ├─ ReplModel.appendToRepl()
    ├─ 创建 ReplOutputElement
    ├─ _onDidChangeElements.fire()
    │
    └─ Repl.refreshScheduler (50ms 防抖)
        └─ tree.updateChildren()
```

### 9.6 REPL 树渲染器

**文件：** `src/vs/workbench/contrib/debug/browser/replViewer.ts` (~474行)

| 渲染器 | 目标元素 | 功能 |
|--------|---------|------|
| `ReplEvaluationInputsRenderer` | `ReplEvaluationInput` | 箭头图标 + 表达式文本 |
| `ReplEvaluationResultsRenderer` | `ReplEvaluationResult` | 类型着色的求值结果 |
| `ReplOutputElementRenderer` | `ReplOutputElement` | 计数徽章 + ANSI 着色 + 源链接 |
| `ReplGroupRenderer` | `ReplGroup` | 分组标题 + 折叠 |
| `ReplVariablesRenderer` | `ReplVariableElement` | 变量名值对 (可编辑) |
| `ReplRawObjectsRenderer` | `RawObjectReplElement` | 键值对展示 |

### 9.7 ANSI 转义码支持

**文件：** `src/vs/workbench/contrib/debug/browser/debugANSIHandling.ts`

支持的 ANSI 码：
- **颜色**: 基本色 (30-37/40-47), 亮色 (90-97/100-107), 8-bit (256色), 24-bit (真彩色)
- **格式**: 粗体(1), 暗淡(2), 斜体(3), 下划线(4), 闪烁(5), 反色(7), 删除线(9) 等
- **重置**: 代码 0

通过 `session.capabilities.supportsANSIStyling` 检查适配器是否支持。

### 9.8 过滤系统

**文件：** `src/vs/workbench/contrib/debug/browser/replFilter.ts` (~68行)

- **包含过滤**: `text` — 只显示匹配项
- **排除过滤**: `!text` — 隐藏匹配项
- **逗号分隔**: 多个过滤条件 OR 组合
- **仅过滤** `ReplOutputElement`（不过滤表达式和变量）
- **模糊匹配**: 使用 `matchesFuzzy`

### 9.9 配置选项

```typescript
debug.console: {
    fontSize: number,           // 字体大小
    fontFamily: string,         // 字体
    lineHeight: number,         // 行高
    wordWrap: boolean,          // 自动换行
    historySuggestions: boolean, // 历史建议
    collapseIdenticalLines: boolean, // 折叠重复行
    maximumLines: number,       // 最大行数 (FIFO)
    acceptSuggestionOnEnter: 'on' | 'off' | 'smart'
}
```

---

## 10. UI 视图与 Viewlet

### 10.1 视图注册

**文件：** `src/vs/workbench/contrib/debug/browser/debug.contribution.ts`

```typescript
// 视图容器 (侧边栏)
const viewContainer = Registry.as<IViewContainersRegistry>(...)
    .registerViewContainer({
        id: VIEWLET_ID,  // 'workbench.view.debug'
        title: 'Run and Debug',
        icon: icons.runViewIcon,
        order: 3,
    }, ViewContainerLocation.Sidebar);

// 视图注册
viewsRegistry.registerViews([
    { id: VARIABLES_VIEW_ID,      name: "Variables",      order: 10, weight: 40 },
    { id: WATCH_VIEW_ID,          name: "Watch",          order: 20, weight: 10 },
    { id: CALLSTACK_VIEW_ID,      name: "Call Stack",     order: 30, weight: 30 },
    { id: BREAKPOINTS_VIEW_ID,    name: "Breakpoints",    order: 40, weight: 20 },
    { id: LOADED_SCRIPTS_VIEW_ID, name: "Loaded Scripts", order: 35, weight: 5  },
    { id: WelcomeView.ID,         name: WelcomeView.LABEL,order: 1,  weight: 40 },
], viewContainer);
```

### 10.2 DebugViewPaneContainer — 调试侧边栏

**文件：** `src/vs/workbench/contrib/debug/browser/debugViewlet.ts` (~305行)

- 扩展 `ViewPaneContainer`
- 管理 `StartDebugActionViewItem`（启动按钮+配置下拉）
- 管理 `FocusSessionActionViewItem`（会话选择器）
- 处理断点视图的最大尺寸约束

### 10.3 CallStackView — 调用栈视图

**文件：** `src/vs/workbench/contrib/debug/browser/callStackView.ts` (~1147行)

**数据类型：**
```typescript
type CallStackItem = IStackFrame | IThread | IDebugSession | string
                   | ThreadAndSessionIds | IStackFrame[];
```

**渲染器：**
- `SessionsRenderer` — 会话级 ("Running" / "Paused on breakpoint")
- `ThreadsRenderer` — 线程级 (线程名+状态)
- `StackFramesRenderer` — 帧级 (文件名:行号, 可重启)
- `ErrorsRenderer` — 错误消息
- `LoadMoreRenderer` — 分页加载更多
- `ShowMoreRenderer` — 显示弱化帧

**特性：**
- `WorkbenchCompressibleAsyncDataTree` 压缩单子节点链
- 50ms 防抖更新
- 新会话自动展开

### 10.4 VariablesView — 变量视图

**文件：** `src/vs/workbench/contrib/debug/browser/variablesView.ts` (~852行)

**层次结构：**
```
StackFrame
└── Scopes (Local, Global 等)
    └── Variables
        └── Properties (嵌套)
```

**功能：**
- 双击编辑变量值 (需 `supportsSetVariable`)
- 数据可视化器支持 (`IDebugVisualizerService`)
- 每帧缓存视图状态
- 自动展开首个非 expensive 作用域
- 右键菜单：复制值、复制表达式、添加到监视、查看内存

### 10.5 WatchExpressionsView — 监视表达式视图

**文件：** `src/vs/workbench/contrib/debug/browser/watchExpressionsView.ts` (~695行)

- 拖拽排序 (`WatchExpressionsDragAndDrop`)
- 双击编辑表达式名或值
- 懒求值（新增时使用缓存）
- 数据断点上下文支持

### 10.6 BreakpointsView — 断点视图

**文件：** `src/vs/workbench/contrib/debug/browser/breakpointsView.ts` (~2471行)

- 文件分组显示
- 内联编辑条件/命中次数/日志消息
- 启用/禁用复选框
- 智能尺寸（其他视图折叠时最大化）
- 数据断点带访问类型图标

### 10.7 视图交互模式

```
DebugService (Model & State)
    ↓ 事件触发
ViewModel 更新
    ↓ 监听器
View 更新 (异步数据源)
    ↓ 渲染器
DOM 创建
    ↓ 用户交互
命令执行
    ↓ 返回
DebugService
```

**示例 — 选择栈帧：**
1. 用户点击 CallStackView 中的栈帧
2. `tree.onDidOpen` 监听器触发
3. `debugService.focusStackFrame()` 调用
4. VariablesView 监听 `onDidFocusStackFrame`
5. 获取该帧的作用域
6. 树更新显示变量

---

## 11. 调试工具栏

**文件：** `src/vs/workbench/contrib/debug/browser/debugToolBar.ts` (~496行)

### 11.1 位置模式

| 模式 | 描述 |
|------|------|
| `floating` | 可拖拽的浮动工具栏（默认） |
| `docked` | 集成到 viewlet 标题栏 |
| `commandCenter` | 命令中心子菜单 |

### 11.2 按钮组成

```
[拖拽区] [继续/暂停] [步过] [步入] [步出] [重启] [停止/断开] [会话选择器]
```

### 11.3 StartDebugActionViewItem

**文件：** `src/vs/workbench/contrib/debug/browser/debugActionViewItems.ts` (~361行)

启动按钮 + 配置下拉框的组合控件：
- 静态配置 (来自 launch.json)
- 最近使用的动态配置 (最多3个)
- 动态提供者配置
- "添加配置..." 选项
- 分隔符支持

---

## 12. 关键数据流

### 12.1 断点命中完整流程

```
1. 调试适配器 → RawDebugSession.onDidStop(StoppedEvent)
   └─ event.body: { threadId, reason, hitBreakpointIds }

2. RawDebugSession → DebugSession.handleStop()
   ├─ enableDependentBreakpoints(hitBreakpointIds)
   └─ ThreadStatusScheduler 串行处理:
       ├─ DAP stackTrace(threadId) → 创建 StackFrame 对象
       ├─ 聚焦编辑器到顶部帧
       └─ 更新 UI 状态

3. UI 查询链:
   getThread(threadId) → Thread
   thread.getCallStack() → StackFrame[]
   stackFrame.getScopes() → Scope[] (懒加载)
   scope.getChildren() → Variable[] (懒加载)
   variable.getChildren() → Variable[] (按需分块加载)

4. 用户继续执行:
   DebugSession.continue(threadId)
   → RawDebugSession.continue()
   → DAP "continue" 请求
   → RawDebugSession.onDidContinued()
   → 清除停止状态
```

### 12.2 调试控制台输出流程

```
调试适配器发送 OutputEvent
    ↓
RawDebugSession._onDidOutput
    ↓
DebugSession 输出处理 (outputQueue 保序)
    ├─ 分类: telemetry → 遥测, 其他 → REPL
    ├─ 分组: group='start'/'startCollapsed'/'end'
    └─ 严重性映射: stderr → Error, stdout → Info
    ↓
ReplModel.appendToRepl()
    ├─ ANSI 清屏检测
    ├─ 重复行折叠
    └─ 创建 ReplOutputElement
    ↓
_onDidChangeElements.fire()
    ↓
Repl.refreshScheduler (50ms 防抖)
    ↓
tree.updateChildren() (带 diffIdentityProvider)
    ↓
渲染器应用模板 → 屏幕更新
```

### 12.3 变量检查流程

```
用户展开变量树节点
    ↓
Scope.getChildren() → ExpressionContainer.fetchVariables()
    ↓
IDebugSession.variables(variablesReference, threadId)
    ↓
RawDebugSession.variables() → DAP "variables" 请求
    ↓
适配器返回变量列表
    ↓
创建 Variable 对象 (带 variablesReference 可继续展开)
    ↓
更新 UI 树
```

---

## 13. 设计模式与约定

### 13.1 依赖注入

所有主要组件通过构造函数注入服务：
```typescript
constructor(
    @IDebugService private readonly debugService: IDebugService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    // ... 更多服务
) { }
```

### 13.2 事件驱动

```typescript
// 定义
private readonly _onDidChangeState = new Emitter<State>();
readonly onDidChangeState = this._onDidChangeState.event;

// 触发
this._onDidChangeState.fire(newState);

// 监听
this._register(debugService.onDidChangeState(state => { ... }));
```

### 13.3 Disposable 管理

- 使用 `DisposableStore` 管理一组生命周期相同的 disposable
- 使用 `MutableDisposable` 管理可替换的 disposable
- 方法内创建的 disposable 不注册到类实例，而是返回给调用者
- `this._register()` 用于注册到组件生命周期

### 13.4 懒加载

- 栈帧作用域按需加载
- 变量子节点展开时才获取
- 大数组自动分块（BASE_CHUNK_SIZE=100）

### 13.5 Context Key 驱动的 UI

```typescript
// 定义
const CONTEXT_IN_DEBUG_MODE = new RawContextKey<boolean>('inDebugMode', false);

// 设置
this.inDebugModeKey.set(true);

// 在菜单/命令中使用
MenuRegistry.appendMenuItem(MenuId.DebugToolBar, {
    when: CONTEXT_IN_DEBUG_MODE,
    command: { id: 'workbench.action.debug.continue' }
});
```

### 13.6 菜单系统

关键 MenuId：
- `MenuId.ViewContainerTitle` — 调试 viewlet 头部动作
- `MenuId.DebugCallStackContext` — 调用栈右键菜单
- `MenuId.DebugVariablesContext` — 变量右键菜单
- `MenuId.DebugWatchContext` — 监视表达式右键菜单
- `MenuId.DebugToolBar` — 浮动工具栏按钮
- `MenuId.DebugToolBarStop` — 停止/断开替代项
- `MenuId.DebugBreakpointsContext` — 断点右键菜单

### 13.7 异步数据树

所有调试视图使用 `WorkbenchAsyncDataTree`：
```typescript
// 数据源
class DataSource implements IAsyncDataSource<Root, Element> {
    hasChildren(element): boolean;
    getChildren(element): Promise<Element[]>;
}

// 渲染器
class Renderer implements ITreeRenderer<Element, FuzzyScore, Template> {
    templateId: string;
    renderTemplate(container): Template;
    renderElement(node, index, template): void;
    disposeTemplate(template): void;
}
```

---

## 14. Context Keys 一览

### 状态

| Context Key | 类型 | 描述 |
|-------------|------|------|
| `debugState` | string | 'inactive' / 'initializing' / 'stopped' / 'running' |
| `inDebugMode` | boolean | 是否在调试中 |
| `hasDebugged` | boolean | 是否曾启动过调试 |
| `debugUx` | string | 'simple' / 'default' |

### 会话

| Context Key | 类型 | 描述 |
|-------------|------|------|
| `debugType` | string | 当前会话类型 (python, node 等) |
| `focusedSessionIsAttach` | boolean | 是否为附加会话 |
| `focusedSessionIsNoDebug` | boolean | 是否为无调试运行 |

### 能力

| Context Key | 描述 |
|-------------|------|
| `stepBackSupported` | 支持后退步进 |
| `restartFrameSupported` | 支持重启帧 |
| `stepIntoTargetsSupported` | 支持步入目标选择 |
| `jumpToCursorSupported` | 支持跳转到光标 |
| `loadedScriptsSupported` | 支持已加载脚本视图 |
| `disassembleRequestSupported` | 支持反汇编 |
| `supportsConditionalBreakpoints` | 支持条件断点 |

### 断点

| Context Key | 描述 |
|-------------|------|
| `breakpointsExist` | 至少存在一个断点 |
| `breakWhenValueChangesSupported` | 支持数据断点(写) |
| `breakWhenValueIsReadSupported` | 支持数据断点(读) |
| `breakWhenValueIsAccessedSupported` | 支持数据断点(读写) |

### 视图焦点

| Context Key | 描述 |
|-------------|------|
| `callStackFocused` | 调用栈视图有焦点 |
| `variablesFocused` | 变量视图有焦点 |
| `watchExpressionsFocused` | 监视视图有焦点 |
| `breakpointsFocused` | 断点视图有焦点 |
| `inDebugRepl` | 调试控制台输入有焦点 |

### 调用栈项

| Context Key | 描述 |
|-------------|------|
| `callStackItemType` | 'session' / 'thread' / 'stackFrame' |
| `callStackItemStopped` | 项是否已停止 |
| `multiSessionDebug` | 多会话活动 |

---

## 15. 实现参考要点

### 15.1 新增调试功能时

1. **接口定义** → `common/debug.ts` 添加接口方法
2. **模型层** → `common/debugModel.ts` 添加数据结构
3. **会话层** → `browser/debugSession.ts` 添加 DAP 交互
4. **服务层** → `browser/debugService.ts` 添加业务逻辑
5. **UI 层** → `browser/xxxView.ts` 添加视图展示
6. **注册** → `browser/debug.contribution.ts` 注册视图/命令/菜单
7. **Context Keys** → 按需添加以控制 UI 可见性

### 15.2 DAP 交互模式

```typescript
// 发送请求
const response = await this.raw.stackTrace({ threadId, startFrame, levels });

// 处理事件
this.raw.onDidStop(event => {
    this.handleStop(event.body.threadId, event.body.reason);
});

// 能力检查
if (this.raw.capabilities.supportsXxx) {
    await this.raw.xxx(args);
}
```

### 15.3 添加新断点类型

1. 在 `common/debug.ts` 定义 `IXxxBreakpoint` 接口
2. 在 `common/debugModel.ts` 实现 `XxxBreakpoint` 类，继承 `BaseBreakpoint`
3. 在 `DebugModel` 中添加存储数组和 CRUD 方法
4. 在 `DebugSession` 中添加发送方法（对应 DAP 请求）
5. 在 `DebugService` 中添加公共 API
6. 在 `breakpointsView.ts` 中添加渲染器
7. 在 `debugStorage.ts` 中添加持久化

### 15.4 添加新调试视图

1. 定义视图 ID 常量
2. 创建视图类（扩展 `ViewPane`）
3. 在 `debug.contribution.ts` 中注册视图到 `viewContainer`
4. 设置 `when` 条件控制可见性
5. 注册相关命令和菜单项

### 15.5 关键文件快速索引

| 需求 | 文件 |
|------|------|
| 调试服务主逻辑 | `browser/debugService.ts` |
| 所有接口定义 | `common/debug.ts` |
| 数据模型 | `common/debugModel.ts` |
| 会话管理 | `browser/debugSession.ts` |
| DAP 传输 | `browser/rawDebugSession.ts` |
| 适配器基类 | `common/abstractDebugAdapter.ts` |
| 进程适配器 | `node/debugAdapter.ts` |
| 调试控制台 UI | `browser/repl.ts` |
| 控制台数据模型 | `common/replModel.ts` |
| 控制台渲染 | `browser/replViewer.ts` |
| 配置管理 | `browser/debugConfigurationManager.ts` |
| 断点视图 | `browser/breakpointsView.ts` |
| 调用栈视图 | `browser/callStackView.ts` |
| 变量视图 | `browser/variablesView.ts` |
| 注册入口 | `browser/debug.contribution.ts` |
| 调试命令 | `browser/debugCommands.ts` |
| 工具栏 | `browser/debugToolBar.ts` |
| 编辑器集成 | `browser/debugEditorContribution.ts` |

---

## 附录：编辑器贡献

### DebugEditorContribution

**文件：** `browser/debugEditorContribution.ts`

编辑器内的调试功能：
- **断点装饰** — 行号边距的断点图标
- **调试悬浮** — 鼠标悬停变量时显示值 (`debugHover.ts`)
- **异常组件** — 异常发生时的内联信息 (`exceptionWidget.ts`)
- **当前行高亮** — 调试停止时高亮当前执行行
- **运行到光标** — "Run to Cursor" 临时断点

### BreakpointEditorContribution

**文件：** `browser/breakpointEditorContribution.ts`

- **断点装饰器** — 在边距显示断点图标（红点、条件断点、日志点等）
- **断点组件** — 内联编辑断点条件/命中次数/日志消息 (`breakpointWidget.ts`)
- **右键菜单** — 行号边距的断点管理菜单
