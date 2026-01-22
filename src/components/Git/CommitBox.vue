<script setup lang="ts">
/**
 * 提交信息输入框组件
 */

import { computed, ref, watch } from 'vue'
import { useGitStore } from '@/stores/git'

// 导入 MDUI 图标
import '@mdui/icons/check.js'
import '@mdui/icons/lightbulb.js'

const props = defineProps<{
  /** 提交信息 */
  message: string
  /** 是否可以提交 */
  canCommit: boolean
  /** 是否正在加载 */
  loading?: boolean
}>()

const emit = defineEmits<{
  /** 更新提交信息 */
  'update:message': [value: string]
  /** 提交 */
  commit: []
  /** 暂存所有文件 */
  stageAll: []
}>()

const gitStore = useGitStore()
const showSuggestions = ref(false)
const suggestions = ref<string[]>([])

const messageValue = computed({
  get: () => props.message,
  set: (value: string) => emit('update:message', value)
})

// 生成提交信息建议
const generateSuggestions = () => {
  const suggestionsList: string[] = []
  const stagedFiles = gitStore.stagedFiles

  if (stagedFiles.length === 0) {
    return []
  }

  // 分析文件类型和变更
  const hasNewFiles = stagedFiles.some(f => f.status === 'added')
  const hasModifiedFiles = stagedFiles.some(f => f.status === 'modified')
  const hasDeletedFiles = stagedFiles.some(f => f.status === 'deleted')
  const hasTestFiles = stagedFiles.some(f => f.path.includes('test') || f.path.includes('spec'))
  const hasConfigFiles = stagedFiles.some(f => 
    f.path.includes('config') || 
    f.path.endsWith('.json') || 
    f.path.endsWith('.yaml') || 
    f.path.endsWith('.yml')
  )

  // 生成建议
  if (hasNewFiles && !hasModifiedFiles && !hasDeletedFiles) {
    suggestionsList.push('feat: 添加新功能')
  } else if (hasModifiedFiles && !hasNewFiles && !hasDeletedFiles) {
    suggestionsList.push('fix: 修复问题')
    suggestionsList.push('refactor: 重构代码')
  } else if (hasDeletedFiles) {
    suggestionsList.push('chore: 删除文件')
  }

  if (hasTestFiles) {
    suggestionsList.push('test: 添加或更新测试')
  }

  if (hasConfigFiles) {
    suggestionsList.push('chore: 更新配置')
  }

  // 通用建议
  if (suggestionsList.length === 0) {
    suggestionsList.push('chore: 更新代码')
  }

  return suggestionsList.slice(0, 3) // 最多3个建议
}

// 监听暂存文件变化，更新建议
watch(() => gitStore.stagedFiles, () => {
  suggestions.value = generateSuggestions()
}, { deep: true })

// 初始化建议
suggestions.value = generateSuggestions()

const handleSuggestionClick = (suggestion: string) => {
  messageValue.value = suggestion
  showSuggestions.value = false
}

// 计算按钮文本和操作
const buttonText = computed(() => {
  if (props.loading) {
    return gitStore.unstagedFiles.length > 0 ? '暂存中...' : '提交中...'
  }
  // 如果有未暂存文件，显示"添加到暂存区"
  if (gitStore.unstagedFiles.length > 0) {
    return '添加到暂存区'
  }
  // 如果有已暂存文件，显示"提交"
  if (gitStore.stagedFiles.length > 0) {
    return '提交'
  }
  return '提交'
})

const buttonDisabled = computed(() => {
  if (props.loading) return true
  // 如果有未暂存文件，按钮可用（用于暂存）
  if (gitStore.unstagedFiles.length > 0) return false
  // 如果有已暂存文件，需要提交信息才能提交
  if (gitStore.stagedFiles.length > 0) {
    return !props.message.trim()
  }
  return true
})

const handleButtonClick = () => {
  if (props.loading) return
  
  // 如果有未暂存文件，执行暂存操作
  if (gitStore.unstagedFiles.length > 0) {
    emit('stageAll')
  } else if (props.canCommit) {
    // 如果有已暂存文件且有提交信息，执行提交
    emit('commit')
  }
}

const handleCommit = () => {
  if (props.canCommit && !props.loading) {
    emit('commit')
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl/Cmd + Enter 提交
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    handleCommit()
  }
}

const handleBlur = () => {
  // 延迟隐藏建议，允许点击建议项
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}
</script>

<template>
  <div class="commit-box">
    <!-- 提交信息输入 -->
    <div class="input-wrapper">
      <textarea
        v-model="messageValue"
        class="commit-input"
        placeholder="提交信息 (Ctrl+Enter 提交)"
        @keydown="handleKeydown"
        @focus="showSuggestions = true"
        @blur="handleBlur"
        :disabled="loading"
      ></textarea>
      
      <!-- 建议提示 -->
      <div v-if="showSuggestions && suggestions.length > 0 && !messageValue" class="suggestions">
        <div class="suggestions-header">
          <mdui-icon-lightbulb></mdui-icon-lightbulb>
          <span>建议</span>
        </div>
        <div
          v-for="(suggestion, index) in suggestions"
          :key="index"
          class="suggestion-item"
          @click="handleSuggestionClick(suggestion)"
        >
          {{ suggestion }}
        </div>
      </div>
    </div>

    <!-- 提交/暂存按钮 -->
    <mdui-button
      class="commit-button"
      :disabled="buttonDisabled"
      @click="handleButtonClick"
    >
      <mdui-icon-check slot="icon"></mdui-icon-check>
      {{ buttonText }}
    </mdui-button>
  </div>
</template>

<style scoped>
.commit-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.commit-input {
  width: 100%;
  min-height: 80px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--mdui-color-on-surface);
  background: var(--mdui-color-surface-container);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--mdui-color-surface-container);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.suggestions-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--mdui-color-on-surface-variant);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  background: var(--mdui-color-surface-container-high);
}

.suggestions-header mdui-icon-lightbulb {
  font-size: 16px;
}

.suggestion-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--mdui-color-on-surface);
  cursor: pointer;
  transition: background-color 0.1s;
}

.suggestion-item:hover {
  background: var(--mdui-color-surface-container-high);
}

.suggestion-item:not(:last-child) {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.commit-input:focus {
  border-color: var(--mdui-color-primary);
}

.commit-input::placeholder {
  color: var(--mdui-color-on-surface-variant);
}

.commit-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.commit-button {
  width: 100%;
}
</style>
