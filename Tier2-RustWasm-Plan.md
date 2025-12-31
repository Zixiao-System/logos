# Tier2 - Rust-WASM 内建语言服务计划

> **状态**: ✅ 已完成 (2024-12-31)

## 完成概要

- [x] Rust workspace 搭建 (`logos-lang/`)
- [x] tree-sitter 集成 (Python, Go, Rust, C, C++, Java)
- [x] WASM 绑定与构建
- [x] Monaco Editor 集成
- [x] 双路径架构 (IPC for TS/JS, WASM for others)
- [x] CSP 配置支持 WebAssembly

## 目标

用 Rust 编译为 WASM 实现轻量级内建语言服务，**完全取消外部 LSP 依赖**，实现安装包瘦身（从 ~160MB 降至 ~5MB）。

## 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │   Monaco    │◄──►│     WASM Language Service    │   │
│  │   Editor    │    │  ┌────────────────────────┐  │   │
│  └─────────────┘    │  │   logos-lang-core.wasm │  │   │
│                     │  │  ├─ tree-sitter        │  │   │
│                     │  │  ├─ semantic analyzer  │  │   │
│                     │  │  └─ symbol index       │  │   │
│                     │  └────────────────────────┘  │   │
│                     └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Rust Crate 结构

```
logos-lang/                         # Rust workspace
├── Cargo.toml
├── crates/
│   ├── logos-core/                 # 核心类型与接口
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── document.rs         # 文档管理
│   │       ├── position.rs         # Position, Range
│   │       ├── symbol.rs           # Symbol, Scope
│   │       └── diagnostic.rs       # Diagnostic
│   │
│   ├── logos-parser/               # 解析层 (tree-sitter)
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── python.rs
│   │       ├── go.rs
│   │       ├── rust.rs
│   │       ├── c.rs
│   │       ├── cpp.rs
│   │       └── java.rs
│   │
│   ├── logos-semantic/             # 语义分析
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── resolver.rs         # 符号解析
│   │       ├── type_infer.rs       # 类型推断 (简化版)
│   │       └── scope.rs            # 作用域分析
│   │
│   ├── logos-index/                # 符号索引
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── inverted.rs         # 倒排索引
│   │       └── incremental.rs      # 增量更新
│   │
│   └── logos-wasm/                 # WASM 绑定
│       └── src/
│           ├── lib.rs
│           └── api.rs              # JS 调用接口
│
└── build.sh                        # wasm-pack 构建脚本
```

## 依赖的 Rust Crates

| Crate | 用途 | WASM 兼容 |
|-------|------|-----------|
| `tree-sitter` | 增量解析器 | ✅ |
| `tree-sitter-python` | Python 语法 | ✅ |
| `tree-sitter-go` | Go 语法 | ✅ |
| `tree-sitter-rust` | Rust 语法 | ✅ |
| `tree-sitter-c` | C 语法 | ✅ |
| `tree-sitter-cpp` | C++ 语法 | ✅ |
| `tree-sitter-java` | Java 语法 | ✅ |
| `wasm-bindgen` | JS/WASM 绑定 | ✅ |
| `serde` | 序列化 | ✅ |

## JS/TS 接口设计

```typescript
// src/services/language/wasmService.ts

import init, { LanguageService } from 'logos-lang-wasm'

export class WasmLanguageService {
  private service: LanguageService | null = null

  async initialize(): Promise<void> {
    await init()
    this.service = new LanguageService()
  }

  // 文档同步
  openDocument(uri: string, content: string, languageId: string): void
  updateDocument(uri: string, content: string, version: number): void
  closeDocument(uri: string): void

  // 智能功能
  getCompletions(uri: string, line: number, column: number): CompletionItem[]
  getDefinition(uri: string, line: number, column: number): Location | null
  getReferences(uri: string, line: number, column: number): Location[]
  getHover(uri: string, line: number, column: number): HoverInfo | null
  getDiagnostics(uri: string): Diagnostic[]
  getDocumentSymbols(uri: string): DocumentSymbol[]

  // 重构
  prepareRename(uri: string, line: number, column: number): PrepareRenameResult | null
  doRename(uri: string, line: number, column: number, newName: string): WorkspaceEdit
}
```

