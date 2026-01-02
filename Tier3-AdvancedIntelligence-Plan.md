# Tier3 - JetBrains 级高级智能功能计划

## 目标

在 Tier2 WASM 语言服务基础上，实现 JetBrains IDE 级别的高级智能功能，包括深度错误分析、TODO 扫描、安全重构、提交后分析，依赖索引等。

## 设计原则

### 🛡️ 错误处理与降级策略

```typescript
// src/services/intelligence/FallbackStrategy.ts
interface IntelligenceConfig {
  enableWasm: boolean           // WASM 模块是否可用
  fallbackToBasic: boolean      // 降级到基础分析
  timeout: number               // 分析超时时间 (ms)
  maxFileSize: number           // 最大文件大小限制
}

// 三级降级策略
enum AnalysisLevel {
  Full = 'full',        // 完整 WASM 分析
  Partial = 'partial',  // 部分功能 (仅语法分析)
  Basic = 'basic',      // 基础功能 (仅高亮和简单补全)
}
```

**降级触发条件：**
| 条件 | 降级行为 |
|------|---------|
| WASM 加载失败 | 降级到 Basic 模式，显示通知 |
| 分析超时 (>5s) | 取消当前分析，返回缓存结果 |
| 内存不足 | 释放索引缓存，降级到 Partial |
| 文件过大 (>1MB) | 仅分析可见区域 |

### 📊 增量分析策略

```rust
// logos-lang/crates/logos-index/src/incremental.rs
pub struct IncrementalAnalyzer {
    file_hashes: HashMap<PathBuf, u64>,      // 文件内容哈希
    dependency_graph: DependencyGraph,        // 文件依赖图
    dirty_files: HashSet<PathBuf>,           // 需要重新分析的文件
    analysis_cache: LruCache<PathBuf, AnalysisResult>,
}

impl IncrementalAnalyzer {
    /// 仅分析变更文件及其依赖
    pub fn analyze_incremental(&mut self, changed: &[PathBuf]) -> Vec<AnalysisResult> {
        // 1. 计算受影响的文件集合
        let affected = self.compute_affected_files(changed);
        // 2. 按依赖顺序排序
        let ordered = self.topological_sort(&affected);
        // 3. 增量分析
        ordered.iter().map(|f| self.analyze_file(f)).collect()
    }
}
```

**缓存策略：**
- 文件级缓存：按文件哈希存储分析结果
- 符号级缓存：跨文件引用的符号单独缓存
- LRU 淘汰：最多保留 1000 个文件的分析结果

## 功能架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Advanced Intelligence                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Error        │  │ TODO         │  │ Refactoring          │  │
│  │ Analysis     │  │ Scanner      │  │ Engine               │  │
│  │ ├─ Type      │  │ ├─ TODO      │  │ ├─ Extract Method    │  │
│  │ ├─ Null      │  │ ├─ FIXME     │  │ ├─ Extract Variable  │  │
│  │ ├─ Unused    │  │ ├─ HACK      │  │ ├─ Inline Variable   │  │
│  │ └─ Semantic  │  │ └─ Custom    │  │ ├─ Move              │  │
│  └──────────────┘  └──────────────┘  │ └─ Safe Delete       │  │
│                                       └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Commit       │  │ Code         │  │ Intentions &         │  │
│  │ Analysis     │  │ Inspection   │  │ Quick Fixes          │  │
│  │ ├─ Diff      │  │ ├─ Style     │  │ ├─ Add Import        │  │
│  │ ├─ Impact    │  │ ├─ Perf      │  │ ├─ Generate Code     │  │
│  │ └─ Suggest   │  │ └─ Security  │  │ └─ Fix Syntax        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: 深度错误分析

### 1.1 类型错误分析
```rust
// logos-lang/crates/logos-semantic/src/type_check.rs
pub struct TypeError {
    pub kind: TypeErrorKind,
    pub expected: TypeInfo,
    pub actual: TypeInfo,
    pub suggestions: Vec<QuickFix>,
}

pub enum TypeErrorKind {
    Mismatch,           // 类型不匹配
    UndefinedVariable,  // 未定义变量
    UndefinedFunction,  // 未定义函数
    ArgumentCount,      // 参数数量错误
    ReturnType,         // 返回类型错误
}
```

