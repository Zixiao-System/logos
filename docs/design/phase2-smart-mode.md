# Phase 2: Smart Mode - Rust 全量索引引擎设计

## 概述

Smart Mode 是 Logos IDE 的高级代码智能模式，通过 Rust 实现的全量索引引擎提供类似 JetBrains IDE 的深度代码分析能力。

## 设计目标

1. **全量索引**: 索引项目所有源文件及依赖的类型定义
2. **增量更新**: 文件修改时只重新解析受影响的部分
3. **高级重构**: 支持安全重命名、提取方法、移动符号等
4. **深度分析**: 调用链追踪、影响分析、死代码检测

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      Monaco Editor (渲染进程)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC
┌────────────────────────────▼────────────────────────────────────┐
│                      Main Process (Node.js)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Smart Mode Manager                       │    │
│  │  • 协调索引引擎和 Provider                               │    │
│  │  • 管理索引状态和进度                                    │    │
│  └─────────────────────────┬───────────────────────────────┘    │
└────────────────────────────┼────────────────────────────────────┘
                             │ JSON-RPC (stdio)
┌────────────────────────────▼────────────────────────────────────┐
│                    logos-daemon (Rust)                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Index Engine                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ Symbol Table │  │  Call Graph  │  │ Type Hierarchy│   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ Dependency   │  │ Incremental  │  │ Analysis     │   │    │
│  │  │    Graph     │  │    Cache     │  │   Engine     │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Language Parsers                         │    │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │    │
│  │  │ TS  │ │ Py  │ │ Go  │ │ Rs  │ │ C++ │ │Java │       │    │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 核心数据结构

### 1. 符号表 (Symbol Table)

```rust
pub struct SymbolTable {
    /// 符号 ID -> 符号信息
    symbols: DashMap<SymbolId, Symbol>,

    /// 文件 -> 符号列表
    file_symbols: DashMap<PathBuf, Vec<SymbolId>>,

    /// 名称 -> 符号 ID 列表 (用于快速查找)
    name_index: DashMap<String, Vec<SymbolId>>,

    /// 作用域树
    scope_tree: ScopeTree,
}

pub struct Symbol {
    pub id: SymbolId,
    pub name: String,
    pub kind: SymbolKind,
    pub location: Location,
    pub parent: Option<SymbolId>,
    pub children: Vec<SymbolId>,
    pub type_info: Option<TypeInfo>,
    pub visibility: Visibility,
    pub documentation: Option<String>,
    pub attributes: Vec<Attribute>,
}

pub enum SymbolKind {
    Module,
    Namespace,
    Class,
    Interface,
    Trait,
    Struct,
    Enum,
    Function,
    Method,
    Property,
    Field,
    Variable,
    Constant,
    Parameter,
    TypeParameter,
    TypeAlias,
}
```

### 2. 调用图 (Call Graph)

```rust
pub struct CallGraph {
    /// 调用者 -> 被调用者列表
    callers: DashMap<SymbolId, HashSet<CallSite>>,

    /// 被调用者 -> 调用者列表
    callees: DashMap<SymbolId, HashSet<CallSite>>,
}

pub struct CallSite {
    pub caller: SymbolId,
    pub callee: SymbolId,
    pub location: Location,
    pub call_type: CallType,
}

pub enum CallType {
    Direct,           // 直接调用
    Virtual,          // 虚方法调用
    Interface,        // 接口方法调用
    Callback,         // 回调
    Constructor,      // 构造函数
}
```

### 3. 类型层级 (Type Hierarchy)

```rust
pub struct TypeHierarchy {
    /// 类型 -> 父类型列表
    supertypes: DashMap<SymbolId, Vec<SymbolId>>,

    /// 类型 -> 子类型列表
    subtypes: DashMap<SymbolId, Vec<SymbolId>>,

    /// 类型 -> 实现的接口
    implements: DashMap<SymbolId, Vec<SymbolId>>,

    /// 接口 -> 实现类
    implementors: DashMap<SymbolId, Vec<SymbolId>>,
}
```

### 4. 依赖图 (Dependency Graph)

```rust
pub struct DependencyGraph {
    /// 文件 -> 导入的文件
    imports: DashMap<PathBuf, HashSet<PathBuf>>,

    /// 文件 -> 被哪些文件导入
    imported_by: DashMap<PathBuf, HashSet<PathBuf>>,

    /// 模块 -> 导出的符号
    exports: DashMap<PathBuf, Vec<SymbolId>>,
}
```

### 5. 增量缓存 (Incremental Cache)

