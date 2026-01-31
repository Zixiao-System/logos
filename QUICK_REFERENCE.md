# Logos IDE 诊断系统 - 快速参考指南

一份可打印的快速查询卡片，用于快速查找诊断系统的关键信息。

---

## 🎯 30 秒快速了解

```
Logos IDE 的诊断系统在编辑器中显示代码问题（错误、警告等）

工作流程:
编辑代码 → 防抖 500ms → 诊断请求
         → 多源路由 (TS/LSP/Daemon) 
         → 转换为 Monaco Markers
         → 渲染波浪线 + 图标

特色: 支持多种语言、智能模式切换、完整的主题系统
```

---

## 📍 核心类和函数速查

### DiagnosticsManager 关键方法
```typescript
setDiagnostics(model, diagnostics)     // 设置诊断
clearDiagnostics(model)                 // 清除诊断
getDiagnostics(model)                   // 获取诊断
getStats()                              // 获取统计
```

### IntelligenceManager 关键方法
```typescript
updateDiagnostics(model)                // 更新诊断 (自动路由)
isNativeLanguage(path)                  // 是否 TypeScript
isDaemonLanguage(path)                  // 是否 Logos 语言
isSupported(path)                       // 是否支持分析
```

### 诊断类型
```typescript
interface Diagnostic {
  range: Range                           // 问题位置
  message: string                        // 问题消息
  severity: 'error'|'warning'|'info'|'hint'
  code?: string | number                 // 错误代码
  source?: string                        // 诊断源
}
```

---

## 🎨 渲染位置

| 位置 | 含义 | 示例 |
|------|------|------|
| **代码行** | 波浪线 | ━━━ (error) |
| **左边距** | 圆点图标 | ● |
| **小地图** | 彩色条 | \|█\| |
| **悬停提示** | 完整信息 | 点击显示 |
| **问题面板** | 列表清单 | （待实现）|

---

## 🔄 诊断源路由

```
filePath
  ├─ .ts/.js/.tsx/.jsx?  → TypeScript API
  ├─ .logos?             → Logos Daemon (Smart Mode)
  └─ 其他                → LSP 服务器
```

---

## 🛠️ 常用代码片段

### 获取当前诊断
```typescript
const manager = getIntelligenceManager()
const diagnosticsManager = manager.diagnosticsManager
const model = editor.getModel()
const diags = diagnosticsManager.getDiagnostics(model)
```

### 手动更新诊断
```typescript
const manager = getIntelligenceManager()
const model = editor.getModel()
await manager.updateDiagnostics(model)
```

### 清除所有诊断
```typescript
diagnosticsManager.clearAll()
```

### 获取统计
```typescript
const stats = diagnosticsManager.getStats()
console.log(`Errors: ${stats.errors}, Warnings: ${stats.warnings}`)
```

### 监听诊断变化
```typescript
// LSP 诊断事件
window.electronAPI.intelligence.onDiagnostics(
  (params) => console.log(params)
)

// Daemon 诊断事件
window.electronAPI.daemon.onDiagnostics(
  (callback) => callback()
)
```

---

## 🎯 严重级别映射

| 级别 | Monaco 值 | 颜色 | 图标 |
|------|-----------|------|------|
| error | MarkerSeverity.Error (8) | 🔴 红色 | ● |
| warning | MarkerSeverity.Warning (4) | 🟡 黄色 | ▲ |
| info | MarkerSeverity.Info (2) | 🔵 蓝色 | ℹ |
| hint | MarkerSeverity.Hint (1) | ⚪ 灰色 | 💡 |

---

## 📊 性能数据

| 操作 | 时间 |
|------|------|
| TypeScript 诊断 | 10-50ms |
| Daemon 诊断 | 50-150ms |
| LSP 诊断 | 100-300ms |
| 防抖延迟 | 500ms |
| Monaco 标记更新 | 1-10ms |

---

## 🔐 IPC 接口

### 获取诊断
```javascript
// 主进程 → 渲染进程
window.electronAPI.intelligence.getDiagnostics(filePath)
  // → Promise<Diagnostic[]>

window.electronAPI.daemon.diagnostics(uri)
  // → Promise<{ items?: DaemonDiagnostic[] }>
```

### 监听诊断
```javascript
window.electronAPI.intelligence.onDiagnostics(callback)
  // callback(params: { filePath, diagnostics })

window.electronAPI.daemon.onDiagnostics(callback)
  // callback(params: unknown)
```

---

## 🌈 主题颜色变量

### 深色主题
```css
--editor-error-color: #ff4a56
--editor-warning-color: #ffab00
--editor-info-color: #3b9fff
--editor-hint-color: #888888
```

### 浅色主题
```css
--editor-error-color: #d13438
--editor-warning-color: #da3b01
--editor-info-color: #0078d4
--editor-hint-color: #666666
```

---

## 🐛 调试技巧

