<script setup lang="ts">
/**
 * LSP 设置对话框
 * 在遥测同意后显示，帮助用户配置代码智能功能
 */

import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useIntelligenceStore } from '@/stores/intelligence'

// 导入图标
import '@mdui/icons/code.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/memory.js'

const settingsStore = useSettingsStore()
const intelligenceStore = useIntelligenceStore()

const showDialog = computed(() => settingsStore.shouldShowLSPSetup)
const handleConfirm = async () => {
  // 保存设置
  settingsStore.setLSPMode('smart')
  // 立即应用模式（同步到 intelligence store）
  await intelligenceStore.setMode('smart')
  settingsStore.dismissLSPSetup()
}

const handleSkip = () => {
  settingsStore.dismissLSPSetup()
}
</script>

<template>
  <mdui-dialog
    :open="showDialog"
    headline="代码智能设置"
    close-on-overlay-click="false"
    close-on-esc="false"
  >
    <div class="setup-content">
      <div class="setup-icon">
        <mdui-icon-code></mdui-icon-code>
      </div>

      <div class="setup-body">
        <p class="setup-intro">
          已默认启用 Smart 模式以获得更完整的开发体验。
        </p>

        <div class="mode-options">
          <div class="mode-card selected">
            <div class="mode-header">
              <mdui-icon-memory></mdui-icon-memory>
              <span class="mode-title">Smart 模式</span>
              <mdui-icon-check-circle class="check-icon"></mdui-icon-check-circle>
            </div>
            <p class="mode-desc">全量索引 + LSP 协作，获得更完整的智能体验</p>
            <ul class="mode-features">
              <li>安全重构</li>
              <li>调用层级</li>
              <li>影响分析</li>
              <li>跨项目搜索</li>
              <li>LSP 诊断补充</li>
            </ul>
            <p class="mode-note">首次启动需要更多内存与索引时间</p>
          </div>
        </div>

        <div class="lsp-servers">
          <h4>常用 LSP 服务器安装</h4>
          <div class="server-list">
            <code>npm i -g typescript-language-server typescript</code>
            <code>pip install pyright</code>
            <code>go install golang.org/x/tools/gopls@latest</code>
          </div>
        </div>

        <p class="setup-note">
          您可以随时在设置页面中更改此选项。
        </p>
      </div>
    </div>

    <mdui-button
      slot="action"
      variant="text"
      @click="handleSkip"
    >
      稍后设置
    </mdui-button>
    <mdui-button
      slot="action"
      variant="filled"
      @click="handleConfirm"
    >
      确认
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped>
/* 增强对话框背景，提高可读性 */
:deep(mdui-dialog) {
  --mdui-color-surface: var(--mdui-color-surface-container-high);
}

:deep(.mdui-dialog) {
  background-color: var(--mdui-color-surface-container-high) !important;
}

.setup-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  background-color: var(--mdui-color-surface-container);
  border-radius: 8px;
}

.setup-icon {
  font-size: 48px;
  color: var(--mdui-color-primary);
}

.setup-icon mdui-icon-code {
  font-size: 48px;
}

.setup-body {
  width: 100%;
  padding: 0 8px;
}

.setup-intro {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 16px;
  text-align: center;
  color: var(--mdui-color-on-surface);
}

.mode-options {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.mode-card {
  flex: 1;
  background: var(--mdui-color-surface-container-low);
  border: 2px solid var(--mdui-color-outline-variant);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-card:hover {
  border-color: var(--mdui-color-outline);
  background: var(--mdui-color-surface-container);
}

.mode-card.selected {
  border-color: var(--mdui-color-primary);
  background: var(--mdui-color-surface-container-highest);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mode-header mdui-icon-speed,
.mode-header mdui-icon-memory {
  font-size: 20px;
  color: var(--mdui-color-primary);
}

.mode-title {
  font-weight: 600;
  font-size: 1rem;
  flex: 1;
  color: var(--mdui-color-on-surface);
}

.check-icon {
  color: var(--mdui-color-primary);
  font-size: 20px;
}

.mode-desc {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.mode-features {
  margin: 0 0 12px 0;
  padding-left: 16px;
  font-size: 0.8rem;
  color: var(--mdui-color-on-surface);
}

.mode-features li {
  padding: 2px 0;
}

.mode-note {
  font-size: 0.75rem;
  color: var(--mdui-color-on-surface-variant);
  margin: 0;
  font-style: italic;
  opacity: 0.8;
}

.lsp-servers {
  background: var(--mdui-color-surface-container-low);
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.lsp-servers h4 {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: var(--mdui-color-on-surface);
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-list code {
  font-size: 0.75rem;
  background: var(--mdui-color-surface);
  padding: 6px 10px;
  border-radius: 4px;
  font-family: 'Fira Code', 'SF Mono', Monaco, monospace;
  color: var(--mdui-color-on-surface);
  border: 1px solid var(--mdui-color-outline-variant);
}

.setup-note {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

/* 确保对话框按钮文字可读性 */
mdui-button[variant="filled"] {
  --mdui-color-on-primary: #fff;
}

mdui-button[variant="text"] {
  color: var(--mdui-color-on-surface-variant);
}
</style>