```rust
pub struct IncrementalCache {
    /// 文件 -> 最后修改时间
    file_timestamps: DashMap<PathBuf, SystemTime>,

    /// 文件 -> 内容哈希
    file_hashes: DashMap<PathBuf, u64>,

    /// 文件 -> AST 缓存
    ast_cache: DashMap<PathBuf, Arc<Ast>>,

    /// 脏文件集合
    dirty_files: DashSet<PathBuf>,
}
```

## 索引流程

### 1. 全量索引

```rust
impl ProjectIndex {
    pub async fn full_index(&mut self, root: &Path) -> IndexResult {
        // Phase 1: 扫描文件
        self.notify_progress(IndexPhase::Scanning, 0, 0);
        let files = self.scan_project_files(root).await?;

        // Phase 2: 解析配置文件
        self.notify_progress(IndexPhase::Parsing, 0, files.len());
        self.parse_project_config(root).await?;

        // Phase 3: 并行解析所有文件
        let total = files.len();
        let results: Vec<_> = files
            .into_par_iter()
            .enumerate()
            .map(|(i, file)| {
                self.notify_progress(IndexPhase::Indexing, i, total);
                self.index_file(&file)
            })
            .collect();

        // Phase 4: 构建跨文件索引
        self.build_cross_file_index()?;

        // Phase 5: 构建调用图和类型层级
        self.build_call_graph()?;
        self.build_type_hierarchy()?;

        self.notify_progress(IndexPhase::Ready, total, total);
        Ok(IndexResult::success())
    }
}
```

### 2. 增量更新

```rust
impl ProjectIndex {
    pub async fn incremental_update(&mut self, file: &Path) -> IndexResult {
        // 1. 计算受影响的文件
        let affected = self.compute_affected_files(file)?;

        // 2. 移除旧的索引数据
        for f in &affected {
            self.remove_file_index(f)?;
        }

        // 3. 重新索引受影响的文件
        for f in &affected {
            self.index_file(f)?;
        }

        // 4. 更新跨文件索引
        self.update_cross_file_index(&affected)?;

        Ok(IndexResult::success())
    }

    fn compute_affected_files(&self, file: &Path) -> Result<HashSet<PathBuf>> {
        let mut affected = HashSet::new();
        affected.insert(file.to_path_buf());

        // 找到所有导入这个文件的文件
        if let Some(importers) = self.dependency_graph.imported_by.get(file) {
            for importer in importers.iter() {
                affected.insert(importer.clone());
            }
        }

        Ok(affected)
    }
}
```

## 高级功能

### 1. 安全重命名

```rust
pub struct RenameAnalysis {
    /// 所有需要修改的位置
    pub edits: Vec<TextEdit>,

    /// 潜在的命名冲突
    pub conflicts: Vec<NamingConflict>,

    /// 可能破坏的外部引用
    pub breaking_changes: Vec<BreakingChange>,

    /// 是否安全
    pub is_safe: bool,
}

impl ProjectIndex {
    pub fn analyze_rename(
        &self,
        symbol: SymbolId,
        new_name: &str
    ) -> RenameAnalysis {
        let mut analysis = RenameAnalysis::new();

        // 1. 收集所有引用
        let references = self.find_all_references(symbol);
        for reference in references {
            analysis.edits.push(TextEdit {
                file: reference.file,
                range: reference.range,
                new_text: new_name.to_string(),
            });
        }

        // 2. 检查命名冲突
        let scope = self.get_symbol_scope(symbol);
        for existing in self.get_symbols_in_scope(scope) {
            if existing.name == new_name && existing.id != symbol {
                analysis.conflicts.push(NamingConflict {
                    existing_symbol: existing.id,
                    message: format!("Symbol '{}' already exists in this scope", new_name),
                });
            }
        }

        // 3. 检查是否是公开符号
        let symbol_info = self.symbols.get(&symbol).unwrap();
        if symbol_info.visibility == Visibility::Public {
            analysis.breaking_changes.push(BreakingChange {
                kind: BreakingChangeKind::PublicApiChange,
                message: "Renaming public symbol may break external code".to_string(),
            });
        }

        analysis.is_safe = analysis.conflicts.is_empty();
        analysis
    }
}
```

### 2. 调用链追踪

