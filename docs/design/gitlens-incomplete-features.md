# GitLens & Git Graph - 待完善功能清单

本文档记录了 GitLens 和 Git Graph 功能中尚未完全实现或使用简单实现的部分，标记为稍后实现。

---

## 🚧 暂时禁用: Git Graph 视图

**状态**: 已暂时从应用中移除，代码保留在 `src/components/GitGraph/` 目录

**原因**: 虚拟滚动和 SVG 渲染存在布局问题，需要重新设计

**已有代码**:
- `src/components/GitGraph/GitGraphView.vue` - 主视图
- `src/components/GitGraph/Graph/GraphCanvas.vue` - SVG 画布
- `src/components/GitGraph/CommitList/GraphCommitRow.vue` - Commit 行
- `src/components/GitGraph/CommitList/CommitDetailsPanel.vue` - 详情面板
- `src/components/GitGraph/Toolbar/GraphToolbar.vue` - 工具栏
- `src/components/GitGraph/Actions/CommitContextMenu.vue` - 上下文菜单
- `src/stores/gitGraph.ts` - 状态管理
- `src/types/gitGraph.ts` - 类型定义

**待修复问题**:
- [ ] SVG 画布与虚拟滚动同步问题
- [ ] 节点位置计算与行内容对齐
- [ ] 连线绘制跨越可见区域时的渲染
- [ ] 大量 commits 时的性能优化

**恢复步骤**:
1. 修复 `GraphCanvas.vue` 中的坐标计算
2. 在 `App.vue` 的 `panelItems` 中添加 `gitGraph`
3. 在 `router/index.ts` 中恢复 `/git-graph` 路由
4. 测试虚拟滚动在各种 commits 数量下的表现

---

## Phase 3: 编辑器上下文菜单

### 1. Compare with Previous Revision
**文件**: `src/views/EditorView.vue:433-446`

**当前状态**: 仅打印日志，未实现实际功能

**待实现**:
- [ ] 创建 Diff 视图组件 (`DiffView.vue`)
- [ ] 获取文件的上一版本内容 (`git:getFileAtCommit`)
- [ ] 实现 Monaco 的 diff editor 集成
- [ ] 支持多版本选择比较

```typescript
// 当前实现
run: async () => {
  console.log('Compare with previous:', relativePath)
  // TODO: 打开 diff 视图
}
```

### 2. Show in Git Graph
**文件**: `src/views/EditorView.vue:477-488`

**当前状态**: 仅打印日志，未跳转到 Git Graph

**待实现**:
- [ ] 实现路由跳转到 `/git-graph`
- [ ] 传递 commit hash 参数
- [ ] Git Graph 视图接收参数并滚动到指定 commit
- [ ] 高亮显示目标 commit

```typescript
// 当前实现
run: () => {
  console.log('Show in Git Graph:', blameStore.currentLineBlame.commitHash)
  // TODO: 跳转到 Git Graph 并选中该 commit
}
```

---

## Phase 2: Inline Blame

### 3. Blame Hover Card 事件处理
**文件**: `src/views/EditorView.vue:776-785`

**当前状态**: 所有事件仅打印日志

**待实现**:
- [ ] `@view-commit`: 跳转到 commit 详情视图
- [ ] `@view-file-history`: 打开文件历史面板并选中该 commit
- [ ] `@copy-hash`: 已实现复制功能，需要添加 toast 提示

```vue
<!-- 当前实现 -->
<BlameHoverCard
  @view-commit="(hash) => console.log('View commit:', hash)"
  @view-file-history="() => console.log('View file history')"
  @copy-hash="(hash) => console.log('Copied hash:', hash)"
/>
```

---

## Phase 5: 交互式操作

### 4. Create Tag 对话框
**文件**: `src/components/GitGraph/GitGraphView.vue:119-125`

**当前状态**: 使用浏览器原生 `prompt()` 获取 tag 名称

**待实现**:
- [ ] 创建 MDUI 风格的 Tag 创建对话框组件
- [ ] 支持添加 tag message
- [ ] 支持选择轻量级或注释型 tag
- [ ] 表单验证（tag 名称格式）