## 实现步骤

### Phase 1: 基础设施 (MVP)

1. **搭建 Rust workspace**
   - 创建 `logos-lang/` 目录
   - 配置 Cargo.toml (workspace)
   - 配置 wasm-pack

2. **实现 logos-core**
   - Position, Range 类型
   - Document 管理（增量更新）
   - Symbol, Diagnostic 类型

3. **集成 tree-sitter**
   - 封装 tree-sitter API
   - 实现 Python 解析器
   - 验证增量解析

4. **WASM 绑定**
   - 使用 wasm-bindgen 导出 API
   - 构建 `.wasm` + `.js` glue code
   - 集成到 Vite 构建流程

### Phase 2: 语义分析

5. **符号提取**
   - 从 AST 提取符号（函数、类、变量）
   - 构建作用域树
   - 实现符号查找

6. **基础补全**
   - 基于符号表的补全
   - 关键字补全
   - Import 补全

7. **定义跳转与引用**
   - 符号定义定位
   - 引用查找

### Phase 3: 增量索引

8. **倒排索引**
   - 符号名 → 位置 映射
   - 文件 → 符号 映射
   - 增量更新

9. **跨文件分析**
   - Import/Export 解析
   - 模块依赖图

### Phase 4: 扩展语言支持

10. **逐步添加语言**
    - Go → Rust → C/C++ → Java
    - 每种语言复用相同的语义分析框架

## 性能目标

| 指标 | 目标值 |
|------|--------|
| WASM 加载 | < 500ms |
| 补全响应 | < 50ms |
| 诊断更新 | < 100ms |
| 内存占用 | < 50MB (10万行项目) |
| .wasm 体积 | < 5MB (压缩后) |

## Monaco 集成

```typescript
// src/views/EditorView.vue 中注册 Provider

monaco.languages.registerCompletionItemProvider('python', {
  provideCompletionItems: async (model, position) => {
    const completions = wasmService.getCompletions(
      model.uri.toString(),
      position.lineNumber,
      position.column
    )
    return { suggestions: completions }
  }
})

monaco.languages.registerDefinitionProvider('python', {
  provideDefinition: async (model, position) => {
    return wasmService.getDefinition(
      model.uri.toString(),
      position.lineNumber,
      position.column
    )
  }
})
```

## 构建集成

### Vite 配置

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'lang-wasm': ['logos-lang-wasm']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['logos-lang-wasm']
  }
})
```

### CI/CD

```yaml
# .github/workflows/build.yml
- name: Build WASM
  run: |
    cd logos-lang
    wasm-pack build --target web --release
    cp -r pkg ../src/services/language/wasm
```

## 清理项

删除以下 LSP 相关文件/目录：

```
electron/services/lsp/              # LSP 客户端代码
scripts/download-lsp-servers.ts     # LSP 下载脚本
resources/bin/                      # LSP 二进制文件 (~159MB)
package.json 中的 LSP 相关 scripts
```

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| tree-sitter WASM 体积大 | 按需加载语言语法，懒加载 |
| 复杂类型推断 | 先实现局部推断，退化为 `any` |
| 跨文件分析慢 | 使用 Web Worker 后台索引 |
| C++ 宏展开 | 不支持宏语义，仅语法高亮 |

## 与 Tier2-NoLsp-Plan 的对比

| 方面 | NoLsp (纯 TS) | Rust-WASM |
|------|---------------|-----------|
| 解析性能 | 中等 | 高 (tree-sitter) |
| 安装包体积 | 无外部依赖 | +5MB WASM |
| 开发效率 | 高 | 中 (需 Rust) |
| 增量解析 | 需自研 | tree-sitter 内建 |
| 类型安全 | TS | Rust 更强 |
| 内存效率 | 一般 | 高 |

## 下一步行动

1. 创建 `logos-lang/` Rust workspace
2. 集成 tree-sitter + tree-sitter-python
3. 实现基础 WASM 绑定
4. 删除现有 LSP 代码和资源
5. Monaco 集成 demo