```rust
impl ProjectIndex {
    /// 查找调用某个函数的所有路径
    pub fn find_call_paths(
        &self,
        from: SymbolId,
        to: SymbolId,
        max_depth: usize
    ) -> Vec<CallPath> {
        let mut paths = Vec::new();
        let mut visited = HashSet::new();
        let mut current_path = Vec::new();

        self.dfs_call_paths(from, to, &mut current_path, &mut visited, &mut paths, max_depth);

        paths
    }

    /// 获取函数的所有调用者 (向上追溯)
    pub fn find_callers(&self, symbol: SymbolId, depth: usize) -> CallTree {
        let mut tree = CallTree::new(symbol);
        self.build_caller_tree(&mut tree, depth, &mut HashSet::new());
        tree
    }

    /// 获取函数调用的所有函数 (向下追溯)
    pub fn find_callees(&self, symbol: SymbolId, depth: usize) -> CallTree {
        let mut tree = CallTree::new(symbol);
        self.build_callee_tree(&mut tree, depth, &mut HashSet::new());
        tree
    }
}
```

### 3. 影响分析

```rust
pub struct ImpactAnalysis {
    /// 直接影响的符号
    pub direct_impact: Vec<SymbolId>,

    /// 间接影响的符号
    pub indirect_impact: Vec<SymbolId>,

    /// 受影响的测试
    pub affected_tests: Vec<SymbolId>,

    /// 影响范围评估
    pub severity: ImpactSeverity,
}

impl ProjectIndex {
    pub fn analyze_impact(&self, symbol: SymbolId) -> ImpactAnalysis {
        let mut analysis = ImpactAnalysis::new();

        // 1. 找到所有直接引用
        let direct_refs = self.find_direct_references(symbol);
        analysis.direct_impact = direct_refs.iter()
            .map(|r| r.containing_symbol)
            .collect();

        // 2. 找到间接引用 (通过调用链)
        for direct in &analysis.direct_impact {
            let callers = self.find_callers(*direct, 3);
            analysis.indirect_impact.extend(callers.flatten());
        }

        // 3. 找到受影响的测试
        for impacted in analysis.direct_impact.iter()
            .chain(analysis.indirect_impact.iter())
        {
            if self.is_test_function(*impacted) {
                analysis.affected_tests.push(*impacted);
            }
        }

        // 4. 评估影响程度
        analysis.severity = self.evaluate_severity(&analysis);

        analysis
    }
}
```

### 4. 死代码检测

```rust
impl ProjectIndex {
    pub fn find_unused_symbols(&self) -> Vec<UnusedSymbol> {
        let mut unused = Vec::new();

        for (id, symbol) in self.symbols.iter() {
            // 跳过入口点
            if self.is_entry_point(&symbol) {
                continue;
            }

            // 跳过公开导出
            if self.is_exported(&symbol) {
                continue;
            }

            // 检查是否有引用
            let references = self.find_references(*id);
            if references.is_empty() {
                unused.push(UnusedSymbol {
                    symbol: *id,
                    kind: symbol.kind,
                    location: symbol.location.clone(),
                    suggestion: self.suggest_action(&symbol),
                });
            }
        }

        unused
    }

    fn is_entry_point(&self, symbol: &Symbol) -> bool {
        // main 函数
        if symbol.name == "main" && symbol.kind == SymbolKind::Function {
            return true;
        }

        // 测试函数
        if symbol.attributes.iter().any(|a| a.name == "test") {
            return true;
        }

        // 生命周期钩子等
        false
    }
}
```

## 语言适配器

每种语言需要实现 `LanguageAdapter` trait：

```rust
pub trait LanguageAdapter: Send + Sync {
    /// 解析文件
    fn parse(&self, content: &str) -> Result<Ast>;

    /// 提取符号
    fn extract_symbols(&self, ast: &Ast) -> Vec<Symbol>;

    /// 分析导入
    fn analyze_imports(&self, ast: &Ast) -> Vec<Import>;

    /// 分析导出
    fn analyze_exports(&self, ast: &Ast) -> Vec<Export>;

    /// 解析类型信息
    fn resolve_types(&self, ast: &Ast, symbols: &SymbolTable) -> Result<()>;

    /// 获取支持的文件扩展名
    fn extensions(&self) -> &[&str];
}

// 使用 tree-sitter 实现
pub struct TreeSitterAdapter {
    language: tree_sitter::Language,
    queries: LanguageQueries,
}
```

## JSON-RPC API

### 索引操作

```json
// 开始全量索引
{ "method": "index/full", "params": { "root": "/path/to/project" } }

// 增量更新
{ "method": "index/update", "params": { "file": "/path/to/file.ts" } }

// 获取索引状态
{ "method": "index/status" }
```

### 高级查询