### 1.2 空值/未初始化分析
```rust
// logos-lang/crates/logos-semantic/src/null_check.rs
pub struct NullAnalysis {
    pub nullable_vars: HashSet<String>,
    pub null_checks: Vec<NullCheck>,
}

pub struct NullCheck {
    pub variable: String,
    pub is_checked: bool,
    pub access_points: Vec<Position>,
}
```

### 1.3 未使用代码检测
```rust
// logos-lang/crates/logos-semantic/src/unused.rs
pub enum UnusedKind {
    Variable,
    Function,
    Import,
    Parameter,
    Class,
}

pub struct UnusedItem {
    pub kind: UnusedKind,
    pub name: String,
    pub location: Range,
    pub can_remove: bool,
}
```

## Phase 2: TODO/FIXME 扫描器

### 2.1 模式识别
```rust
// logos-lang/crates/logos-index/src/todo_scanner.rs
pub struct TodoItem {
    pub kind: TodoKind,
    pub text: String,
    pub author: Option<String>,
    pub priority: Priority,
    pub location: Location,
    pub created_date: Option<String>,
}

pub enum TodoKind {
    Todo,
    Fixme,
    Hack,
    Note,
    Bug,
    Optimize,
    Custom(String),
}

pub enum Priority {
    High,    // TODO(urgent), FIXME!
    Medium,  // TODO, FIXME
    Low,     // NOTE, HACK
}
```

### 2.2 TODO 面板 UI
```typescript
// src/components/TodoPanel/TodoPanel.vue
interface TodoFilter {
  kinds: TodoKind[]
  files: string[]
  authors: string[]
  priorities: Priority[]
}

interface TodoGroup {
  groupBy: 'file' | 'kind' | 'author' | 'priority'
  items: TodoItem[]
}
```

### 2.3 自定义 TODO 模式
```typescript
// src/stores/settings.ts
interface TodoSettings {
  patterns: TodoPattern[]
  highlightColors: Record<TodoKind, string>
}

interface TodoPattern {
  regex: string
  kind: TodoKind
  priority: Priority
}
```

## Phase 3: 安全重构引擎

### 3.1 提取方法 (Extract Method)
```rust
// logos-lang/crates/logos-refactor/src/extract_method.rs
pub struct ExtractMethodRefactoring {
    pub selection: Range,
    pub new_method_name: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<TypeInfo>,
}

impl ExtractMethodRefactoring {
    pub fn analyze(doc: &Document, selection: Range) -> Result<Self, RefactorError> {
        // 1. 识别选中代码的输入变量
        // 2. 识别选中代码的输出变量
        // 3. 检测是否可以安全提取
        // 4. 生成参数列表和返回类型
    }

    pub fn apply(&self, doc: &Document) -> WorkspaceEdit {
        // 生成新方法定义 + 替换原代码为调用
    }
}
```

### 3.2 提取变量 (Extract Variable)
```rust
// logos-lang/crates/logos-refactor/src/extract_variable.rs
pub struct ExtractVariableRefactoring {
    pub expression: Range,
    pub variable_name: String,
    pub occurrences: Vec<Range>,  // 相同表达式的所有出现
    pub replace_all: bool,
}
```

### 3.3 内联变量 (Inline Variable)
```rust
// logos-lang/crates/logos-refactor/src/inline_variable.rs
pub struct InlineVariableRefactoring {
    pub variable: String,
    pub definition: Range,
    pub usages: Vec<Range>,
    pub is_safe: bool,  // 是否有副作用
}
```

### 3.4 安全删除 (Safe Delete)
```rust
// logos-lang/crates/logos-refactor/src/safe_delete.rs
pub struct SafeDeleteAnalysis {
    pub target: Symbol,
    pub usages: Vec<Usage>,
    pub can_delete: bool,
    pub warnings: Vec<String>,
}

pub struct Usage {
    pub location: Location,
    pub kind: UsageKind,  // Read, Write, Call, Import
}
```

