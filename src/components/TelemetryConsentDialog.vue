<script setup lang="ts">
/**
 * 遥测同意对话框
 * 首次启动时显示，询问用户是否同意发送错误报告
 */

import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

// 导入图标
import '@mdui/icons/privacy-tip.js'
import '@mdui/icons/bug-report.js'

const settingsStore = useSettingsStore()

const showDialog = computed(() => settingsStore.shouldShowTelemetryConsent)

const handleAccept = () => {
  settingsStore.acceptTelemetry()
  // 通知主进程初始化 Sentry
  if (window.electronAPI) {
    window.electronAPI.telemetry?.enable()
  }
}

const handleReject = () => {
  settingsStore.rejectTelemetry()
  // 退出应用
  if (window.electronAPI) {
    window.close()
  }
}
</script>

<template>
  <mdui-dialog
    :open="showDialog"
    headline="隐私声明"
    close-on-overlay-click="false"
    close-on-esc="false"
  >
    <div class="consent-content">
      <div class="consent-icon">
        <mdui-icon-privacy-tip></mdui-icon-privacy-tip>
      </div>

      <div class="consent-body">
        <p class="consent-intro">
          欢迎使用 <strong>Logos</strong>！为了提供更好的用户体验，我们希望收集匿名错误报告。
        </p>

        <div class="consent-details">
          <h4>我们收集的信息：</h4>
          <ul>
            <li><mdui-icon-bug-report></mdui-icon-bug-report> 应用崩溃和错误信息</li>
            <li>系统平台信息（如 macOS、Windows）</li>
            <li>应用版本号</li>
          </ul>

          <h4>我们不会收集：</h4>
          <ul class="not-collect">
            <li>您的代码内容</li>
            <li>文件路径或项目名称</li>
            <li>任何个人身份信息</li>
          </ul>
        </div>

        <p class="consent-note">
          您可以随时在设置页面中更改此选项。
        </p>
      </div>
    </div>

    <mdui-button
      slot="action"
      variant="text"
      @click="handleReject"
    >
      不同意并退出
    </mdui-button>
    <mdui-button
      slot="action"
      variant="filled"
      @click="handleAccept"
    >
      同意并开始使用
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped>
.consent-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.consent-icon {
  font-size: 48px;
  color: var(--mdui-color-primary);
}

.consent-icon mdui-icon-privacy-tip {
  font-size: 48px;
}

.consent-body {
  width: 100%;
}

.consent-intro {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 16px;
  text-align: center;
}

.consent-details {
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.consent-details h4 {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: var(--mdui-color-on-surface);
}

.consent-details ul {
  margin: 0 0 16px 0;
  padding-left: 8px;
  list-style: none;
}

.consent-details ul:last-child {
  margin-bottom: 0;
}

.consent-details li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  padding: 4px 0;
}

.consent-details li mdui-icon-bug-report {
  font-size: 16px;
  color: var(--mdui-color-primary);
}

.consent-details .not-collect li::before {
  content: "✗";
  color: var(--mdui-color-error);
  font-weight: bold;
  margin-right: 8px;
}

.consent-note {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  text-align: center;
  margin: 0;
}

/* 确保对话框按钮文字可读性 */
mdui-button[variant="filled"] {
  --mdui-color-on-primary: #fff;
}

mdui-button[variant="text"] {
  color: var(--mdui-color-on-surface-variant);
}
</style>