### 检查诊断状态
```typescript
// 在控制台运行
const manager = getIntelligenceManager()
const stats = manager.diagnosticsManager.getStats()
console.log(stats)
// {errors: 5, warnings: 3, hints: 0}
```

### 强制更新诊断
```typescript
const model = editor.getModel()
await getIntelligenceManager().updateDiagnostics(model)
```

### 查看诊断详情
```typescript
const model = editor.getModel()
const diags = getIntelligenceManager()
  .diagnosticsManager.getDiagnostics(model)
console.table(diags)
```

### 监听诊断事件
```typescript
// 打开 DevTools 控制台
window.electronAPI.intelligence.onDiagnostics(
  (params) => console.log('诊断更新:', params)
)
```

---

## ⚡ 常见问题速答

**Q: 诊断为什么没有立即显示？**
A: 有 500ms 防抖延迟。继续输入时会重置计时器。

**Q: 为什么某些文件没有诊断？**
A: 检查文件扩展名是否支持。使用 `isSupported()` 检查。

**Q: 如何切换诊断源？**
A: 使用 `setMode()` 切换 Basic/Smart 模式。

**Q: 诊断消息太多怎么办？**
A: 问题面板完成后可以搜索和过滤。目前可用编辑器查找。

**Q: 是否支持快速修复？**
A: LSP 支持但未集成 UI。使用灯泡命令需要手工实现。

---

## 🚀 快速修复 (Future)

当快速修复完成后，API 会这样使用：

```typescript
// 获取快速修复
const codeActions = await manager.getCodeActions(
  model,
  diagnostic
)

// 应用修复
await codeActions[0].execute()
```

---

## 📁 文件位置快速索引

| 功能 | 文件 | 行号 |
|------|------|------|
| 诊断管理 | `src/services/lsp/DiagnosticsManager.ts` | 1-108 |
| 智能路由 | `src/services/lsp/IntelligenceManager.ts` | 370-390 |
| 编辑器集成 | `src/views/EditorView.vue` | 162-235 |
| 防抖设置 | `src/views/EditorView.vue` | 226-235 |
| 问题面板 | `src/components/BottomPanel/BottomPanel.vue` | 136-142 |
| 类型定义 | `src/types/intelligence.ts` | 111-130 |
| IPC 定义 | `electron/preload.ts` | 1643-1665 |
| 后端服务 | `electron/services/intelligenceService.ts` | 530-555 |

---

## 🎓 学习路径

```
初级 (5分钟)
  └─ 阅读本文档

中级 (30分钟)
  ├─ EXPLORATION_SUMMARY.md
  └─ ARCHITECTURE_DIAGRAMS.md 的图表

高级 (2小时)
  ├─ HDR_PROBLEM_MARKERS_EXPLORATION.md (完全)
  └─ 查看对应源代码

专家 (1天)
  ├─ HDR_IMPLEMENTATION_GUIDE.md
  ├─ VS_CODE_COMPARISON.md
  └─ 实现新功能或 HDR 支持
```

---

## 🔗 相关命令

### 命令面板命令 (规划中)
```
Problems: Show
Problems: Focus
Problems: Clear All
Intelligence: Update Diagnostics
Intelligence: Switch Mode
```

### 快捷键 (规划中)
```
Cmd+Shift+M    → 显示问题面板
Ctrl+K Ctrl+M  → 跳转到下一个问题
Ctrl+K Ctrl+P  → 跳转到上一个问题
```

---

## 📈 项目指标

- **诊断来源**: 3 (TypeScript + LSP + Daemon)
- **支持语言**: 12+ (TS/JS/Rust/Go/Python/C++/等)
- **防抖延迟**: 500ms
- **问题面板**: ⚠️ 未实现
- **快速修复**: ❌ 未实现
- **HDR 支持**: 🔜 计划中

---

## 💡 贡献机会

### 容易 (新手友好)
- [ ] 在控制台显示诊断统计
- [ ] 添加诊断计数到状态栏
- [ ] 创建诊断颜色主题

### 中等
- [ ] 完成问题面板实现
- [ ] 添加诊断搜索和过滤
- [ ] 实现点击定位

### 困难
- [ ] 集成快速修复 (CodeAction)
- [ ] 添加 HDR 支持
- [ ] 性能优化 (虚拟化)

---

## 📞 获取帮助

**代码问题?**
→ 查看 `tests/unit/` 中的测试用例

**API 问题?**
→ 查看 `src/types/intelligence.ts`

**集成问题?**
→ 查看 ARCHITECTURE_DIAGRAMS.md

**实现问题?**
→ 参考 HDR_IMPLEMENTATION_GUIDE.md

---

## 🎁 备忘单下载

这个文档可以：
- 打印为快速参考卡片
- 放在显示器旁边
- 分享给团队成员
- 添加到 IDE 快速帮助

---

**最后更新**: 2026年1月27日
**版本**: v1.0
**适用于**: Logos IDE v2026.5.2+