## Phase 4: 提交后分析

### 4.1 变更影响分析
```typescript
// src/services/commit/CommitAnalyzer.ts
interface CommitAnalysis {
  changedFiles: FileChange[]
  impactedSymbols: Symbol[]
  potentialBreakingChanges: BreakingChange[]
  testSuggestions: TestSuggestion[]
}

interface FileChange {
  path: string
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  linesAdded: number
  linesRemoved: number
  symbolsChanged: Symbol[]
}

interface BreakingChange {
  symbol: Symbol
  reason: string
  affectedFiles: string[]
}
```

### 4.2 代码审查建议
```typescript
// src/services/commit/ReviewSuggestions.ts
interface ReviewSuggestion {
  file: string
  line: number
  severity: 'error' | 'warning' | 'info'
  category: SuggestionCategory
  message: string
  suggestion?: string
}

type SuggestionCategory =
  | 'security'      // 安全问题
  | 'performance'   // 性能问题
  | 'style'         // 代码风格
  | 'complexity'    // 复杂度过高
  | 'duplication'   // 代码重复
  | 'test_coverage' // 测试覆盖
```

### 4.3 提交消息分析
```typescript
// src/services/commit/CommitMessageAnalyzer.ts
interface CommitMessageAnalysis {
  isConventional: boolean  // 是否符合 Conventional Commits
  type?: string            // feat, fix, docs, etc.
  scope?: string
  suggestedMessage?: string
  warnings: string[]
}
```

## Phase 5: 代码检查 (Inspections)

### 5.1 检查规则引擎
```rust
// logos-lang/crates/logos-inspect/src/lib.rs
pub trait Inspection {
    fn id(&self) -> &str;
    fn severity(&self) -> Severity;
    fn check(&self, doc: &Document) -> Vec<InspectionResult>;
}

pub struct InspectionResult {
    pub inspection_id: String,
    pub range: Range,
    pub message: String,
    pub quick_fixes: Vec<QuickFix>,
}
```

### 5.2 内置检查规则
```rust
// 性能检查
- LoopInvariantComputation   // 循环不变量
- UnnecessaryAllocation      // 不必要的内存分配
- N+1QueryPattern           // N+1 查询模式

// 安全检查
- HardcodedCredentials      // 硬编码凭证
- SqlInjection              // SQL 注入风险
- PathTraversal             // 路径遍历风险
- InsecureRandom            // 不安全的随机数

// 代码质量
- TooManyParameters         // 参数过多
- TooLongMethod             // 方法过长
- DeepNesting               // 嵌套过深
- DuplicateCode             // 重复代码
```

### 5.3 自定义检查配置
```json
// .logos/inspections.json
{
  "enabled": {
    "performance/*": true,
    "security/*": true,
    "style/max-line-length": { "max": 120 }
  },
  "disabled": [
    "style/trailing-comma"
  ],
  "severity_overrides": {
    "security/hardcoded-credentials": "error"
  }
}
```

## Phase 6: 意图操作与快速修复

### 6.1 意图操作 (Intentions)
```typescript
// src/services/intentions/IntentionProvider.ts
interface Intention {
  id: string
  title: string
  isAvailable(context: IntentionContext): boolean
  invoke(context: IntentionContext): WorkspaceEdit
}

// 内置意图
- AddImport                  // 添加导入语句
- GenerateGetter            // 生成 getter
- GenerateSetter            // 生成 setter
- GenerateConstructor       // 生成构造函数
- ConvertToArrowFunction    // 转换为箭头函数
- ConvertStringConcatenation // 转换字符串拼接
- InvertCondition           // 反转条件
- SplitDeclaration          // 拆分声明
```