```typescript
// 当前实现
case 'createTag':
  const tagName = prompt('输入 Tag 名称:')
  if (tagName) {
    await gitGraphStore.createTag(tagName, hash)
  }
```

### 5. Create Branch 对话框
**文件**: `src/components/GitGraph/GitGraphView.vue:126-132`

**当前状态**: 使用浏览器原生 `prompt()` 获取分支名称

**待实现**:
- [ ] 创建 MDUI 风格的分支创建对话框组件
- [ ] 支持选择是否立即切换到新分支
- [ ] 表单验证（分支名称格式）
- [ ] 显示分支创建来源信息

```typescript
// 当前实现
case 'createBranch':
  const branchName = prompt('输入分支名称:')
  if (branchName) {
    await window.electronAPI.git.createBranch(repoPath, branchName)
  }
```

### 6. Reset 确认对话框
**文件**: `src/components/GitGraph/GitGraphView.vue:133-150`

**当前状态**: 使用浏览器原生 `confirm()` 确认操作

**待实现**:
- [ ] 创建 MDUI 风格的确认对话框
- [ ] 对于 `--hard` 显示更明确的警告
- [ ] 显示将要丢失的更改预览
- [ ] 支持取消和确认操作

---

## Phase 4: Git Graph 可视化

### 7. 分支筛选和搜索
**文件**: `src/components/GitGraph/Toolbar/GraphToolbar.vue`

**当前状态**: 搜索框存在但功能未完全实现

**待实现**:
- [ ] 实现 commit message 搜索
- [ ] 实现作者筛选
- [ ] 实现日期范围筛选
- [ ] 分支/Tag 筛选面板
- [ ] 搜索结果高亮显示

### 8. Commit 详情面板优化
**文件**: `src/components/GitGraph/CommitList/CommitDetailsPanel.vue`

**当前状态**: 基础信息显示

**待实现**:
- [ ] 文件变更列表点击跳转到文件
- [ ] 显示 diff 预览
- [ ] 支持复制各种信息
- [ ] 关联的 PR/Issue 链接（如果有）

---

## Phase 3: 文件历史

### 9. Line History 专用视图
**文件**: `src/components/GitLens/FileHistory/FileHistoryPanel.vue`

**当前状态**: 行历史和文件历史共用同一面板

**待实现**:
- [ ] 创建专门的行历史视图组件
- [ ] 显示行内容的演变过程
- [ ] 支持跳转到任意版本查看
- [ ] 比较不同版本的行内容

### 10. Commit 选择后的操作
**文件**: `src/views/EditorView.vue:716-717`

**当前状态**: 选择 commit 仅打印日志

**待实现**:
- [ ] 查看该 commit 时的文件内容
- [ ] 与当前版本比较
- [ ] 恢复文件到该版本
- [ ] 查看该 commit 的完整详情

```vue
<!-- 当前实现 -->
@select-commit="(hash) => console.log('Selected commit:', hash)"
```

---

## 优先级建议

| 优先级 | 功能 | 原因 |
|--------|------|------|
| 高 | Compare with Previous | 核心 GitLens 功能 |
| 高 | Blame Hover Card 事件 | 用户交互关键路径 |
| 中 | Create Tag/Branch 对话框 | 改善用户体验 |
| 中 | Show in Git Graph | 功能联动 |
| 低 | Reset 确认对话框 | 使用频率较低 |
| 低 | Line History 专用视图 | 可后期优化 |

---

## 实现建议

### 通用对话框组件
建议创建一个通用的对话框组件目录：
```
src/components/Dialogs/
├── CreateTagDialog.vue
├── CreateBranchDialog.vue
├── ConfirmDialog.vue
└── InputDialog.vue
```

### Diff 视图
建议创建独立的 Diff 视图目录：
```
src/components/DiffView/
├── DiffView.vue           # 主视图
├── DiffEditor.vue         # Monaco diff editor 封装
└── DiffSidebar.vue        # 文件变更列表
```

---

*最后更新: 2026-01-17*
