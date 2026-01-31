# Logos WASM 扩展标准（初稿）

## 1. 目标

- 提供受控、可审计、可沙箱化的扩展运行时
- 限制 Node.js 生态的黑科技依赖，提升稳定性与安全性
- 与 VS Code 扩展并行（双轨制），逐步承接关键能力

## 2. 打包格式

- 文件扩展名建议：`.lwasm`（Logos WASM Extension）
- 本质为 zip 包，包含：
  - `extension.wasm`（必需）
  - `extension.json`（必需，清单）
  - `README.md` / `CHANGELOG.md` / `assets/`（可选）

## 3. 清单（extension.json）

```json
{
  "name": "logos-lint",
  "displayName": "Logos Lint",
  "version": "1.0.0",
  "description": "Example WASM extension",
  "publisher": "logos",
  "engines": {
    "logos": ">=2026.5.0"
  },
  "entry": "extension.wasm",
  "permissions": [
    "fs:workspace:read",
    "fs:workspace:write",
    "net:fetch",
    "terminal:run"
  ],
  "capabilities": {
    "commands": ["logosLint.run"],
    "languages": ["javascript", "typescript"],
    "providers": ["completion", "hover", "diagnostics"],
    "views": ["logosLint.panel"]
  }
}
```

## 4. 运行时模型

- 默认运行在受限 WASM 沙箱中（WASI + Logos 扩展 API）
- 无 Node.js `require`，无直接文件系统访问
- 通过宿主暴露的 API 进行能力调用（能力需在清单中声明）

### 4.1 生命周期

- `activate()`：扩展加载时调用
- `deactivate()`：扩展卸载/停用时调用
- 宿主通过消息/RPC 调度事件（命令、文件变更、语言服务等）

## 5. API 设计（建议）

建议采用 RPC 模型 + WASM imports 组合：

- `logos.env.postMessage(ptr, len)` → 发送消息给宿主
- `logos.env.readMessage(ptr, len)` → 拉取宿主消息
- `logos.env.fsRead(uri)` / `logos.env.fsWrite(uri, content)`
- `logos.env.netFetch(url, method, headers, body)`
- `logos.env.showMessage(level, text)`

数据序列化建议：
- JSON（优先）或 MessagePack（性能可选）

## 6. 权限与安全

- 权限最小化：扩展只能访问声明的能力
- 用户授权：首次启用需确认权限（与 VS Code 扩展一致的统一信任策略）
- 日志隔离：扩展输出写入独立日志通道
- 资源限制：CPU/内存/执行时间配额

## 7. 版本与兼容性

- `engines.logos` 控制运行时版本
- 宿主提供 `logos.version` 能力查询
- API 变更需版本化（`apiVersion`）

## 8. 双轨制关系

- VS Code 扩展继续使用现有 `.vsix` 生态
- WASM 扩展提供安全/高性能选项
- 长期目标：核心能力优先迁移到 WASM 扩展标准

## 9. 后续计划

- 定义标准 RPC 协议与二进制消息格式
- 制定扩展签名与市场分发规范
- 完成 SDK（Rust/TypeScript）与示例模板