### 6.2 快速修复 (Quick Fixes)
```typescript
// 与诊断关联的快速修复
interface QuickFix {
  diagnosticId: string
  title: string
  edit: WorkspaceEdit
  isPreferred: boolean  // 首选修复
}

// 内置快速修复
- FixMissingImport          // 添加缺失的导入
- FixTypo                   // 修复拼写错误
- RemoveUnusedVariable      // 删除未使用变量
- AddMissingReturn          // 添加缺失的返回语句
- FixIncorrectType          // 修复类型错误
```

## Phase 7: 依赖检查系统

### 7.1 支持的包管理器

```rust
// logos-lang/crates/logos-deps/src/package_manager.rs
pub enum PackageManager {
    // JavaScript/TypeScript
    Npm,        // package.json, package-lock.json
    Yarn,       // package.json, yarn.lock
    Pnpm,       // package.json, pnpm-lock.yaml

    // Python
    Pip,        // requirements.txt, setup.py
    Poetry,     // pyproject.toml, poetry.lock
    Pipenv,     // Pipfile, Pipfile.lock

    // Rust
    Cargo,      // Cargo.toml, Cargo.lock

    // Go
    GoMod,      // go.mod, go.sum

    // Java/JVM
    Maven,      // pom.xml
    Gradle,     // build.gradle, build.gradle.kts

    // Ruby
    Bundler,    // Gemfile, Gemfile.lock

    // PHP
    Composer,   // composer.json, composer.lock
}
```

### 7.2 依赖数据模型

```rust
// logos-lang/crates/logos-deps/src/lib.rs
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub resolved_version: Option<String>,  // 从锁文件解析的实际版本
    pub license: Option<License>,
    pub vulnerabilities: Vec<Vulnerability>,
    pub usage_locations: Vec<Location>,     // 代码中的使用位置
    pub is_outdated: bool,
    pub is_deprecated: bool,
    pub is_direct: bool,                    // 直接依赖 vs 传递依赖
    pub package_manager: PackageManager,
    pub update_available: Option<String>,   // 可用的更新版本
}

pub struct Vulnerability {
    pub id: String,                         // CVE-XXXX-XXXXX
    pub severity: VulnerabilitySeverity,
    pub description: String,
    pub fixed_in_version: Option<String>,
    pub references: Vec<String>,            // 参考链接
    pub cvss_score: Option<f32>,            // CVSS 评分
}

pub enum VulnerabilitySeverity {
    Critical,   // CVSS 9.0-10.0
    High,       // CVSS 7.0-8.9
    Medium,     // CVSS 4.0-6.9
    Low,        // CVSS 0.1-3.9
    None,       // CVSS 0.0
}
```

### 7.3 许可证合规检查

```rust
// logos-lang/crates/logos-deps/src/license.rs
pub struct License {
    pub spdx_id: String,        // MIT, Apache-2.0, GPL-3.0, etc.
    pub name: String,
    pub is_osi_approved: bool,
    pub is_copyleft: bool,
    pub compatibility: LicenseCompatibility,
}

pub enum LicenseCompatibility {
    Permissive,     // MIT, BSD, Apache
    WeakCopyleft,   // LGPL, MPL
    StrongCopyleft, // GPL, AGPL
    Proprietary,
    Unknown,
}

// 许可证策略配置
pub struct LicensePolicy {
    pub allowed: Vec<String>,       // 允许的许可证
    pub denied: Vec<String>,        // 禁止的许可证
    pub require_osi: bool,          // 要求 OSI 批准
    pub allow_copyleft: bool,       // 允许 copyleft
}
```

### 7.4 依赖面板 UI

```
┌─ Dependencies ──────────────────────────────────────────┐
│ 📦 package.json                          [↻ Check] [⬆ Update All]
├─────────────────────────────────────────────────────────┤
│ ▼ ⚠️ Security Issues (2)                                │
│   🔴 lodash@4.17.15        CVE-2021-23337 (High)       │
│      └─ Fix: upgrade to 4.17.21                        │
│   🟠 axios@0.21.1          CVE-2021-3749 (Medium)      │
│      └─ Fix: upgrade to 0.21.2                         │
├─────────────────────────────────────────────────────────┤
│ ▼ 📋 Outdated (5)                                       │
│   📦 vue@3.2.0 → 3.4.0                    [⬆ Update]   │
│   📦 typescript@4.9.0 → 5.3.0             [⬆ Update]   │
├─────────────────────────────────────────────────────────┤
│ ▼ 📜 License Issues (1)                                 │
│   ⚠️ some-pkg@1.0.0 (GPL-3.0) - Copyleft detected      │
├─────────────────────────────────────────────────────────┤
│ ▼ ✅ All Dependencies (48)                              │
│   📦 vue@3.2.0              MIT          ✅            │
│   📦 pinia@2.1.0            MIT          ✅            │
│   ...                                                   │
└─────────────────────────────────────────────────────────┘
```

