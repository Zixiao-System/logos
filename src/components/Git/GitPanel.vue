<script setup lang="ts">
/**
 * Git 面板主组件
 */

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useGitStore } from '@/stores/git'
import { useFileExplorerStore } from '@/stores/fileExplorer'
import { useEditorStore } from '@/stores/editor'
import { useDiffStore } from '@/stores/diff'
import { useRouter } from 'vue-router'
import { useMergeStore } from '@/stores/merge'
import BranchSelector from './BranchSelector.vue'
import ChangedFileList from './ChangedFileList.vue'
import CommitBox from './CommitBox.vue'
import GitAdvancedPanel from './GitAdvancedPanel.vue'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/source.js'
import '@mdui/icons/download.js'
import '@mdui/icons/upload.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/error.js'
import '@mdui/icons/keyboard-arrow-down.js'

const gitStore = useGitStore()
const fileExplorerStore = useFileExplorerStore()
const editorStore = useEditorStore()
const diffStore = useDiffStore()
const router = useRouter()
const mergeStore = useMergeStore()

// 监听冲突检测事件
const handleConflictDetected = async () => {
  // 检查合并状态并导航到冲突处理界面
  if (repoPath()) {
    await mergeStore.checkMergeStatus(repoPath())
    if (mergeStore.isInMerge) {
      router.push('/merge')
    }
  }
}

// 展开状态
const stagedExpanded = ref(true)
const unstagedExpanded = ref(true)

// 显示确认对话框
const showDiscardDialog = ref(false)
const discardFilePath = ref('')

const showDeleteBranchDialog = ref(false)
const deleteBranchName = ref('')

const showPushDialog = ref(false)
const showPullDialog = ref(false)

// 当前仓库路径
const repoPath = () => fileExplorerStore.rootPath || ''

// 初始化
onMounted(async () => {
  if (fileExplorerStore.rootPath) {
    await gitStore.init(fileExplorerStore.rootPath)
  }
})

// 监听打开的文件夹变化
watch(() => fileExplorerStore.rootPath, async (newPath) => {
  if (newPath) {
    await gitStore.init(newPath)
  } else {
    gitStore.reset()
  }
})

