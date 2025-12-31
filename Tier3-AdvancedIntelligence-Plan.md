# Tier3 - JetBrains 级高级智能功能计划

## 目标

在 Tier2 WASM 语言服务基础上，实现 JetBrains IDE 级别的高级智能功能，包括深度错误分析、TODO 扫描、安全重构、提交后分析，依赖索引等。

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

## Phase 7:依赖检查系统，规则引擎，扫描依赖，用法提供，node_modules/pip/cargo分析，依赖自动安装等

```rust
// logos-lang/crates/logos-deps/src/lib.rs
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub license: Option<String>,
    pub vulnerabilities: Vec<Vulnerability>,
    pub usageLocations: Vec<Location>,
    pub isOutdated: bool,
    pub isDeprecated: bool,
    pub isDirect: bool,
    pub PackageManager: PackageManager,
    
}
pub struct Vulnerability {
    pub id: String,
    pub severity: Severity,
    pub description: String,
    pub fixedInVersion: Option<String>,
}
```



## 实现步骤

### 里程碑 1: 基础分析 (2周)
- [ ] 扩展 Rust WASM 添加 `logos-inspect` crate
- [ ] 实现基础类型检查
- [ ] 实现未使用代码检测
- [ ] TODO 扫描器

### 里程碑 2: 重构引擎 (2周)
- [ ] 添加 `logos-refactor` crate
- [ ] 实现提取方法
- [ ] 实现提取变量
- [ ] 实现安全删除

### 里程碑 3: 提交分析 (1周)
- [ ] Git diff 解析
- [ ] 变更影响分析
- [ ] 代码审查建议生成

### 里程碑 4: 检查系统 (2周)
- [ ] 检查规则引擎
- [ ] 内置检查规则 (20+)
- [ ] 自定义配置支持
- [ ] 意图操作与快速修复基础支持
- [ ] 依赖检查系统基础实现

### 里程碑 5: UI 集成 (1周)
- [ ] TODO 面板
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
| AI 建议 | Copilot | 未来计划 |