### 7.5 自动安装与更新

```typescript
// src/services/deps/DependencyManager.ts
interface DependencyAction {
  type: 'install' | 'update' | 'remove'
  packages: PackageSpec[]
  packageManager: PackageManager
}

interface PackageSpec {
  name: string
  version?: string  // 不指定则安装最新
  dev?: boolean     // 开发依赖
}

// 支持的命令
// npm install <pkg>
// yarn add <pkg>
// pip install <pkg>
// cargo add <pkg>
// go get <pkg>
```



## 实现步骤

### 里程碑 1: 基础分析 ✅ (已完成)
- [x] TODO 扫描器 (`logos-index/src/comments.rs`)
  - 支持 TODO, FIXME, HACK, XXX, NOTE, BUG, OPTIMIZE 等类型
  - 正则表达式解析，提取作者和优先级
- [x] 未使用代码检测 (`logos-semantic/src/unused.rs`)
  - 检测未使用的变量、函数、导入、参数等
  - 提供快速修复建议
- [x] 扩展类型系统 (`logos-semantic/src/type_infer.rs`)
  - 新增 Union, Intersection, Tuple, Record, Callable, Generic, Literal, Never 类型
- [x] 基础类型检查器 (`logos-semantic/src/type_check.rs`)
  - 类型不匹配、未定义变量、参数数量检查
- [x] WASM API 更新 (`logos-wasm/src/api.rs`)
  - getTodoItems, getAllTodoItems, getTodoStats, getUnusedSymbols
- [x] TODO 面板 UI (`src/components/Analysis/TodoPanel.vue`)
  - 活动栏集成、按文件/类型分组、搜索筛选
- [x] TODO Store (`src/stores/todos.ts`)

### 里程碑 2: 重构引擎 ✅ (已完成)
- [x] 添加 `logos-refactor` crate
  - 核心类型：TextEdit, RefactorResult, RefactorError, RefactorContext, RefactorEngine
  - 分析工具：表达式验证、变量引用查找、变量名建议
- [x] 实现提取方法 (`logos-refactor/src/extract_method.rs`)
  - 参数分析（输入变量检测）
  - 返回值分析（输出变量检测）
  - 控制流检查（return/break/continue）
  - 多语言支持（Python, JS/TS, Rust, Go, Java, C/C++）
- [x] 实现提取变量 (`logos-refactor/src/extract_variable.rs`)
  - 表达式验证
  - 语言特定声明生成
  - 插入点计算
- [x] 实现安全删除 (`logos-refactor/src/safe_delete.rs`)
  - 使用分析（查找所有引用）
  - 安全性检查
  - 删除范围计算
- [x] WASM API (`logos-wasm/src/api.rs`)
  - getRefactorActions, extractVariable, extractMethod, canSafeDelete, safeDelete

### 里程碑 3: 提交分析 ✅ (已完成)
- [x] Git diff 解析 (`electron/services/commitAnalysisService.ts`)
  - 统一 diff 格式解析
  - 文件变更类型检测（added/modified/deleted/renamed）
  - Hunk 解析（行号、内容、增删行）
- [x] 代码审查建议生成
  - 安全检查：硬编码密码/API密钥、eval()、dangerouslySetInnerHTML、命令注入
  - 性能检查：forEach+push、循环内 await
  - 代码风格：console 语句、TODO/FIXME、@ts-ignore
  - 复杂度检查：大文件变更警告
  - 测试建议：缺少测试文件提示