// 定时刷新 (每30秒)
let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshInterval = setInterval(() => {
    if (gitStore.isRepo && repoPath()) {
      gitStore.refresh(repoPath())
    }
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// 刷新
const handleRefresh = () => {
  if (repoPath()) {
    gitStore.refresh(repoPath())
  }
}

// 暂存文件
const handleStage = (path: string) => {
  gitStore.stageFile(repoPath(), path)
}

// 取消暂存文件
const handleUnstage = (path: string) => {
  gitStore.unstageFile(repoPath(), path)
}

// 暂存全部
const handleStageAll = () => {
  gitStore.stageAll(repoPath())
}

// 取消暂存全部
const handleUnstageAll = () => {
  gitStore.unstageAll(repoPath())
}

// 放弃更改 (显示确认对话框)
const handleDiscard = (path: string) => {
  discardFilePath.value = path
  showDiscardDialog.value = true
}

// 确认放弃更改
const confirmDiscard = async () => {
  await gitStore.discardFile(repoPath(), discardFilePath.value)
  showDiscardDialog.value = false
}

// 查看差异
const handleDiff = async (path: string, staged: boolean) => {
  await diffStore.openDiff(repoPath(), path, staged)
  router.push('/diff')
}

// 打开文件
const handleOpen = async (path: string) => {
  const fullPath = `${repoPath()}/${path}`
  await editorStore.openFile(fullPath)
}

// 提交
const handleCommit = () => {
  gitStore.commit(repoPath())
}

// 暂存所有文件（从CommitBox触发）
const handleStageAllFromCommitBox = () => {
  gitStore.stageAll(repoPath())
}

// 切换分支
const handleCheckout = (branchName: string) => {
  gitStore.checkout(repoPath(), branchName)
}

// 创建分支
const handleCreateBranch = (branchName: string) => {
  gitStore.createBranch(repoPath(), branchName)
}

// 删除分支
const handleDeleteBranch = (branchName: string) => {
  deleteBranchName.value = branchName
  showDeleteBranchDialog.value = true
}

// 确认删除分支
const confirmDeleteBranch = async () => {
  await gitStore.deleteBranch(repoPath(), deleteBranchName.value)
  showDeleteBranchDialog.value = false
  deleteBranchName.value = ''
}

// 推送
const handlePush = () => {
  showPushDialog.value = true
}

// 确认推送
const confirmPush = async () => {
  await gitStore.push(repoPath())
  showPushDialog.value = false
}

// 拉取
const handlePull = () => {
  showPullDialog.value = true
}

// 确认拉取
const confirmPull = async () => {
  await gitStore.pull(repoPath())
  showPullDialog.value = false
}

// 更新提交信息
const handleUpdateMessage = (message: string) => {
  gitStore.setCommitMessage(message)
}

// 监听冲突检测事件
onMounted(() => {
  window.addEventListener('git:conflict-detected', handleConflictDetected)
})

onUnmounted(() => {
  window.removeEventListener('git:conflict-detected', handleConflictDetected)
})

// 键盘快捷键支持
const handleKeyDown = (event: KeyboardEvent) => {
  // 只在 Git 面板可见时响应
  if (!gitStore.isRepo) return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifierKey = isMac ? event.metaKey : event.ctrlKey

  // Cmd/Ctrl + Enter: 提交
  if (modifierKey && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (gitStore.canCommit) {
      handleCommit()
    }
  }

  // Cmd/Ctrl + K: 暂存当前文件（如果有焦点文件）
  if (modifierKey && event.key.toLowerCase() === 'k' && !event.shiftKey) {
    // 这个需要配合文件选择器实现
  }

  // Cmd/Ctrl + Shift + K: 取消暂存
  if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'k') {
    // 这个需要配合文件选择器实现
  }

  // Space: 切换文件暂存状态（需要配合文件列表实现）
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="git-panel">
    <!-- 头部工具栏 -->
    <div class="panel-header">
      <span class="title">源代码管理</span>
      <div class="actions">
        <mdui-button-icon @click="handleRefresh" title="刷新" :disabled="gitStore.loading">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <!-- 未打开文件夹 -->
    <div v-if="!fileExplorerStore.hasOpenFolder" class="no-folder">
      <p>打开文件夹以使用源代码管理功能</p>
    </div>

    <!-- 非 Git 仓库 -->
    <div v-else-if="!gitStore.isRepo" class="not-repo">
      <mdui-icon-source></mdui-icon-source>
      <p>当前文件夹不是 Git 仓库</p>
      <mdui-button variant="tonal" disabled>
        初始化仓库
      </mdui-button>
    </div>

    <!-- Git 内容 -->
    <template v-else>
      <!-- 分支选择器 -->
      <div class="branch-section">
        <BranchSelector
          :current-branch="gitStore.currentBranch"
          :branches="gitStore.branches"
          :loading="gitStore.loading"
          @checkout="handleCheckout"
          @create-branch="handleCreateBranch"
          @delete-branch="handleDeleteBranch"
          @refresh="handleRefresh"
        />
        <div class="sync-actions">
          <mdui-button-icon @click="handlePull" title="拉取" :disabled="gitStore.loading">
            <mdui-icon-download></mdui-icon-download>
          </mdui-button-icon>
          <mdui-button-icon @click="handlePush" title="推送" :disabled="gitStore.loading">
            <mdui-icon-upload></mdui-icon-upload>
          </mdui-button-icon>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="gitStore.loading" class="loading">
        <mdui-circular-progress></mdui-circular-progress>
      </div>

      <!-- 提交区域 -->
      <CommitBox
        :message="gitStore.commitMessage"
        :can-commit="gitStore.canCommit"
        :loading="gitStore.loading"
        @update:message="handleUpdateMessage"
        @commit="handleCommit"
        @stage-all="handleStageAllFromCommitBox"
      />

      <!-- 变更列表 -->
      <div class="changes-section">
        <!-- 已暂存 -->
        <ChangedFileList
          title="已暂存的更改"
          :files="gitStore.stagedFiles"
          :can-unstage="true"
          :expanded="stagedExpanded"
          @unstage="handleUnstage"
          @unstage-all="handleUnstageAll"
          @diff="handleDiff"
          @open="handleOpen"
          @toggle="stagedExpanded = !stagedExpanded"
        />

        <!-- 未暂存 -->
        <ChangedFileList
          title="更改"
          :files="gitStore.unstagedFiles"
          :can-stage="true"
          :expanded="unstagedExpanded"
          @stage="handleStage"
          @stage-all="handleStageAll"
          @discard="handleDiscard"
          @diff="handleDiff"
          @open="handleOpen"
          @toggle="unstagedExpanded = !unstagedExpanded"
        />

        <!-- 无变更 -->
        <div v-if="!gitStore.hasChanges" class="no-changes">
          <mdui-icon-check-circle></mdui-icon-check-circle>
          <p>没有要提交的更改</p>
        </div>

        <!-- 高级 Git 操作面板 -->
        <GitAdvancedPanel />
      </div>

      <!-- 错误信息 -->
      <div v-if="gitStore.error" class="error-message">
        <mdui-icon-error></mdui-icon-error>
        <span>{{ gitStore.error }}</span>
      </div>
    </template>

    <!-- 放弃更改确认对话框 -->
    <mdui-dialog
      :open="showDiscardDialog"
      @closed="showDiscardDialog = false"
    >
      <span slot="headline">放弃更改</span>
      <span slot="description">
        确定要放弃对 "{{ discardFilePath.split('/').pop() }}" 的更改吗？此操作无法撤销。
      </span>
      <mdui-button slot="action" variant="text" @click="showDiscardDialog = false">
        取消
      </mdui-button>
      <mdui-button slot="action" @click="confirmDiscard">
        放弃更改
      </mdui-button>
    </mdui-dialog>

    <!-- 删除分支确认对话框 -->
    <mdui-dialog
      :open="showDeleteBranchDialog"
      @closed="showDeleteBranchDialog = false"
    >
      <span slot="headline">删除分支</span>
      <span slot="description">
        确定要删除分支 "{{ deleteBranchName }}" 吗？此操作无法撤销。
      </span>
      <mdui-button slot="action" variant="text" @click="showDeleteBranchDialog = false">
        取消
      </mdui-button>
      <mdui-button slot="action" variant="filled" @click="confirmDeleteBranch">
        删除
      </mdui-button>
    </mdui-dialog>

    <!-- 推送确认对话框 -->
    <mdui-dialog
      :open="showPushDialog"
      @closed="showPushDialog = false"
    >
      <span slot="headline">推送更改</span>
      <span slot="description">
        确定要将本地提交推送到远程仓库吗？
      </span>
      <mdui-button slot="action" variant="text" @click="showPushDialog = false">
        取消
      </mdui-button>
      <mdui-button slot="action" variant="filled" @click="confirmPush">
        推送
      </mdui-button>
    </mdui-dialog>

    <!-- 拉取确认对话框 -->
    <mdui-dialog
      :open="showPullDialog"
      @closed="showPullDialog = false"
    >
      <span slot="headline">拉取更改</span>
      <span slot="description">
        确定要从远程仓库拉取最新更改吗？如果有未提交的更改，可能会产生冲突。
      </span>
      <mdui-button slot="action" variant="text" @click="showPullDialog = false">
        取消
      </mdui-button>
      <mdui-button slot="action" variant="filled" @click="confirmPull">
        拉取
      </mdui-button>
    </mdui-dialog>
  </div>
</template>

<style scoped>
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.panel-header .title {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  color: var(--mdui-color-on-surface-variant);
}

.panel-header .actions {
  display: flex;
  gap: 2px;
}

.panel-header mdui-button-icon {
  --mdui-comp-button-icon-size: 28px;
}

.branch-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.branch-section > :first-child {
  flex: 1;
}

.sync-actions {
  display: flex;
  gap: 2px;
}

.sync-actions mdui-button-icon {
  --mdui-comp-button-icon-size: 32px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.changes-section {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.no-folder,
.not-repo,
.no-changes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  color: var(--mdui-color-on-surface-variant);
}

.no-folder p,
.not-repo p,
.no-changes p {
  margin: 0;
  font-size: 14px;
}

.not-repo mdui-icon-source,
.no-changes mdui-icon-check-circle {
  font-size: 48px;
  opacity: 0.5;
}

.no-changes {
  padding: 24px;
}

.no-changes mdui-icon-check-circle {
  font-size: 32px;
  color: var(--mdui-color-primary);
  opacity: 1;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin: 8px;
  background: var(--mdui-color-error-container);
  color: var(--mdui-color-on-error-container);
  border-radius: 8px;
  font-size: 13px;
}

.error-message mdui-icon-error {
  font-size: 18px;
}
</style>
