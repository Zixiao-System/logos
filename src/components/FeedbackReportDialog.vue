<script setup lang="ts">
/**
 * 反馈上报对话框
 * 按下快捷键时显示，用于主动上报问题
 */

import { ref, computed } from 'vue'
import { useFileExplorerStore } from '@/stores/fileExplorer'

// 导入图标
import '@mdui/icons/feedback.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/open-in-new.js'

const fileExplorerStore = useFileExplorerStore()

// 对话框状态
const showDialog = ref(false)
const isSubmitting = ref(false)
const isSubmitted = ref(false)
const githubIssueUrl = ref<string | null>(null)

// 打开对话框
const open = async () => {
  showDialog.value = true
  isSubmitting.value = true
  isSubmitted.value = false
  githubIssueUrl.value = null

  try {
    if (window.electronAPI?.feedback) {
      // 并行收集状态和堆快照
      const [state, heapSnapshot] = await Promise.all([
        window.electronAPI.feedback.collectState(),
        window.electronAPI.feedback.captureHeapSnapshot()
      ])

      // 提交到 Sentry
      await window.electronAPI.feedback.submitToSentry({
        message: 'User initiated feedback report',
        state,
        heapSnapshot
      })

      // 获取 GitHub Issue URL
      const rootPath = fileExplorerStore.rootPath
      if (rootPath) {
        githubIssueUrl.value = await window.electronAPI.feedback.getGitHubIssueUrl(rootPath)
      }

      isSubmitted.value = true
    }
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    isSubmitted.value = true
  } finally {
    isSubmitting.value = false
  }
}

// 关闭对话框
const closeDialog = () => {
  showDialog.value = false
}

// 打开 GitHub Issue 页面
const openGitHubIssue = async () => {
  if (githubIssueUrl.value && window.electronAPI) {
    // 构建 Issue 预填充参数
    const params = new URLSearchParams({
      title: '[Bug Report] ',
      body: `## 问题描述

请描述您遇到的问题...

## 复现步骤

1.
2.
3.

## 预期行为

...

## 实际行为

...

## 环境信息

- 已通过应用内反馈上报
- 时间: ${new Date().toISOString()}
`
    })
    const url = `${githubIssueUrl.value}?${params.toString()}`
    await window.electronAPI.openExternal(url)
  }
  closeDialog()
}

// 显示状态
const dialogHeadline = computed(() => {
  if (isSubmitting.value) return '正在收集信息...'
  return '感谢您的反馈'
})

// 暴露方法给父组件
defineExpose({
  open
})
</script>

<template>
  <mdui-dialog
    :open="showDialog"
    :headline="dialogHeadline"
    @closed="closeDialog"
  >
    <div class="feedback-content">
      <!-- 加载状态 -->
      <div v-if="isSubmitting" class="loading-state">
        <mdui-circular-progress></mdui-circular-progress>
        <p>正在收集系统状态和堆快照信息...</p>
      </div>

      <!-- 完成状态 -->
      <div v-else class="completed-state">
        <div class="success-icon">
          <mdui-icon-check-circle></mdui-icon-check-circle>
        </div>

        <p class="thank-you-text">
          感谢您帮助我们改进 Logos！
        </p>

        <p class="question-text">
          遇到问题了吗？
        </p>

        <p class="hint-text">
          您可以创建 GitHub Issue 来详细描述问题，这将帮助我们更快地解决它。
        </p>
      </div>
    </div>

    <mdui-button
      v-if="!isSubmitting"
      slot="action"
      variant="text"
      @click="closeDialog"
    >
      不了，谢谢
    </mdui-button>
    <mdui-button
      v-if="!isSubmitting && githubIssueUrl"
      slot="action"
      variant="filled"
      @click="openGitHubIssue"
    >
      <mdui-icon-open-in-new slot="icon"></mdui-icon-open-in-new>
      创建 GitHub Issue
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped>
.feedback-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  min-height: 150px;
  justify-content: center;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-state p {
  color: var(--mdui-color-on-surface-variant);
  font-size: 0.875rem;
  margin: 0;
}

.completed-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.success-icon {
  color: var(--mdui-color-primary);
  font-size: 48px;
}

.success-icon mdui-icon-check-circle {
  font-size: 48px;
}

.thank-you-text {
  font-size: 1rem;
  color: var(--mdui-color-on-surface);
  margin: 0;
  font-weight: 500;
}

.question-text {
  font-size: 1.125rem;
  color: var(--mdui-color-on-surface);
  margin: 0;
  font-weight: 500;
}

.hint-text {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  margin: 0;
  max-width: 320px;
  line-height: 1.5;
}
</style>