- [x] 提交指标计算
  - 文件变更数、新增/删除行数、最大变更文件、测试/配置文件统计
- [x] 前端集成
  - 类型定义 (`src/types/commitAnalysis.ts`)
  - Pinia Store (`src/stores/commitAnalysis.ts`)
  - UI 面板 (`src/components/Analysis/CommitAnalysisPanel.vue`)
  - Activity Bar 集成 (analytics 图标)

### 里程碑 4: 检查系统
- [ ] 检查规则引擎
- [ ] 内置检查规则 (20+)
- [ ] 自定义配置支持
- [ ] 意图操作与快速修复基础支持
- [ ] 依赖检查系统基础实现

### 里程碑 5: UI 集成
- [x] TODO 面板 (已在里程碑1完成)
- [ ] 问题面板增强
- [ ] 重构菜单
- [ ] 提交分析对话框
- [ ] 检查结果导航
- [ ] 意图操作与快速修复集成
- [ ] 依赖检查面板

## UI 设计

### TODO 面板
```
┌─ TODO ──────────────────────────────────────────┐
│ Filter: [All ▼] [Files ▼] [Author ▼]           │
├─────────────────────────────────────────────────┤
│ ▼ High Priority (3)                             │
│   ⚠ TODO: Fix memory leak in parser            │
│     src/parser.rs:123                           │
│   ⚠ FIXME: Handle null case                    │
│     src/handler.rs:45                           │
│ ▼ Medium Priority (12)                          │
│   ○ TODO: Add unit tests                        │
│     src/utils.rs:78                             │
│   ...                                           │
└─────────────────────────────────────────────────┘
```

### 重构菜单
```
┌─ Refactor ─────────────────────┐
│ Rename...              F2      │
│ ─────────────────────────────  │
│ Extract Method...      ⌘⌥M     │
│ Extract Variable...    ⌘⌥V     │
│ Extract Constant...    ⌘⌥C     │
│ ─────────────────────────────  │
│ Inline...              ⌘⌥N     │
│ Move...                F6      │
│ ─────────────────────────────  │
│ Safe Delete...         ⌘⌫      │
└────────────────────────────────┘
```

## 性能目标

| 功能 | 目标响应时间 |
|------|-------------|
| TODO 扫描 (1000文件) | < 2s |
| 提取方法分析 | < 100ms |
| 未使用代码检测 | < 500ms |
| 提交影响分析 | < 1s |
| 检查 (单文件) | < 200ms |

## 依赖项

### 新增 Rust Crates
```toml
[dependencies]
logos-refactor = { path = "../logos-refactor" }
logos-inspect = { path = "../logos-inspect" }

# 额外依赖
regex = "1.10"          # TODO 模式匹配
similar = "2.0"         # diff 算法
```

### 前端依赖
```json
{
  "dependencies": {
    "diff": "^5.0.0"  // Git diff 解析
  }
}
```

## 与 JetBrains 功能对比

| 功能 | JetBrains | Logos (Tier3) |
|------|-----------|---------------|
| 类型检查 | 完整 | 基础 (局部推断) |
| TODO 扫描 | ✅ | ✅ |
| 提取方法 | ✅ | ✅ |
| 安全删除 | ✅ | ✅ |
| 代码检查 | 1000+ | 20+ |
| 提交分析 | 部分 | ✅ |
| 依赖检查 | 部分 | ✅ |
| 许可证合规 | ❌ | ✅ |
| AI 建议 | Copilot | Phase 8 |

## Phase 8: AI 增强分析 (未来计划)

### 8.1 AI 代码审查

