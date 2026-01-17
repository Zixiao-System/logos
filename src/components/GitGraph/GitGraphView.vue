<script setup lang="ts">
/**
 * Git Graph 主视图
 * 显示 Git 提交历史的可视化图形
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useGitGraphStore } from '@/stores/gitGraph'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import GraphToolbar from './Toolbar/GraphToolbar.vue'
import GraphCanvas from './Graph/GraphCanvas.vue'
import GraphCommitRow from './CommitList/GraphCommitRow.vue'
import CommitDetailsPanel from './CommitList/CommitDetailsPanel.vue'
import CommitContextMenu from './Actions/CommitContextMenu.vue'
import type { GraphCommit } from '@/types/gitGraph'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/error.js'

const gitGraphStore = useGitGraphStore()
const fileExplorerStore = useFileExplorerStore()

// 虚拟滚动相关
const scrollContainer = ref<HTMLElement | null>(null)
const rowHeight = 40 // 每行高度
const bufferRows = 10 // 缓冲行数

// 计算可见行
const visibleStart = ref(0)
const containerHeight = ref(600)

// 上下文菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuCommit = ref<GraphCommit | null>(null)

const visibleCommits = computed(() => {
  const count = Math.ceil(containerHeight.value / rowHeight) + bufferRows * 2
  const start = Math.max(0, visibleStart.value - bufferRows)
  const end = Math.min(gitGraphStore.commits.length, start + count)
  return gitGraphStore.commits.slice(start, end).map((commit, i) => ({
    ...commit,
    virtualIndex: start + i
  }))
})

// 总高度
const totalHeight = computed(() => gitGraphStore.commits.length * rowHeight)

// 加载数据
async function loadData() {
  if (fileExplorerStore.rootPath) {
    await gitGraphStore.loadGraph(fileExplorerStore.rootPath)
  }
}

// 刷新
async function refresh() {
  await gitGraphStore.refresh()
}

// 处理滚动
function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  visibleStart.value = Math.floor(target.scrollTop / rowHeight)

  // 检查是否需要加载更多
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
    gitGraphStore.loadMore()
  }
}

// 选择 commit
function handleSelectCommit(hash: string) {
  gitGraphStore.selectCommit(hash)
}

// 右键菜单
function handleContextMenu(commit: GraphCommit, event: MouseEvent) {
  event.preventDefault()
  contextMenuCommit.value = commit
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

// 关闭上下文菜单
function closeContextMenu() {
  contextMenuVisible.value = false
  contextMenuCommit.value = null
}

// 处理上下文菜单操作
async function handleContextMenuAction(action: string, hash: string) {
  const repoPath = fileExplorerStore.rootPath
  if (!repoPath) return

  try {
    switch (action) {
      case 'checkout':
        await window.electronAPI.git.checkout(repoPath, hash)
        await refresh()
        break
      case 'cherryPick':
        const cherryResult = await gitGraphStore.cherryPick(hash)
        if (!cherryResult.success) {
          console.error('Cherry-pick failed:', cherryResult.error)
        }
        await refresh()
        break
      case 'revert':
        const revertResult = await gitGraphStore.revert(hash)
        if (!revertResult.success) {
          console.error('Revert failed:', revertResult.error)
        }
        await refresh()
        break
      case 'createTag':
        // 简单实现，实际应该弹出对话框让用户输入 tag 名称
        const tagName = prompt('输入 Tag 名称:')
        if (tagName) {
          await gitGraphStore.createTag(tagName, hash)
          await refresh()
        }
        break
      case 'createBranch':
        const branchName = prompt('输入分支名称:')
        if (branchName) {
          await window.electronAPI.git.createBranch(repoPath, branchName)
          await refresh()
        }
        break
      case 'resetSoft':
        if (confirm('确定要执行 reset --soft?')) {
          await gitGraphStore.reset(hash, 'soft')
          await refresh()
        }
        break
      case 'resetMixed':
        if (confirm('确定要执行 reset --mixed?')) {
          await gitGraphStore.reset(hash, 'mixed')
          await refresh()
        }
        break
      case 'resetHard':
        if (confirm('警告: reset --hard 会丢失所有未提交的更改! 确定继续?')) {
          await gitGraphStore.reset(hash, 'hard')
          await refresh()
        }
        break
      case 'copyHash':
        await navigator.clipboard.writeText(hash)
        break
      case 'copyMessage':
        const commit = gitGraphStore.getCommitByHash(hash)
        if (commit) {
          await navigator.clipboard.writeText(commit.message)
        }
        break
      case 'viewDiff':
        // 跳转到 diff 视图
        gitGraphStore.selectCommit(hash)
        break
    }
  } catch (error) {
    console.error(`Action ${action} failed:`, error)
  }
}

// 监听容器大小变化
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  loadData()

  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight

    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(scrollContainer.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})

// 监听项目路径变化
watch(() => fileExplorerStore.rootPath, (newPath) => {
  if (newPath) {
    gitGraphStore.loadGraph(newPath)
  }
})
</script>

<template>
  <div class="git-graph-view">
    <!-- 工具栏 -->
    <GraphToolbar @refresh="refresh" />

    <!-- 主内容区 -->
    <div class="graph-main">
      <!-- 左侧图形区域 -->
      <div class="graph-content">
        <!-- 加载中 -->
        <div v-if="gitGraphStore.isLoading && gitGraphStore.commits.length === 0" class="loading-state">
          <mdui-circular-progress></mdui-circular-progress>
          <span>加载中...</span>
        </div>

        <!-- 错误 -->
        <div v-else-if="gitGraphStore.error" class="error-state">
          <mdui-icon-error class="error-icon"></mdui-icon-error>
          <span>{{ gitGraphStore.error }}</span>
          <mdui-button variant="text" @click="loadData">重试</mdui-button>
        </div>

        <!-- 图形和列表 -->
        <div v-else class="graph-scroll-container" ref="scrollContainer" @scroll="handleScroll">
          <div class="graph-scroll-content" :style="{ height: totalHeight + 'px' }">
            <!-- SVG 图形层 -->
            <GraphCanvas
              :commits="visibleCommits"
              :connections="gitGraphStore.visibleConnections"
              :max-lanes="gitGraphStore.maxLanes"
              :row-height="rowHeight"
              :visible-start="visibleStart"
              :selected-hash="gitGraphStore.viewState.selectedCommit"
            />

            <!-- Commit 行 -->
            <div
              class="commit-rows"
              :style="{ transform: `translateY(${Math.max(0, visibleStart - bufferRows) * rowHeight}px)` }"
            >
              <GraphCommitRow
                v-for="commit in visibleCommits"
                :key="commit.hash"
                :commit="commit"
                :is-selected="commit.hash === gitGraphStore.viewState.selectedCommit"
                :is-head="commit.isHead"
                :lane-count="gitGraphStore.maxLanes"
                :row-height="rowHeight"
                @select="handleSelectCommit(commit.hash)"
                @contextmenu.prevent="handleContextMenu(commit, $event)"
              />
            </div>
          </div>

          <!-- 加载更多指示器 -->
          <div v-if="gitGraphStore.isLoading && gitGraphStore.commits.length > 0" class="loading-more">
            <mdui-circular-progress></mdui-circular-progress>
          </div>
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <CommitDetailsPanel
        v-if="gitGraphStore.selectedCommitDetails"
        :commit="gitGraphStore.selectedCommitDetails"
        @close="gitGraphStore.clearSelection()"
      />
    </div>

    <!-- 上下文菜单 -->
    <CommitContextMenu
      v-if="contextMenuCommit"
      :commit="contextMenuCommit"
      :visible="contextMenuVisible"
      :position="contextMenuPosition"
      @close="closeContextMenu"
      @action="handleContextMenuAction"
    />
  </div>
</template>

<style scoped>
.git-graph-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--mdui-color-surface);
}

.graph-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.graph-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: var(--mdui-color-on-surface-variant);
}

.error-icon {
  font-size: 48px;
  color: var(--mdui-color-error);
}

.graph-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.graph-scroll-content {
  position: relative;
  width: 100%;
}

.commit-rows {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}

.loading-more {
  display: flex;
  justify-content: center;
  padding: 16px;
}
</style>