```json
// 安全重命名分析
{
  "method": "refactor/analyzeRename",
  "params": { "uri": "file:///...", "position": {...}, "newName": "newFoo" }
}

// 查找调用链
{
  "method": "analysis/callHierarchy",
  "params": { "uri": "file:///...", "position": {...}, "direction": "incoming" }
}

// 影响分析
{
  "method": "analysis/impact",
  "params": { "uri": "file:///...", "position": {...} }
}

// 查找未使用符号
{
  "method": "analysis/unusedSymbols",
  "params": { "uri": "file:///..." }
}
```

## 性能优化

1. **并行解析**: 使用 Rayon 并行处理文件解析
2. **增量更新**: 只重新解析修改的文件及其依赖
3. **内存映射**: 对大文件使用 mmap
4. **LRU 缓存**: 缓存最近访问的 AST
5. **延迟加载**: 按需加载依赖的类型信息

## 实现计划

### Phase 2.1: 基础索引 ✅
- [x] 实现 Symbol Table 结构 (`logos-index/src/symbol_table.rs`)
- [x] TypeScript/JavaScript 语言适配器 (`logos-index/src/typescript_adapter.rs`)
- [x] 基础符号提取和查找
- [x] LanguageAdapter trait 定义 (`logos-index/src/adapter.rs`)
- [x] ProjectIndexer 协调器 (`logos-index/src/indexer.rs`)

### Phase 2.2: 跨文件分析 ✅
- [x] 实现 Dependency Graph
- [x] 导入/导出分析 (ImportInfo, ExportInfo)
- [x] 增量更新机制 (reindex_file)

### Phase 2.3: 调用图 ✅
- [x] 实现 Call Graph
- [x] 调用站点追踪 (CallSite, CallType)
- [x] 类型层级关系 (TypeHierarchy: extends/implements)
- [x] Call Hierarchy API (`logos-daemon/src/handlers/call_hierarchy.rs`)
- [x] 调用链追踪 UI (`src/components/Intelligence/CallHierarchyPanel.vue`)
- [x] 影响分析 UI (`src/components/Intelligence/ImpactAnalysisPanel.vue`)

### Phase 2.4: 高级重构
- [ ] 安全重命名
- [ ] 提取方法/变量
- [ ] 移动符号
- [ ] 内联

### Phase 2.5: 更多语言
- [x] Python 适配器 (`logos-index/src/python_adapter.rs`)
- [ ] Go 适配器
- [ ] Rust 适配器
- [ ] C/C++ 适配器
- [ ] Java 适配器

## 已实现的核心组件

### Rust 端 (`logos-lang/crates/logos-index/`)

| 文件 | 描述 |
|------|------|
| `symbol_table.rs` | SymbolTable, CallGraph, TypeHierarchy, DependencyGraph, ProjectIndex |
| `adapter.rs` | LanguageAdapter trait, AnalysisResult, ImportInfo, ExportInfo, CallInfo |
| `typescript_adapter.rs` | TypeScript/JavaScript 解析器，使用 tree-sitter |
| `python_adapter.rs` | Python 解析器，使用 tree-sitter |
| `indexer.rs` | ProjectIndexer 协调器，文件/目录索引 |

### Rust 端 (`logos-lang/crates/logos-daemon/`)

| 文件 | 描述 |
|------|------|
| `state.rs` | IntelligenceMode, ProjectIndexer 集成 |
| `handlers/call_hierarchy.rs` | prepareCallHierarchy, incomingCalls, outgoingCalls |
| `handlers/mode.rs` | setMode, getMode, getIndexStats |

### 前端 (`src/`)

| 文件 | 描述 |
|------|------|
| `stores/intelligence.ts` | Pinia store 管理智能模式状态 |
| `stores/callHierarchy.ts` | 调用层级状态管理 |
| `stores/impactAnalysis.ts` | 影响分析状态管理 |
| `components/StatusBar/IntelligenceModeIndicator.vue` | 状态栏模式指示器 |
| `components/Intelligence/CallHierarchyPanel.vue` | 调用链追踪面板 |
| `components/Intelligence/CallHierarchyTreeNode.vue` | 调用链树节点组件 |
| `components/Intelligence/ImpactAnalysisPanel.vue` | 影响分析面板 |

### 后端 (`electron/`)

| 文件 | 描述 |
|------|------|
| `services/intelligenceService.ts` | IPC 处理器，模式切换 |
| `services/memoryMonitorService.ts` | 内存压力监控服务 |
| `preload.ts` | setMode, analyzeProject, memory API |