```typescript
// src/services/ai/AICodeReviewer.ts
interface AIReviewConfig {
  provider: 'openai' | 'anthropic' | 'local'  // LLM 提供商
  model: string                                // 模型名称
  maxTokens: number                            // 最大 token 数
  temperature: number                          // 创造性参数
}

interface AIReviewResult {
  summary: string                              // 总体评价
  issues: AIIssue[]                           // 发现的问题
  suggestions: AISuggestion[]                 // 改进建议
  refactorHints: RefactorHint[]               // 重构提示
}

interface AIIssue {
  severity: 'critical' | 'warning' | 'info'
  category: 'security' | 'performance' | 'maintainability' | 'readability'
  location: Range
  description: string
  explanation: string                          // 详细解释
  suggestedFix?: string                       // 建议的修复代码
}
```

### 8.2 智能代码生成

```typescript
// src/services/ai/AICodeGenerator.ts
interface GenerationContext {
  currentFile: string
  cursorPosition: Position
  selectedCode?: string
  surroundingCode: string                      // 上下文代码
  projectContext: ProjectSummary               // 项目信息
}

// 支持的生成类型
type GenerationType =
  | 'complete'           // 代码补全
  | 'explain'            // 代码解释
  | 'refactor'           // 重构建议
  | 'test'               // 生成测试
  | 'document'           // 生成文档
  | 'fix'                // 修复代码
```

### 8.3 代码异味检测

```typescript
// src/services/ai/CodeSmellDetector.ts
interface CodeSmell {
  type: CodeSmellType
  severity: number                             // 1-10
  location: Range
  description: string
  refactorSuggestion: string
}

type CodeSmellType =
  | 'long_method'          // 方法过长
  | 'god_class'            // 上帝类
  | 'feature_envy'         // 特征嫉妒
  | 'data_clump'           // 数据泥团
  | 'primitive_obsession'  // 基本类型偏执
  | 'shotgun_surgery'      // 散弹式修改
  | 'parallel_inheritance' // 平行继承
  | 'dead_code'            // 死代码
  | 'speculative_generality' // 投机泛化
```

### 8.4 自然语言交互

```typescript
// src/services/ai/NLInterface.ts
interface NLCommand {
  input: string                                // 用户输入
  context: CodeContext                         // 当前上下文
}

interface NLResponse {
  action: NLAction
  explanation: string
  codeChanges?: WorkspaceEdit
  followUpQuestions?: string[]
}

// 支持的自然语言命令
// "重命名这个函数为 getUserById"
// "添加参数校验"
// "提取这段代码为一个新方法"
// "解释这段代码做了什么"
// "这里有什么潜在的 bug 吗？"
```

### 8.5 AI 配置与隐私

```json
// .logos/ai.json
{
  "enabled": true,
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "features": {
    "codeReview": true,
    "codeGeneration": true,
    "naturalLanguage": true
  },
  "privacy": {
    "sendCodeToCloud": true,        // 是否发送代码到云端
    "excludePatterns": [            // 排除的文件模式
      "**/.env",
      "**/secrets/**"
    ],
    "anonymizeCode": false          // 代码匿名化
  },
  "localModel": {                   // 本地模型配置 (隐私优先)
    "enabled": false,
    "modelPath": "~/.logos/models/codellama-7b"
  }
}
```

### 8.6 AI 面板 UI（需要Claude Code集成或者使用anthropic api）

```
┌─ AI Assistant ──────────────────────────────────────────┐
│ 💬 Ask anything about your code...            [⚙️ Settings]
├─────────────────────────────────────────────────────────┤
│ 🤖 Code Review Summary                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Found 3 issues in the selected code:                │ │
│ │                                                     │ │
│ │ 🔴 Security: SQL injection risk at line 45         │ │
│ │ 🟡 Performance: N+1 query pattern detected         │ │
│ │ 🔵 Style: Consider extracting to separate method   │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ 💡 Suggestions                                          │
│ ├─ Use parameterized queries                [Apply]    │
│ ├─ Add eager loading for relations          [Apply]    │
│ └─ Extract validation logic                 [Apply]    │
├─────────────────────────────────────────────────────────┤
│ 📝 Chat History                                         │
│ You: 这个函数有什么问题？                               │
│ AI: 这个函数存在以下问题...                            │
│ You: 如何修复 SQL 注入？                                │
│ AI: 你可以使用参数化查询...                            │
└─────────────────────────────────────────────────────────┘
```